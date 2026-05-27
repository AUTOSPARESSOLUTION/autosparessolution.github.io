console.log("ULTIMATE ai-parser.js LOADED");

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
        /GST|CGST|SGST|TOTAL|AMOUNT|BANK|EMAIL|PHONE|MOBILE|ADDRESS|STATE|PIN|INVOICE|TAX|RATE|DISC|VALUE|RUPEES/i;

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

        // =====================================
        // FIND VALID PART
        // =====================================

        for (let token of tokens) {

            token = token.trim();

            // SMART OCR FIX

            token = token.replace(
                /(?<=\d)O|O(?=\d)/g,
                '0'
            );

            token = token.replace(
                /(?<=\d)I|I(?=\d)/g,
                '1'
            );

            token =
                token.replace(/\s+/g, '');

            // skip decimal

            if (/^\d+\.\d+$/.test(token))
                continue;

            // skip huge numbers

            if (/^\d{10,}$/.test(token))
                continue;

            // skip gstin

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

            const validPart =

                // alphanumeric

                (
                    hasLetter &&
                    hasDigit &&
                    token.length >= 5
                )

                ||

                // numeric

                (
                    /^\d{5,12}$/.test(token)
                )

                ||

                // bearing

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

        // =====================================
        // QTY DETECTION
        // =====================================

        let qty = 1;

        // try last realistic number in line

        const numericTokens =
            tokens.filter(t =>
                /^[0-9]{1,3}$/.test(t)
            );

        if (numericTokens.length > 0) {

            // usually qty near end

            const reversed =
                [...numericTokens].reverse();

            for (const n of reversed) {

                const val =
                    parseInt(n);

                if (
                    val >= 1 &&
                    val <= 200
                ) {

                    qty = val;

                    break;
                }
            }
        }

        // =====================================
        // STORE ITEM
        // =====================================

        items.push({

            partRaw: foundPart,

            qty: qty
        });
    }

    // =====================================
    // MERGE DUPLICATES
    // =====================================

    const merged = new Map();

    for (const item of items) {

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
