(function () {

    console.log("AI INIT LOADED");

    // =========================================
    // FALLBACK MODAL
    // =========================================

    if (typeof showReviewModal !== 'function') {

        window.showReviewModal = function (matches) {

            let msg = "Matched Products:\n\n";

            for (const m of matches) {

                if (m.product) {

                    msg +=
                        `${m.partRaw} → ${m.product.part} x${m.qty}\n`;
                }
            }

            if (
                confirm(
                    msg +
                    "\nAdd all to cart?"
                )
            ) {

                let added = 0;

                for (const m of matches) {

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

                alert(`Added ${added} items`);
            }
        };

        window.confirmAddScannedItems = function () {};
        window.bindModalEvents = function () {};
    }

    // =========================================
    // MAIN SCAN INIT
    // =========================================

    function initAIScan() {

        console.log("initAIScan called");

        const fileInput =
            document.getElementById('ai-scan-input');

        if (!fileInput) {

            console.error(
                "ai-scan-input not found"
            );

            return;
        }

        fileInput.onchange = async function (e) {

            const file =
                e.target.files[0];

            if (!file)
                return;

            try {

                console.log(
                    "Starting OCR..."
                );

                const ocrResult =
                    await extractTextFromFile(file);

                const extractedText =
                    typeof ocrResult === 'string'
                        ? ocrResult
                        : (ocrResult.text || '');

                console.log(
                    "OCR Length:",
                    extractedText.length
                );

                if (
                    extractedText.length < 10
                ) {

                    alert(
                        "No text extracted"
                    );

                    return;
                }

                // =====================================
                // PARSER
                // =====================================

                const items =
                    extractItemsFromText(
                        ocrResult
                    );

                console.log(
                    "Items Parsed:",
                    items
                );

                if (
                    items.length === 0
                ) {

                    alert(
                        "No valid part number found"
                    );

                    return;
                }

                // =====================================
                // PRODUCT DB CHECK
                // =====================================

                if (
                    !window.allProducts ||
                    window.allProducts.length === 0
                ) {

                    alert(
                        "Product database not loaded"
                    );

                    return;
                }

                // =====================================
                // MATCH PRODUCTS
                // =====================================

                const matches = [];

                for (const item of items) {

                    const match =
                        matchProduct(item);

                    if (match) {

                        matches.push({

                            ...item,

                            product:
                                match.product,

                            confidence:
                                match.confidence
                        });
                    }
                }

                console.log(
                    "Matches:",
                    matches
                );

                if (
                    matches.length === 0
                ) {

                    alert(
                        "No matching products found"
                    );

                    return;
                }

                // =====================================
                // SHOW MODAL
                // =====================================

                showReviewModal(matches);

            } catch (err) {

                console.error(err);

                alert(
                    "Scan error: " +
                    err.message
                );
            }

            fileInput.value = '';
        };

        console.log(
            "AI Scan Ready"
        );
    }

    // =========================================
    // WAIT FOR PRODUCTS
    // =========================================

    function waitForProducts() {

        console.log(
            "Checking products..."
        );

        if (
            window.allProducts &&
            window.allProducts.length > 0
        ) {

            console.log(
                "Products Loaded:",
                window.allProducts.length
            );

            // build exact index

            if (
                typeof buildNormalizedIndex === 'function'
            ) {

                buildNormalizedIndex();

                console.log(
                    "Normalized index built"
                );
            }

            // build fuse

            if (
                typeof initFuse === 'function'
            ) {

                initFuse();

                console.log(
                    "Fuse initialized"
                );
            }

            // init scan

            initAIScan();

            // modal events

            if (
                typeof bindModalEvents === 'function'
            ) {

                bindModalEvents();
            }

        } else {

            console.log(
                "Waiting for products..."
            );

            // IMPORTANT FIX

            setTimeout(
                waitForProducts,
                1000
            );
        }
    }

    // =========================================
    // START
    // =========================================

    waitForProducts();

})();
