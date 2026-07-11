// ============================================================
// 📦 ORDER PARSER - Handles ALL Order Formats
// Supports: spaces, hyphens, dots, slashes, etc.
// ============================================================

/**
 * Extract part numbers and quantities from ANY text format
 * Supports:
 * - Part numbers with spaces: "84777 200"
 * - Part numbers with hyphens: "84777-200"
 * - Part numbers with dots: "84777.200"
 * - Part numbers with slashes: "84777/200"
 */

function parseOrder(text) {
    console.log('📝 Parsing order:', text);
    
    // Normalize text
    const normalized = normalizeText(text);
    console.log('📝 Normalized:', normalized);
    
    // Split into segments
    const segments = splitIntoSegments(normalized);
    console.log('📝 Segments:', segments);
    
    // Parse each segment
    const items = [];
    let unparsed = [];
    
    for (const segment of segments) {
        const parsed = parseSegment(segment);
        if (parsed) {
            items.push(parsed);
        } else if (segment.trim()) {
            // Try to extract part number without quantity
            const partMatch = extractPartNumber(segment);
            if (partMatch) {
                const qty = extractQuantity(segment) || 1;
                items.push({
                    part: partMatch,
                    qty: qty
                });
            } else {
                unparsed.push(segment);
            }
        }
    }
    
    // If no items found, try extracting part numbers from entire text
    if (items.length === 0) {
        const partNumbers = extractAllPartNumbers(text);
        if (partNumbers.length > 0) {
            for (const part of partNumbers) {
                const qty = findQuantityNearPart(text, part);
                items.push({
                    part: part,
                    qty: qty || 1
                });
            }
        }
    }
    
    console.log('📦 Parsed items:', items);
    console.log('⚠️ Unparsed segments:', unparsed);
    
    return { items, unparsed };
}

// ============================================================
// 🔧 NORMALIZE TEXT
// ============================================================

