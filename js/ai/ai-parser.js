function extractItemsFromText(ocrResult) {

    const text =
        typeof ocrResult === 'string'
            ? ocrResult
            : (ocrResult.text || '');

    if (!text)
        return [];

    console.log("OCR TEXT:");
    console.log(text);

    const lines =
        text
        .toUpperCase()
        .split(/\r?\n/);

    const items = [];

    // =============================================
    // COMMON HSN CODES
    // =============================================

    const commonHSN = [

        '7318',
        '8482',
        '8708',
        '4011',
        '3926',
        '8501',
        '8511',
        '8421'
    ];

    // =============================================
    // IGNORE WORDS
    // =============================================

    const ignoreWords =
        /GST|CGST|SGST|TOTAL|AMOUNT|BANK|EMAIL|PHONE|MOBILE|ADDRESS|STATE|PIN|INVOICE/i;

    // =============================================
    // TOKEN PATTERN
    // =============================================

    const tokenPattern =
        /[A-Z0-9\-\/\.]{4,40}/g;

    // =============================================
    // PROCESS EACH LINE
    // =============================================

    for (let rawLine of lines) {

        const line =
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

        let bestToken = null;
        let bestScore = 0;

        // =========================================
        // CHECK ALL TOKENS
        // =========================================

        for (let token of tokens) {

            token =
                token
                .trim()
                .replace(/O/g, '0')
                .replace(/I/g, '1');

            // =====================================
            // REJECT BAD TOKENS
            // =====================================

            // decimal price

            if (
                /^\d+\.\d+$/.test(token)
            ) {
                continue;
            }

            // phone

            if (
                /^\d{10,}$/.test(token)
            ) {
                continue;
            }

            // tiny numbers

            if (
                /^\d{1,3}$/.test(token)
            ) {
                continue;
            }

            // GSTIN

            if (
                /^[0-9]{2}[A-Z]{5}[0-9]{4}/.test(token)
            ) {
                continue;
            }

            // HSN

            if (
                commonHSN.includes(token)
            ) {
                continue;
            }

            let score = 0;

            // =====================================
            // PRIORITY 1
            // MIXED LETTER + NUMBER
            // Example:
            // ABC123
            // 6205ZZ
            // =====================================

            if (
                /[A-Z]/.test(token) &&
                /\d/.test(token)
            ) {

                score += 100;
            }

            // =====================================
            // PRIORITY 2
            // LEADING ZERO OEM
            // Example:
            // 088630
            // =====================================

            if (
                /^0\d{4,12}$/.test(token)
            ) {

                score += 95;
            }

            // =====================================
            // PRIORITY 3
            // PURE NUMERIC OEM
            // Example:
            // 88630
            // =====================================

            if (
                /^\d{5,12}$/.test(token)
            ) {

                score += 80;
            }

            // =====================================
            // PRIORITY 4
            // BEARING
            // Example:
            // 6205
            // 6205ZZ
            // =====================================

            if (
                /^\d{4,6}(ZZ|RS|2RS)?$/.test(token)
            ) {

                score += 70;
            }

            // =====================================
            // BONUS:
            // LONGER TOKEN
            // =====================================

            score += Math.min(
                token.length,
                10
            );

            // =====================================
            // SELECT BEST
            // =====================================

            if (
                score > bestScore
            ) {

                bestScore = score;

                bestToken = token;
            }
        }

        // =========================================
        // NO PART FOUND
        // =========================================

        if (!bestToken)
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

            partRaw: bestToken,

            qty: qty
        });
    }

    // =============================================
    // MERGE DUPLICATES
    // =============================================

    const merged = new Map();

    for (const item of items) {

        const key =
            item.partRaw;

        if (merged.has(key)) {

            merged.get(key).qty += item.qty;

        } else {

            merged.set(key, item);
        }
    }

    const result =
        Array.from(
            merged.values()
        );

    console.log(
        "FINAL ITEMS:",
        result
    );

    return result;
}
