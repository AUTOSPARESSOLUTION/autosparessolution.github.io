console.log("HYBRID ai-parser.js LOADED");

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
    // TOKEN PATTERN
    // =====================================

    const tokenPattern =
        /[A-Z0-9\-\/\.]{4,40}/g;

    // =====================================
    // STEP 1:
    // EXCEL / CLEAN ROW PARSER
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

        let tokens =
            line.match(tokenPattern) || [];

        if (tokens.length === 0)
            continue;

        let foundPart = null;

        for (let token of tokens) {

            token =
                token
                .trim();

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

            // SKIP DECIMAL

            if (/^\d+\.\d+$/.test(token))
                continue;

            // SKIP HUGE NUMBER

            if (/^\d{10,}$/.test(token))
                continue;

            // SKIP GSTIN

            if (/^[0-9]{2}[A-Z]{5}[0-9]{4}/.test(token))
                continue;

            // SKIP SMALL NUMBER

            if (/^\d{1,3}$/.test(token))
                continue;

            // COMMON HSN

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
        // SMART QTY DETECTION
        // =====================================

        let qty = 1;

        // qty usually comes AFTER part number

        const partIndex =
            tokens.indexOf(foundPart);

        if (partIndex >= 0) {

            for (

                let i = partIndex + 1;

                i < tokens.length;

                i++

            ) {

                const t =
                    tokens[i];

                // realistic qty

                if (
                    /^[0-9]{1,3}$/.test(t)
                ) {

                    const val =
                        parseInt(t);

                    // avoid HSN/rate

                    if (
                        val >= 1 &&
                        val <= 200
                    ) {

                        qty = val;

                        break;
                    }
                }
            }
        }

        items.push({

            partRaw: foundPart,

            qty: qty
        });
    }

    // =====================================
    // STEP 2:
    // PDF GLOBAL SEARCH FALLBACK
    // =====================================

    if (
        items.length < 5 &&
        window.allProducts
    ) {

        console.log(
            "Using PDF global fallback"
        );

        const normalizedText =

            upperText
            .replace(/[^A-Z0-9]/g, '');

        for (const prod of window.allProducts) {

            if (!prod.part)
                continue;

            let dbPart =
                prod.part
                .toUpperCase()
                .replace(/[^A-Z0-9]/g, '');

            // remove leading zeros

            let dbPartNoZero =
                dbPart.replace(/^0+/, '');

            // SEARCH GLOBAL OCR TEXT

            if (

                normalizedText.includes(dbPart)

                ||

                normalizedText.includes(dbPartNoZero)

            ) {

                const alreadyExists =
                    items.find(x =>

                        x.partRaw
                        .replace(/^0+/, '') ===
                        dbPartNoZero
                    );

                if (!alreadyExists) {

                    items.push({

                        partRaw: prod.part,

                        qty: 1
                    });
                }
            }
        }
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
