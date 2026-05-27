console.log("NEW ai-init.js LOADED");

(function () {

    function initAIScan() {

        const fileInput =
            document.getElementById(
                'ai-scan-input'
            );

        if (!fileInput) {

            console.error(
                "File input not found"
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

                    const ocrResult =
                        await extractTextFromFile(file);

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

                    if (
                        typeof showReviewModal === 'function'
                    ) {

                        showReviewModal(matches);

                    } else {

                        alert(
                            JSON.stringify(matches, null, 2)
                        );
                    }

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

    function waitForProducts() {

        if (
            window.allProducts &&
            window.allProducts.length > 0
        ) {

            buildNormalizedIndex();

            initFuse();

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

    waitForProducts();

})();
