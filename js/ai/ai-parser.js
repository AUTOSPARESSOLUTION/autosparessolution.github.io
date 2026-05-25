// ai-parser.js – simple, stable version (used previously and worked)
function extractItemsFromText(ocrResult) {
    // Support both string and object from OCR
    const text = typeof ocrResult === 'string' ? ocrResult : (ocrResult.text || '');
    const lines = text.split(/\r?\n/);
    const items = [];
    
    // Mahindra part number patterns (numeric & alphanumeric)
    const partPattern = /\b(?:\d{5,13}|\d{4}[A-Z]{3}\d{4}[A-Z]|\d{4}[A-Z]{2}\d{4}[A-Z]|\d{3}[A-Z]{3}\d{4})\b/gi;
    
    // Words that indicate a line is NOT an order line (invoice metadata)
    const ignoreIfContains = /(invoice|gst|cgst|sgst|total|subtotal|amount|tax|hsn|sac|mobile|phone|email|bank|address|date|delivery|shipping|buyer|seller|dispatch|terms|payment|ack|page|state|code|gstin)/i;
    const minLineLength = 10;
    
    for (let rawLine of lines) {
        let line = rawLine.trim();
        if (!line) continue;
        if (line.length < minLineLength) continue;
        if (ignoreIfContains.test(line)) continue;
        
        const partMatches = [...line.matchAll(partPattern)];
        if (partMatches.length === 0) continue;
        
        // Extract quantity (various patterns)
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
    
    // Merge duplicates (same part, sum quantities)
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
    console.log("Parser extracted items:", Array.from(merged.values()));
    return Array.from(merged.values());
        }
