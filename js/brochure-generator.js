// brochure-generator.js
// FINAL FULL VERSION
// Auto Spares Solution

(function () {

console.log("✅ Brochure Generator Loaded");

let dealerMaster = [];
let currentOffers = [];

// =====================================================
// LOAD DEALER MASTER
// =====================================================

async function loadDealerMaster() {

    try {

        const users =
            JSON.parse(localStorage.getItem('users') || '[]');

        const dealers =
            JSON.parse(localStorage.getItem('dealers') || '[]');

        let allCustomers = [...users, ...dealers];

        if (allCustomers.length === 0) {

            console.log("Trying Excel fallback...");

            allCustomers = await loadExcelFallback();
        }

        dealerMaster = allCustomers.map(customer => {

            const dealerName =
                customer.name ||
                customer.business ||
                customer.dealer ||
                customer['Retailer Name'] ||
                customer['Dealer Name'] ||
                customer['Customer Name'] ||
                '';

            return {

                name: dealerName,

                normalizedName:
                    normalizeText(dealerName),

                phone:
                    cleanPhone(
                        customer.phone ||
                        customer['Mobile No'] ||
                        customer['Phone'] ||
                        ''
                    ),

                email:
                    customer.email ||
                    customer['Email'] ||
                    '',

                address:
                    customer.address ||
                    customer['Address'] ||
                    '',

                gstin:
                    customer.gstin ||
                    customer['GSTIN'] ||
                    '',

                city:
                    customer.city ||
                    customer['District'] ||
                    '',

                pincode:
                    customer.pincode ||
                    customer['Pincode'] ||
                    '',

                ownerName:
                    customer.ownerName ||
                    customer['Owner Name'] ||
                    '',

                customerType:
                    customer.customerType ||
                    customer['Customer Type'] ||
                    '',

                rlpCode:
                    customer.rlpCode ||
                    customer['RLP Code'] ||
                    ''
            };

        });

        const uniqueMap = new Map();

        for (const dealer of dealerMaster) {

            if (
                dealer.name &&
                !uniqueMap.has(dealer.normalizedName)
            ) {

                uniqueMap.set(
                    dealer.normalizedName,
                    dealer
                );
            }
        }

        dealerMaster =
            Array.from(uniqueMap.values());

        console.log(
            "✅ Dealer Master Loaded:",
            dealerMaster.length
        );

        return dealerMaster;

    } catch (err) {

        console.error(err);

        dealerMaster = [];

        return [];
    }
}

// =====================================================
// LOAD EXCEL FILE
// =====================================================

async function loadExcelFile(url, sheetName = null) {

    try {

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`Cannot load ${url}`);
        }

        const buffer =
            await response.arrayBuffer();

        const workbook =
            XLSX.read(buffer, { type: 'array' });

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

// =====================================================
// EXCEL FALLBACK
// =====================================================

async function loadExcelFallback() {

    try {

        const rows =
            await loadExcelFile(
                'data/RETAILER data details.xlsx',
                'SAPUI5 Export'
            );

        return rows.map(row => ({

            name:
                row['Retailer Name'] ||
                row['Customer Name'] ||
                row['Dealer Name'] ||
                '',

            phone:
                row['Mobile No'] ||
                row['Phone'] ||
                '',

            email:
                row['Email'] ||
                '',

            address:
                row['Address'] ||
                '',

            city:
                row['District'] ||
                '',

            ownerName:
                row['Owner Name'] ||
                '',

            customerType:
                row['Customer Type'] ||
                '',

            rlpCode:
                row['RLP Code'] ||
                ''
        }));

    } catch (err) {

        console.error(err);

        return [];
    }
}

// =====================================================
// NORMALIZE TEXT
// =====================================================

function normalizeText(text) {

    return String(text || '')
        .trim()
        .toUpperCase()
        .replace(/\s+/g, ' ');
}

// =====================================================
// CLEAN PHONE
// =====================================================

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

// =====================================================
// LOAD OFFERS
// =====================================================

function loadOffers() {

    try {

        const data =
            JSON.parse(
                localStorage.getItem('dealerOffers') || '{}'
            );

        currentOffers =
            data.offers || [];

        console.log(
            "✅ Offers Loaded:",
            currentOffers.length
        );

        return currentOffers;

    } catch (err) {

        console.error(err);

        currentOffers = [];

        return [];
    }
}

// =====================================================
// GET OFFERS
// =====================================================

function getAllDealerOffers(dealerName) {

    return currentOffers.filter(o => {

        const offerDealer =
            normalizeText(
                o.dealer ||
                o.customer ||
                o.customerName ||
                ''
            );

        return (
            offerDealer ===
            normalizeText(dealerName)
        );
    });
}

// =====================================================
// FIND DEALER
// =====================================================

function findDealerInfo(dealerName) {

    const normalized =
        normalizeText(dealerName);

    return dealerMaster.find(d =>

        d.normalizedName === normalized
    );
}

// =====================================================
// GENERATE MESSAGE
// =====================================================

function generateWhatsAppFlyerMessage(dealerName) {

    const offers =
        getAllDealerOffers(dealerName);

    const dealer =
        findDealerInfo(dealerName);

    let msg = '';

    msg += '⚡ AUTO SPARES SOLUTION ⚡\n\n';

    msg += `Dealer: ${dealerName}\n`;

    if (dealer?.phone) {
        msg += `Phone: ${dealer.phone}\n`;
    }

    msg += '\n';
    msg += `SPECIAL OFFER LIST (${offers.length} ITEMS)\n`;
    msg += '━━━━━━━━━━━━━━━━━━━━\n\n';

    offers.forEach((o, i) => {

        msg += `${i + 1}. ${o.part}\n`;

        msg +=
            `Offer Price: Rs ${Number(
                o.offerPrice || 0
            ).toFixed(2)}\n`;

        msg +=
            `Discount: ${o.discount || 0}%\n`;

        msg +=
            `Stock: ${o.totalStock || 0}\n\n`;
    });

    msg += '━━━━━━━━━━━━━━━━━━━━\n';

    msg += 'Contact: 9830300193\n';

    msg += 'Reply with required part numbers.\n';

    return msg;
}

// =====================================================
// SEND WHATSAPP
// =====================================================

function sendFlyerWhatsApp(dealerName) {

    const dealer =
        findDealerInfo(dealerName);

    if (!dealer) {

        alert(
            'Dealer not found:\n' +
            dealerName
        );

        return;
    }

    if (!dealer.phone) {

        alert(
            'Phone missing for:\n' +
            dealerName
        );

        return;
    }

    const offers =
        getAllDealerOffers(dealerName);

    if (offers.length === 0) {

        alert(
            'No offers for:\n' +
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

// =====================================================
// GET DEALERS WITH OFFERS
// =====================================================

async function getDealersWithOffers() {

    await loadDealerMaster();

    loadOffers();

    const result = [];

    const processed =
        new Set();

    for (const offer of currentOffers) {

        const dealerName =
            offer.dealer ||
            offer.customer ||
            offer.customerName ||
            '';

        if (
            !dealerName ||
            processed.has(
                normalizeText(dealerName)
            )
        ) continue;

        processed.add(
            normalizeText(dealerName)
        );

        const dealer =
            findDealerInfo(dealerName);

        const dealerOffers =
            getAllDealerOffers(dealerName);

        if (dealerOffers.length > 0) {

            result.push({

                name:
                    dealerName,

                phone:
                    dealer?.phone || '',

                offerCount:
                    dealerOffers.length,

                district:
                    dealer?.city || '',

                owner:
                    dealer?.ownerName || '',

                maxDiscount:
                    Math.max(
                        ...dealerOffers.map(
                            x => Number(
                                x.discount || 0
                            )
                        ),
                        0
                    )
            });
        }
    }

    console.log(
        "✅ Dealers With Offers:",
        result.length
    );

    return result;
}

// =====================================================
// SHOW FLYER
// =====================================================

function showFlyerPreview(dealerName) {

    const offers =
        getAllDealerOffers(dealerName);

    const dealer =
        findDealerInfo(dealerName);

    if (offers.length === 0) {

        alert(
            'No offers for:\n' +
            dealerName
        );

        return;
    }

    let html = `

<!DOCTYPE html><html>
<head>
<meta charset="UTF-8">
<title>${dealerName}</title><style>

body{
    font-family:Arial;
    background:#f5f5f5;
    padding:20px;
}

.container{
    max-width:900px;
    margin:auto;
    background:white;
    padding:20px;
    border-radius:10px;
}

table{
    width:100%;
    border-collapse:collapse;
    margin-top:20px;
}

th,td{
    border:1px solid #ccc;
    padding:10px;
    text-align:left;
}

th{
    background:#facc15;
}

.header{
    text-align:center;
    border-bottom:2px solid #facc15;
    padding-bottom:15px;
}

.footer{
    text-align:center;
    margin-top:20px;
    font-size:12px;
    color:#666;
}

</style></head><body><div class="container"><div class="header"><h1>⚡ AUTO SPARES SOLUTION ⚡</h1><p>Premium Auto Parts Wholesaler</p></div><h2>${dealerName}</h2><p>📞 ${dealer?.phone || ''}</p><table><thead>
<tr>
<th>#</th>
<th>Part No</th>
<th>Offer Price</th>
<th>Discount</th>
<th>Stock</th>
</tr>
</thead><tbody>
`;    offers.forEach((o, i) => {

        html += `

<tr><td>${i + 1}</td><td>${o.part || ''}</td><td>Rs ${Number(
                o.offerPrice || 0
            ).toFixed(2)}</td><td>${o.discount || 0}%</td><td>${o.totalStock || 0}</td></tr>
`;
        });    html += `

</tbody></table><div class="footer">Contact:
9830300193

</div></div></body>
</html>
`;    const win =
        window.open('', '_blank');

    win.document.write(html);

    win.document.close();
}

// =====================================================
// EXPORT ALL
// =====================================================

async function exportAllFlyers() {

    const dealers =
        await getDealersWithOffers();

    let html = '';

    for (const d of dealers) {

        const offers =
            getAllDealerOffers(d.name);

        html += `

<h2>${d.name}</h2><table border="1" cellspacing="0" cellpadding="5"><tr>
<th>Part</th>
<th>Price</th>
<th>Discount</th>
<th>Stock</th>
</tr>
`;        offers.forEach(o => {

            html += `

<tr><td>${o.part || ''}</td><td>Rs ${Number(
                    o.offerPrice || 0
                ).toFixed(2)}</td><td>${o.discount || 0}%</td><td>${o.totalStock || 0}</td></tr>
`;
            });        html += `

</table><hr>
`;
        }    const blob =
        new Blob(
            [html],
            { type: 'text/html' }
        );

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

// =====================================================
// BULK WHATSAPP
// =====================================================

async function sendBulkWhatsAppFlyers() {

    const dealers =
        await getDealersWithOffers();

    if (dealers.length === 0) {

        alert(
            'No dealers with offers found'
        );

        return;
    }

    let count = 0;

    for (const d of dealers) {

        if (!d.phone) continue;

        const msg =
            generateWhatsAppFlyerMessage(
                d.name
            );

        const url =
            `https://wa.me/${d.phone}?text=${encodeURIComponent(msg)}`;

        window.open(url, '_blank');

        count++;

        await new Promise(
            r => setTimeout(r, 1500)
        );
    }

    alert(
        `Opened WhatsApp for ${count} dealers`
    );
}

// =====================================================
// EXPORT GLOBAL
// =====================================================

window.BrochureGenerator = {

    loadDealerMaster,
    loadOffers,
    getAllDealerOffers,
    generateWhatsAppFlyerMessage,
    sendFlyerWhatsApp,
    sendBulkWhatsAppFlyers,
    getDealersWithOffers,
    showFlyerPreview,
    exportAllFlyers,
    findDealerInfo,

    getDealerMaster: () => dealerMaster,

    getCurrentOffers: () => currentOffers
};

})();
