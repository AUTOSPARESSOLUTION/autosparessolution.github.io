// ai-parser.js – column‑aware extraction using word coordinates
function extractItemsFromText(ocrResult) {
    // If we have rows with word coordinates and at least one row, try column detection
    if (ocrResult.rows && ocrResult.rows.length > 0) {
        return extractFromRowsWithColumns(ocrResult.rows);
    }
    // Fallback to original line‑based parser (for PDF text layer, Excel, etc.)
    const text = typeof ocrResult === 'string' ? ocrResult : ocrResult.text;
    const lines = text.split(/\r?\n/);
    return extractFromLines(lines);
}

// ========== COLUMN‑AWARE EXTRACTION (uses X coordinates) ==========
function extractFromRowsWithColumns(rows) {
    // First, identify the header row that contains "part" (or similar)
    let headerRow = null;
    let partColMinX = null, partColMaxX = null;
    let qtyColMinX = null, qtyColMaxX = null;
    
    for (const row of rows) {
        const rowText = row.text.toLowerCase();
        // Look for keywords that indicate the part number column
        if (rowText.includes('part') || rowText.includes('item') || rowText.includes('description') || rowText.includes('product')) {
            headerRow = row;
            break;
        }
    }
    
    if (headerRow) {
        // Determine column boundaries from header words
        // Group words by approximate X position (with tolerance 20px)
        const clusters = [];
        for (const word of headerRow.words) {
            const centerX = (word.bbox.x0 + word.bbox.x1) / 2;
            let found = false;
            for (const cluster of clusters) {
                if (Math.abs(cluster.centerX - centerX) < 30) {
                    cluster.words.push(word);
                    cluster.centerX = (cluster.centerX + centerX) / 2; // average
                    found = true;
                    break;
                }
            }
            if (!found) {
                clusters.push({ centerX: centerX, words: [word] });
            }
        }
        // Now find which cluster contains "part" or "qty"
        for (const cluster of clusters) {
            const clusterText = cluster.words.map(w => w.text.toLowerCase()).join(' ');
            if (clusterText.includes('part') || clusterText.includes('item') || clusterText.includes('product')) {
                // Get min/max X of this cluster
                const minX = Math.min(...cluster.words.map(w => w.bbox.x0));
                const maxX = Math.max(...cluster.words.map(w => w.bbox.x1));
                partColMinX = minX;
                partColMaxX = maxX;
            }
            if (clusterText.includes('qty') || clusterText.includes('quantity') || clusterText.includes('pcs')) {
                const minX = Math.min(...cluster.words.map(w => w.bbox.x0));
                const maxX = Math.max(...cluster.words.map(w => w.bbox.x1));
                qtyColMinX = minX;
                qtyColMaxX = maxX;
            }
        }
    }
    
    // If we couldn't detect columns, fallback to row‑based parsing without column filtering
    if (!partColMinX) {
        console.log("No part column detected, falling back to generic row parser");
        return extractFromRowsGeneric(rows);
    }
    
    console.log(`Part column X range: ${partColMinX} - ${partColMaxX}`);
    if (qtyColMinX) console.log(`Qty column X range: ${qtyColMinX} - ${qtyColMaxX}`);
    
    const items = [];
    const partPattern = /^(?=.*[A-Z])(?=.*\d)[A-Z0-9]{5,}$/i;
    
    for (const row of rows) {
        // Skip obvious header/footer rows
        const rowText = row.text.toLowerCase();
        if (/(invoice|gst|total|amount|tax|hsn|sac|phone|email|address|page|state|cgst|sgst|round|chargeable)/i.test(rowText)) continue;
        if (rowText.length < 8) continue;
        
        // Find the word that lies inside the part column X range and matches part pattern
        let part = null;
        let qty = 1;
        
        for (const word of row.words) {
            const wordCenterX = (word.bbox.x0 + word.bbox.x1) / 2;
            // Check if this word is inside the part column
            if (wordCenterX >= partColMinX && wordCenterX <= partColMaxX) {
                const txt = word.text.trim();
                if (partPattern.test(txt)) {
                    part = txt;
                    break;
                }
            }
        }
        if (!part) continue;
        
        // If qty column was detected, look there for quantity
        if (qtyColMinX && qtyColMaxX) {
            for (const word of row.words) {
                const wordCenterX = (word.bbox.x0 + word.bbox.x1) / 2;
                if (wordCenterX >= qtyColMinX && wordCenterX <= qtyColMaxX) {
                    const num = parseInt(word.text);
                    if (!isNaN(num) && num > 0 && num < 10000) {
                        qty = num;
                        break;
                    }
                }
            }
        } else {
            // Fallback: look for any number in the row (preferably after the part word)
            let partIndex = -1;
            for (let i = 0; i < row.words.length; i++) {
                if (row.words[i].text === part) partIndex = i;
            }
            for (let i = partIndex + 1; i < row.words.length; i++) {
                const num = parseInt(row.words[i].text);
                if (!isNaN(num) && num > 0 && num < 10000) {
                    qty = num;
                    break;
                }
            }
        }
        
        items.push({ partRaw: part, qty: qty });
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
    console.log("Column‑aware parser extracted:", Array.from(merged.values()));
    return Array.from(merged.values());
}

// ========== GENERIC ROW PARSER (when column detection fails) ==========
function extractFromRowsGeneric(rows) {
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
            const txt = row.words[i].text.trim();
            if (partPattern.test(txt)) {
                part = txt;
                partIndex = i;
                break;
            }
        }
        if (!part) continue;
        
        // Quantity detection
        for (let i = 0; i < row.words.length; i++) {
            const num = parseInt(row.words[i].text);
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
    return Array.from(merged.values());
}

// ========== ORIGINAL LINE PARSER (for text‑only input) ==========
function extractFromLines(lines) {
    const items = [];
    const partPattern = /\b(?:\d{5,13}|\d{4}[A-Z]{3}\d{4}[A-Z]|\d{4}[A-Z]{2}\d{4}[A-Z]|\d{3}[A-Z]{3}\d{4})\b/i;
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
    console.log("Line parser extracted:", Array.from(merged.values()));
    return Array.from(merged.values());
        }
