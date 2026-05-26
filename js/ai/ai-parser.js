function extractItemsFromText(ocrResult) {

    const text = typeof ocrResult === 'string'
        ? ocrResult
        : (ocrResult.text || '');

    // =========================
    // OCR CLEANING
    // =========================

    let cleaned = text
        .replace(/\r/g, '')
        .replace(/[ \t]+/g, ' ')
        .replace(/Pcs\./gi, 'PCS')
        .replace(/Pc\b/gi, 'PC')
        .replace(/\n{2,}/g, '\n');

    let rawLines = cleaned.split('\n')
        .map(l => l.trim())
        .filter(Boolean);

    // =========================
    // MERGE BROKEN LINES
    // =========================

    const lines = [];

    for (let i = 0; i < rawLines.length; i++) {

        let line = rawLines[i];

        // If next line looks like continuation
        if (
            i + 1 < rawLines.length &&
            !/\b(?:PC|PCS|NOS)\b/i.test(line) &&
            !/^\d+\s+[A-Z0-9]/.test(rawLines[i + 1])
        ) {
            line += ' ' + rawLines[i + 1];
            i++;
        }

        lines.push(line);
    }

    // =========================
    // IGNORE METADATA
    // =========================

    const ignorePattern =
        /(invoice|gstin|cgst|sgst|taxable|total|amount|bank|declaration|jurisdiction|authorised|output|state|email|phone|mobile|ack|irn|terms)/i;

    const items = [];

    // =========================
    // MAIN TABLE ROW PARSER
    // =========================

    for (const line of lines) {

        if (ignorePattern.test(line))
            continue;

        // Must contain GST and quantity
        if (
            !/\b\d+\s*%\b/.test(line) ||
            !/\b\d+\s*(PC|PCS|NOS)\b/i.test(line)
        ) {
            continue;
        }

        // Split row into tokens
        const tokens = line.split(/\s+/);

        let part = null;
        let qty = 1;

        // =========================
        // FIND PART NUMBER
        // =========================

        for (let i = 0; i < tokens.length; i++) {

            let t = tokens[i].toUpperCase();

            // Remove punctuation
            t = t.replace(/[.,]/g, '');

            // Skip serial number
            if (/^\d{1,3}$/.test(t))
                continue;

            // Skip HSN codes
            if (/^\d{8}$/.test(t))
                continue;

            // Skip percentages
            if (/^\d+%?$/.test(t))
                continue;

            // VALID PART RULES

            const hasLetter = /[A-Z]/.test(t);
            const hasDigit = /\d/.test(t);

            // Alphanumeric part
            if (
                hasLetter &&
                hasDigit &&
                t.length >= 5
            ) {
                part = t;
                break;
            }

            // Numeric automotive part
            if (
                /^\d{5,8}$/.test(t)
            ) {
                part = t;
                break;
            }
        }

        // =========================
        // FIND QUANTITY
        // =========================

        const qtyMatch = line.match(
            /\b(\d{1,3})\s*(PC|PCS|NOS)\b/i
        );

        if (qtyMatch) {
            qty = parseInt(qtyMatch[1]) || 1;
        }

        // =========================
        // SAVE
        // =========================

        if (part) {

            items.push({
                partRaw: part,
                qty: qty
            });
        }
    }

    // =========================
    // MERGE DUPLICATES
    // =========================

    const merged = new Map();

    for (const item of items) {

        const key = normalizePart(item.partRaw);

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

    const result = Array.from(merged.values());

    console.log(
        "FINAL PARSED ITEMS:",
        result
    );

    return result;
                }
