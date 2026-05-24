// ai-init.js – simple, robust version (no cloning, camera works)
(function() {
    console.log("AI Scan Module initialising...");

    function initAIScan() {
        const scanBtn = document.getElementById('ai-scan-btn');
        const fileInput = document.getElementById('ai-scan-input');
        if (!scanBtn || !fileInput) {
            console.error("Scan button or file input not found");
            return;
        }
        // Direct assignment – no cloning, preserves existing element
        scanBtn.onclick = function(e) {
            e.preventDefault();
            console.log("Scan button clicked");
            fileInput.click();
        };
        fileInput.onchange = async function(e) {
            const file = e.target.files[0];
            if (!file) return;
            console.log("File selected:", file.name);
            if (typeof showToast === 'function') showToast("Processing...", false);
            try {
                const extractedText = await extractTextFromFile(file);
                console.log("Extracted text length:", extractedText.length);
                if (extractedText.length < 5) {
                    if (typeof showToast === 'function') showToast("No text extracted. Try a clearer image.", true);
                    return;
                }
                const items = extractItemsFromText(extractedText);
                console.log("Parsed items:", items);
                if (!items.length) {
                    if (typeof showToast === 'function') showToast("No part numbers found.", true);
                    return;
                }
                if (!window.allProducts || window.allProducts.length === 0) {
                    console.error("Product database not ready");
                    if (typeof showToast === 'function') showToast("Products not loaded. Refresh.", true);
                    return;
                }
                const matches = [];
                for (const item of items) {
                    const match = matchProduct(item);
                    if (match) matches.push({ ...item, product: match.product, confidence: match.confidence });
                    else matches.push({ ...item, product: null, confidence: 0 });
                }
                showReviewModal(matches);
            } catch(err) {
                console.error("Scan error:", err);
                if (typeof showToast === 'function') showToast("Scan failed: " + err.message, true);
            }
            fileInput.value = ''; // allow re-upload
        };
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
