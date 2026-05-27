console.log("SMART PDF ai-parser.js LOADED");

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
        /[A-Z0-9\-\/\.]{2,40}/g;

    for (let rawLine of lines) {

        let line =
            rawLine
            .trim()
            .replace(/\s+/g, ' ');

        if (!line)
            continue;

        if (ignoreWords.test(line))
            continue;

        let tokens =
            line.match(tokenPattern) || [];

        if (tokens.length === 0)
            continue;

        // =====================================
        // SMART PDF TOKEN JOIN
        // =====================================

        const joinedTokens = [];

        for (let i = 0; i < tokens.length; i++) {

            let current =
                tokens[i];

            // join with next token if short split

            if (
                i < tokens.length - 1
            ) {

                const combined =
                    current + tokens[i + 1];

                if (

                    /^[A-Z0-9]{5,25}$/.test(combined)

                ) {

                    joinedTokens.push(combined);

                    i++;

                    continue;
                }
            }

            joinedTokens.push(current);
        }

        tokens = joinedTokens;

        let foundPart = null;

        // =====================================
        // FIND VALID PART
        // =====================================

        for (let token of tokens) {

            token = token.trim();

            // SMART OCR FIXES

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

            // SKIPS

            if (/^\d+\.\d+$/.test(token))
                continue;

            if (/^\d{10,}$/.test(token))
                continue;

            if (/^[0-9]{2}[A-Z]{5}[0-9]{4}/.test(token))
                continue;

            if (/^\d{1,3}$/.test(token))
                continue;

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

                (
                    hasLetter &&
                    hasDigit &&
                    token.length >= 5
                )

                ||

                (
                    /^\d{5,12}$/.test(token)
                )

                ||

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
        // QTY
        // =====================================

        let qty = 1;

        const numericTokens =
            tokens.filter(t =>
                /^[0-9]{1,3}$/.test(t)
            );

        if (numericTokens.length > 0) {

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
