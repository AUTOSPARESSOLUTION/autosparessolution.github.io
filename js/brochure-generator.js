// brochure-generator.js
// FINAL WORKING VERSION
// Auto Spares Solution

(function () {

console.log("✅ Brochure Generator Loaded");

let dealerMaster = [];
let currentOffers = [];

// =========================================
// LOAD EXCEL FILE
// =========================================
async function loadExcelFile(url, sheetName = null) {

    try {

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`Cannot load ${url}`);
        }

        const buffer = await response.arrayBuffer();

        const workbook = XLSX.read(buffer, {
            type: 'array'
        });

        let sheet;

        if (
            sheetName &&
            workbook.SheetNames.includes(sheetName)
        ) {

            sheet =
                workbook.Sheets[sheetName];

        } else {

            sheet =
                workbook.Sheets[
                    workbook.SheetNames[0]
                ];
        }

        return XLSX.utils.sheet_to_json(sheet);

    } catch (err) {

        console.error(err);

        return [];
    }
}

// =========================================
// NORMALIZE
// =========================================
function normalizeText(text) {

    return String(text || '')
        .trim()
        .toUpperCase()
        .replace(/\s+/g, ' ');
}

// =========================================
// CLEAN PHONE
// =========================================
function cleanPhone(phone) {

    let p = String(phone || '')
        .replace(/\D/g, '');

    if (!p) return '';

    if (p.startsWith('0')) {
        p = p.substring(1);
    }

    if (p.length === 10) {
        p = '91' + p;
    }

    return p;
}

// =========================================
// LOAD DEALER MASTER
// =========================================
async function loadDealerMaster() {

    try {

        const rows =
            await loadExcelFile(
                'data/RETAILER data details.xlsx',
                'SAPUI5 Export'
            );

        dealerMaster = rows.map(row => {

            const dealerName =
                row['Retailer Name'] ||
                row['Customer Name'] ||
                row['Dealer Name'] ||
                '';

            return {

                name: dealerName,

                normalizedName:
                    normalizeText(dealerName),

                phone:
                    cleanPhone(
                        row['Mobile No'] ||
                        row['Phone'] ||
                        ''
                    ),

                district:
                    row['District'] || '',

                ownerName:
                    row['Owner Name'] || '',

                customerType:
                    row['Customer Type'] || '',

                rlpCode:
                    row['RLP Code'] || ''
            };
        });

        dealerMaster =
            dealerMaster.filter(
                d => d.name
            );

        console.log(
            '✅ Dealer Master Loaded:',
            dealerMaster.length
        );

        return dealerMaster;

    } catch (err) {

        console.error(err);

        dealerMaster = [];

        return [];
    }
}

// =========================================
// LOAD OFFERS
// =========================================
function loadOffers() {

    try {

        const data =
            JSON.parse(
                localStorage.getItem(
                    'dealerOffers'
                ) || '{}'
            );

        currentOffers =
            data.offers || [];

        console.log(
            '✅ Offers Loaded:',
            currentOffers.length
        );

        return currentOffers;

    } catch (err) {

        console.error(err);

        currentOffers = [];

        return [];
    }
}

// =========================================
// GET DEALER OFFERS
// =========================================
function getAllDealerOffers(dealerName) {

    const normalized =
        normalizeText(dealerName);

    return currentOffers.filter(o => {

        const offerDealer =
            normalizeText(
                o.dealer ||
                o.customer ||
                o.customerName ||
                ''
            );

        return offerDealer === normalized;
    });
}

// =========================================
// FIND DEALER
// =========================================
function findDealerInfo(dealerName) {

    const normalized =
        normalizeText(dealerName);

    return dealerMaster.find(d => {

        return (
            d.normalizedName === normalized
        );
    });
}

// =========================================
// WHATSAPP MESSAGE
// =========================================
function generateWhatsAppFlyerMessage(
    dealerName
) {

    const offers =
        getAllDealerOffers(dealerName);

    let msg = '';

    msg += '⚡ AUTO SPARES SOLUTION ⚡\n\n';

    msg +=
        'Dealer: ' +
        dealerName +
        '\n\n';

    msg +=
        'SPECIAL OFFER LIST\n';

    msg +=
        '====================\n\n';

    offers.forEach((o, i) => {

        msg +=
            (i + 1) +
            '. ' +
            (o.part || '') +
            '\n';

        msg +=
            'Offer Price: Rs. ' +
            Number(
                o.offerPrice || 0
            ).toFixed(2) +
            '\n';

        msg +=
            'Discount: ' +
            (o.discount || 0) +
            '%\n';

        msg +=
            'Stock: ' +
            (o.totalStock || 0) +
            '\n\n';
    });

    msg +=
        'Reply with required part numbers.\n\n';

    msg +=
        'Auto Spares Solution\n';

    msg +=
        '9830300193';

    return msg;
}

// =========================================
// SEND TO WHATSAPP
// =========================================
function sendFlyerToWhatsApp(
    dealerName
) {

    const dealer =
        findDealerInfo(dealerName);

    if (!dealer) {

        alert(
            'Dealer not found:\n' +
            dealerName
        );

        console.log(
            'Dealer search failed:',
            dealerName
        );

        return;
    }

    if (!dealer.phone) {

        alert(
            'Phone not found:\n' +
            dealerName
        );

        return;
    }

    const offers =
        getAllDealerOffers(
            dealerName
        );

    if (offers.length === 0) {

        alert(
            'No offers found:\n' +
            dealerName
        );

        return;
    }

    const msg =
        generateWhatsAppFlyerMessage(
            dealerName
        );

    const url =
        `https://wa.me/${dealer.phone}?text=${encodeURIComponent(msg)}`;

    window.open(url, '_blank');
}

