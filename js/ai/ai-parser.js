console.log("FINAL UNIVERSAL ai-parser.js LOADED");

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
        /[A-Z0-9\-\/\.:%]{2,40}/g;

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
        // HSN CHECK
        // SUPPORT:
        // 4 / 6 / 8 DIGIT HSN
        // =====================================

        let hasHSN = false;

        for (const t of tokens) {

            if (/^\d{4,8}$/.test(t)) {

                hasHSN = true;

                break;
            }
        }

        // =====================================
        // WHATSAPP ORDER SUPPORT
        // =====================================

        const whatsappStyle =

            tokens.length <= 6

            &&

            /[A-Z]+\d+|\d+[A-Z]+/.test(line);

        if (
            !hasHSN
            &&
            !whatsappStyle
        ) {

            continue;
        }

        let foundPart = null;

        // =====================================
        // PART NO DETECTION
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
            )
                continue;

            if (
                /^\d{10,}$/.test(token)
            )
                continue;

            if (
                /^[0-9]{2}[A-Z]{5}[0-9]{4}/.test(token)
            )
                continue;

            if (
                /^\d{1,3}$/.test(token)
            )
                continue;

            // COMMON HSN
            // ignore as part no

            const commonHSN = [
                '7318',
                '8482',
                '8708',
                '4011',
                '3926',
                '870899',
                '842139',
                '848210'
            ];

            if (
                commonHSN.includes(token)
            )
                continue;

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
        // FINAL SMART QTY DETECTION
        // =====================================

        let qty = 1;

        const uomWords = [
            'PCS',
            'PC',
            'NOS',
            'NO',
            'SET',
            'SETS',
            'KIT',
            'UNIT',
            'UNITS'
        ];

        // -------------------------------------
        // PATTERN 1
        // 2 PCS
        // -------------------------------------

        for (let i = 0; i < tokens.length; i++) {

            const current =
                tokens[i];

            if (
                uomWords.includes(current)
            ) {

                const prev =
                    tokens[i - 1];

                if (
                    prev &&
                    /^[0-9]{1,3}$/.test(prev)
                ) {

                    const q =
                        parseInt(prev);

                    if (
                        q >= 1 &&
                        q <= 200
                    ) {

                        qty = q;

                        break;
                    }
                }
            }
        }

        // -------------------------------------
        // PATTERN 2
        // PCS 2
        // -------------------------------------

        if (qty === 1) {

            for (let i = 0; i < tokens.length; i++) {

                const current =
                    tokens[i];

                if (
                    uomWords.includes(current)
                ) {

                    const next =
                        tokens[i + 1];

                    if (
                        next &&
                        /^[0-9]{1,3}$/.test(next)
                    ) {

                        const q =
                            parseInt(next);

                        if (
                            q >= 1 &&
                            q <= 200
                        ) {

                            qty = q;

                            break;
                        }
                    }
                }
            }
        }

        // -------------------------------------
        // PATTERN 3
        // 2PCS
        // -------------------------------------

        if (qty === 1) {

            for (const t of tokens) {

                const compact =
                    t.match(/^([0-9]{1,3})(PCS|NOS|NO|PC)$/);

                if (compact) {

                    const q =
                        parseInt(compact[1]);

                    if (
                        q >= 1 &&
                        q <= 200
                    ) {

                        qty = q;

                        break;
                    }
                }
            }
        }

        // -------------------------------------
        // PATTERN 4
        // QTY:2
        // -------------------------------------

        if (qty === 1) {

            const qtyMatch =
                line.match(/QTY[:\-\s]*([0-9]{1,3})/);

            if (qtyMatch) {

                const q =
                    parseInt(qtyMatch[1]);

                if (
                    q >= 1 &&
                    q <= 200
                ) {

                    qty = q;
                }
            }
        }

        // -------------------------------------
        // FALLBACK
        // LAST SMALL NUMBER
        // -------------------------------------

        if (qty === 1) {

            const qtyCandidates = [];

            for (const t of tokens) {

                if (
                    /^[0-9]{1,3}$/.test(t)
                ) {

                    const n =
                        parseInt(t);

                    if (

                        n >= 1 &&

                        n <= 50 &&

                        n !== 18

                    ) {

                        qtyCandidates.push(n);
                    }
                }
            }

            if (
                qtyCandidates.length > 0
            ) {

                qty =
                    qtyCandidates[
                        qtyCandidates.length - 1
                    ];
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
