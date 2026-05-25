function extractItemsFromText(ocrResult) {
    // If we have rows with word coordinates, use column detection
    if (ocrResult.rows && ocrResult.rows.length > 0) {
        return extractFromRows(ocrResult.rows);
    }
    // Fallback to plain text parsing (for PDFs/Excel)
    const text = typeof ocrResult === 'string' ? ocrResult : ocrResult.text;
    const lines = text.split(/\r?\n/);
    return extractFromLines(lines);
}

function extractFromRows(rows) {
    const items = [];
    // Heuristic: find typical part number column and quantity column
    // Collect all word X positions to guess columns
    const allWords = [];
    for (const row of rows) {
        for (const word of row.words) {
            allWords.push({ x: word.bbox.x0, text: word.text });
        }
    }
    // Find clusters of X positions (columns)
    const xPositions = [...new Set(allWords.map(w => Math.round(w.x / 20) * 20))].sort((a,b)=>a-b);
    
    // Part numbers usually contain letters and digits, length > 5
    // Quantities are small numbers (1-999)
    for (const row of rows) {
        // Skip rows that are obviously headers/totals
        const rowText = row.text.toLowerCase();
        if (/(invoice|gst|total|amount|tax|hsn|sac|phone|email|address|page|state)/i.test(rowText)) continue;
        if (rowText.length < 8) continue;
        
        // Find part number candidate
        let part = null;
        let qty = 1;
        for (const word of row.words) {
            const txt = word.text;
            // Part number pattern: at least one letter and one digit, length >= 5
            if (/^(?=.*[A-Z])(?=.*\d)[A-Z0-9]{5,}$/i.test(txt)) {
                part = txt;
                // Look for quantity in the same row, preferably a small number to the right
                for (const w2 of row.words) {
                    const num = parseInt(w2.text);
                    if (!isNaN(num) && num > 0 && num < 1000 && w2.bbox.x0 > word.bbox.x0) {
                        qty = num;
                        break;
                    }
                }
                break;
            }
        }
        if (part) {
            items.push({ partRaw: part, qty: qty });
        }
    }
    
    // Merge duplicates
    const merged = new Map();
    for (const it of items) {
        const norm = normalizePart(it.partRaw);
        if (!norm) continue;
        if (merged.has(norm)) {
            merged.get(norm).qty += it.qty;
        } else {
            merged.set(norm, { partRaw: it.partRaw, qty: it.qty });
        }
    }
    return Array.from(merged.values());
}

function extractFromLines(lines) {
    const items = [];
    const partPattern = /\b(?=.*[A-Z])(?=.*\d)[A-Z0-9]{5,}(?:[-.\/][A-Z0-9]+)*\b/g;
    const ignoreIfContains = /(invoice|gst|total|amount|tax|hsn|sac|mobile|phone|email|bank|address|date|delivery|shipping)/i;
    
    for (let line of lines) {
        line = line.trim();
        if (!line) continue;
        if (line.length < 10) continue;
        if (ignoreIfContains.test(line)) continue;
        
        const partMatches = [...line.matchAll(partPattern)];
        if (partMatches.length === 0) continue;
        
        // Extract quantity
        let qty = 1;
        const qtyPatterns = [
            /(?:qty|quantity|x)\s*(\d+)/i,
            /\b(\d{1,3})\b\s*$/
        ];
        for (const pat of qtyPatterns) {
            const m = line.match(pat);
            if (m) { qty = parseInt(m[1]) || 1; break; }
        }
        
        for (const m of partMatches) {
            let part = m[0];
            // ignore dates, long numbers
            if (/^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$/.test(part)) continue;
            if (/^\d{10,}$/.test(part)) continue;
            if (/^\d{1,3}$/.test(part)) continue;
            const norm = normalizePart(part);
            if (!norm || norm.length < 4) continue;
            items.push({ partRaw: part, qty: qty });
        }
    }
    // Merge duplicates
    const merged = new Map();
    for (const it of items) {
        const norm = normalizePart(it.partRaw);
        if (!norm) continue;
        if (merged.has(norm)) {
            merged.get(norm).qty += it.qty;
        } else {
            merged.set(norm, { partRaw: it.partRaw, qty: it.qty });
        }
    }
    return Array.from(merged.values());
        }
