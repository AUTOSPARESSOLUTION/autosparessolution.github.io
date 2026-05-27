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

    const ignoreWords =
        /GST|CGST|SGST|TOTAL|AMOUNT|BANK|EMAIL|PHONE|MOBILE|ADDRESS|STATE|PIN|INVOICE|TAX|RATE/i;

    const tokenPattern =
        /[A-Z0-9\-\/\.]{4,40}/g;

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

        // =========================================
        // CHECK IF LINE LOOKS LIKE ITEM ROW
        // =========================================

        let hasHSN = false;

        for (const t of tokens) {

            if (/^\d{4,8}$/.test(t)) {

                hasHSN = true;
                break;
            }
        }

        if (!hasHSN)
            continue;

        let foundPart = null;

        // =========================================
        // CHECK TOKENS
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

            // =====================================
            // REJECT BAD TOKENS
            // =====================================

            // price

            if (
                /^\d+\.\d+$/.test(token)
            ) {
                continue;
            }

            // phone number

            if (
                /^\d{10,}$/.test(token)
            ) {
                continue;
            }

            // GSTIN

            if (
                /^[0-9]{2}[A-Z]{5}[0-9]{4}/.test(token)
            ) {
                continue;
            }

            // small numbers

            if (
                /^\d{1,3}$/.test(token)
            ) {
                continue;
            }

            // common HSN

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
            // VALID PART CHECK
            // =====================================

            const validPart =

                // Mixed OEM
                (
                    hasLetter &&
                    hasDigit &&
                    token.length >= 5
                )

                ||

                // Numeric OEM
                (
                    /^\d{5,12}$/.test(token)
                )

                ||

                // Leading zero OEM
                (
                    /^0+\d{4,12}$/.test(token)
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

            if (!validPart) {
                continue;
            }

            // =====================================
            // ZERO NORMALIZATION
            // =====================================

            // Example:
            // 088630 → 88630
            // 00088630 → 88630

            let compareToken =
                token.replace(/^0+/, '');

            if (
                compareToken.length === 0
            ) {

                compareToken = token;
            }

            // =====================================
            // SELECT BEST TOKEN
            // =====================================

            if (!foundPart) {

                foundPart = token;

            } else {

                const oldCompare =
                    foundPart.replace(/^0+/, '');

                // same numeric value

                if (
                    compareToken === oldCompare
                ) {

                    // keep longer original

                    if (
                        token.length >
                        foundPart.length
                    ) {

                        foundPart = token;
                    }

                } else {

                    // prefer longer realistic OEM

                    if (
                        token.length >
                        foundPart.length
                    ) {

                        foundPart = token;
                    }
                }
            }
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

                if (
                    n <= 200
                ) {

                    qty = n;

                    break;
                }
            }
        }

        // =========================================
        // SAVE ITEM
        // =========================================

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
            item.partRaw
            .replace(/^0+/, '');

        if (merged.has(key)) {

            merged.get(key).qty += item.qty;

        } else {

            merged.set(key, {

                partRaw: item.partRaw,

                qty: item.qty
            });
        }
    }

    return Array.from(
        merged.values()
    );
}
