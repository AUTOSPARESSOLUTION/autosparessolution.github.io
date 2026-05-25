// ai-parser.js – intelligent line‑scoring parser
function extractItemsFromText(text) {
    const lines = text.split(/\r?\n/);
    const items = [];
    
    // Part number pattern (alphanumeric, dots, dashes, slashes, at least 4 chars)
    const partPattern = /\b([A-Z0-9]{4,}(?:[-.\/][A-Z0-9]+)*)\b/g;
    
    // Words that indicate an entire line should be ignored (invoice metadata)
    const noiseKeywords = /invoice|gst|cgst|sgst|total|subtotal|amount|tax|hsn|sac|mobile|phone|email|bank|ifsc|address|date|delivery|shipping|bill to|ship to|terms|payment|thank you/i;
    
    for (let rawLine of lines) {
        let line = rawLine.trim();
        if (!line) continue;
        
        // 1. Skip lines that look like invoice metadata
        if (noiseKeywords.test(line)) continue;
        
        // 2. Skip lines that are too short or too long (likely noise)
        if (line.length < 5 || line.length > 200) continue;
        
        // 3. Find all possible part numbers in the line
        const partMatches = [...line.matchAll(partPattern)];
        if (!partMatches.length) continue;
        
        // 4. Detect quantity using multiple patterns
        let qty = 1;
        const qtyPatterns = [
            /(?:qty|quantity|qnty|pcs|nos|x)\s*[:\-]?\s*(\d+)/i,      // "Qty 5", "x2"
            /(\d+)\s*(?:pcs|nos|qty|quantity)/i,                       // "5 pcs"
            /\b(\d{1,3})\b\s*$/                                        // ends with number
        ];
        for (const pattern of qtyPatterns) {
            const qMatch = line.match(pattern);
            if (qMatch) {
                qty = parseInt(qMatch[1]) || 1;
                break;
            }
        }
        
        // 5. For each candidate part number, filter obvious noise
        for (const m of partMatches) {
            let part = m[1];
            // Ignore dates (DD-MM-YYYY, DD/MM/YY, etc.)
            if (/^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$/.test(part)) continue;
            // Ignore long numeric strings (GSTIN, invoice numbers, phone numbers)
            if (/^\d{12,}$/.test(part)) continue;
            // Ignore pure numbers shorter than 4 digits (could be row numbers or prices)
            if (/^\d{1,3}$/.test(part)) continue;
            
            // Apply normalisation (removes special characters, uppercase)
            const normalized = normalizePart(part);
            if (!normalized || normalized.length < 4) continue;
            
            items.push({ partRaw: part, qty });
        }
    }
    
    // 6. Merge duplicate part numbers (same part, sum quantities)
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
