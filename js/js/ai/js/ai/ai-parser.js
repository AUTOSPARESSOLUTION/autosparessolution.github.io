function extractItemsFromText(text) {
    const lines = text.split(/\r?\n/);
    const items = [];
    const partRegex = /([A-Z0-9][A-Z0-9\-_\.]{4,20})/gi;
    for (const line of lines) {
        let qty = 1;
        const qtyMatch = line.match(/(?:qty|quantity|x)\s*(\d+)|(\d+)\s*(?:pcs|nos|qty)/i);
        if (qtyMatch) {
            qty = parseInt(qtyMatch[1] || qtyMatch[2]) || 1;
        }
        const parts = [...line.matchAll(partRegex)].map(m => m[1]);
        for (const part of parts) {
            if (!/[A-Z]/i.test(part)) continue;
            const normalized = normalizePart(part);
            if (normalized.length < 4) continue;
            items.push({ partRaw: part.trim(), qty });
        }
    }
    const merged = new Map();
    for (const it of items) {
        const norm = normalizePart(it.partRaw);
        if (merged.has(norm)) {
            merged.get(norm).qty += it.qty;
        } else {
            merged.set(norm, { partRaw: it.partRaw, qty: it.qty });
        }
    }
    return Array.from(merged.values());
    }
