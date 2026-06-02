// brochure-generator.js – FINAL COMPLETE WORKING VERSION

(function () {

console.log("✅ Brochure Generator Loaded");

let dealerMaster = [];
let currentOffers = [];

// =====================================
// LOAD EXCEL FILE
// =====================================
async function loadExcelFile(url, sheetName = null) {

    try {

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`Failed to load ${url}`);
        }

        const arrayBuffer =
            await response.arrayBuffer();

        const workbook =
            XLSX.read(arrayBuffer, {
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

// =====================================
// NORMALIZE DEALER NAME
// =====================================
function normalizeDealerName(name) {

    return String(name || '')
        .trim()
        .toUpperCase()
        .replace(/\s+/g, ' ');
}

// =====================================
// CLEAN PHONE
// =====================================
function cleanPhone(phone) {

    let p =
        String(phone || '')
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

// =====================================
// LOAD DEALER MASTER
// =====================================
async function loadDealerMaster() {

    try {

        const rows =
            await loadExcelFile(
                'data/RETAILER data details.xlsx',
                'SAPUI5 Export'
            );

        dealerMaster =
            rows.map(row => ({

                name:
                    row['Retailer Name'] ||
                    row['Customer Name'] ||
                    '',

                normalizedName:
                    normalizeDealerName(
                        row['Retailer Name'] ||
                        row['Customer Name'] ||
                        ''
                    ),

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

            }));

        console.log(
            `✅ Dealers loaded: ${dealerMaster.length}`
        );

        return dealerMaster;

    } catch (err) {

        console.error(err);

        dealerMaster = [];

        return [];
    }
}

// =====================================
// LOAD OFFERS
// =====================================
function loadOffers() {

    try {

        const data =
            JSON.parse(
                localStorage.getItem('dealerOffers') || '{}'
            );

        currentOffers =
            data.offers || [];

        console.log(
            `✅ Offers loaded: ${currentOffers.length}`
        );

        return currentOffers;

    } catch (err) {

        console.error(err);

        currentOffers = [];

        return [];
    }
}

// =====================================
// GET DEALER OFFERS
// =====================================
function getAllDealerOffers(dealerName) {

    const normalized =
        normalizeDealerName(dealerName);

    return currentOffers.filter(o =>

        normalizeDealerName(
            o.dealer
        ) === normalized
    );
}

// =====================================
// FIND DEALER INFO
// =====================================
function findDealerInfo(dealerName) {

    const normalized =
        normalizeDealerName(dealerName);

    return dealerMaster.find(d =>

        d.normalizedName === normalized
    );
}

// =====================================
// GENERATE WHATSAPP MESSAGE
// =====================================
function generateWhatsAppFlyerMessage(
    dealerName
) {

    const offers =
        getAllDealerOffers(dealerName);

    let msg = '';

    msg += '⚡ AUTO SPARES SOLUTION ⚡\n\n';

    msg +=
        `Dear ${dealerName},\n\n`;

    msg +=
        'Special Offer List\n\n';

    offers
        .sort((a, b) =>
            b.discount - a.discount
        )
        .forEach((o, index) => {

            msg +=
                `${index + 1}. ${o.part}\n`;

            msg +=
                `Offer Price: ₹${Number(o.offerPrice || 0).toFixed(2)}\n`;

            msg +=
                `Discount: ${o.discount || 0}%\n`;

            msg +=
                `Stock: ${o.totalStock || 0}\n\n`;
        });

    msg +=
        'Reply with required part numbers.\n\n';

    msg +=
        'Auto Spares Solution\n9830300193';

    return msg;
}

// =====================================
// SEND TO WHATSAPP
// =====================================
function sendFlyerToWhatsApp(
    dealerName
) {

    const dealer =
        findDealerInfo(dealerName);

    if (!dealer) {

        alert(
            `Dealer not found:\n${dealerName}`
        );

        return;
    }

    if (!dealer.phone) {

        alert(
            `Phone missing:\n${dealerName}`
        );

        return;
    }

    const message =
        generateWhatsAppFlyerMessage(
            dealerName
        );

    const encoded =
        encodeURIComponent(message);

    const url =
        `https://wa.me/${dealer.phone}?text=${encoded}`;

    window.open(url, '_blank');
}

// =====================================
// GET DEALERS WITH OFFERS
// =====================================
async function getDealersWithOffers() {

    await loadDealerMaster();

    loadOffers();

    const result = [];

    const uniqueDealers =
        [...new Set(
            currentOffers.map(
                o => o.dealer
            )
        )];

    uniqueDealers.forEach(name => {

        const offers =
            getAllDealerOffers(name);

        if (offers.length === 0) {
            return;
        }

        const dealerInfo =
            findDealerInfo(name);

        result.push({

            name: name,

            phone:
                dealerInfo?.phone || '',

            district:
                dealerInfo?.district || '',

            owner:
                dealerInfo?.ownerName || '',

            offerCount:
                offers.length,

            maxDiscount:
                Math.max(
                    ...offers.map(
                        o => o.discount || 0
                    ),
                    0
                )
        });
    });

    console.log(
        `✅ Dealers with offers: ${result.length}`
    );

    return result;
}

// =====================================
// SHOW PREVIEW
// =====================================
function showBrochurePreview(
    dealerName
) {

    const offers =
        getAllDealerOffers(dealerName);

    if (offers.length === 0) {

        alert(
            `No offers for ${dealerName}`
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
        background:#f5f5f5;
    }

    table{
        width:100%;
        border-collapse:collapse;
        background:white;
    }

    th,td{
        border:1px solid #ccc;
        padding:8px;
        text-align:left;
    }

    th{
        background:#0f172a;
        color:#facc15;
    }

    h1{
        color:#0f172a;
    }

    </style>

    </head>

    <body>

    <h1>
    ⚡ AUTO SPARES SOLUTION
    </h1>

    <h2>
    ${dealerName}
    </h2>

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

            <td>${o.part}</td>

            <td>
            ₹${Number(o.offerPrice || 0).toFixed(2)}
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

// =====================================
// EXPORT ALL BROCHURES
// =====================================
async function exportAllBrochures() {

    const dealers =
        await getDealersWithOffers();

    if (dealers.length === 0) {

        alert('No brochures found');

        return;
    }

    let html = `
    <html>
    <head>
    <title>All Brochures</title>
    </head>
    <body>
    `;

    dealers.forEach(d => {

        const offers =
            getAllDealerOffers(d.name);

        html += `
        <h2>${d.name}</h2>

        <table border="1"
            cellspacing="0"
            cellpadding="5"
            width="100%">

        <tr>
            <th>Part</th>
            <th>Offer Price</th>
            <th>Discount</th>
            <th>Stock</th>
        </tr>
        `;

        offers.forEach(o => {

            html += `
            <tr>

                <td>${o.part}</td>

                <td>
                ₹${Number(o.offerPrice || 0).toFixed(2)}
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

        <br><br>
        `;
    });

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

// =====================================
// EXPORT GLOBAL
// =====================================
window.BrochureGenerator = {

    loadDealerMaster,

    loadOffers,

    getAllDealerOffers,

    generateWhatsAppFlyerMessage,

    sendFlyerToWhatsApp,

    getDealersWithOffers,

    showBrochurePreview,

    exportAllBrochures,

    getDealerMaster: function () {
        return dealerMaster;
    },

    getCurrentOffers: function () {
        return currentOffers;
    }
};

})();
