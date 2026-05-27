console.log("FINAL ai-parser.js LOADED");

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
        /GST|CGST|SGST|TOTAL|AMOUNT|BANK|EMAIL|PHONE|MOBILE|ADDRESS|STATE|PIN|INVOICE|TAX|RATE|DISC|VALUE/i;

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

        let foundPart = null;

        for (let token of tokens) {

            token =
                token
                .trim()
                .replace(/O/g, '0')
                .replace(/I/g, '1');

            // skip decimal

            if (/^\d+\.\d+$/.test(token))
                continue;

            // skip huge numbers

            if (/^\d{10,}$/.test(token))
                continue;

            // skip GSTIN

            if (/^[0-9]{2}[A-Z]{5}[0-9]{4}/.test(token))
                continue;

            // skip tiny numbers

            if (/^\d{1,3}$/.test(token))
                continue;

            // skip common HSN

            const commonHSN = [
                '7318',
                '8482',
                '8708',
                '4011',
                '3926'
            ];

            if (commonHSN.includes(token))
                continue;

            const hasLetter =
                /[A-Z]/.test(token);

            const hasDigit =
                /\d/.test(token);

            // VALID PART RULES

            const validPart =

                // alphanumeric

                (
                    hasLetter &&
                    hasDigit &&
                    token.length >= 5
                )

                ||

                // numeric parts

                (
                    /^\d{5,12}$/.test(token)
                )

                ||

                // bearing types

                (
                    /^\d{4,6}(ZZ|RS|2RS)?$/.test(token)
                )

                ||

                (
                    /^\d{4,6}[-]?(ZZ|RS|2RS)$/.test(token)
                );

            if (!validPart)
                continue;

            // IMPORTANT:
            // avoid price/rate confusion

            if (
                /^\d+$/.test(token)
            ) {

                const num =
                    parseInt(token);

                // avoid amounts

                if (
                    num > 999999
                ) {
                    continue;
                }
            }

            foundPart = token;

            break;
        }

        if (!foundPart)
            continue;

        // =========================
        // QTY DETECTION
        // =========================

        let qty = 1;

        for (const t of tokens) {

            if (
                /^[1-9][0-9]{0,2}$/.test(t)
            ) {

                const n =
                    parseInt(t);

                // realistic qty only

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

    // =========================
    // MERGE DUPLICATES
    // =========================

    const merged = new Map();

    for (const item of items) {

        // IMPORTANT FIX:
        // 088630 = 88630

        const key =
            item.partRaw
                .replace(/^0+/, '');

        if (merged.has(key)) {

            merged.get(key).qty += item.qty;

        } else {

            merged.set(key, {

                partRaw:
                    item.partRaw,

                qty:
                    item.qty
            });
        }
    }

    const finalItems =
        Array.from(
            merged.values()
        );

    console.log(
        "FINAL ITEMS:",
        finalItems
    );

    return finalItems;
            }
