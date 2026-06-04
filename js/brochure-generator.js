// brochure-generator.js
// COMPLETE FINAL FIXED VERSION
// AUTO SPARES SOLUTION

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

            sheet = workbook.Sheets[sheetName];

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
// NORMALIZE TEXT
// =========================================
function normalizeText(text){

    return String(text || '')

        .replace(/[\u200B-\u200D\uFEFF]/g,'')

        .replace(/\n/g,' ')
        .replace(/\r/g,' ')
        .replace(/\t/g,' ')

        .replace(/[^a-zA-Z0-9 ]/g,'')

        .replace(/\s+/g,' ')

        .trim()

        .toUpperCase();
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
// PRICE CALCULATIONS
// =========================================
function getMRP(o){

    return Number(
        o.originalPrice ||
        o.mrp ||
        o.MRP ||
        0
    );
}

function getBasicPrice(mrp){

    return mrp - (mrp * 31.77 / 100);
}

function getSplDiscount(o){

    return Number(
        o.discount ||
        0
    );
}

function getNetPrice(basicPrice, splDiscount){

    const afterDiscount =
        basicPrice -
        (basicPrice * splDiscount / 100);

    return afterDiscount * 1.18;
}

// =========================================
// LOAD DEALER MASTER
// =========================================
async function loadDealerMaster() {

    try {

        const rows =
            await loadExcelFile(
                'data/RETAILER data details.xlsx'
            );

        dealerMaster = rows.map(row => {

            const dealerName =
                row['Retailer Name'] ||
                row['Customer Name'] ||
                row['Dealer Name'] ||
                row['Name'] ||
                '';

            return {

                name:
                    String(dealerName || '')
                    .replace(/\s+/g,' ')
                    .trim(),

                normalizedName:
                    normalizeText(dealerName),

                phone:
                    cleanPhone(
                        row['Mobile No'] ||
                        row['Phone'] ||
                        row['Mobile'] ||
                        ''
                    ),

                district:
                    row['District'] || '',

                ownerName:
                    row['Owner Name'] || ''
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

        currentOffers =
            currentOffers.filter(o => {

                const dealer =
                    String(o.dealer || '');

                return (
                    dealer &&
                    !dealer.includes('@')
                );
            });

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
                ''
            );

        return (
            offerDealer === normalized ||
            offerDealer.includes(normalized) ||
            normalized.includes(offerDealer)
        );
    });
}

// =========================================
// FIND DEALER
// =========================================
function findDealerInfo(dealerName){

    if(!dealerName) return null;

    const normalizedSearch =
        normalizeText(dealerName);

    let found =
        dealerMaster.find(d => {

            const db =
                normalizeText(d.name);

            return db === normalizedSearch;
        });

    if(found){
        return found;
    }

    found =
        dealerMaster.find(d => {

            const db =
                normalizeText(d.name);

            return (
                db.includes(normalizedSearch) ||
                normalizedSearch.includes(db)
            );
        });

    return found || null;
}

// =========================================
// GENERATE HTML
// =========================================
function generateFullBrochureHTML(dealerName){

    const offers =
        getAllDealerOffers(dealerName);

    const dealer =
        findDealerInfo(dealerName) || {};

    let html = `
    <div style="
        width:1100px;
        background:white;
        color:black;
        padding:20px;
        font-family:Arial;
    ">

    <div style="
        text-align:center;
        margin-bottom:20px;
    ">

    <h1 style="
        color:#2563eb;
        margin-bottom:5px;
        font-size:32px;
    ">
    AUTO SPARES SOLUTION
    </h1>

    <h2 style="
        margin:0;
        color:#111827;
    ">
    SPECIAL OFFER FLYER
    </h2>

    </div>

    <div style="
        margin-bottom:20px;
        line-height:1.8;
        font-size:15px;
    ">

    <b>Dealer:</b>
    ${dealerName}

    <br>

    <b>Mobile:</b>
    ${dealer.phone || 'N/A'}

    <br>

    <b>District:</b>
    ${dealer.district || 'N/A'}

    </div>

    <table style="
        width:100%;
        border-collapse:collapse;
        font-size:13px;
    ">

    <tr style="
        background:#facc15;
        color:black;
    ">

    <th style="border:1px solid #999;padding:8px;">
    Part
    </th>

    <th style="border:1px solid #999;padding:8px;">
    MRP
    </th>

    <th style="border:1px solid #999;padding:8px;">
    Basic Price
    <br>
    (Less 31.77%)
    </th>

    <th style="border:1px solid #999;padding:8px;">
    Spl Dis
    <br>
    (Max 6%)
    </th>

    <th style="border:1px solid #999;padding:8px;">
    Net Price
    <br>
    Incl GST 18%
    </th>

    <th style="border:1px solid #999;padding:8px;">
    Stock
    </th>

    </tr>
    `;

    offers.forEach(o => {

        const mrp =
            getMRP(o);

        const basicPrice =
            getBasicPrice(mrp);

        const splDiscount =
            getSplDiscount(o);

        const netPrice =
            getNetPrice(
                basicPrice,
                splDiscount
            );

        html += `
        <tr>

        <td style="
            border:1px solid #ccc;
            padding:8px;
        ">
        ${o.part || ''}
        </td>

        <td style="
            border:1px solid #ccc;
            padding:8px;
        ">
        ₹${mrp.toFixed(2)}
        </td>

        <td style="
            border:1px solid #ccc;
            padding:8px;
        ">
        ₹${basicPrice.toFixed(2)}
        </td>

        <td style="
            border:1px solid #ccc;
            padding:8px;
        ">
        ${splDiscount}%
        </td>

        <td style="
            border:1px solid #ccc;
            padding:8px;
            color:green;
            font-weight:bold;
        ">
        ₹${netPrice.toFixed(2)}
        </td>

        <td style="
            border:1px solid #ccc;
            padding:8px;
        ">
        ${o.totalStock || 0}
        </td>

        </tr>
        `;
    });

    html += `

    </table>

    <div style="
        margin-top:20px;
        padding:15px;
        background:#f3f4f6;
        border-radius:8px;
        line-height:1.8;
        font-size:13px;
    ">

    <b>Special Notes:</b>

    <br>

    • Prices are including GST

    <br>

    • Limited stock available

    <br>

    • Offer valid till stock lasts

    <br><br>

    Reply YES to confirm order.

    <br><br>

    <b>Auto Spares Solution</b>

    <br>

    https://autosparessolution.com

    </div>

    </div>
    `;

    return html;
}

// =========================================
// PREVIEW
// =========================================
function showBrochurePreview(dealerName){

    const html =
        generateFullBrochureHTML(
            dealerName
        );

    const win =
        window.open('', '_blank');

    win.document.write(`
    <html>
    <head>
    <title>${dealerName}</title>
    </head>

    <body style="
        background:#ddd;
        padding:20px;
    ">

    ${html}

    </body>
    </html>
    `);

    win.document.close();
}

// =========================================
// WHATSAPP MESSAGE
// =========================================
function generateWhatsAppFlyerMessage(
    dealerName
){

    const offers =
        getAllDealerOffers(
            dealerName
        );

    const dealer =
        findDealerInfo(
            dealerName
        ) || {};

    if(!offers.length){

        return 'No offers available';
    }

    let msg = '';

    msg +=
`Dear ${dealerName},

🎁 SPECIAL OFFER LIST

`;

    offers.forEach((o, i) => {

        const mrp =
            getMRP(o);

        const basicPrice =
            getBasicPrice(mrp);

        const splDiscount =
            getSplDiscount(o);

        const netPrice =
            getNetPrice(
                basicPrice,
                splDiscount
            );

        msg +=
`${i + 1}) ${o.part || ''}

MRP:
₹${mrp.toFixed(2)}

Basic Price:
₹${basicPrice.toFixed(2)}

Special Discount:
${splDiscount}% OFF

Net Price Incl GST:
₹${netPrice.toFixed(2)}

Available Stock:
${o.totalStock || 0}

-------------------------

`;
    });

    msg +=
`District:
${dealer.district || 'N/A'}

Reply YES to confirm order.

Auto Spares Solution
https://autosparessolution.com`;

    return msg;
}

// =========================================
// SEND WHATSAPP
// =========================================
function sendFlyerToWhatsApp(
    dealerName
) {

    const dealer =
        findDealerInfo(
            dealerName
        );

    if (!dealer) {

        alert(
            'Dealer not found:\n' +
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

    const msg =
        generateWhatsAppFlyerMessage(
            dealerName
        );

    const phone =
        String(dealer.phone)
        .replace(/\D/g,'');

    const url =
`whatsapp://send?phone=${phone}&text=${encodeURIComponent(msg)}`;

    window.location.href = url;
}

// =========================================
// SHARE PDF
// =========================================
async function sharePDFToWhatsApp(
    dealerName
){

    try{

        const html =
            generateFullBrochureHTML(
                dealerName
            );

        const div =
            document.createElement('div');

        div.innerHTML = html;

        div.style.position = 'fixed';
        div.style.left = '-9999px';
        div.style.top = '0';
        div.style.background = 'white';

        document.body.appendChild(div);

        await new Promise(r =>
            setTimeout(r,700)
        );

        const canvas =
            await html2canvas(div,{
                scale:2,
                useCORS:true
            });

        const img =
            canvas.toDataURL('image/png');

        const jsPDF =
            window.jspdf?.jsPDF;

        if(!jsPDF){

            alert('PDF Library Missing');

            return;
        }

        const pdf =
            new jsPDF(
                'l',
                'mm',
                'a4'
            );

        pdf.addImage(
            img,
            'PNG',
            5,
            5,
            285,
            200
        );

        pdf.save(
            dealerName + '.pdf'
        );

        document.body.removeChild(div);

    }catch(err){

        console.error(err);

        alert(
            'PDF creation failed'
        );
    }
}

// =========================================
// INIT
// =========================================
async function init(){

    await loadDealerMaster();

    loadOffers();

    console.log(
        '✅ Brochure Generator Ready'
    );
}

// =========================================
// GLOBAL
// =========================================
window.BrochureGenerator = {

    init,

    loadDealerMaster,

    loadOffers,

    getAllDealerOffers,

    generateWhatsAppFlyerMessage,

    sendFlyerToWhatsApp,

    sharePDFToWhatsApp,

    showBrochurePreview,

    findDealerInfo,

    generateFullBrochureHTML
};

// =========================================
// AUTO INIT
// =========================================
init();

})();
