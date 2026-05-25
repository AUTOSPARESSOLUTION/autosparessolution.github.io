(function() {
    alert("AI init: script loaded");

    // ========== FALLBACK MODAL (in case ai-review-modal.js is missing) ==========
    if (typeof showReviewModal !== 'function') {
        window.showReviewModal = function(matches) {
            alert("FALLBACK MODAL: " + matches.length + " matches found.\n" + JSON.stringify(matches, null, 2));
            // You can also add a simple HTML modal here if needed
        };
        window.confirmAddScannedItems = function() { alert("Add items to cart (fallback)"); };
        window.bindModalEvents = function() { };
        console.log("Fallback modal functions installed");
    }

    function initAIScan() {
        alert("initAIScan called");
        const fileInput = document.getElementById('ai-scan-input');
        if (!fileInput) {
            alert("File input not found!");
            return;
        }
        fileInput.onchange = async function(e) {
            const file = e.target.files[0];
            if (!file) return;
            alert("File selected: " + file.name);
            try {
                const ocrResult = await extractTextFromFile(file);
                const extractedText = typeof ocrResult === 'string' ? ocrResult : (ocrResult.text || '');
                alert("OCR text length: " + extractedText.length);
                if (extractedText.length < 5) {
                    alert("No text extracted");
                    return;
                }
                const items = extractItemsFromText(ocrResult);
                alert("Items parsed: " + items.length);
                if (!items.length) return;
                if (!window.allProducts || window.allProducts.length === 0) {
                    alert("allProducts missing");
                    return;
                }
                const matches = [];
                for (const item of items) {
                    const match = matchProduct(item);
                    if (match) matches.push({ ...item, product: match.product, confidence: match.confidence });
                }
                alert("Matches ready: " + matches.length);
                showReviewModal(matches);
            } catch(err) {
                alert("Error: " + err.message);
            }
            fileInput.value = '';
        };
        alert("AI Scan ready");
    }

    function waitForProducts() {
        alert("waitForProducts");
        if (window.allProducts && window.allProducts.length > 0) {
            alert("Products loaded: " + window.allProducts.length);
            if (typeof buildNormalizedIndex === 'function') buildNormalizedIndex();
            if (typeof initFuse === 'function') initFuse();
            initAIScan();
            if (typeof bindModalEvents === 'function') bindModalEvents();
        } else {
            alert("allProducts not ready, retrying");
            setTimeout(waitForProducts, 1000);
        }
    }

    waitForProducts();
})();
