(function () {

console.log("🚀 Brochure System Loaded (ZERO BREAK VERSION)");

// ================================
// DATA STORAGE
// ================================
let dealerMaster = [];
let currentOffers = [];
let dealerOfferMap = {};

// ================================
// SAFE XLSX CHECK
// ================================
function checkXLSX() {
    if (typeof XLSX === "undefined") {
        console.error("❌ XLSX library missing");
        return false;
    }
    return true;
}

// ================================
// LOAD EXCEL
// ================================
async function loadExcelFile(url, sheetName = null) {

    try {

        const response = await fetch(url);
        if (!response.ok) throw new Error("File not found: " + url);

        const buffer = await response.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array' });

        const sheet = sheetName && workbook.SheetNames.includes(sheetName)
            ? workbook.Sheets[sheetName]
            : workbook.Sheets[workbook.SheetNames[0]];

        return XLSX.utils.sheet_to_json(sheet);

    } catch (err) {

        console.error("Excel Load Error:", err.message);
        return [];
    }
}

// ================================
// NORMALIZE (STABLE)
// ================================
function normalizeText(text) {

    return String(text || '')
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .replace(/\n|\r|\t/g, ' ')
        .replace(/[^a-zA-Z0-9]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toUpperCase();
}

// ================================
// PHONE CLEAN
// ================================
function cleanPhone(phone) {

    let p = String(phone || '').replace(/\D/g, '');
    if (!p) return '';

    if (p.length === 10) p = '91' + p;
    return p;
}

// ================================
// PRICE ENGINE
// ================================
function getMRP(o) {
    return Number(o.originalPrice || o.mrp || o.MRP || 0);
}

function getBasicPrice(mrp) {
    return mrp - (mrp * 31.77 / 100);
}

function getSplDiscount(o) {
    return Number(o.discount || 0);
}

function getNetPrice(basic, dis) {
    return (basic - (basic * dis / 100)) * 1.18;
}

// ================================
// LOAD DEALERS
// ================================
async function loadDealerMaster() {

    const rows = await loadExcelFile('./data/RETAILER data Deatils.xlsx');

    console.log("📊 Sample Excel Row:", rows[0]);

    dealerMaster = rows.map(row => {

        const name =
            row['Retailer Name'] ||
            row['Customer Name'] ||
            row['Dealer Name'] ||
            row['Name'] || '';

        const phone =
            row['Mobile No'] ||
            row['Mobile Number'] ||
            row['MobileNo'] ||
            row['Phone'] ||
            '';

        const district =
            row['District'] ||
            row['District Name'] ||
            row['PLACE'] ||
            row['Location'] ||
            '';

        return {
            name: String(name || '').trim(),
            phone: cleanPhone(phone),
            district: String(district || '').trim(),
            normalized: normalizeText(name)
        };

    }).filter(d => d.name);

    console.log("✅ Dealers Loaded:", dealerMaster.length);
}

// ================================
// LOAD OFFERS + INDEX
// ================================
function loadOffers() {

    const data = JSON.parse(localStorage.getItem('dealerOffers') || '{}');

    currentOffers = Array.isArray(data.offers) ? data.offers : [];

    dealerOfferMap = {};

    currentOffers.forEach(o => {

        const key = normalizeText(o.dealer);

        if (!dealerOfferMap[key]) dealerOfferMap[key] = [];

        dealerOfferMap[key].push(o);
    });

    console.log("✅ Offers Loaded:", currentOffers.length);
}

// ================================
// GET OFFERS
// ================================
function getAllDealerOffers(name) {
    return dealerOfferMap[normalizeText(name)] || [];
}

// ================================
// FIND DEALER
// ================================
function findDealerInfo(name) {

    return dealerMaster.find(d =>
        normalizeText(d.name) === normalizeText(name)
    ) || null;
}

// ================================
// HTML GENERATOR
// ================================
function generateFullBrochureHTML(name) {

    const offers = getAllDealerOffers(name);
    const dealer = findDealerInfo(name);

    let html = `
    <div style="width:1000px;background:#fff;padding:20px;font-family:Arial;color:#000;">
    <h1>AUTO SPARES SOLUTION</h1>
    <h2>${name}</h2>

    <p><b>Mobile:</b> ${dealer?.phone || 'N/A'}</p>
    <p><b>District:</b> ${dealer?.district || 'N/A'}</p>

    <table style="width:100%;border-collapse:collapse;">
    <tr style="background:#facc15;">
        <th>Part</th><th>MRP</th><th>Basic</th><th>Dis%</th><th>Net</th><th>Stock</th>
    </tr>`;

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
            <td>${net.toFixed(2)}</td>
            <td>${o.totalStock || 0}</td>
        </tr>`;
    });

    html += `</table></div>`;

    return html;
}

// ================================
// PREVIEW
// ================================
function preview(name) {
    const win = window.open('', '_blank');
    win.document.write(generateFullBrochureHTML(name));
    win.document.close();
}

// ================================
// EXCEL EXPORT (FIXED)
// ================================
function exportExcel(name) {

    if (!checkXLSX()) return;

    const offers = getAllDealerOffers(name);

    const data = offers.map(o => {

        const mrp = getMRP(o);
        const basic = getBasicPrice(mrp);
        const dis = getSplDiscount(o);
        const net = getNetPrice(basic, dis);

        return {
            Part: o.part,
            MRP: mrp,
            Basic: basic,
            Discount: dis,
            Net: net,
            Stock: o.totalStock || 0
        };
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(wb, ws, "Data");

    XLSX.writeFile(wb, `${name}_brochure.xlsx`);
}

// ================================
// API LAYER (NO BREAK SYSTEM)
// ================================
const API = {

    init: async function () {
        await loadDealerMaster();
        loadOffers();
        console.log("🚀 SYSTEM READY (ZERO BREAK)");
    },

    loadDealerMaster,
    loadOffers,
    getAllDealerOffers,
    findDealerInfo,
    generateFullBrochureHTML,
    preview,
    exportExcel
};

// ================================
// LEGACY SUPPORT (OLD CODE SAFE)
// ================================
window.BrochureGenerator = {
    dealersWithOffer: getAllDealerOffers,
    getDealersWithOffers: getAllDealerOffers,
    exportDealerOffersToExcel: exportExcel,
    showBrochurePreview: preview,
    generateFullBrochureHTML
};

// ================================
// NEW STABLE SYSTEM
// ================================
window.BrochureAPI = API;

})();
