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

// Render PDF page to image at high resolution (scale 2.5)
async function pdfPageToImage(page, scale = 2.5) {
    const viewport = page.getViewport({ scale: scale });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: context, viewport: viewport }).promise;
    return new Promise((resolve) => {
        canvas.toBlob(blob => resolve(blob), 'image/jpeg', 0.9);
    });
}

async function extractFromExcelOrCSV(file) {
    // (keep your existing Excel extraction code – same as before)
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: "" });
                if (!rows || rows.length < 2) reject(new Error("No data rows"));
                let partColIndex = -1, qtyColIndex = -1;
                for (let i = 0; i < Math.min(rows.length, 15); i++) {
                    const row = rows[i];
                    if (!row) continue;
                    for (let j = 0; j < row.length; j++) {
                        const cell = (row[j] || "").toString().trim().toLowerCase();
                        if ((cell.includes("part") && (cell.includes("number") || cell === "part" || cell === "partno"))) partColIndex = j;
                        if (cell.includes("qty") || cell === "quantity" || cell === "qty.") qtyColIndex = j;
                    }
                    if (partColIndex !== -1) break;
                }
                if (partColIndex === -1) reject(new Error("No 'Part Number' column"));
                let lines = [];
                for (let i = 1; i < rows.length; i++) {
                    const row = rows[i];
                    if (!row || row.length === 0) continue;
                    let partNoRaw = row[partColIndex] ? row[partColIndex].toString().trim() : "";
                    if (partNoRaw === "") continue;
                    let qty = 1;
                    if (qtyColIndex !== -1 && row[qtyColIndex]) {
                        let qtyVal = parseFloat(row[qtyColIndex]);
                        if (!isNaN(qtyVal) && qtyVal > 0) qty = Math.floor(qtyVal);
                    }
                    lines.push(`${partNoRaw} x${qty}`);
                }
                resolve(lines.join('\n'));
            } catch(err) { reject(err); }
        };
        reader.onerror = () => reject(new Error("File read failed"));
        reader.readAsArrayBuffer(file);
    });
}

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
            return { text: text, words: null };
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
                const imageBlob = await pdfPageToImage(page, 2.5);  // high resolution
                const preprocessed = await preprocessImage(imageBlob);
                const ret = await ocrWorker.recognize(preprocessed);
                fullText += ret.data.text + '\n';
            }
            return { text: fullText, words: null };
        }
        // Image
        else {
            await initOCR();
            const optimized = await preprocessImage(file);
            const ret = await ocrWorker.recognize(optimized);
            const words = (ret.data.words || []).filter(w => w.confidence > 55);
            // reconstruct lines (simplified)
            const lines = [];
            words.sort((a,b) => a.bbox.y0 - b.bbox.y0);
            let currentLine = { y: words[0]?.bbox.y0, words: [] };
            for (const w of words) {
                if (Math.abs(w.bbox.y0 - currentLine.y) < 15) {
                    currentLine.words.push(w);
                } else {
                    lines.push(currentLine);
                    currentLine = { y: w.bbox.y0, words: [w] };
                }
            }
            if (currentLine.words.length) lines.push(currentLine);
            const text = lines.map(line => {
                line.words.sort((a,b) => a.bbox.x0 - b.bbox.x0);
                return line.words.map(w => w.text).join(' ');
            }).join('\n');
            return { text: text, words: words, rawText: ret.data.text };
        }
    } finally {
        if (scanBtn) {
            scanBtn.disabled = false;
            scanBtn.innerHTML = '<i class="fas fa-camera"></i> Scan Order';
        }
    }
}
