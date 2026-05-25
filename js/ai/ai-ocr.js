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

async function preprocessImage(file) {
    return new Promise((resolve) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
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
                data[i] = data[i+1] = data[i+2] = val;
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

async function extractTextFromFile(file) {
    const scanBtn = document.getElementById('ai-scan-btn');
    if (scanBtn) {
        scanBtn.disabled = true;
        scanBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Scanning...';
    }
    try {
        const isExcel = file.name.match(/\.(xlsx|xls|csv)$/i);
        if (isExcel) {
            // Excel extraction code (keep your existing)
            return { text: await extractFromExcelOrCSV(file), words: null };
        } else if (file.type === 'application/pdf') {
            // PDF text extraction (keep your existing)
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            let fullText = '';
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const content = await page.getTextContent();
                fullText += content.items.map(item => item.str).join(' ') + '\n';
            }
            return { text: fullText, words: null };
        } else {
            await initOCR();
            const optimized = await preprocessImage(file);
            const ret = await ocrWorker.recognize(optimized, {}, { text: true, blocks: false });
            const words = (ret.data.words || []).filter(w => w.confidence > 55);
            // Reconstruct rows using y‑coordinate
            const rows = [];
            words.sort((a,b) => a.bbox.y0 - b.bbox.y0);
            let currentRow = { y: words[0]?.bbox.y0, words: [] };
            for (const w of words) {
                if (Math.abs(w.bbox.y0 - currentRow.y) < 12) {
                    currentRow.words.push(w);
                } else {
                    rows.push(currentRow);
                    currentRow = { y: w.bbox.y0, words: [w] };
                }
            }
            if (currentRow.words.length) rows.push(currentRow);
            // Convert each row to text
            const rowTexts = rows.map(row => {
                row.words.sort((a,b) => a.bbox.x0 - b.bbox.x0);
                return row.words.map(w => w.text).join(' ');
            });
            const fullText = rowTexts.join('\n');
            return { text: fullText, words: words, rawText: ret.data.text };
        }
    } finally {
        if (scanBtn) {
            scanBtn.disabled = false;
            scanBtn.innerHTML = '<i class="fas fa-camera"></i> Scan Order';
        }
    }
}

window.extractFromExcelOrCSV = extractFromExcelOrCSV; // keep your existing function
window.preprocessImage = preprocessImage;
window.extractTextFromFile = extractTextFromFile;
