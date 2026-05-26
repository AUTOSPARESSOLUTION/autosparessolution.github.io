function extractItemsFromText(ocrResult) {

    try {

        console.log("🔵 extractItemsFromText START");

        // =============================================
        // GET OCR TEXT
        // =============================================

        let text = '';

        if (typeof ocrResult === 'string') {

            text = ocrResult;

        } else if (ocrResult && ocrResult.text) {

            text = ocrResult.text;

        }

        console.log("📄 OCR TEXT LENGTH:", text.length);

        console.log("📄 RAW OCR TEXT:");
        console.log(text);

        // =============================================
        // EMPTY CHECK
        // =============================================

        if (!text || text.trim().length === 0) {

            console.error("❌ OCR TEXT EMPTY");

            alert("OCR returned empty text");

            return [];
        }

        // =============================================
        // CLEAN TEXT
        // =============================================

        let cleaned = text
            .toUpperCase()
            .replace(/\r/g, ' ')
            .replace(/\n/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        console.log("📄 CLEANED TEXT:");
        console.log(cleaned);

        // =============================================
        // GLOBAL PART SEARCH
        // =============================================

        const regex =
            /[A-Z0-9\-\/\.]{5,25}/g;

        const matches =
            cleaned.match(regex);

        console.log("🔍 REGEX MATCHES:");
        console.log(matches);

        // =============================================
        // NO MATCHES
        // =============================================

        if (!matches || matches.length === 0) {

            console.error("❌ NO REGEX MATCHES");

            alert("No regex matches found");

            return [];
        }

        const items = [];

        // =============================================
        // PROCESS TOKENS
        // =============================================

        for (let raw of matches) {

            console.log("➡️ TOKEN:", raw);

            if (!raw)
                continue;

            let part =
                raw.replace(/[^A-Z0-9]/g, '');

            console.log("➡️ NORMALIZED:", part);

            // Skip tiny
            if (part.length < 5)
                continue;

            // Must contain digit
            if (!/\d/.test(part))
                continue;

            // Skip pure numbers
            if (/^\d+$/.test(part)) {

                if (part.length <= 4)
                    continue;
            }

            // Skip invoice words
            if (
                /TOTAL|CGST|SGST|IGST|AMOUNT|TAX|HSN|GST|STATE/i.test(part)
            ) {
                continue;
            }

            items.push({
                partRaw: part,
                qty: 1
            });
        }

        console.log("📦 ITEMS BEFORE MERGE:");
        console.log(items);

        // =============================================
        // MERGE
        // =============================================

        const merged = new Map();

        for (const item of items) {

            if (merged.has(item.partRaw)) {

                merged.get(item.partRaw).qty += item.qty;

            } else {

                merged.set(item.partRaw, item);
            }
        }

        const result =
            Array.from(merged.values());

        console.log("✅ FINAL RESULT:");
        console.log(result);

        alert(
            "Parser found " +
            result.length +
            " possible parts"
        );

        return result;

    } catch (err) {

        console.error(err);

        alert(
            "Parser Crash:\n" +
            (err?.message || err)
        );

        return [];
    }
}
