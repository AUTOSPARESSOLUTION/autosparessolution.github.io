function initializeAIScanner() {
    if (!window.ENABLE_AI_SCAN) return;
    // Wait for products to be loaded (allProducts is populated by your existing code)
    const checkProducts = setInterval(() => {
        if (window.allProducts && window.allProducts.length > 0) {
            clearInterval(checkProducts);
            if (typeof buildNormalizedIndex === 'function') buildNormalizedIndex();
            if (typeof initFuse === 'function') initFuse();
            console.log('AI Scanner ready');
        }
    }, 500);
    // Bind file input
    const fileInput = document.getElementById('ai-scan-input');
    if (fileInput) {
        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            if (file.size > (window.AI_MAX_FILE_SIZE_MB * 1024 * 1024)) {
                aiShowToast(`File too large (max ${window.AI_MAX_FILE_SIZE_MB}MB)`, true);
                return;
            }
            aiShowToast('🔍 Scanning file...');
            try {
                const extractedText = await extractTextFromFile(file);
                const parsedItems = extractItemsFromText(extractedText);
                if (parsedItems.length === 0) {
                    aiShowToast('No valid part numbers detected.', true);
                    return;
                }
                const matches = [];
                for (const item of parsedItems) {
                    const match = matchProduct(item);
                    if (match) {
                        matches.push({ ...item, product: match.product, confidence: match.confidence });
                    } else {
                        matches.push({ ...item, product: null, confidence: 0 });
                    }
                }
                showReviewModal(matches);
            } catch (err) {
                console.error(err);
                aiShowToast('Processing failed. Try another image/PDF.', true);
            }
            e.target.value = '';
        });
    }
    // Bind scan button
    const scanBtn = document.getElementById('ai-scan-btn');
    if (scanBtn) {
        scanBtn.onclick = () => {
            document.getElementById('ai-scan-input').click();
        };
    }
    bindModalEvents();
}

// Start when DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeAIScanner);
} else {
    initializeAIScanner();
}
