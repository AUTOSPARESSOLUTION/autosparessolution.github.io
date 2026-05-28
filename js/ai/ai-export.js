console.log("SAFE ai-export.js LOADED");

// =====================================
// EXPORT OCR ITEMS
// =====================================

function exportOCRToExcel(items) {

    try {

        if (
            typeof XLSX === 'undefined'
        ) {

            console.error(
                "XLSX library missing"
            );

            return;
        }

        if (
            !items ||
            items.length === 0
        ) {

            console.log(
                "No OCR items to export"
            );

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

        worksheet['!cols'] = [

            { wch: 25 },

            { wch: 10 }
        ];

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

        console.log(
            "OCR Excel exported"
        );

    } catch (err) {

        console.error(
            "OCR export failed",
            err
        );
    }
}

// =====================================
// EXPORT MATCHED ITEMS
// =====================================

function exportScannedItemsToExcel(matches) {

    try {

        if (
            typeof XLSX === 'undefined'
        ) {

            console.error(
                "XLSX library missing"
            );

            return;
        }

        if (
            !matches ||
            matches.length === 0
        ) {

            console.log(
                "No matched items"
            );

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

        worksheet['!cols'] = [

            { wch: 25 },

            { wch: 10 }
        ];

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

        console.log(
            "Matched Excel exported"
        );

    } catch (err) {

        console.error(
            "Matched export failed",
            err
        );
    }
            }
