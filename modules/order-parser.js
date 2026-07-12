// ============================================================
// 📦 ORDER PARSER - COMPLETE FIXED
// Handles: Multi-line, multi-product, various formats
// ============================================================

/**
 * Extract part numbers and quantities from ANY text format
 * IMPORTANT RULES:
 * 1. FIRST try to match the FULL part number with separators (A15979020-0200)
 * 2. If not found, try to match part number WITHOUT separators (A15979020)
 * 3. The quantity is the number AFTER the part number
 * 4. If part number has separator and number after it, that's PART of the part number
 */

// ============================================================
// 🔧 CLEAN TEXT - Remove quotes, extra spaces
// ============================================================

function cleanText(text) {
    if (!text) return '';
    return text
        .replace(/^["']|["']$/g, '')
        .replace(/["']/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

// ============================================================
// 🔍 EXTRACT PART NUMBER (Supports full part numbers with separators)
// ============================================================

function extractPartNumber(text) {
    if (!text) return null;
    
    // Remove common quantity words first
    let cleaned = text
        .replace(/\b(pcs|nos|pc|no|qty|piece|pieces|units)\b/gi, '')
        .replace(/\s*x\s*/gi, ' ')
        .trim();
    
    // ============================================================
    // STEP 1: Try to match FULL part number with separators
    // ============================================================
    
    // Pattern: Part with hyphen (A15979020-0200)
    let match = cleaned.match(/\b([A-Z0-9]{1,15}[-][A-Z0-9]{1,10})\b/i);
    if (match) {
        return match[1].toUpperCase();
    }
    
    // Pattern: Part with dot (A15979020.0200)
    match = cleaned.match(/\b([A-Z0-9]{1,15}\.[A-Z0-9]{1,10})\b/i);
    if (match) {
        return match[1].toUpperCase();
    }
    
    // Pattern: Part with slash (A15979020/0200)
    match = cleaned.match(/\b([A-Z0-9]{1,15}\/[A-Z0-9]{1,10})\b/i);
    if (match) {
        return match[1].toUpperCase();
    }
    
    // Pattern: Part with space (A15979020 0200)
    match = cleaned.match(/\b([A-Z0-9]{1,15})\s+([A-Z0-9]{1,10})\b/i);
    if (match) {
        const firstPart = match[1].toUpperCase();
        const secondPart = match[2].toUpperCase();
        if (secondPart.length <= 5 || secondPart.startsWith('0')) {
            return firstPart + secondPart;
        }
        return firstPart;
    }
    
    // ============================================================
    // STEP 2: Try to match part number WITHOUT separators
    // ============================================================
    
    // Pattern: Alphanumeric part number (A15979020)
    match = cleaned.match(/\b([A-Z0-9]{3,15})\b/i);
    if (match) {
        const part = match[1].toUpperCase();
        if (/^\d{1,4}$/.test(part)) {
            return null;
        }
        return part;
    }
    
    return null;
}

// ============================================================
// 🔍 EXTRACT QUANTITY (Number AFTER the part number)
// ============================================================

function extractQuantity(text, partNumber) {
    if (!text) return null;
    
    let remaining = text;
    if (partNumber) {
        const escapedPart = partNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        remaining = text.replace(new RegExp(escapedPart, 'i'), '').trim();
    }
    
    remaining = remaining
        .replace(/\b(pcs|nos|pc|no|qty|piece|pieces|units|each)\b/gi, '')
        .trim();
    
    const numbers = remaining.match(/\b(\d{1,6})\b/g);
    if (numbers && numbers.length > 0) {
        const qty = parseInt(numbers[0]);
        if (qty > 0 && qty < 1000000) {
            return qty;
        }
    }
    
    const qtyPatterns = [
        text.match(/\b(\d{1,6})\s*(?:pcs|nos|pc|no|qty|piece|pieces)\b/i),
        text.match(/\b(\d{1,6})\s*[xX]\b/),
        text.match(/\b[pP][cC][sS]?\s*(\d{1,6})\b/),
        text.match(/\b(\d{1,6})\s*$/)
    ];
    
    for (const pattern of qtyPatterns) {
        if (pattern) {
            const qty = parseInt(pattern[1]);
            if (qty > 0 && qty < 1000000) {
                return qty;
            }
        }
    }
    
    return null;
}

// ============================================================
// 🔍 PARSE A SINGLE SEGMENT
// ============================================================

function parseSegment(segment) {
    if (!segment || segment.trim() === '') return null;
    
    const trimmed = segment.trim();
    console.log(`🔍 Parsing segment: "${trimmed}"`);
    
    const partNumber = extractPartNumber(trimmed);
    console.log(`📦 Extracted part number: "${partNumber}"`);
    
    if (!partNumber) return null;
    
    let quantity = extractQuantity(trimmed, partNumber);
    console.log(`📊 Extracted quantity: ${quantity}`);
    
    if (quantity === null || quantity === undefined) {
        const numbers = trimmed.match(/\b(\d{1,6})\b/g);
        if (numbers && numbers.length > 0) {
            const lastNumber = parseInt(numbers[numbers.length - 1]);
            if (lastNumber > 0 && lastNumber < 100000) {
                quantity = lastNumber;
                console.log(`📊 Using last number as quantity: ${quantity}`);
            }
        }
    }
    
    if (quantity === null || quantity === undefined || quantity < 1) {
        quantity = 1;
    }
    
    console.log(`✅ Final: Part="${partNumber}", Qty=${quantity}`);
    return { part: partNumber, qty: quantity };
}

// ============================================================
// 📋 MAIN PARSE ORDER FUNCTION - FIXED FOR MULTI-LINE
// ============================================================

function parseOrder(text) {
    console.log('📝 ===== PARSING ORDER =====');
    console.log('📝 Input:', text);
    
    if (!text || text.trim() === '') {
        return { items: [], unparsed: [] };
    }
    
    // ============================================================
    // STEP 1: Split by new lines FIRST (for multi-line orders)
    // ============================================================
    let segments = [];
    
    // Split by new lines
    const lines = text.split(/\n/);
    if (lines.length > 1) {
        segments = lines.map(s => s.trim()).filter(s => s.length > 0);
        console.log(`📝 Split by new lines: ${segments.length} segments`);
    }
    
    // If no new lines, try other separators
    if (segments.length === 0) {
        segments = text.split(',').map(s => s.trim()).filter(s => s.length > 0);
        console.log(`📝 Split by commas: ${segments.length} segments`);
    }
    
    if (segments.length === 0) {
        segments = text.split(';').map(s => s.trim()).filter(s => s.length > 0);
        console.log(`📝 Split by semicolons: ${segments.length} segments`);
    }
    
    if (segments.length === 0) {
        segments = text.split(/\s+and\s+/i).map(s => s.trim()).filter(s => s.length > 0);
        console.log(`📝 Split by 'and': ${segments.length} segments`);
    }
    
    if (segments.length === 0) {
        segments = text.split('+').map(s => s.trim()).filter(s => s.length > 0);
        console.log(`📝 Split by '+': ${segments.length} segments`);
    }
    
    // If still one segment, try to split by detecting multiple part numbers
    if (segments.length === 1 && segments[0].length > 15) {
        // Look for pattern: "PART123 2 PART456 3"
        const matches = segments[0].match(/\b([A-Z0-9]{5,20})\s*(\d+)\s*/gi);
        if (matches && matches.length > 1) {
            segments = matches.map(s => s.trim());
            console.log(`📝 Split by multiple part patterns: ${segments.length} segments`);
        }
    }
    
    console.log('📝 Segments:', segments);
    
    // ============================================================
    // STEP 2: Parse each segment
    // ============================================================
    const items = [];
    const unparsed = [];
    const seenParts = new Set();
    
    for (const segment of segments) {
        if (!segment || segment.trim() === '') continue;
        
        const parsed = parseSegment(segment);
        if (parsed && parsed.part) {
            if (!seenParts.has(parsed.part)) {
                seenParts.add(parsed.part);
                items.push(parsed);
                console.log(`✅ Added: ${parsed.part} x${parsed.qty}`);
            } else {
                console.log(`⚠️ Duplicate: ${parsed.part} - skipping`);
            }
        } else {
            const partMatch = extractPartNumber(segment);
            if (partMatch && !seenParts.has(partMatch)) {
                seenParts.add(partMatch);
                items.push({ part: partMatch, qty: 1 });
                console.log(`✅ Extracted part only: ${partMatch} x1`);
            } else {
                unparsed.push(segment);
                console.log(`⚠️ Unparsed: "${segment}"`);
            }
        }
    }
    
    console.log(`📦 Total parsed items: ${items.length}`);
    console.log('📦 Items:', JSON.stringify(items, null, 2));
    
    return { items, unparsed };
}

// ============================================================
// 🧪 TEST FUNCTION
// ============================================================

function testParser() {
    const testCases = [
        { input: '0802CAA08871N 2\n0305HBF00031N 3', expected: [{ part: '0802CAA08871N', qty: 2 }, { part: '0305HBF00031N', qty: 3 }] },
        { input: '0801BA0285N\n0303BC0071N', expected: [{ part: '0801BA0285N', qty: 1 }, { part: '0303BC0071N', qty: 1 }] },
        { input: '0801BA0285N 2, 0303BC0071N 3', expected: [{ part: '0801BA0285N', qty: 2 }, { part: '0303BC0071N', qty: 3 }] },
        { input: '0801BA0285N 2\n0303BC0071N', expected: [{ part: '0801BA0285N', qty: 2 }, { part: '0303BC0071N', qty: 1 }] },
    ];
    
    console.log('🧪 Testing Order Parser...\n');
    let passed = 0;
    let failed = 0;
    
    for (const test of testCases) {
        const result = parseOrder(test.input);
        const success = JSON.stringify(result.items) === JSON.stringify(test.expected);
        
        if (success) {
            passed++;
            console.log(`✅ PASS: "${test.input}"`);
        } else {
            failed++;
            console.log(`❌ FAIL: "${test.input}"`);
            console.log(`   Expected: ${JSON.stringify(test.expected)}`);
            console.log(`   Got: ${JSON.stringify(result.items)}`);
        }
    }
    
    console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
    return { passed, failed };
}

module.exports = {
    parseOrder,
    extractPartNumber,
    extractQuantity,
    parseSegment,
    cleanText,
    testParser
};
