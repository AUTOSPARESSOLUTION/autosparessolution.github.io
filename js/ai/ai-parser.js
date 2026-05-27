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

    const tokenPattern =
        /[A-Z0-9\-\/\.]{4,40}/g;

    const ignoreWords =
        /GST|CGST|SGST|TOTAL|AMOUNT|BANK|EMAIL|PHONE|MOBILE|ADDRESS|STATE|PIN|INVOICE/i;

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

        let candidates = [];

        // =========================================
        // ANALYZE ALL TOKENS
        // =========================================

        for (let token of tokens) {

            token =
                token
                .trim()
                .replace(/O/g, '0')
                .replace(/I/g, '1');

            // reject prices

            if (
                /^\d+\.\d+$/.test(token)
            ) {
                continue;
            }

            // reject phones

            if (
                /^\d{10,}$/.test(token)
            ) {
                continue;
            }

            // reject tiny numbers

            if (
                /^\d{1,3}$/.test(token)
            ) {
                continue;
            }

            // reject common HSN

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

            let score = 0;

            // =====================================
            // MIXED PART
            // =====================================

            if (
                /[A-Z]/.test(token) &&
                /\d/.test(token)
            ) {

                score += 100;
            }

            // =====================================
            // LEADING ZERO OEM
            // =====================================

            if (
                /^0\d{4,12}$/.test(token)
            ) {

                score += 90;
            }

            // =====================================
            // NUMERIC OEM
            // =====================================

            if (
                /^\d{5,12}$/.test(token)
            ) {

                score += 80;
            }

            // =====================================
            // BEARING
            // =====================================

            if (
                /^\d{4,6}(ZZ|RS|2RS)?$/.test(token)
            ) {

                score += 70;
            }

            if (score > 0) {

                candidates.push({

                    token,

                    score
                });
            }
        }

        if (candidates.length === 0)
            continue;

        // =========================================
        // PICK BEST SCORE
        // =========================================

        candidates.sort(
            (a, b) => b.score - a.score
        );

        const foundPart =
            candidates[0].token;

        // =========================================
        // FIND QTY
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

        items.push({

            partRaw: foundPart,

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

    return Array.from(
        merged.values()
    );
                }
