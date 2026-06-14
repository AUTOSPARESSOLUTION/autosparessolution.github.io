(function () {

console.log("🚀 Brochure System Loaded (FINAL STABLE + PDF AUTO FIT + DISTRIBUTOR STOCK)");

// =========================
// DATA
// =========================
let dealerMaster = [];
let currentOffers = [];
let dealerOfferMap = {};
let distributorStock = [];  // NEW: Store distributor stock

// =========================
// XLSX CHECK
// =========================
function hasXLSX() {
    return typeof XLSX !== "undefined";
}

// =========================
// LOAD EXCEL
// =========================
async function loadExcelFile(url, sheetName = null) {

    try {

        const res = await fetch(url);
        if (!res.ok) throw new Error("File not found: " + url);

        const buf = await res.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });

        const sheet = sheetName && wb.SheetNames.includes(sheetName)
            ? wb.Sheets[sheetName]
            : wb.Sheets[wb.SheetNames[0]];

        return XLSX.utils.sheet_to_json(sheet);

    } catch (err) {

        console.error("Excel Load Error:", err.message);
        return [];
    }
}

// =========================
// LOAD DISTRIBUTOR STOCK (NEW)
// =========================
async function loadDistributorStock() {
    try {
        // First check localStorage (from manual upload)
        const localStock = localStorage.getItem('distributorStock');
        if (localStock) {
            const parsed = JSON.parse(localStock);
            if (parsed && parsed.length > 0) {
                distributorStock = parsed;
                console.log(`✅ Distributor stock loaded from localStorage: ${distributorStock.length} items`);
                return distributorStock;
            }
        }
        
        // Fallback to data folder
        const rows = await loadExcelFile("./data/distributor-stock.xlsx");
        
        distributorStock = rows.map(row => {
            let stockQty = 0;
            // Flexible stock detection
            for (let key in row) {
                const value = Number(row[key]);
                if (!isNaN(value) && value > 0) {
                    if (key.toLowerCase().includes('stock') || 
                        key.toLowerCase().includes('qty') || 
                        key.toLowerCase().includes('available')) {
                        stockQty = value;
                        break;
                    }
                }
            }
            // If flexible detection failed, try direct match
            if (stockQty === 0) {
                stockQty = Number(row['Available Stock'] || row['stock'] || 0);
            }
            
            return {
                part: String(row['Part No'] || row['part_no'] || row['PartNumber'] || '').trim(),
                distributor: row['Distributor Name'] || 'Auto Links',
                stock: stockQty,
                price: Number(row['Price'] || row['price'] || 0),
                leadTime: Number(row['Lead Time (Days)'] || 3)
            };
        }).filter(item => item.part && item.stock > 0);
        
        console.log(`✅ Distributor stock loaded from data folder: ${distributorStock.length} items`);
        
    } catch (err) {
        console.warn("Could not load distributor stock:", err);
        distributorStock = [];
    }
    return distributorStock;
}

