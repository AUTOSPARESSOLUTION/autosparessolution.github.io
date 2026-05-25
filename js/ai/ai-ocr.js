let ocrWorker = null;

async function initOCR() {
    if (!ocrWorker) {
        ocrWorker = await Tesseract.createWorker('eng');
        await ocrWorker.setParameters({
            tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-./',
            tessedit_pageseg_mode: '6',
            preserve_interword_spaces: '1'
        });
    }
}

async function preprocessImage(blob) {
    return new Promise((resolve) => {
        const img = new Image();
        const url = URL.createObjectURL(blob);
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;
            const maxWidth = 1600;
            if (width > maxWidth) {
                height *= maxWidth / width;
                width = maxWidth;
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            const imageData = ctx.getImageData(0, 0, width, height);
            const data = imageData.data;
            for (let i = 0; i < data.length; i += 4) {
                const avg = (data[i] + data[i+1] + data[i+2]) / 3;
                const val = avg > 140 ? 255 : 0;
                data[i] = val;
                data[i+1] = val;
                data[i+2] = val;
            }
            ctx.putImageData(imageData, 0, 0);
            canvas.toBlob(blob => {
                URL.revokeObjectURL(url);
                resolve(blob);
            }, 'image/jpeg', 0.9);
        };
        img.src = url;
    });
}

// Render PDF page to image at high resolution
async function pdfPageToImage(page, scale = 2.5) {
    const viewport = page.getViewport({ scale: scale });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: context, viewport: viewport }).promise;
    return new Promise((resolve) => canvas.toBlob(blob => resolve(blob), 'image/jpeg', 0.9));
}

async function extractFromExcelOrCSV(file) { /* keep your existing function */ }

async function extractTextFromFile(file) {
    const scanBtn = document.getElementById('ai-scan-btn');
    if (scanBtn) {
        scanBtn.disabled = true;
        scanBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Scanning...';
    }
    try {
        // Excel/CSV
        if (file.name.match(/\.(xlsx|xls|csv)$/i)) {
            const text = await extractFromExcelOrCSV(file);
            return { text: text, words: null, rows: null };
        }
        // PDF
        else if (file.type === 'application/pdf') {
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            let fullText = '';
            await initOCR();
            if (typeof showToast === 'function') showToast(`OCR scanning ${pdf.numPages} page(s)...`, false);
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const imageBlob = await pdfPageToImage(page, 2.5);
                const preprocessed = await preprocessImage(imageBlob);
                const ret = await ocrWorker.recognize(preprocessed);
                fullText += ret.data.text + '\n';
            }
            return { text: fullText, words: null, rows: null };
        }
        // Image
        else {
            await initOCR();
            const optimized = await preprocessImage(file);
            const ret = await ocrWorker.recognize(optimized, {}, { text: true, blocks: false });
            const words = (ret.data.words || []).filter(w => w.confidence > 55);
            // Group words into rows (using Y coordinate)
            words.sort((a,b) => a.bbox.y0 - b.bbox.y0);
            const rows = [];
            let currentRow = { y: words[0]?.bbox.y0, words: [] };
            for (const w of words) {
                if (Math.abs(w.bbox.y0 - currentRow.y) < 15) {
                    currentRow.words.push(w);
                } else {
                    rows.push(currentRow);
                    currentRow = { y: w.bbox.y0, words: [w] };
                }
            }
            if (currentRow.words.length) rows.push(currentRow);
            
            // Sort each row's words by X position (left to right)
            rows.forEach(row => {
                row.words.sort((a,b) => a.bbox.x0 - b.bbox.x0);
                row.text = row.words.map(w => w.text).join(' ');
            });
            
            const fullText = rows.map(row => row.text).join('\n');
            return { text: fullText, words: words, rows: rows };
        }
    } finally {
        if (scanBtn) {
            scanBtn.disabled = false;
            scanBtn.innerHTML = '<i class="fas fa-camera"></i> Scan Order';
        }
    }
        }
