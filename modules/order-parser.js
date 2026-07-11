// ============================================================
// 📦 ORDER PARSER - COMPLETE FIXED
// Handles ALL order formats including spaces in part numbers
// Supports: "84777 200", "84777-200", "84777.200", "84777/200"
// ============================================================

/**
 * Extract part numbers and quantities from ANY text format
 * Supports:
 * - Part numbers with spaces: "84777 200"
 * - Part numbers with hyphens: "84777-200"
 * - Part numbers with dots: "84777.200"
 * - Part numbers with slashes: "84777/200"
 * - Natural language: "I need 2 84777 200"
 * - Multiple products: "84777 200 2, 0303BC0071N 3"
 * - Hinglish: "Mujhe 2 84777 200 chahiye"
 */

// ============================================================
// 🔧 CLEAN PART NUMBER (Remove spaces, hyphens, dots, slashes)
// ============================================================

function cleanPartNumber(part) {
    if (!part) return '';
    // Remove spaces, hyphens, dots, slashes
    return part.replace(/[\s\-\.\/]/g, '').toUpperCase().trim();
}

// ============================================================
// 🔍 EXTRACT PART NUMBER (Supports spaces, hyphens, dots, slashes)
// ============================================================

function extractPartNumber(text) {
    if (!text) return null;
    
    // Pattern 1: Part number with spaces (e.g., "84777 200")
    let match = text.match(/\b([A-Z0-9]{3,10}\s+[A-Z0-9]{1,5})\b/i);
    if (match) {
        return cleanPartNumber(match[1]);
    }
    
    // Pattern 2: Part number with hyphens (e.g., "84777-200")
    match = text.match(/\b([A-Z0-9]{3,10}[-][A-Z0-9]{1,5})\b/i);
    if (match) {
        return cleanPartNumber(match[1]);
    }
    
    // Pattern 3: Part number with dots (e.g., "84777.200")
    match = text.match(/\b([A-Z0-9]{3,10}\.[A-Z0-9]{1,5})\b/i);
    if (match) {
        return cleanPartNumber(match[1]);
    }
    
    // Pattern 4: Part number with slashes (e.g., "84777/200")
    match = text.match(/\b([A-Z0-9]{3,10}\/[A-Z0-9]{1,5})\b/i);
    if (match) {
        return cleanPartNumber(match[1]);
    }
    
    // Pattern 5: Standard part number (8-20 alphanumeric)
    match = text.match(/\b([A-Z0-9]{8,20})\b/i);
    if (match) {
        return match[1].toUpperCase();
    }
    
    // Pattern 6: Part number with prefix (M&M, TVS, etc.)
    match = text.match(/\b([A-Z]{2,4}[- ]?[A-Z0-9]{4,10})\b/i);
    if (match) {
        return cleanPartNumber(match[1]);
    }
    
    // Pattern 7: Any alphanumeric sequence with numbers (minimum 5 chars)
    match = text.match(/\b([A-Z0-9]{5,20})\b/i);
    if (match) {
        return match[1].toUpperCase();
    }
    
    return null;
}

// ============================================================
// 🔍 EXTRACT QUANTITY
// ============================================================

function extractQuantity(text) {
    if (!text) return null;
    
    // Look for numbers in the text
    const numbers = text.match(/\b(\d+)\b/g);
    if (!numbers) return null;
    
    // If only one number, assume it's the quantity
    if (numbers.length === 1) {
        return parseInt(numbers[0]);
    }
    
    // Check for patterns like "x2", "2x", "2 pcs", etc.
    const qtyPatterns = [
        text.match(/[xX]\s*(\d+)/),
        text.match(/(\d+)\s*[xX]/),
        text.match(/(\d+)\s*(?:pcs|nos|pc|no|qty)/i)
    ];
    
    for (const pattern of qtyPatterns) {
        if (pattern) {
            return parseInt(pattern[1]);
        }
    }
    
    // Check for quantity near the end (common pattern)
    const words = text.trim().split(/\s+/);
    const lastWord = words[words.length - 1];
    if (lastWord && /^\d+$/.test(lastWord)) {
        return parseInt(lastWord);
    }
    
    // Default: return the first number found
    return parseInt(numbers[0]);
}

// ============================================================
// 🔍 PARSE A SINGLE SEGMENT
// ============================================================

function parseSegment(segment) {
    if (!segment || segment.trim() === '') return null;
    
    const trimmed = segment.trim();
    
    // Try to extract part number and quantity
    const partNumber = extractPartNumber(trimmed);
    if (!partNumber) return null;
    
    // Try to extract quantity
    let quantity = extractQuantity(trimmed);
    
    // If quantity is null, default to 1
    if (quantity === null || quantity === undefined) {
        quantity = 1;
    }
    
    // Validate quantity
    if (isNaN(quantity) || quantity < 1) {
        quantity = 1;
    }
    
    return { part: partNumber, qty: quantity };
}

