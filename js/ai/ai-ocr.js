// ai-ocr.js – enhanced to support Excel/CSV files
let ocrWorker = null;

async function initOCR() {
    if (!ocrWorker) {
        ocrWorker = await Tesseract.createWorker('eng', 1, {
            tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-.'
        });
    }
}

// Helper to process Excel/CSV files – reuses bulk upload logic
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
                    reject(new Error("File has no data rows"));
                    return;
                }
                // Find column indices for part number and quantity (same as bulk upload)
                let partColIndex = -1, qtyColIndex = -1;
                for (let i = 0; i < Math.min(rows.length, 15); i++) {
                    const row = rows[i];
                    if (!row || row.length === 0) continue;
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
                    reject(new Error("Column 'Part Number' not found in Excel/CSV"));
                    return;
                }
                // Build a text representation: "PART_NUMBER QTY" per line
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
        reader.onerror = () => reject(new Error("Failed to read Excel/CSV file"));
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
        // Check for Excel/CSV by MIME type or file extension
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
