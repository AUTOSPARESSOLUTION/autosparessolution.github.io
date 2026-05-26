(function () {

    console.log("🔵 AI Scan System Loading...");

    // =====================================================
    // FALLBACK MODAL
    // =====================================================

    if (typeof showReviewModal !== 'function') {

        window.showReviewModal = function (matches) {

            let msg = "Matched Products:\n\n";

            matches.forEach(m => {

                msg += `${m.partRaw} → ${m.product?.part || 'NO MATCH'} x${m.qty}\n`;

            });

            if (confirm(msg + "\n\nAdd all items to cart?")) {

                let added = 0;

                matches.forEach(m => {

                    if (
                        m.product &&
                        typeof window.aiAddToCart === 'function'
                    ) {

                        window.aiAddToCart(
                            m.product.part,
                            m.product.price,
                            m.qty
                        );

                        added++;
                    }
                });

                if (
                    added &&
                    typeof updateCartUI === 'function'
                ) {
                    updateCartUI();
                }

                alert(`✅ ${added} items added to cart`);
            }
        };

        window.confirmAddScannedItems = function () {};
        window.bindModalEvents = function () {};

        console.log("📦 Fallback modal installed");
    }

    // =====================================================
    // NORMALIZE PART
    // =====================================================

    function normalizePart(part) {

        if (!part) return '';

        return String(part)
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, '')
            .trim();
    }

    // =====================================================
    // OCR CORRECTION
    // =====================================================

    function correctOCRPart(part) {

        if (!part) return '';

        return part
            .replace(/O/g, '0')
            .replace(/I/g, '1')
            .replace(/L/g, '1');
    }

    // =====================================================
    // PRODUCT INDEX
    // =====================================================

    window.normalizedIndex = {};

    function buildNormalizedIndex() {

        window.normalizedIndex = {};

        if (!window.allProducts) return;

        for (const product of window.allProducts) {

            if (!product || !product.part) continue;

            const normalized =
                normalizePart(product.part);

            if (!normalized) continue;

            window.normalizedIndex[normalized] =
                product;
        }

        console.log(
            "✅ Index built:",
            Object.keys(window.normalizedIndex).length
        );
    }

    // =====================================================
    // FUSE INIT
    // =====================================================

    window.productFuse = null;

    function initFuse() {

        if (
            typeof Fuse === 'undefined' ||
            !window.allProducts
        ) {

            console.warn("⚠️ Fuse.js unavailable");

            return;
        }

        window.productFuse = new Fuse(
            window.allProducts,
            {
                keys: ['part'],
                threshold: 0.30,
                includeScore: true,
                minMatchCharLength: 4
            }
        );

        console.log("✅ Fuse initialized");
    }

    // =====================================================
    // PRODUCT MATCHER
    // =====================================================

    function matchProduct(item) {

        if (!item || !item.partRaw)
            return null;

        const original =
            normalizePart(item.partRaw);

        if (!original)
            return null;

        // EXACT MATCH

        if (
            window.normalizedIndex &&
            window.normalizedIndex[original]
        ) {

            return {
                product:
                    window.normalizedIndex[original],
                confidence: 1
            };
        }

        // OCR FIXED MATCH

        const corrected =
            normalizePart(
                correctOCRPart(original)
            );

        if (
            corrected &&
            window.normalizedIndex &&
            window.normalizedIndex[corrected]
        ) {

            return {
                product:
                    window.normalizedIndex[corrected],
                confidence: 0.95
            };
        }

        // PARTIAL MATCH

        if (window.allProducts) {

            for (const product of window.allProducts) {

                if (!product || !product.part)
                    continue;

                const p =
                    normalizePart(product.part);

                if (!p) continue;

                if (
                    p.includes(original) ||
                    original.includes(p)
                ) {

                    return {
                        product,
                        confidence: 0.85
                    };
                }
            }
        }

        // FUZZY MATCH

        if (window.productFuse) {

            const results =
                window.productFuse.search(original);

            if (
                results &&
                results.length > 0
            ) {

                const best = results[0];

                const confidence =
                    1 - (best.score || 1);

                if (confidence >= 0.60) {

                    return {
                        product: best.item,
                        confidence
                    };
                }
            }
        }

        return null;
    }

    // =====================================================
    // OCR PARSER
    // =====================================================

    function extractItemsFromText(ocrResult) {

        const text = typeof ocrResult === 'string'
            ? ocrResult
            : (ocrResult?.text || '');

        if (!text || text.length < 5) {

            console.warn("⚠️ OCR text empty");

            return [];
        }

        let cleaned = text
            .replace(/\r/g, '')
            .replace(/[ \t]+/g, ' ')
            .replace(/\n{2,}/g, '\n');

        const rawLines = cleaned
            .split('\n')
            .map(l => l.trim())
            .filter(Boolean);

        const items = [];

        const ignorePattern =
            /(invoice|gstin|cgst|sgst|taxable|total|amount|bank|declaration|jurisdiction|authorised|output|state|email|phone|mobile|ack|irn|terms)/i;

        for (const line of rawLines) {

            console.log("LINE:", line);

            if (!line) continue;

            if (line.length < 5)
                continue;

            if (ignorePattern.test(line))
                continue;

            // =============================================
            // FIND PART NUMBER
            // =============================================

            const partMatches =
                line.match(
                    /\b[A-Z0-9\-\/\.]{5,}\b/gi
                );

            if (!partMatches)
                continue;

            let qty = 1;

            // =============================================
            // FIND QUANTITY
            // =============================================

            const qtyMatch =
                line.match(
                    /(\d{1,3})\s*(PC|PCS|NOS|QTY|PIECES?)/i
                );

            if (qtyMatch) {

                qty =
                    parseInt(qtyMatch[1]) || 1;
            }

            // =============================================
            // PROCESS PARTS
            // =============================================

            for (let part of partMatches) {

                part =
                    normalizePart(part);

                if (!part)
                    continue;

                // Skip short numbers
                if (/^\d{1,4}$/.test(part))
                    continue;

                // Skip money values
                if (/^\d+\.\d+$/.test(part))
                    continue;

                // Skip HSN
                if (/^\d{8}$/.test(part))
                    continue;

                items.push({
                    partRaw: part,
                    qty: qty
                });
            }
        }

        // =================================================
        // MERGE DUPLICATES
        // =================================================

        const merged = new Map();

        for (const item of items) {

            const key =
                normalizePart(item.partRaw);

            if (!key) continue;

            if (merged.has(key)) {

                merged.get(key).qty += item.qty;

            } else {

                merged.set(key, {
                    partRaw: item.partRaw,
                    qty: item.qty
                });
            }
        }

        const result =
            Array.from(merged.values());

        console.log(
            "✅ FINAL PARSED ITEMS:",
            result
        );

        return result;
    }

    // =====================================================
    // FILE TEXT EXTRACTOR
    // =====================================================

    async function extractTextFromFile(file) {

        if (!file)
            throw new Error("No file selected");

        const fileName =
            file.name.toLowerCase();

        const fileType =
            file.type.toLowerCase();

        console.log(
            "📄 Processing:",
            fileName
        );

        // PDF

        if (
            fileType.includes('pdf') ||
            fileName.endsWith('.pdf')
        ) {

            try {

                const pdfText =
                    await extractTextFromPDF(file);

                if (
                    pdfText &&
                    pdfText.trim().length > 30
                ) {

                    console.log(
                        "✅ PDF text extracted"
                    );

                    return {
                        text: pdfText
                    };
                }

            } catch (err) {

                console.warn(
                    "⚠️ PDF extraction failed",
                    err
                );
            }

            return await performOCR(file);
        }

        // IMAGE

        if (
            fileType.startsWith('image/')
        ) {

            return await performOCR(file);
        }

        throw new Error(
            "Unsupported file type"
        );
    }

    // =====================================================
    // PDF TEXT
    // =====================================================

    async function extractTextFromPDF(file) {

        if (
            typeof pdfjsLib === 'undefined'
        ) {

            throw new Error(
                "pdf.js not loaded"
            );
        }

        const arrayBuffer =
            await file.arrayBuffer();

        const pdf =
            await pdfjsLib.getDocument({
                data: arrayBuffer
            }).promise;

        let fullText = '';

        for (
            let pageNum = 1;
            pageNum <= pdf.numPages;
            pageNum++
        ) {

            const page =
                await pdf.getPage(pageNum);

            const textContent =
                await page.getTextContent();

            const pageText =
                textContent.items
                    .map(item => item.str)
                    .join(' ');

            fullText += '\n' + pageText;
        }

        return fullText;
    }

    // =====================================================
    // OCR
    // =====================================================

    async function performOCR(file) {

        if (
            typeof Tesseract === 'undefined'
        ) {

            throw new Error(
                "Tesseract.js not loaded"
            );
        }

        console.log("🔍 OCR starting");

        const result =
            await Tesseract.recognize(
                file,
                'eng'
            );

        return {
            text:
                result?.data?.text || ''
        };
    }

    // =====================================================
    // AI SCAN INIT
    // =====================================================

    function initAIScan() {

        console.log(
            "🟢 Initializing AI Scan"
        );

        const fileInput =
            document.getElementById(
                'ai-scan-input'
            );

        if (!fileInput) {

            console.error(
                "❌ ai-scan-input missing"
            );

            return;
        }

        fileInput.onchange =
            async function (e) {

            const file =
                e.target.files[0];

            if (!file) return;

            try {

                const ocrResult =
                    await extractTextFromFile(file);

                const extractedText =
                    typeof ocrResult === 'string'
                        ? ocrResult
                        : (ocrResult?.text || '');

                console.log(
                    "📄 OCR TEXT:\n",
                    extractedText
                );

                if (
                    !extractedText ||
                    extractedText.length < 10
                ) {

                    alert(
                        "⚠️ No readable text found"
                    );

                    return;
                }

                // =========================================
                // PARSE ITEMS
                // =========================================

                const items =
                    extractItemsFromText(
                        ocrResult
                    );

                console.log(
                    "📦 Parsed Items:",
                    items
                );

                if (
                    items.length === 0
                ) {

                    alert(
                        "⚠️ No valid part numbers found"
                    );

                    return;
                }

                // =========================================
                // PRODUCT DB
                // =========================================

                if (
                    !window.allProducts ||
                    window.allProducts.length === 0
                ) {

                    alert(
                        "❌ Product database not loaded"
                    );

                    return;
                }

                // =========================================
                // MATCH PRODUCTS
                // =========================================

                const matches = [];

                for (const item of items) {

                    const match =
                        matchProduct(item);

                    if (
                        match &&
                        (
                            match.confidence === undefined ||
                            match.confidence >= 0.60
                        )
                    ) {

                        matches.push({
                            ...item,
                            product: match.product,
                            confidence:
                                match.confidence || 1
                        });
                    }
                }

                console.log(
                    "🎯 Matches:",
                    matches
                );

                if (
                    matches.length === 0
                ) {

                    alert(
                        "⚠️ No matching products found"
                    );

                    return;
                }

                showReviewModal(matches);

            } catch (err) {

                console.error(err);

                alert(
                    "❌ Scan Error:\n" +
                    (err?.message ||
                    err ||
                    "Unknown Error")
                );
            }

            fileInput.value = '';
        };

        console.log("✅ AI Scan Ready");
    }

    // =====================================================
    // WAIT PRODUCTS
    // =====================================================

    function waitForProducts() {

        if (
            window.allProducts &&
            window.allProducts.length > 0
        ) {

            console.log(
                `✅ Products Loaded: ${window.allProducts.length}`
            );

            buildNormalizedIndex();

            initFuse();

            initAIScan();

        } else {

            console.log(
                "⏳ Waiting for products..."
            );

            setTimeout(
                waitForProducts,
                1000
            );
        }
    }

    // =====================================================
    // START
    // =====================================================

    waitForProducts();

})();
