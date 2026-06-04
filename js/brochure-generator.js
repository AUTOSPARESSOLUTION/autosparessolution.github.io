// brochure-generator.js
// COMPLETE FINAL FIXED + UPGRADED VERSION
// AUTO SPARES SOLUTION

(function () {

console.log("✅ Brochure Generator Loaded (Fixed + Excel Export Enabled)");

let dealerMaster = [];
let currentOffers = [];

// NEW: Fast lookup map (performance upgrade)
let dealerOfferMap = {};

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

        const workbook = XLSX.read(buffer, { type: 'array' });

        let sheet;

        if (sheetName && workbook.SheetNames.includes(sheetName)) {
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

// =========================================
// FIXED NORMALIZE (IMPORTANT FIX)
// =========================================
function normalizeText(text) {

    return String(text || '')
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .replace(/\n|\r|\t/g, ' ')
        .replace(/[^a-zA-Z0-9]/g, ' ')   // FIXED (was deleting structure)
        .replace(/\s+/g, ' ')
        .trim()
        .toUpperCase();
}

// =========================================
// CLEAN PHONE
// =========================================
function cleanPhone(phone) {

    let p = String(phone || '').replace(/\D/g, '');

    if (!p) return '';

    if (p.startsWith('0')) p = p.substring(1);

    if (p.length === 10) p = '91' + p;

    return p;
}

// =========================================
// PRICE CALCULATION
// =========================================
function getMRP(o) {
    return Number(o.originalPrice || o.mrp || o.MRP || 0);
}

function getBasicPrice(mrp) {
    return mrp - (mrp * 31.77 / 100);
}

function getSplDiscount(o) {
    return Number(o.discount || 0);
}

function getNetPrice(basicPrice, splDiscount) {
    const after = basicPrice - (basicPrice * splDiscount / 100);
    return after * 1.18;
}

// =========================================
// LOAD DEALER MASTER
// =========================================
async function loadDealerMaster() {

    try {

        const rows = await loadExcelFile('data/RETAILER data Deatils.xlsx');

        dealerMaster = rows.map(row => {

            const name =
                row['Retailer Name'] ||
                row['Customer Name'] ||
                row['Dealer Name'] ||
                row['Name'] ||
                '';

            return {
                name: String(name || '').trim(),
                normalizedName: normalizeText(name),
                phone: cleanPhone(row['Mobile No'] || row['Phone'] || ''),
                district: row['District'] || '',
                ownerName: row['Owner Name'] || ''
            };
        }).filter(d => d.name);

        console.log("✅ Dealer Master Loaded:", dealerMaster.length);

        return dealerMaster;

    } catch (err) {

        console.error("Dealer Load Error:", err);
        dealerMaster = [];
        return [];
    }
}

// =========================================
// LOAD OFFERS
// =========================================
function loadOffers() {

    try {

        const data = JSON.parse(localStorage.getItem('dealerOffers') || '{}');

        currentOffers = Array.isArray(data.offers) ? data.offers : [];

        buildOfferIndex(); // NEW

        console.log("✅ Offers Loaded:", currentOffers.length);

        return currentOffers;

    } catch (err) {

        console.error("Offer Load Error:", err);
        currentOffers = [];
        dealerOfferMap = {};
        return [];
    }
}

// =========================================
// BUILD FAST INDEX (IMPORTANT UPGRADE)
// =========================================
function buildOfferIndex() {

    dealerOfferMap = {};

    currentOffers.forEach(o => {

        const key = normalizeText(o.dealer);

        if (!dealerOfferMap[key]) {
            dealerOfferMap[key] = [];
        }

        dealerOfferMap[key].push(o);
    });
}

// =========================================
// GET DEALER OFFERS (FAST)
// =========================================
function getAllDealerOffers(dealerName) {

    const key = normalizeText(dealerName);

    return dealerOfferMap[key] || [];
}

// =========================================
// FIND DEALER
// =========================================
function findDealerInfo(dealerName) {

    const key = normalizeText(dealerName);

    return dealerMaster.find(d =>
        normalizeText(d.name) === key
    ) || null;
}

// =========================================
// HTML GENERATOR
// =========================================
function generateFullBrochureHTML(dealerName) {

    const offers = getAllDealerOffers(dealerName);
    const dealer = findDealerInfo(dealerName);

    let html = `
    <div style="width:1000px;background:white;color:black;padding:20px;font-family:Arial;">

    <h1 style="color:#2563eb;">AUTO SPARES SOLUTION</h1>
    <h2>${dealerName}</h2>

    <p><b>Mobile:</b> ${dealer?.phone || 'N/A'}</p>
    <p><b>District:</b> ${dealer?.district || 'N/A'}</p>

    <table style="width:100%;border-collapse:collapse;font-size:13px;">
    <tr style="background:#facc15;">
        <th>Part</th><th>MRP</th><th>Basic</th><th>Dis%</th><th>Net</th><th>Stock</th>
    </tr>
    `;

    offers.forEach(o => {

        const mrp = getMRP(o);
        const basic = getBasicPrice(mrp);
        const dis = getSplDiscount(o);
        const net = getNetPrice(basic, dis);

        html += `
        <tr>
            <td>${o.part || ''}</td>
            <td>₹${mrp.toFixed(2)}</td>
            <td>₹${basic.toFixed(2)}</td>
            <td>${dis}%</td>
            <td style="color:green;font-weight:bold;">₹${net.toFixed(2)}</td>
            <td>${o.totalStock || 0}</td>
        </tr>`;
    });

    html += `
    </table>

    <div style="margin-top:20px;">
    Auto Spares Solution - autosparessolution.com
    </div>

    </div>`;

    return html;
}

// =========================================
// PREVIEW
// =========================================
function showBrochurePreview(dealerName) {

    const win = window.open('', '_blank');

    win.document.write(`
    <html><body style="background:#eee;padding:20px;">
    ${generateFullBrochureHTML(dealerName)}
    </body></html>`);

    win.document.close();
}

// =========================================
// WHATSAPP MESSAGE (SAFE LENGTH)
// =========================================
function generateWhatsAppFlyerMessage(dealerName) {

    const offers = getAllDealerOffers(dealerName);
    const dealer = findDealerInfo(dealerName) || {};

    let msg = `Dear ${dealerName}\n\n🎁 SPECIAL OFFER LIST\n\n`;

    let count = 0;

    for (let o of offers) {

        if (msg.length > 3500) break; // SAFE LIMIT

        const mrp = getMRP(o);
        const basic = getBasicPrice(mrp);
        const dis = getSplDiscount(o);
        const net = getNetPrice(basic, dis);

        msg += `${++count}) ${o.part}\n₹${net.toFixed(2)} Net\n\n`;
    }

    msg += `District: ${dealer.district || 'N/A'}\nAuto Spares Solution`;

    return msg;
}

// =========================================
// PDF (FIXED + AUTO SCALE)
// =========================================
async function sharePDFToWhatsApp(dealerName) {

    try {

        const html = generateFullBrochureHTML(dealerName);

        const div = document.createElement('div');
        div.innerHTML = html;
        div.style.position = 'fixed';
        div.style.left = '-9999px';

        document.body.appendChild(div);

        await new Promise(r => setTimeout(r, 500));

        const canvas = await html2canvas(div, { scale: 2 });

        const img = canvas.toDataURL('image/png');

        const jsPDF = window.jspdf.jsPDF;

        const pdf = new jsPDF('p', 'mm', 'a4');

        const pageWidth = 210;
        const pageHeight = 297;

        const imgProps = pdf.getImageProperties(img);
        const imgHeight = (imgProps.height * pageWidth) / imgProps.width;

        let position = 0;

        pdf.addImage(img, 'PNG', 0, position, pageWidth, imgHeight);

        while (imgHeight > pageHeight) {
            position -= pageHeight;
            pdf.addPage();
            pdf.addImage(img, 'PNG', 0, position, pageWidth, imgHeight);
        }

        pdf.save(`${dealerName}.pdf`);

        document.body.removeChild(div);

    } catch (err) {

        console.error(err);
        alert('PDF creation failed');
    }
}

// =========================================
// NEW: EXPORT EXCEL (BROCHURE DATA)
// =========================================
function exportDealerOffersToExcel(dealerName) {

    const offers = getAllDealerOffers(dealerName);

    if (!offers.length) {
        alert("No data found");
        return;
    }

    const exportData = offers.map(o => {

        const mrp = getMRP(o);
        const basic = getBasicPrice(mrp);
        const dis = getSplDiscount(o);
        const net = getNetPrice(basic, dis);

        return {
            Part: o.part,
            MRP: mrp,
            BasicPrice: basic,
            Discount: dis,
            NetPrice: net,
            Stock: o.totalStock || 0
        };
    });

    const ws = XLSX.utils.json_to_sheet(exportData);

    const wb = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(wb, ws, "Brochure");

    XLSX.writeFile(wb, `${dealerName}_brochure.xlsx`);
}

// =========================================
// GLOBAL EXPORT
// =========================================
window.BrochureGenerator = {

    init: async function () {
        await loadDealerMaster();
        loadOffers();
        console.log("✅ Ready");
    },

    loadDealerMaster,
    loadOffers,
    getAllDealerOffers,
    findDealerInfo,
    generateFullBrochureHTML,
    showBrochurePreview,
    generateWhatsAppFlyerMessage,
    sharePDFToWhatsApp,
    exportDealerOffersToExcel
};

})();
