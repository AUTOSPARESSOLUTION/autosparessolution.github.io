// ============================================================
// 📦 ORDER PARSER - COMPLETE FIXED
// Handles: "A15979020-0200 200" → Part: A15979020-0200, Qty: 200
// Handles: "84777 200" → Part: 84777, Qty: 200
// ============================================================

/**
 * Extract part numbers and quantities from ANY text format
 * 
 * IMPORTANT RULES:
 * 1. FIRST try to match the FULL part number with separators (A15979020-0200)
 * 2. If not found, try to match part number WITHOUT separators (A15979020)
 * 3. The quantity is the number AFTER the part number
 * 4. If part number has separator and number after it, that's PART of the part number
 */

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
    // Pattern: A15979020-0200 (alphanumeric-hyphen-alphanumeric)
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
    
    // Pattern: Part with space (A15979020 0200) - customer might type space
    match = cleaned.match(/\b([A-Z0-9]{1,15})\s+([A-Z0-9]{1,10})\b/i);
    if (match) {
        // Check if second part is a valid part number suffix (not just a quantity)
        const firstPart = match[1].toUpperCase();
        const secondPart = match[2].toUpperCase();
        // If second part looks like a suffix (starts with 0 or is short)
        if (secondPart.length <= 5 || secondPart.startsWith('0')) {
            return firstPart + secondPart;
        }
        return firstPart;
    }
    
    // ============================================================
    // STEP 2: Try to match part number WITHOUT separators
    // Pattern: A15979020 (alphanumeric only)
    // ============================================================
    
    // Pattern: Alphanumeric part number (A15979020)
    match = cleaned.match(/\b([A-Z0-9]{3,15})\b/i);
    if (match) {
        const part = match[1].toUpperCase();
        // If it's all numbers and length is 1-4, it might be a quantity
        if (/^\d{1,4}$/.test(part)) {
            return null;
        }
        return part;
    }
    
    // ============================================================
    // STEP 3: Try to match part number with suffix (remove suffix)
    // Customer might type: A15979020- 200 → Part: A15979020, Qty: 200
    // ============================================================
    
    match = cleaned.match(/\b([A-Z0-9]{3,15})[-\.\/]\s*\d{1,5}\b/i);
    if (match) {
        return match[1].toUpperCase();
    }
    
    return null;
}

// ============================================================
// 🔍 EXTRACT QUANTITY (Number AFTER the part number)
// ============================================================

