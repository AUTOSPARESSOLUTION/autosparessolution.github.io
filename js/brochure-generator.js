// brochure-generator.js – Complete Brochure + WhatsApp + Correct Excel Dealer Data
(function() {

console.log("Brochure Generator loaded");

let dealerMaster = [];
let currentOffers = [];

// =========================
// LOAD EXCEL FILE
// =========================
async function loadExcelFile(url, sheetName = null) {

    try {

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`Failed to load ${url}`);
        }

        const arrayBuffer = await response.arrayBuffer();

        const workbook = XLSX.read(arrayBuffer, {
            type: 'array'
        });

        let sheet;

        if (sheetName && workbook.SheetNames.includes(sheetName)) {

            sheet = workbook.Sheets[sheetName];

            console.log(`✅ Loaded sheet: ${sheetName}`);

        } else {

            sheet = workbook.Sheets[workbook.SheetNames[0]];

            console.log(`✅ Loaded first sheet: ${workbook.SheetNames[0]}`);
        }

        return XLSX.utils.sheet_to_json(sheet);

    } catch(err) {

        console.warn(`Could not load ${url}:`, err);

        return [];
    }
}

// =========================
// LOAD DEALER MASTER
// =========================
async function loadDealerMaster() {

    try {

        let masterData = [];

        // MAIN FILE
        let sapRows = await loadExcelFile(
            'data/RETAILER data details.xlsx',
            'SAPUI5 Export'
        );

        if (sapRows.length > 0) {

            masterData = sapRows;

            console.log(`✅ Loaded retailer master from SAPUI5 Export`);
        }

        // FALLBACK
        if (masterData.length === 0) {

            console.warn("⚠️ Retailer master not found. Using demo data.");

            masterData = [{
                'Retailer Name': 'Demo Dealer',
                'Mobile No': '919830300193',
                'District': 'Kolkata'
            }];
        }

        dealerMaster = masterData.map(row => {

            const cleanName = (
                row['Retailer Name'] ||
                row['Dealer Name'] ||
                row['dealer'] ||
                row['name'] ||
                row['Name'] ||
                ''
            ).toString().trim();

            let cleanPhone = (
                row['Mobile No'] ||
                row['Phone'] ||
                row['phone'] ||
                ''
            ).toString();

            // REMOVE SPECIAL CHARS
            cleanPhone = cleanPhone.replace(/\D/g, '');

            // ADD INDIA CODE
            if (cleanPhone.length === 10) {
                cleanPhone = '91' + cleanPhone;
            }

            return {

                name: cleanName,

                address:
                    row['Address'] ||
                    '',

                phone: cleanPhone,

                email:
                    row['Email'] ||
                    '',

                city:
                    row['District'] ||
                    row['City'] ||
                    '',

                ownerName:
                    row['Owner Name'] ||
                    '',

                rlpCode:
                    row['RLP Code'] ||
                    '',

                customerType:
                    row['Customer Type'] ||
                    '',

                subDist:
                    row['Sub Dist Dsc'] ||
                    ''
            };
        });

        // REMOVE BLANK
        dealerMaster = dealerMaster.filter(d => d.name);

        console.log(`✅ Loaded ${dealerMaster.length} dealers`);

        return dealerMaster;

    } catch(err) {

        console.error("Dealer master error:", err);

        dealerMaster = [{
            name: "Demo Dealer",
            phone: "919830300193",
            address: "Demo Address",
            city: "Kolkata"
        }];

        return dealerMaster;
    }
}

// =========================
// LOAD OFFERS
// =========================
function loadOffers() {

    try {

        const offersData = JSON.parse(
            localStorage.getItem('dealerOffers') || '{}'
        );

        currentOffers = offersData.offers || [];

        console.log(`✅ Loaded ${currentOffers.length} offers`);

        return currentOffers;

    } catch(err) {

        console.error("Failed to load offers:", err);

        currentOffers = [];

        return [];
    }
}

// =========================
// MATCH DEALER OFFERS
// =========================
function getAllDealerOffers(dealerName) {

    const cleanDealer = dealerName
        .toString()
        .trim()
        .toLowerCase();

    return currentOffers.filter(o => {

        const offerDealer = (o.dealer || '')
            .toString()
            .trim()
            .toLowerCase();

        return offerDealer === cleanDealer;
    });
}

