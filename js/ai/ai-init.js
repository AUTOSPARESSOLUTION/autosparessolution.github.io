// ai-init.js – stable production version
(function () {
    console.log("AI module booting...");

    function aiAlert(msg) {
        console.log(msg);
        if (typeof showToast === 'function') {
            showToast(msg, false);
        }
    }

    async function handleFile(fileInput) {
        const file = fileInput.files[0];
        if (!file) return;

        try {
            aiAlert("📷 File selected");

            aiAlert("🔍 Reading document...");
            const ocrResult = await extractTextFromFile(file);
            const extractedText = typeof ocrResult === 'string' ? ocrResult : (ocrResult.text || '');
            console.log("OCR TEXT:", extractedText);

            if (!extractedText || extractedText.length < 5) {
                aiAlert("❌ No readable text found");
                return;
            }

            aiAlert("🧠 Detecting part numbers...");
            const items = extractItemsFromText(ocrResult);
            console.log("PARSED ITEMS:", items);

            if (!items || items.length === 0) {
                aiAlert("❌ No valid items detected");
                return;
            }
            aiAlert(`✅ ${items.length} item(s) detected`);

            if (!window.allProducts || window.allProducts.length === 0) {
                aiAlert("❌ Product database not loaded");
                return;
            }

            aiAlert("🔎 Matching products...");
            const matches = [];
            for (const item of items) {
                const match = matchProduct(item);
                if (match) {
                    matches.push({ ...item, product: match.product, confidence: match.confidence });
                } else {
                    matches.push({ ...item, product: null, confidence: 0 });
                }
            }
            console.log("MATCHES:", matches);

            aiAlert("📋 Opening review...");
            if (typeof showReviewModal === 'function') {
                showReviewModal(matches);
            } else {
                console.error("showReviewModal missing");
                aiAlert("❌ Review modal missing");
            }
        } catch (err) {
            console.error(err);
            aiAlert("❌ Scan failed: " + err.message);
        }
        fileInput.value = '';
    }

    function initAIScan() {
        console.log("Initialising AI scan...");
        const fileInput = document.getElementById('ai-scan-input');
        if (!fileInput) {
            console.error("ai-scan-input not found");
            return;
        }
        fileInput.onchange = async function () {
            await handleFile(fileInput);
        };
        aiAlert("✅ AI Scan Ready");
    }

    function waitForProducts() {
        if (window.allProducts && Array.isArray(window.allProducts) && window.allProducts.length > 0) {
            console.log("Products loaded:", window.allProducts.length);
            if (typeof buildNormalizedIndex === 'function') buildNormalizedIndex();
            if (typeof initFuse === 'function') initFuse();
            if (typeof bindModalEvents === 'function') bindModalEvents();
            initAIScan();
        } else {
            console.log("Waiting for allProducts...");
            setTimeout(waitForProducts, 1000);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', waitForProducts);
    } else {
        waitForProducts();
    }
})();
