function extractItemsFromText(ocrResult) {

    const text = typeof ocrResult === 'string'
        ? ocrResult
        : (ocrResult?.text || '');

    if (!text || text.length < 5) {

        console.warn("⚠️ OCR text empty");

        return [];
    }

    console.log("📄 RAW OCR TEXT:\n", text);

    // =====================================================
    // CLEAN TEXT
    // =====================================================

    let cleaned = text
        .toUpperCase()
        .replace(/\r/g, ' ')
        .replace(/\n/g, ' ')
        .replace(/[|]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    console.log("📄 CLEANED OCR:\n", cleaned);

    const items = [];

    // =====================================================
    // GLOBAL PART PATTERN
    // =====================================================

    const partPattern =
        /\b[A-Z0-9\-\/\.]{5,25}\b/g;

    const matches =
        [...cleaned.matchAll(partPattern)];

    console.log("🔍 RAW MATCHES:", matches);

    for (const m of matches) {

        let part = m[0];

        if (!part)
            continue;

        part = normalizePart(part);

        // =================================================
        // SKIP BAD TOKENS
        // =================================================

        // Skip small numbers
        if (/^\d{1,4}$/.test(part))
            continue;

        // Skip very long numbers
        if (/^\d{10,}$/.test(part))
            continue;

        // Skip HSN
        if (/^\d{8}$/.test(part))
            continue;

        // Skip invoice words
        if (
            /^(TOTAL|CGST|SGST|IGST|STATE|TAX|AMOUNT|QTY|RATE|HSN|GST|INV)$/i.test(part)
        ) {
            continue;
        }

        // Must contain digit
        if (!/\d/.test(part))
            continue;

        // =================================================
        // FIND NEARBY QUANTITY
        // =================================================

        let qty = 1;

        const start =
            Math.max(0, m.index - 30);

        const end =
            Math.min(cleaned.length, m.index + 50);

        const nearby =
            cleaned.substring(start, end);

        console.log(
            "🔎 Nearby text:",
            nearby
        );

        const qtyMatch =
            nearby.match(
                /(\d{1,3})\s*(PCS?|NOS?|QTY|PC)/i
            );

        if (qtyMatch) {

            qty =
                parseInt(qtyMatch[1]) || 1;
        }

        // =================================================
        // SAVE
        // =================================================

        items.push({
            partRaw: part,
            qty: qty
        });
    }

    // =====================================================
    // MERGE DUPLICATES
    // =====================================================

    const merged = new Map();

    for (const item of items) {

        const key =
            normalizePart(item.partRaw);

        if (!key)
            continue;

        if (merged.has(key)) {

            merged.get(key).qty += item.qty;

        } else {

            merged.set(key, {
                partRaw: item.partRaw,
                qty: item.qty
            });
        }
    }

    const result =
        Array.from(merged.values());

    console.log(
        "✅ FINAL ITEMS:",
        result
    );

    return result;
    }
