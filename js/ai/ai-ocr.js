// =====================================================
// MAIN FILE TEXT EXTRACTOR
// =====================================================

async function extractTextFromFile(file) {

    if (!file)
        throw new Error("No file selected");

    const fileName =
        file.name.toLowerCase();

    const fileType =
        file.type.toLowerCase();

    console.log(
        "📄 Processing file:",
        fileName
    );

    // =================================================
    // PDF FILE
    // =================================================

    if (
        fileType.includes('pdf') ||
        fileName.endsWith('.pdf')
    ) {

        try {

            console.log(
                "📘 Attempting PDF text extraction..."
            );

            const pdfText =
                await extractTextFromPDF(file);

            // If real text found
            if (
                pdfText &&
                pdfText.trim().length > 30
            ) {

                console.log(
                    "✅ PDF text extracted successfully"
                );

                return {
                    text: pdfText
                };
            }

            console.warn(
                "⚠️ PDF text empty, using OCR fallback"
            );

        } catch (err) {

            console.warn(
                "⚠️ PDF extraction failed:",
                err
            );
        }

        // OCR fallback
        return await performOCR(file);
    }

    // =================================================
    // IMAGE FILE
    // =================================================

    if (
        fileType.startsWith('image/')
    ) {

        console.log(
            "🖼️ Running OCR on image..."
        );

        return await performOCR(file);
    }

    throw new Error(
        "Unsupported file type"
    );
}

// =====================================================
// PDF TEXT EXTRACTION
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
// OCR USING TESSERACT
// =====================================================

async function performOCR(file) {

    if (
        typeof Tesseract === 'undefined'
    ) {
        throw new Error(
            "Tesseract.js not loaded"
        );
    }

    console.log(
        "🔍 Starting OCR..."
    );

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
                            `OCR Progress: ${Math.round(m.progress * 100)}%`
                        );
                    }
                }
            }
        );

    console.log(
        "✅ OCR completed"
    );

    return {
        text: result.data.text || ''
    };
}
