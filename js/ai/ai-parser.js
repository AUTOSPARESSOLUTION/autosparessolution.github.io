console.log("NEW ai-parser.js LOADED");

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

        for (let token of tokens) {

            token =
                token
                .trim()
                .replace(/O/g, '0')
                .replace(/I/g, '1');

            const hasLetter =
                /[A-Z]/.test(token);

            const hasDigit =
                /\d/.test(token);

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

        let qty = 1;

        for (const t of tokens) {

            if (/^[1-9][0-9]{0,2}$/.test(t)) {

                const n = parseInt(t);

                if (n <= 200) {

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

    const merged = new Map();

    for (const item of items) {

        const key =
            item.partRaw.replace(/^0+/, '');

        if (merged.has(key)) {

            merged.get(key).qty += item.qty;

        } else {

            merged.set(key, {

                partRaw: item.partRaw,

                qty: item.qty
            });
        }
    }

    console.log(
        "FINAL PARSED:",
        Array.from(merged.values())
    );

    return Array.from(
        merged.values()
    );
}