// =========================================
// DEALERS WITH OFFERS
// =========================================
async function getDealersWithOffers() {

    await loadDealerMaster();

    loadOffers();

    const result = [];

    const uniqueDealers =
        [
            ...new Set(
                currentOffers.map(o =>
                    normalizeText(
                        o.dealer ||
                        o.customer ||
                        o.customerName ||
                        ''
                    )
                )
            )
        ];

    for (const normalized of uniqueDealers) {

        const dealer =
            dealerMaster.find(
                d =>
                d.normalizedName ===
                normalized
            );

        if (!dealer) continue;

        const offers =
            getAllDealerOffers(
                dealer.name
            );

        if (offers.length === 0)
            continue;

        result.push({

            name:
                dealer.name,

            phone:
                dealer.phone || '',

            district:
                dealer.district || '',

            owner:
                dealer.ownerName || '',

            offerCount:
                offers.length,

            maxDiscount:
                Math.max(
                    ...offers.map(
                        x =>
                        Number(
                            x.discount || 0
                        )
                    ),
                    0
                )
        });
    }

    console.log(
        '✅ Dealers With Offers:',
        result.length
    );

    return result;
}

// =========================================
// PREVIEW
// =========================================
function showBrochurePreview(
    dealerName
) {

    const offers =
        getAllDealerOffers(
            dealerName
        );

    const dealer =
        findDealerInfo(
            dealerName
        );

    if (offers.length === 0) {

        alert(
            'No offers found'
        );

        return;
    }

    let html = `
    <html>
    <head>
    <title>${dealerName}</title>

    <style>

    body{
        font-family:Arial;
        padding:20px;
    }

    table{
        width:100%;
        border-collapse:collapse;
    }

    th,td{
        border:1px solid #ccc;
        padding:8px;
    }

    th{
        background:#facc15;
    }

    </style>

    </head>

    <body>

    <h2>AUTO SPARES SOLUTION</h2>

    <h3>${dealerName}</h3>

    <p>
    Phone:
    ${dealer?.phone || ''}
    </p>

    <table>

    <tr>
        <th>Part No</th>
        <th>Offer Price</th>
        <th>Discount</th>
        <th>Stock</th>
    </tr>
    `;

    offers.forEach(o => {

        html += `
        <tr>

        <td>${o.part || ''}</td>

        <td>
        Rs. ${Number(
            o.offerPrice || 0
        ).toFixed(2)}
        </td>

        <td>
        ${o.discount || 0}%
        </td>

        <td>
        ${o.totalStock || 0}
        </td>

        </tr>
        `;
    });

    html += `
    </table>

    </body>
    </html>
    `;

    const win =
        window.open('', '_blank');

    win.document.write(html);

    win.document.close();
}

// =========================================
// EXPORT HTML
// =========================================
async function exportAllBrochures() {

    const dealers =
        await getDealersWithOffers();

    if (dealers.length === 0) {

        alert(
            'No dealers found'
        );

        return;
    }

    let html = `
    <html>
    <head>
    <title>All Flyers</title>
    <meta charset="UTF-8">
    </head>
    <body>
    `;

    for (const d of dealers) {

        const offers =
            getAllDealerOffers(
                d.name
            );

        html += `
        <h2>
        ${d.name}
        </h2>

        <table border="1"
        cellspacing="0"
        cellpadding="5">

        <tr>
        <th>Part</th>
        <th>Price</th>
        <th>Discount</th>
        <th>Stock</th>
        </tr>
        `;

        offers.forEach(o => {

            html += `
            <tr>

            <td>${o.part || ''}</td>

            <td>
            Rs. ${Number(
                o.offerPrice || 0
            ).toFixed(2)}
            </td>

            <td>
            ${o.discount || 0}%
            </td>

            <td>
            ${o.totalStock || 0}
            </td>

            </tr>
            `;
        });

        html += `
        </table>

        <hr>
        `;
    }

    html += `
    </body>
    </html>
    `;

    const blob =
        new Blob([html], {
            type: 'text/html'
        });

    const url =
        URL.createObjectURL(blob);

    const a =
        document.createElement('a');

    a.href = url;

    a.download =
        'all_brochures.html';

    a.click();

    URL.revokeObjectURL(url);
}

// =========================================
// PDF DOWNLOAD
// =========================================
async function downloadPDF(
    dealerName
) {

    const offers =
        getAllDealerOffers(
            dealerName
        );

    if (offers.length === 0) {

        alert('No offers');

        return;
    }

    const { jsPDF } = window.jspdf;

    const doc =
        new jsPDF();

    doc.setFontSize(16);

    doc.text(
        'AUTO SPARES SOLUTION',
        20,
        20
    );

    doc.setFontSize(12);

    doc.text(
        dealerName,
        20,
        30
    );

    let y = 45;

    offers.forEach((o, i) => {

        doc.text(
            `${i+1}. ${o.part} | Rs.${Number(o.offerPrice || 0).toFixed(2)} | ${o.discount}% | Stock:${o.totalStock}`,
            20,
            y
        );

        y += 10;

        if (y > 270) {

            doc.addPage();

            y = 20;
        }
    });

    doc.save(
        dealerName + '.pdf'
    );
}

// =========================================
// GLOBAL
// =========================================
window.BrochureGenerator = {

    loadDealerMaster,

    loadOffers,

    getAllDealerOffers,

    generateWhatsAppFlyerMessage,

    sendFlyerToWhatsApp,

    getDealersWithOffers,

    showBrochurePreview,

    exportAllBrochures,

    findDealerInfo,

    downloadPDF,

    getDealerMaster: () =>
        dealerMaster,

    getCurrentOffers: () =>
        currentOffers
};

})();
