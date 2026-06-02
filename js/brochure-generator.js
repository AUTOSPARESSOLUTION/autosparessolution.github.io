// brochure-generator.js
// FINAL WORKING VERSION

(function () {

console.log("✅ BrochureGenerator Loaded");

let dealerMaster = [];
let currentOffers = [];

// ========================================
// NORMALIZE TEXT
// ========================================
function normalizeText(text) {

    return String(text || '')
        .toUpperCase()
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/[^A-Z0-9 ]/g, '');
}

// ========================================
// CLEAN PHONE
// ========================================
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

// ========================================
// LOAD EXCEL FILE
// ========================================
async function loadExcelFile(url, sheetName = null) {

    try {

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(url);
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

        console.error(
            'Excel Load Error:',
            err
        );

        return [];
    }
}

// ========================================
// LOAD DEALER MASTER
// ========================================
async function loadDealerMaster() {

    const rows =
        await loadExcelFile(
            'data/RETAILER data details.xlsx',
            'SAPUI5 Export'
        );

    dealerMaster = rows.map(row => ({

        name:
            row['Retailer Name'] ||
            row['Customer Name'] ||
            '',

        normalized:
            normalizeText(
                row['Retailer Name'] ||
                row['Customer Name'] ||
                ''
            ),

        phone:
            cleanPhone(
                row['Mobile No'] || ''
            ),

        district:
            row['District'] || '',

        owner:
            row['Owner Name'] || ''

    }));

    console.log(
        '✅ Dealer Master Loaded:',
        dealerMaster.length
    );

    return dealerMaster;
}

// ========================================
// LOAD OFFERS
// ========================================
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

// ========================================
// FIND DEALER
// ========================================
function findDealer(dealerName) {

    const target =
        normalizeText(dealerName);

    // contains match
    let found =
        dealerMaster.find(d =>

            d.normalized.includes(target) ||

            target.includes(d.normalized)
        );

    // first word match
    if (!found) {

        const firstWord =
            target.split(' ')[0];

        found =
            dealerMaster.find(d =>

                d.normalized.includes(firstWord)
            );
    }

    // fallback
    if (!found) {

        return {

            name: dealerName,
            phone: '',
            district: '',
            owner: ''
        };
    }

    return found;
}

// ========================================
// GET DEALER OFFERS
// ========================================
function getDealerOffers(dealerName) {

    const target =
        normalizeText(dealerName);

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

// ========================================
// GENERATE WHATSAPP MESSAGE
// ========================================
function generateWhatsAppMessage(dealerName) {

    const offers =
        getDealerOffers(dealerName);

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
        .forEach((offer, index) => {

            msg +=
                `${index + 1}. ${offer.part}\n`;

            msg +=
                `Offer Price: Rs ${offer.offerPrice.toFixed(2)}\n`;

            msg +=
                `Discount: ${offer.discount}%\n`;

            msg +=
                `Stock: ${offer.totalStock}\n\n`;
        });

    msg +=
        'Reply with required parts.\n\n';

    msg +=
        'Auto Spares Solution\n';

    msg +=
        '9830300193';

    return msg;
}

// ========================================
// SEND SINGLE WHATSAPP
// ========================================
function sendFlyerWhatsApp(dealerName) {

    const dealer =
        findDealer(dealerName);

    if (!dealer.phone) {

        alert(
            'Phone number not found in Excel for:\n' +
            dealerName
        );

        return;
    }

    const message =
        generateWhatsAppMessage(
            dealerName
        );

    const encoded =
        encodeURIComponent(message);

    const url =
        `https://wa.me/${dealer.phone}?text=${encoded}`;

    window.open(url, '_blank');
}

// ========================================
// SEND BULK WHATSAPP
// ========================================
async function sendBulkFlyersToWhatsApp() {

    const dealers =
        await getDealersWithOffers();

    let count = 0;

    for (const dealer of dealers) {

        if (dealer.phone) {

            sendFlyerWhatsApp(
                dealer.name
            );

            count++;

            await new Promise(r =>
                setTimeout(r, 1200)
            );
        }
    }

    alert(
        `Opened WhatsApp for ${count} dealers`
    );
}

// ========================================
// SHOW FLYER PREVIEW
// ========================================
function showFlyerPreview(dealerName) {

    const offers =
        getDealerOffers(dealerName);

    if (offers.length === 0) {

        alert(
            'No offers found for:\n' +
            dealerName
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
        text-align:left;
    }

    th{
        background:#f4f4f4;
    }

    h2{
        color:#0f172a;
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

// ========================================
// GET DEALERS WITH OFFERS
// ========================================
async function getDealersWithOffers() {

    await loadDealerMaster();

    loadOffers();

    const uniqueDealers =
        [...new Set(
            currentOffers.map(
                o => o.dealer
            )
        )];

    const result = [];

    uniqueDealers.forEach(name => {

        const offers =
            getDealerOffers(name);

        if (offers.length === 0) {
            return;
        }

        const dealer =
            findDealer(name);

        result.push({

            name: name,

            phone:
                dealer.phone || '',

            district:
                dealer.district || '',

            offers:
                offers.length
        });
    });

    console.log(
        '✅ Dealers With Offers:',
        result.length
    );

    return result;
}

// ========================================
// EXPORT ALL FLYERS
// ========================================
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

        <table border="1"
               cellspacing="0"
               cellpadding="5">

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
        new Blob(
            [html],
            {
                type: 'text/html'
            }
        );

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

// ========================================
// GLOBAL EXPORT
// ========================================
window.BrochureGenerator = {

    loadDealerMaster,
    loadOffers,
    getDealerOffers,
    getDealersWithOffers,
    sendFlyerWhatsApp,
    sendBulkFlyersToWhatsApp,
    showFlyerPreview,
    exportAllFlyers,

    getDealerMaster: () => dealerMaster,

    getCurrentOffers: () => currentOffers
};

})();
