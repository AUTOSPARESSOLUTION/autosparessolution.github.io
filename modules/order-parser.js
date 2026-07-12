// ============================================================
// 📦 ORDER PARSER - COMPLETE FIXED
// Handles: Multi-line, multi-product, ALL formats including:
// "0802CAA08871N-2", "0802CAA08871N/2", "0802CAA08871Nx2", "0802CAA08871N 2"
// ============================================================

/**
 * Extract part numbers and quantities from ANY text format
 * IMPORTANT RULES:
 * 1. Quantity can be separated by: space, -, /, x, X, :, =
 * 2. Part number is ALWAYS before the quantity
 * 3. Support multiple formats: "PART-2", "PART/2", "PARTx2", "PART 2", "PART:2", "PART=2"
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
// 🔍 EXTRACT PART NUMBER AND QUANTITY TOGETHER
// ============================================================

function extractPartAndQuantity(text) {
    if (!text) return null;
    
    const trimmed = text.trim();
    
    // ============================================================
    // PATTERN 1: PART-2 or PART/2 or PARTx2 or PARTX2
    // ============================================================
    let match = trimmed.match(/^([A-Z0-9]{3,20})\s*[-/xX:]\s*(\d+)\s*(?:pcs|nos|pc|no)?$/i);
    if (match) {
        return { part: match[1].toUpperCase(), qty: parseInt(match[2]) };
    }
    
    // ============================================================
    // PATTERN 2: PART 2 (space separator)
    // ============================================================
    match = trimmed.match(/^([A-Z0-9]{3,20})\s+(\d+)\s*(?:pcs|nos|pc|no)?$/i);
    if (match) {
        return { part: match[1].toUpperCase(), qty: parseInt(match[2]) };
    }
    
    // ============================================================
    // PATTERN 3: PART-2pcs or PART/2nos
    // ============================================================
    match = trimmed.match(/^([A-Z0-9]{3,20})\s*[-/xX:]\s*(\d+)\s*(pcs|nos|pc|no)$/i);
    if (match) {
        return { part: match[1].toUpperCase(), qty: parseInt(match[2]) };
    }
    
    // ============================================================
    // PATTERN 4: PART (no quantity)
    // ============================================================
    match = trimmed.match(/^([A-Z0-9]{3,20})$/i);
    if (match) {
        return { part: match[1].toUpperCase(), qty: 1 };
    }
    
    // ============================================================
    // PATTERN 5: PART - 2 (space hyphen space)
    // ============================================================
    match = trimmed.match(/^([A-Z0-9]{3,20})\s+[-]\s+(\d+)$/i);
    if (match) {
        return { part: match[1].toUpperCase(), qty: parseInt(match[2]) };
    }
    
    // ============================================================
    // PATTERN 6: 2 PART (quantity first - rare but handle)
    // ============================================================
    match = trimmed.match(/^(\d+)\s+([A-Z0-9]{3,20})$/i);
    if (match) {
        return { part: match[2].toUpperCase(), qty: parseInt(match[1]) };
    }
    
    // ============================================================
    // PATTERN 7: PART (with hyphen in part number like A15979020-0200)
    // ============================================================
    match = trimmed.match(/^([A-Z0-9]{3,15}[-][A-Z0-9]{1,10})$/i);
    if (match) {
        return { part: match[1].toUpperCase(), qty: 1 };
    }
    
    // ============================================================
    // PATTERN 8: PART with separator and suffix (A15979020-0200-2)
    // ============================================================
    match = trimmed.match(/^([A-Z0-9]{3,15}[-][A-Z0-9]{1,10})\s*[-/xX:]\s*(\d+)$/i);
    if (match) {
        return { part: match[1].toUpperCase(), qty: parseInt(match[2]) };
    }
    
    // ============================================================
    // PATTERN 9: Extract part number from complex text
    // ============================================================
    const partMatch = trimmed.match(/\b([A-Z0-9]{5,20})\b/i);
    if (partMatch) {
        const part = partMatch[1].toUpperCase();
        // Try to find quantity near the part
        const qtyMatch = trimmed.match(new RegExp(part + '\\s*[-/xX:]\\s*(\\d+)', 'i'));
        if (qtyMatch) {
            return { part: part, qty: parseInt(qtyMatch[1]) };
        }
        // Try space separated
        const spaceMatch = trimmed.match(new RegExp(part + '\\s+(\\d+)', 'i'));
        if (spaceMatch) {
            return { part: part, qty: parseInt(spaceMatch[1]) };
        }
        return { part: part, qty: 1 };
    }
    
    return null;
}

// ============================================================
// 📋 MAIN PARSE ORDER FUNCTION - FIXED
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
    
    // If still one segment, try to split by detecting multiple part numbers
    if (segments.length === 1 && segments[0].length > 15) {
        const matches = segments[0].match(/\b([A-Z0-9]{5,20})\s*[-/xX:]?\s*\d*\s*/gi);
        if (matches && matches.length > 1) {
            segments = matches.map(s => s.trim());
            console.log(`📝 Split by multiple part patterns: ${segments.length} segments`);
        }
    }
    
    // If still one segment, try to split by detecting multiple part numbers with separators
    if (segments.length === 1 && segments[0].length > 15) {
        const matches = segments[0].match(/[A-Z0-9]{5,20}(?:\s*[-/xX:]\s*\d+)?/gi);
        if (matches && matches.length > 1) {
            segments = matches.map(s => s.trim());
            console.log(`📝 Split by regex patterns: ${segments.length} segments`);
        }
    }
    
    console.log('📝 Segments:', segments);
    
    // ============================================================
    // STEP 2: Parse each segment using the new extractor
    // ============================================================
    const items = [];
    const unparsed = [];
    const seenParts = new Set();
    
    for (const segment of segments) {
        if (!segment || segment.trim() === '') continue;
        
        console.log(`🔍 Processing segment: "${segment}"`);
        const parsed = extractPartAndQuantity(segment);
        
        if (parsed && parsed.part) {
            if (!seenParts.has(parsed.part)) {
                seenParts.add(parsed.part);
                items.push(parsed);
                console.log(`✅ Added: ${parsed.part} x${parsed.qty}`);
            } else {
                console.log(`⚠️ Duplicate: ${parsed.part} - skipping`);
            }
        } else {
            // Try to extract part number without quantity
            const partMatch = segment.match(/\b([A-Z0-9]{5,20})\b/i);
            if (partMatch) {
                const part = partMatch[1].toUpperCase();
                if (!seenParts.has(part)) {
                    seenParts.add(part);
                    items.push({ part: part, qty: 1 });
                    console.log(`✅ Extracted part only: ${part} x1`);
                }
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
// 🔍 EXTRACT PART NUMBER (legacy support)
// ============================================================

function extractPartNumber(text) {
    if (!text) return null;
    const result = extractPartAndQuantity(text);
    return result ? result.part : null;
}

// ============================================================
// 🔍 EXTRACT QUANTITY (legacy support)
// ============================================================

function extractQuantity(text) {
    if (!text) return null;
    const result = extractPartAndQuantity(text);
    return result ? result.qty : null;
}

// ============================================================
// 🧪 TEST FUNCTION
// ============================================================

function testParser() {
    const testCases = [
        { input: '0802CAA08871N-2\n0305HBF00031N-3', expected: [{ part: '0802CAA08871N', qty: 2 }, { part: '0305HBF00031N', qty: 3 }] },
        { input: '0802CAA08871N/2\n0305HBF00031N/3', expected: [{ part: '0802CAA08871N', qty: 2 }, { part: '0305HBF00031N', qty: 3 }] },
        { input: '0802CAA08871Nx2\n0305HBF00031Nx3', expected: [{ part: '0802CAA08871N', qty: 2 }, { part: '0305HBF00031N', qty: 3 }] },
        { input: '0802CAA08871N 2\n0305HBF00031N 3', expected: [{ part: '0802CAA08871N', qty: 2 }, { part: '0305HBF00031N', qty: 3 }] },
        { input: '0802CAA08871N-2nos\n0305HBF00031N-3nos', expected: [{ part: '0802CAA08871N', qty: 2 }, { part: '0305HBF00031N', qty: 3 }] },
        { input: '0802CAA08871N-2pc\n0305HBF00031N-3pc', expected: [{ part: '0802CAA08871N', qty: 2 }, { part: '0305HBF00031N', qty: 3 }] },
        { input: '0802CAA08871N=2\n0305HBF00031N=3', expected: [{ part: '0802CAA08871N', qty: 2 }, { part: '0305HBF00031N', qty: 3 }] },
        { input: '0802CAA08871N:2\n0305HBF00031N:3', expected: [{ part: '0802CAA08871N', qty: 2 }, { part: '0305HBF00031N', qty: 3 }] },
        { input: '0802CAA08871N 2, 0305HBF00031N 3', expected: [{ part: '0802CAA08871N', qty: 2 }, { part: '0305HBF00031N', qty: 3 }] },
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
    extractPartAndQuantity,
    cleanText,
    testParser
};
