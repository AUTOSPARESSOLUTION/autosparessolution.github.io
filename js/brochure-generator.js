// brochure-generator.js - COMPLETE FIXED VERSION
// FIXED: Part matching with leading zeros, Dist MRP, Uppercase dealer names
// FIXED: WhatsApp opens with personal WhatsApp using whatsapp:// protocol
// FIXED: Net Price shows MRP when Our Stock=0 but Distributor Stock available
// FIXED: Dealer matching improved to avoid wrong dealer
// FIXED: Application column uses Model from prices.csv
// FIXED: dealerOfferMap properly initialized and populated
// ADDED: Pagination/Navigation for ALL dealers

(function () {

console.log("🚀 Brochure Generator loading...");

// ===================================================
// DEPENDENCIES CHECK
// ===================================================

if (typeof XLSX === 'undefined') {
    console.warn("⚠️ XLSX library not loaded. Excel export will not work.");
}

if (typeof jspdf === 'undefined' && typeof window.jspdf === 'undefined') {
    console.warn("⚠️ jsPDF library not loaded. PDF export will not work.");
}

// ===================================================
// UTILITIES (Fallback if Utils not loaded)
// ===================================================

const Utils = window.Utils || {
    normalizeText: function(t) { 
        return String(t || '').replace(/\s+/g, ' ').trim().toUpperCase(); 
    },
    normalizeDealerName: function(t) { 
        return String(t || '').replace(/\s+/g, ' ').trim().toUpperCase(); 
    },
    showToast: function(msg, type) { 
        console.log(`[${type || 'info'}] ${msg}`);
        const container = document.getElementById('toast-container');
        if (container) {
            const toast = document.createElement('div');
            toast.style.cssText = `
                background: ${type === 'error' ? '#dc2626' : type === 'success' ? '#16a34a' : '#2563eb'};
                color: white;
                padding: 12px 20px;
                border-radius: 8px;
                font-family: Arial, sans-serif;
                font-size: 14px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                animation: slideIn 0.3s ease;
                word-wrap: break-word;
            `;
            toast.textContent = msg;
            container.appendChild(toast);
            setTimeout(() => {
                toast.style.animation = 'slideOut 0.3s ease';
                setTimeout(() => toast.remove(), 300);
            }, 4000);
        }
    },
    safeNumber: function(n) { return Number(n) || 0; },
    escapeHtml: function(s) { return String(s).replace(/[&<>"]/g, function(m) {
        return m === '&' ? '&amp;' : m === '<' ? '&lt;' : m === '>' ? '&gt;' : '&quot;';
    }); },
    getStorageItem: function(k) { 
        try { return JSON.parse(localStorage.getItem(k)); } catch(e) { return null; }
    },
    formatDate: function(d) { 
        try { return new Date(d).toLocaleDateString(); } catch(e) { return ''; }
    },
    formatPhoneForWhatsApp: function(p) {
        let cleaned = String(p || '').replace(/\D/g, '');
        if (!cleaned) return '';
        if (cleaned.length === 10) return '91' + cleaned;
        if (cleaned.length === 11 && cleaned.startsWith('0')) return '91' + cleaned.substring(1);
        if (cleaned.length === 12 && cleaned.startsWith('91')) return cleaned;
        return cleaned;
    }
};

const normalizeText = Utils.normalizeText;
const normalizeDealerName = Utils.normalizeDealerName;
const showToast = Utils.showToast;
const safeNumber = Utils.safeNumber;
const escapeHtml = Utils.escapeHtml;
const getStorageItem = Utils.getStorageItem;
const formatDate = Utils.formatDate;
const formatPhoneForWhatsApp = Utils.formatPhoneForWhatsApp;

// ===================================================
// DATA
// ===================================================
let dealerMaster = [];
let dealerMasterMap = new Map();
let currentOffers = [];
let dealerOfferMap = {};  // FIXED: Always initialize as empty object
let distributorStock = [];
let distributorStockMap = new Map();
let currentStock = new Map();
let partDescriptions = new Map();
let partApplications = new Map();
let excelCache = new Map();
let isInitialized = false;

// ===================================================
// HELPER: Clean Part Number with Leading Zeros
// ===================================================

function cleanPartNumber(part) {
    if (!part) return '';
    let cleaned = String(part).trim().toUpperCase();
    let matchPart = cleaned.replace(/^0+/, '');
    return {
        original: cleaned,
        matchKey: matchPart || cleaned,
        hasLeadingZeros: cleaned.match(/^0+/) !== null
    };
}

function findPartMatch(partNumber) {
    const clean = cleanPartNumber(partNumber);
    
    // Try exact match first
    if (currentStock.has(clean.original)) {
        return currentStock.get(clean.original);
    }
    
    // Try match without leading zeros
    if (clean.hasLeadingZeros) {
        for (const [key, value] of currentStock) {
            const keyClean = cleanPartNumber(key);
            if (keyClean.matchKey === clean.matchKey) {
                console.log(`✅ Matched part "${partNumber}" to "${key}" (ignoring leading zeros)`);
                return value;
            }
        }
    }
    
    return null;
}

// ===================================================
// LOAD EXCEL (CACHED)
// ===================================================
async function loadExcelFile(url, sheetName = null) {

    const cacheKey = url + (sheetName || '');
    if (excelCache.has(cacheKey)) {
        return excelCache.get(cacheKey);
    }

    try {

        const res = await fetch(url);
        if (!res.ok) throw new Error("File not found: " + url);

        const buf = await res.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });

        const sheet = sheetName && wb.SheetNames.includes(sheetName)
            ? wb.Sheets[sheetName]
            : wb.Sheets[wb.SheetNames[0]];

        const data = XLSX.utils.sheet_to_json(sheet);
        excelCache.set(cacheKey, data);
        return data;

    } catch (err) {

        console.error("Excel Load Error:", err.message);
        return [];
    }
}

// ===================================================
// LOAD DEALER MASTER - FIXED: All names UPPERCASE
// ===================================================
async function loadDealerMaster() {
    console.log("🔄 Loading Dealer Master...");
    
    const masterMap = new Map();
    
    try {
        const customers = getStorageItem('customers') || [];
        console.log(`📋 Customer Master: ${customers.length} customers`);
        
        for (const c of customers) {
            const name = c.name || '';
            if (!name) continue;
            
            const normName = normalizeDealerName(name);
            const phone = c.mobileNo || c.phone || '';
            const district = c.district || '';
            
            masterMap.set(normName, {
                name: name.toUpperCase(),
                normalized: normName,
                phone: phone.replace(/\D/g, ''),
                district: district,
                source: 'customer-master'
            });
        }
    } catch(e) {
        console.warn("Error loading customers:", e);
    }
    
    try {
        // FIXED: Correct file name
        const rows = await loadExcelFile("./data/RETAILER data Deatils.xlsx");
        console.log(`📋 Excel Master: ${rows.length} entries`);
        
        for (const row of rows) {
            const name = row["Retailer Name"] || row["Customer Name"] || row["Dealer Name"] || row["Name"] || "";
            if (!name) continue;
            
            const normName = normalizeDealerName(name);
            const phone = row["Mobile No"] || row["Mobile Number"] || row["Phone"] || "";
            const district = row["District"] || row["District Name"] || row["PLACE"] || row["Location"] || "";
            
            if (!masterMap.has(normName)) {
                masterMap.set(normName, {
                    name: name.toUpperCase(),
                    normalized: normName,
                    phone: phone.replace(/\D/g, ''),
                    district: district,
                    source: 'excel'
                });
            } else {
                const existing = masterMap.get(normName);
                if (!existing.phone && phone) existing.phone = phone.replace(/\D/g, '');
                if (!existing.district && district) existing.district = district;
            }
        }
    } catch(e) {
        console.warn("Excel master file not found", e);
    }
    
    try {
        const users = getStorageItem('users') || [];
        const dealers = getStorageItem('dealers') || [];
        const allLocal = [...users, ...dealers];
        
        for (const u of allLocal) {
            const name = u.name || u.business || '';
            if (!name) continue;
            
            const normName = normalizeDealerName(name);
            const phone = u.phone || u.mobile || u.mobileNo || '';
            const district = u.district || '';
            
            if (!masterMap.has(normName)) {
                masterMap.set(normName, {
                    name: name.toUpperCase(),
                    normalized: normName,
                    phone: phone.replace(/\D/g, ''),
                    district: district,
                    source: 'user-dealer'
                });
            } else {
                const existing = masterMap.get(normName);
                if (!existing.phone && phone) existing.phone = phone.replace(/\D/g, '');
                if (!existing.district && district) existing.district = district;
            }
        }
    } catch(e) {
        console.warn("Error loading users/dealers:", e);
    }
    
    try {
        const allInvoices = getStorageItem('allInvoices') || [];
        for (const inv of allInvoices) {
            let name = inv.customerName || inv.buyer?.name || '';
            if (!name) continue;
            
            const normName = normalizeDealerName(name);
            let phone = inv.customerPhone || inv.buyer?.phone || inv.phone || '';
            let district = inv.customerDistrict || inv.buyer?.district || inv.district || '';
            
            if (!masterMap.has(normName)) {
                masterMap.set(normName, {
                    name: name.toUpperCase(),
                    normalized: normName,
                    phone: phone.replace(/\D/g, ''),
                    district: district,
                    source: 'invoice'
                });
            } else {
                const existing = masterMap.get(normName);
                if (!existing.phone && phone) existing.phone = phone.replace(/\D/g, '');
                if (!existing.district && district) existing.district = district;
            }
        }
    } catch(e) {
        console.warn("Error loading invoices:", e);
    }
    
    dealerMaster = Array.from(masterMap.values());
    dealerMasterMap = masterMap;
    
    const withPhone = dealerMaster.filter(d => d.phone).length;
    const withDistrict = dealerMaster.filter(d => d.district).length;
    
    console.log(`✅ Dealer Master: ${dealerMaster.length} dealers`);
    console.log(`   📞 Has Phone: ${withPhone} | 📍 Has District: ${withDistrict}`);
    
    return dealerMaster;
}

