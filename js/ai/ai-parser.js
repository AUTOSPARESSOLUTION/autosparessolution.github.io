// ai-parser.js – hybrid column + row‑wide scanning for part numbers
function extractItemsFromText(ocrResult) {
    if (ocrResult.rows && ocrResult.rows.length > 0) {
        return extractFromRowsWithFallback(ocrResult.rows);
    }
    const text = typeof ocrResult === 'string' ? ocrResult : ocrResult.text;
    const lines = text.split(/\r?\n/);
    return extractFromLines(lines);
}

// ========== PATTERN FOR MAHINDRA PART NUMBERS ==========
// Numeric: 5‑13 digits
// Alphanumeric: common patterns (4 digits + 3 letters + 4 digits + letter, etc.)
// Also matches standalone part numbers that may be preceded/followed by spaces or punctuation
const PART_PATTERN_STRICT = /\b(?:\d{5,13}|\d{4}[A-Z]{3}\d{4}[A-Z]|\d{4}[A-Z]{2}\d{4}[A-Z]|\d{3}[A-Z]{3}\d{4})\b/i;
const PART_PATTERN_GENERIC = /\b(?=.*[A-Z])(?=.*\d)[A-Z0-9]{5,}\b/i;

// ========== COLUMN + ROW‑WIDE HYBRID EXTRACTOR ==========
function extractFromRowsWithFallback(rows) {
    // Try column‑based extraction first (look for a dedicated "Part No" column)
    let columnResults = tryExtractFromPartColumn(rows);
    if (columnResults.length > 0) {
        console.log("Column‑based extraction found", columnResults.length, "items");
        return columnResults;
    }
    
    // If no part numbers found in dedicated column, fall back to scanning entire rows
    console.log("No part numbers found in dedicated column – scanning all rows for Mahindra patterns");
    return extractFromRowsGeneric(rows);
}

// ---------- Column‑based extraction (looks for header "Part No" and uses its X range) ----------
function tryExtractFromPartColumn(rows) {
    // Find header row containing "part", "item", "product", etc.
    let headerRow = null;
    let partColMinX = null, partColMaxX = null;
    let qtyColMinX = null, qtyColMaxX = null;
    
    for (const row of rows) {
        const rowText = row.text.toLowerCase();
        if (rowText.includes('part') || rowText.includes('item') || rowText.includes('product') || rowText.includes('description')) {
            headerRow = row;
            break;
        }
    }
    
    if (!headerRow) {
        console.log("No header row with 'part' found – cannot use column extraction");
        return [];
    }
    
    // Cluster words by X position to find columns
    const clusters = [];
    for (const word of headerRow.words) {
        const centerX = (word.bbox.x0 + word.bbox.x1) / 2;
        let found = false;
        for (const cluster of clusters) {
            if (Math.abs(cluster.centerX - centerX) < 30) {
                cluster.words.push(word);
                cluster.centerX = (cluster.centerX + centerX) / 2;
                found = true;
                break;
            }
        }
        if (!found) {
            clusters.push({ centerX: centerX, words: [word] });
        }
    }
    
    // Identify part column and qty column
    for (const cluster of clusters) {
        const clusterText = cluster.words.map(w => w.text.toLowerCase()).join(' ');
        if (clusterText.includes('part') || clusterText.includes('item') || clusterText.includes('product')) {
            partColMinX = Math.min(...cluster.words.map(w => w.bbox.x0));
            partColMaxX = Math.max(...cluster.words.map(w => w.bbox.x1));
        }
        if (clusterText.includes('qty') || clusterText.includes('quantity') || clusterText.includes('pcs')) {
            qtyColMinX = Math.min(...cluster.words.map(w => w.bbox.x0));
            qtyColMaxX = Math.max(...cluster.words.map(w => w.bbox.x1));
        }
    }
    
    if (!partColMinX) return [];
    
    const items = [];
    for (const row of rows) {
        const rowText = row.text.toLowerCase();
        if (/(invoice|gst|total|amount|tax|hsn|sac|phone|email|address|page|state|cgst|sgst|round|chargeable)/i.test(rowText)) continue;
        if (rowText.length < 8) continue;
        
        // Extract word that lies inside part column and matches part pattern
        let part = null;
        for (const word of row.words) {
            const wordCenterX = (word.bbox.x0 + word.bbox.x1) / 2;
            if (wordCenterX >= partColMinX && wordCenterX <= partColMaxX) {
                const txt = word.text.trim();
                if (PART_PATTERN_STRICT.test(txt) || PART_PATTERN_GENERIC.test(txt)) {
                    part = txt;
                    break;
                }
            }
        }
        if (!part) continue;
        
        // Extract quantity
        let qty = 1;
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
            // No qty column – look for a number after the part word
            let partIndex = row.words.findIndex(w => w.text === part);
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
    return Array.from(merged.values());
}

// ---------- Row‑wide scanner (used when no dedicated part column or no matches found) ----------
function extractFromRowsGeneric(rows) {
    const items = [];
    const ignoreKeywords = /(invoice|gst|cgst|sgst|total|amount|tax|hsn|sac|phone|email|address|page|state|round|chargeable)/i;
    
    for (const row of rows) {
        const rowText = row.text.toLowerCase();
        if (ignoreKeywords.test(rowText)) continue;
        if (rowText.length < 8) continue;
        
        // Scan each word in the row for a part number pattern
        let part = null;
        let qty = 1;
        let partIndex = -1;
        
        for (let i = 0; i < row.words.length; i++) {
            const word = row.words[i];
            const txt = word.text.trim();
            // Accept strict or generic pattern, but reject pure numbers less than 4 digits (likely serials)
            if ((PART_PATTERN_STRICT.test(txt) || PART_PATTERN_GENERIC.test(txt)) && !(/^\d{1,3}$/.test(txt))) {
                part = txt;
                partIndex = i;
                break;
            }
        }
        if (!part) continue;
        
        // Find quantity in the same row, preferably after the part number
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
    console.log("Row‑wide scan extracted:", Array.from(merged.values()));
    return Array.from(merged.values());
}

// ---------- Fallback line parser for PDF text layer and Excel ----------
function extractFromLines(lines) {
    const items = [];
    const ignoreIfContains = /(invoice|gst|cgst|sgst|total|subtotal|amount|tax|hsn|sac|mobile|phone|email|bank|address|date|delivery|shipping|buyer|seller|dispatch|terms|payment|ack|page|state|code|gstin)/i;
    const minLineLength = 10;
    
    for (let rawLine of lines) {
        let line = rawLine.trim();
        if (!line) continue;
        if (line.length < minLineLength) continue;
        if (ignoreIfContains.test(line)) continue;
        
        const partMatches = [...line.matchAll(PART_PATTERN_STRICT)];
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
            // Ignore dates and long numbers
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