function normalizeText(text) {
    let normalized = text
        // Remove extra spaces
        .replace(/\s+/g, ' ')
        // Remove common words
        .replace(/\b(i need|i want|please order|please|need|want|order|buy|purchase|send|bhejo|chahiye|lena hai|mujhe|please|kindly|can i have|i would like|i'll take|give me|get me|to|for|of|the|and|with|from|at|on|in|by|per|each|piece|pcs|nos|no|pc)\b/gi, '')
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
// ✂️ SPLIT INTO SEGMENTS
// ============================================================

function splitIntoSegments(text) {
    // Split by common separators
    let segments = text
        .split(/\n/)
        .flatMap(s => s.split(','))
        .flatMap(s => s.split(';'))
        .flatMap(s => s.split(/\s+and\s+/i))
        .flatMap(s => s.split('+'))
        .flatMap(s => {
            if (s.includes('/') && !s.match(/[A-Z0-9]\/[A-Z0-9]/i)) {
                return s.split('/');
            }
            return [s];
        })
        .map(s => s.trim())
        .filter(s => s.length > 0);
    
    return segments;
}

// ============================================================
// 🔍 EXTRACT PART NUMBER (Supports spaces, hyphens, dots)
// ============================================================

function extractPartNumber(text) {
    // Pattern 1: Part number with hyphens (84777-200)
    let match = text.match(/\b([A-Z0-9]{3,10}[-][A-Z0-9]{1,5})\b/i);
    if (match) return match[1].toUpperCase();
    
    // Pattern 2: Part number with spaces (84777 200)
    match = text.match(/\b([A-Z0-9]{3,10}\s+[A-Z0-9]{1,5})\b/i);
    if (match) {
        // Remove space
        return match[1].replace(/\s+/g, '').toUpperCase();
    }
    
    // Pattern 3: Part number with dots (84777.200)
    match = text.match(/\b([A-Z0-9]{3,10}\.[A-Z0-9]{1,5})\b/i);
    if (match) {
        // Remove dot
        return match[1].replace(/\./g, '').toUpperCase();
    }
    
    // Pattern 4: Part number with slashes (84777/200)
    match = text.match(/\b([A-Z0-9]{3,10}\/[A-Z0-9]{1,5})\b/i);
    if (match) {
        // Remove slash
        return match[1].replace(/\//g, '').toUpperCase();
    }
    
    // Pattern 5: Standard part number (8-20 alphanumeric)
    match = text.match(/\b([A-Z0-9]{8,20})\b/);
    if (match) return match[1].toUpperCase();
    
    // Pattern 6: Part number with prefix (M&M, TVS, etc.)
    match = text.match(/\b([A-Z]{2,4}[- ]?[A-Z0-9]{4,10})\b/);
    if (match) {
        return match[1].replace(/[- ]/g, '').toUpperCase();
    }
    
    // Pattern 7: Any alphanumeric sequence with numbers (minimum 5 chars)
    match = text.match(/\b([A-Z0-9]{5,20})\b/);
    if (match) return match[1].toUpperCase();
    
    return null;
}

// ============================================================
// 🔍 EXTRACT QUANTITY
// ============================================================

function extractQuantity(text) {
    // Look for numbers in the text (excluding part numbers)
    const numbers = text.match(/\b(\d+)\b/g);
    if (!numbers) return null;
    
    // If only one number, assume it's the quantity
    if (numbers.length === 1) {
        return parseInt(numbers[0]);
    }
    
    // If multiple numbers, try to find which one is the quantity
    // Check for patterns like "x2", "2x", "2 pcs", etc.
    const qtyPatterns = [
        text.match(/[xX]\s*(\d+)/),
        text.match(/(\d+)\s*[xX]/),
        text.match(/(\d+)\s*(?:pcs|nos|pc|no)/i)
    ];
    
    for (const pattern of qtyPatterns) {
        if (pattern) {
            return parseInt(pattern[1]);
        }
    }
    
    // Default: return the first number found
    return parseInt(numbers[0]);
}

// ============================================================
// 🔍 PARSE A SINGLE SEGMENT
// ============================================================

function parseSegment(segment) {
    // Try different patterns in order of priority
    
    // Pattern 1: Part number with spaces/hyphens/dots + quantity
    // Example: "84777 200 2" or "84777-200 2"
    let partMatch = extractPartNumber(segment);
    let qty = extractQuantity(segment);
    
    if (partMatch) {
        return { part: partMatch, qty: qty || 1 };
    }
    
    // Pattern 2: PART123 = 2 or PART123: 2 or PART123 - 2 or PART123 / 2
    let match = segment.match(/\b([A-Z0-9]{8,20})\s*[=\-:\/]\s*(\d+)\b/);
    if (match) {
        return { part: match[1].toUpperCase(), qty: parseInt(match[2]) };
    }
    
    // Pattern 3: PART123 2 (part then quantity)
    match = segment.match(/\b([A-Z0-9]{8,20})\s+(\d+)\b/);
    if (match) {
        return { part: match[1].toUpperCase(), qty: parseInt(match[2]) };
    }
    
    // Pattern 4: 2 PART123 (quantity then part)
    match = segment.match(/\b(\d+)\s+([A-Z0-9]{8,20})\b/);
    if (match) {
        return { part: match[2].toUpperCase(), qty: parseInt(match[1]) };
    }
    
    // Pattern 5: PART123 x 2 or PART123 X 2
    match = segment.match(/\b([A-Z0-9]{8,20})\s*[xX]\s*(\d+)\b/);
    if (match) {
        return { part: match[1].toUpperCase(), qty: parseInt(match[2]) };
    }
    
    // Pattern 6: 2 x PART123
    match = segment.match(/\b(\d+)\s*[xX]\s*([A-Z0-9]{8,20})\b/);
    if (match) {
        return { part: match[2].toUpperCase(), qty: parseInt(match[1]) };
    }
    
    // Pattern 7: PART123 QTY 2
    match = segment.match(/\b([A-Z0-9]{8,20})\s*QTY\s*(\d+)\b/i);
    if (match) {
        return { part: match[1].toUpperCase(), qty: parseInt(match[2]) };
    }
    
    // Pattern 8: 2 QTY PART123
    match = segment.match(/\b(\d+)\s*QTY\s*([A-Z0-9]{8,20})\b/i);
    if (match) {
        return { part: match[2].toUpperCase(), qty: parseInt(match[1]) };
    }
    
    // Pattern 9: Just part number (no quantity)
    match = segment.match(/\b([A-Z0-9]{8,20})\b/);
    if (match) {
        return { part: match[1].toUpperCase(), qty: 1 };
    }
    
    return null;
}

// ============================================================
// 🔍 EXTRACT ALL PART NUMBERS (with spaces support)
// ============================================================

function extractAllPartNumbers(text) {
    const results = [];
    const seen = new Set();
    
    // Try to find part numbers with spaces first
    // Pattern: 84777 200 (space separated)
    const spacedMatches = text.match(/\b([A-Z0-9]{3,10}\s+[A-Z0-9]{1,5})\b/gi);
    if (spacedMatches) {
        for (const match of spacedMatches) {
            const part = match.replace(/\s+/g, '').toUpperCase();
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
            const part = match.replace(/-/g, '').toUpperCase();
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
    
    return results;
}

// ============================================================
// 🔍 FIND QUANTITY NEAR PART
// ============================================================

function findQuantityNearPart(text, part) {
    const index = text.toUpperCase().indexOf(part);
    if (index === -1) return null;
    
    const before = text.substring(Math.max(0, index - 20), index);
    const after = text.substring(index + part.length, index + part.length + 20);
    const context = before + ' ' + after;
    
    const numbers = context.match(/\b(\d+)\b/g);
    if (numbers && numbers.length > 0) {
        return parseInt(numbers[0]);
    }
    
    return null;
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
    findQuantityNearPart
};
