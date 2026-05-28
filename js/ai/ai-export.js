console.log("FINAL CLEAN ai-export.js LOADED");

// =====================================
// EXPORT OCR ITEMS ONLY
// =====================================

function exportOCRToExcel(items) {

    if (!items || items.length === 0) {

        console.log("No OCR items to export");

        return;
    }

    const rows = [];

    for (const item of items) {

        rows.push({

            "Part No":
                item.partRaw || "",

            "Qty":
                item.qty || 1
        });
    }

    // =====================================
    // CREATE SHEET
    // =====================================

    const worksheet =
        XLSX.utils.json_to_sheet(rows);

    // column width

    worksheet['!cols'] = [

        { wch: 25 },

        { wch: 10 }
    ];

    // =====================================
    // CREATE WORKBOOK
    // =====================================

    const workbook =
        XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(

        workbook,

        worksheet,

        "OCR Items"
    );

    // =====================================
    // DOWNLOAD
    // =====================================

    XLSX.writeFile(

        workbook,

        "OCR_Extracted_Items.xlsx"
    );

    console.log(
        "OCR Excel exported"
    );
}

// =====================================
// EXPORT MATCHED PRODUCTS
// =====================================

function exportScannedItemsToExcel(matches) {

    if (!matches || matches.length === 0) {

        console.log("No matched items");

        return;
    }

    const rows = [];

    for (const m of matches) {

        rows.push({

            "Part No":
                m.product?.part ||
                m.partRaw ||
                "",

            "Qty":
                m.qty || 1
        });
    }

    // =====================================
    // CREATE SHEET
    // =====================================

    const worksheet =
        XLSX.utils.json_to_sheet(rows);

    worksheet['!cols'] = [

        { wch: 25 },

        { wch: 10 }
    ];

    // =====================================
    // CREATE WORKBOOK
    // =====================================

    const workbook =
        XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(

        workbook,

        worksheet,

        "Matched Items"
    );

    // =====================================
    // DOWNLOAD
    // =====================================

    XLSX.writeFile(

        workbook,

        "Matched_Products.xlsx"
    );

    console.log(
        "Matched Excel exported"
    );
        }
