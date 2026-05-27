// ai-matcher.js
// Exact DB match + OCR correction + leading zero support

let normalizedIndex = new Map();
let fuse = null;

// =====================================================
// NORMALIZE PART NUMBER
// =====================================================

function normalizePart(part) {

    if (!part)
        return '';

    return part
        .toString()
        .toUpperCase()

        // Remove spaces
        .replace(/\s+/g, '')

        // OCR corrections
        .replace(/O/g, '0')
        .replace(/I/g, '1')

        // Remove special chars
        .replace(/[^A-Z0-9]/g, '')

        // REMOVE LEADING ZEROS
        .replace(/^0+/, '');
}

// =====================================================
// BUILD INDEX
// =====================================================

function buildNormalizedIndex() {

    if (!window.allProducts)
        return;

    normalizedIndex.clear();

    for (const prod of window.allProducts) {

        if (!prod)
            continue;

        const part =
            prod.part ||
            prod.partno ||
            prod.code ||
            '';

        if (!part)
            continue;

        const norm =
            normalizePart(part);

        if (
            norm &&
            !normalizedIndex.has(norm)
        ) {

            normalizedIndex.set(
                norm,
                prod
            );
        }
    }

    console.log(
        `✅ Normalized index built (${normalizedIndex.size})`
    );
}

// =====================================================
// INIT FUSE
// =====================================================

function initFuse() {

    if (!window.allProducts)
        return;

    fuse = new Fuse(
        window.allProducts,
        {
            keys: ['part'],
            threshold: 0.18,
            ignoreLocation: true,
            includeScore: true
        }
    );

    console.log("✅ Fuse initialized");
}

// =====================================================
// OCR CORRECTION
// =====================================================

function attemptCorrection(part) {

    const normalized =
        normalizePart(part);

    if (!normalized)
        return null;

    // =============================================
    // EXACT MATCH
    // =============================================

    if (
        normalizedIndex.has(normalized)
    ) {

        return normalizedIndex.get(normalized);
    }

    // =============================================
    // OCR SWAP VARIANTS
    // =============================================

    const variants = [

        normalized.replace(/O/g, '0'),

        normalized.replace(/0/g, 'O'),

        normalized.replace(/I/g, '1'),

        normalized.replace(/1/g, 'I'),

        normalized.replace(/S/g, '5'),

        normalized.replace(/5/g, 'S')
    ];

    for (const v of variants) {

        if (
            normalizedIndex.has(v)
        ) {

            return normalizedIndex.get(v);
        }
    }

    // =============================================
    // LEADING ZERO SMART MATCH
    // =============================================

    for (
        const [key, product]
        of normalizedIndex.entries()
    ) {

        if (
            key === normalized
        ) {

            return product;
        }

        // Example:
        // 088630 == 88630

        if (
            key.endsWith(normalized) ||
            normalized.endsWith(key)
        ) {

            return product;
        }
    }

    return null;
}

// =====================================================
// MAIN MATCHER
// =====================================================

function matchProduct(extractedItem) {

    if (!extractedItem)
        return null;

    const rawPart =
        extractedItem.partRaw || '';

    // =============================================
    // EXACT + CORRECTION
    // =============================================

    let product =
        attemptCorrection(rawPart);

    if (product) {

        return {

            product,
            confidence: 100
        };
    }

    // =============================================
    // FUZZY SEARCH
    // =============================================

    if (fuse) {

        const results =
            fuse.search(rawPart);

        if (
            results.length > 0 &&
            results[0].score < 0.10
        ) {

            return {

                product:
                    results[0].item,

                confidence: 90
            };
        }

        else if (
            results.length > 0 &&
            results[0].score < 0.18
        ) {

            return {

                product:
                    results[0].item,

                confidence: 75
            };
        }
    }

    return null;
        }
