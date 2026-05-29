console.log("FINAL PROFESSIONAL ai-parser.js LOADED");

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

        // =====================================
        // SAFE PDF FILTER
        // =====================================

        const pdfProductRow =

            /18\s?%/.test(line)

            ||

            /\b18\.00\b/.test(line);

        if (pdfProductRow) {

            const hasHSN =
                /\b\d{4,8}\b/.test(line);

            if (!hasHSN) {

                continue;
            }
        }

        if (ignoreWords.test(line))
            continue;

        const tokens =
            line.match(tokenPattern) || [];

        if (tokens.length === 0)
            continue;

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

        // =====================================
        // FIND PART NUMBER
        // =====================================

        for (let token of tokens) {

            token =
                token
                .trim()
                .replace(/O/g, '0')
                .replace(/I/g, '1');

            // REMOVE SERIAL PREFIX

            token =
                token.replace(
                    /^\d+[\/\-]/,
                    ''
                );

            const hasLetter =
                /[A-Z]/.test(token);

            const hasDigit =
                /\d/.test(token);

            // SKIPS

            if (
                /^\d+\.\d+$/.test(token)
            ) {
                continue;
            }

            if (
                /^\d{10,}$/.test(token)
            ) {
                continue;
            }

            if (
                /^[0-9]{2}[A-Z]{5}[0-9]{4}/.test(token)
            ) {
                continue;
            }

            if (
                /^\d{1,3}$/.test(token)
            ) {
                continue;
            }

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

            if (!validPart) {

                continue;
            }

            foundPart = token;

            break;
        }

        if (!foundPart)
            continue;

        // =====================================
        // SMART QTY DETECTION
        // =====================================

        let qty = 1;

        const qtyCandidates = [];

        for (const t of tokens) {

            if (
                /^[0-9]{1,3}$/.test(t)
            ) {

                const n =
                    parseInt(t);

                // realistic qty only

                if (
                    n >= 1 &&
                    n <= 50
                ) {

                    // ignore GST %

                    if (n === 18)
                        continue;

                    qtyCandidates.push(n);
                }
            }
        }

        // usually qty is last usable number

        if (
            qtyCandidates.length > 0
        ) {

            qty =
                qtyCandidates[
                    qtyCandidates.length - 1
                ];
        }

        // =====================================
        // SMART BACK CALCULATION
        // USING RATE × QTY = VALUE
        // =====================================

        const numericValues = [];

        for (const t of tokens) {

            if (
                /^\d+(\.\d+)?$/.test(t)
            ) {

                const n =
                    parseFloat(t);

                if (n > 0) {

                    numericValues.push(n);
                }
            }
        }

        // Try back calculation

        if (
            numericValues.length >= 3
        ) {

            for (
                let i = 0;
                i < numericValues.length - 1;
                i++
            ) {

                const rate =
                    numericValues[i];

                const value =
                    numericValues[i + 1];

                if (
                    rate > 0 &&
                    value > rate
                ) {

                    const calcQty =
                        value / rate;

                    // realistic integer qty

                    if (

                        Number.isInteger(calcQty)

                        &&

                        calcQty >= 1

                        &&

                        calcQty <= 50

                    ) {

                        qty = calcQty;

                        break;
                    }
                }
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

            merged.set(key, item);
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
