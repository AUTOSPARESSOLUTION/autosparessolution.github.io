console.log("ai-export.js loaded");

// =====================================
// EXPORT SCANNED ITEMS TO EXCEL
// =====================================

function exportScannedItemsToExcel(matches) {

    if (!matches || matches.length === 0) {

        alert("No scanned items to export");

        return;
    }

    const rows = [];

    for (const m of matches) {

        rows.push({

            "Part No": m.product?.part || m.partRaw || "",

            "Scanned Part": m.partRaw || "",

            "Quantity": m.qty || 1,

            "Match Status":
                m.product ? "Matched" : "Not Found",

            "Description":
                m.product?.description || "",

            "Price":
                m.product?.price || "",

            "HSN":
                m.product?.hsn || ""
        });
    }

    const worksheet =
        XLSX.utils.json_to_sheet(rows);

    const workbook =
        XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
        workbook,
        worksheet,
        "Scanned Order"
    );

    XLSX.writeFile(
        workbook,
        "Scanned_Order.xlsx"
    );
}
