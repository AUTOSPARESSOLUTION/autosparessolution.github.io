let ocrWorker = null;

async function initOCR() {
    if (!ocrWorker) {
        ocrWorker = await Tesseract.createWorker('eng');
        try {
            await ocrWorker.setParameters({
                tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-./',
                tessedit_pageseg_mode: '6',
                preserve_interword_spaces: '1'
            });
        } catch(err) {
            console.warn('Parameter set warning:', err);
        }
    }
}

// Adaptive resizing: smaller for mobile
function getAdaptiveMaxSize() {
    return window.innerWidth < 768 ? 1100 : 1600;
}

// Fast binarisation (removes shadows)
async function preprocessImageBinary(file, threshold = 140) {
    return new Promise((resolve) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;
            for (let i = 0; i < data.length; i += 4) {
                const avg = (data[i] + data[i+1] + data[i+2]) / 3;
                const val = avg > threshold ? 255 : 0;
                data[i] = data[i+1] = data[i+2] = val;
            }
            ctx.putImageData(imageData, 0, 0);
            canvas.toBlob(blob => {
                URL.revokeObjectURL(url);
                resolve(blob);
            }, file.type);
        };
        img.src = url;
    });
}

// Group words into lines based on vertical position
function groupWordsIntoLines(words, yTolerance = 12) {
    if (!words || words.length === 0) return [];
    const lines = [];
    const sorted = [...words].sort((a, b) => a.bbox.y0 - b.bbox.y0);
    for (const word of sorted) {
        let placed = false;
        for (const line of lines) {
            if (Math.abs(line.y - word.bbox.y0) < yTolerance) {
                line.words.push(word);
                placed = true;
                break;
            }
        }
        if (!placed) {
            lines.push({ y: word.bbox.y0, words: [word] });
        }
    }
    return lines.map(line => {
        line.words.sort((a, b) => a.bbox.x0 - b.bbox.x0);
        return line.words.map(w => w.text).join(' ');
    });
}

async function extractFromExcelOrCSV(file) {
    // ... same as before (keep your existing implementation)
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: "" });
                if (!rows || rows.length < 2) {
                    reject(new Error("No data rows"));
                    return;
                }
                let partColIndex = -1, qtyColIndex = -1;
                for (let i = 0; i < Math.min(rows.length, 15); i++) {
                    const row = rows[i];
                    if (!row) continue;
                    for (let j = 0; j < row.length; j++) {
                        const cell = (row[j] || "").toString().trim().toLowerCase();
                        if ((cell.includes("part") && (cell.includes("number") || cell === "part" || cell === "partno"))) {
                            partColIndex = j;
                        }
                        if (cell.includes("qty") || cell === "quantity" || cell === "qty.") {
                            qtyColIndex = j;
                        }
                    }
                    if (partColIndex !== -1) break;
                }
                if (partColIndex === -1) {
                    reject(new Error("No 'Part Number' column found"));
                    return;
                }
                let textLines = [];
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
                    textLines.push(`${partNoRaw} x${qty}`);
                }
                resolve(textLines.join('\n'));
            } catch(err) {
                reject(err);
            }
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
        const isExcel = file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
                        file.type === 'application/vnd.ms-excel' ||
                        file.name.match(/\.(xlsx|xls|csv)$/i);
        if (isExcel) {
            return await extractFromExcelOrCSV(file);
        } else if (file.type === 'application/pdf') {
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
            const preprocessed = await preprocessImageBinary(file, 140);
            const maxSize = getAdaptiveMaxSize();
            const resized = await resizeImage(preprocessed, maxSize);
            // Timeout protection (25 seconds)
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('OCR timeout')), 25000)
            );
            const ret = await Promise.race([
                ocrWorker.recognize(resized, {}, { text: true, blocks: false }),
                timeoutPromise
            ]);
            // Filter low-confidence words (<55%)
            const highConfWords = (ret.data.words || []).filter(w => w.confidence > 55);
            const reconstructedLines = groupWordsIntoLines(highConfWords);
            const fullText = reconstructedLines.join('\n');
            return { text: fullText, words: highConfWords, rawText: ret.data.text };
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
