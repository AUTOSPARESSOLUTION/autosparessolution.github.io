let ocrWorker = null;

// =====================================================
// INIT OCR
// =====================================================

async function initOCR() {

    try {

        if (!ocrWorker) {

            console.log("🔵 Initializing OCR Worker...");

            ocrWorker =
                await Tesseract.createWorker('eng');

            await ocrWorker.setParameters({

                tessedit_char_whitelist:
                    'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-./ ',

                tessedit_pageseg_mode: '6',

                preserve_interword_spaces: '1'
            });

            console.log("✅ OCR Worker Ready");
        }

    } catch(err) {

        console.error(err);

        alert(
            "❌ OCR INIT FAILED:\n" +
            (err?.message || err)
        );
    }
}

// =====================================================
// IMAGE PREPROCESS
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

            const maxWidth = 1600;

            if (width > maxWidth) {

                height *= maxWidth / width;

                width = maxWidth;
            }

            canvas.width = width;
            canvas.height = height;

            const ctx =
                canvas.getContext('2d');

            ctx.drawImage(
                img,
                0,
                0,
                width,
                height
            );

            const imageData =
                ctx.getImageData(
                    0,
                    0,
                    width,
                    height
                );

            const data = imageData.data;

            for (
                let i = 0;
                i < data.length;
                i += 4
            ) {

                const avg =
                    (
                        data[i] +
                        data[i+1] +
                        data[i+2]
                    ) / 3;

                const val =
                    avg > 155 ? 255 : 0;

                data[i] = val;
                data[i+1] = val;
                data[i+2] = val;
            }

            ctx.putImageData(
                imageData,
                0,
                0
            );

            canvas.toBlob(

                blob => {

                    URL.revokeObjectURL(url);

                    resolve(blob);
                },

                'image/jpeg',

                0.95
            );
        };

        img.onerror = () => {

            URL.revokeObjectURL(url);

            resolve(blob);
        };

        img.src = url;
    });
}

// =====================================================
// PDF PAGE TO IMAGE
// =====================================================

async function pdfPageToImage(
    page,
    scale = 3
) {

    const viewport =
        page.getViewport({
            scale: scale
        });

    const canvas =
        document.createElement('canvas');

    const context =
        canvas.getContext('2d');

    canvas.width = viewport.width;

    canvas.height = viewport.height;

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
// EXCEL / CSV
// =====================================================

async function extractFromExcelOrCSV(file) {

    return new Promise((resolve, reject) => {

        const reader =
            new FileReader();

        reader.onload = function(e) {

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

                let partColIndex = -1;
                let qtyColIndex = -1;

                for (
                    let i = 0;
                    i < Math.min(rows.length, 15);
                    i++
                ) {

                    const row = rows[i];

                    if (!row)
                        continue;

                    for (
                        let j = 0;
                        j < row.length;
                        j++
                    ) {

                        const cell =
                            (row[j] || "")
                            .toString()
                            .trim()
                            .toLowerCase();

                        if (
                            cell.includes("part")
                        ) {
                            partColIndex = j;
                        }

                        if (
                            cell.includes("qty") ||
                            cell.includes("quantity")
                        ) {
                            qtyColIndex = j;
                        }
                    }

                    if (
                        partColIndex !== -1
                    ) {
                        break;
                    }
                }

                if (
                    partColIndex === -1
                ) {

                    reject(
                        new Error(
                            "Part column not found"
                        )
                    );

                    return;
                }

                let lines = [];

                for (
                    let i = 1;
                    i < rows.length;
                    i++
                ) {

                    const row = rows[i];

                    if (
                        !row ||
                        row.length === 0
                    )
                        continue;

                    const part =
                        row[partColIndex]
                        ?.toString()
                        ?.trim();

                    if (!part)
                        continue;

                    let qty = 1;

                    if (
                        qtyColIndex !== -1
                    ) {

                        const q =
                            parseFloat(
                                row[qtyColIndex]
                            );

                        if (
                            !isNaN(q) &&
                            q > 0
                        ) {

                            qty = Math.floor(q);
                        }
                    }

                    lines.push(
                        `${part} x${qty}`
                    );
                }

                resolve(lines.join('\n'));

            } catch(err) {

                reject(err);
            }
        };

        reader.onerror = () => {

            reject(
                new Error(
                    "File read failed"
                )
            );
        };

        reader.readAsArrayBuffer(file);
    });
}

// =====================================================
// MAIN FILE EXTRACTOR
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

        const fileName =
            (file.name || '').toLowerCase();

        const fileType =
            (file.type || '').toLowerCase();

        // =============================================
        // EXCEL / CSV
        // =============================================

        if (
            fileName.endsWith('.xlsx') ||
            fileName.endsWith('.xls') ||
            fileName.endsWith('.csv') ||
            fileType.includes('spreadsheet') ||
            fileType.includes('excel') ||
            fileType.includes('csv')
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
                        3
                    );

                const preprocessed =
                    await preprocessImage(
                        imageBlob
                    );

                const ret =
                    await ocrWorker.recognize(
                        preprocessed
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
        // IMAGE
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
                words: ret.data.words || [],
                rawText: ret.data.text || ''
            };
        }

    } catch(err) {

        console.error(err);

        alert(
            "❌ OCR ERROR:\n" +
            (err?.message || err)
        );

        return {
            text: '',
            words: null
        };

    } finally {

        if (scanBtn) {

            scanBtn.disabled = false;

            scanBtn.innerHTML =
                '<i class="fas fa-camera"></i> Scan Order';
        }
    }
                    }
