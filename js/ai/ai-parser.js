function extractItemsFromText(ocrResult) {

    const text =
        typeof ocrResult === 'string'
            ? ocrResult
            : (ocrResult.text || '');

    if (!text)
        return [];

    const lines =
        text
        .toUpperCase()
        .split(/\r?\n/);

    const items = [];

    // =============================================
    // IGNORE NON-PRODUCT LINES
    // =============================================

    const ignoreWords =
        /GST|CGST|SGST|TOTAL|AMOUNT|BANK|EMAIL|PHONE|MOBILE|ADDRESS|STATE|PIN|INVOICE|TAX|RATE/i;

    // =============================================
    // TOKEN PATTERN
    // =============================================

    const tokenPattern =
        /[A-Z0-9\-\/\.]{4,40}/g;

    // =============================================
    // PROCESS EACH LINE
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

        const tokens =
            line.match(tokenPattern) || [];

        if (tokens.length === 0)
            continue;

        let foundPart = null;

        // =========================================
        // FIND VALID PART NUMBER
        // =========================================

        for (let token of tokens) {

            token =
                token
                .trim()
                .replace(/O/g, '0')
                .replace(/I/g, '1');

            const hasLetter =
                /[A-Z]/.test(token);

            const hasDigit =
                /\d/.test(token);

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

            // Reject tiny numbers

            if (
                /^\d{1,3}$/.test(token)
            ) {
                continue;
            }

            // Ignore common HSN numbers

            const commonHSN = [
                '7318',
                '8482',
                '8708',
                '4011',
                '3926'
            ];

            if (
                commonHSN.includes(token)
            ) {
                continue;
            }

            // =====================================
            // VALID PART CONDITIONS
            // =====================================

            const validPart =

                // Mixed type
                (
                    hasLetter &&
                    hasDigit &&
                    token.length >= 5
                )

                ||

                // Numeric OEM part
                (
                    /^\d{4,12}$/.test(token)
                )

                ||

                // Bearing type
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
        // FIND QUANTITY
        // =========================================

        let qty = 1;

        for (const t of tokens) {

            if (
                /^[1-9][0-9]{0,2}$/.test(t)
            ) {

                const n =
                    parseInt(t);

                // Avoid prices / phone pieces

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
    // MERGE DUPLICATES
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

    return Array.from(
        merged.values()
    );
                        }
