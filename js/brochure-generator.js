// brochure-generator.js – FINAL WORKING VERSION
(function () {

console.log("✅ BrochureGenerator Loaded");

let dealerMaster = [];
let currentOffers = [];

// ==========================================
// NORMALIZE TEXT
// ==========================================
function normalizeText(text) {

    return String(text || '')
        .toUpperCase()
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/[^A-Z0-9 ]/g, '');
}

// ==========================================
// CLEAN PHONE
// ==========================================
function cleanPhone(phone) {

    let p = String(phone || '')
        .replace(/\D/g, '');

    if (!p) return '';

    // remove leading zero
    if (p.startsWith('0')) {
        p = p.substring(1);
    }

    // convert to whatsapp format
    if (p.length === 10) {
        p = '91' + p;
    }

    return p;
}

// ==========================================
// LOAD EXCEL
// ==========================================
async function loadExcelFile(url, sheetName = null) {

    try {

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(url);
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
            sheet = workbook.Sheets[sheetName];
        } else {
            sheet = workbook.Sheets[workbook.SheetNames[0]];
        }

        return XLSX.utils.sheet_to_json(sheet);

    } catch (err) {

        console.error("Excel Load Error:", err);

        return [];
    }
}

// ==========================================
// LOAD DEALERS
// ==========================================
async function loadDealerMaster() {

    const rows = await loadExcelFile(
        'data/RETAILER data details.xlsx',
        'SAPUI5 Export'
    );

    dealerMaster = rows.map(r => ({

        name:
            r['Retailer Name'] ||
            r['Customer Name'] ||
            '',

        normalized:
            normalizeText(
                r['Retailer Name'] ||
                r['Customer Name'] ||
                ''
            ),

        phone:
            cleanPhone(
                r['Mobile No'] ||
                ''
            ),

        district:
            r['District'] || '',

        owner:
            r['Owner Name'] || '',

        rlp:
            r['RLP Code'] || ''

    }));

    console.log(
        "✅ Dealer Master Loaded:",
        dealerMaster.length
    );

    return dealerMaster;
}

// ==========================================
// LOAD OFFERS
// ==========================================
function loadOffers() {

    const data = JSON.parse(
        localStorage.getItem('dealerOffers') || '{}'
    );

    currentOffers = data.offers || [];

    console.log(
        "✅ Offers Loaded:",
        currentOffers.length
    );

    return currentOffers;
}

// ==========================================
// FIND DEALER
// ==========================================
function findDealer(dealerName) {

    const target = normalizeText(dealerName);

    // exact
    let found = dealerMaster.find(d =>
        d.normalized === target
    );

    if (found) return found;

    // contains
    found = dealerMaster.find(d =>
        d.normalized.includes(target) ||
        target.includes(d.normalized)
    );

    return found || null;
}

// ==========================================
// GET DEALER OFFERS
// ==========================================
function getDealerOffers(dealerName) {

    const target = normalizeText(dealerName);

    return currentOffers.filter(o => {

        const offerDealer =
            normalizeText(o.dealer);

        return (
            offerDealer === target ||
            offerDealer.includes(target) ||
            target.includes(offerDealer)
        );
    });
}

// ==========================================
// WHATSAPP MESSAGE
// ==========================================
function generateWhatsAppMessage(dealerName) {

    const offers = getDealerOffers(dealerName);

    let msg = '';

    msg += '⚡ AUTO SPARES SOLUTION ⚡\n\n';

    msg += 'Special Offer List\n\n';

    offers.forEach((o, index) => {

        msg += `${index + 1}. ${o.part}\n`;

        msg += `Offer Price: Rs ${o.offerPrice.toFixed(2)}\n`;

        msg += `Discount: ${o.discount}%\n`;

        msg += `Stock: ${o.totalStock}\n\n`;
    });

    msg += 'Reply with required parts.\n\n';

    msg += '9830300193';

    return msg;
}

// ==========================================
// SEND WHATSAPP
// ==========================================
function sendFlyerWhatsApp(dealerName) {

    const dealer = findDealer(dealerName);

    if (!dealer) {

        alert(
            'Dealer not found:\n' + dealerName
        );

        return;
    }

    if (!dealer.phone) {

        alert(
            'Phone missing for:\n' + dealerName
        );

        return;
    }

    const msg =
        generateWhatsAppMessage(dealerName);

    const url =
        `https://wa.me/${dealer.phone}?text=${encodeURIComponent(msg)}`;

    window.open(url, '_blank');
}

// ==========================================
// GET DEALERS WITH OFFERS
// ==========================================
async function getDealersWithOffers() {

    await loadDealerMaster();

    loadOffers();

    const result = [];

    const uniqueDealers =
        [...new Set(
            currentOffers.map(o => o.dealer)
        )];

    uniqueDealers.forEach(name => {

        const offers =
            getDealerOffers(name);

        if (offers.length === 0) return;

        const dealer =
            findDealer(name);

        result.push({

            name: name,

            phone:
                dealer?.phone || '',

            district:
                dealer?.district || '',

            offers:
                offers.length
        });
    });

    console.log(
        "✅ Dealers With Offers:",
        result.length
    );

    return result;
}

// ==========================================
// SHOW BROCHURE
// ==========================================
function showFlyerPreview(dealerName) {

    const offers =
        getDealerOffers(dealerName);

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
        background:#f4f4f4;
    }

    </style>

    </head>

    <body>

    <h2>AUTO SPARES SOLUTION</h2>

    <h3>${dealerName}</h3>

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
            <td>Rs ${o.offerPrice.toFixed(2)}</td>
            <td>${o.discount}%</td>
            <td>${o.totalStock}</td>
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

// ==========================================
// EXPORT ALL
// ==========================================
async function exportAllFlyers() {

    const dealers =
        await getDealersWithOffers();

    let html = `
    <html>
    <body>
    `;

    dealers.forEach(d => {

        const offers =
            getDealerOffers(d.name);

        html += `
        <h2>${d.name}</h2>
        <table border="1" cellspacing="0" cellpadding="5">

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
                <td>Rs ${o.offerPrice.toFixed(2)}</td>
                <td>${o.discount}%</td>
                <td>${o.totalStock}</td>
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
        'dealer_flyers.html';

    a.click();

    URL.revokeObjectURL(url);
}

// ==========================================
// GLOBAL EXPORT
// ==========================================
window.BrochureGenerator = {

    loadDealerMaster,
    loadOffers,
    getDealersWithOffers,
    getDealerOffers,
    sendFlyerWhatsApp,
    showFlyerPreview,
    exportAllFlyers,

    getDealerMaster: () => dealerMaster,

    getCurrentOffers: () => currentOffers
};

})();
