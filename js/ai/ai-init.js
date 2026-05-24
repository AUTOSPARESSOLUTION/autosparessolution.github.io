// ai-init.js – initialises AI scan button and file handler
(function() {
    console.log("AI Scan Module initialising...");

    function initAIScan() {
        const scanBtn = document.getElementById('ai-scan-btn');
        const fileInput = document.getElementById('ai-scan-input');
        if (!scanBtn || !fileInput) {
            console.error("Scan button or file input not found!");
            return;
        }
        // Remove any existing listeners by cloning (clean way)
        const newScanBtn = scanBtn.cloneNode(true);
        scanBtn.parentNode.replaceChild(newScanBtn, scanBtn);
        const newFileInput = fileInput.cloneNode(true);
        fileInput.parentNode.replaceChild(newFileInput, fileInput);

        newScanBtn.addEventListener('click', () => {
            console.log("Scan button clicked");
            newFileInput.click();
        });

        newFileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            console.log("File selected:", file.name, "size:", file.size);
            if (typeof showToast === 'function') {
                showToast("Processing file...", false);
            } else {
                alert("Processing...");
            }
            try {
                const extractedText = await extractTextFromFile(file);
                console.log("Extracted text length:", extractedText.length);
                if (extractedText.length < 5) {
                    if (typeof showToast === 'function') showToast("No text extracted. Try a clearer image.", true);
                    return;
                }
                const items = extractItemsFromText(extractedText);
                console.log("Parsed items:", items);
                if (items.length === 0) {
                    if (typeof showToast === 'function') showToast("No part numbers found.", true);
                    return;
                }
                if (!window.allProducts || window.allProducts.length === 0) {
                    console.error("Product database not ready!");
                    if (typeof showToast === 'function') showToast("Products not loaded yet. Refresh and try again.", true);
                    return;
                }
                const matches = [];
                for (const item of items) {
                    const match = matchProduct(item);
                    if (match) {
                        matches.push({ ...item, product: match.product, confidence: match.confidence });
                    } else {
                        matches.push({ ...item, product: null, confidence: 0 });
                    }
                }
                console.log("Matches ready:", matches.length);
                showReviewModal(matches);
            } catch (err) {
                console.error("Scan error:", err);
                if (typeof showToast === 'function') showToast("Scan failed: " + err.message, true);
            }
            newFileInput.value = ''; // allow re-upload
        });
        console.log("AI Scan button ready");
    }

    function waitForProducts() {
        if (window.allProducts && window.allProducts.length > 0) {
            console.log("Products loaded (" + window.allProducts.length + "). Initialising AI scan...");
            if (typeof buildNormalizedIndex === 'function') buildNormalizedIndex();
            if (typeof initFuse === 'function') initFuse();
            initAIScan();
            if (typeof bindModalEvents === 'function') bindModalEvents();
        } else {
            console.log("Waiting for allProducts...");
            setTimeout(waitForProducts, 500);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', waitForProducts);
    } else {
        waitForProducts();
    }
})();
