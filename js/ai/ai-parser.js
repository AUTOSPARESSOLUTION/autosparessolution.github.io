function extractItemsFromText(ocrResult) {

    const text =
        typeof ocrResult === 'string'
            ? ocrResult
            : (ocrResult.text || '');

    if (!text)
        return [];

    console.log("OCR TEXT:");
    console.log(text);

    const lines =
        text
        .toUpperCase()
        .split(/\r?\n/);

    const items = [];

    // =============================================
    // SIMPLE TOKEN PATTERN
    // =============================================

    const tokenPattern =
        /[A-Z0-9\-\/\.]{4,40}/g;

    // =============================================
    // IGNORE WORDS
    // =============================================

    const ignoreWords =
        /GST|CGST|SGST|TOTAL|AMOUNT|BANK|EMAIL|PHONE|MOBILE|ADDRESS|STATE|PIN|INVOICE/i;

    // =============================================
    // LOOP LINES
    // =============================================

    for (let rawLine of lines) {

        const line =
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

            // reject decimal price

            if (
                /^\d+\.\d+$/.test(token)
            ) {
                continue;
            }

            // reject long phone numbers

            if (
                /^\d{10,}$/.test(token)
            ) {
                continue;
            }

            // reject tiny numbers

            if (
                /^\d{1,3}$/.test(token)
            ) {
                continue;
            }

            // =====================================
            // VALID PARTS
            // =====================================

            const validPart =

                // Mixed type
                (
                    /[A-Z]/.test(token) &&
                    /\d/.test(token) &&
                    token.length >= 4
                )

                ||

                // Numeric part
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

            console.log(
                "FOUND PART:",
                foundPart
            );

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

        const key =
            item.partRaw;

        if (merged.has(key)) {

            merged.get(key).qty += item.qty;

        } else {

            merged.set(key, item);
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
