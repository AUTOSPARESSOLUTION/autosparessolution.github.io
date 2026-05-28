console.log("OCR Export ai-export.js loaded");

// =====================================
// EXPORT RAW OCR TO EXCEL
// =====================================

function exportOCRToExcel(ocrResult) {

    let text =
        typeof ocrResult === 'string'
            ? ocrResult
            : (ocrResult.text || '');

    if (!text) {

        alert("No OCR text found");

        return;
    }

    const lines =
        text
        .split(/\r?\n/)
        .filter(x => x.trim());

    const rows = [];

    for (let i = 0; i < lines.length; i++) {

        rows.push({

            "Line No": i + 1,

            "OCR Text":
                lines[i]
        });
    }

    const worksheet =
        XLSX.utils.json_to_sheet(rows);

    const workbook =
        XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(

        workbook,

        worksheet,

        "OCR Raw Text"
    );

    XLSX.writeFile(

        workbook,

        "OCR_Raw_Output.xlsx"
    );
}

// =====================================
// EXPORT MATCHED ITEMS
// =====================================

function exportScannedItemsToExcel(matches) {

    if (!matches || matches.length === 0) {

        alert("No matched items");

        return;
    }

    const rows = [];

    for (const m of matches) {

        rows.push({

            "Part No":
                m.product?.part ||
                m.partRaw ||
                "",

            "Scanned OCR":
                m.partRaw || "",

            "Qty":
                m.qty || 1,

            "Match Status":
                m.product
                    ? "Matched"
                    : "Not Found",

            "Description":
                m.product?.description || "",

            "Price":
                m.product?.price || "",

            "HSN":
                m.product?.hsn || "",

            "Confidence":
                m.confidence || ""
        });
    }

    const worksheet =
        XLSX.utils.json_to_sheet(rows);

    const workbook =
        XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(

        workbook,

        worksheet,

        "Matched Products"
    );

    XLSX.writeFile(

        workbook,

        "Matched_Products.xlsx"
    );
                }
