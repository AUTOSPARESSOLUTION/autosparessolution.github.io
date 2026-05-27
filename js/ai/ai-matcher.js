console.log("ULTIMATE ai-matcher.js LOADED");

let normalizedIndex = new Map();

let fuse = null;

// =======================================
// NORMALIZE PART
// =======================================

function normalizePart(part) {

    if (!part)
        return '';

    return String(part)

        .toUpperCase()

        .trim()

        // remove spaces

        .replace(/\s+/g, '')

        // remove special chars

        .replace(/[^A-Z0-9]/g, '')

        // OCR corrections

        .replace(/O/g, '0')

        .replace(/I/g, '1')

        // IMPORTANT:
        // 088630 = 88630

        .replace(/^0+/, '');
}

// =======================================
// BUILD INDEX
// =======================================

function buildNormalizedIndex() {

    if (!window.allProducts)
        return;

    normalizedIndex.clear();

    for (const prod of window.allProducts) {

        if (!prod.part)
            continue;

        const norm =
            normalizePart(prod.part);

        if (!norm)
            continue;

        normalizedIndex.set(norm, prod);
    }

    console.log(
        "Normalized index built:",
        normalizedIndex.size
    );

    // DEBUG SAMPLE

    console.log(
        "Sample keys:",
        Array.from(normalizedIndex.keys()).slice(0,20)
    );
}

// =======================================
// INIT FUSE
// =======================================

function initFuse() {

    if (!window.allProducts)
        return;

    fuse = new Fuse(window.allProducts, {

        keys: ['part'],

        threshold: 0.08,

        ignoreLocation: true,

        includeScore: true
    });

    console.log("Fuse ready");
}

// =======================================
// MATCH PRODUCT
// =======================================

function matchProduct(extractedItem) {

    const rawPart =
        extractedItem.partRaw;

    const normalized =
        normalizePart(rawPart);

    console.log(
        "Matching:",
        rawPart,
        "→",
        normalized
    );

    // ===================================
    // EXACT MATCH
    // ===================================

    if (
        normalizedIndex.has(normalized)
    ) {

        console.log(
            "EXACT MATCH FOUND"
        );

        return {

            product:
                normalizedIndex.get(normalized),

            confidence: 100
        };
    }

    // ===================================
    // FUZZY MATCH
    // ===================================

    if (fuse) {

        const results =
            fuse.search(rawPart);

        if (
            results.length > 0 &&
            results[0].score < 0.08
        ) {

            console.log(
                "FUZZY MATCH:",
                results[0]
            );

            return {

                product:
                    results[0].item,

                confidence: 80
            };
        }
    }

    console.log(
        "NO MATCH:",
        rawPart
    );

    return null;
}
