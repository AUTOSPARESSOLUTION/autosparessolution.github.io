(function() {
    alert("AI init loaded");
    
    function initAIScan() {
        const fileInput = document.getElementById('ai-scan-input');
        if (!fileInput) {
            alert("File input not found");
            return;
        }
        fileInput.onchange = async function(e) {
            const file = e.target.files[0];
            if (!file) return;
            alert("File selected: " + file.name);
            try {
                const ocrResult = await extractTextFromFile(file);
                const extractedText = typeof ocrResult === 'string' ? ocrResult : ocrResult.text;
                alert("OCR text length: " + extractedText.length);
                const items = extractItemsFromText(ocrResult);
                alert("Items extracted: " + items.length);
                if (!items.length) return;
                const matches = [];
                for (const item of items) {
                    const match = matchProduct(item);
                    if (match) matches.push({ ...item, product: match.product, confidence: match.confidence });
                }
                alert("Matches: " + matches.length);
                if (typeof showReviewModal === 'function') showReviewModal(matches);
                else alert("showReviewModal missing");
            } catch(err) {
                alert("Error: " + err.message);
            }
        };
        alert("AI scan ready");
    }
    
    function waitForProducts() {
        if (window.allProducts && window.allProducts.length > 0) {
            alert("Products loaded: " + window.allProducts.length);
            if (typeof buildNormalizedIndex === 'function') buildNormalizedIndex();
            if (typeof initFuse === 'function') initFuse();
            initAIScan();
        } else {
            setTimeout(waitForProducts, 1000);
        }
    }
    waitForProducts();
})();
