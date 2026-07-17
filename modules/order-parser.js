// ============================================================
// 📦 ORDER PARSER - COMPLETE FIXED + Description Support
// Handles: Multi-line, multi-product, ALL formats including:
// "0802CAA08871N-2", "0802CAA08871N/2", "0802CAA08871Nx2", "0802CAA08871N 2"
// NEW: Description-based search "clutch plate 2"
// ============================================================

/**
 * Extract part numbers, descriptions, and quantities from ANY text format
 * IMPORTANT RULES:
 * 1. Quantity can be separated by: space, -, /, x, X, :, =
 * 2. Part number is ALWAYS before the quantity
 * 3. Support multiple formats: "PART-2", "PART/2", "PARTx2", "PART 2", "PART:2", "PART=2"
 * 4. NEW: Support description search: "clutch plate 2"
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
        return { part: match[1].toUpperCase(), qty: parseInt(match[2]), type: 'exact' };
    }
    
    // ============================================================
    // PATTERN 2: PART 2 (space separator)
    // ============================================================
    match = trimmed.match(/^([A-Z0-9]{3,20})\s+(\d+)\s*(?:pcs|nos|pc|no)?$/i);
    if (match) {
        return { part: match[1].toUpperCase(), qty: parseInt(match[2]), type: 'exact' };
    }
    
    // ============================================================
    // PATTERN 3: PART-2pcs or PART/2nos
    // ============================================================
    match = trimmed.match(/^([A-Z0-9]{3,20})\s*[-/xX:]\s*(\d+)\s*(pcs|nos|pc|no)$/i);
    if (match) {
        return { part: match[1].toUpperCase(), qty: parseInt(match[2]), type: 'exact' };
    }
    
    // ============================================================
    // PATTERN 4: PART (no quantity)
    // ============================================================
    match = trimmed.match(/^([A-Z0-9]{3,20})$/i);
    if (match) {
        return { part: match[1].toUpperCase(), qty: 1, type: 'exact' };
    }
    
    // ============================================================
    // PATTERN 5: PART - 2 (space hyphen space)
    // ============================================================
    match = trimmed.match(/^([A-Z0-9]{3,20})\s+[-]\s+(\d+)$/i);
    if (match) {
        return { part: match[1].toUpperCase(), qty: parseInt(match[2]), type: 'exact' };
    }
    
    // ============================================================
    // PATTERN 6: 2 PART (quantity first - rare but handle)
    // ============================================================
    match = trimmed.match(/^(\d+)\s+([A-Z0-9]{3,20})$/i);
    if (match) {
        return { part: match[2].toUpperCase(), qty: parseInt(match[1]), type: 'exact' };
    }
    
    // ============================================================
    // PATTERN 7: PART (with hyphen in part number like A15979020-0200)
    // ============================================================
    match = trimmed.match(/^([A-Z0-9]{3,15}[-][A-Z0-9]{1,10})$/i);
    if (match) {
        return { part: match[1].toUpperCase(), qty: 1, type: 'exact' };
    }
    
    // ============================================================
    // PATTERN 8: PART with separator and suffix (A15979020-0200-2)
    // ============================================================
    match = trimmed.match(/^([A-Z0-9]{3,15}[-][A-Z0-9]{1,10})\s*[-/xX:]\s*(\d+)$/i);
    if (match) {
        return { part: match[1].toUpperCase(), qty: parseInt(match[2]), type: 'exact' };
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
            return { part: part, qty: parseInt(qtyMatch[1]), type: 'exact' };
        }
        // Try space separated
        const spaceMatch = trimmed.match(new RegExp(part + '\\s+(\\d+)', 'i'));
        if (spaceMatch) {
            return { part: part, qty: parseInt(spaceMatch[1]), type: 'exact' };
        }
        return { part: part, qty: 1, type: 'exact' };
    }
    
    // ============================================================
    // ✅ NEW: PATTERN 10: DESCRIPTION WITH QUANTITY
    // Example: "clutch plate 2", "oil filter 3", "M&M 4"
    // ============================================================
    // Check if it's a description (not a part number)
    if (!trimmed.match(/^[A-Z0-9\s\-\.\/]+$/i)) {
        // Try to extract quantity at the end
        const qtyMatch = trimmed.match(/(\d+)\s*(?:pcs|nos|pc|no)?$/i);
        let qty = 1;
        let descText = trimmed;
        
        if (qtyMatch) {
            qty = parseInt(qtyMatch[1]);
            descText = trimmed.replace(/\d+\s*(?:pcs|nos|pc|no)?$/i, '').trim();
        }
        
        // Try to extract description with brand/make/model
        if (descText.length >= 2) {
            return { 
                description: descText, 
                qty: qty, 
                type: 'description' 
            };
        }
    }
    
    return null;
}

// ============================================================
// 📋 MAIN PARSE ORDER FUNCTION - ENHANCED
// ============================================================

function parseOrder(text) {
    console.log('📝 ===== PARSING ORDER =====');
    console.log('📝 Input:', text);
    
    if (!text || text.trim() === '') {
        return { items: [], unparsed: [], descriptions: [] };
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
    
    // If still one segment, try to split by detecting "and" or "&"
    if (segments.length === 1) {
        const andMatches = segments[0].split(/\s+and\s+|\s+&\s+|\s*,\s*/);
        if (andMatches.length > 1) {
            segments = andMatches.map(s => s.trim()).filter(s => s.length > 0);
            console.log(`📝 Split by 'and' or '&': ${segments.length} segments`);
        }
    }
    
    console.log('📝 Segments:', segments);
    
    // ============================================================
    // STEP 2: Parse each segment using the new extractor
    // ============================================================
    const items = [];
    const descriptions = [];
    const unparsed = [];
    const seenParts = new Set();
    
    for (const segment of segments) {
        if (!segment || segment.trim() === '') continue;
        
        console.log(`🔍 Processing segment: "${segment}"`);
        const parsed = extractPartAndQuantity(segment);
        
        if (parsed) {
            // ✅ NEW: Check if it's a description-based search
            if (parsed.type === 'description') {
                descriptions.push({
                    text: parsed.description,
                    qty: parsed.qty
                });
                console.log(`📝 Description found: "${parsed.description}" x${parsed.qty}`);
            } else if (parsed.part) {
                if (!seenParts.has(parsed.part)) {
                    seenParts.add(parsed.part);
                    items.push({ part: parsed.part, qty: parsed.qty });
                    console.log(`✅ Added: ${parsed.part} x${parsed.qty}`);
                } else {
                    console.log(`⚠️ Duplicate: ${parsed.part} - skipping`);
                }
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
                // ✅ NEW: Check if this might be a description
                const cleanSegment = segment.trim();
                if (cleanSegment.length >= 2 && !cleanSegment.match(/^[A-Z0-9\s\-\.\/]+$/i)) {
                    // Check if there's a quantity at the end
                    const qtyMatch = cleanSegment.match(/(\d+)\s*(?:pcs|nos|pc|no)?$/i);
                    let qty = 1;
                    let descText = cleanSegment;
                    if (qtyMatch) {
                        qty = parseInt(qtyMatch[1]);
                        descText = cleanSegment.replace(/\d+\s*(?:pcs|nos|pc|no)?$/i, '').trim();
                    }
                    descriptions.push({
                        text: descText,
                        qty: qty
                    });
                    console.log(`📝 Description from unparsed: "${descText}" x${qty}`);
                } else {
                    unparsed.push(segment);
                    console.log(`⚠️ Unparsed: "${segment}"`);
                }
            }
        }
    }
    
    console.log(`📦 Total parsed items: ${items.length}`);
    console.log(`📝 Total descriptions: ${descriptions.length}`);
    console.log('📦 Items:', JSON.stringify(items, null, 2));
    console.log('📝 Descriptions:', JSON.stringify(descriptions, null, 2));
    
    return { items, unparsed, descriptions };
}

