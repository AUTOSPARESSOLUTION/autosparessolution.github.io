(function () {

console.log("✅ Brochure Generator FIXED + FULL UI VERSION");

let dealerMaster = [];
let currentOffers = [];

// =========================
// NORMALIZE (FIXED)
// =========================
function normalizeText(text) {
    return String(text || '')
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .trim();
}

// =========================
// CLEAN PHONE
// =========================
function cleanPhone(phone) {

    let p = String(phone || '').replace(/\D/g, '');

    if (!p) return '';

    if (p.length === 10) p = '91' + p;

    return p;
}

// =========================
// LOAD EXCEL
// =========================
async function loadExcelFile(url, sheetName = null) {

    const res = await fetch(url);
    const buf = await res.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });

    const sheet =
        sheetName && wb.SheetNames.includes(sheetName)
            ? wb.Sheets[sheetName]
            : wb.Sheets[wb.SheetNames[0]];

    return XLSX.utils.sheet_to_json(sheet);
}

// =========================
// LOAD DEALERS
// =========================
async function loadDealerMaster() {

    const rows = await loadExcelFile(
        'data/RETAILER data details.xlsx',
        'SAPUI5 Export'
    );

    dealerMaster = rows.map(r => {

        const name =
            r['Retailer Name'] ||
            r['Customer Name'] ||
            r['Dealer Name'] ||
            '';

        return {
            name,
            normalizedName: normalizeText(name),
            phone: cleanPhone(r['Mobile No'] || r['Phone'] || ''),
            district: r['District'] || ''
        };

    }).filter(d => d.name);

    console.log("✅ Dealers Loaded:", dealerMaster.length);
}

// =========================
// LOAD OFFERS
// =========================
function loadOffers() {

    const data = JSON.parse(localStorage.getItem('dealerOffers') || '{}');
    currentOffers = data.offers || [];

    console.log("✅ Offers Loaded:", currentOffers.length);
}

// =========================
// FIND DEALER (FIXED)
// =========================
function findDealerInfo(name) {

    const n = normalizeText(name);

    return dealerMaster.find(d => {

        return (
            d.normalizedName === n ||
            d.normalizedName.includes(n) ||
            n.includes(d.normalizedName)
        );
    });
}

// =========================
// GET OFFERS (FIXED)
// =========================
function getAllDealerOffers(name) {

    const n = normalizeText(name);

    return currentOffers.filter(o => {

        const d = normalizeText(o.dealer || o.customer || '');

        return (
            d === n ||
            d.includes(n) ||
            n.includes(d)
        );
    });
}

// =========================
// WHATSAPP MESSAGE
// =========================
function generateWhatsAppFlyerMessage(name) {

    const offers = getAllDealerOffers(name);

    let msg = "⚡ AUTO SPARES SOLUTION ⚡\n\n";
    msg += "Dealer: " + name + "\n\n";

    offers.forEach((o, i) => {

        msg += `${i + 1}. ${o.part}\n`;
        msg += `₹${Number(o.offerPrice || 0).toFixed(2)} | ${o.discount}% | Stock:${o.totalStock}\n\n`;
    });

    msg += "Auto Spares Solution";

    return msg;
}

// =========================
// WHATSAPP SEND
// =========================
async function sendFlyerToWhatsApp(name) {

    if (dealerMaster.length === 0) {
        await loadDealerMaster();
        loadOffers();
    }

    const dealer = findDealerInfo(name);

    if (!dealer) {
        alert("Dealer not found: " + name);
        return;
    }

    const offers = getAllDealerOffers(name);

    if (!offers.length) {
        alert("No offers found: " + name);
        return;
    }

    const msg = generateWhatsAppFlyerMessage(name);

    const url = `https://wa.me/${dealer.phone}?text=${encodeURIComponent(msg)}`;

    window.open(url, "_blank");
}

// =========================
// 🔥 FIXED FULL HTML GENERATOR (IMPORTANT)
// =========================
function generateFullBrochureHTML(name) {

    const offers = getAllDealerOffers(name);
    const dealer = findDealerInfo(name);

    let html = `
    <div style="font-family:Arial;padding:20px;background:white;color:black;width:800px">
        <h2>Auto Spares Solution</h2>
        <h3>${name}</h3>
        <p>${dealer?.phone || ''}</p>

        <table border="1" width="100%" cellspacing="0">
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
            <td>${o.part}</td>
            <td>₹${o.offerPrice}</td>
            <td>${o.discount}%</td>
            <td>${o.totalStock}</td>
        </tr>
        `;
    });

    html += `</table></div>`;

    return html;
}

// =========================
// 📄 FIXED PDF (NO BLANK ISSUE)
// =========================
async function downloadSinglePDF(name) {

    const html = generateFullBrochureHTML(name);

    const div = document.createElement("div");
    div.innerHTML = html;

    div.style.position = "fixed";
    div.style.left = "-9999px";
    div.style.background = "white";

    document.body.appendChild(div);

    await new Promise(r => setTimeout(r, 500));

    const canvas = await html2canvas(div, {
        scale: 2,
        useCORS: true
    });

    const img = canvas.toDataURL("image/png");

    const jsPDF = window.jspdf?.jsPDF;

    if (!jsPDF) {
        alert("PDF library missing");
        return;
    }

    const pdf = new jsPDF("p", "mm", "a4");

    pdf.addImage(img, "PNG", 5, 5, 200, 280);

    pdf.save(name + ".pdf");

    document.body.removeChild(div);
}

// =========================
// 🔥 RESTORED UI FUNCTIONS
// =========================
async function getDealersWithOffers() {

    if (!dealerMaster.length) {
        await loadDealerMaster();
        loadOffers();
    }

    const unique = [...new Set(currentOffers.map(o =>
        o.dealer || o.customer || ''
    ))];

    return unique.map(name => {

        const offers = getAllDealerOffers(name);
        const dealer = findDealerInfo(name);

        return {
            name,
            phone: dealer?.phone || '',
            offerCount: offers.length
        };
    });
}

// =========================
// EXPORT
// =========================
window.BrochureGenerator = {

    loadDealerMaster,
    loadOffers,

    findDealerInfo,
    getAllDealerOffers,

    sendFlyerToWhatsApp,

    generateFullBrochureHTML,

    downloadSinglePDF,

    getDealersWithOffers,

    getDealerMaster: () => dealerMaster,
    getCurrentOffers: () => currentOffers
};

})();
