function extractItemsFromText(ocrResult) {

    const text =
        typeof ocrResult === 'string'
            ? ocrResult
            : (ocrResult.text || '');

    console.log("OCR TEXT:", text);

    if (!text)
        return [];

    const cleaned =
        text
        .toUpperCase()
        .replace(/\r/g, '\n')
        .replace(/[|]/g, ' ')
        .replace(/\s+/g, ' ');

    const tokens =
        cleaned.match(/[A-Z0-9\-\/\.]{4,30}/g) || [];

    console.log("TOKENS:", tokens);

    const items = [];

    for (let i = 0; i < tokens.length; i++) {

        let token = tokens[i];

        if (!token)
            continue;

        token =
            token
            .replace(/O/g, '0')
            .replace(/I/g, '1');

        if (
            token.length < 4
        )
            continue;

        if (
            !/\d/.test(token)
        )
            continue;

        if (
            /GST|CGST|SGST|TOTAL|AMOUNT|HSN|TAX/i.test(token)
        )
            continue;

        if (
            /^\d{10,}$/.test(token)
        )
            continue;

        let qty = 1;

        const next =
            tokens[i + 1] || '';

        const next2 =
            tokens[i + 2] || '';

        if (/^\d{1,3}$/.test(next)) {

            qty = parseInt(next);

        } else if (/^\d{1,3}$/.test(next2)) {

            qty = parseInt(next2);
        }

        items.push({
            partRaw: token,
            qty: qty
        });
    }

    const merged = new Map();

    for (const item of items) {

        const key =
            item.partRaw;

        if (merged.has(key)) {

            merged.get(key).qty += item.qty;

        } else {

            merged.set(key, item);
        }
    }

    return Array.from(
        merged.values()
    );
}
