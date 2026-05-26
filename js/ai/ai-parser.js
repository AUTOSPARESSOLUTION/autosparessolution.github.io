(function () {

    console.log("🔵 AI SYSTEM STARTING");

    // =====================================================
    // FALLBACK MODAL
    // =====================================================

    if (typeof showReviewModal !== 'function') {

        window.showReviewModal = function (matches) {

            let msg = "MATCHES FOUND:\n\n";

            matches.forEach(m => {

                msg += `${m.partRaw} x${m.qty}\n`;

            });

            alert(msg);
        };
    }

    // =====================================================
    // NORMALIZE PART
    // =====================================================

    function normalizePart(part) {

        if (!part) return '';

        return String(part)
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, '')
            .trim();
    }

    // =====================================================
    // OCR FIX
    // =====================================================

    function correctOCRPart(part) {

        if (!part) return '';

        return part
            .replace(/O/g, '0')
            .replace(/I/g, '1')
            .replace(/L/g, '1');
    }

    // =====================================================
    // BUILD PRODUCT INDEX
    // =====================================================

    window.normalizedIndex = {};

    function buildNormalizedIndex() {

        window.normalizedIndex = {};

        if (!window.allProducts) {

            console.error("❌ allProducts missing");

            return;
        }

        for (const p of window.allProducts) {

            if (!p || !p.part)
                continue;

            const norm =
                normalizePart(p.part);

            if (!norm)
                continue;

            window.normalizedIndex[norm] = p;
        }

        console.log(
            "✅ INDEX BUILT:",
            Object.keys(window.normalizedIndex).length
        );
    }

    // =====================================================
    // MATCH PRODUCT
    // =====================================================

    function matchProduct(item) {

        if (!item || !item.partRaw)
            return null;

        const original =
            normalizePart(item.partRaw);

        if (!original)
            return null;

        // EXACT

        if (
            window.normalizedIndex &&
            window.normalizedIndex[original]
        ) {

            return {
                product:
                    window.normalizedIndex[original],
                confidence: 1
            };
        }

        // OCR FIXED

        const corrected =
            normalizePart(
                correctOCRPart(original)
            );

        if (
            corrected &&
            window.normalizedIndex[corrected]
        ) {

            return {
                product:
                    window.normalizedIndex[corrected],
                confidence: 0.95
            };
        }

        return null;
    }

    // =====================================================
    // OCR PARSER
    // =====================================================

    function extractItemsFromText(ocrResult) {

        try {

            console.log("🔵 PARSER START");

            let text = '';

            // =============================================
            // GET OCR TEXT
            // =============================================

            if (typeof ocrResult === 'string') {

                text = ocrResult;

            } else if (
                ocrResult &&
                typeof ocrResult.text === 'string'
            ) {

                text = ocrResult.text;
            }

            console.log(
                "📄 OCR TEXT LENGTH:",
                text.length
            );

            console.log(
                "📄 OCR RAW TEXT:"
            );

            console.log(text);

            alert(
                "OCR LENGTH: " +
                text.length
            );

            // =============================================
            // EMPTY
            // =============================================

            if (
                !text ||
                text.trim().length === 0
            ) {

                alert(
                    "❌ OCR RETURNED EMPTY TEXT"
                );

                return [];
            }

            // =============================================
            // CLEAN
            // =============================================

            let cleaned = text
                .toUpperCase()
                .replace(/\r/g, ' ')
                .replace(/\n/g, ' ')
                .replace(/[|]/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();

            console.log(
                "📄 CLEANED OCR:"
            );

            console.log(cleaned);

            // =============================================
            // GLOBAL SEARCH
            // =============================================

            const regex =
                /[A-Z0-9\-\/\.]{5,30}/g;

            const matches =
                cleaned.match(regex);

            console.log(
                "🔍 REGEX MATCHES:"
            );

            console.log(matches);

            alert(
                "RAW MATCHES: " +
                (
                    matches
                        ? matches.length
                        : 0
                )
            );

            if (
                !matches ||
                matches.length === 0
            ) {

                alert(
                    "❌ NO TOKENS FOUND"
                );

                return [];
            }

            const items = [];

            // =============================================
            // PROCESS TOKENS
            // =============================================

            for (let token of matches) {

                console.log(
                    "➡️ TOKEN:",
                    token
                );

                if (!token)
                    continue;

                let part =
                    normalizePart(token);

                if (!part)
                    continue;

                console.log(
                    "➡️ NORMALIZED:",
                    part
                );

                // Skip short
                if (part.length < 5)
                    continue;

                // Must contain digit
                if (!/\d/.test(part))
                    continue;

                // Skip invoice words
                if (
                    /TOTAL|CGST|SGST|IGST|AMOUNT|GST|TAX|STATE|HSN|RATE|QTY/i.test(part)
                ) {
                    continue;
                }

                // Skip huge numbers
                if (
                    /^\d{10,}$/.test(part)
                ) {
                    continue;
                }

                items.push({
                    partRaw: part,
                    qty: 1
                });
            }

            console.log(
                "📦 ITEMS:"
            );

            console.log(items);

            alert(
                "ITEMS FOUND: " +
                items.length
            );

            // =============================================
            // MERGE
            // =============================================

            const merged = new Map();

            for (const item of items) {

                if (
                    merged.has(item.partRaw)
                ) {

                    merged.get(item.partRaw).qty += 1;

                } else {

                    merged.set(
                        item.partRaw,
                        item
                    );
                }
            }

            const result =
                Array.from(
                    merged.values()
                );

            console.log(
                "✅ FINAL RESULT:"
            );

            console.log(result);

            alert(
                "FINAL PARTS: " +
                result.length
            );

            return result;

        } catch (err) {

            console.error(err);

            alert(
                "❌ PARSER CRASH:\n" +
                (
                    err?.message ||
                    err ||
                    "UNKNOWN"
                )
            );

            return [];
        }
    }

    // =====================================================
    // OCR
    // =====================================================

    async function performOCR(file) {

        try {

            if (
                typeof Tesseract === 'undefined'
            ) {

                alert(
                    "❌ Tesseract.js NOT loaded"
                );

                throw new Error(
                    "Tesseract.js missing"
                );
            }

            alert(
                "🔍 OCR STARTING..."
            );

            const result =
                await Tesseract.recognize(
                    file,
                    'eng'
                );

            console.log(
                "📄 OCR RESULT:"
            );

            console.log(result);

            const text =
                result?.data?.text || '';

            alert(
                "OCR COMPLETE\nTEXT LENGTH: " +
                text.length
            );

            return {
                text: text
            };

        } catch (err) {

            console.error(err);

            alert(
                "❌ OCR FAILED:\n" +
                (
                    err?.message ||
                    err
                )
            );

            return {
                text: ''
            };
        }
    }

    // =====================================================
    // FILE EXTRACTOR
    // =====================================================

    async function extractTextFromFile(file) {

        try {

            if (!file) {

                throw new Error(
                    "No file selected"
                );
            }

            console.log(
                "📎 FILE:",
                file.name
            );

            alert(
                "PROCESSING FILE:\n" +
                file.name
            );

            return await performOCR(file);

        } catch (err) {

            console.error(err);

            alert(
                "❌ FILE EXTRACT ERROR:\n" +
                (
                    err?.message ||
                    err
                )
            );

            return {
                text: ''
            };
        }
    }

    // =====================================================
    // INIT AI SCAN
    // =====================================================

    function initAIScan() {

        console.log(
            "🟢 INIT AI SCAN"
        );

        const fileInput =
            document.getElementById(
                'ai-scan-input'
            );

        if (!fileInput) {

            alert(
                "❌ ai-scan-input NOT FOUND"
            );

            return;
        }

        alert(
            "✅ FILE INPUT FOUND"
        );

        fileInput.onchange =
            async function (e) {

            try {

                const file =
                    e.target.files[0];

                if (!file) {

                    alert(
                        "❌ NO FILE SELECTED"
                    );

                    return;
                }

                alert(
                    "📎 FILE SELECTED:\n" +
                    file.name
                );

                // =========================================
                // OCR
                // =========================================

                const ocrResult =
                    await extractTextFromFile(file);

                console.log(
                    "🔵 OCR RESULT OBJECT:"
                );

                console.log(ocrResult);

                alert(
                    "OCR RESULT RECEIVED"
                );

                // =========================================
                // PARSER
                // =========================================

                const items =
                    extractItemsFromText(
                        ocrResult
                    );

                console.log(
                    "🔵 PARSED ITEMS:"
                );

                console.log(items);

                alert(
                    "PARSED ITEMS: " +
                    items.length
                );

                if (
                    items.length === 0
                ) {

                    alert(
                        "❌ NO VALID PARTS FOUND"
                    );

                    return;
                }

                // =========================================
                // MATCH PRODUCTS
                // =========================================

                const matches = [];

                for (const item of items) {

                    const match =
                        matchProduct(item);

                    if (
                        match &&
                        match.product
                    ) {

                        matches.push({
                            ...item,
                            product:
                                match.product
                        });
                    }
                }

                console.log(
                    "🎯 MATCHES:"
                );

                console.log(matches);

                alert(
                    "MATCHES FOUND: " +
                    matches.length
                );

                if (
                    matches.length === 0
                ) {

                    alert(
                        "❌ NO PRODUCT MATCHES"
                    );

                    return;
                }

                showReviewModal(matches);

            } catch (err) {

                console.error(err);

                alert(
                    "❌ MAIN ERROR:\n" +
                    (
                        err?.message ||
                        err ||
                        "UNKNOWN"
                    )
                );
            }
        };

        console.log(
            "✅ AI SCAN READY"
        );
    }

    // =====================================================
    // WAIT PRODUCTS
    // =====================================================

    function waitForProducts() {

        console.log(
            "⏳ WAITING PRODUCTS"
        );

        if (
            window.allProducts &&
            window.allProducts.length > 0
        ) {

            alert(
                "✅ PRODUCTS LOADED:\n" +
                window.allProducts.length
            );

            buildNormalizedIndex();

            initAIScan();

        } else {

            setTimeout(
                waitForProducts,
                1000
            );
        }
    }

    // =====================================================
    // START
    // =====================================================

    waitForProducts();

})();
