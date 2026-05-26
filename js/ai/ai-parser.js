function extractItemsFromText(ocrResult) {

    const text =
        typeof ocrResult === 'string'
            ? ocrResult
            : (ocrResult.text || '');

    console.log("RAW OCR:", text);

    if (!text || text.length < 3) {

        console.warn("OCR EMPTY");

        return [];
    }

    const lines =
        text.split(/\r?\n/);

    const items = [];

    // OCR friendly pattern

    const partPattern =
        /[A-Z0-9\-\/\.]{5,25}/g;

    // Ignore invoice metadata

    const ignoreIfContains =
        /(invoice|gst|cgst|sgst|total|subtotal|amount|tax|hsn|sac|mobile|phone|email|bank|address|date|delivery|shipping|buyer|seller|dispatch|terms|payment|ack|page|state|code|gstin)/i;

    // Reduced line limit

    const minLineLength = 4;

    for (let rawLine of lines) {

        let line =
            rawLine.trim().toUpperCase();

        console.log("LINE:", line);

        if (!line)
            continue;

        if (
            line.length < minLineLength
        )
            continue;

        if (
            ignoreIfContains.test(line)
        )
            continue;

        // =============================================
        // PART MATCH
        // =============================================

        const partMatches =
            [...line.matchAll(partPattern)];

        if (
            partMatches.length === 0
        )
            continue;

        // =============================================
        // QTY
        // =============================================

        let qty = 1;

        const qtyPatterns = [

            /(?:qty|quantity|qnty|pcs|nos|x)\s*[:\-]?\s*(\d+)/i,

            /(\d+)\s*(?:pcs|nos|qty)/i,

            /x(\d{1,3})\b/i
        ];

        for (const pat of qtyPatterns) {

            const match =
                line.match(pat);

            if (match) {

                qty =
                    parseInt(match[1]) || 1;

                break;
            }
        }

        // =============================================
        // PROCESS PARTS
        // =============================================

        for (const m of partMatches) {

            let part = m[0];

            console.log(
                "PART CANDIDATE:",
                part
            );

            // Ignore dates

            if (
                /^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$/.test(part)
            ) {
                continue;
            }

            // Ignore very long numbers

            if (
                /^\d{10,}$/.test(part)
            ) {
                continue;
            }

            // Ignore tiny numbers

            if (
                /^\d{1,3}$/.test(part)
            ) {
                continue;
            }

            // Must contain number

            if (
                !/\d/.test(part)
            ) {
                continue;
            }

            const normalized =
                normalizePart(part);

            if (
                !normalized ||
                normalized.length < 4
            ) {
                continue;
            }

            items.push({
                partRaw: part,
                qty: qty
            });
        }
    }

    // =============================================
    // MERGE DUPLICATES
    // =============================================

    const merged = new Map();

    for (const it of items) {

        const norm =
            normalizePart(it.partRaw);

        if (!norm)
            continue;

        if (merged.has(norm)) {

            merged.get(norm).qty += it.qty;

        } else {

            merged.set(norm, {
                partRaw: it.partRaw,
                qty: it.qty
            });
        }
    }

    const result =
        Array.from(merged.values());

    console.log(
        "FINAL PARSED ITEMS:",
        result
    );

    return result;
}
