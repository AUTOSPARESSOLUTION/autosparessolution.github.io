console.log("FINAL STABLE ai-parser.js LOADED");

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
    // MAIN LINE PARSER
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

        // =====================================
        // FIND PART NUMBER
        // =====================================

        for (let token of tokens) {

            token =
                token
                .trim();

            // OCR corrections

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

            // skip huge number

            if (/^\d{10,}$/.test(token))
                continue;

            // skip GSTIN

            if (/^[0-9]{2}[A-Z]{5}[0-9]{4}/.test(token))
                continue;

            // skip tiny numbers

            if (/^\d{1,3}$/.test(token))
                continue;

            // common HSN codes

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
        // SIMPLE & STABLE QTY DETECTION
        // =====================================

        let qty = 1;

        // take LAST small number from line

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
        // STORE ITEM
        // =====================================

        items.push({

            partRaw: foundPart,

            qty: qty
        });
    }

    // =====================================
    // PDF GLOBAL FALLBACK
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

            let dbPartNoZero =
                dbPart.replace(/^0+/, '');

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
