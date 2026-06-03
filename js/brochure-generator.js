(function () {

console.log("✅ FULL RESTORED BROCHURE GENERATOR");

let dealerMaster = [];
let currentOffers = [];

// =====================================
// NORMALIZE
// =====================================
function normalizeText(text) {

    return String(text || '')
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .trim();
}

// =====================================
// CLEAN PHONE
// =====================================
function cleanPhone(phone) {

    let p = String(phone || '')
        .replace(/\D/g, '');

    if (!p) return '';

    if (p.length === 10) {
        p = '91' + p;
    }

    return p;
}

// =====================================
// LOAD EXCEL
// =====================================
async function loadExcelFile(url, sheetName = null) {

    try {

        const response = await fetch(url);

        const buffer =
            await response.arrayBuffer();

        const workbook =
            XLSX.read(buffer, {
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
// LOAD DEALERS
// =====================================
async function loadDealerMaster() {

    const rows =
        await loadExcelFile(
            'data/RETAILER data details.xlsx',
            'SAPUI5 Export'
        );

    dealerMaster = rows.map(row => {

        const name =
            row['Retailer Name'] ||
            row['Customer Name'] ||
            row['Dealer Name'] ||
            '';

        return {

            name,

            normalizedName:
                normalizeText(name),

            phone:
                cleanPhone(
                    row['Mobile No'] ||
                    row['Phone'] ||
                    ''
                ),

            district:
                row['District'] || '',

            ownerName:
                row['Owner Name'] || ''
        };

    }).filter(d => d.name);

    console.log(
        "✅ Dealers Loaded:",
        dealerMaster.length
    );

    return dealerMaster;
}

// =====================================
// LOAD OFFERS
// =====================================
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

// =====================================
// FIND DEALER
// =====================================
function findDealerInfo(name) {

    const n =
        normalizeText(name);

    return dealerMaster.find(d => {

        return (
            d.normalizedName === n ||
            d.normalizedName.includes(n) ||
            n.includes(d.normalizedName)
        );
    });
}

// =====================================
// GET OFFERS
// =====================================
function getAllDealerOffers(name) {

    const n =
        normalizeText(name);

    return currentOffers.filter(o => {

        const dn =
            normalizeText(
                o.dealer ||
                o.customer ||
                o.customerName ||
                ''
            );

        return (
            dn === n ||
            dn.includes(n) ||
            n.includes(dn)
        );
    });
}

// =====================================
// WHATSAPP MESSAGE
// =====================================
function generateWhatsAppFlyerMessage(name) {

    const offers =
        getAllDealerOffers(name);

    let msg =
        '⚡ AUTO SPARES SOLUTION ⚡\n\n';

    msg +=
        'Dealer: ' + name + '\n\n';

    offers.forEach((o, i) => {

        msg +=
            `${i + 1}. ${o.part}\n`;

        msg +=
            `₹${Number(o.offerPrice || 0).toFixed(2)} | ${o.discount}% | Stock:${o.totalStock}\n\n`;
    });

    msg +=
        'Auto Spares Solution\n9830300193';

    return msg;
}

// =====================================
// SEND WHATSAPP
// =====================================
async function sendFlyerToWhatsApp(name) {

    if (!dealerMaster.length) {
        await loadDealerMaster();
        loadOffers();
    }

    const dealer =
        findDealerInfo(name);

    if (!dealer) {
        alert('Dealer not found:\n' + name);
        return;
    }

    const offers =
        getAllDealerOffers(name);

    if (!offers.length) {
        alert('No offers found');
        return;
    }

    const msg =
        generateWhatsAppFlyerMessage(name);

    const url =
        `https://wa.me/${dealer.phone}?text=${encodeURIComponent(msg)}`;

    window.open(url, '_blank');
}

// =====================================
// FULL HTML GENERATOR
// =====================================
function generateFullBrochureHTML(name) {

    const offers =
        getAllDealerOffers(name);

    const dealer =
        findDealerInfo(name);

    let html = `
    <div style="
        font-family:Arial;
        background:white;
        color:black;
        padding:20px;
        width:800px;
    ">

    <h1>
    AUTO SPARES SOLUTION
    </h1>

    <h2>${name}</h2>

    <p>
    Phone:
    ${dealer?.phone || ''}
    </p>

    <table
    border="1"
    cellspacing="0"
    cellpadding="5"
    width="100%">

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
            <td>₹${o.offerPrice || 0}</td>
            <td>${o.discount || 0}%</td>
            <td>${o.totalStock || 0}</td>
        </tr>
        `;
    });

    html += `
    </table>
    </div>
    `;

    return html;
}

// =====================================
// PREVIEW
// =====================================
function showBrochurePreview(name) {

    const html =
        generateFullBrochureHTML(name);

    const win =
        window.open('', '_blank');

    win.document.write(`
        <html>
        <head>
        <title>${name}</title>
        </head>
        <body>
        ${html}
        </body>
        </html>
    `);

    win.document.close();
}

// =====================================
// PDF DOWNLOAD
// =====================================
async function downloadPDF(name) {

    const html =
        generateFullBrochureHTML(name);

    const div =
        document.createElement('div');

    div.innerHTML = html;

    div.style.position = 'fixed';
    div.style.left = '-9999px';

    document.body.appendChild(div);

    await new Promise(r =>
        setTimeout(r, 500)
    );

    const canvas =
        await html2canvas(div, {
            scale: 2,
            useCORS: true
        });

    const img =
        canvas.toDataURL('image/png');

    const jsPDF =
        window.jspdf?.jsPDF;

    if (!jsPDF) {

        alert('PDF library missing');

        return;
    }

    const pdf =
        new jsPDF(
            'p',
            'mm',
            'a4'
        );

    pdf.addImage(
        img,
        'PNG',
        5,
        5,
        200,
        280
    );

    pdf.save(name + '.pdf');

    document.body.removeChild(div);
}

// =====================================
// GET DEALERS
// =====================================
async function getDealersWithOffers() {

    if (!dealerMaster.length) {
        await loadDealerMaster();
        loadOffers();
    }

    const unique =
        [...new Set(
            currentOffers.map(o =>
                o.dealer ||
                o.customer ||
                ''
            )
        )];

    return unique.map(name => {

        const offers =
            getAllDealerOffers(name);

        const dealer =
            findDealerInfo(name);

        return {

            name,

            phone:
                dealer?.phone || '',

            district:
                dealer?.district || '',

            offerCount:
                offers.length
        };
    });
}

// =====================================
// EXPORT ALL HTML
// =====================================
async function exportAllBrochures() {

    const dealers =
        await getDealersWithOffers();

    let html =
        '<html><body>';

    dealers.forEach(d => {

        html +=
            generateFullBrochureHTML(
                d.name
            );

        html += '<hr>';
    });

    html +=
        '</body></html>';

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
}

// =====================================
// INIT
// =====================================
async function init() {

    await loadDealerMaster();

    loadOffers();
}

// =====================================
// GLOBAL
// =====================================
window.BrochureGenerator = {

    init,

    loadDealerMaster,

    loadOffers,

    findDealerInfo,

    getAllDealerOffers,

    generateWhatsAppFlyerMessage,

    sendFlyerToWhatsApp,

    generateFullBrochureHTML,

    showBrochurePreview,

    downloadPDF,

    exportAllBrochures,

    getDealersWithOffers,

    getDealerMaster: () =>
        dealerMaster,

    getCurrentOffers: () =>
        currentOffers
};

})();
