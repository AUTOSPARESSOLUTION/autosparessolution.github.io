function extractItemsFromText(ocrResult) {

    const text =
        typeof ocrResult === 'string'
            ? ocrResult
            : (ocrResult.text || '');

    if (!text)
        return [];

    console.log("OCR TEXT:", text);

    const lines =
        text
        .toUpperCase()
        .split(/\r?\n/);

    const items = [];

    // =============================================
    // IGNORE WORDS
    // =============================================

    const ignoreWords =
        /GSTIN|PHONE|MOBILE|EMAIL|BANK|IFSC|ADDRESS|STATE|PINCODE/i;

    // =============================================
    // TOKEN PATTERN
    // =============================================

    const tokenPattern =
        /[A-Z0-9\-\/\.]{4,40}/g;

    // =============================================
    // LOOP LINES
    // =============================================

    for (let rawLine of lines) {

        let line =
            rawLine
            .trim()
            .replace(/\s+/g, ' ');

        if (!line)
            continue;

        if (ignoreWords.test(line))
            continue;

        console.log("LINE:", line);

        const tokens =
            line.match(tokenPattern) || [];

        if (tokens.length === 0)
            continue;

        let foundPart = null;

        // =========================================
        // FIND PART
        // =========================================

        for (let token of tokens) {

            token =
                token
                .trim()
                .replace(/O/g, '0')
                .replace(/I/g, '1');

            // Reject decimal prices

            if (
                /^\d+\.\d+$/.test(token)
            ) {
                continue;
            }

            // Reject phone numbers

            if (
                /^\d{10,}$/.test(token)
            ) {
                continue;
            }

            // Reject GSTIN

            if (
                /^[0-9]{2}[A-Z]{5}[0-9]{4}/.test(token)
            ) {
                continue;
            }

            // Reject tiny qty

            if (
                /^\d{1,3}$/.test(token)
            ) {
                continue;
            }

            // =====================================
            // VALID PART TYPES
            // =====================================

            const validPart =

                // Mixed type
                (
                    /[A-Z]/.test(token) &&
                    /\d/.test(token) &&
                    token.length >= 5
                )

                ||

                // Numeric OEM
                (
                    /^\d{4,12}$/.test(token)
                )

                ||

                // Bearing
                (
                    /^\d{4,6}(ZZ|RS|2RS)?$/.test(token)
                )

                ||

                (
                    /^\d{4,6}[-]?(ZZ|RS|2RS)$/.test(token)
                );

            if (!validPart)
                continue;

            foundPart = token;

            break;
        }

        if (!foundPart)
            continue;

        // =========================================
        // FIND QTY
        // =========================================

        let qty = 1;

        for (const t of tokens) {

            if (
                /^[1-9][0-9]{0,2}$/.test(t)
            ) {

                const n =
                    parseInt(t);

                if (
                    n <= 200
                ) {

                    qty = n;

                    break;
                }
            }
        }

        items.push({

            partRaw: foundPart,

            qty: qty
        });
    }

    // =============================================
    // REMOVE DUPLICATES
    // =============================================

    const merged = new Map();

    for (const item of items) {

        const norm =
            normalizePart(item.partRaw);

        if (!norm)
            continue;

        if (merged.has(norm)) {

            merged.get(norm).qty += item.qty;

        } else {

            merged.set(norm, item);
        }
    }

    const result =
        Array.from(
            merged.values()
        );

    console.log(
        "FINAL ITEMS:",
        result
    );

    return result;
}