// ============================================================
// ✂️ SPLIT INTO SEGMENTS
// ============================================================

function splitIntoSegments(text) {
    if (!text) return [];
    
    // Split by common separators
    let segments = text
        .split(/\n/)                    // New lines
        .flatMap(s => s.split(','))      // Commas
        .flatMap(s => s.split(';'))      // Semicolons
        .flatMap(s => s.split(/\s+and\s+/i)) // "and"
        .flatMap(s => s.split('+'))      // Plus signs
        .flatMap(s => {
            // Split by "/" but not part numbers with "/"
            if (s.includes('/') && !s.match(/[A-Z0-9]\/[A-Z0-9]/i)) {
                return s.split('/');
            }
            return [s];
        })
        .map(s => s.trim())
        .filter(s => s.length > 0);
    
    // If only one segment, try to split by part number pattern
    if (segments.length === 1 && segments[0].length > 30) {
        // Look for pattern: "PART123 2 PART456 3"
        const patternMatches = segments[0].match(/\b([A-Z0-9]{3,10}\s+[A-Z0-9]{1,5}|\b[A-Z0-9]{5,20})\s*\d+\s*(?=[A-Z0-9]|$)/gi);
        if (patternMatches && patternMatches.length > 1) {
            segments = patternMatches.map(s => s.trim());
        }
    }
    
    return segments;
}

// ============================================================
// 🔍 NORMALIZE TEXT
// ============================================================

