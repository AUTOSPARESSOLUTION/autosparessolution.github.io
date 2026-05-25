function extractItemsFromText(ocrResult) {
    // If we have rows with word coordinates, use enhanced table extraction
    if (ocrResult.rows && ocrResult.rows.length > 0) {
        return extractFromRows(ocrResult.rows);
    }
    // Otherwise, use your original, proven line‑based parser
    const text = typeof ocrResult === 'string' ? ocrResult : ocrResult.text;
    const lines = text.split(/\r?\n/);
    return extractFromLines(lines);
}

// ========== YOUR ORIGINAL LINE PARSER (unchanged) ==========
function extractFromLines(lines) {
    const items = [];
    const partPattern = /\b(?=.*[A-Z])(?=.*\d)[A-Z0-9]{5,}(?:[-.\/][A-Z0-9]+)*\b/g;
    const ignoreIfContains = /(invoice|gst|cgst|sgst|total|subtotal|amount|tax|hsn|sac|mobile|phone|email|bank|address|date|delivery|shipping|buyer|seller|dispatch|terms|payment|ack|page|state|code|gstin)/i;
    const minLineLength = 10;
    
    for (let rawLine of lines) {
        let line = rawLine.trim();
        if (!line) continue;
        if (line.length < minLineLength) continue;
        if (ignoreIfContains.test(line)) continue;
        
        const partMatches = [...line.matchAll(partPattern)];
        if (partMatches.length === 0) continue;
        
        let qty = 1;
        const qtyPatterns = [
            /(?:qty|quantity|qnty|pcs|nos|x)\s*[:\-]?\s*(\d+)/i,
            /(\d+)\s*(?:pcs|nos|qty)/i,
            /\b(\d{1,3})\b\s*$/,
            /x(\d{1,3})\b/
        ];
        for (const pat of qtyPatterns) {
            const match = line.match(pat);
            if (match) {
                qty = parseInt(match[1]) || 1;
                break;
            }
        }
        
        for (const m of partMatches) {
            let part = m[0];
            if (/^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$/.test(part)) continue;
            if (/^\d{10,}$/.test(part)) continue;
            if (/^\d{1,3}$/.test(part)) continue;
            const normalized = normalizePart(part);
            if (!normalized || normalized.length < 4) continue;
            items.push({ partRaw: part, qty: qty });
        }
    }
    
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
    console.log("Parser extracted items (line mode):", Array.from(merged.values()));
    return Array.from(merged.values());
}

// ========== NEW ROW‑BASED EXTRACTOR (for images with word coordinates) ==========
function extractFromRows(rows) {
    const items = [];
    const partPattern = /^(?=.*[A-Z])(?=.*\d)[A-Z0-9]{5,}$/i;
    
    for (const row of rows) {
        const rowText = row.text.toLowerCase();
        if (/(invoice|gst|total|amount|tax|hsn|sac|phone|email|address|page|state|cgst|sgst|round|chargeable)/i.test(rowText)) continue;
        if (rowText.length < 8) continue;
        
        let part = null;
        let qty = 1;
        let partIndex = -1;
        for (let i = 0; i < row.words.length; i++) {
            const word = row.words[i];
            const txt = word.text.trim();
            if (partPattern.test(txt)) {
                part = txt;
                partIndex = i;
                break;
            }
        }
        if (!part) continue;
        
        // Look for quantity in the same row, preferably after the part number
        for (let i = 0; i < row.words.length; i++) {
            const word = row.words[i];
            const num = parseInt(word.text);
            if (!isNaN(num) && num > 0 && num < 10000) {
                if (i > partIndex) {
                    qty = num;
                    break;
                } else if (qty === 1 && num < 1000) {
                    qty = num;
                }
            }
        }
        items.push({ partRaw: part, qty: qty });
    }
    
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
    console.log("Parser extracted items (row mode):", Array.from(merged.values()));
    return Array.from(merged.values());
}
