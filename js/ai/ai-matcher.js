let normalizedIndex = new Map();

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

        // OCR correction
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

    normalizedIndex.clear();

    if (
        !window.allProducts ||
        !Array.isArray(window.allProducts)
    ) {
        console.warn(
            "⚠️ allProducts missing"
        );
        return;
    }

    console.log(
        "🔵 Building normalized index..."
    );

    for (const product of window.allProducts) {

        if (!product)
            continue;

        const part =
            product.part ||
            product.partno ||
            product.code ||
            '';

        if (!part)
            continue;

        const normalized =
            normalizePart(part);

        if (!normalized)
            continue;

        // Save only first match

        if (
            !normalizedIndex.has(normalized)
        ) {

            normalizedIndex.set(
                normalized,
                product
            );
        }
    }

    console.log(
        "✅ Normalized index ready:",
        normalizedIndex.size
    );
}

// =====================================================
// MATCH PRODUCT
// =====================================================

function matchProduct(item) {

    if (!item)
        return null;

    const rawPart =
        item.partRaw || '';

    const normalized =
        normalizePart(rawPart);

    if (!normalized)
        return null;

    // =============================================
    // EXACT MATCH
    // =============================================

    if (
        normalizedIndex.has(normalized)
    ) {

        return {

            product:
                normalizedIndex.get(normalized),

            confidence: 100
        };
    }

    // =============================================
    // PARTIAL MATCH
    // =============================================

    for (
        const [key, product]
        of normalizedIndex.entries()
    ) {

        // Exact contains

        if (
            key.includes(normalized) ||
            normalized.includes(key)
        ) {

            return {

                product: product,

                confidence: 85
            };
        }

        // Ending match
        // useful for OCR zero issue

        if (
            key.endsWith(normalized) ||
            normalized.endsWith(key)
        ) {

            return {

                product: product,

                confidence: 80
            };
        }
    }

    return null;
}

// =====================================================
// OPTIONAL FUSE INIT
// =====================================================

function initFuse() {

    console.log(
        "✅ Fuse optional init completed"
    );
}
