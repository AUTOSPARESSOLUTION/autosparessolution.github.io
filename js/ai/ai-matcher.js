// ai-matcher.js – exact DB match + common OCR corrections + confidence scoring

let normalizedIndex = new Map();
let fuse = null;

// =====================================================
// NORMALIZE PART
// =====================================================

function normalizePart(part) {

    if (!part) return '';

    return part
        .toString()
        .toUpperCase()
        .trim()

        // remove spaces
        .replace(/\s+/g, '')

        // remove symbols
        .replace(/[^A-Z0-9]/g, '');
}

// =====================================================
// BUILD INDEX
// =====================================================

function buildNormalizedIndex() {

    if (!window.allProducts) return;

    normalizedIndex.clear();

    for (const prod of window.allProducts) {

        if (!prod || !prod.part)
            continue;

        const norm =
            normalizePart(prod.part);

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
        `Normalized index built (${normalizedIndex.size})`
    );
}

// =====================================================
// INIT FUSE
// =====================================================

function initFuse() {

    if (!window.allProducts) return;

    fuse = new Fuse(window.allProducts, {

        keys: ['part'],

        threshold: 0.18,

        ignoreLocation: true,

        includeScore: true
    });
}

// =====================================================
// COMMON OCR CORRECTIONS
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
    // LEADING ZERO SUPPORT
    // 088630 → 88630
    // =============================================

    if (/^0+\d+$/.test(normalized)) {

        const withoutZero =
            normalized.replace(/^0+/, '');

        if (
            normalizedIndex.has(withoutZero)
        ) {

            return normalizedIndex.get(withoutZero);
        }
    }

    // =============================================
    // COMMON CHARACTER SWAPS
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

        if (normalizedIndex.has(v)) {

            return normalizedIndex.get(v);
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
        extractedItem.partRaw;

    // =============================================
    // TRY EXACT MATCH + CORRECTION
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
            results[0].score < 0.1

        ) {

            return {

                product:
                    results[0].item,

                confidence: 90
            };

        } else if (

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
