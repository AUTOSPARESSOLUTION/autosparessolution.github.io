let normalizedIndex = new Map();
let fuse = null;

function buildNormalizedIndex() {
    if (!window.allProducts) {
        console.warn('allProducts not ready');
        return;
    }
    normalizedIndex.clear();
    for (const prod of window.allProducts) {
        const norm = normalizePart(prod.part);
        if (norm && !normalizedIndex.has(norm)) {
            normalizedIndex.set(norm, prod);
        }
    }
    console.log(`AI: Normalized index built (${normalizedIndex.size} entries)`);
}

function initFuse() {
    if (!window.allProducts) return;
    fuse = new Fuse(window.allProducts, {
        keys: ['part'],
        threshold: 0.4,
        ignoreLocation: true,
        includeScore: true
    });
}

function matchProduct(extractedItem) {
    const normalizedInput = normalizePart(extractedItem.partRaw);
    if (!normalizedInput) return null;
    let product = normalizedIndex.get(normalizedInput);
    if (product) return { product, confidence: 100 };
    if (fuse) {
        const results = fuse.search(extractedItem.partRaw);
        if (results.length > 0 && results[0].score < 0.4) {
            return { product: results[0].item, confidence: 85 };
        }
    }
    return null;
}

// Expose builders to be called after CSV loads
window.buildNormalizedIndex = buildNormalizedIndex;
window.initFuse = initFuse;
