(function() {
    alert("AI init script loaded");

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
                alert("Calling extractTextFromFile...");
                const extractedText = await extractTextFromFile(file);
                alert("Extracted text length: " + extractedText.length + "\nFirst 200 chars:\n" + extractedText.substring(0,200));
                if (extractedText.length < 5) {
                    alert("No text extracted. Image may be too blurry.");
                    return;
                }
                const items = extractItemsFromText(extractedText);
                alert("Parsed items count: " + items.length + "\n" + JSON.stringify(items));
                if (!items.length) {
                    alert("No part numbers found in extracted text.");
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
                showReviewModal(matches);
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