// =========================
// ESCAPE HTML
// =========================
function escapeHtml(str) {

    if (!str) return '';

    return str.replace(/[&<>]/g, function(m) {

        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';

        return m;
    });
}

// =========================
// WHATSAPP MESSAGE
// =========================
function generateWhatsAppFlyerMessage(dealer, offers) {

    const dealerOffers = getAllDealerOffers(dealer.name);

    const sortedOffers = [...dealerOffers]
        .sort((a,b) => b.discount - a.discount)
        .slice(0, 30);

    let message = `*⚡ AUTO SPARES SOLUTION ⚡*\\n\\n`;

    message += `Dear ${dealer.name},\\n\\n`;

    if (sortedOffers.length === 0) {

        message += `No active offers available now.\\n\\n`;

    } else {

        message += `*SPECIAL OFFERS FOR YOU*\\n`;
        message += `━━━━━━━━━━━━━━━━━━\\n\\n`;

        for (const offer of sortedOffers) {

            message += `🔹 *${offer.part}*\\n`;

            message += `📊 Avg: ${offer.avgQty.toFixed(1)} units/month\\n`;

            if (offer.discount > 0) {

                message += `✨ ${offer.discount}% OFF\\n`;
            }

            message += `💰 Offer Price: ₹${offer.offerPrice.toFixed(2)}\\n`;

            message += `📦 Stock: ${offer.totalStock}\\n\\n`;
        }
    }

    message += `━━━━━━━━━━━━━━━━━━\\n`;

    message += `📞 9830300193\\n`;

    message += `🌐 autosparessolution.com\\n\\n`;

    message += `Reply YES with part numbers to place order.`;

    return message;
}

// =========================
// HTML BROCHURE
// =========================
function generateFullBrochureHTML(dealer, offers) {

    const dealerOffers = getAllDealerOffers(dealer.name);

    const sortedOffers = [...dealerOffers]
        .sort((a,b) => b.discount - a.discount)
        .slice(0, 30);

    let offersHtml = '';

    for (const offer of sortedOffers) {

        offersHtml += `
            <div style="
                background:#f8fafc;
                padding:12px;
                margin:10px 0;
                border-radius:8px;
                border-left:4px solid #facc15;
            ">
                <div style="font-weight:bold;font-size:16px;">
                    ${escapeHtml(offer.part)}
                </div>

                <div>
                    Avg Monthly:
                    ${offer.avgQty.toFixed(1)}
                </div>

                <div>
                    Discount:
                    ${offer.discount}%
                </div>

                <div>
                    Offer Price:
                    ₹${offer.offerPrice.toFixed(2)}
                </div>

                <div>
                    Stock:
                    ${offer.totalStock}
                </div>
            </div>
        `;
    }

    if (sortedOffers.length === 0) {

        offersHtml = `
            <div style="padding:20px;text-align:center;">
                No active offers available.
            </div>
        `;
    }

    return `
    <!DOCTYPE html>

    <html>

    <head>

        <meta charset="UTF-8">

        <meta name="viewport"
              content="width=device-width, initial-scale=1.0">

        <title>${escapeHtml(dealer.name)}</title>

    </head>

    <body style="
        font-family:Arial,sans-serif;
        background:#f1f5f9;
        padding:20px;
    ">

        <div style="
            max-width:800px;
            margin:auto;
            background:white;
            border-radius:15px;
            overflow:hidden;
            box-shadow:0 5px 20px rgba(0,0,0,0.15);
        ">

            <div style="
                background:#0f172a;
                color:white;
                padding:25px;
                text-align:center;
            ">

                <h1 style="color:#facc15;">
                    ⚡ AUTO SPARES SOLUTION ⚡
                </h1>

                <div>
                    Premium Auto Parts Wholesaler
                </div>
            </div>

            <div style="padding:20px;">

                <h2>
                    ${escapeHtml(dealer.name)}
                </h2>

                <div>
                    📍 ${escapeHtml(dealer.city || '')}
                </div>

                <div>
                    📞 ${dealer.phone || ''}
                </div>

                <div>
                    📧 ${dealer.email || ''}
                </div>

                <hr style="margin:20px 0;">

                <h3>
                    🎁 Special Offers
                </h3>

                ${offersHtml}

            </div>

            <div style="
                background:#facc15;
                text-align:center;
                padding:20px;
            ">

                <a href="https://wa.me/${dealer.phone || '919830300193'}"
                   target="_blank"
                   style="
                        background:#25D366;
                        color:white;
                        text-decoration:none;
                        padding:12px 25px;
                        border-radius:50px;
                        display:inline-block;
                        font-weight:bold;
                   ">

                    📱 Order on WhatsApp

                </a>

            </div>

        </div>

    </body>

    </html>
    `;
}

