let ocrWorker = null;

async function initOCR() {
    if (!ocrWorker) {
        ocrWorker = await Tesseract.createWorker('eng', 1, {
            tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-.'
        });
    }
}

async function extractTextFromFile(file) {
    const scanBtn = document.getElementById('ai-scan-btn');
    if (scanBtn) {
        scanBtn.disabled = true;
        scanBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Scanning...';
    }
    try {
        if (file.type === 'application/pdf') {
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            let fullText = '';
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const content = await page.getTextContent();
                fullText += content.items.map(item => item.str).join(' ') + '\n';
            }
            return fullText;
        } else {
            await initOCR();
            const resizedBlob = await resizeImage(file, 1600);
            const ret = await ocrWorker.recognize(resizedBlob);
            return ret.data.text;
        }
    } finally {
        if (scanBtn) {
            scanBtn.disabled = false;
            scanBtn.innerHTML = '<i class="fas fa-camera"></i> Scan Order';
        }
    }
}

window.addEventListener('beforeunload', async () => {
    if (ocrWorker) {
        await ocrWorker.terminate();
        ocrWorker = null;
    }
});
