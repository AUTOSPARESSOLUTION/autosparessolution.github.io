// ============================================================
// 📦 ORDER PARSER - Handles ALL Order Formats
// ============================================================

/**
 * Extract part numbers and quantities from ANY text format
 * Supports:
 * - Single product: "0801BA0285N 2"
 * - Multiple products: "0801BA0285N 2, 0303BC0071N 3"
 * - Natural language: "I need 2 0801BA0285N"
 * - Mixed formats: "0801BA0285N 2, 0303BC0071N x3"
 * - Hinglish: "Mujhe 2 0801BA0285N chahiye"
 */

function parseOrder(text) {
    console.log('📝 Parsing order:', text);
    
    // Normalize text
    const normalized = normalizeText(text);
    console.log('📝 Normalized:', normalized);
    
    // Split into segments (handles multiple lines, commas, semicolons, etc.)
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
            const partMatch = segment.match(/[A-Z0-9]{8,20}/);
            if (partMatch) {
                items.push({
                    part: partMatch[0],
                    qty: 1
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
                // Try to find quantity near the part number
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
        // Remove common words (Hinglish + English)
        .replace(/\b(i need|i want|please order|please|need|want|order|buy|purchase|send|bhejo|chahiye|lena hai|mujhe|please|kindly|can i have|i would like|i'll take|give me|get me|to|for|of|the|and|with|from|at|on|in|by|per|each|piece|pcs|nos|no|pc)\b/gi, '')
        // Remove special characters (keep numbers, letters, dashes, dots, commas)
        .replace(/[^A-Z0-9a-z\s\-\.\,\;\:\/\/\=xX]/g, '')
        // Normalize multiple spaces
        .replace(/\s+/g, ' ')
        .trim();
    
    // Fix: "x" for multiplication
    normalized = normalized.replace(/\s*[xX]\s*/g, ' x ');
    
    // Fix: "=" for quantity
    normalized = normalized.replace(/\s*=\s*/g, ' = ');
    
    // Fix: ":" for quantity
    normalized = normalized.replace(/\s*:\s*/g, ' : ');
    
    // Fix: "-" for quantity
    normalized = normalized.replace(/\s*-\s*/g, ' - ');
    
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
        // Split by new lines
        .split(/\n/)
        // Split by commas
        .flatMap(s => s.split(','))
        // Split by semicolons
        .flatMap(s => s.split(';'))
        // Split by "and"
        .flatMap(s => s.split(/\s+and\s+/i))
        // Split by "+"
        .flatMap(s => s.split('+'))
        // Split by "/" (but not part numbers)
        .flatMap(s => {
            // Check if "/" is not inside a part number
            if (s.includes('/') && !s.match(/[A-Z0-9]\/[A-Z0-9]/i)) {
                return s.split('/');
            }
            return [s];
        })
        .map(s => s.trim())
        .filter(s => s.length > 0);
    
    // If only one segment, try to split by numbers + part patterns
    if (segments.length === 1 && segments[0].length > 20) {
        // Look for pattern: "PART123 2 PART456 3"
        const patternMatches = segments[0].match(/\b([A-Z0-9]{8,20})\s*(\d+)\s*(?=[A-Z0-9]{8,20}|$)/gi);
        if (patternMatches && patternMatches.length > 1) {
            // Multiple products in same line without separator
            // Try to split by part number pattern
            const parts = [];
            let remaining = segments[0];
            while (remaining.length > 0) {
                const match = remaining.match(/^.*?\b([A-Z0-9]{8,20})\s*(\d+)\s*/i);
                if (match) {
                    parts.push(match[0].trim());
                    remaining = remaining.substring(match[0].length).trim();
                } else {
                    break;
                }
            }
            if (parts.length > 0) {
                segments = parts;
            }
        }
    }
    
    return segments;
}

// ============================================================
// 🔍 PARSE A SINGLE SEGMENT
// ============================================================

function parseSegment(segment) {
    // Try different patterns in order of priority
    
    // Pattern 1: PART123 = 2 or PART123: 2 or PART123 - 2 or PART123 / 2
    let match = segment.match(/\b([A-Z0-9]{8,20})\s*[=\-:\/]\s*(\d+)\b/);
    if (match) {
        return { part: match[1].toUpperCase(), qty: parseInt(match[2]) };
    }
    
    // Pattern 2: PART123 2 (part then quantity)
    match = segment.match(/\b([A-Z0-9]{8,20})\s+(\d+)\b/);
    if (match) {
        return { part: match[1].toUpperCase(), qty: parseInt(match[2]) };
    }
    
    // Pattern 3: 2 PART123 (quantity then part)
    match = segment.match(/\b(\d+)\s+([A-Z0-9]{8,20})\b/);
    if (match) {
        return { part: match[2].toUpperCase(), qty: parseInt(match[1]) };
    }
    
    // Pattern 4: PART123 x 2 or PART123 X 2
    match = segment.match(/\b([A-Z0-9]{8,20})\s*[xX]\s*(\d+)\b/);
    if (match) {
        return { part: match[1].toUpperCase(), qty: parseInt(match[2]) };
    }
    
    // Pattern 5: 2 x PART123
    match = segment.match(/\b(\d+)\s*[xX]\s*([A-Z0-9]{8,20})\b/);
    if (match) {
        return { part: match[2].toUpperCase(), qty: parseInt(match[1]) };
    }
    
    // Pattern 6: PART123 QTY 2
    match = segment.match(/\b([A-Z0-9]{8,20})\s*QTY\s*(\d+)\b/i);
    if (match) {
        return { part: match[1].toUpperCase(), qty: parseInt(match[2]) };
    }
    
    // Pattern 7: 2 QTY PART123
    match = segment.match(/\b(\d+)\s*QTY\s*([A-Z0-9]{8,20})\b/i);
    if (match) {
        return { part: match[2].toUpperCase(), qty: parseInt(match[1]) };
    }
    
    // Pattern 8: PART123 (no quantity) - handled separately
    match = segment.match(/\b([A-Z0-9]{8,20})\b/);
    if (match) {
        // Check if there's a quantity nearby (within same segment)
        const qtyMatch = segment.match(/\b(\d+)\b/);
        if (qtyMatch && qtyMatch[0] !== match[0]) {
            return { part: match[1].toUpperCase(), qty: parseInt(qtyMatch[0]) };
        }
        return { part: match[1].toUpperCase(), qty: 1 };
    }
    
    return null;
}

// ============================================================
// 🔍 EXTRACT ALL PART NUMBERS
// ============================================================

function extractAllPartNumbers(text) {
    const matches = text.match(/\b([A-Z0-9]{8,20})\b/g);
    if (!matches) return [];
    // Remove duplicates (case-insensitive)
    const unique = new Set(matches.map(m => m.toUpperCase()));
    return Array.from(unique);
}

// ============================================================
// 🔍 FIND QUANTITY NEAR PART
// ============================================================

function findQuantityNearPart(text, part) {
    // Find the position of the part number
    const index = text.toUpperCase().indexOf(part);
    if (index === -1) return null;
    
    // Look around the part number (before and after)
    const before = text.substring(Math.max(0, index - 20), index);
    const after = text.substring(index + part.length, index + part.length + 20);
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
// 🚀 EXPORT
// ============================================================

module.exports = {
    parseOrder,
    normalizeText,
    splitIntoSegments,
    parseSegment,
    extractAllPartNumbers,
    findQuantityNearPart
};