// ===================================================
// LOAD DISTRIBUTOR STOCK
// ===================================================
async function loadDistributorStock() {
    console.log("🔄 Loading Distributor Stock...");
    
    try {
        const localStock = getStorageItem('distributorStock');
        if (localStock && localStock.length > 0) {
            distributorStock = localStock;
            distributorStockMap.clear();
            distributorStock.forEach(item => {
                distributorStockMap.set(normalizeText(item.part), item);
            });
            console.log(`✅ Distributor stock: ${distributorStock.length} items`);
            return distributorStock;
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
                part: normalizeText(row['Part No'] || row['part_no'] || row['PartNumber'] || ''),
                distributor: row['Distributor Name'] || 'Auto Links',
                stock: stockQty,
                price: Number(row['Price'] || row['price'] || 0),
                leadTime: Number(row['Lead Time (Days)'] || 3)
            };
        }).filter(item => item.part && item.stock > 0);
        
        distributorStockMap.clear();
        distributorStock.forEach(item => {
            distributorStockMap.set(item.part, item);
        });
        
        console.log(`✅ Distributor stock: ${distributorStock.length} items`);
        
    } catch (err) {
        console.warn("Could not load distributor stock:", err);
        distributorStock = [];
        distributorStockMap.clear();
    }
    return distributorStock;
}