// ============================================================
// 🔍 EXTRACT PART NUMBER (legacy support)
// ============================================================

function extractPartNumber(text) {
    if (!text) return null;
    const result = extractPartAndQuantity(text);
    return result && result.type === 'exact' ? result.part : null;
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
// ✅ NEW: EXTRACT DESCRIPTION FROM TEXT
// ============================================================

function extractDescription(text) {
    if (!text) return null;
    const result = extractPartAndQuantity(text);
    if (result && result.type === 'description') {
        return { text: result.description, qty: result.qty };
    }
    return null;
}

// ============================================================
// ✅ NEW: PARSE WITH DESCRIPTION SUPPORT - Integrates with database
// ============================================================

async function parseOrderWithDescription(text, db) {
    const result = parseOrder(text);
    
    // If we have descriptions, try to find products
    if (result.descriptions && result.descriptions.length > 0) {
        const foundProducts = [];
        const notFound = [];
        
        for (const desc of result.descriptions) {
            const products = await db.searchProducts(desc.text, 5);
            if (products && products.length > 0) {
                // Take the best match
                const product = products[0];
                foundProducts.push({
                    part: product.part,
                    description: product.description,
                    qty: desc.qty,
                    matchType: 'description',
                    searchText: desc.text
                });
                console.log(`✅ Found product for description "${desc.text}": ${product.part}`);
            } else {
                notFound.push(desc.text);
                console.log(`❌ No product found for description "${desc.text}"`);
            }
        }
        
        // Merge with exact part matches
        const allItems = [...result.items, ...foundProducts];
        return { 
            items: allItems, 
            unparsed: result.unparsed,
            descriptions: result.descriptions,
            notFound: notFound
        };
    }
    
    return { 
        items: result.items, 
        unparsed: result.unparsed,
        descriptions: [],
        notFound: []
    };
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
        // ✅ NEW: Description tests
        { input: 'clutch plate 2', expectedDescriptions: [{ text: 'clutch plate', qty: 2 }] },
        { input: 'oil filter 3', expectedDescriptions: [{ text: 'oil filter', qty: 3 }] },
        { input: 'M&M 4', expectedDescriptions: [{ text: 'M&M', qty: 4 }] },
        { input: 'Maruti Swift clutch plate 2', expectedDescriptions: [{ text: 'Maruti Swift clutch plate', qty: 2 }] },
    ];
    
    console.log('🧪 Testing Order Parser...\n');
    let passed = 0;
    let failed = 0;
    
    for (const test of testCases) {
        const result = parseOrder(test.input);
        
        // Check exact part matches
        let success = true;
        if (test.expected) {
            success = JSON.stringify(result.items) === JSON.stringify(test.expected);
        }
        
        // Check description matches
        if (test.expectedDescriptions) {
            success = JSON.stringify(result.descriptions) === JSON.stringify(test.expectedDescriptions);
        }
        
        if (success) {
            passed++;
            console.log(`✅ PASS: "${test.input}"`);
        } else {
            failed++;
            console.log(`❌ FAIL: "${test.input}"`);
            if (test.expected) {
                console.log(`   Expected items: ${JSON.stringify(test.expected)}`);
                console.log(`   Got items: ${JSON.stringify(result.items)}`);
            }
            if (test.expectedDescriptions) {
                console.log(`   Expected descriptions: ${JSON.stringify(test.expectedDescriptions)}`);
                console.log(`   Got descriptions: ${JSON.stringify(result.descriptions)}`);
            }
        }
    }
    
    console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
    return { passed, failed };
}

// ============================================================
// 🚀 EXPORT
// ============================================================

module.exports = {
    parseOrder,
    extractPartNumber,
    extractQuantity,
    extractPartAndQuantity,
    extractDescription,
    parseOrderWithDescription,
    cleanText,
    testParser
};