// =========================
// NORMALIZE
// =========================
function normalizeText(t) {

    return String(t || "")
        .replace(/[\u200B-\u200D\uFEFF]/g, "")
        .replace(/\n|\r|\t/g, " ")
        .replace(/[^a-zA-Z0-9]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .toUpperCase();
}

// =========================
// PHONE
// =========================
function cleanPhone(p) {

    let x = String(p || "").replace(/\D/g, "");
    if (!x) return "";
    if (x.length === 10) x = "91" + x;
    return x;
}

// =========================
// GET DISTRIBUTOR INFO FOR PART (NEW)
// =========================
function getDistributorInfo(part) {
    return distributorStock.find(d => d.part === part) || null;
}

// =========================
// PRICE ENGINE (UPDATED to prioritize distributor price)
// =========================
function getMRP(o) {
    // If distributor has stock and price, use distributor price as base
    const distInfo = getDistributorInfo(o.part);
    if (distInfo && distInfo.stock > 0 && distInfo.price > 0) {
        return distInfo.price;
    }
    return Number(o.originalPrice || o.mrp || o.MRP || 0);
}

function getBasic(mrp) {
    return mrp - (mrp * 31.77 / 100);
}

function getDiscount(o) {
    return Number(o.discount || 0);
}

function getNet(basic, dis) {
    return (basic - (basic * dis / 100)) * 1.18;
}

// =========================
// GET DISPLAY STOCK (NEW)
// =========================
function getDisplayStock(offer) {
    const myStock = offer.myStock || offer.totalStock || 0;
    const distInfo = getDistributorInfo(offer.part);
    const distributorStockQty = distInfo?.stock || offer.distributorStock || 0;
    
    return {
        myStock: myStock,
        distributorStock: distributorStockQty,
        totalStock: myStock + distributorStockQty,
        hasDistributor: distributorStockQty > 0,
        distPrice: distInfo?.price || 0
    };
}

// =========================
// LOAD DEALERS
// =========================
async function loadDealerMaster() {

    const rows = await loadExcelFile("./data/RETAILER data Deatils.xlsx");

    dealerMaster = rows.map(r => {

        const name =
            r["Retailer Name"] ||
            r["Customer Name"] ||
            r["Dealer Name"] ||
            r["Name"] ||
            "";

        const phone =
            r["Mobile No"] ||
            r["Mobile Number"] ||
            r["Phone"] ||
            "";

        const district =
            r["District"] ||
            r["District Name"] ||
            r["PLACE"] ||
            r["Location"] ||
            "";

        return {
            name: String(name).trim(),
            phone: cleanPhone(phone),
            district: String(district).trim(),
            norm: normalizeText(name)
        };

    }).filter(x => x.name);

    console.log("✅ Dealers Loaded:", dealerMaster.length);
}

// =========================
// LOAD OFFERS
// =========================
function loadOffers() {

    const data = JSON.parse(localStorage.getItem("dealerOffers") || "{}");

    currentOffers = Array.isArray(data.offers) ? data.offers : [];

    dealerOfferMap = {};

    currentOffers.forEach(o => {

        const key = normalizeText(o.dealer);

        if (!dealerOfferMap[key]) dealerOfferMap[key] = [];

        dealerOfferMap[key].push(o);
    });

    console.log("✅ Offers Loaded:", currentOffers.length);
}

// =========================
// GET OFFERS
// =========================
function getAllDealerOffers(name) {
    return dealerOfferMap[normalizeText(name)] || [];
}

// =========================
// FIND DEALER
// =========================
function findDealer(name) {

    return dealerMaster.find(d =>
        normalizeText(d.name) === normalizeText(name)
    ) || null;
}

// =========================
// HTML BROCHURE (UPDATED with distributor stock)
// =========================
function generateFullBrochureHTML(name) {

    const offers = getAllDealerOffers(name);
    const dealer = findDealer(name);

    let html = `
    <div style="width:1000px;background:#fff;padding:20px;font-family:Arial;color:#000;">

    <h1>AUTO SPARES SOLUTION</h1>
    <h2>${name}</h2>

    <p><b>Mobile:</b> ${dealer?.phone || "N/A"}</p>
    <p><b>District:</b> ${dealer?.district || "N/A"}</p>

    <table style="width:100%;border-collapse:collapse;">
    
    <tr style="background:#facc15;">
        <th>Part</th>
        <th>MRP</th>
        <th>Basic Price (Less 31.77%)</th>
        <th>Spl Dis</th>
        <th>Net Price Including GST</th>
        <th>Our Stock</th>
        <th>Dist. Stock</th>
        <th>Total Stock</th>
    </tr>`;

    offers.forEach(o => {

        const mrp = getMRP(o);
        const basic = getBasic(mrp);
        const dis = getDiscount(o);
        const net = getNet(basic, dis);
        const stockInfo = getDisplayStock(o);

        html += `
        <tr>
            <td>${o.part || ""}</td>
            <td>₹${mrp.toFixed(2)}${stockInfo.distPrice > 0 ? '<br><small>(Dist.Price)</small>' : ''}</td>
            <td>₹${basic.toFixed(2)}</td>
            <td>${dis}%</td>
            <td style="color:green;font-weight:bold;">₹${net.toFixed(2)}</td>
            <td>${stockInfo.myStock}</td>
            <td style="color:#16a34a;font-weight:bold;">${stockInfo.distributorStock || '-'}</td>
            <td style="font-weight:bold;">${stockInfo.totalStock}</td>
        </tr>`;
    });

    html += `</table>`;

    if (offers.some(o => getDisplayStock(o).hasDistributor)) {
        html += `<p style="margin-top:15px;font-size:12px;color:#16a34a;">* Distributor stock available at special pricing</p>`;
    }

    html += `</div>`;

    return html;
}

// =========================
// PREVIEW
// =========================
function showBrochurePreview(name) {

    const w = window.open("", "_blank");
    w.document.write(generateFullBrochureHTML(name));
    w.document.close();
}

// =========================
// WHATSAPP (UPDATED with distributor stock details)
// =========================
function sendFlyerToWhatsApp(name) {

    const dealer = findDealer(name);
    const offers = getAllDealerOffers(name);

    if (offers.length === 0) {
        alert("No offers found for " + name);
        return;
    }

    let msg = `*⚡ AUTO SPARES SOLUTION ⚡*\n\n`;
    msg += `*Dear ${name},*\n\n`;
    msg += `*📋 SPECIAL OFFER LIST*\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;

    let i = 0;

    for (let o of offers) {

        if (msg.length > 3500) break;

        const mrp = getMRP(o);
        const basic = getBasic(mrp);
        const dis = getDiscount(o);
        const net = getNet(basic, dis);
        const stockInfo = getDisplayStock(o);

        msg += `🔹 *${o.part}*\n`;
        msg += `   💰 Offer Price: ₹${net.toFixed(2)}\n`;
        
        if (stockInfo.distPrice > 0) {
            msg += `   🏭 Distributor Price: ₹${stockInfo.distPrice.toFixed(2)}\n`;
        }
        
        if (dis > 0) {
            msg += `   ✨ ${dis}% OFF\n`;
        }
        
        msg += `   📦 Our Stock: ${stockInfo.myStock} units\n`;
        
        if (stockInfo.hasDistributor) {
            msg += `   🏭 Dist. Stock: ${stockInfo.distributorStock} units\n`;
        }
        
        msg += `   📊 Total Stock: ${stockInfo.totalStock} units\n\n`;
    }

    msg += `━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `📍 District: ${dealer?.district || "N/A"}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;
    msg += `_Reply with part numbers and quantity_\n`;
    msg += `*Thank you for your business!*`;

    const phone = dealer?.phone || "";

    if (!phone) {
        alert("Phone number not found for " + name);
        return;
    }

    const url = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
    window.open(url, "_blank");
}

// =========================
// EXCEL EXPORT (UPDATED)
// =========================
function exportDealerOffersToExcel(name) {

    if (!hasXLSX()) {
        alert("XLSX missing");
        return;
    }

    const offers = getAllDealerOffers(name);

    const data = offers.map(o => {

        const mrp = getMRP(o);
        const basic = getBasic(mrp);
        const dis = getDiscount(o);
        const net = getNet(basic, dis);
        const stockInfo = getDisplayStock(o);

        return {
            Part: o.part,
            MRP: mrp,
            "Basic Price (Less 31.77%)": basic,
            "Spl Dis": dis,
            "Net Price Including GST": net,
            "Our Stock": stockInfo.myStock,
            "Dist. Stock": stockInfo.distributorStock,
            "Total Stock": stockInfo.totalStock,
            "Dist. Price": stockInfo.distPrice
        };
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");

    XLSX.writeFile(wb, `${name}_brochure.xlsx`);
}

// =========================
// PDF AUTO FIT (FULL PAGE FIX)
// =========================
async function sharePDFToWhatsApp(name) {

    try {

        const div = document.createElement("div");
        div.innerHTML = generateFullBrochureHTML(name);

        div.style.position = "fixed";
        div.style.left = "-9999px";
        div.style.width = "1000px";
        div.style.background = "#fff";
        div.style.padding = "20px";

        document.body.appendChild(div);

        await new Promise(r => setTimeout(r, 500));

        const canvas = await html2canvas(div, {
            scale: 2,
            useCORS: true
        });

        const img = canvas.toDataURL("image/png");

        const pdf = new window.jspdf.jsPDF("p", "mm", "a4");

        const pageWidth = 210;
        const pageHeight = 297;

        const ratio = canvas.height / canvas.width;

        let imgWidth = pageWidth;
        let imgHeight = pageWidth * ratio;

        // AUTO FIT FULL PAGE (NO CUT)
        if (imgHeight > pageHeight) {
            const scale = pageHeight / imgHeight;
            imgHeight *= scale;
            imgWidth *= scale;
        }

        const x = (pageWidth - imgWidth) / 2;
        const y = (pageHeight - imgHeight) / 2;

        pdf.addImage(img, "PNG", x, y, imgWidth, imgHeight);

        pdf.save(`${name}.pdf`);

        document.body.removeChild(div);

    } catch (err) {

        console.error(err);
        alert("PDF generation failed");
    }
}

// =========================
// SAFE DEALER LIST
// =========================
async function getDealersWithOffers() {

    return dealerMaster
        .map(d => ({
            name: d.name,
            phone: d.phone,
            district: d.district,
            offerCount: getAllDealerOffers(d.name).length
        }))
        .filter(d => d.offerCount > 0);
}

// =========================
// GET DISTRIBUTOR STOCK (NEW)
// =========================
function getDistributorStock() {
    return distributorStock;
}

// =========================
// INIT (UPDATED to load distributor stock)
// =========================
async function init() {
    await loadDealerMaster();
    await loadDistributorStock();  // NEW: Load distributor stock
    loadOffers();
    console.log("🚀 SYSTEM READY - Distributor stock:", distributorStock.length);
}

// =========================
// GLOBAL API
// =========================
window.BrochureGenerator = {

    init,
    loadDealerMaster,
    loadOffers,
    loadDistributorStock,        // NEW

    getAllDealerOffers,
    getDealersWithOffers,
    findDealer,

    generateFullBrochureHTML,
    showBrochurePreview,

    sendFlyerToWhatsApp,
    exportDealerOffersToExcel,

    sharePDFToWhatsApp,
    
    getDistributorStock,         // NEW
    getDistributorInfo           // NEW
};

// Auto-init
init();

})();
