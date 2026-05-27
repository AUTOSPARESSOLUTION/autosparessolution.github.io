console.log("FINAL ai-init.js LOADED");

(function () {

    // =====================================
    // INIT AI SCAN
    // =====================================

    function initAIScan() {

        console.log("initAIScan() started");

        const fileInput =
            document.getElementById('ai-scan-input');

        if (!fileInput) {

            alert("ai-scan-input not found");

            return;
        }

        fileInput.onchange = async function (e) {

            const file =
                e.target.files[0];

            if (!file)
                return;

            try {

                // =====================================
                // DEBUG FILE INFO
                // =====================================

                alert(
                    "FILE:\n\n" +
                    file.name +
                    "\n\nTYPE:\n" +
                    file.type
                );

                console.log(
                    "Selected File:",
                    file
                );

                // =====================================
                // OCR
                // =====================================

                alert("Starting OCR...");

                const ocrResult =
                    await extractTextFromFile(file);

                console.log(
                    "FULL OCR RESULT:",
                    ocrResult
                );

                // =====================================
                // OCR TEXT
                // =====================================

                const extractedText =

                    typeof ocrResult === 'string'

                        ? ocrResult

                        : (ocrResult.text || '');

                console.log(
                    "OCR TEXT:",
                    extractedText
                );

                alert(
                    "OCR LENGTH: " +
                    extractedText.length
                );

                // =====================================
                // SHOW OCR PREVIEW
                // =====================================

                alert(
                    "OCR PREVIEW:\n\n" +
                    extractedText.substring(0, 1000)
                );

                // =====================================
                // EMPTY OCR CHECK
                // =====================================

                if (
                    extractedText.length < 5
                ) {

                    alert(
                        "OCR FAILED - EMPTY TEXT"
                    );

                    return;
                }

                // =====================================
                // PARSER
                // =====================================

                alert("Parsing items...");

                const items =
                    extractItemsFromText(
                        ocrResult
                    );

                console.log(
                    "PARSED ITEMS:",
                    items
                );

                alert(
                    "ITEMS PARSED: " +
                    items.length
                );

                // =====================================
                // NO ITEMS
                // =====================================

                if (
                    items.length === 0
                ) {

                    alert(
                        "NO VALID PART NUMBER FOUND"
                    );

                    return;
                }

                // =====================================
                // PRODUCTS CHECK
                // =====================================

                if (
                    !window.allProducts ||
                    window.allProducts.length === 0
                ) {

                    alert(
                        "PRODUCT DATABASE NOT LOADED"
                    );

                    return;
                }

                // =====================================
                // MATCH PRODUCTS
                // =====================================

                alert("Matching products...");

                const matches = [];

                for (const item of items) {

                    console.log(
                        "Matching:",
                        item
                    );

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
                    "FINAL MATCHES:",
                    matches
                );

                alert(
                    "MATCHES FOUND: " +
                    matches.length
                );

                // =====================================
                // NO MATCHES
                // =====================================

                if (
                    matches.length === 0
                ) {

                    alert(
                        "NO MATCHING PRODUCTS FOUND"
                    );

                    return;
                }

                // =====================================
                // SHOW RESULTS
                // =====================================

                if (
                    typeof showReviewModal === 'function'
                ) {

                    showReviewModal(matches);

                } else {

                    let msg =
                        "MATCHES:\n\n";

                    for (const m of matches) {

                        msg +=
                            m.partRaw +
                            " → " +
                            (m.product?.part || 'NO PRODUCT') +
                            " x" +
                            m.qty +
                            "\n";
                    }

                    alert(msg);
                }

            } catch (err) {

                console.error(err);

                alert(
                    "SCAN ERROR:\n\n" +
                    err.message
                );
            }

            fileInput.value = '';
        };

        console.log(
            "AI SCAN READY"
        );
    }

    // =====================================
    // WAIT FOR PRODUCTS
    // =====================================

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

            // =====================================
            // BUILD INDEX
            // =====================================

            if (
                typeof buildNormalizedIndex === 'function'
            ) {

                buildNormalizedIndex();

                console.log(
                    "Normalized index ready"
                );
            }

            // =====================================
            // INIT FUSE
            // =====================================

            if (
                typeof initFuse === 'function'
            ) {

                initFuse();

                console.log(
                    "Fuse ready"
                );
            }

            // =====================================
            // START AI
            // =====================================

            initAIScan();

            console.log(
                "AI SYSTEM READY"
            );

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
    // START SYSTEM
    // =====================================

    waitForProducts();

})();
