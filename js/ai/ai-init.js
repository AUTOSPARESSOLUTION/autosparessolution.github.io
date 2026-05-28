(function () {

    console.log("SAFE ai-init.js LOADED");

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

                const scanBtn =
                    document.getElementById('ai-scan-btn');

                if (scanBtn) {

                    scanBtn.disabled = true;

                    scanBtn.innerHTML =
                        '<i class="fas fa-spinner fa-spin"></i> Scanning...';
                }

                // =====================================
                // OCR
                // =====================================

                const ocrResult =
                    await extractTextFromFile(file);

                console.log(
                    "OCR completed"
                );

                // =====================================
                // PARSE
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
                // EXPORT OCR
                // =====================================

                if (
                    typeof exportOCRToExcel ===
                    'function'
                ) {

                    setTimeout(() => {

                        exportOCRToExcel(items);

                    }, 500);
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
                // MATCH
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
                // EXPORT MATCHED
                // =====================================

                if (
                    typeof exportScannedItemsToExcel ===
                    'function'
                ) {

                    setTimeout(() => {

                        exportScannedItemsToExcel(
                            matches
                        );

                    }, 1000);
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
    // WAIT PRODUCTS
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

            if (
                typeof buildNormalizedIndex ===
                'function'
            ) {

                buildNormalizedIndex();
            }

            if (
                typeof initFuse ===
                'function'
            ) {

                initFuse();
            }

            initAIScan();

        } else {

            setTimeout(
                waitForProducts,
                1000
            );
        }
    }

    waitForProducts();

})();
