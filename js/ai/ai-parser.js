console.log("FINAL INDUSTRIAL ai-parser.js LOADED");

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
    // STRICT IGNORE WORDS
    // =====================================

    const ignoreWords =
        /GST|CGST|SGST|IGST|TOTAL|AMOUNT|BANK|EMAIL|PHONE|MOBILE|ADDRESS|STATE|PINCODE|PIN|INVOICE|TAX|RATE|DISC|VALUE|RUPEES|IFSC|ACCOUNT|BRANCH|HSBC|SBIN|KOLKATA/i;

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

        // =====================================
        // STRICT FILTER
        // =====================================

        if (ignoreWords.test(line))
            continue;

        // MUST START WITH SL NO

        const hasSlNo =
            /^\d{1,3}[\/\.\-\s]/.test(line);

        if (!hasSlNo)
            continue;

        // MUST HAVE GST 18%

        const hasGST18 =

            /18\s?%/.test(line)

            ||

            /\b18\.00\b/.test(line);

        if (!hasGST18)
            continue;

        const tokens =
            line.match(tokenPattern) || [];

        if (tokens.length === 0)
            continue;

        // MUST HAVE HSN

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

            // REMOVE SERIAL PREFIX

            token =
                token.replace(
                    /^\d+[\/\-]/,
                    ''
                );

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

            if (/^\d{1,4}$/.test(token))
                continue;

            if (/^\d{10,}$/.test(token))
                continue;

            if (/^[0-9]{2}[A-Z]{5}[0-9]{4}/.test(token))
                continue;

            if (commonHSN.includes(token))
                continue;

            // MUST CONTAIN BOTH LETTER & DIGIT

            const hasLetter =
                /[A-Z]/.test(token);

            const hasDigit =
                /\d/.test(token);

            if (
                !hasLetter ||
                !hasDigit
            ) {

                continue;
            }

            // LENGTH CHECK

            if (
                token.length < 6
            ) {

                continue;
            }

            foundPart = token;

            break;
        }

        if (!foundPart)
            continue;

        // =====================================
        // QTY DETECTION
        // =====================================

        let qty = 1;

        const qtyMatches =
            line.match(/\b([1-9][0-9]{0,2})\b/g);

        if (
            qtyMatches &&
            qtyMatches.length > 0
        ) {

            // LAST SMALL NUMBER

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
