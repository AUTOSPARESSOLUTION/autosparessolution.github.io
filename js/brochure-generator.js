// brochure-generator.js
// FULL FIXED VERSION
// Auto Spares Solution

(function () {

console.log("✅ Brochure Generator Loaded");

let dealerMaster = [];
let currentOffers = [];

/* =========================================
NORMALIZE
========================================= */
function normalizeText(text){

    return String(text || '')
        .trim()
        .toUpperCase()
        .replace(/\s+/g,' ');
}

/* =========================================
PHONE CLEAN
========================================= */
function cleanPhone(phone){

    let p =
        String(phone || '')
        .replace(/\D/g,'');

    if(!p) return '';

    if(p.startsWith('0')){
        p = p.substring(1);
    }

    if(p.length === 10){
        p = '91' + p;
    }

    return p;
}

/* =========================================
LOAD EXCEL
========================================= */
async function loadExcelFile(url,sheetName=null){

    try{

        const response =
            await fetch(url);

        if(!response.ok){

            throw new Error(
                'Cannot load: ' + url
            );
        }

        const buffer =
            await response.arrayBuffer();

        const workbook =
            XLSX.read(buffer,{
                type:'array'
            });

        let sheet;

        if(
            sheetName &&
            workbook.SheetNames.includes(sheetName)
        ){

            sheet =
                workbook.Sheets[sheetName];

        }else{

            sheet =
                workbook.Sheets[
                    workbook.SheetNames[0]
                ];
        }

        return XLSX.utils.sheet_to_json(sheet);

    }catch(err){

        console.error(err);

        return [];
    }
}

/* =========================================
LOAD DEALERS
========================================= */
async function loadDealerMaster(){

    try{

        const rows =
            await loadExcelFile(
                'data/RETAILER data details.xlsx',
                'SAPUI5 Export'
            );

        dealerMaster =
            rows.map(row => {

                const dealerName =
                    row['Retailer Name'] ||
                    row['Customer Name'] ||
                    row['Dealer Name'] ||
                    '';

                return {

                    name:
                        String(dealerName).trim(),

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
                x => x.name
            );

        console.log(
            '✅ Dealer Loaded:',
            dealerMaster.length
        );

        return dealerMaster;

    }catch(err){

        console.error(err);

        dealerMaster = [];

        return [];
    }
}

/* =========================================
LOAD OFFERS
========================================= */
function loadOffers(){

    try{

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

    }catch(err){

        console.error(err);

        currentOffers = [];

        return [];
    }
}

/* =========================================
GET DEALER OFFERS
========================================= */
function getAllDealerOffers(dealerName){

    const normalized =
        normalizeText(dealerName);

    return currentOffers.filter(o => {

        const dealer =
            normalizeText(
                o.dealer ||
                o.customer ||
                o.customerName ||
                ''
            );

        return dealer === normalized;
    });
}

/* =========================================
FIND DEALER
========================================= */
function findDealerInfo(dealerName){

    const normalized =
        normalizeText(dealerName);

    let dealer =
        dealerMaster.find(d =>
            d.normalizedName === normalized
        );

    if(dealer) return dealer;

    dealer =
        dealerMaster.find(d =>
            d.normalizedName.includes(normalized)
        );

    if(dealer) return dealer;

    dealer =
        dealerMaster.find(d =>
            normalized.includes(d.normalizedName)
        );

    return dealer || null;
}

/* =========================================
WHATSAPP MESSAGE
========================================= */
function generateWhatsAppFlyerMessage(
    dealerName
){

    const offers =
        getAllDealerOffers(
            dealerName
        );

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

    offers.forEach((o,i)=>{

        msg +=
            (i+1) +
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

/* =========================================
SEND WHATSAPP
========================================= */
function sendFlyerToWhatsApp(
    dealerName
){

    const offers =
        getAllDealerOffers(
            dealerName
        );

    if(!offers.length){

        alert(
            'No offers found for:\n' +
            dealerName
        );

        return;
    }

    const dealer =
        findDealerInfo(
            dealerName
        );

    let phone =
        dealer?.phone || '';

    if(!phone){

        phone = prompt(
            'Phone not found.\nEnter WhatsApp Number for:\n' +
            dealerName
        ) || '';

        phone =
            cleanPhone(phone);

        if(!phone){

            alert(
                'Phone number missing'
            );

            return;
        }
    }

    const msg =
        generateWhatsAppFlyerMessage(
            dealerName
        );

    const url =
        `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;

    window.open(url,'_blank');
}

/* =========================================
GET DEALERS
========================================= */
async function getDealersWithOffers(){

    await loadDealerMaster();

    loadOffers();

    const result = [];

    const uniqueDealers =
        [...new Set(
            currentOffers.map(o =>

                String(
                    o.dealer ||
                    o.customer ||
                    o.customerName ||
                    ''
                ).trim()

            )
        )];

    for(const dealerName of uniqueDealers){

        if(!dealerName)
            continue;

        const offers =
            getAllDealerOffers(
                dealerName
            );

        if(!offers.length)
            continue;

        const dealer =
            findDealerInfo(
                dealerName
            ) || {};

        result.push({

            name:
                dealerName,

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
                    ...offers.map(x =>
                        Number(
                            x.discount || 0
                        )
                    ),
                    0
                )
        });
    }

    return result;
}

/* =========================================
FULL HTML
========================================= */
function generateFullBrochureHTML(
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

        return `
        <div style="
            padding:20px;
            font-family:Arial;
        ">
            No offers found
        </div>
        `;
    }

    let html = `

    <div style="
        width:760px;
        background:white;
        color:black;
        padding:20px;
        font-family:Arial;
    ">

    <h1 style="
        color:#2563eb;
    ">
        AUTO SPARES SOLUTION
    </h1>

    <h2>
        ${dealerName}
    </h2>

    <p>
        Phone:
        ${dealer.phone || ''}
    </p>

    <table style="
        width:100%;
        border-collapse:collapse;
        margin-top:20px;
    ">

    <tr>

        <th style="
            border:1px solid #ccc;
            padding:8px;
            background:#facc15;
        ">
            Part No
        </th>

        <th style="
            border:1px solid #ccc;
            padding:8px;
            background:#facc15;
        ">
            Offer Price
        </th>

        <th style="
            border:1px solid #ccc;
            padding:8px;
            background:#facc15;
        ">
            Discount
        </th>

        <th style="
            border:1px solid #ccc;
            padding:8px;
            background:#facc15;
        ">
            Stock
        </th>

    </tr>
    `;

    offers.forEach(o => {

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
            ₹${Number(
                o.offerPrice || 0
            ).toFixed(2)}
        </td>

        <td style="
            border:1px solid #ccc;
            padding:8px;
        ">
            ${o.discount || 0}%
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
        font-size:14px;
    ">
        Auto Spares Solution<br>
        Mobile: 9830300193
    </div>

    </div>
    `;

    return html;
}

/* =========================================
PREVIEW
========================================= */
function showBrochurePreview(
    dealerName
){

    const html =
        generateFullBrochureHTML(
            dealerName
        );

    const win =
        window.open(
            '',
            '_blank'
        );

    win.document.write(`
    <html>
    <head>
    <title>${dealerName}</title>
    </head>
    <body style="
        margin:0;
        padding:20px;
        background:#eee;
    ">
    ${html}
    </body>
    </html>
    `);

    win.document.close();
}

/* =========================================
INIT
========================================= */
async function init(){

    await loadDealerMaster();

    loadOffers();
}

/* =========================================
GLOBAL
========================================= */
window.BrochureGenerator = {

    init,

    loadDealerMaster,

    loadOffers,

    getAllDealerOffers,

    findDealerInfo,

    getDealersWithOffers,

    sendFlyerToWhatsApp,

    showBrochurePreview,

    generateFullBrochureHTML,

    generateWhatsAppFlyerMessage,

    getDealerMaster:()=>dealerMaster,

    getCurrentOffers:()=>currentOffers
};

})();
