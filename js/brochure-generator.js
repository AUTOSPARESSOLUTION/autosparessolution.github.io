(function () {

console.log("🚀 Brochure System Loaded (FIXED: Description from prices.csv)");

// =========================
// DATA
// =========================
let dealerMaster = [];
let currentOffers = [];
let dealerOfferMap = {};
let distributorStock = [];
let partDescriptions = new Map(); // NEW: Store descriptions from prices.csv

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
// PHONE CLEANER
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
// LOAD DEALER MASTER
// =========================
async function loadDealerMaster() {
    
    const masterMap = new Map();
    
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
    
    dealerMaster = Array.from(masterMap.values());
    
    const withPhone = dealerMaster.filter(d => d.phone).length;
    const withDistrict = dealerMaster.filter(d => d.district).length;
    
    console.log(`✅ Dealer Master Loaded: ${dealerMaster.length} dealers`);
    console.log(`   📞 Has Phone: ${withPhone} | 📍 Has District: ${withDistrict}`);
    
    return dealerMaster;
}

// =========================
// LOAD MY STOCK (UPDATED: Also loads descriptions)
// =========================
async function loadMyStock() {

    try {

        const response = await fetch('prices.csv');

        const csvText = await response.text();

        const rows = csvText.split('\n').slice(1);

        currentStock.clear();
        partDescriptions.clear(); // NEW: Clear descriptions

        for (const row of rows) {

            const cols = row.split(',');

            if (!cols[0]) continue;

            const part = cols[0].trim();

            const stock = parseInt(cols[7]) || 0;

            const price = parseFloat(cols[3]) || 0;
            
            // NEW: Get description from column B (index 1)
            const description = cols[1] ? cols[1].trim() : '';

            currentStock.set(part, {
                stock,
                price,
                description // NEW: Store description
            });
            
            // NEW: Store description separately for easy lookup
            if (description) {
                partDescriptions.set(part, description);
            }
        }

        console.log(`✅ My stock loaded: ${currentStock.size} parts with descriptions`);

    } catch (err) {

        console.error("Error loading prices.csv:", err);
    }
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
    const normalized = normalizeText(name);
    
    if (dealerOfferMap[normalized]) {
        return dealerOfferMap[normalized];
    }
    
    for (const [key, offers] of Object.entries(dealerOfferMap)) {
        if (key.includes(normalized) || normalized.includes(key)) {
            console.log(`✅ Found offers by partial match: "${key}" for "${name}"`);
            return offers;
        }
    }
    
    const words = normalized.split(' ');
    for (const [key, offers] of Object.entries(dealerOfferMap)) {
        for (const word of words) {
            if (word.length > 2 && key.includes(word)) {
                console.log(`✅ Found offers by word match: "${key}" for "${name}"`);
                return offers;
            }
        }
    }
    
    return [];
}

// =========================
// FIND DEALER
// =========================
function findDealer(name) {
    const normalized = normalizeText(name);
    
    let dealer = dealerMaster.find(d => normalizeText(d.name) === normalized);
    if (dealer) return dealer;
    
    dealer = dealerMaster.find(d => 
        normalizeText(d.name).includes(normalized) || 
        normalized.includes(normalizeText(d.name))
    );
    if (dealer) return dealer;
    
    const words = normalized.split(' ');
    for (const d of dealerMaster) {
        const normName = normalizeText(d.name);
        for (const word of words) {
            if (word.length > 2 && normName.includes(word)) {
                return d;
            }
        }
    }
    
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

function calculateOurPrice(mrp, discount) {
    const basic = mrp - (mrp * 31.77 / 100);
    const afterDiscount = basic - (basic * discount / 100);
    return afterDiscount * 1.18;
}

function calculateDistributorPrice(mrp) {
    return mrp;
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
        distMRP: distInfo?.price || 0
    };
}

function calculatePrices(offer) {
    const dis = getDiscount(offer);
    const stock = getDisplayStock(offer);
    
    const ourMRP = offer.originalPrice || offer.mrp || 0;
    const ourOfferPrice = calculateOurPrice(ourMRP, dis);
    
    const distMRP = stock.distMRP || 0;
    const distOfferPrice = calculateDistributorPrice(distMRP);
    
    return {
        ourMRP: ourMRP,
        ourOfferPrice: ourOfferPrice,
        distMRP: distMRP,
        distOfferPrice: distOfferPrice,
        dis: dis,
        stock: stock
    };
}

// =========================
// GET DESCRIPTION FOR PART (NEW)
// =========================
function getDescription(part) {
    // First check from prices.csv
    if (partDescriptions.has(part)) {
        return partDescriptions.get(part);
    }
    // Check from currentStock
    const stockData = currentStock.get(part);
    if (stockData && stockData.description) {
        return stockData.description;
    }
    return '';
}

// =========================
// GENERATE WHATSAPP MESSAGE
// =========================
function generateWhatsAppMessage(dealerName, dealer, offers) {
    let msg = `*⚡ AUTO SPARES SOLUTION ⚡*\n\n`;
    msg += `*Dear ${dealerName},*\n\n`;
    msg += `*📋 SPECIAL OFFER LIST*\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;

    let hasDistributorStock = false;
    
    for (let o of offers.slice(0, 8)) {
        const prices = calculatePrices(o);
        const stock = prices.stock;
        const desc = getDescription(o.part);
        
        msg += `🔹 *${o.part}*`;
        if (desc) msg += ` - ${desc}`;
        msg += `\n`;
        msg += `   📦 Our Stock: ${stock.myStock} units`;
        if (prices.ourOfferPrice > 0) {
            msg += ` @ ₹${prices.ourOfferPrice.toFixed(2)}/unit (incl. GST)`;
            if (prices.dis > 0) msg += ` | ${prices.dis}% OFF`;
        }
        msg += `\n`;
        
        if (stock.distributorStock > 0) {
            hasDistributorStock = true;
            msg += `   🏭 Dist. Stock: ${stock.distributorStock} units`;
            if (prices.distOfferPrice > 0) {
                msg += ` @ ₹${prices.distOfferPrice.toFixed(2)}/unit (MRP)`;
            }
            msg += `\n`;
        }
        msg += `   📊 Total Stock: ${stock.totalStock} units\n\n`;
    }

    if (offers.length > 8) {
        msg += `*And ${offers.length - 8} more offers...*\n\n`;
    }

    msg += `━━━━━━━━━━━━━━━━━━━━\n`;
    if (dealer?.district) msg += `📍 District: ${dealer.district}\n`;
    
    if (hasDistributorStock) {
        msg += `\n⚠️ *Additional courier charges will apply for distributor stock items.*\n`;
    }
    
    msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;
    msg += `_Reply with part numbers and quantity_\n`;
    msg += `*Thank you for your business!*`;
    
    return msg;
}

// =========================
// SEND WHATSAPP
// =========================
function sendFlyerToWhatsApp(name) {
    console.log(`🔍 Looking for offers for: "${name}"`);
    
    let offers = getAllDealerOffers(name);
    
    if (offers.length === 0) {
        const normalized = normalizeText(name);
        const words = normalized.split(' ');
        
        for (const [key, offerList] of Object.entries(dealerOfferMap)) {
            for (const word of words) {
                if (word.length > 2 && key.includes(word)) {
                    offers = offerList;
                    console.log(`✅ Found offers by word match: "${key}" for "${name}"`);
                    break;
                }
            }
            if (offers.length > 0) break;
        }
    }
    
    if (offers.length === 0) {
        alert(`❌ No offers found for "${name}"`);
        return;
    }
    
    const correctDealerName = offers[0].dealer;
    console.log(`📛 Using correct dealer name: "${correctDealerName}"`);
    
    let dealer = findDealer(correctDealerName);
    
    if (!dealer || !dealer.phone) {
        const customers = JSON.parse(localStorage.getItem('customers') || '[]');
        const customerMatch = customers.find(c => normalizeText(c.name) === normalizeText(correctDealerName));
        
        if (customerMatch && (customerMatch.mobileNo || customerMatch.phone)) {
            dealer = {
                name: customerMatch.name,
                phone: cleanPhone(customerMatch.mobileNo || customerMatch.phone),
                district: customerMatch.district || '',
                source: 'customer-master'
            };
            console.log(`✅ Found phone from Customer Master: ${dealer.phone}`);
        }
    }
    
    if (!dealer || !dealer.phone) {
        alert(`❌ Phone number not found for "${correctDealerName}"`);
        return;
    }
    
    const msg = generateWhatsAppMessage(correctDealerName, dealer, offers);
    let cleanPhoneNum = dealer.phone;
    
    if (cleanPhoneNum.length === 10) cleanPhoneNum = '91' + cleanPhoneNum;
    if (cleanPhoneNum.length === 11 && cleanPhoneNum.startsWith('0')) cleanPhoneNum = '91' + cleanPhoneNum.substring(1);
    
    const url = `whatsapp://send?phone=${cleanPhoneNum}&text=${encodeURIComponent(msg)}`;
    window.location.href = url;
    
    console.log(`✅ WhatsApp opened for "${correctDealerName}" (${cleanPhoneNum}) | Offers: ${offers.length}`);
}

// =========================
// GENERATE BROCHURE HTML (WITH DESCRIPTION)
// =========================
function generateFullBrochureHTML(name, page = 0, totalPages = 1, rowsPerPage = 14) {
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

    const start = page * rowsPerPage;
    const end = Math.min(start + rowsPerPage, offers.length);
    const pageOffers = offers.slice(start, end);
    
    const hasDistributorStock = offers.some(o => getDisplayStock(o).hasDistributor);
    
    let html = `
    <div style="width:100%;max-width:1000px;background:#fff;padding:8px 12px;font-family:Arial;color:#000;margin:0 auto;page-break-after:${page < totalPages - 1 ? 'always' : 'avoid'};">
    
    <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #facc15;padding-bottom:4px;margin-bottom:5px;">
        <span style="color:#0a7c71;font-size:18px;font-weight:bold;">AUTO SPARES SOLUTION</span>
        <span style="font-size:10px;color:#666;">Page ${page + 1}/${totalPages}</span>
    </div>
    
    <h2 style="font-size:14px;margin:3px 0;color:#1e293b;">${escapeHtml(name)}</h2>
    
    <div style="display:flex;flex-wrap:wrap;gap:10px;font-size:11px;margin-bottom:5px;background:#f8f9fa;padding:4px 8px;border-radius:4px;">
        <span><b>📞 Mobile:</b> ${phone || "Not available"}</span>
        <span><b>📍 District:</b> ${district || "Not specified"}</span>
        <span style="color:#666;font-size:9px;">Showing ${start + 1} - ${end} of ${offers.length} offers</span>
    </div>
    
    <table style="width:100%;border-collapse:collapse;font-size:9px;table-layout:fixed;">
    <colgroup>
        <col style="width:15%;">
        <col style="width:25%;">
        <col style="width:10%;">
        <col style="width:9%;">
        <col style="width:11%;">
        <col style="width:9%;">
        <col style="width:11%;">
        <col style="width:10%;">
    </colgroup>
    <thead>
    <tr style="background:#facc15;">
        <th style="padding:3px 2px;border:1px solid #ccc;text-align:left;font-size:8px;word-wrap:break-word;">Part No</th>
        <th style="padding:3px 2px;border:1px solid #ccc;text-align:left;font-size:8px;word-wrap:break-word;">Description</th>
        <th style="padding:3px 2px;border:1px solid #ccc;text-align:center;font-size:8px;">MRP</th>
        <th style="padding:3px 2px;border:1px solid #ccc;text-align:center;font-size:8px;">Our<br>Stock</th>
        <th style="padding:3px 2px;border:1px solid #ccc;text-align:center;font-size:8px;">Our Price<br><small>incl.GST</small></th>
        <th style="padding:3px 2px;border:1px solid #ccc;text-align:center;font-size:8px;">Dist.<br>Stock</th>
        <th style="padding:3px 2px;border:1px solid #ccc;text-align:center;font-size:8px;">Dist. Price<br><small>MRP</small></th>
        <th style="padding:3px 2px;border:1px solid #ccc;text-align:center;font-size:8px;">Total</th>
    </tr>
    </thead>
    <tbody>`;

    for (const o of pageOffers) {
        const prices = calculatePrices(o);
        const stock = prices.stock;
        const description = getDescription(o.part);
        
        html += `<tr>
            <td style="padding:2px 2px;border:1px solid #ccc;word-wrap:break-word;font-size:8px;"><strong>${escapeHtml(o.part || '')}</strong></td>
            <td style="padding:2px 2px;border:1px solid #ccc;word-wrap:break-word;font-size:8px;color:#333;">${escapeHtml(description || '-')}</td>
            <td style="padding:2px 2px;border:1px solid #ccc;text-align:center;font-size:8px;">₹${prices.ourMRP.toFixed(2)}</td>
            <td style="padding:2px 2px;border:1px solid #ccc;text-align:center;font-size:8px;">${stock.myStock}</td>
            <td style="padding:2px 2px;border:1px solid #ccc;text-align:center;font-size:8px;color:#2563eb;font-weight:bold;">
                ₹${prices.ourOfferPrice.toFixed(2)}
                ${prices.dis > 0 ? `<br><span style="color:#16a34a;font-size:6px;">${prices.dis}% OFF</span>` : ''}
            </td>
            <td style="padding:2px 2px;border:1px solid #ccc;text-align:center;font-size:8px;${stock.distributorStock > 0 ? 'color:#16a34a;' : 'color:#999;'}">
                ${stock.distributorStock || '-'}
            </td>
            <td style="padding:2px 2px;border:1px solid #ccc;text-align:center;font-size:8px;${stock.distributorStock > 0 ? 'color:#16a34a;font-weight:bold;' : 'color:#999;'}">
                ${stock.distributorStock > 0 ? `₹${prices.distOfferPrice.toFixed(2)}` : '-'}
                ${stock.distributorStock > 0 && prices.distMRP > 0 ? `<br><span style="font-size:6px;color:#666;">MRP ₹${prices.distMRP.toFixed(2)}</span>` : ''}
            </td>
            <td style="padding:2px 2px;border:1px solid #ccc;text-align:center;font-size:8px;font-weight:bold;">${stock.totalStock}</td>
        </tr>`;
    }

    html += `</tbody></table>`;
    
    if (hasDistributorStock) {
        html += `<div style="margin-top:4px;padding:3px 6px;background:#fff3cd;border:1px solid #ffc107;border-radius:3px;font-size:8px;color:#856404;">
            ⚠️ <strong>Additional courier charges will apply for distributor stock items.</strong>
        </div>`;
    }
    
    html += `<div style="margin-top:4px;font-size:7px;color:#999;text-align:center;border-top:1px solid #eee;padding-top:3px;">
        ${new Date().toLocaleDateString()} | Auto Spares Solution | ${offers.length} offers total
    </div>`;
    html += `</div>`;
    
    return html;
}

// =========================
// SHOW PREVIEW
// =========================
function showBrochurePreview(name) {
    const offers = getAllDealerOffers(name);
    if (offers.length === 0) {
        alert(`No offers found for "${name}"`);
        return;
    }
    
    const rowsPerPage = 14;
    const totalPages = Math.ceil(offers.length / rowsPerPage);
    
    console.log(`📄 Preview: ${offers.length} offers, ${totalPages} pages`);
    
    let fullHtml = `<!DOCTYPE html>
    <html>
    <head>
        <title>Brochure - ${name}</title>
        <style>
            body { 
                font-family: Arial, sans-serif; 
                margin: 0; 
                padding: 5px; 
                background: #e9ecef; 
            }
            .page { 
                background: white; 
                max-width: 1000px; 
                margin: 5px auto; 
                padding: 8px 12px; 
                box-shadow: 0 2px 6px rgba(0,0,0,0.1); 
                border-radius: 3px; 
            }
            @media print {
                body { background: white; padding: 0; margin: 0; }
                .page { 
                    box-shadow: none; 
                    margin: 0; 
                    border-radius: 0; 
                    page-break-after: always; 
                    max-width: 100%; 
                    padding: 5px 8px; 
                }
            }
            table { 
                width: 100%; 
                border-collapse: collapse; 
                font-size: 8px; 
                table-layout: fixed; 
            }
            th, td { 
                padding: 2px 2px; 
                border: 1px solid #ccc; 
                text-align: center; 
                word-wrap: break-word; 
            }
            th { 
                background: #facc15; 
                font-size: 7px; 
            }
        </style>
    </head>
    <body>
        <div style="text-align:center;padding:6px;background:#f8f9fa;border-bottom:2px solid #facc15;margin-bottom:5px;">
            <span style="font-size:14px;font-weight:bold;color:#0a7c71;">📄 Brochure Preview: ${escapeHtml(name)}</span>
            <br>
            <span style="font-size:11px;color:#666;">${offers.length} offers | ${totalPages} pages | 14 rows per page</span>
        </div>`;
    
    for (let i = 0; i < totalPages; i++) {
        fullHtml += `<div class="page">${generateFullBrochureHTML(name, i, totalPages, rowsPerPage)}</div>`;
    }
    
    fullHtml += `
        <div style="text-align:center;padding:10px;background:#f8f9fa;border-top:2px solid #facc15;margin-top:5px;">
            <button onclick="window.print()" style="background:#0a7c71;color:white;border:none;padding:8px 20px;border-radius:5px;font-size:12px;cursor:pointer;margin:3px;">
                🖨️ Print / Save as PDF
            </button>
            <button onclick="window.close()" style="background:#dc3545;color:white;border:none;padding:8px 20px;border-radius:5px;font-size:12px;cursor:pointer;margin:3px;">
                ❌ Close Preview
            </button>
        </div>
    </body></html>`;
    
    const w = window.open("", "_blank");
    w.document.write(fullHtml);
    w.document.close();
}

// =========================
// DOWNLOAD PDF
// =========================
async function downloadPDF(name) {
    try {
        const offers = getAllDealerOffers(name);
        if (offers.length === 0) {
            alert(`No offers found for "${name}"`);
            return;
        }
        
        const rowsPerPage = 14;
        const totalPages = Math.ceil(offers.length / rowsPerPage);
        
        console.log(`📄 Generating PDF: ${offers.length} offers, ${totalPages} pages`);
        
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pageWidth = 210;
        const pageHeight = 297;
        
        for (let i = 0; i < totalPages; i++) {
            if (i > 0) {
                pdf.addPage();
            }
            
            console.log(`   Page ${i + 1}: Offers ${(i * rowsPerPage) + 1} to ${Math.min((i + 1) * rowsPerPage, offers.length)}`);
            
            const div = document.createElement("div");
            div.innerHTML = generateFullBrochureHTML(name, i, totalPages, rowsPerPage);
            div.style.position = "fixed";
            div.style.left = "-9999px";
            div.style.top = "0";
            div.style.width = "1000px";
            div.style.background = "#fff";
            div.style.padding = "0px";
            div.style.margin = "0px";
            document.body.appendChild(div);
            
            await new Promise(r => setTimeout(r, 300));
            
            const canvas = await html2canvas(div, { 
                scale: 2.5, 
                useCORS: true,
                width: 1000,
                height: div.scrollHeight,
                backgroundColor: '#ffffff'
            });
            
            document.body.removeChild(div);
            
            const imgData = canvas.toDataURL('image/png');
            
            const imgWidth = pageWidth;
            const imgHeight = (canvas.height / canvas.width) * imgWidth;
            
            let finalWidth = imgWidth;
            let finalHeight = imgHeight;
            if (imgHeight > pageHeight) {
                const scale = pageHeight / imgHeight;
                finalWidth *= scale;
                finalHeight *= scale;
            }
            
            const x = (pageWidth - finalWidth) / 2;
            const y = 0;
            
            pdf.addImage(imgData, 'PNG', x, y, finalWidth, finalHeight);
        }
        
        pdf.save(`${name.replace(/[^a-z0-9]/gi, '_')}_brochure.pdf`);
        console.log(`✅ PDF saved: ${totalPages} pages, ${offers.length} offers`);
        
    } catch (err) {
        console.error("PDF Error:", err);
        alert("PDF generation failed: " + err.message);
    }
}

// =========================
// DOWNLOAD SINGLE PDF
// =========================
async function downloadSinglePDF(name) {
    await downloadPDF(name);
}

// =========================
// DOWNLOAD ALL FLYERS PDF
// =========================
async function downloadAllFlyersPDF() {
    try {
        const dealers = await getDealersWithOffers();
        if (dealers.length === 0) {
            alert('No flyers found. Run Analysis first.');
            return;
        }
        
        let count = 0;
        for (const d of dealers) {
            await downloadPDF(d.name);
            await new Promise(r => setTimeout(r, 500));
            count++;
        }
        alert(`✅ Downloaded ${count} PDF files`);
    } catch(err) {
        console.error(err);
        alert('Error downloading PDFs: ' + err.message);
    }
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
    const data = offers.map(o => {
        const prices = calculatePrices(o);
        const description = getDescription(o.part);
        return {
            "Part No": o.part,
            "Description": description || '',
            "MRP": prices.ourMRP.toFixed(2),
            "Our Stock": prices.stock.myStock,
            "Our Price (incl. GST)": prices.ourOfferPrice.toFixed(2),
            "Discount %": prices.dis,
            "Dist. Stock": prices.stock.distributorStock,
            "Dist. Price (MRP)": prices.distOfferPrice.toFixed(2),
            "Total Stock": prices.stock.totalStock,
            "Courier Charges": prices.stock.hasDistributor ? "Applicable" : "N/A"
        };
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Offers");
    XLSX.writeFile(wb, `${name.replace(/[^a-z0-9]/gi, '_')}_offers.xlsx`);
}

// =========================
// SHARE PDF TO WHATSAPP
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
        
        await downloadPDF(name);
        
        const offers = getAllDealerOffers(name);
        const hasDistStock = offers.some(o => getDisplayStock(o).hasDistributor);
        let extraMsg = "";
        if (hasDistStock) {
            extraMsg = "\n\n⚠️ Additional courier charges will apply for distributor stock items.";
        }
        
        const msg = `📄 *Your Special Offer Brochure*\n\nDear ${name},\n\nPlease find your personalized offer brochure attached as PDF.${extraMsg}\n\nThank you for your business!\n\nAuto Spares Solution`;
        let cleanPhoneNum = phone;
        if (cleanPhoneNum.length === 10) cleanPhoneNum = '91' + cleanPhoneNum;
        
        const url = `whatsapp://send?phone=${cleanPhoneNum}&text=${encodeURIComponent(msg)}`;
        window.location.href = url;
        
    } catch (err) {
        console.error(err);
        alert("Failed: " + err.message);
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
    await loadMyStock(); // UPDATED: Loads descriptions too
    await loadDistributorStock();
    loadOffers();
    console.log(`🚀 SYSTEM READY`);
    console.log(`   📊 Offers: ${currentOffers.length}`);
    console.log(`   📞 Dealers: ${dealerMaster.length}`);
    console.log(`   🏭 Distributor Stock: ${distributorStock.length} items`);
    console.log(`   📝 Descriptions loaded: ${partDescriptions.size}`);
}

// =========================
// GLOBAL API
// =========================
window.BrochureGenerator = {
    init,
    loadDealerMaster,
    loadOffers,
    loadDistributorStock,
    loadMyStock,
    getAllDealerOffers,
    getDealersWithOffers,
    findDealer,
    generateFullBrochureHTML,
    showBrochurePreview,
    sendFlyerToWhatsApp,
    exportDealerOffersToExcel,
    downloadPDF,
    downloadSinglePDF,
    downloadAllFlyersPDF,
    sharePDFToWhatsApp,
    getDistributorStock: () => distributorStock,
    getDistributorInfo: getDistributorInfo,
    getDescription: getDescription,
    partDescriptions: partDescriptions
};

// Auto-init
init();

})();