function extractQuantity(text, partNumber) {
    if (!text) return null;
    
    // If we have the part number, remove it from the text
    let remaining = text;
    if (partNumber) {
        // Escape special regex characters in part number
        const escapedPart = partNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        remaining = text.replace(new RegExp(escapedPart, 'i'), '').trim();
    }
    
    // Remove common words
    remaining = remaining
        .replace(/\b(pcs|nos|pc|no|qty|piece|pieces|units|each)\b/gi, '')
        .trim();
    
    // Look for numbers in the remaining text
    const numbers = remaining.match(/\b(\d{1,6})\b/g);
    if (numbers && numbers.length > 0) {
        // Return the first number found
        const qty = parseInt(numbers[0]);
        if (qty > 0 && qty < 1000000) {
            return qty;
        }
    }
    
    // If no number found, check the original text for quantity patterns
    const qtyPatterns = [
        text.match(/\b(\d{1,6})\s*(?:pcs|nos|pc|no|qty|piece|pieces)\b/i),
        text.match(/\b(\d{1,6})\s*[xX]\b/),
        text.match(/\b[pP][cC][sS]?\s*(\d{1,6})\b/),
        text.match(/\b(\d{1,6})\s*$/)  // Number at the end
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
    
    // STEP 1: Try to extract the FULL part number (with separators)
    let partNumber = extractPartNumber(trimmed);
    console.log(`📦 Extracted part number: "${partNumber}"`);
    
    if (!partNumber) return null;
    
    // STEP 2: Extract quantity from the remaining text
    let quantity = extractQuantity(trimmed, partNumber);
    console.log(`📊 Extracted quantity: ${quantity}`);
    
    // STEP 3: If quantity is null, check if there's a number at the end
    if (quantity === null || quantity === undefined) {
        const numbers = trimmed.match(/\b(\d{1,6})\b/g);
        if (numbers && numbers.length > 0) {
            // Check if the last number is the quantity
            const lastNumber = parseInt(numbers[numbers.length - 1]);
            // If the number is 1-5 digits and not part of the part number
            if (lastNumber > 0 && lastNumber < 100000) {
                quantity = lastNumber;
                console.log(`📊 Using last number as quantity: ${quantity}`);
            }
        }
    }
    
    // Default quantity to 1
    if (quantity === null || quantity === undefined || quantity < 1) {
        quantity = 1;
    }
    
    console.log(`✅ Final: Part="${partNumber}", Qty=${quantity}`);
    return { part: partNumber, qty: quantity };
}

// ============================================================
// 🔍 EXTRACT ALL PART NUMBERS FROM TEXT
// ============================================================

function extractAllPartNumbers(text) {
    if (!text) return [];
    
    const results = [];
    const seen = new Set();
    
    // Pattern 1: Part with hyphen (A15979020-0200)
    let matches = text.match(/\b([A-Z0-9]{1,15}[-][A-Z0-9]{1,10})\b/gi);
    if (matches) {
        for (const match of matches) {
            const part = match.toUpperCase();
            if (!seen.has(part)) {
                seen.add(part);
                results.push(part);
            }
        }
    }
    
    // Pattern 2: Part with dot (A15979020.0200)
    matches = text.match(/\b([A-Z0-9]{1,15}\.[A-Z0-9]{1,10})\b/gi);
    if (matches) {
        for (const match of matches) {
            const part = match.toUpperCase();
            if (!seen.has(part)) {
                seen.add(part);
                results.push(part);
            }
        }
    }
    
    // Pattern 3: Part with slash (A15979020/0200)
    matches = text.match(/\b([A-Z0-9]{1,15}\/[A-Z0-9]{1,10})\b/gi);
    if (matches) {
        for (const match of matches) {
            const part = match.toUpperCase();
            if (!seen.has(part)) {
                seen.add(part);
                results.push(part);
            }
        }
    }
    
    // Pattern 4: Alphanumeric part (A15979020)
    matches = text.match(/\b([A-Z0-9]{3,15})\b/g);
    if (matches) {
        for (const match of matches) {
            const part = match.toUpperCase();
            // Skip if it's just a number (likely quantity)
            if (/^\d+$/.test(part)) continue;
            if (!seen.has(part)) {
                seen.add(part);
                results.push(part);
            }
        }
    }
    
    return results;
}

// ============================================================
// 📋 MAIN PARSE ORDER FUNCTION
// ============================================================

function parseOrder(text) {
    console.log('📝 ===== PARSING ORDER =====');
    console.log('📝 Input:', text);
    
    if (!text || text.trim() === '') {
        return { items: [], unparsed: [] };
    }
    
    // Normalize text
    let normalized = text
        .replace(/\s+/g, ' ')
        .replace(/\b(pcs|nos|pc|no|qty|piece|pieces|units)\b/gi, ' ')
        .replace(/\s*x\s*/gi, ' ')
        .trim();
    
    console.log('📝 Normalized:', normalized);
    
    // Split by common separators
    let segments = normalized
        .split(/\n/)
        .flatMap(s => s.split(','))
        .flatMap(s => s.split(';'))
        .flatMap(s => s.split(/\s+and\s+/i))
        .flatMap(s => s.split('+'))
        .map(s => s.trim())
        .filter(s => s.length > 0);
    
    // If only one segment, try to split by part number pattern
    if (segments.length === 1 && segments[0].length > 20) {
        // Try to find multiple part numbers in one string
        const multipleParts = segments[0].match(/\b[A-Z0-9]{3,15}\s+\d{1,5}\s+(?=[A-Z0-9])/gi);
        if (multipleParts && multipleParts.length > 1) {
            segments = multipleParts.map(s => s.trim());
        }
    }
    
    console.log('📝 Segments:', segments);
    
    // Parse each segment
    const items = [];
    const unparsed = [];
    const seenParts = new Set();
    
    for (const segment of segments) {
        if (!segment || segment.trim() === '') continue;
        
        const parsed = parseSegment(segment);
        if (parsed && parsed.part) {
            // Check for duplicates
            if (!seenParts.has(parsed.part)) {
                seenParts.add(parsed.part);
                items.push(parsed);
                console.log(`✅ Added: ${parsed.part} x${parsed.qty}`);
            } else {
                console.log(`⚠️ Duplicate: ${parsed.part} - skipping`);
            }
        } else {
            // Try to extract part number without quantity
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
        { input: 'A15979020-0200 200', expected: [{ part: 'A15979020-0200', qty: 200 }] },
        { input: 'A15979020-0200 2', expected: [{ part: 'A15979020-0200', qty: 2 }] },
        { input: 'A15979020-0200', expected: [{ part: 'A15979020-0200', qty: 1 }] },
        { input: '84777 200', expected: [{ part: '84777', qty: 200 }] },
        { input: '84777 2', expected: [{ part: '84777', qty: 2 }] },
        { input: 'A15979020-0200 200, 0303BC0071N 3', expected: [{ part: 'A15979020-0200', qty: 200 }, { part: '0303BC0071N', qty: 3 }] },
        { input: 'I need A15979020-0200 200', expected: [{ part: 'A15979020-0200', qty: 200 }] },
        { input: '2 pcs A15979020-0200', expected: [{ part: 'A15979020-0200', qty: 2 }] },
        { input: 'A15979020-0200 200 pcs', expected: [{ part: 'A15979020-0200', qty: 200 }] },
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
    extractAllPartNumbers,
    testParser
};
