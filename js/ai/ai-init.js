(function() {
    alert("🔵 AI init: script loaded");

    // Simple fallback modal (in case ai-review-modal.js missing)
    if (typeof showReviewModal !== 'function') {
        window.showReviewModal = function(matches) {
            alert("✅ Fallback modal: " + matches.length + " matches found.\n" + JSON.stringify(matches.map(m => ({ part: m.partRaw, qty: m.qty, product: m.product?.part })), null, 2));
            let msg = "Add to cart?\n";
            for (let m of matches) {
                if (m.product) msg += `${m.partRaw} → ${m.product.part} x${m.qty}\n`;
            }
            if (confirm(msg + "\nClick OK to add all")) {
                let added = 0;
                for (let m of matches) {
                    if (m.product && typeof window.aiAddToCart === 'function') {
                        window.aiAddToCart(m.product.part, m.product.price, m.qty);
                        added++;
                    }
                }
                if (added && typeof updateCartUI === 'function') updateCartUI();
                alert(`Added ${added} items to cart`);
            }
        };
        window.confirmAddScannedItems = function() {};
        window.bindModalEvents = function() {};
        alert("📦 Fallback modal installed");
    }

    function initAIScan() {
        alert("🟢 initAIScan called");
        const fileInput = document.getElementById('ai-scan-input');
        if (!fileInput) {
            alert("❌ File input not found!");
            return;
        }
        alert("✅ File input found, attaching onchange");
        fileInput.onchange = async function(e) {
            const file = e.target.files[0];
            if (!file) return;
            alert("📎 File selected: " + file.name);
            try {
                alert("📷 Calling extractTextFromFile...");
                const ocrResult = await extractTextFromFile(file);
                const extractedText = typeof ocrResult === 'string' ? ocrResult : (ocrResult.text || '');
                alert("📄 OCR text length: " + extractedText.length + "\nFirst 300 chars:\n" + extractedText.substring(0,300));
                if (extractedText.length < 10) {
                    alert("⚠️ No text extracted (OCR may have failed)");
                    return;
                }
                alert("🔧 Parsing items...");
                const items = extractItemsFromText(ocrResult);
                alert("📦 Items parsed: " + items.length);
                if (items.length === 0) {
                    alert("⚠️ No part numbers found in OCR text.");
                    return;
                }
                if (!window.allProducts || window.allProducts.length === 0) {
                    alert("❌ Product database not loaded (allProducts empty)");
                    return;
                }
                alert("🎯 Matching products...");
                const matches = [];
                for (const item of items) {
                    const match = matchProduct(item);
                    if (match) matches.push({ ...item, product: match.product, confidence: match.confidence });
                }
                alert("✅ Matches ready: " + matches.length);
                if (matches.length === 0) {
                    alert("⚠️ No matches found in product database");
                    return;
                }
                alert("🖼️ Opening review modal...");
                showReviewModal(matches);
            } catch(err) {
                alert("❌ ERROR: " + err.message);
            }
            fileInput.value = '';
        };
        alert("🟢 AI Scan ready (listener attached)");
    }

    function waitForProducts() {
        alert("⏳ waitForProducts - checking allProducts");
        if (window.allProducts && window.allProducts.length > 0) {
            alert("✅ Products loaded: " + window.allProducts.length);
            if (typeof buildNormalizedIndex === 'function') buildNormalizedIndex();
            if (typeof initFuse === 'function') initFuse();
            initAIScan();
            if (typeof bindModalEvents === 'function') bindModalEvents();
        } else {
            alert("⏳ allProducts not ready, retrying in 1s...");waitForProducts
            setTimeout(, 1000);
        }
    }

    waitForProducts();
})();
