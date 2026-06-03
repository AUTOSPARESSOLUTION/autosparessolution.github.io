// brochure-generator.js
// COMPLETE FINAL VERSION
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
// LOAD DEALER MASTER
// =========================================
async function loadDealerMaster() {

    try {

        const rows =
            await loadExcelFile(
                'data/RETAILER data Deatils.xlsx'
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

        currentOffers =
            currentOffers.filter(o => {

                const dealer =
                    String(o.dealer || '');

                return (
                    dealer &&
                    !dealer.includes('@')
                );
            });

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
        findDealerInfo(dealerName);

    let html = `
    <div style="
        width:800px;
        background:white;
        color:black;
        padding:20px;
        font-family:Arial;
    ">

    <h1 style="
        color:#2563eb;
        margin-bottom:5px;
    ">
    AUTO SPARES SOLUTION
    </h1>

    <h2>${dealerName}</h2>

    <p>
    Mobile:
    ${dealer?.phone || 'N/A'}
    </p>

    <table style="
        width:100%;
        border-collapse:collapse;
        margin-top:20px;
    ">

    <tr style="background:#facc15;">

    <th style="border:1px solid #ccc;padding:8px;">
    Part
    </th>

    <th style="border:1px solid #ccc;padding:8px;">
    Price
    </th>

    <th style="border:1px solid #ccc;padding:8px;">
    Discount
    </th>

    <th style="border:1px solid #ccc;padding:8px;">
    Stock
    </th>

    </tr>
    `;

    offers.forEach(o => {

        html += `
        <tr>

        <td style="border:1px solid #ccc;padding:8px;">
        ${o.part || ''}
        </td>

        <td style="border:1px solid #ccc;padding:8px;">
        ₹${Number(o.offerPrice || 0).toFixed(2)}
        </td>

        <td style="border:1px solid #ccc;padding:8px;">
        ${o.discount || 0}%
        </td>

        <td style="border:1px solid #ccc;padding:8px;">
        ${o.totalStock || 0}
        </td>

        </tr>
        `;
    });

    html += `
    </table>

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
    <body style="background:#eee;padding:20px;">
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

🎁 Special Offer List

`;

    offers.forEach((o, i) => {

        msg +=
`${i + 1}) ${o.part || ''}

Extra Discount:
${o.discount || 0}% OFF

Offer Price:
₹${Number(
    o.offerPrice || 0
).toFixed(2)}

Available Stock:
${o.totalStock || 0}

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
`https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(msg)}`;

    window.location.href = url;
}

// =========================================
// SHARE PDF TO WHATSAPP
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
        div.style.background = 'white';

        document.body.appendChild(div);

        await new Promise(r =>
            setTimeout(r,500)
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

        const blob =
            pdf.output('blob');

        const file =
            new File(
                [blob],
                dealerName + '.pdf',
                {
                    type:'application/pdf'
                }
            );

        if(
            navigator.canShare &&
            navigator.canShare({
                files:[file]
            })
        ){

            await navigator.share({

                title:
                    dealerName,

                text:
                    'Special Offer Flyer',

                files:[file]
            });

        }else{

            alert(
                'Sharing not supported on this device'
            );
        }

        document.body.removeChild(div);

    }catch(err){

        console.error(err);

        alert(
            'PDF share failed'
        );
    }
}

// =========================================
// DEALERS WITH OFFERS
// =========================================
async function getDealersWithOffers() {

    await loadDealerMaster();

    loadOffers();

    const uniqueDealers =
        [...new Set(
            currentOffers.map(o =>
                String(o.dealer || '').trim()
            )
        )];

    const result = [];

    uniqueDealers.forEach(name => {

        if(!name) return;

        const offers =
            getAllDealerOffers(name);

        if(offers.length === 0)
            return;

        const dealer =
            findDealerInfo(name) || {};

        result.push({

            name: name,

            phone:
                dealer.phone || '',

            district:
                dealer.district || '',

            owner:
                dealer.ownerName || '',

            offerCount:
                offers.length
        });
    });

    return result;
}

// =========================================
// EXPORT HTML
// =========================================
async function exportAllBrochures() {

    const dealers =
        await getDealersWithOffers();

    let html = '';

    dealers.forEach(d => {

        html +=
            generateFullBrochureHTML(
                d.name
            );

        html += '<hr>';
    });

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

    getDealersWithOffers,

    showBrochurePreview,

    exportAllBrochures,

    findDealerInfo,

    generateFullBrochureHTML,

    getDealerMaster: () =>
        dealerMaster,

    getCurrentOffers: () =>
        currentOffers
};

})();
