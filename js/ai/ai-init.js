(function () {

    console.log("🔵 AI Scan System Loading...");

    // =====================================================
    // FALLBACK REVIEW MODAL
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
    // OCR TYPO CORRECTION
    // =====================================================

    function correctOCRPart(part) {

        if (!part) return '';

        return part
            .replace(/O/g, '0')
            .replace(/I/g, '1')
            .replace(/L/g, '1')
            .replace(/S/g, '5')
            .replace(/B/g, '8');
    }

    // =====================================================
    // BUILD NORMALIZED INDEX
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
            "✅ Normalized index built:",
            Object.keys(window.normalizedIndex).length
        );
    }

    // =====================================================
    // INIT FUSE.JS
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

        // =================================================
        // EXACT MATCH
        // =================================================

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

        // =================================================
        // OCR CORRECTED MATCH
        // =================================================

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

        // =================================================
        // PARTIAL MATCH
        // =================================================

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

        // =================================================
        // FUZZY MATCH
        // =================================================

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
    // MAIN OCR PARSER
    // =====================================================

    function extractItemsFromText(ocrResult) {

        const text = typeof ocrResult === 'string'
            ? ocrResult
            : (ocrResult?.text || '');

        if (!text || text.length < 5) {

            console.warn("⚠️ OCR text empty");

            return [];
        }

        // =================================================
        // CLEAN OCR TEXT
        // =================================================

        let cleaned = text
            .replace(/\r/g, '')
            .replace(/[ \t]+/g, ' ')
            .replace(/Pcs\./gi, 'PCS')
            .replace(/Pc\b/gi, 'PC')
            .replace(/\n{2,}/g, '\n');

        let rawLines = cleaned
            .split('\n')
            .map(l => l.trim())
            .filter(Boolean);

        // =================================================
        // MERGE BROKEN LINES
        // =================================================

        const lines = [];

        for (let i = 0; i < rawLines.length; i++) {

            let line = rawLines[i];

            if (
                i + 1 < rawLines.length &&
                !/\b(?:PC|PCS|NOS|QTY)\b/i.test(line) &&
                !/^\d+\s+[A-Z0-9]/.test(rawLines[i + 1])
            ) {

                line += ' ' + rawLines[i + 1];

                i++;
            }

            lines.push(line);
        }

        // =================================================
        // IGNORE METADATA
        // =================================================

        const ignorePattern =
            /(invoice|gstin|cgst|sgst|taxable|total|amount|bank|declaration|jurisdiction|authorised|output|state|email|phone|mobile|ack|irn|terms|e-mail)/i;

        const items = [];

        // =================================================
        // PARSE ROWS
        // =================================================

        for (const line of lines) {

            if (!line) continue;

            if (ignorePattern.test(line))
                continue;

            // =================================================
            // FLEXIBLE QUANTITY CHECK
            // =================================================

            if (
                !/\b(?:QTY|PCS?|NOS?|X)?\s*\d+\s*(?:PCS?|NOS?|QTY)?\.?\b/i.test(line)
            ) {
                continue;
            }

            const tokens = line.split(/\s+/);

            let part = null;
            let qty = 1;

            // =================================================
            // FIND PART
            // =================================================

            for (let token of tokens) {

                token = token
                    .toUpperCase()
                    .replace(/[.,]/g, '');

                // Skip small numbers
                if (/^\d{1,3}$/.test(token))
                    continue;

                // Skip HSN
                if (/^\d{8}$/.test(token))
                    continue;

                // Skip %
                if (/^\d+%?$/.test(token))
                    continue;

                // Skip money values
                if (/^\d+\.\d+$/.test(token))
                    continue;

                const hasLetter =
                    /[A-Z]/.test(token);

                const hasDigit =
                    /\d/.test(token);

                // Alphanumeric part
                if (
                    hasLetter &&
                    hasDigit &&
                    token.length >= 5
                ) {

                    part = token;

                    break;
                }

                // Numeric part
                if (
                    /^\d{5,8}$/.test(token)
                ) {

                    part = token;

                    break;
                }
            }

            // =================================================
            // FLEXIBLE QUANTITY EXTRACT
            // =================================================

            const qtyMatch = line.match(
                /\b(?:QTY|PCS?|NOS?|X)?\s*(\d{1,3})\s*(?:PCS?|NOS?|QTY)?\.?\b/i
            );

            if (qtyMatch) {

                qty =
                    parseInt(qtyMatch[1]) || 1;
            }

            // =================================================
            // SAVE
            // =================================================

            if (part) {

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
    // PDF / OCR EXTRACTOR
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

        // =================================================
        // PDF
        // =================================================

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

                console.warn(
                    "⚠️ Empty PDF text, OCR fallback"
                );

            } catch (err) {

                console.warn(
                    "⚠️ PDF extraction failed",
                    err
                );
            }

            return await performOCR(file);
        }

        // =================================================
        // IMAGE
        // =================================================

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
    // PDF.JS EXTRACT
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

        console.log("🔍 Starting OCR...");

        const result =
            await Tesseract.recognize(
                file,
                'eng',
                {
                    logger: m => {

                        if (
                            m.status === 'recognizing text'
                        ) {

                            console.log(
                                `OCR ${Math.round(m.progress * 100)}%`
                            );
                        }
                    }
                }
            );

        console.log("✅ OCR completed");

        return {
            text: result.data.text || ''
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

        // =================================================
        // FILE SELECT
        // =================================================

        fileInput.onchange =
            async function (e) {

            const file =
                e.target.files[0];

            if (!file) return;

            console.log(
                "📎 File selected:",
                file.name
            );

            try {

                // =============================================
                // EXTRACT OCR/TEXT
                // =============================================

                const ocrResult =
                    await extractTextFromFile(file);

                const extractedText =
                    typeof ocrResult === 'string'
                        ? ocrResult
                        : (ocrResult?.text || '');

                console.log(
                    "📄 FULL OCR TEXT:\n",
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

                // =============================================
                // PARSE ITEMS
                // =============================================

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

                // =============================================
                // PRODUCTS CHECK
                // =============================================

                if (
                    !window.allProducts ||
                    window.allProducts.length === 0
                ) {

                    alert(
                        "❌ Product database not loaded"
                    );

                    return;
                }

                // =============================================
                // MATCH PRODUCTS
                // =============================================

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

                // =============================================
                // SHOW MODAL
                // =============================================

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

            // Reset input
            fileInput.value = '';
        };

        console.log("✅ AI Scan Ready");
    }

    // =====================================================
    // WAIT FOR PRODUCTS
    // =====================================================

    function waitForProducts() {

        console.log(
            "⏳ Waiting for products..."
        );

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

            if (
                typeof bindModalEvents === 'function'
            ) {

                bindModalEvents();
            }

        } else {

            setTimeout(
                waitForProducts,
                1000
            );
        }
    }

    // =====================================================
    // START SYSTEM
    // =====================================================

    waitForProducts();

})();