// =========================
// SEND SINGLE WHATSAPP
// =========================
function sendFlyerToWhatsApp(dealer, offers) {

    const message = generateWhatsAppFlyerMessage(dealer, offers);

    const encodedMsg = encodeURIComponent(message);

    let phone = dealer.phone || '919830300193';

    phone = phone.toString().replace(/\D/g, '');

    if (phone.length === 10) {
        phone = '91' + phone;
    }

    window.open(
        `https://wa.me/${phone}?text=${encodedMsg}`,
        '_blank'
    );
}

// =========================
// SEND BULK WHATSAPP
// =========================
async function sendBulkFlyersToWhatsApp() {

    await loadDealerMaster();

    const offers = loadOffers();

    let count = 0;

    for (const dealer of dealerMaster) {

        const dealerOffers =
            getAllDealerOffers(dealer.name);

        if (
            dealerOffers.length > 0 &&
            dealer.phone
        ) {

            sendFlyerToWhatsApp(dealer, offers);

            count++;

            await new Promise(r => setTimeout(r, 1500));
        }
    }

    alert(`✅ Opened WhatsApp for ${count} dealers`);
}

// =========================
// GET DEALERS WITH OFFERS
// =========================
async function getDealersWithOffers() {

    await loadDealerMaster();

    loadOffers();

    const result = [];

    for (const dealer of dealerMaster) {

        const dealerOffers =
            getAllDealerOffers(dealer.name);

        if (dealerOffers.length > 0) {

            result.push({

                name: dealer.name,

                phone: dealer.phone,

                city: dealer.city,

                offerCount: dealerOffers.length,

                maxDiscount: Math.max(
                    ...dealerOffers.map(o => o.discount),
                    0
                )
            });
        }
    }

    return result;
}

// =========================
// PREVIEW
// =========================
function showBrochurePreview(dealer, offers) {

    const html =
        generateFullBrochureHTML(dealer, offers);

    const previewWindow = window.open(
        '',
        '_blank',
        'width=800,height=900'
    );

    if (previewWindow) {

        previewWindow.document.write(html);

        previewWindow.document.close();

    } else {

        alert("Popup blocked! Please allow popups.");
    }
}

// =========================
// EXPORT ALL
// =========================
async function exportAllBrochures() {

    await loadDealerMaster();

    const offers = loadOffers();

    let combinedHtml = `
        <html>
        <head>
            <title>All Brochures</title>
        </head>
        <body>
    `;

    let count = 0;

    for (const dealer of dealerMaster) {

        const dealerOffers =
            getAllDealerOffers(dealer.name);

        if (dealerOffers.length > 0) {

            combinedHtml += `
                <div style="page-break-after:always;">
                    ${generateFullBrochureHTML(dealer, offers)}
                </div>
            `;

            count++;
        }
    }

    combinedHtml += `
        </body>
        </html>
    `;

    const blob = new Blob(
        [combinedHtml],
        { type: 'text/html' }
    );

    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');

    a.href = url;

    a.download =
        `all_brochures_${new Date()
            .toISOString()
            .split('T')[0]}.html`;

    document.body.appendChild(a);

    a.click();

    document.body.removeChild(a);

    URL.revokeObjectURL(url);

    alert(`✅ Exported ${count} brochures`);
}

// =========================
// GLOBAL
// =========================
window.BrochureGenerator = {

    loadDealerMaster,

    loadOffers,

    getAllDealerOffers,

    generateWhatsAppFlyerMessage,

    generateFullBrochureHTML,

    sendFlyerToWhatsApp,

    sendBulkFlyersToWhatsApp,

    getDealersWithOffers,

    showBrochurePreview,

    exportAllBrochures,

    getDealerMaster: () => dealerMaster,

    getCurrentOffers: () => currentOffers
};

})();
