(function () {

console.log("✅ Brochure Generator Loaded (FINAL FIX + EXCEL + PDF OK)");

let dealerMaster = [];
let currentOffers = [];
let dealerOfferMap = {};

// =========================================
// SAFE EXCEL LOADER
// =========================================
async function loadExcelFile(url, sheetName = null) {

    try {

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error("Excel file not found: " + url);
        }

        const buffer = await response.arrayBuffer();

        const workbook = XLSX.read(buffer, { type: 'array' });

        let sheet = null;

        if (sheetName && workbook.SheetNames.includes(sheetName)) {
            sheet = workbook.Sheets[sheetName];
        } else {
            sheet = workbook.Sheets[workbook.SheetNames[0]];
        }

        return XLSX.utils.sheet_to_json(sheet);

    } catch (err) {

        console.error("❌ Excel Load Failed:", err.message);
        return [];
    }
}

// =========================================
// NORMALIZE FIXED
// =========================================
function normalizeText(text) {

    return String(text || '')
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .replace(/\n|\r|\t/g, ' ')
        .replace(/[^a-zA-Z0-9]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toUpperCase();
}

// =========================================
// PHONE CLEAN
// =========================================
function cleanPhone(phone) {

    let p = String(phone || '').replace(/\D/g, '');

    if (!p) return '';

    if (p.startsWith('0')) p = p.substring(1);

    if (p.length === 10) p = '91' + p;

    return p;
}

// =========================================
// PRICE LOGIC
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

function getNetPrice(basic, dis) {
    const after = basic - (basic * dis / 100);
    return after * 1.18;
}

// =========================================
// DEALER MASTER LOAD (FIXED MAPPING)
// =========================================
async function loadDealerMaster() {

    try {

        const rows = await loadExcelFile('./data/RETAILER data Deatils.xlsx');

        console.log("📌 Sample Excel Row:", rows[0]); // DEBUG

        dealerMaster = rows.map(row => {

            const name =
                row['Retailer Name'] ||
                row['Customer Name'] ||
                row['Dealer Name'] ||
                row['Name'] ||
                '';

            // FIXED MOBILE (multi-column support)
            const phone =
                row['Mobile No'] ||
                row['Mobile Number'] ||
                row['MobileNo'] ||
                row['Phone'] ||
                row['PHONE'] ||
                '';

            // FIXED DISTRICT (multi-column support)
            const district =
                row['District'] ||
                row['District Name'] ||
                row['PLACE'] ||
                row['Location'] ||
                '';

            return {
                name: String(name || '').trim(),
                normalizedName: normalizeText(name),
                phone: cleanPhone(phone),
                district: String(district || '').trim(),
                ownerName: row['Owner Name'] || ''
            };
        }).filter(d => d.name);

        console.log("✅ Dealer Loaded:", dealerMaster.length);

        return dealerMaster;

    } catch (err) {

        console.error("❌ Dealer Load Error:", err);
        dealerMaster = [];
        return [];
    }
}

// =========================================
// LOAD OFFERS + INDEX
// =========================================
function loadOffers() {

    try {

        const data = JSON.parse(localStorage.getItem('dealerOffers') || '{}');

        currentOffers = Array.isArray(data.offers) ? data.offers : [];

        dealerOfferMap = {};

        currentOffers.forEach(o => {

            const key = normalizeText(o.dealer);

            if (!dealerOfferMap[key]) {
                dealerOfferMap[key] = [];
            }

            dealerOfferMap[key].push(o);
        });

        console.log("✅ Offers Loaded:", currentOffers.length);

        return currentOffers;

    } catch (err) {

        console.error("❌ Offer Load Error:", err);
        currentOffers = [];
        dealerOfferMap = {};
        return [];
    }
}

// =========================================
// FAST OFFER FETCH
// =========================================
function getAllDealerOffers(name) {
    return dealerOfferMap[normalizeText(name)] || [];
}

// =========================================
// DEALER FIND
// =========================================
function findDealerInfo(name) {

    return dealerMaster.find(d =>
        normalizeText(d.name) === normalizeText(name)
    ) || null;
}

// =========================================
// HTML BROCHURE
// =========================================
function generateFullBrochureHTML(dealerName) {

    const offers = getAllDealerOffers(dealerName);
    const dealer = findDealerInfo(dealerName);

    let html = `
    <div style="width:1000px;background:#fff;padding:20px;font-family:Arial;color:#000;">

    <h1 style="color:#2563eb;">AUTO SPARES SOLUTION</h1>
    <h2>${dealerName}</h2>

    <p><b>Mobile:</b> ${dealer?.phone || 'N/A'}</p>
    <p><b>District:</b> ${dealer?.district || 'N/A'}</p>

    <table style="width:100%;border-collapse:collapse;font-size:13px;">
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
            <td style="color:green;font-weight:bold;">₹${net.toFixed(2)}</td>
            <td>${o.totalStock || 0}</td>
        </tr>`;
    });

    html += `</table></div>`;

    return html;
}

// =========================================
// PREVIEW
// =========================================
function showBrochurePreview(name) {

    const win = window.open('', '_blank');

    win.document.write(`
    <html><body style="background:#eee;padding:20px;">
    ${generateFullBrochureHTML(name)}
    </body></html>`);

    win.document.close();
}

// =========================================
// WHATSAPP MESSAGE
// =========================================
function generateWhatsAppFlyerMessage(name) {

    const offers = getAllDealerOffers(name);
    const dealer = findDealerInfo(name) || {};

    let msg = `Dear ${name}\n\n🎁 OFFER LIST\n\n`;

    let i = 0;

    for (let o of offers) {

        if (msg.length > 3500) break;

        const mrp = getMRP(o);
        const basic = getBasicPrice(mrp);
        const dis = getSplDiscount(o);
        const net = getNetPrice(basic, dis);

        msg += `${++i}) ${o.part}\n₹${net.toFixed(2)} Net\n\n`;
    }

    msg += `District: ${dealer.district || 'N/A'}\nAuto Spares Solution`;

    return msg;
}

// =========================================
// EXCEL DOWNLOAD (FIXED + WORKING)
// =========================================
function exportDealerOffersToExcel(dealerName) {

    if (typeof XLSX === "undefined") {
        alert("XLSX library not loaded!");
        return;
    }

    const offers = getAllDealerOffers(dealerName);

    if (!offers.length) {
        alert("No offers found");
        return;
    }

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
            NetPrice: net,
            Stock: o.totalStock || 0
        };
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(wb, ws, "Brochure");

    XLSX.writeFile(wb, dealerName + "_brochure.xlsx");
}

// =========================================
// PDF EXPORT FIXED
// =========================================
async function sharePDFToWhatsApp(name) {

    try {

        const div = document.createElement('div');
        div.innerHTML = generateFullBrochureHTML(name);
        div.style.position = 'fixed';
        div.style.left = '-9999px';

        document.body.appendChild(div);

        await new Promise(r => setTimeout(r, 500));

        const canvas = await html2canvas(div, { scale: 2 });

        const img = canvas.toDataURL('image/png');

        const pdf = new window.jspdf.jsPDF('p', 'mm', 'a4');

        pdf.addImage(img, 'PNG', 5, 5, 200, 280);

        pdf.save(name + ".pdf");

        document.body.removeChild(div);

    } catch (err) {

        console.error(err);
        alert("PDF failed");
    }
}

// =========================================
// GLOBAL EXPORT (IMPORTANT FIX)
// =========================================
window.BrochureGenerator = {

    init: async function () {
        await loadDealerMaster();
        loadOffers();
        console.log("✅ SYSTEM READY");
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
