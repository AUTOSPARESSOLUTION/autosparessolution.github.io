console.log("CLEAN OCR EXPORT ai-export.js LOADED");

// =====================================
// EXPORT OCR ITEMS ONLY
// =====================================

function exportOCRToExcel(items) {

    if (!items || items.length === 0) {

        alert("No OCR items found");

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

    const worksheet =
        XLSX.utils.json_to_sheet(rows);

    const workbook =
        XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(

        workbook,

        worksheet,

        "OCR Items"
    );

    XLSX.writeFile(

        workbook,

        "OCR_Extracted_Items.xlsx"
    );
}

// =====================================
// EXPORT MATCHED PRODUCTS
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

            "Qty":
                m.qty || 1
        });
    }

    const worksheet =
        XLSX.utils.json_to_sheet(rows);

    const workbook =
        XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(

        workbook,

        worksheet,

        "Matched Items"
    );

    XLSX.writeFile(

        workbook,

        "Matched_Products.xlsx"
    );
}
