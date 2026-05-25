// ai-parser.js – row‑based scoring, SKU shape, intelligent quantity
function extractItemsFromText(ocrResult) {
    const text = typeof ocrResult === 'string' ? ocrResult : ocrResult.text;
    const lines = text.split(/\r?\n/);
    const items = [];
    
    // SKU pattern: at least one letter and one number, 3+ chars
    const partPattern = /\b(?=.*[A-Z])(?=.*\d)[A-Z0-9]{3,}(?:[-.\/][A-Z0-9]+)*\b/g;
    
    // Negative signals (invoice metadata)
    const negativeSignals = /invoice|gst|cgst|sgst|total|subtotal|amount|tax|hsn|sac|mobile|phone|email|bank|ifsc|address|date|delivery|shipping|bill to|ship to|terms|payment|thank you/i;
    
    // Helper: extract quantity from the end of a line or after part number
    function extractQtyFromLine(line) {
        const nums = [...line.matchAll(/\b(\d{1,3})\b/g)]
            .map(m => parseInt(m[1]))
            .filter(n => n > 0 && n < 1000);
        if (!nums.length) return 1;
        // Usually the last small number is quantity
        return nums[nums.length - 1];
    }
    
    for (let rawLine of lines) {
        let line = rawLine.trim();
        if (!line) continue;
        
        // Compute line score
        let score = 0;
        
        // Penalise obvious metadata lines
        if (negativeSignals.test(line)) {
            score -= 80;
        }
        // Penalise very long or very short lines
        if (line.length > 150 || line.length < 6) score -= 20;
        // Penalise lines containing currency symbol
        if (/[₹$]/.test(line)) score -= 40;
        // Penalise lines with date patterns
        if (/\d{1,2}[-/]\d{1,2}[-/]\d{2,4}/.test(line)) score -= 60;
        
        // Find SKU-shaped tokens
        const partMatches = [...line.matchAll(partPattern)];
        if (partMatches.length === 0) continue;
        
        // Boost score for each potential part number
        score += partMatches.length * 40;
        
        // Extract quantity using row‑based heuristics
        let qty = extractQtyFromLine(line);
        if (qty > 1) score += 20;
        
        // Only accept lines with a positive score (likely order rows)
        if (score < 20) continue;
        
        for (const m of partMatches) {
            let part = m[0];
            // Filter obvious false positives
            if (/^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$/.test(part)) continue;
            if (/^\d{12,}$/.test(part)) continue;
            if (/^\d{1,3}$/.test(part)) continue;
            
            const normalized = normalizePart(part);
            if (!normalized || normalized.length < 4) continue;
            items.push({ partRaw: part, qty });
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
