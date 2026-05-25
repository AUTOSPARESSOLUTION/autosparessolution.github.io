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

// ========== YOUR EXACT PREPROCESS FUNCTION ==========
async function preprocessImage(file) {
    return new Promise((resolve) => {
        const img = new Image();
        const url = URL.createObjectURL(file);

        img.onload = () => {
            const canvas = document.createElement('canvas');

            // Resize for speed
            const maxWidth = 1600;
            let width = img.width;
            let height = img.height;

            if (width > maxWidth) {
                height *= maxWidth / width;
                width = maxWidth;
            }

            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            // Sharpen + contrast
            const imageData = ctx.getImageData(0,0,width,height);
            const data = imageData.data;

            for(let i=0;i<data.length;i+=4){
                const avg = (data[i] + data[i+1] + data[i+2]) / 3;
                const val = avg > 140 ? 255 : 0;
                data[i] = val;
                data[i+1] = val;
                data[i+2] = val;
            }

            ctx.putImageData(imageData,0,0);

            canvas.toBlob(blob => {
                URL.revokeObjectURL(url);
                resolve(blob);
            }, 'image/jpeg', 0.9);
        };

        img.src = url;
    });
}

// Adaptive resizing for mobile (used before preprocessing)
function getAdaptiveMaxSize() {
    return window.innerWidth < 768 ? 1100 : 1600;
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
            if (typeof showToast === 'function') showToast("Optimizing image...", false);
            // 1. Preprocess image (resize + binarise)
            const optimizedBlob = await preprocessImage(file);
            // 2. OCR with timeout protection (25 seconds)
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('OCR timeout')), 25000)
            );
            if (typeof showToast === 'function') showToast("Reading text...", false);
            const ret = await Promise.race([
                ocrWorker.recognize(optimizedBlob, {}, { text: true, blocks: false }),
                timeoutPromise
            ]);
            // 3. Filter words by confidence (>55%)
            const highConfWords = (ret.data.words || []).filter(w => w.confidence > 55);
            const cleanText = highConfWords.map(w => w.text).join(' ');
            // 4. Reconstruct lines for better structure
            const reconstructedLines = groupWordsIntoLines(highConfWords);
            const fullText = reconstructedLines.join('\n');
            console.log("OCR RAW:", ret.data.text);
            console.log("OCR CLEAN:", cleanText);
            // Return object with both full text and word-level data
            return { text: fullText || cleanText || ret.data.text, words: highConfWords, rawText: ret.data.text };
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
