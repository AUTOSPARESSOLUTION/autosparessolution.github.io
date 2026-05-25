function extractItemsFromText(ocrResult) {
    const text = typeof ocrResult === 'string' ? ocrResult : ocrResult.text;
    const lines = text.split(/\r?\n/);
    const items = [];
    
    // Pattern for spare part numbers (alphanumeric, dashes, dots, slashes)
    // Adjust this based on your actual part number format
    const partPattern = /\b([A-Z0-9]{3,}(?:[-.\/][A-Z0-9]+)*)\b/g;
    
    // Words that indicate a row is NOT an order line
    const ignoreKeywords = /invoice|gst|cgst|sgst|total|subtotal|amount|tax|hsn|sac|mobile|phone|email|bank|address|date|delivery|shipping|buyer|seller|dispatch|terms|payment|ack/i;
    
    for (let rawLine of lines) {
        let line = rawLine.trim();
        if (!line) continue;
        
        // Skip obvious non‑order lines
        if (ignoreKeywords.test(line)) continue;
        // Skip lines that are too short (likely noise)
        if (line.length < 5 || line.length > 200) continue;
        
        // Find all possible part numbers in this line
        const partMatches = [...line.matchAll(partPattern)];
        if (partMatches.length === 0) continue;
        
        // Extract quantity: look for a standalone number (1-999) at the end of the line
        let qty = 1;
        // First, try to find "Qty" pattern
        const qtyPatterns = [
            /(?:qty|quantity|qnty|pcs|nos|x)\s*[:\-]?\s*(\d+)/i,
            /(\d+)\s*(?:pcs|nos|qty)/i,
            /\b(\d{1,3})\b\s*$/   // number at the very end
        ];
        for (const pat of qtyPatterns) {
            const match = line.match(pat);
            if (match) {
                qty = parseInt(match[1]) || 1;
                break;
            }
        }
        
        // For each candidate part number, apply additional filters
        for (const match of partMatches) {
            let part = match[1];
            // Ignore dates (e.g., 14-05-26)
            if (/^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$/.test(part)) continue;
            // Ignore long numeric only (GSTIN, invoice numbers)
            if (/^\d{12,}$/.test(part)) continue;
            // Ignore pure numbers shorter than 4 (could be row numbers or prices)
            if (/^\d{1,3}$/.test(part)) continue;
            // Normalise and add
            const normalized = normalizePart(part);
            if (!normalized || normalized.length < 4) continue;
            items.push({ partRaw: part, qty });
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
    return Array.from(merged.values());
                }
