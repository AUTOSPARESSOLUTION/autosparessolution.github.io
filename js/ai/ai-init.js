(function() {

    alert("🔵 AI init: script loaded");

    // =====================================================
    // FALLBACK MODAL
    // =====================================================

    if (typeof showReviewModal !== 'function') {

        window.showReviewModal = function(matches) {

            alert(
                "✅ Fallback modal: " +
                matches.length +
                " matches found.\n" +
                JSON.stringify(
                    matches.map(m => ({
                        part: m.partRaw,
                        qty: m.qty,
                        product: m.product?.part
                    })),
                    null,
                    2
                )
            );

            let msg = "Add to cart?\n";

            for (let m of matches) {

                if (m.product) {

                    msg += `${m.partRaw} → ${m.product.part} x${m.qty}\n`;
                }
            }

            if (confirm(msg + "\nClick OK to add all")) {

                let added = 0;

                for (let m of matches) {

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
                }

                if (
                    added &&
                    typeof updateCartUI === 'function'
                ) {
                    updateCartUI();
                }

                alert(`Added ${added} items to cart`);
            }
        };

        window.confirmAddScannedItems = function() {};
        window.bindModalEvents = function() {};

        alert("📦 Fallback modal installed");
    }

    // =====================================================
    // INIT AI SCAN
    // =====================================================

    function initAIScan() {

        alert("🟢 initAIScan called");

        const fileInput =
            document.getElementById('ai-scan-input');

        if (!fileInput) {

            alert("❌ File input not found!");

            return;
        }

        alert("✅ File input found");

        fileInput.onchange = async function(e) {

            const file = e.target.files[0];

            if (!file) return;

            alert("📎 File selected: " + file.name);

            try {

                // =========================================
                // OCR
                // =========================================

                alert("📷 Calling extractTextFromFile...");

                const ocrResult =
                    await extractTextFromFile(file);

                console.log("OCR RESULT:", ocrResult);

                const extractedText =
                    typeof ocrResult === 'string'
                        ? ocrResult
                        : (ocrResult.text || '');

                alert(
                    "📄 OCR text length: " +
                    extractedText.length
                );

                console.log(
                    "OCR TEXT:\n",
                    extractedText
                );

                if (
                    extractedText.length < 5
                ) {

                    alert(
                        "⚠️ No text extracted (OCR failed)"
                    );

                    return;
                }

                // =========================================
                // PARSER
                // =========================================

                alert("🔧 Parsing items...");

                const items =
                    extractItemsFromText(
                        ocrResult
                    );

                console.log(
                    "PARSED ITEMS:",
                    items
                );

                alert(
                    "📦 Items parsed: " +
                    items.length
                );

                if (
                    items.length === 0
                ) {

                    alert(
                        "⚠️ No part numbers found in OCR text."
                    );

                    return;
                }

                // =========================================
                // PRODUCTS
                // =========================================

                if (
                    !window.allProducts ||
                    window.allProducts.length === 0
                ) {

                    alert(
                        "❌ Product database not loaded"
                    );

                    return;
                }

                // =========================================
                // MATCHING
                // =========================================

                alert("🎯 Matching products...");

                const matches = [];

                for (const item of items) {

                    const match =
                        matchProduct(item);

                    if (match) {

                        matches.push({
                            ...item,
                            product: match.product,
                            confidence:
                                match.confidence
                        });
                    }
                }

                console.log(
                    "MATCHES:",
                    matches
                );

                alert(
                    "✅ Matches ready: " +
                    matches.length
                );

                if (
                    matches.length === 0
                ) {

                    alert(
                        "⚠️ No matches found in product database"
                    );

                    return;
                }

                alert("🖼️ Opening review modal...");

                showReviewModal(matches);

            } catch(err) {

                console.error(err);

                alert(
                    "❌ ERROR:\n" +
                    (err?.message || err)
                );
            }

            fileInput.value = '';
        };

        alert("🟢 AI Scan ready");
    }

    // =====================================================
    // WAIT PRODUCTS
    // =====================================================

    function waitForProducts() {

        alert(
            "⏳ waitForProducts checking..."
        );

        if (
            window.allProducts &&
            window.allProducts.length > 0
        ) {

            alert(
                "✅ Products loaded: " +
                window.allProducts.length
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

            alert(
                "⏳ allProducts not ready, retrying..."
            );

            setTimeout(
                waitForProducts,
                1000
            );
        }
    }

    waitForProducts();

})();