// ===================================================
// LOAD MY STOCK (FROM prices.csv)
// ===================================================
async function loadMyStock() {
    console.log("🔄 Loading stock from prices.csv...");

    try {

        const response = await fetch('prices.csv');
        if (!response.ok) {
            throw new Error(`Failed to fetch prices.csv: ${response.status}`);
        }
        
        const csvText = await response.text();
        console.log(`📄 prices.csv loaded: ${csvText.length} characters`);
        
        let rows;
        if (typeof Papa !== 'undefined') {
            const result = Papa.parse(csvText, {
                header: true,
                skipEmptyLines: true,
                trimHeaders: true
            });
            rows = result.data;
            console.log(`📊 PapaParse loaded ${rows.length} rows`);
        } else {
            console.warn("PapaParse not found, using XLSX fallback");
            const workbook = XLSX.read(csvText, { type: 'string' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const data = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
            const headers = data[0] || [];
            rows = data.slice(1).map(row => {
                const obj = {};
                headers.forEach((h, i) => {
                    obj[h] = row[i] || '';
                });
                return obj;
            });
        }
        
        currentStock.clear();
        partDescriptions.clear();
        partApplications.clear();

        const headers = Object.keys(rows[0] || {});
        console.log('📋 Available columns in prices.csv:', headers);
        
        // Column detection
        const partCol = headers.find(h => h.toLowerCase() === 'material' || h.toLowerCase().includes('material') || h.toLowerCase().includes('part'));
        const descCol = headers.find(h => h.toLowerCase() === 'material2' || h.toLowerCase().includes('description') || h.toLowerCase().includes('desc'));
        // FIX: Application from Model column
        const appCol = headers.find(h => h.toLowerCase() === 'model' || h.toLowerCase().includes('model'));
        const mrpCol = headers.find(h => h.toLowerCase() === 'mrp price' || h.toLowerCase().includes('mrp price') || h.toLowerCase().includes('mrp'));
        const stockCol = headers.find(h => h.toLowerCase().includes('stock') || h.toLowerCase().includes('qty'));

        let loadedCount = 0;
        for (const row of rows) {
            if (!row || !row[partCol]) continue;

            const part = String(row[partCol] || '').trim().toUpperCase();
            if (!part) continue;

            const stock = Number(row[stockCol]) || 0;
            const mrp = Number(row[mrpCol]) || 0;
            const description = row[descCol] ? String(row[descCol]).trim() : '';
            const application = row[appCol] ? String(row[appCol]).trim() : '';

            currentStock.set(part, {
                stock,
                mrp,
                description,
                application
            });
            
            if (description) partDescriptions.set(part, description);
            if (application) partApplications.set(part, application);
            loadedCount++;
        }

        console.log(`✅ My stock: ${loadedCount} parts loaded from prices.csv`);
        console.log(`   📝 Descriptions: ${partDescriptions.size}, Applications: ${partApplications.size}`);
        console.log(`   💰 MRP from Column D (MRP PRICE)`);

    } catch (err) {

        console.error("Error loading prices.csv:", err);
        showToast("Error loading stock data: " + err.message, "error");
    }
}

// ===================================================
// LOAD OFFERS - FIXED: Properly initializes dealerOfferMap
// ===================================================
function loadOffers() {
    console.log("🔄 Loading offers...");
    
    // FIX: Always initialize as empty object
    currentOffers = [];
    dealerOfferMap = {};
    
    try {
        const rawData = localStorage.getItem('dealerOffers');
        console.log('📦 Raw data from localStorage:', rawData ? 'Found' : 'Not found');
        
        if (!rawData) {
            console.log('⚠️ No dealerOffers found in localStorage');
            return;
        }
        
        const parsed = JSON.parse(rawData);
        console.log('📊 Parsed data structure:', Object.keys(parsed));
        
        if (parsed && Array.isArray(parsed.offers)) {
            currentOffers = parsed.offers;
            console.log(`✅ Offers loaded from offers property: ${currentOffers.length}`);
        } else if (Array.isArray(parsed)) {
            currentOffers = parsed;
            console.log(`✅ Offers loaded as array: ${currentOffers.length}`);
        } else if (parsed && typeof parsed === 'object') {
            for (const key of Object.keys(parsed)) {
                if (Array.isArray(parsed[key]) && parsed[key].length > 0) {
                    if (parsed[key][0] && parsed[key][0].dealer) {
                        currentOffers = parsed[key];
                        console.log(`✅ Offers found in property "${key}": ${currentOffers.length}`);
                        break;
                    }
                }
            }
        }
        
        if (currentOffers.length === 0) {
            console.log('⚠️ No offers found in any format');
            return;
        }
        
        // FIX: Build dealer map using normalized names
        let builtCount = 0;
        currentOffers.forEach(o => {
            const dealerName = o.dealer || o.dealerRaw || '';
            if (!dealerName) return;
            
            const key = normalizeDealerName(dealerName);
            if (!key) return;
            
            if (!dealerOfferMap[key]) {
                dealerOfferMap[key] = [];
            }
            dealerOfferMap[key].push(o);
            builtCount++;
        });
        
        console.log(`📊 Dealer keys in map: ${Object.keys(dealerOfferMap).length}`);
        console.log(`📊 Total offers in memory: ${currentOffers.length}`);
        console.log(`📊 Offers assigned to dealers: ${builtCount}`);
        
        // Log sample dealers
        const sampleKeys = Object.keys(dealerOfferMap).slice(0, 5);
        if (sampleKeys.length > 0) {
            console.log('📋 Sample dealers:', sampleKeys);
        } else {
            console.warn('⚠️ No dealers in map! Checking first offer:', currentOffers[0]);
        }
        
    } catch (err) {
        console.error('Error loading offers:', err);
        currentOffers = [];
        dealerOfferMap = {};
    }
}

// ===================================================
// GET DEALERS WITH OFFERS - FIXED
// ===================================================
async function getDealersWithOffers() {
    console.log("🔍 Getting dealers with offers...");
    
    await loadDealerMaster();
    loadOffers();
    
    const result = [];
    const processed = new Set();
    
    console.log(`📊 dealerOfferMap keys: ${Object.keys(dealerOfferMap).length}`);
    
    // If dealerOfferMap is empty but currentOffers has data, rebuild
    if (Object.keys(dealerOfferMap).length === 0 && currentOffers.length > 0) {
        console.log('⚠️ dealerOfferMap is empty but currentOffers has data. Rebuilding...');
        
        currentOffers.forEach(o => {
            const dealerName = o.dealer || o.dealerRaw || '';
            if (!dealerName) return;
            
            const key = normalizeDealerName(dealerName);
            if (!key) return;
            
            if (!dealerOfferMap[key]) {
                dealerOfferMap[key] = [];
            }
            dealerOfferMap[key].push(o);
        });
        
        console.log(`📊 Rebuilt dealerOfferMap with ${Object.keys(dealerOfferMap).length} keys`);
    }
    
    for (const [key, offers] of Object.entries(dealerOfferMap)) {
        if (offers.length === 0 || processed.has(key)) continue;
        processed.add(key);
        
        console.log(`✅ Found dealer: ${key} with ${offers.length} offers`);
        
        let dealer = dealerMasterMap.get(key);
        
        if (!dealer) {
            const firstOffer = offers[0];
            const searchName = firstOffer.dealer || firstOffer.dealerRaw || '';
            dealer = findDealer(searchName);
        }
        
        const firstOffer = offers[0];
        result.push({
            name: (firstOffer.dealer || firstOffer.dealerRaw || key).toUpperCase(),
            normalized: key,
            phone: dealer?.phone || '',
            district: dealer?.district || '',
            offerCount: offers.length,
            hasPhone: !!dealer?.phone
        });
    }
    
    result.sort((a, b) => a.name.localeCompare(b.name));
    
    console.log(`✅ Found ${result.length} dealers with offers (sorted alphabetically)`);
    return result;
}

// ===================================================
// FIND DEALER - FIXED: Improved matching
// ===================================================
function findDealer(name) {
    if (!name) return null;
    
    const normalized = normalizeDealerName(name);
    
    // Priority 1: Exact match
    if (dealerMasterMap.has(normalized)) {
        const dealer = dealerMasterMap.get(normalized);
        return {
            ...dealer,
            name: dealer.name.toUpperCase()
        };
    }
    
    // Priority 2: Contains match with high confidence
    let bestMatch = null;
    let bestScore = 0;
    
    for (const [key, dealer] of dealerMasterMap) {
        if (key.includes(normalized) || normalized.includes(key)) {
            const score = Math.min(key.length, normalized.length) / Math.max(key.length, normalized.length);
            if (score > bestScore && score > 0.7) {
                bestScore = score;
                bestMatch = {
                    ...dealer,
                    name: dealer.name.toUpperCase()
                };
            }
        }
    }
    
    if (bestMatch) {
        console.log(`✅ Found dealer by contains match (${Math.round(bestScore * 100)}%): "${name}"`);
        return bestMatch;
    }
    
    // Priority 3: Word match
    const words = normalized.split(' ').filter(w => w.length > 2);
    let wordMatch = null;
    let wordScore = 0;
    
    for (const [key, dealer] of dealerMasterMap) {
        let matches = 0;
        for (const word of words) {
            if (key.includes(word)) matches++;
        }
        const score = words.length > 0 ? matches / words.length : 0;
        if (score > wordScore && score > 0.6) {
            wordScore = score;
            wordMatch = {
                ...dealer,
                name: dealer.name.toUpperCase()
            };
        }
    }
    
    if (wordMatch) {
        console.log(`✅ Found dealer by word match (${Math.round(wordScore * 100)}%): "${name}"`);
        return wordMatch;
    }
    
    // Priority 4: Phone number match
    if (name && name.length >= 10 && !isNaN(name)) {
        for (const [key, dealer] of dealerMasterMap) {
            if (dealer.phone && dealer.phone === name) {
                console.log(`✅ Found dealer by phone number: "${dealer.name}"`);
                return {
                    ...dealer,
                    name: dealer.name.toUpperCase()
                };
            }
        }
    }
    
    console.log(`⚠️ No exact dealer match found for "${name}"`);
    return null;
}

// ===================================================
// GET ALL DEALER OFFERS
// ===================================================
function getAllDealerOffers(name) {
    if (!name) {
        console.log('⚠️ getAllDealerOffers called with empty name');
        return [];
    }
    
    const normalized = normalizeDealerName(name);
    console.log(`🔍 Looking for offers for: "${name}" (normalized: "${normalized}")`);
    console.log(`📊 Available dealer keys: ${Object.keys(dealerOfferMap).length}`);
    
    if (dealerOfferMap[normalized]) {
        const count = dealerOfferMap[normalized].length;
        console.log(`✅ Found ${count} offers by exact match for "${normalized}"`);
        return dealerOfferMap[normalized];
    }
    
    let bestMatch = null;
    let bestScore = 0;
    
    for (const [key, offers] of Object.entries(dealerOfferMap)) {
        if (key.includes(normalized) || normalized.includes(key)) {
            const score = Math.min(key.length, normalized.length) / Math.max(key.length, normalized.length);
            if (score > bestScore && score > 0.6) {
                bestScore = score;
                bestMatch = offers;
            }
        }
    }
    
    if (bestMatch) {
        console.log(`✅ Found offers by contains match (${Math.round(bestScore * 100)}%) for "${normalized}"`);
        return bestMatch;
    }
    
    const words = normalized.split(' ').filter(w => w.length > 2);
    let wordMatch = null;
    let wordScore = 0;
    
    for (const [key, offers] of Object.entries(dealerOfferMap)) {
        let matches = 0;
        for (const word of words) {
            if (key.includes(word)) matches++;
        }
        const score = words.length > 0 ? matches / words.length : 0;
        if (score > wordScore && score > 0.5) {
            wordScore = score;
            wordMatch = offers;
        }
    }
    
    if (wordMatch) {
        console.log(`✅ Found offers by word match (${Math.round(wordScore * 100)}%) for "${normalized}"`);
        return wordMatch;
    }
    
    console.log(`❌ No offers found for "${name}"`);
    return [];
}

// ===================================================
// GET DISTRIBUTOR INFO
// ===================================================
function getDistributorInfo(part) {
    return distributorStockMap.get(normalizeText(part)) || null;
}

// ===================================================
// PRICE CALCULATIONS
// ===================================================
function calculateOurPrice(mrp, discount) {
    const basic = mrp - (mrp * 31.77 / 100);
    const afterDiscount = basic - (basic * discount / 100);
    return afterDiscount * 1.18;
}

function calculateDistributorPrice(mrp) {
    return mrp;
}

function getStockInfo(offer) {
    const myStock = offer.myStock || offer.stock || 0;
    const distInfo = getDistributorInfo(offer.part);
    const distributorStockQty = distInfo?.stock || offer.distributorStock || 0;
    const distMRP = offer.mrp || 0;
    
    return {
        ourStock: myStock,
        distStock: distributorStockQty,
        hasDistStock: distributorStockQty > 0,
        distMRP: distMRP
    };
}

function calculatePrices(offer) {
    const discount = Number(offer.discount || 0);
    const stock = getStockInfo(offer);
    
    const mrp = offer.mrp || offer.originalPrice || 0;
    
    // FIX: If Our Stock is 0 but Distributor Stock is available, use MRP as Net Price
    let ourOfferPrice;
    if (stock.ourStock === 0 && stock.hasDistStock) {
        ourOfferPrice = mrp;
    } else {
        ourOfferPrice = calculateOurPrice(mrp, discount);
    }
    
    const distMRP = stock.distMRP || mrp || 0;
    const distOfferPrice = calculateDistributorPrice(distMRP);
    
    return {
        mrp: mrp,
        ourOfferPrice: ourOfferPrice,
        distMRP: distMRP,
        distOfferPrice: distOfferPrice,
        discount: discount,
        stock: stock
    };
}

// ===================================================
// GENERATE WHATSAPP MESSAGE
// ===================================================
function generateWhatsAppMessage(dealerName, dealer, offers) {
    let msg = `*⚡ AUTO SPARES SOLUTION ⚡*\n\n`;
    msg += `*Dear ${dealerName.toUpperCase()},*\n\n`;
    msg += `*📋 SPECIAL OFFER LIST*\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;

    let hasDistributorStock = false;
    let charCount = msg.length;
    const MAX_CHARS = 3000;
    
    for (let o of offers) {
        const prices = calculatePrices(o);
        const stock = prices.stock;
        const desc = o.description || '';
        const app = o.application || '';
        const mrp = prices.mrp || 0;
        
        let item = `🔹 *${o.part}*\n`;
        if (desc) item += `   📝 ${desc.substring(0, 30)}\n`;
        if (app) item += `   🔧 ${app.substring(0, 30)}\n`;
        
        item += `   💰 MRP: ₹${mrp.toFixed(2)}\n`;
        
        if (stock.ourStock > 0) {
            item += `   📦 Our Stock: ${stock.ourStock} @ ₹${prices.ourOfferPrice.toFixed(2)}`;
            if (prices.discount > 0) item += ` (${prices.discount}% OFF)`;
            item += `\n`;
        } else if (stock.hasDistStock) {
            hasDistributorStock = true;
            item += `   🏭 Dist Stock: ${stock.distStock} @ ₹${prices.distOfferPrice.toFixed(2)} (MRP)\n`;
            item += `   ⚠️ Only Distributor Stock available\n`;
        }
        
        if (stock.hasDistStock && stock.ourStock > 0) {
            hasDistributorStock = true;
            item += `   🏭 Also Dist Stock: ${stock.distStock} @ ₹${prices.distOfferPrice.toFixed(2)} (MRP)\n`;
        }
        item += `\n`;
        
        if (charCount + item.length > MAX_CHARS) {
            msg += `\n*And ${offers.length - (offers.indexOf(o) + 1)} more offers...*\n`;
            break;
        }
        
        msg += item;
        charCount += item.length;
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

// ===================================================
// SEND WHATSAPP - FIXED: Uses whatsapp:// protocol
// ===================================================
async function sendFlyerToWhatsApp(name) {
    console.log(`🔍 Looking for offers for: "${name}"`);
    
    await loadDealerMaster();
    loadOffers();
    
    let offers = getAllDealerOffers(name);
    
    if (offers.length === 0) {
        showToast(`❌ No offers found for "${name}"`, "error");
        return;
    }
    
    const firstOffer = offers[0];
    const dealerName = (firstOffer.dealer || firstOffer.dealerRaw || name).toUpperCase();
    
    let dealer = findDealer(dealerName);
    
    if (!dealer || !dealer.phone) {
        const customers = getStorageItem('customers') || [];
        const customerMatch = customers.find(c => normalizeDealerName(c.name) === normalizeDealerName(dealerName));
        if (customerMatch && (customerMatch.mobileNo || customerMatch.phone)) {
            dealer = {
                name: customerMatch.name.toUpperCase(),
                normalized: normalizeDealerName(customerMatch.name),
                phone: customerMatch.mobileNo || customerMatch.phone || '',
                district: customerMatch.district || '',
                source: 'customer-master'
            };
        }
    }
    
    if (!dealer || !dealer.phone) {
        showToast(`❌ Phone number not found for "${dealerName}"`, "error");
        return;
    }
    
    const msg = generateWhatsAppMessage(dealerName, dealer, offers);
    const cleanPhoneNum = formatPhoneForWhatsApp(dealer.phone);
    
    if (!cleanPhoneNum) {
        showToast(`❌ Invalid phone number for "${dealerName}"`, "error");
        return;
    }
    
    // FIX: Use whatsapp:// protocol for personal WhatsApp
    const url = `whatsapp://send?phone=${cleanPhoneNum}&text=${encodeURIComponent(msg)}`;
    window.location.href = url;
    
    showToast(`✅ WhatsApp opened for "${dealerName}"`, "success");
    console.log(`✅ WhatsApp opened for "${dealerName}" (${cleanPhoneNum}) | Offers: ${offers.length}`);
}

// ===================================================
// GENERATE BROCHURE HTML
// ===================================================
function generateFullBrochureHTML(name, page = 0, totalPages = 1, rowsPerPage = 12) {
    const dealerName = name.toUpperCase();
    const offers = getAllDealerOffers(dealerName);
    const dealer = findDealer(dealerName);
    
    let phone = dealer?.phone || '';
    let district = dealer?.district || '';
    
    if (!phone) {
        const customers = getStorageItem('customers') || [];
        const match = customers.find(c => normalizeDealerName(c.name) === normalizeDealerName(dealerName));
        if (match) {
            phone = match.mobileNo || match.phone || '';
            district = match.district || '';
        }
    }

    const start = page * rowsPerPage;
    const end = Math.min(start + rowsPerPage, offers.length);
    const pageOffers = offers.slice(start, end);
    
    const hasDistributorStock = offers.some(o => getStockInfo(o).hasDistStock);
    
    let html = `
    <div style="width:100%;max-width:1100px;background:#fff;padding:8px 10px;font-family:Arial;color:#000;margin:0 auto;page-break-after:${page < totalPages - 1 ? 'always' : 'avoid'};">
    
    <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #facc15;padding-bottom:4px;margin-bottom:5px;">
        <span style="color:#0a7c71;font-size:18px;font-weight:bold;">AUTO SPARES SOLUTION</span>
        <span style="font-size:10px;color:#666;">Page ${page + 1}/${totalPages}</span>
    </div>
    
    <h2 style="font-size:14px;margin:2px 0;color:#1e293b;">${escapeHtml(dealerName)}</h2>
    
    <div style="display:flex;flex-wrap:wrap;gap:8px;font-size:10px;margin-bottom:4px;background:#f8f9fa;padding:3px 8px;border-radius:4px;">
        <span><b>📞 Mobile:</b> ${phone || "Not available"}</span>
        <span><b>📍 District:</b> ${district || "Not specified"}</span>
        <span style="color:#666;font-size:8px;">Showing ${start + 1} - ${end} of ${offers.length} offers</span>
    </div>
    
    <table style="width:100%;border-collapse:collapse;font-size:8px;table-layout:fixed;">
    <colgroup>
        <col style="width:10%;">
        <col style="width:18%;">
        <col style="width:15%;">
        <col style="width:8%;">
        <col style="width:10%;">
        <col style="width:8%;">
        <col style="width:12%;">
        <col style="width:8%;">
        <col style="width:8%;">
        <col style="width:8%;">
        <col style="width:8%;">
        <col style="width:8%;">
    </colgroup>
    <thead>
    <tr style="background:#facc15;">
        <th style="padding:2px 2px;border:1px solid #ccc;text-align:left;font-size:7px;">Part No</th>
        <th style="padding:2px 2px;border:1px solid #ccc;text-align:left;font-size:7px;">Description</th>
        <th style="padding:2px 2px;border:1px solid #ccc;text-align:left;font-size:7px;">Application<br><span style="font-size:5px;">(Model)</span></th>
        <th style="padding:2px 2px;border:1px solid #ccc;text-align:center;font-size:7px;">MRP<br><span style="font-size:5px;">(Dist MRP)</span></th>
        <th style="padding:2px 2px;border:1px solid #ccc;text-align:center;font-size:7px;">Basic Price<br><span style="font-size:5px;">(Less 31.77%)</span></th>
        <th style="padding:2px 2px;border:1px solid #ccc;text-align:center;font-size:7px;">Spl Dis %</th>
        <th style="padding:2px 2px;border:1px solid #ccc;text-align:center;font-size:7px;">Net Price<br><span style="font-size:5px;">Incl GST</span></th>
        <th style="padding:2px 2px;border:1px solid #ccc;text-align:center;font-size:7px;">Our<br>Stock</th>
        <th style="padding:2px 2px;border:1px solid #ccc;text-align:center;font-size:7px;">Dist<br>MRP</th>
        <th style="padding:2px 2px;border:1px solid #ccc;text-align:center;font-size:7px;">Dist<br>Price</th>
        <th style="padding:2px 2px;border:1px solid #ccc;text-align:center;font-size:7px;">Dist<br>Stock</th>
        <th style="padding:2px 2px;border:1px solid #ccc;text-align:center;font-size:7px;">Expiry</th>
    </tr>
    </thead>
    <tbody>`;

    for (const o of pageOffers) {
        const prices = calculatePrices(o);
        const stock = prices.stock;
        const description = o.description || '';
        const application = o.application || '';
        const expiryDate = o.expiresAt ? formatDate(o.expiresAt) : '-';
        const mrp = prices.mrp || 0;
        
        const showNetPrice = stock.ourStock > 0 ? prices.ourOfferPrice.toFixed(0) : '-';
        const netPriceColor = stock.ourStock === 0 && stock.hasDistStock ? '#facc15' : '#dc2626';
        
        html += `<tr>
            <td style="padding:2px 2px;border:1px solid #ccc;word-wrap:break-word;font-size:7px;"><strong>${escapeHtml(o.part || '')}</strong></td>
            <td style="padding:2px 2px;border:1px solid #ccc;word-wrap:break-word;font-size:7px;color:#333;">${escapeHtml(description || '-')}</td>
            <td style="padding:2px 2px;border:1px solid #ccc;word-wrap:break-word;font-size:7px;color:#555;">${escapeHtml(application || '-')}</td>
            <td style="padding:2px 2px;border:1px solid #ccc;text-align:center;font-size:7px;font-weight:bold;color:#2563eb;">${mrp.toFixed(0)}</td>
            <td style="padding:2px 2px;border:1px solid #ccc;text-align:center;font-size:7px;">${(o.basicPrice || mrp).toFixed(0)}</td>
            <td style="padding:2px 2px;border:1px solid #ccc;text-align:center;font-size:7px;color:#16a34a;">${prices.discount}%</td>
            <td style="padding:2px 2px;border:1px solid #ccc;text-align:center;font-size:7px;color:${netPriceColor};font-weight:bold;">${showNetPrice}</td>
            <td style="padding:2px 2px;border:1px solid #ccc;text-align:center;font-size:7px;">${stock.ourStock || 0}</td>
            <td style="padding:2px 2px;border:1px solid #ccc;text-align:center;font-size:7px;${stock.hasDistStock ? 'color:#facc15;' : 'color:#999;'}">${stock.hasDistStock ? prices.distMRP.toFixed(0) : '-'}</td>
            <td style="padding:2px 2px;border:1px solid #ccc;text-align:center;font-size:7px;color:#9333ea;font-weight:bold;">${stock.hasDistStock ? prices.distOfferPrice.toFixed(0) : '-'}</td>
            <td style="padding:2px 2px;border:1px solid #ccc;text-align:center;font-size:7px;${stock.hasDistStock ? 'color:#16a34a;' : 'color:#999;'}">${stock.hasDistStock ? stock.distStock : '-'}</td>
            <td style="padding:2px 2px;border:1px solid #ccc;text-align:center;font-size:6px;${expiryDate !== '-' ? 'color:#dc3545;' : ''}">${expiryDate}</td>
        </tr>`;
    }

    html += `</tbody></table>`;
    
    if (hasDistributorStock) {
        html += `<div style="margin-top:3px;padding:2px 6px;background:#fff3cd;border:1px solid #ffc107;border-radius:3px;font-size:7px;color:#856404;">
            ⚠️ <strong>Additional courier charges apply for distributor stock items.</strong>
        </div>`;
    }
    
    html += `<div style="margin-top:3px;font-size:6px;color:#999;text-align:center;border-top:1px solid #eee;padding-top:3px;">
        ${new Date().toLocaleDateString()} | ${offers.length} offers | Valid for 15 days
    </div>`;
    html += `</div>`;
    
    return html;
}

// ===================================================
// SHOW PREVIEW
// ===================================================
let previewCurrentPage = 0;
let previewTotalPages = 1;
let previewDealerName = '';
let previewRowsPerPage = 12;
let previewWindow = null;

function showBrochurePreview(name) {
    const dealerName = name.toUpperCase();
    const offers = getAllDealerOffers(dealerName);
    if (offers.length === 0) {
        showToast(`No offers found for "${dealerName}"`, "error");
        return;
    }
    
    previewDealerName = dealerName;
    previewCurrentPage = 0;
    previewRowsPerPage = 12;
    previewTotalPages = Math.ceil(offers.length / previewRowsPerPage);
    
    renderPreviewPage();
}

function renderPreviewPage() {
    const name = previewDealerName;
    const page = previewCurrentPage;
    const totalPages = previewTotalPages;
    const rowsPerPage = previewRowsPerPage;
    const offers = getAllDealerOffers(name);
    
    let fullHtml = `<!DOCTYPE html>
    <html>
    <head>
        <title>Brochure - ${name}</title>
        <meta charset="UTF-8">
        <style>
            body { 
                font-family: Arial, sans-serif; 
                margin: 0; 
                padding: 5px; 
                background: #e9ecef; 
            }
            .page { 
                background: white; 
                max-width: 1100px; 
                margin: 5px auto; 
                padding: 6px 10px; 
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
                    padding: 4px 6px; 
                }
            }
            table { 
                width: 100%; 
                border-collapse: collapse; 
                font-size: 7px; 
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
                font-size: 6px; 
            }
            .pagination {
                text-align: center;
                padding: 10px;
                background: #f8f9fa;
                border-top: 2px solid #facc15;
                margin-top: 4px;
                position: sticky;
                bottom: 0;
            }
            .pagination button {
                background: #0a7c71;
                color: white;
                border: none;
                padding: 6px 16px;
                border-radius: 4px;
                font-size: 11px;
                cursor: pointer;
                margin: 2px;
            }
            .pagination button:hover { opacity: 0.9; }
            .pagination .page-info {
                color: #1e293b;
                font-size: 12px;
                margin: 0 10px;
            }
            .pagination button:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }
        </style>
    </head>
    <body>
        <div style="text-align:center;padding:4px;background:#f8f9fa;border-bottom:2px solid #facc15;margin-bottom:4px;">
            <span style="font-size:14px;font-weight:bold;color:#0a7c71;">📄 Brochure Preview: ${escapeHtml(name)}</span>
            <br>
            <span style="font-size:10px;color:#666;">${offers.length} offers | ${totalPages} pages | ${rowsPerPage} rows per page</span>
        </div>
        <div class="page">${generateFullBrochureHTML(name, page, totalPages, rowsPerPage)}</div>
        <div class="pagination">
            <button onclick="window.previewGoToPage(${page - 1})" ${page <= 0 ? 'disabled' : ''}>⬅ Previous</button>
            <span class="page-info">Page ${page + 1} of ${totalPages}</span>
            <button onclick="window.previewGoToPage(${page + 1})" ${page >= totalPages - 1 ? 'disabled' : ''}>Next ➡</button>
            <button onclick="window.print()" style="background:#16a34a;">🖨️ Print</button>
            <button onclick="window.close()" style="background:#dc3545;">❌ Close</button>
        </div>
    </body></html>`;
    
    if (previewWindow && !previewWindow.closed) {
        previewWindow.close();
    }
    
    previewWindow = window.open("", "_blank");
    previewWindow.document.write(fullHtml);
    previewWindow.document.close();
    
    previewWindow.previewGoToPage = function(newPage) {
        if (newPage < 0 || newPage >= previewTotalPages) return;
        previewCurrentPage = newPage;
        renderPreviewPage();
    };
}

// ===================================================
// DOWNLOAD PDF
// ===================================================
async function downloadPDF(name) {
    try {
        const dealerName = name.toUpperCase();
        const offers = getAllDealerOffers(dealerName);
        if (offers.length === 0) {
            showToast(`No offers found for "${dealerName}"`, "error");
            return;
        }
        
        const rowsPerPage = 14;
        const totalPages = Math.ceil(offers.length / rowsPerPage);
        
        console.log(`📄 Generating PDF: ${offers.length} offers, ${totalPages} pages`);
        
        if (typeof window.jspdf === 'undefined') {
            showToast("jsPDF library not loaded. Please refresh the page.", "error");
            return;
        }
        
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('l', 'mm', 'a4');
        
        const hasAutoTable = typeof pdf.autoTable === 'function';
        
        if (hasAutoTable) {
            const tableData = offers.map(o => {
                const prices = calculatePrices(o);
                const stock = prices.stock;
                const description = (o.description || '').substring(0, 60);
                const application = (o.application || '').substring(0, 50);
                const mrp = prices.mrp || 0;
                
                const netPrice = stock.ourStock > 0 ? prices.ourOfferPrice.toFixed(0) : '-';
                
                return [
                    o.part || '',
                    description || '-',
                    application || '-',
                    mrp.toFixed(0),
                    (o.basicPrice || mrp).toFixed(0),
                    prices.discount + '%',
                    netPrice,
                    stock.ourStock || 0,
                    stock.hasDistStock ? prices.distMRP.toFixed(0) : '-',
                    stock.hasDistStock ? prices.distOfferPrice.toFixed(0) : '-',
                    stock.hasDistStock ? stock.distStock : '-',
                    o.expiresAt ? formatDate(o.expiresAt) : '-'
                ];
            });
            
            for (let i = 0; i < totalPages; i++) {
                if (i > 0) pdf.addPage();
                
                const start = i * rowsPerPage;
                const end = Math.min(start + rowsPerPage, tableData.length);
                const pageData = tableData.slice(start, end);
                
                pdf.setFontSize(12);
                pdf.setTextColor(10, 124, 113);
                pdf.text('AUTO SPARES SOLUTION', 14, 15);
                
                pdf.setFontSize(10);
                pdf.setTextColor(30, 41, 59);
                pdf.text(`Dealer: ${dealerName}`, 14, 25);
                
                pdf.setFontSize(8);
                pdf.setTextColor(100, 116, 139);
                pdf.text(`Page ${i + 1} of ${totalPages} | ${offers.length} offers | ${new Date().toLocaleDateString()}`, 14, 32);
                
                pdf.autoTable({
                    startY: 38,
                    head: [[
                        'Part No', 'Description', 'Application', 'MRP',
                        'Basic Price', 'Spl Dis %', 'Net Price',
                        'Our Stock', 'Dist MRP', 'Dist Price', 'Dist Stock', 'Expiry'
                    ]],
                    body: pageData,
                    theme: 'grid',
                    styles: {
                        fontSize: 5.5,
                        cellPadding: 1.5,
                        lineColor: [200, 200, 200],
                        lineWidth: 0.1,
                        valign: 'middle',
                        overflow: 'linebreak'
                    },
                    headStyles: {
                        fillColor: [250, 204, 21],
                        textColor: [0, 0, 0],
                        fontSize: 5.5,
                        fontStyle: 'bold',
                        halign: 'center'
                    },
                    columnStyles: {
                        0: { cellWidth: 22 },
                        1: { cellWidth: 50 },
                        2: { cellWidth: 40 },
                        3: { cellWidth: 15 },
                        4: { cellWidth: 18 },
                        5: { cellWidth: 12 },
                        6: { cellWidth: 20 },
                        7: { cellWidth: 15 },
                        8: { cellWidth: 15 },
                        9: { cellWidth: 18 },
                        10: { cellWidth: 15 },
                        11: { cellWidth: 18 }
                    },
                    margin: { left: 10, right: 10 },
                    tableWidth: 'auto',
                    pageBreak: 'auto'
                });
            }
            
            pdf.save(`${dealerName.replace(/[^a-z0-9]/gi, '_')}_brochure.pdf`);
            showToast(`✅ PDF saved: ${totalPages} pages`, "success");
            console.log(`✅ PDF saved: ${totalPages} pages, ${offers.length} offers`);
            
        } else {
            showToast("PDF autoTable not available. Please refresh the page.", "error");
        }
        
    } catch (err) {
        console.error("PDF Error:", err);
        showToast("PDF generation failed: " + err.message, "error");
    }
}

// ===================================================
// DOWNLOAD SINGLE PDF
// ===================================================
async function downloadSinglePDF(name) {
    await downloadPDF(name);
}

// ===================================================
// DOWNLOAD ALL FLYERS PDF
// ===================================================
async function downloadAllFlyersPDF() {
    try {
        const dealers = await getDealersWithOffers();
        if (dealers.length === 0) {
            showToast('No flyers found. Run Analysis first.', 'warning');
            return;
        }
        
        let count = 0;
        for (const d of dealers) {
            await downloadPDF(d.name);
            await new Promise(r => setTimeout(r, 500));
            count++;
        }
        showToast(`✅ Downloaded ${count} PDF files`, 'success');
    } catch(err) {
        console.error(err);
        showToast('Error downloading PDFs: ' + err.message, 'error');
    }
}

// ===================================================
// EXPORT EXCEL
// ===================================================
function exportDealerOffersToExcel(name) {
    if (typeof XLSX === 'undefined') {
        showToast("XLSX library missing", "error");
        return;
    }
    
    const dealerName = name.toUpperCase();
    const offers = getAllDealerOffers(dealerName);
    if (offers.length === 0) {
        showToast(`No offers found for "${dealerName}"`, "error");
        return;
    }
    
    const data = offers.map(o => {
        const prices = calculatePrices(o);
        const mrp = prices.mrp || 0;
        const netPrice = prices.stock.ourStock > 0 ? prices.ourOfferPrice.toFixed(2) : '-';
        return {
            "Part No": o.part,
            "Description": o.description || '',
            "Application (Model)": o.application || '',
            "MRP (Dist MRP)": mrp.toFixed(2),
            "Basic Price (Less 31.77%)": (o.basicPrice || mrp).toFixed(2),
            "Spl Dis %": prices.discount,
            "Net Price Including GST": netPrice,
            "Available Qty": prices.stock.ourStock + prices.stock.distStock,
            "Our Stock": prices.stock.ourStock,
            "Dist. Stock": prices.stock.distStock,
            "Offer Type": o.offerType || '',
            "Source": o.source || '',
            "Expires": o.expiresAt ? formatDate(o.expiresAt) : ''
        };
    });
    
    const ws = XLSX.utils.json_to_sheet(data);
    
    ws['!cols'] = [
        { wch: 12 }, { wch: 35 }, { wch: 30 }, { wch: 10 },
        { wch: 20 }, { wch: 10 }, { wch: 22 }, { wch: 12 },
        { wch: 10 }, { wch: 10 }, { wch: 15 }, { wch: 15 }, { wch: 12 }
    ];
    
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Offers");
    XLSX.writeFile(wb, `${dealerName.replace(/[^a-z0-9]/gi, '_')}_offers.xlsx`);
    showToast(`✅ Excel exported: ${data.length} rows`, "success");
}

// ===================================================
// SHARE PDF TO WHATSAPP
// ===================================================
async function sharePDFToWhatsApp(name) {
    try {
        const dealerName = name.toUpperCase();
        let dealer = findDealer(dealerName);
        let phone = dealer?.phone || '';
        
        if (!phone) {
            const customers = getStorageItem('customers') || [];
            const match = customers.find(c => normalizeDealerName(c.name) === normalizeDealerName(dealerName));
            if (match) phone = match.mobileNo || match.phone || '';
        }
        
        if (!phone) {
            showToast(`Phone number not found for ${dealerName}`, "error");
            return;
        }
        
        await downloadPDF(dealerName);
        
        const msg = `📄 *Your Special Offer Brochure*\n\nDear ${dealerName},\n\nPlease find your personalized offer brochure attached as PDF.\n\nThank you for your business!\n\nAuto Spares Solution`;
        const cleanPhoneNum = formatPhoneForWhatsApp(phone);
        
        if (!cleanPhoneNum) {
            showToast(`Invalid phone number for ${dealerName}`, "error");
            return;
        }
        
        // FIX: Use whatsapp:// protocol
        const url = `whatsapp://send?phone=${cleanPhoneNum}&text=${encodeURIComponent(msg)}`;
        window.location.href = url;
        showToast(`✅ WhatsApp opened for ${dealerName}`, "success");
        
    } catch (err) {
        console.error(err);
        showToast("Failed: " + err.message, "error");
    }
}

// ===================================================
// DEBUG OFFERS
// ===================================================
function debugOffers() {
    console.log('=== OFFER DEBUG ===');
    
    const raw = localStorage.getItem('dealerOffers');
    console.log('Raw localStorage data:', raw ? 'Found' : 'Not found');
    
    if (raw) {
        try {
            const parsed = JSON.parse(raw);
            console.log('Parsed data type:', typeof parsed);
            console.log('Parsed keys:', Object.keys(parsed));
            
            if (Array.isArray(parsed)) {
                console.log('Data is array, length:', parsed.length);
                if (parsed.length > 0) {
                    console.log('Sample offer:', parsed[0]);
                }
            } else if (parsed.offers && Array.isArray(parsed.offers)) {
                console.log('Data has offers array, length:', parsed.offers.length);
                if (parsed.offers.length > 0) {
                    console.log('Sample offer:', parsed.offers[0]);
                }
            } else {
                console.log('Unknown data structure');
            }
        } catch (err) {
            console.error('Error parsing storage:', err);
        }
    }
    
    console.log('dealerOfferMap keys:', Object.keys(dealerOfferMap));
    console.log('Current offers count:', currentOffers.length);
    console.log('=== END DEBUG ===');
}

// ===================================================
// CLEAR FUNCTIONS
// ===================================================
function clearOffers() {
    localStorage.removeItem('dealerOffers');
    currentOffers = [];
    dealerOfferMap = {};
    showToast('All offers cleared', 'warning');
}

function clearCache() {
    excelCache.clear();
    showToast('Cache cleared', 'info');
}

function refreshOffers() {
    loadOffers();
    console.log(`🔄 Offers refreshed: ${currentOffers.length} offers`);
    return currentOffers.length;
}

// ===================================================
// GET FUNCTIONS
// ===================================================
function getDescription(part) {
    const stockData = findPartMatch(part);
    return stockData?.description || '';
}

function getApplication(part) {
    const stockData = findPartMatch(part);
    return stockData?.application || '';
}

// ===================================================
// INIT
// ===================================================
async function init() {
    console.log("🚀 Initializing Brochure Generator...");
    
    try {
        await loadDealerMaster();
        await loadMyStock();
        await loadDistributorStock();
        loadOffers();
        
        isInitialized = true;
        
        console.log(`🚀 SYSTEM READY`);
        console.log(`   📊 Offers: ${currentOffers.length}`);
        console.log(`   📞 Dealers: ${dealerMaster.length}`);
        console.log(`   🏭 Distributor Stock: ${distributorStock.length} items`);
        console.log(`   📝 Descriptions: ${partDescriptions.size}, Applications: ${partApplications.size}`);
        
        showToast('System Ready', 'success');
        return true;
        
    } catch(err) {
        console.error("Init error:", err);
        showToast('System initialization error: ' + err.message, 'error');
        isInitialized = false;
        return false;
    }
}

// ===================================================
// GLOBAL API
// ===================================================
window.BrochureGenerator = {
    init,
    loadDealerMaster,
    loadOffers,
    loadDistributorStock,
    loadMyStock,
    getDealersWithOffers,
    getAllDealerOffers,
    findDealer,
    generateFullBrochureHTML,
    showBrochurePreview,
    sendFlyerToWhatsApp,
    exportDealerOffersToExcel,
    downloadPDF,
    downloadSinglePDF,
    downloadAllFlyersPDF,
    sharePDFToWhatsApp,
    getDescription,
    getApplication,
    refreshOffers,
    clearOffers,
    clearCache,
    showToast,
    debugOffers,
    findPartMatch,
    cleanPartNumber,
    partDescriptions: partDescriptions,
    partApplications: partApplications,
    isInitialized: function() { return isInitialized; }
};

// ===================================================
// AUTO-INIT
// ===================================================
console.log("📋 Brochure Generator registered. Starting auto-init...");

if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(async () => {
        await init();
    }, 500);
} else {
    document.addEventListener('DOMContentLoaded', async function() {
        setTimeout(async () => {
            await init();
        }, 500);
    });
}

window.addEventListener('load', async function() {
    if (!isInitialized) {
        setTimeout(async () => {
            await init();
        }, 1000);
    }
});

console.log("✅ Brochure Generator loaded");

// ===================================================
// PAGINATION & NAVIGATION ADD-ONS
// ===================================================

let paginationDealerList = [];
let paginationCurrentIndex = 0;
let paginationSortMode = 'priority';
let paginationCurrentPage = 1;
let paginationPerPage = 20;
let paginationAllDealers = [];

function getDealersFromFullAnalysis() {
    try {
        if (typeof DealerIntelligence === 'undefined' || typeof DealerIntelligence.getActiveOffers === 'undefined') {
            console.warn('⚠️ DealerIntelligence not available, using localStorage data');
            const offers = currentOffers || [];
            return buildDealerListFromOffers(offers);
        }
        
        const allOffers = DealerIntelligence.getActiveOffers();
        if (!allOffers || allOffers.length === 0) {
            console.warn('⚠️ No offers found in analysis, using localStorage');
            const offers = currentOffers || [];
            return buildDealerListFromOffers(offers);
        }
        
        return buildDealerListFromOffers(allOffers);
        
    } catch(err) {
        console.error('Error getting dealers from full analysis:', err);
        const offers = currentOffers || [];
        return buildDealerListFromOffers(offers);
    }
}

function buildDealerListFromOffers(offers) {
    const dealerMap = new Map();
    
    offers.forEach(o => {
        const name = o.dealer || 'Unknown';
        if (!dealerMap.has(name)) {
            dealerMap.set(name, {
                name: name,
                offers: [],
                myStockCount: 0,
                distStockCount: 0,
                phone: '',
                district: ''
            });
        }
        const dealer = dealerMap.get(name);
        dealer.offers.push(o);
        if (o.stockType === 'my-stock') dealer.myStockCount++;
        else dealer.distStockCount++;
    });
    
    const result = Array.from(dealerMap.values());
    
    try {
        result.forEach(d => {
            const dealer = findDealer(d.name);
            if (dealer) {
                d.phone = dealer.phone || '';
                d.district = dealer.district || '';
            }
        });
    } catch(e) {
        console.warn('Could not fetch dealer details:', e);
    }
    
    return result;
}

function loadAllDealersWithPagination() {
    console.log('📊 Loading all dealers with pagination...');
    
    paginationAllDealers = getDealersFromFullAnalysis();
    
    if (paginationAllDealers.length === 0) {
        showToast('No dealers found. Run analysis first.', 'warning');
        return [];
    }
    
    paginationAllDealers = sortDealerList(paginationAllDealers, paginationSortMode);
    
    paginationCurrentPage = 1;
    paginationCurrentIndex = 0;
    
    updatePaginationPage();
    
    console.log(`✅ Loaded ${paginationAllDealers.length} dealers with pagination`);
    showToast(`✅ Loaded ${paginationAllDealers.length} dealers`, 'success');
    
    return paginationAllDealers;
}

function sortDealerList(list, mode) {
    const sorted = [...list];
    
    if (mode === 'alphabetical') {
        sorted.sort((a, b) => a.name.localeCompare(b.name));
    } else {
        sorted.sort((a, b) => {
            const aHasStock = (a.myStockCount || 0) > 0;
            const bHasStock = (b.myStockCount || 0) > 0;
            if (aHasStock && !bHasStock) return -1;
            if (!aHasStock && bHasStock) return 1;
            if (a.offerCount !== b.offerCount) return b.offerCount - a.offerCount;
            return a.name.localeCompare(b.name);
        });
    }
    
    return sorted;
}

function updatePaginationPage() {
    const perPage = paginationPerPage;
    const totalDealers = paginationAllDealers.length;
    const totalPages = Math.ceil(totalDealers / perPage);
    
    if (paginationCurrentPage < 1) paginationCurrentPage = 1;
    if (paginationCurrentPage > totalPages) paginationCurrentPage = totalPages;
    
    const start = (paginationCurrentPage - 1) * perPage;
    const end = Math.min(start + perPage, totalDealers);
    const pageDealers = paginationAllDealers.slice(start, end);
    
    paginationDealerList = pageDealers;
    if (paginationCurrentIndex >= paginationDealerList.length) {
        paginationCurrentIndex = 0;
    }
    
    return {
        dealers: pageDealers,
        start: start + 1,
        end: end,
        total: totalDealers,
        currentPage: paginationCurrentPage,
        totalPages: totalPages,
        currentIndex: paginationCurrentIndex
    };
}

function paginationNext() {
    if (paginationDealerList.length === 0) {
        showToast('No dealers loaded. Run analysis first.', 'warning');
        return null;
    }
    
    if (paginationCurrentIndex < paginationDealerList.length - 1) {
        paginationCurrentIndex++;
        return getCurrentDealer();
    } else {
        const totalPages = Math.ceil(paginationAllDealers.length / paginationPerPage);
        if (paginationCurrentPage < totalPages) {
            paginationCurrentPage++;
            updatePaginationPage();
            paginationCurrentIndex = 0;
            return getCurrentDealer();
        } else {
            showToast('Already at the last dealer', 'info');
            return null;
        }
    }
}

function paginationPrev() {
    if (paginationDealerList.length === 0) {
        showToast('No dealers loaded. Run analysis first.', 'warning');
        return null;
    }
    
    if (paginationCurrentIndex > 0) {
        paginationCurrentIndex--;
        return getCurrentDealer();
    } else {
        if (paginationCurrentPage > 1) {
            paginationCurrentPage--;
            updatePaginationPage();
            paginationCurrentIndex = paginationDealerList.length - 1;
            return getCurrentDealer();
        } else {
            showToast('Already at the first dealer', 'info');
            return null;
        }
    }
}

function paginationGoToFirst() {
    if (paginationAllDealers.length === 0) {
        showToast('No dealers loaded. Run analysis first.', 'warning');
        return null;
    }
    paginationCurrentPage = 1;
    updatePaginationPage();
    paginationCurrentIndex = 0;
    return getCurrentDealer();
}

function paginationGoToLast() {
    if (paginationAllDealers.length === 0) {
        showToast('No dealers loaded. Run analysis first.', 'warning');
        return null;
    }
    const totalPages = Math.ceil(paginationAllDealers.length / paginationPerPage);
    paginationCurrentPage = totalPages;
    updatePaginationPage();
    paginationCurrentIndex = paginationDealerList.length - 1;
    return getCurrentDealer();
}

function paginationGoToPage(page) {
    const totalPages = Math.ceil(paginationAllDealers.length / paginationPerPage);
    if (page >= 1 && page <= totalPages) {
        paginationCurrentPage = page;
        updatePaginationPage();
        paginationCurrentIndex = 0;
        return getCurrentDealer();
    }
    return null;
}

function paginationSetPerPage(perPage) {
    paginationPerPage = perPage;
    paginationCurrentPage = 1;
    updatePaginationPage();
    paginationCurrentIndex = 0;
    return getCurrentDealer();
}

function getCurrentDealer() {
    if (paginationDealerList.length === 0 || paginationCurrentIndex >= paginationDealerList.length) {
        return null;
    }
    return paginationDealerList[paginationCurrentIndex];
}

function getDealerByIndex(index) {
    if (paginationAllDealers.length === 0 || index >= paginationAllDealers.length) {
        return null;
    }
    return paginationAllDealers[index];
}

function getTotalDealerCount() {
    return paginationAllDealers.length;
}

function getPaginationInfo() {
    const totalPages = Math.ceil(paginationAllDealers.length / paginationPerPage);
    return {
        totalDealers: paginationAllDealers.length,
        currentPage: paginationCurrentPage,
        totalPages: totalPages,
        perPage: paginationPerPage,
        currentIndex: paginationCurrentIndex,
        pageStart: (paginationCurrentPage - 1) * paginationPerPage + 1,
        pageEnd: Math.min(paginationCurrentPage * paginationPerPage, paginationAllDealers.length)
    };
}

function paginationSetSort(mode) {
    paginationSortMode = mode;
    paginationAllDealers = sortDealerList(paginationAllDealers, mode);
    paginationCurrentPage = 1;
    updatePaginationPage();
    paginationCurrentIndex = 0;
    return getCurrentDealer();
}

function paginationRefresh() {
    return loadAllDealersWithPagination();
}

function generateFlyerForCurrentDealer() {
    const dealer = getCurrentDealer();
    if (!dealer) {
        showToast('No dealer selected', 'warning');
        return null;
    }
    return dealer;
}

window.BrochureGeneratorPagination = {
    loadAllDealers: loadAllDealersWithPagination,
    getCurrentDealer: getCurrentDealer,
    getDealerByIndex: getDealerByIndex,
    getTotalDealerCount: getTotalDealerCount,
    getPaginationInfo: getPaginationInfo,
    next: paginationNext,
    prev: paginationPrev,
    goToFirst: paginationGoToFirst,
    goToLast: paginationGoToLast,
    goToPage: paginationGoToPage,
    setPerPage: paginationSetPerPage,
    setSort: paginationSetSort,
    refresh: paginationRefresh,
    getDealersList: function() { return paginationDealerList; },
    getAllDealers: function() { return paginationAllDealers; },
    getCurrentIndex: function() { return paginationCurrentIndex; },
    generateFlyerForCurrent: generateFlyerForCurrentDealer
};

console.log('✅ Brochure Generator Pagination Add-ons loaded');
// ===================================================
// LOAD DEALERS FROM INDEXEDDB - NEW
// ===================================================

async function loadDealersFromDB() {
    console.log('📊 Loading dealers from IndexedDB...');
    
    try {
        if (typeof DealerDB === 'undefined') {
            console.warn('⚠️ DealerDB not loaded, using localStorage fallback');
            return await getDealersWithOffers();
        }
        
        const dealers = await DealerDB.getAllDealersFromDB();
        console.log(`✅ Loaded ${dealers.length} dealers from IndexedDB`);
        
        return dealers.map(d => ({
            name: d.name,
            normalized: d.normalized,
            phone: d.phone || '',
            district: d.district || '',
            offerCount: d.offerCount || 0,
            hasPhone: !!d.phone,
            myStockCount: d.myStockCount || 0,
            distStockCount: d.distStockCount || 0,
            offers: []
        }));
        
    } catch (error) {
        console.error('❌ Error loading dealers from IndexedDB:', error);
        return await getDealersWithOffers();
    }
}

// ===================================================
// LOAD OFFERS FOR DEALER FROM INDEXEDDB - NEW
// ===================================================

async function loadOffersForDealerFromDB(dealerName, page = 1, pageSize = 20) {
    console.log(`🔍 Loading offers for ${dealerName} from IndexedDB...`);
    
    try {
        if (typeof DealerDB === 'undefined') {
            console.warn('⚠️ DealerDB not loaded, using localStorage fallback');
            const offers = getAllDealerOffers(dealerName);
            return {
                offers: offers.slice(0, pageSize),
                total: offers.length,
                page: page,
                pageSize: pageSize,
                totalPages: Math.ceil(offers.length / pageSize)
            };
        }
        
        return await DealerDB.loadOffersByDealer(dealerName, page, pageSize);
        
    } catch (error) {
        console.error(`❌ Error loading offers for ${dealerName}:`, error);
        return {
            offers: [],
            total: 0,
            page: 1,
            pageSize: pageSize,
            totalPages: 0
        };
    }
}

// ===================================================
// GET STORAGE STATUS - NEW
// ===================================================

async function getStorageStatusFromDB() {
    try {
        if (typeof DealerDB === 'undefined') {
            return { hasData: false, offerCount: 0, dealerCount: 0 };
        }
        return await DealerDB.getStorageStatus();
    } catch (error) {
        return { hasData: false, offerCount: 0, dealerCount: 0, error: error.message };
    }
}
})();
