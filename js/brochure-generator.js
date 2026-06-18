(function () {

console.log("🚀 Brochure System Loaded (FIXED: Priority Matching for WhatsApp)");

// =========================
// DATA
// =========================
let dealerMaster = [];
let currentOffers = [];
let dealerOfferMap = {};
let distributorStock = [];
let currentStock = new Map();
let partDescriptions = new Map();

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
// LOAD MY STOCK
// =========================
async function loadMyStock() {

    try {

        const response = await fetch('prices.csv');

        const csvText = await response.text();

        const lines = csvText.split('\n');
        
        currentStock.clear();
        partDescriptions.clear();

        let skippedHeader = false;
        let loadedCount = 0;
        let descCount = 0;

        for (const line of lines) {
            if (!line.trim()) continue;
            
            const cols = line.split(',');
            
            if (!skippedHeader && cols[0] && 
                (cols[0].toLowerCase().includes('material') || 
                 cols[0].toLowerCase().includes('part'))) {
                skippedHeader = true;
                continue;
            }
            
            const part = cols[0]?.trim() || '';
            if (!part) continue;

            let stock = 0;
            if (cols[7] && cols[7].trim() !== '' && cols[7].trim() !== 'NaN') {
                stock = parseInt(cols[7].trim()) || 0;
            }
            
            let price = 0;
            if (cols[3] && cols[3].trim() !== '' && cols[3].trim() !== 'NaN') {
                price = parseFloat(cols[3].trim()) || 0;
            }
            
            const description = cols[1] ? cols[1].trim() : '';

            currentStock.set(part, {
                stock: stock,
                price: price,
                description: description
            });
            loadedCount++;
            
            if (description) {
                partDescriptions.set(part, description);
                descCount++;
            }
        }

        console.log(`✅ My stock loaded: ${loadedCount} parts`);
        console.log(`📝 Descriptions loaded: ${descCount}`);

    } catch (err) {

        console.error("Error loading prices.csv:", err);
    }
}

// =========================
// GET DESCRIPTION
// =========================
function getDescription(part) {
    if (partDescriptions.has(part)) {
        return partDescriptions.get(part);
    }
    const stockData = currentStock.get(part);
    if (stockData && stockData.description) {
        return stockData.description;
    }
    return '';
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
    console.log(`📊 Dealer keys in map:`, Object.keys(dealerOfferMap).slice(0, 10));
}

// =========================
// GET OFFERS (FIXED: Priority-based matching)
// =========================
function getAllDealerOffers(name) {
    const normalized = normalizeText(name);
    
    console.log(`🔍 Searching offers for: "${name}" (normalized: "${normalized}")`);
    
    // STRATEGY 1: EXACT MATCH (HIGHEST PRIORITY)
    if (dealerOfferMap[normalized]) {
        console.log(`✅ Exact match found for: "${name}"`);
        return dealerOfferMap[normalized];
    }
    
    // STRATEGY 2: CASE-INSENSITIVE EXACT MATCH (check if any key equals normalized)
    for (const [key, offers] of Object.entries(dealerOfferMap)) {
        if (key === normalized) {
            console.log(`✅ Case-insensitive exact match: "${key}" for "${name}"`);
            return offers;
        }
    }
    
    // STRATEGY 3: CONTAINS MATCH (key contains the full normalized name)
    for (const [key, offers] of Object.entries(dealerOfferMap)) {
        if (key.includes(normalized)) {
            console.log(`✅ Contains match: "${key}" contains "${normalized}"`);
            return offers;
        }
    }
    
    // STRATEGY 4: REVERSE CONTAINS (normalized contains the key - for partial names)
    for (const [key, offers] of Object.entries(dealerOfferMap)) {
        if (normalized.includes(key) && key.length > 3) {
            console.log(`✅ Reverse contains match: "${normalized}" contains "${key}"`);
            return offers;
        }
    }
    
    // STRATEGY 5: WORD MATCH (only if all previous fail - LOWEST PRIORITY)
    // But ensure we match the MOST words, not the first match
    const words = normalized.split(' ');
    let bestMatch = null;
    let bestScore = 0;
    
    for (const [key, offers] of Object.entries(dealerOfferMap)) {
        let score = 0;
        for (const word of words) {
            if (word.length > 2 && key.includes(word)) {
                score++;
            }
        }
        if (score > bestScore) {
            bestScore = score;
            bestMatch = { key, offers };
        }
    }
    
    if (bestMatch && bestScore > 0) {
        console.log(`✅ Word match found: "${bestMatch.key}" with score ${bestScore} for "${name}"`);
        return bestMatch.offers;
    }
    
    console.log(`❌ No offers found for: "${name}"`);
    console.log(`   Available keys:`, Object.keys(dealerOfferMap).slice(0, 5));
    return [];
}

// =========================
// FIND DEALER (FIXED: Priority-based matching)
// =========================
function findDealer(name) {
    const normalized = normalizeText(name);
    
    // STRATEGY 1: EXACT MATCH
    let dealer = dealerMaster.find(d => normalizeText(d.name) === normalized);
    if (dealer) return dealer;
    
    // STRATEGY 2: CONTAINS MATCH
    dealer = dealerMaster.find(d => normalizeText(d.name).includes(normalized));
    if (dealer) return dealer;
    
    // STRATEGY 3: REVERSE CONTAINS
    dealer = dealerMaster.find(d => normalized.includes(normalizeText(d.name)) && normalizeText(d.name).length > 3);
    if (dealer) return dealer;
    
    // STRATEGY 4: WORD MATCH (with best score)
    const words = normalized.split(' ');
    let bestMatch = null;
    let bestScore = 0;
    
    for (const d of dealerMaster) {
        const normName = normalizeText(d.name);
        let score = 0;
        for (const word of words) {
            if (word.length > 2 && normName.includes(word)) {
                score++;
            }
        }
        if (score > bestScore) {
            bestScore = score;
            bestMatch = d;
        }
    }
    
    if (bestMatch && bestScore > 0) {
        console.log(`✅ Dealer found by word match: "${bestMatch.name}" for "${name}"`);
        return bestMatch;
    }
    
    console.log(`❌ No dealer found for: "${name}"`);
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
        const offerType = o.offerType || '';
        const expiryDate = o.expiresAt ? new Date(o.expiresAt).toLocaleDateString() : '';
        
        msg += `🔹 *${o.part}*`;
        if (desc) msg += ` - ${desc}`;
        msg += `\n`;
        if (offerType) msg += `   🏷️ ${offerType}\n`;
        msg += `   💰 Offer Price: ₹${prices.ourOfferPrice.toFixed(2)}\n`;
        if (prices.dis > 0) msg += `   ✨ ${prices.dis}% OFF\n`;
        msg += `   📦 Our Stock: ${stock.myStock} units\n`;
        if (stock.distributorStock > 0) {
            hasDistributorStock = true;
            msg += `   🏭 Dist. Stock: ${stock.distributorStock} units @ ₹${prices.distOfferPrice.toFixed(2)}/unit (MRP)\n`;
        }
        msg += `   📊 Total Stock: ${stock.totalStock} units\n`;
        if (expiryDate) msg += `   ⏰ Valid till: ${expiryDate}\n`;
        msg += `\n`;
    }

    if (offers.length > 8) {
        msg += `*And ${offers.length - 8} more offers...*\n\n`;
    }

    msg += `━━━━━━━━━━━━━━━━━━━━\n`;
    if (dealer?.district) msg += `📍 District: ${dealer.district}\n`;
    if (hasDistributorStock) {
        msg += `\n⚠️ *Additional courier charges apply for distributor stock items.*\n`;
    }
    msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;
    msg += `_Reply with part numbers and quantity_\n`;
    msg += `*Thank you for your business!*`;
    
    return msg;
}

// =========================
// SEND WHATSAPP (FIXED)
// =========================
function sendFlyerToWhatsApp(name) {
    console.log(`🔍 Looking for offers for: "${name}"`);
    
    // Get offers using the priority matching
    let offers = getAllDealerOffers(name);
    
    if (offers.length === 0) {
        alert(`❌ No offers found for "${name}"

Please run Analysis first.`);
        return;
    }
    
    // IMPORTANT: Use the EXACT dealer name from the offer
    const correctDealerName = offers[0].dealer;
    console.log(`📛 Using correct dealer name: "${correctDealerName}" (was: "${name}")`);
    
    // Find dealer using priority matching
    let dealer = findDealer(correctDealerName);
    
    // If not found, try to find by direct match in Customer Master
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
        alert(`❌ Phone number not found for "${correctDealerName}"

Please add mobile number in Customer Master.`);
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
// GENERATE BROCHURE HTML
// =========================
function generateFullBrochureHTML(name, page = 0, totalPages = 1, rowsPerPage = 12) {
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
    <div style="width:100%;max-width:1000px;background:#fff;padding:6px 8px;font-family:Arial;color:#000;margin:0 auto;page-break-after:${page < totalPages - 1 ? 'always' : 'avoid'};">
    
    <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #facc15;padding-bottom:3px;margin-bottom:4px;">
        <span style="color:#0a7c71;font-size:16px;font-weight:bold;">AUTO SPARES SOLUTION</span>
        <span style="font-size:9px;color:#666;">Page ${page + 1}/${totalPages}</span>
    </div>
    
    <h2 style="font-size:13px;margin:2px 0;color:#1e293b;">${escapeHtml(name)}</h2>
    
    <div style="display:flex;flex-wrap:wrap;gap:6px;font-size:9px;margin-bottom:3px;background:#f8f9fa;padding:2px 6px;border-radius:3px;">
        <span><b>📞 Mobile:</b> ${phone || "Not available"}</span>
        <span><b>📍 District:</b> ${district || "Not specified"}</span>
        <span style="color:#666;font-size:7px;">${start+1}-${end} of ${offers.length}</span>
    </div>
    
    <table style="width:100%;border-collapse:collapse;font-size:7px;table-layout:fixed;">
    <colgroup>
        <col style="width:12%;"><col style="width:20%;"><col style="width:8%;"><col style="width:8%;">
        <col style="width:9%;"><col style="width:9%;"><col style="width:9%;"><col style="width:9%;">
        <col style="width:9%;"><col style="width:7%;">
    </colgroup>
    <thead>
    <tr style="background:#facc15;">
        <th style="padding:2px 1px;border:1px solid #ccc;text-align:left;font-size:6px;word-wrap:break-word;">Part</th>
        <th style="padding:2px 1px;border:1px solid #ccc;text-align:left;font-size:6px;word-wrap:break-word;">Description</th>
        <th style="padding:2px 1px;border:1px solid #ccc;text-align:center;font-size:6px;">MRP</th>
        <th style="padding:2px 1px;border:1px solid #ccc;text-align:center;font-size:6px;">Disc</th>
        <th style="padding:2px 1px;border:1px solid #ccc;text-align:center;font-size:6px;">Price</th>
        <th style="padding:2px 1px;border:1px solid #ccc;text-align:center;font-size:6px;">Our</th>
        <th style="padding:2px 1px;border:1px solid #ccc;text-align:center;font-size:6px;">Dist</th>
        <th style="padding:2px 1px;border:1px solid #ccc;text-align:center;font-size:6px;">Total</th>
        <th style="padding:2px 1px;border:1px solid #ccc;text-align:center;font-size:5px;word-wrap:break-word;">Type</th>
        <th style="padding:2px 1px;border:1px solid #ccc;text-align:center;font-size:5px;word-wrap:break-word;">Expiry</th>
    </tr>
    </thead>
    <tbody>`;

    for (const o of pageOffers) {
        const prices = calculatePrices(o);
        const stock = prices.stock;
        const description = getDescription(o.part);
        const offerType = o.offerType || '';
        const expiryDate = o.expiresAt ? new Date(o.expiresAt).toLocaleDateString() : '-';
        
        html += `<tr>
            <td style="padding:1px 1px;border:1px solid #ccc;word-wrap:break-word;font-size:6px;"><strong>${escapeHtml(o.part || '')}</strong></td>
            <td style="padding:1px 1px;border:1px solid #ccc;word-wrap:break-word;font-size:6px;color:#333;">${escapeHtml(description || '-')}</td>
            <td style="padding:1px 1px;border:1px solid #ccc;text-align:center;font-size:6px;">${prices.ourMRP.toFixed(0)}</td>
            <td style="padding:1px 1px;border:1px solid #ccc;text-align:center;font-size:6px;color:#16a34a;">${prices.dis}%</td>
            <td style="padding:1px 1px;border:1px solid #ccc;text-align:center;font-size:6px;color:#2563eb;font-weight:bold;">${prices.ourOfferPrice.toFixed(0)}</td>
            <td style="padding:1px 1px;border:1px solid #ccc;text-align:center;font-size:6px;">${stock.myStock}</td>
            <td style="padding:1px 1px;border:1px solid #ccc;text-align:center;font-size:6px;${stock.distributorStock > 0 ? 'color:#16a34a;' : 'color:#999;'}">${stock.distributorStock || '-'}</td>
            <td style="padding:1px 1px;border:1px solid #ccc;text-align:center;font-size:6px;font-weight:bold;">${stock.totalStock}</td>
            <td style="padding:1px 1px;border:1px solid #ccc;text-align:center;font-size:5px;word-wrap:break-word;">${offerType.replace(/[⭐🔥🏭📄📋]/g,'').trim() || '-'}</td>
            <td style="padding:1px 1px;border:1px solid #ccc;text-align:center;font-size:5px;${expiryDate !== '-' ? 'color:#dc3545;' : ''}">${expiryDate}</td>
        </tr>`;
    }

    html += `</tbody></table>`;
    
    if (hasDistributorStock) {
        html += `<div style="margin-top:2px;padding:2px 4px;background:#fff3cd;border:1px solid #ffc107;border-radius:2px;font-size:6px;color:#856404;">
            ⚠️ Courier charges apply for distributor stock.
        </div>`;
    }
    
    html += `<div style="margin-top:2px;font-size:5px;color:#999;text-align:center;border-top:1px solid #eee;padding-top:2px;">
        ${new Date().toLocaleDateString()} | ${offers.length} offers | Valid 15 days
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
    
    const rowsPerPage = 12;
    const totalPages = Math.ceil(offers.length / rowsPerPage);
    
    let fullHtml = `<!DOCTYPE html>
    <html>
    <head><title>Brochure - ${name}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 4px; background: #e9ecef; }
        .page { background: white; max-width: 1000px; margin: 4px auto; padding: 4px 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); border-radius: 2px; }
        @media print {
            body { background: white; padding: 0; margin: 0; }
            .page { box-shadow: none; margin: 0; border-radius: 0; page-break-after: always; max-width: 100%; padding: 3px 4px; }
        }
        table { width: 100%; border-collapse: collapse; font-size: 6px; table-layout: fixed; }
        th, td { padding: 1px 1px; border: 1px solid #ccc; text-align: center; word-wrap: break-word; }
        th { background: #facc15; font-size: 5px; }
    </style>
    </head>
    <body>
        <div style="text-align:center;padding:3px;background:#f8f9fa;border-bottom:2px solid #facc15;margin-bottom:3px;">
            <span style="font-size:13px;font-weight:bold;color:#0a7c71;">📄 Brochure: ${escapeHtml(name)}</span>
            <br><span style="font-size:9px;color:#666;">${offers.length} offers | ${totalPages} pages</span>
        </div>`;
    
    for (let i = 0; i < totalPages; i++) {
        fullHtml += `<div class="page">${generateFullBrochureHTML(name, i, totalPages, rowsPerPage)}</div>`;
    }
    
    fullHtml += `
        <div style="text-align:center;padding:6px;background:#f8f9fa;border-top:2px solid #facc15;margin-top:3px;">
            <button onclick="window.print()" style="background:#0a7c71;color:white;border:none;padding:4px 12px;border-radius:3px;font-size:10px;cursor:pointer;margin:2px;">🖨️ Print</button>
            <button onclick="window.close()" style="background:#dc3545;color:white;border:none;padding:4px 12px;border-radius:3px;font-size:10px;cursor:pointer;margin:2px;">❌ Close</button>
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
        
        const rowsPerPage = 12;
        const totalPages = Math.ceil(offers.length / rowsPerPage);
        
        console.log(`📄 Generating PDF: ${offers.length} offers, ${totalPages} pages`);
        
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pageWidth = 210;
        const pageHeight = 297;
        
        for (let i = 0; i < totalPages; i++) {
            if (i > 0) pdf.addPage();
            
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
            "Discount %": prices.dis,
            "Offer Price": prices.ourOfferPrice.toFixed(2),
            "Our Stock": prices.stock.myStock,
            "Dist. Stock": prices.stock.distributorStock,
            "Total Stock": prices.stock.totalStock,
            "Offer Type": o.offerType || '',
            "Expires": o.expiresAt ? new Date(o.expiresAt).toLocaleDateString() : ''
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
        
        const msg = `📄 *Your Special Offer Brochure*\n\nDear ${name},\n\nPlease find your personalized offer brochure attached as PDF.\n\nThank you for your business!\n\nAuto Spares Solution`;
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
// GET DEALERS WITH OFFERS (FIXED: Only exact matches)
// =========================
async function getDealersWithOffers() {
    await loadDealerMaster();
    loadOffers();
    const result = [];
    const processed = new Set();
    
    // Use the dealerOfferMap keys directly
    for (const [key, offers] of Object.entries(dealerOfferMap)) {
        if (offers.length > 0 && !processed.has(key)) {
            processed.add(key);
            
            // Find dealer info using the exact key
            let dealer = null;
            for (const d of dealerMaster) {
                if (normalizeText(d.name) === key) {
                    dealer = d;
                    break;
                }
            }
            
            // If not found in master, use the offer's dealer name
            const dealerName = offers[0].dealer || key;
            
            result.push({
                name: dealerName,
                phone: dealer?.phone || '',
                district: dealer?.district || '',
                offerCount: offers.length,
                hasPhone: !!dealer?.phone
            });
        }
    }
    
    console.log(`✅ Dealers with offers: ${result.length}`);
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
    await loadMyStock();
    await loadDistributorStock();
    loadOffers();
    console.log(`🚀 SYSTEM READY`);
    console.log(`   📊 Offers: ${currentOffers.length}`);
    console.log(`   📞 Dealers: ${dealerMaster.length}`);
    console.log(`   🏭 Distributor Stock: ${distributorStock.length} items`);
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
