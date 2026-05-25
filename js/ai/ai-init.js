(function() {
    alert("DEBUG: AI init script loaded");

    function initAIScan() {
        alert("DEBUG: initAIScan called");
        const fileInput = document.getElementById('ai-scan-input');
        if (!fileInput) {
            alert("File input NOT found!");
            return;
        }
        fileInput.onchange = async function(e) {
            const file = e.target.files[0];
            if (!file) return;
            alert("DEBUG: File selected: " + file.name);
            try {
                const ocrResult = await extractTextFromFile(file);
                alert("DEBUG: OCR finished");
                
                const extractedText = typeof ocrResult === 'string' ? ocrResult : (ocrResult.text || '');
                alert("DEBUG: Text length = " + extractedText.length);
                
                const items = extractItemsFromText(ocrResult);
                alert("DEBUG: Items extracted = " + items.length);
                if (!items.length) { alert("No part numbers"); return; }
                
                if (!window.allProducts || window.allProducts.length === 0) {
                    alert("allProducts missing!");
                    return;
                }
                
                const matches = [];
                for (const item of items) {
                    const match = matchProduct(item);
                    if (match) matches.push({ ...item, product: match.product, confidence: match.confidence });
                }
                alert("DEBUG: Matches ready = " + matches.length);
                
                if (typeof showReviewModal !== 'function') {
                    alert("ERROR: showReviewModal is not a function!");
                    return;
                }
                alert("DEBUG: Calling showReviewModal...");
                showReviewModal(matches);
            } catch(err) {
                alert("ERROR: " + err.message);
            }
            fileInput.value = '';
        };
        alert("DEBUG: AI Scan ready (listener attached)");
    }

    function waitForProducts() {
        alert("DEBUG: waitForProducts - checking");
        if (window.allProducts && window.allProducts.length > 0) {
            alert("Products loaded: " + window.allProducts.length);
            if (typeof buildNormalizedIndex === 'function') buildNormalizedIndex();
            if (typeof initFuse === 'function') initFuse();
            initAIScan();
            if (typeof bindModalEvents === 'function') bindModalEvents();
        } else {
            alert("allProducts not ready, retrying...");
            setTimeout(waitForProducts, 1000);
        }
    }

    waitForProducts();
})();
