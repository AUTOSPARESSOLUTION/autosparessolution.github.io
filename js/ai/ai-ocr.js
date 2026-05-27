let ocrWorker = null;

async function initOCR() {

    if (!ocrWorker) {

        ocrWorker = await Tesseract.createWorker('eng');

        await ocrWorker.setParameters({

            tessedit_char_whitelist:
                'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-./',

            tessedit_pageseg_mode: '6',

            preserve_interword_spaces: '1'
        });
    }
}

// =====================================================
// IMAGE PREPROCESSING
// =====================================================

async function preprocessImage(blob) {

    return new Promise((resolve) => {

        const img = new Image();

        const url =
            URL.createObjectURL(blob);

        img.onload = () => {

            const canvas =
                document.createElement('canvas');

            let width = img.width;
            let height = img.height;

            // =============================================
            // SMART RESIZE
            // =============================================

            const maxWidth = 1400;

            if (width > maxWidth) {

                height *= maxWidth / width;
                width = maxWidth;
            }

            canvas.width = width;
            canvas.height = height;

            const ctx =
                canvas.getContext('2d');

            // =============================================
            // DRAW IMAGE
            // =============================================

            ctx.drawImage(
                img,
                0,
                0,
                width,
                height
            );

            // =============================================
            // IMAGE DATA
            // =============================================

            const imageData =
                ctx.getImageData(
                    0,
                    0,
                    width,
                    height
                );

            const data =
                imageData.data;

            // =============================================
            // OCR OPTIMIZATION
            // =============================================

            for (
                let i = 0;
                i < data.length;
                i += 4
            ) {

                const avg =
                    (
                        data[i] +
                        data[i + 1] +
                        data[i + 2]
                    ) / 3;

                // softer contrast
                const val =
                    avg > 135
                        ? 255
                        : avg * 0.7;

                data[i] = val;
                data[i + 1] = val;
                data[i + 2] = val;
            }

            // =============================================
            // PUT IMAGE BACK
            // =============================================

            ctx.putImageData(
                imageData,
                0,
                0
            );

            // =============================================
            // EXPORT IMAGE
            // =============================================

            canvas.toBlob(

                (blob) => {

                    URL.revokeObjectURL(url);

                    resolve(blob);
                },

                'image/jpeg',

                0.95
            );
        };

        img.src = url;
    });
}

// =====================================================
// PDF PAGE TO IMAGE
// =====================================================

async function pdfPageToImage(page, scale = 2.5) {

    const viewport =
        page.getViewport({
            scale: scale
        });

    const canvas =
        document.createElement('canvas');

    const context =
        canvas.getContext('2d');

    canvas.width =
        viewport.width;

    canvas.height =
        viewport.height;

    await page.render({

        canvasContext: context,

        viewport: viewport

    }).promise;

    return new Promise((resolve) => {

        canvas.toBlob(

            blob => resolve(blob),

            'image/jpeg',

            0.95
        );
    });
}

// =====================================================
// EXCEL / CSV EXTRACTION
// =====================================================

async function extractFromExcelOrCSV(file) {

    return new Promise((resolve, reject) => {

        const reader =
            new FileReader();

        reader.onload =
            function(e) {

            try {

                const data =
                    new Uint8Array(
                        e.target.result
                    );

                const workbook =
                    XLSX.read(data, {
                        type: 'array'
                    });

                const firstSheet =
                    workbook.Sheets[
                        workbook.SheetNames[0]
                    ];

                const rows =
                    XLSX.utils.sheet_to_json(
                        firstSheet,
                        {
                            header: 1,
                            defval: ""
                        }
                    );

                if (
                    !rows ||
                    rows.length < 1
                ) {

                    reject(
                        new Error("No rows found")
                    );

                    return;
                }

                let lines = [];

                for (
                    let i = 0;
                    i < rows.length;
                    i++
                ) {

                    const row = rows[i];

                    if (!row)
                        continue;

                    const rowText =
                        row
                        .map(v =>
                            String(v || '').trim()
                        )
                        .join(' ');

                    if (
                        rowText.trim()
                    ) {

                        lines.push(rowText);
                    }
                }

                resolve(
                    lines.join('\n')
                );

            } catch(err) {

                reject(err);
            }
        };

        reader.onerror = () =>
            reject(
                new Error(
                    "File read failed"
                )
            );

        reader.readAsArrayBuffer(file);
    });
}

// =====================================================
// MAIN FILE OCR
// =====================================================

async function extractTextFromFile(file) {

    const scanBtn =
        document.getElementById(
            'ai-scan-btn'
        );

    if (scanBtn) {

        scanBtn.disabled = true;

        scanBtn.innerHTML =
            '<i class="fas fa-spinner fa-spin"></i> Scanning...';
    }

    try {

        // =============================================
        // EXCEL / CSV
        // =============================================

        if (
            file.name.match(/\.(xlsx|xls|csv)$/i)
        ) {

            const text =
                await extractFromExcelOrCSV(file);

            return {

                text: text,

                words: null
            };
        }

        // =============================================
        // PDF
        // =============================================

        else if (
            file.type === 'application/pdf'
        ) {

            const arrayBuffer =
                await file.arrayBuffer();

            const pdf =
                await pdfjsLib
                .getDocument({
                    data: arrayBuffer
                }).promise;

            let fullText = '';

            await initOCR();

            for (
                let i = 1;
                i <= pdf.numPages;
                i++
            ) {

                const page =
                    await pdf.getPage(i);

                const imageBlob =
                    await pdfPageToImage(
                        page,
                        2.5
                    );

                const optimized =
                    await preprocessImage(
                        imageBlob
                    );

                const ret =
                    await ocrWorker.recognize(
                        optimized
                    );

                fullText +=
                    ret.data.text + '\n';
            }

            return {

                text: fullText,

                words: null
            };
        }

        // =============================================
        // IMAGE OCR
        // =============================================

        else {

            await initOCR();

            const optimized =
                await preprocessImage(file);

            const ret =
                await ocrWorker.recognize(
                    optimized
                );

            return {

                text: ret.data.text || '',

                words:
                    ret.data.words || [],

                rawText:
                    ret.data.text || ''
            };
        }

    } finally {

        if (scanBtn) {

            scanBtn.disabled = false;

            scanBtn.innerHTML =
                '<i class="fas fa-camera"></i> Scan Order';
        }
    }
                    }