function normalizeText(text) {
    if (!text) return '';
    
    let normalized = text
        // Remove extra spaces
        .replace(/\s+/g, ' ')
        // Remove common words (Hinglish + English)
        .replace(/\b(i need|i want|please order|please|need|want|order|buy|purchase|send|bhejo|chahiye|lena hai|mujhe|please|kindly|can i have|i would like|i'll take|give me|get me|to|for|of|the|and|with|from|at|on|in|by|per|each|piece|pcs|nos|no|pc|qty)\b/gi, '')
        // Remove special characters (keep numbers, letters, dashes, dots, commas)
        .replace(/[^A-Z0-9a-z\s\-\.\,\;\:\/\/=xX]/g, '')
        // Normalize multiple spaces
        .replace(/\s+/g, ' ')
        .trim();
    
    // Fix: "x" for multiplication
    normalized = normalized.replace(/\s*[xX]\s*/g, ' x ');
    
    // Fix: "=" for quantity
    normalized = normalized.replace(/\s*=\s*/g, ' = ');
    
    // Fix: ":" for quantity
    normalized = normalized.replace(/\s*:\s*/g, ' : ');
    
    // Fix: "-" for quantity (but keep part number hyphens)
    normalized = normalized.replace(/(\s+)-\s+/g, ' - ');
    
    // Fix: "/" for quantity
    normalized = normalized.replace(/\s*\/\s*/g, ' / ');
    
    return normalized.trim();
}

// ============================================================
// 📋 MAIN PARSE ORDER FUNCTION
// ============================================================

function parseOrder(text) {
    console.log('📝 Parsing order:', text);
    
    if (!text || text.trim() === '') {
        return { items: [], unparsed: [] };
    }
    
    // Normalize text
    const normalized = normalizeText(text);
    console.log('📝 Normalized:', normalized);
    
    // Split into segments
    const segments = splitIntoSegments(normalized);
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
                console.log(`✅ Parsed: ${parsed.part} x${parsed.qty}`);
            } else {
                console.log(`⚠️ Duplicate: ${parsed.part} - skipping`);
            }
        } else {
            // Try to extract part number without quantity from segment
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
    
    // If no items found, try extracting part numbers from entire text
    if (items.length === 0) {
        const partNumbers = extractAllPartNumbers(text);
        if (partNumbers.length > 0) {
            for (const part of partNumbers) {
                if (!seenParts.has(part)) {
                    seenParts.add(part);
                    const qty = findQuantityNearPart(text, part);
                    items.push({
                        part: part,
                        qty: qty || 1
                    });
                    console.log(`✅ Extracted from full text: ${part} x${qty || 1}`);
                }
            }
        }
    }
    
    console.log(`📦 Total parsed items: ${items.length}`);
    console.log('📦 Items:', JSON.stringify(items, null, 2));
    if (unparsed.length > 0) {
        console.log('⚠️ Unparsed segments:', unparsed);
    }
    
    return { items, unparsed };
}

// ============================================================
// 🔍 EXTRACT ALL PART NUMBERS (with spaces support)
// ============================================================

function extractAllPartNumbers(text) {
    if (!text) return [];
    
    const results = [];
    const seen = new Set();
    
    // Try to find part numbers with spaces first
    // Pattern: 84777 200 (space separated)
    const spacedMatches = text.match(/\b([A-Z0-9]{3,10}\s+[A-Z0-9]{1,5})\b/gi);
    if (spacedMatches) {
        for (const match of spacedMatches) {
            const part = cleanPartNumber(match);
            if (!seen.has(part)) {
                seen.add(part);
                results.push(part);
            }
        }
    }
    
    // Try to find part numbers with hyphens
    const hyphenMatches = text.match(/\b([A-Z0-9]{3,10}[-][A-Z0-9]{1,5})\b/gi);
    if (hyphenMatches) {
        for (const match of hyphenMatches) {
            const part = cleanPartNumber(match);
            if (!seen.has(part)) {
                seen.add(part);
                results.push(part);
            }
        }
    }
    
    // Try to find part numbers with dots
    const dotMatches = text.match(/\b([A-Z0-9]{3,10}\.[A-Z0-9]{1,5})\b/gi);
    if (dotMatches) {
        for (const match of dotMatches) {
            const part = cleanPartNumber(match);
            if (!seen.has(part)) {
                seen.add(part);
                results.push(part);
            }
        }
    }
    
    // Try to find standard part numbers
    const standardMatches = text.match(/\b([A-Z0-9]{8,20})\b/g);
    if (standardMatches) {
        for (const match of standardMatches) {
            const part = match.toUpperCase();
            if (!seen.has(part)) {
                seen.add(part);
                results.push(part);
            }
        }
    }
    
    // Try to find any alphanumeric with numbers (minimum 5 chars)
    const anyMatches = text.match(/\b([A-Z0-9]{5,20})\b/g);
    if (anyMatches) {
        for (const match of anyMatches) {
            const part = match.toUpperCase();
            if (!seen.has(part) && !results.includes(part)) {
                seen.add(part);
                results.push(part);
            }
        }
    }
    
    return results;
}

// ============================================================
// 🔍 FIND QUANTITY NEAR PART
// ============================================================

function findQuantityNearPart(text, part) {
    if (!text || !part) return null;
    
    const upperText = text.toUpperCase();
    const index = upperText.indexOf(part);
    if (index === -1) return null;
    
    // Get context around the part
    const before = upperText.substring(Math.max(0, index - 30), index);
    const after = upperText.substring(index + part.length, Math.min(upperText.length, index + part.length + 30));
    const context = before + ' ' + after;
    
    // Try to find a number in the context
    const numbers = context.match(/\b(\d+)\b/g);
    if (numbers && numbers.length > 0) {
        // Return the first number found
        return parseInt(numbers[0]);
    }
    
    return null;
}

// ============================================================
// 🧪 TEST FUNCTION (for debugging)
// ============================================================

function testParser() {
    const testCases = [
        // Basic formats
        { input: '84777 200', expected: [{ part: '84777200', qty: 1 }] },
        { input: '84777-200', expected: [{ part: '84777200', qty: 1 }] },
        { input: '84777.200', expected: [{ part: '84777200', qty: 1 }] },
        { input: '84777/200', expected: [{ part: '84777200', qty: 1 }] },
        { input: '84777200', expected: [{ part: '84777200', qty: 1 }] },
        
        // With quantity
        { input: '84777 200 2', expected: [{ part: '84777200', qty: 2 }] },
        { input: '2 84777 200', expected: [{ part: '84777200', qty: 2 }] },
        { input: '84777-200 2', expected: [{ part: '84777200', qty: 2 }] },
        { input: '2 84777-200', expected: [{ part: '84777200', qty: 2 }] },
        
        // Natural language
        { input: 'I need 84777 200', expected: [{ part: '84777200', qty: 1 }] },
        { input: 'I need 2 84777 200', expected: [{ part: '84777200', qty: 2 }] },
        { input: 'Need 84777-200 2', expected: [{ part: '84777200', qty: 2 }] },
        
        // Multiple products
        { input: '84777 200 2, 0303BC0071N 3', expected: [{ part: '84777200', qty: 2 }, { part: '0303BC0071N', qty: 3 }] },
        { input: '84777-200 2; 0303BC0071N 3', expected: [{ part: '84777200', qty: 2 }, { part: '0303BC0071N', qty: 3 }] },
        
        // Hinglish
        { input: 'Mujhe 2 84777 200 chahiye', expected: [{ part: '84777200', qty: 2 }] },
        { input: '84777-200 2 bhejo', expected: [{ part: '84777200', qty: 2 }] },
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
    if (failed === 0) {
        console.log('🎉 All tests passed!');
    }
    return { passed, failed };
}

// ============================================================
// 🚀 EXPORT
// ============================================================

module.exports = {
    parseOrder,
    normalizeText,
    splitIntoSegments,
    parseSegment,
    extractPartNumber,
    extractQuantity,
    extractAllPartNumbers,
    findQuantityNearPart,
    cleanPartNumber,
    testParser
};
