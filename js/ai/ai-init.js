(function() {
    alert("AI init: script loaded");

    function initAIScan() {
        alert("initAIScan called");
        const fileInput = document.getElementById('ai-scan-input');
        if (!fileInput) {
            alert("File input not found!");
            return;
        }
        alert("File input found, attaching onchange");
        fileInput.onchange = async function(e) {
            const file = e.target.files[0];
            if (!file) return;
            alert("File selected: " + file.name);
            try {
                alert("Calling extractTextFromFile...");
                const ocrResult = await extractTextFromFile(file);
                alert("OCR result type: " + typeof ocrResult);
                
                const extractedText = typeof ocrResult === 'string' ? ocrResult : (ocrResult.text || '');
                alert("Extracted text length: " + extractedText.length);
                if (extractedText.length < 5) {
                    alert("No text extracted. Image may be too blurry.");
                    return;
                }
                const items = extractItemsFromText(ocrResult);
                alert("Parsed items count: " + items.length + "\n" + JSON.stringify(items));
                if (!items.length) {
                    alert("No part numbers found.");
                    return;
                }
                if (!window.allProducts || window.allProducts.length === 0) {
                    alert("Product database not loaded (allProducts is empty).");
                    return;
                }
                const matches = [];
                for (const item of items) {
                    const match = matchProduct(item);
                    if (match) matches.push({ ...item, product: match.product, confidence: match.confidence });
                    else matches.push({ ...item, product: null, confidence: 0 });
                }
                alert("Matches ready: " + matches.length);
                if (typeof showReviewModal === 'function') {
                    showReviewModal(matches);
                } else {
                    alert("showReviewModal is not defined!");
                }
            } catch(err) {
                alert("Error: " + err.message);
            }
            fileInput.value = '';
        };
        alert("AI Scan ready – file input onchange set");
    }

    function waitForProducts() {
        alert("waitForProducts – checking allProducts");
        if (window.allProducts && window.allProducts.length > 0) {
            alert("Products loaded: " + window.allProducts.length);
            if (typeof buildNormalizedIndex === 'function') buildNormalizedIndex();
            if (typeof initFuse === 'function') initFuse();
            initAIScan();
            if (typeof bindModalEvents === 'function') bindModalEvents();
        } else {
            alert("allProducts not ready yet, retrying in 1 second");
            setTimeout(waitForProducts, 1000);
        }
    }

    waitForProducts();
})();
