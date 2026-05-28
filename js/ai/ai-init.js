(function () {

    console.log("FINAL ai-init.js LOADED");

    function initAIScan() {

        const fileInput =
            document.getElementById('ai-scan-input');

        if (!fileInput) {

            console.error(
                "AI scan input not found"
            );

            return;
        }

        fileInput.onchange =
            async function (e) {

            const file =
                e.target.files[0];

            if (!file)
                return;

            try {

                // =====================================
                // BUTTON LOADING
                // =====================================

                const scanBtn =
                    document.getElementById('ai-scan-btn');

                if (scanBtn) {

                    scanBtn.disabled = true;

                    scanBtn.innerHTML =
                        '<i class="fas fa-spinner fa-spin"></i> Scanning...';
                }

                console.log(
                    "Scanning file:",
                    file.name
                );

                // =====================================
                // OCR
                // =====================================

                const ocrResult =
                    await extractTextFromFile(file);

                console.log(
                    "OCR completed"
                );

                // =====================================
                // PARSE ITEMS
                // =====================================

                const items =
                    extractItemsFromText(
                        ocrResult
                    );

                console.log(
                    "Parsed items:",
                    items
                );

                // =====================================
                // EXPORT OCR ITEMS
                // =====================================

                if (
                    typeof exportOCRToExcel ===
                    'function'
                ) {

                    exportOCRToExcel(
                        items
                    );
                }

                // =====================================
                // NO ITEMS
                // =====================================

                if (
                    !items ||
                    items.length === 0
                ) {

                    alert(
                        "No valid part number found."
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

                // =====================================
                // NO MATCH
                // =====================================

                if (
                    matches.length === 0
                ) {

                    alert(
                        "OCR exported.\nNo matching products found."
                    );

                    return;
                }

                // =====================================
                // EXPORT MATCHED PRODUCTS
                // =====================================

                if (
                    typeof exportScannedItemsToExcel ===
                    'function'
                ) {

                    exportScannedItemsToExcel(
                        matches
                    );
                }

                // =====================================
                // REVIEW MODAL
                // =====================================

                if (
                    typeof showReviewModal ===
                    'function'
                ) {

                    showReviewModal(
                        matches
                    );
                }

            } catch (err) {

                console.error(err);

                alert(
                    "AI Scan Error:\n" +
                    err.message
                );

            } finally {

                // =====================================
                // RESET BUTTON
                // =====================================

                const scanBtn =
                    document.getElementById('ai-scan-btn');

                if (scanBtn) {

                    scanBtn.disabled = false;

                    scanBtn.innerHTML =
                        '<i class="fas fa-camera"></i> Scan Order';
                }

                fileInput.value = '';
            }
        };

        console.log(
            "AI Scan initialized"
        );
    }

    // =====================================
    // WAIT FOR PRODUCTS
    // =====================================

    function waitForProducts() {

        if (

            window.allProducts &&
            window.allProducts.length > 0

        ) {

            console.log(
                "Products loaded:",
                window.allProducts.length
            );

            // =====================================
            // BUILD NORMALIZED INDEX
            // =====================================

            if (
                typeof buildNormalizedIndex ===
                'function'
            ) {

                buildNormalizedIndex();
            }

            // =====================================
            // INIT FUSE
            // =====================================

            if (
                typeof initFuse ===
                'function'
            ) {

                initFuse();
            }

            // =====================================
            // START AI SCAN
            // =====================================

            initAIScan();

        } else {

            console.log(
                "Waiting for products..."
            );

            setTimeout(
                waitForProducts,
                1000
            );
        }
    }

    // =====================================
    // START
    // =====================================

    waitForProducts();

})();
