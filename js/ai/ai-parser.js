console.log("ULTIMATE ai-parser.js LOADED");

function extractItemsFromText(ocrResult) {

    const text =
        typeof ocrResult === 'string'
            ? ocrResult
            : (ocrResult.text || '');

    if (!text)
        return [];

    const upperText =
        text.toUpperCase();

    const lines =
        upperText.split(/\r?\n/);

    const items = [];

    // =====================================
    // IGNORE WORDS
    // =====================================

    const ignoreWords =
        /GST|CGST|SGST|TOTAL|AMOUNT|BANK|EMAIL|PHONE|MOBILE|ADDRESS|STATE|PIN|INVOICE|TAX|RATE|DISC|VALUE|RUPEES/i;

    // =====================================
    // COMMON HSN
    // =====================================

    const commonHSN = [
        '7318',
        '8482',
        '8708',
        '4011',
        '3926'
    ];

    // =====================================
    // TOKEN PATTERN
    // =====================================

    const tokenPattern =
        /[A-Z0-9\-\/\.]{4,40}/g;

    // =====================================
    // MAIN PARSER
    // =====================================

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

        // =====================================
        // IMPORTANT PDF FILTER
        // ONLY ROWS WITH HSN
        // =====================================

        let hasHSN = false;

        for (const t of tokens) {

            if (

                /^\d{4,8}$/.test(t)

                ||

                commonHSN.includes(t)

            ) {

                hasHSN = true;

                break;
            }
        }

        if (!hasHSN)
            continue;

        // =====================================
        // FIND PART NUMBER
        // =====================================

        let foundPart = null;

        for (let token of tokens) {

            token =
                token
                .trim();

            // OCR FIXES

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
        // SIMPLE & STABLE QTY DETECTION
        // =====================================

        let qty = 1;

        const qtyMatches =
            line.match(/\b([1-9][0-9]{0,2})\b/g);

        if (
            qtyMatches &&
            qtyMatches.length > 0
        ) {

            const lastQty =

                parseInt(
                    qtyMatches[
                        qtyMatches.length - 1
                    ]
                );

            if (
                lastQty >= 1 &&
                lastQty <= 200
            ) {

                qty = lastQty;
            }
        }

        console.log(
            "PART:",
            foundPart,
            "QTY:",
            qty
        );

        // =====================================
        // STORE
        // =====================================

        items.push({

            partRaw: foundPart,

            qty: qty
        });
    }

    // =====================================
    // MERGE DUPLICATES
    // SUPPORT LEADING ZERO MATCH
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
