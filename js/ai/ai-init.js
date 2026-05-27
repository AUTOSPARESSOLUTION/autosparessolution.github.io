(function() {

    alert("🔵 AI init: script loaded");

    if (typeof showReviewModal !== 'function') {

        window.showReviewModal = function(matches) {

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
    }

    function initAIScan() {

        const fileInput =
            document.getElementById('ai-scan-input');

        if (!fileInput) {

            alert("❌ File input not found!");

            return;
        }

        fileInput.onchange = async function(e) {

            const file = e.target.files[0];

            if (!file) return;

            try {

                const ocrResult =
                    await extractTextFromFile(file);

                const extractedText =
                    typeof ocrResult === 'string'
                        ? ocrResult
                        : (ocrResult.text || '');

                if (
                    extractedText.length < 3
                ) {

                    alert(
                        "⚠️ No OCR text extracted"
                    );

                    return;
                }

                const items =
                    extractItemsFromText(
                        ocrResult
                    );

                alert(
                    "Items parsed: " +
                    items.length
                );

                if (
                    items.length === 0
                ) {

                    alert(
                        "⚠️ No valid part no found"
                    );

                    return;
                }

                if (
                    !window.allProducts ||
                    window.allProducts.length === 0
                ) {

                    alert(
                        "❌ Product database missing"
                    );

                    return;
                }

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

                if (
                    matches.length === 0
                ) {

                    alert(
                        "⚠️ No matching products found"
                    );

                    return;
                }

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
    }

    function waitForProducts() {

        if (
            window.allProducts &&
            window.allProducts.length > 0
        ) {

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

            setTimeout(
                waitForProducts,
                1000
            );
        }
    }

    waitForProducts();

})();
