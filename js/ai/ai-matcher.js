console.log("NEW ai-matcher.js LOADED");

let normalizedIndex = new Map();
let fuse = null;

function normalizePart(part) {

    if (!part)
        return '';

    return part
        .toString()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .replace(/^0+/, '');
}

function buildNormalizedIndex() {

    if (!window.allProducts)
        return;

    normalizedIndex.clear();

    for (const prod of window.allProducts) {

        const norm =
            normalizePart(prod.part);

        if (
            norm &&
            !normalizedIndex.has(norm)
        ) {

            normalizedIndex.set(norm, prod);
        }
    }

    console.log(
        "Normalized index built:",
        normalizedIndex.size
    );
}

function initFuse() {

    if (!window.allProducts)
        return;

    fuse = new Fuse(window.allProducts, {

        keys: ['part'],

        threshold: 0.08,

        ignoreLocation: true,

        includeScore: true
    });
}

function attemptCorrection(part) {

    const normalized =
        normalizePart(part);

    if (!normalized)
        return null;

    if (
        normalizedIndex.has(normalized)
    ) {

        return normalizedIndex.get(normalized);
    }

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

    return null;
}

function matchProduct(extractedItem) {

    const rawPart =
        extractedItem.partRaw;

    let product =
        attemptCorrection(rawPart);

    if (product) {

        return {

            product,

            confidence: 100
        };
    }

    if (fuse) {

        const results =
            fuse.search(rawPart);

        if (
            results.length > 0 &&
            results[0].score < 0.08
        ) {

            return {

                product: results[0].item,

                confidence: 90
            };
        }
    }

    return null;
}
