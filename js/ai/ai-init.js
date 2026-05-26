(function () {

    console.log("🔵 AI Scan System Loading...");

    // =========================================================
    // SAFE FALLBACK MODAL
    // =========================================================

    if (typeof showReviewModal !== 'function') {

        window.showReviewModal = function (matches) {

            let msg = "Matched Products:\n\n";

            matches.forEach(m => {
                msg += `${m.partRaw} → ${m.product?.part || 'NO MATCH'} x${m.qty}\n`;
            });

            if (confirm(msg + "\nAdd all items to cart?")) {

                let added = 0;

                matches.forEach(m => {

                    if (
                        m.product &&
                        typeof window.aiAddToCart === 'function'
                    ) {

                        window.aiAddToCart(
                            m.product.part,
                            m.product.price,
                            m.qty
                        );

                        added++;
                    }
                });

                if (
                    added &&
                    typeof updateCartUI === 'function'
                ) {
                    updateCartUI();
                }

                alert(`✅ ${added} items added to cart`);
            }
        };

        window.confirmAddScannedItems = function () {};
        window.bindModalEvents = function () {};

        console.log("📦 Fallback modal installed");
    }

    // =========================================================
    // NORMALIZE PART
    // =========================================================

    function normalizePart(part) {

        if (!part) return '';

        return part
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, '')
            .trim();
    }

    // =========================================================
    // IMPROVED OCR PARSER
    // =========================================================

    function extractItemsFromText(ocrResult) {

        const text = typeof ocrResult === 'string'
            ? ocrResult
            : (ocrResult?.text || '');

        if (!text || text.length < 5) {
            console.warn("⚠️ OCR text empty");
            return [];
        }

        // =====================================================
        // CLEAN OCR TEXT
        // =====================================================

        let cleaned = text
            .replace(/\r/g, '')
            .replace(/[ \t]+/g, ' ')
            .replace(/Pcs\./gi, 'PCS')
            .replace(/Pc\b/gi, 'PC')
            .replace(/\n{2,}/g, '\n');

        let rawLines = cleaned
            .split('\n')
            .map(l => l.trim())
            .filter(Boolean);

        // =====================================================
        // MERGE BROKEN OCR LINES
        // =====================================================

        const lines = [];

        for (let i = 0; i < rawLines.length; i++) {

            let line = rawLines[i];

            if (
                i + 1 < rawLines.length &&
                !/\b(?:PC|PCS|NOS)\b/i.test(line) &&
                !/^\d+\s+[A-Z0-9]/.test(rawLines[i + 1])
            ) {

                line += ' ' + rawLines[i + 1];
                i++;
            }

            lines.push(line);
        }

        // =====================================================
        // IGNORE INVOICE METADATA
        // =====================================================

        const ignorePattern =
            /(invoice|gstin|cgst|sgst|taxable|total|amount|bank|declaration|jurisdiction|authorised|output|state|email|phone|mobile|ack|irn|terms|e-mail)/i;

        const items = [];

        // =====================================================
        // PARSE TABLE ROWS
        // =====================================================

        for (const line of lines) {

            if (!line) continue;

            if (ignorePattern.test(line))
                continue;

            // Must contain quantity
            if (
                !/\b\d+\s*(PC|PCS|NOS)\b/i.test(line)
            ) {
                continue;
            }

            const tokens = line.split(/\s+/);

            let part = null;
            let qty = 1;

            // =================================================
            // FIND PART NUMBER
            // =================================================

            for (let token of tokens) {

                token = token
                    .toUpperCase()
                    .replace(/[.,]/g, '');

                // Skip serial number
                if (/^\d{1,3}$/.test(token))
                    continue;

                // Skip HSN
                if (/^\d{8}$/.test(token))
                    continue;

                // Skip percentages
                if (/^\d+%?$/.test(token))
                    continue;

                // Skip money values
                if (/^\d+\.\d+$/.test(token))
                    continue;

                const hasLetter = /[A-Z]/.test(token);
                const hasDigit = /\d/.test(token);

                // =================================================
                // VALID ALPHANUMERIC PART
                // =================================================

                if (
                    hasLetter &&
                    hasDigit &&
                    token.length >= 5
                ) {

                    part = token;
                    break;
                }

                // =================================================
                // VALID NUMERIC PART
                // =================================================

                if (/^\d{5,8}$/.test(token)) {

                    part = token;
                    break;
                }
            }

            // =================================================
            // FIND QUANTITY
            // =================================================

            const qtyMatch = line.match(
                /\b(\d{1,3})\s*(PC|PCS|NOS)\b/i
            );

            if (qtyMatch) {
                qty = parseInt(qtyMatch[1]) || 1;
            }

            // =================================================
            // SAVE
            // =================================================

            if (part) {

                items.push({
                    partRaw: part,
                    qty: qty
                });
            }
        }

        // =====================================================
        // MERGE DUPLICATES
        // =====================================================

        const merged = new Map();

        for (const item of items) {

            const key = normalizePart(item.partRaw);

            if (!key) continue;

            if (merged.has(key)) {

                merged.get(key).qty += item.qty;

            } else {

                merged.set(key, {
                    partRaw: item.partRaw,
                    qty: item.qty
                });
            }
        }

        const result = Array.from(merged.values());

        console.log("✅ FINAL PARSED ITEMS:", result);

        return result;
    }

    // =========================================================
    // AI SCAN INITIALIZER
    // =========================================================

    function initAIScan() {

        console.log("🟢 Initializing AI Scan");

        const fileInput =
            document.getElementById('ai-scan-input');

        if (!fileInput) {

            console.error("❌ ai-scan-input not found");

            return;
        }

        // =====================================================
        // FILE SELECT EVENT
        // =====================================================

        fileInput.onchange = async function (e) {

            const file = e.target.files[0];

            if (!file) return;

            console.log("📎 File selected:", file.name);

            try {

                // =============================================
                // OCR / PDF EXTRACTION
                // =============================================

                const ocrResult =
                    await extractTextFromFile(file);

                const extractedText =
                    typeof ocrResult === 'string'
                        ? ocrResult
                        : (ocrResult?.text || '');

                console.log(
                    "📄 OCR TEXT:",
                    extractedText.substring(0, 1000)
                );

                if (
                    !extractedText ||
                    extractedText.length < 10
                ) {

                    alert("⚠️ No readable text found");

                    return;
                }

                // =============================================
                // PARSE ITEMS
                // =============================================

                const items =
                    extractItemsFromText(ocrResult);

                console.log("📦 Parsed Items:", items);

                if (items.length === 0) {

                    alert(
                        "⚠️ No valid part numbers found"
                    );

                    return;
                }

                // =============================================
                // PRODUCT DATABASE CHECK
                // =============================================

                if (
                    !window.allProducts ||
                    window.allProducts.length === 0
                ) {

                    alert(
                        "❌ Product database not loaded"
                    );

                    return;
                }

                // =============================================
                // MATCH PRODUCTS
                // =============================================

                const matches = [];

                for (const item of items) {

                    if (
                        typeof matchProduct !== 'function'
                    ) continue;

                    const match = matchProduct(item);

                    // =========================================
                    // CONFIDENCE FILTER
                    // =========================================

                    if (
                        match &&
                        (
                            match.confidence === undefined ||
                            match.confidence >= 0.60
                        )
                    ) {

                        matches.push({
                            ...item,
                            product: match.product,
                            confidence: match.confidence || 1
                        });
                    }
                }

                console.log("🎯 Matches:", matches);

                if (matches.length === 0) {

                    alert(
                        "⚠️ No matching products found"
                    );

                    return;
                }

                // =============================================
                // SHOW REVIEW MODAL
                // =============================================

                showReviewModal(matches);

            } catch (err) {

                console.error(err);

                alert(
                    "❌ Scan Error:\n" + err.message
                );
            }

            // Reset input
            fileInput.value = '';
        };

        console.log("✅ AI Scan Ready");
    }

    // =========================================================
    // WAIT FOR PRODUCT DATABASE
    // =========================================================

    function waitForProducts() {

        console.log("⏳ Waiting for products...");

        if (
            window.allProducts &&
            window.allProducts.length > 0
        ) {

            console.log(
                `✅ Products Loaded: ${window.allProducts.length}`
            );

            if (
                typeof buildNormalizedIndex === 'function'
            ) {
                buildNormalizedIndex();
            }

            if (
                typeof initFuse === 'function'
            ) {
                initFuse();
            }

            initAIScan();

            if (
                typeof bindModalEvents === 'function'
            ) {
                bindModalEvents();
            }

        } else {

            setTimeout(waitForProducts, 1000);
        }
    }

    // =========================================================
    // START SYSTEM
    // =========================================================

    waitForProducts();

})();
