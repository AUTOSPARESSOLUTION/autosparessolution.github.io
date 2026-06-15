(function () {

console.log("🚀 Brochure System Loaded (Customer Master + Distributor Stock + Personal WhatsApp)");

// =========================
// DATA
// =========================
let dealerMaster = [];
let currentOffers = [];
let dealerOfferMap = {};
let distributorStock = [];

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
// NORMALIZE TEXT
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
// PHONE CLEANER - Adds 91 for 10-digit numbers
// =========================
function cleanPhone(p) {
    let x = String(p || "").replace(/\D/g, "");
    if (!x) return "";
    if (x.length === 10) return "91" + x;
    if (x.length === 11 && x.startsWith("0")) return "91" + x.substring(1);
    if (x.length === 12 && x.startsWith("91")) return x;
    if (x.length > 12) return "91" + x.slice(-10);
    return x;
}

// =========================
// LOAD DISTRIBUTOR STOCK
// =========================
async function loadDistributorStock() {
    try {
        const localStock = localStorage.getItem('distributorStock');
        if (localStock) {
            const parsed = JSON.parse(localStock);
            if (parsed && parsed.length > 0) {
                distributorStock = parsed;
                console.log(`✅ Distributor stock loaded from localStorage: ${distributorStock.length} items`);
                return distributorStock;
            }
        }
        
        const rows = await loadExcelFile("./data/distributor-stock.xlsx");
        
        distributorStock = rows.map(row => {
            let stockQty = 0;
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
        
        console.log(`✅ Distributor stock loaded: ${distributorStock.length} items`);
        
    } catch (err) {
        console.warn("Could not load distributor stock:", err);
        distributorStock = [];
    }
    return distributorStock;
}

// =========================
// LOAD DEALER MASTER (UPDATED - INCLUDES CUSTOMER MASTER)
// =========================
async function loadDealerMaster() {
    
    const masterMap = new Map();
    
    // ====================================
    // SOURCE 1: Customer Master (HIGHEST PRIORITY)
    // ====================================
    const customers = JSON.parse(localStorage.getItem('customers') || '[]');
    console.log(`📋 Customer Master: ${customers.length} customers`);
    
    for (const c of customers) {
        const name = c.name || '';
        if (!name) continue;
        
        const normName = normalizeText(name);
        const phone = c.mobileNo || c.phone || '';
        const district = c.district || '';
        
        masterMap.set(normName, {
            name: name,
            phone: cleanPhone(phone),
            district: district,
            source: 'customer-master'
        });
    }
    
    // ====================================
    // SOURCE 2: Excel Master File
    // ====================================
    try {
        const rows = await loadExcelFile("./data/RETAILER data Deatils.xlsx");
        console.log(`📋 Excel Master: ${rows.length} entries`);
        
        for (const row of rows) {
            const name = row["Retailer Name"] || row["Customer Name"] || row["Dealer Name"] || row["Name"] || "";
            if (!name) continue;
            
            const normName = normalizeText(name);
            const phone = row["Mobile No"] || row["Mobile Number"] || row["Phone"] || "";
            const district = row["District"] || row["District Name"] || row["PLACE"] || row["Location"] || "";
            
            if (!masterMap.has(normName)) {
                masterMap.set(normName, {
                    name: name,
                    phone: cleanPhone(phone),
                    district: district,
                    source: 'excel'
                });
            } else {
                const existing = masterMap.get(normName);
                if (!existing.phone && phone) existing.phone = cleanPhone(phone);
                if (!existing.district && district) existing.district = district;
            }
        }
    } catch(e) {
        console.warn("Excel master file not found", e);
    }
    
    // ====================================
    // SOURCE 3: Users and Dealers
    // ====================================
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    const dealers = JSON.parse(localStorage.getItem('dealers') || '[]');
    const allLocal = [...users, ...dealers];
    
    for (const u of allLocal) {
        const name = u.name || u.business || '';
        if (!name) continue;
        
        const normName = normalizeText(name);
        const phone = u.phone || u.mobile || u.mobileNo || '';
        const district = u.district || '';
        
        if (!masterMap.has(normName)) {
            masterMap.set(normName, {
                name: name,
                phone: cleanPhone(phone),
                district: district,
                source: 'user-dealer'
            });
        } else {
            const existing = masterMap.get(normName);
            if (!existing.phone && phone) existing.phone = cleanPhone(phone);
            if (!existing.district && district) existing.district = district;
        }
    }
    
    // ====================================
    // SOURCE 4: Invoices
    // ====================================
    const allInvoices = JSON.parse(localStorage.getItem('allInvoices') || '[]');
    for (const inv of allInvoices) {
        let name = inv.customerName || inv.buyer?.name || '';
        if (!name) continue;
        
        const normName = normalizeText(name);
        let phone = inv.customerPhone || inv.buyer?.phone || inv.phone || '';
        let district = inv.customerDistrict || inv.buyer?.district || inv.district || '';
        
        if (!masterMap.has(normName)) {
            masterMap.set(normName, {
                name: name,
                phone: cleanPhone(phone),
                district: district,
                source: 'invoice'
            });
        } else {
            const existing = masterMap.get(normName);
            if (!existing.phone && phone) existing.phone = cleanPhone(phone);
            if (!existing.district && district) existing.district = district;
        }
    }
    
    // Convert to array
    dealerMaster = Array.from(masterMap.values());
    
    // Statistics
    const withPhone = dealerMaster.filter(d => d.phone).length;
    const withDistrict = dealerMaster.filter(d => d.district).length;
    
    console.log(`✅ Dealer Master Loaded: ${dealerMaster.length} dealers`);
    console.log(`   📞 Has Phone: ${withPhone} (${Math.round(withPhone/dealerMaster.length*100)}%)`);
    console.log(`   📍 Has District: ${withDistrict} (${Math.round(withDistrict/dealerMaster.length*100)}%)`);
    
    return dealerMaster;
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
    console.log(`✅ Offers Loaded: ${currentOffers.length}`);
}

// =========================
// GET OFFERS
// =========================
function getAllDealerOffers(name) {
    return dealerOfferMap[normalizeText(name)] || [];
}

// =========================
// FIND DEALER (UPDATED with fallback)
// =========================
function findDealer(name) {
    const normalized = normalizeText(name);
    
    // Direct match
    let dealer = dealerMaster.find(d => normalizeText(d.name) === normalized);
    if (dealer) return dealer;
    
    // Partial match
    dealer = dealerMaster.find(d => 
        normalizeText(d.name).includes(normalized) || 
        normalized.includes(normalizeText(d.name))
    );
    if (dealer) return dealer;
    
    return null;
}

// =========================
// GET DISTRIBUTOR INFO
// =========================
function getDistributorInfo(part) {
    return distributorStock.find(d => d.part === part) || null;
}

// =========================
// PRICE ENGINE
// =========================
function getMRP(o) {
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
// GENERATE WHATSAPP MESSAGE
// =========================
function generateWhatsAppMessage(name, dealer, offers) {
    let msg = `*⚡ AUTO SPARES SOLUTION ⚡*\n\n`;
    msg += `*Dear ${name},*\n\n`;
    msg += `*📋 SPECIAL OFFER LIST*\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;

    let i = 0;
    for (let o of offers.slice(0, 10)) {
        const mrp = getMRP(o);
        const basic = getBasic(mrp);
        const dis = getDiscount(o);
        const net = getNet(basic, dis);
        const stockInfo = getDisplayStock(o);

        msg += `🔹 *${o.part}*\n`;
        msg += `   💰 Offer Price: ₹${net.toFixed(2)}\n`;
        if (dis > 0) msg += `   ✨ ${dis}% OFF\n`;
        msg += `   📦 Total Stock: ${stockInfo.totalStock} units\n\n`;
    }

    if (offers.length > 10) {
        msg += `*And ${offers.length - 10} more offers...*\n\n`;
    }

    msg += `━━━━━━━━━━━━━━━━━━━━\n`;
    if (dealer?.district) msg += `📍 District: ${dealer.district}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;
    msg += `_Reply with part numbers and quantity_\n`;
    msg += `*Thank you for your business!*`;
    
    return msg;
}

// =========================
// SEND WHATSAPP (UPDATED)
// =========================
function sendFlyerToWhatsApp(name) {
    console.log(`🔍 Looking for: "${name}"`);
    
    // Find offers using normalized matching
    const normalizedName = normalizeText(name);
    let offers = dealerOfferMap[normalizedName] || [];
    
    // Try partial match if direct not found
    if (offers.length === 0) {
        for (const [key, offerList] of Object.entries(dealerOfferMap)) {
            if (key.includes(normalizedName) || normalizedName.includes(key)) {
                offers = offerList;
                console.log(`✅ Found offers by partial match: "${key}"`);
                break;
            }
        }
    }
    
    if (offers.length === 0) {
        alert(`❌ No offers found for "${name}"\n\nPlease run Analysis first.`);
        console.error(`No offers for: ${name}`);
        return;
    }
    
    // Find dealer info
    let dealer = findDealer(name);
    
    // If not found, try to create from Customer Master directly
    if (!dealer || !dealer.phone) {
        const customers = JSON.parse(localStorage.getItem('customers') || '[]');
        const customerMatch = customers.find(c => normalizeText(c.name) === normalizedName);
        
        if (customerMatch && (customerMatch.mobileNo || customerMatch.phone)) {
            dealer = {
                name: customerMatch.name,
                phone: cleanPhone(customerMatch.mobileNo || customerMatch.phone),
                district: customerMatch.district || '',
                source: 'customer-master-direct'
            };
            console.log(`✅ Found phone from Customer Master: ${dealer.phone}`);
        }
    }
    
    // Try invoices if still no phone
    if (!dealer || !dealer.phone) {
        const allInvoices = JSON.parse(localStorage.getItem('allInvoices') || '[]');
        for (const inv of allInvoices) {
            if (normalizeText(inv.customerName) === normalizedName) {
                const phone = inv.customerPhone || inv.buyer?.phone || inv.phone || '';
                if (phone) {
                    dealer = {
                        name: name,
                        phone: cleanPhone(phone),
                        district: inv.customerDistrict || inv.district || '',
                        source: 'invoice-direct'
                    };
                    console.log(`✅ Found phone from Invoice: ${dealer.phone}`);
                    break;
                }
            }
        }
    }
    
    if (!dealer || !dealer.phone) {
        alert(`❌ Phone number not found for "${name}"

Please add mobile number in Customer Master:
1. Go to Customer Master page
2. Search for "${name}"
3. Add Mobile No (10 digits)
4. Save and retry`);
        return;
    }
    
    const msg = generateWhatsAppMessage(name, dealer, offers);
    let cleanPhoneNum = dealer.phone;
    
    if (cleanPhoneNum.length === 10) cleanPhoneNum = '91' + cleanPhoneNum;
    if (cleanPhoneNum.length === 11 && cleanPhoneNum.startsWith('0')) cleanPhoneNum = '91' + cleanPhoneNum.substring(1);
    
    const url = `https://wa.me/${cleanPhoneNum}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
    
    console.log(`✅ WhatsApp opened for "${name}" (${cleanPhoneNum}) | Offers: ${offers.length}`);
}

// =========================
// HTML BROCHURE
// =========================
function generateFullBrochureHTML(name) {
    const offers = getAllDealerOffers(name);
    const dealer = findDealer(name);
    
    let phone = dealer?.phone || '';
    let district = dealer?.district || '';
    
    if (!phone) {
        const customers = JSON.parse(localStorage.getItem('customers') || '[]');
        const match = customers.find(c => normalizeText(c.name) === normalizeText(name));
        if (match) {
            phone = cleanPhone(match.mobileNo || match.phone || '');
            district = match.district || '';
        }
    }

    let html = `
    <div style="width:1000px;background:#fff;padding:20px;font-family:Arial;color:#000;">
    <h1 style="color:#0a7c71;">AUTO SPARES SOLUTION</h1>
    <h2>${escapeHtml(name)}</h2>
    <p><b>📞 Mobile:</b> ${phone || "<span style='color:#dc3545'>Not available</span>"}</p>
    <p><b>📍 District:</b> ${district || "<span style='color:#ffc107'>Not specified</span>"}</p>
    <table style="width:100%;border-collapse:collapse;margin-top:15px;">
    <tr style="background:#facc15;">
        <th>Part</th><th>MRP</th><th>Basic Price</th><th>Discount</th><th>Net Price</th><th>Our Stock</th><th>Dist.Stock</th><th>Total</th>
    </tr>`;

    for (const o of offers.slice(0, 20)) {
        const mrp = getMRP(o);
        const basic = getBasic(mrp);
        const dis = getDiscount(o);
        const net = getNet(basic, dis);
        const stock = getDisplayStock(o);
        html += `<tr>
            <td>${o.part || ''}</td>
            <td>₹${mrp.toFixed(2)}</td yo<th>₹${basic.toFixed(2)}</td yo<th>${dis}%</td>
            <td style="color:green;font-weight:bold;">₹${net.toFixed(2)}</td>
            <td>${stock.myStock}</td>
            <td style="color:#16a34a;">${stock.distributorStock || '-'}</td>
            <td><strong>${stock.totalStock}</strong></td>
        </tr>`;
    }

    html += `;</div>`;
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
// EXCEL EXPORT
// =========================
function exportDealerOffersToExcel(name) {
    if (!hasXLSX()) {
        alert("XLSX missing");
        return;
    }
    const offers = getAllDealerOffers(name);
    const dealer = findDealer(name);
    const data = offers.map(o => ({
        Part: o.part,
        MRP: getMRP(o),
        "Basic Price": getBasic(getMRP(o)),
        "Discount %": getDiscount(o),
        "Net Price": getNet(getBasic(getMRP(o)), getDiscount(o)).toFixed(2),
        "Our Stock": getDisplayStock(o).myStock,
        "Dist. Stock": getDisplayStock(o).distributorStock,
        "Total Stock": getDisplayStock(o).totalStock
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Offers");
    XLSX.writeFile(wb, `${name.replace(/[^a-z0-9]/gi, '_')}_offers.xlsx`);
}

// =========================
// PDF SHARE
// =========================
async function sharePDFToWhatsApp(name) {
    try {
        let dealer = findDealer(name);
        let phone = dealer?.phone || '';
        
        if (!phone) {
            const customers = JSON.parse(localStorage.getItem('customers') || '[]');
            const match = customers.find(c => normalizeText(c.name) === normalizeText(name));
            if (match) phone = cleanPhone(match.mobileNo || match.phone || '');
        }
        
        if (!phone) {
            alert(`Phone number not found for ${name}`);
            return;
        }
        
        const div = document.createElement("div");
        div.innerHTML = generateFullBrochureHTML(name);
        div.style.position = "fixed";
        div.style.left = "-9999px";
        div.style.width = "1000px";
        div.style.background = "#fff";
        div.style.padding = "20px";
        document.body.appendChild(div);
        await new Promise(r => setTimeout(r, 500));
        const canvas = await html2canvas(div, { scale: 2, useCORS: true });
        const img = canvas.toDataURL("image/png");
        const pdf = new window.jspdf.jsPDF("p", "mm", "a4");
        const pageWidth = 210;
        const pageHeight = 297;
        const ratio = canvas.height / canvas.width;
        let imgWidth = pageWidth;
        let imgHeight = pageWidth * ratio;
        if (imgHeight > pageHeight) {
            const scale = pageHeight / imgHeight;
            imgHeight *= scale;
            imgWidth *= scale;
        }
        const x = (pageWidth - imgWidth) / 2;
        const y = (pageHeight - imgHeight) / 2;
        pdf.addImage(img, "PNG", x, y, imgWidth, imgHeight);
        const pdfBlob = pdf.output('blob');
        const pdfUrl = URL.createObjectURL(pdfBlob);
        const msg = `📄 *Your Special Offer Brochure*\n\nDear ${name},\n\nPlease find your personalized offer brochure attached.\n\nThank you for your business!`;
        let cleanPhoneNum = phone;
        if (cleanPhoneNum.length === 10) cleanPhoneNum = '91' + cleanPhoneNum;
        const waUrl = `https://wa.me/${cleanPhoneNum}?text=${encodeURIComponent(msg + '\n\n' + pdfUrl)}`;
        window.open(waUrl, "_blank");
        document.body.removeChild(div);
        setTimeout(() => URL.revokeObjectURL(pdfUrl), 60000);
    } catch (err) {
        console.error(err);
        alert("PDF generation failed: " + err.message);
    }
}

// =========================
// GET DEALERS WITH OFFERS
// =========================
async function getDealersWithOffers() {
    await loadDealerMaster();
    loadOffers();
    const result = [];
    const processed = new Set();
    
    for (const [key, offers] of Object.entries(dealerOfferMap)) {
        if (offers.length > 0 && !processed.has(key)) {
            processed.add(key);
            const dealer = findDealer(offers[0].dealer);
            result.push({
                name: offers[0].dealer,
                phone: dealer?.phone || '',
                district: dealer?.district || '',
                offerCount: offers.length,
                hasPhone: !!dealer?.phone
            });
        }
    }
    
    return result;
}

// =========================
// ESCAPE HTML
// =========================
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;');
}

// =========================
// INIT
// =========================
async function init() {
    await loadDealerMaster();
    await loadDistributorStock();
    loadOffers();
    console.log(`🚀 SYSTEM READY - Dealers: ${dealerMaster.length}, Distributor stock: ${distributorStock.length}`);
}

// =========================
// GLOBAL API
// =========================
window.BrochureGenerator = {
    init,
    loadDealerMaster,
    loadOffers,
    loadDistributorStock,
    getAllDealerOffers,
    getDealersWithOffers,
    findDealer,
    generateFullBrochureHTML,
    showBrochurePreview,
    sendFlyerToWhatsApp,
    exportDealerOffersToExcel,
    sharePDFToWhatsApp,
    getDistributorStock: () => distributorStock
};

// Auto-init
init();

})();
