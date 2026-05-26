function extractItemsFromText(ocrResult) {

    const text =
        typeof ocrResult === 'string'
            ? ocrResult
            : (ocrResult.text || '');

    console.log("OCR TEXT:", text);

    if (!text)
        return [];

    // ==================================================
    // CLEAN TEXT
    // ==================================================

    const cleaned =
        text
        .toUpperCase()
        .replace(/\r/g, '\n')
        .replace(/[|]/g, ' ')
        .replace(/\s+/g, ' ');

    console.log("CLEANED:", cleaned);

    // ==================================================
    // TOKENIZE
    // ==================================================

    const tokens =
        cleaned.match(/[A-Z0-9\-\/\.]{4,40}/g) || [];

    console.log("TOKENS:", tokens);

    const items = [];

    for (let i = 0; i < tokens.length; i++) {

        let token = tokens[i];

        if (!token)
            continue;

        token = token.trim();

        // ==============================================
        // OCR CORRECTION
        // ==============================================

        token = token
            .replace(/O/g, '0')
            .replace(/I/g, '1');

        // ==============================================
        // BASIC FILTERS
        // ==============================================

        if (token.length < 5)
            continue;

        // Must contain BOTH letter and number

        if (!/[A-Z]/.test(token))
            continue;

        if (!/\d/.test(token))
            continue;

        // ==============================================
        // REMOVE PRICE VALUES
        // ==============================================

        // Reject decimal prices

        if (/^\d+\.\d+$/.test(token))
            continue;

        // Reject pure numeric

        if (/^\d+$/.test(token))
            continue;

        // Reject date

        if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(token))
            continue;

        // Reject GST/Invoice words

        if (
            /GST|CGST|SGST|TOTAL|AMOUNT|HSN|TAX|RATE|QTY|PCS|NOS|INVOICE/i.test(token)
        )
            continue;

        // ==============================================
        // MUST LOOK LIKE REAL PART NUMBER
        // ==============================================

        // Good examples:
        // 0313AAB03061N
        // MVS0305D020021N
        // 426244700-0500

        const looksLikePart =
            (
                /[A-Z]/.test(token) &&
                /\d/.test(token)
            ) ||
            (
                /\d{4,}[-\/]\d+/.test(token)
            );

        if (!looksLikePart)
            continue;

        // ==============================================
        // QUANTITY DETECTION
        // ==============================================

        let qty = 1;

        const next =
            tokens[i + 1] || '';

        const next2 =
            tokens[i + 2] || '';

        if (/^\d{1,3}$/.test(next)) {

            qty = parseInt(next);

        }
        else if (/^\d{1,3}$/.test(next2)) {

            qty = parseInt(next2);
        }

        // Prevent impossible qty

        if (qty > 500)
            qty = 1;

        items.push({
            partRaw: token,
            qty: qty
        });
    }

    // ==================================================
    // REMOVE DUPLICATES
    // ==================================================

    const merged = new Map();

    for (const item of items) {

        const key = item.partRaw;

        if (merged.has(key)) {

            merged.get(key).qty += item.qty;

        } else {

            merged.set(key, item);
        }
    }

    const result =
        Array.from(merged.values());

    console.log("FINAL ITEMS:", result);

    return result;
    }
