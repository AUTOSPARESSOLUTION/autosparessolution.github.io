// dealer-intelligence.js - COMPLETE FIXED VERSION WITH INDEXEDDB
// FIXED: All dealer names UPPERCASE, All part numbers UPPERCASE
// FIXED: Application column uses M column (Model) correctly
// FIXED: File name "RETAILER data Deatils.xlsx"
// ADDED: IndexedDB support for unlimited offers

(function () {

    console.log("🚀 Dealer Intelligence System loaded");

    // ===================================================
    // DEPENDENCIES
    // ===================================================

    const Utils = window.Utils || {
        normalizeText: function(t) { 
            return String(t || '').replace(/\s+/g, ' ').trim().toUpperCase(); 
        },
        normalizeDealerName: function(t) { 
            return String(t || '').replace(/\s+/g, ' ').trim().toUpperCase(); 
        },
        showToast: function(msg) { console.log(msg); },
        safeNumber: function(n) { return Number(n) || 0; },
        getStorageItem: function(k) { 
            try { return JSON.parse(localStorage.getItem(k)); } catch(e) { return null; }
        },
        setStorageItem: function(k, v) { 
            try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch(e) { return false; }
        },
        removeStorageItem: function(k) { localStorage.removeItem(k); }
    };

    const normalizeText = Utils.normalizeText;
    const normalizeDealerName = Utils.normalizeDealerName;
    const showToast = Utils.showToast;
    const safeNumber = Utils.safeNumber;
    const getStorageItem = Utils.getStorageItem;
    const setStorageItem = Utils.setStorageItem;
    const removeStorageItem = Utils.removeStorageItem;

    // ===================================================
    // CONFIGURATION
    // ===================================================

    const CONFIG = {

        volumeTiers: [
            { min: 50, discount: 6, label: "Strategic Dealer" },
            { min: 20, discount: 5, label: "Bulk Dealer" },
            { min: 10, discount: 4, label: "Regular Dealer" },
            { min: 5, discount: 3, label: "Growing Dealer" },
            { min: 2, discount: 2, label: "Active Dealer" },
            { min: 1, discount: 1, label: "Welcome Offer" }
        ],

        areaMultipliers: {
            high: 1.2,
            medium: 1.1,
            low: 1.0
        },

        lowStockThreshold: 10,
        analysisMonths: 6,
        
        dynamicOffers: {
            maxDiscount: 8,
            minDiscount: 1,
            loyaltyBonus: 1,
            newCustomerBonus: 2,
            urgentStockBonus: 2,
            seasonalBoost: 1
        }
    };

    // ===================================================
    // GLOBAL DATA
    // ===================================================

    let dealerPartAverages = new Map();
    let areaDemand = new Map();
    let currentStock = new Map();
    let activeOffers = [];
    let distributorStock = [];
    let distributorStockMap = new Map();
    let dealerData = [];
    let retailerMaster = new Map();
    let dealerPurchaseHistory = new Map();
    let excelCache = new Map();
    let isRunning = false;

    // ===================================================
    // LOAD EXCEL FILE (CACHED)
    // ===================================================

    async function loadExcelFile(url, sheetName = null) {

        const cacheKey = url + (sheetName || '');
        if (excelCache.has(cacheKey)) {
            return excelCache.get(cacheKey);
        }

        try {

            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Failed to load ${url}`);
            }

            const arrayBuffer = await response.arrayBuffer();
            const workbook = XLSX.read(arrayBuffer, { type: 'array' });

            let sheet;

            if (sheetName && workbook.SheetNames.includes(sheetName)) {
                sheet = workbook.Sheets[sheetName];
            } else {
                sheet = workbook.Sheets[workbook.SheetNames[0]];
            }

            const data = XLSX.utils.sheet_to_json(sheet);
            excelCache.set(cacheKey, data);
            return data;

        } catch (err) {

            console.warn(`Could not load ${url}`, err);
            return [];
        }
    }

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
        
        if (currentStock.has(clean.original)) {
            return currentStock.get(clean.original);
        }
        
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
    // LOAD DISTRIBUTOR STOCK
    // ===================================================

    async function loadDistributorStockAuto() {

        const localStock = getStorageItem('distributorStock');
        
        if (localStock && localStock.length > 0) {
            distributorStock = localStock.map(item => ({
                part: normalizeText(item.part || item['Part No'] || ''),
                distributor: String(item.distributor || item['Distributor Name'] || ''),
                stock: safeNumber(item.stock || item['Available Stock'] || 0),
                price: safeNumber(item.price || 0),
                leadTime: safeNumber(item.leadTime || item['Lead Time (Days)'] || 3)
            })).filter(item => item.part && item.stock > 0);
            
            distributorStockMap.clear();
            distributorStock.forEach(item => {
                distributorStockMap.set(item.part, item);
            });
            
            console.log(`✅ Distributor stock loaded from localStorage: ${distributorStock.length} items`);
            return;
        }
        
        try {
            const rows = await loadExcelFile('data/distributor-stock.xlsx');
            distributorStock = [];

            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                
                let part = null;
                const partPatterns = ['Part No', 'PART NO', 'PartNumber', 'Part Number', 'Item Code', 'Material Code'];
                for (const pattern of partPatterns) {
                    if (row[pattern]) { part = row[pattern]; break; }
                }
                if (!part) {
                    for (const key of Object.keys(row)) {
                        const lower = key.toLowerCase();
                        if (lower.includes('part') || lower.includes('item') || lower.includes('material')) {
                            part = row[key];
                            break;
                        }
                    }
                }
                if (!part) continue;
                
                let distributor = row['Distributor Name'] || row['Distributor'] || row['distributor'] || 'Auto Links';
                
                let stockQty = 0;
                const stockPatterns = ['Available Stock', 'AVAILABLE STOCK', 'Stock', 'Qty', 'QTY', 'Current Stock'];
                for (const pattern of stockPatterns) {
                    if (row[pattern]) { stockQty = safeNumber(row[pattern]); break; }
                }
                if (stockQty === 0) {
                    for (const key of Object.keys(row)) {
                        const lower = key.toLowerCase();
                        if (lower.includes('stock') || lower.includes('qty') || lower.includes('available')) {
                            stockQty = safeNumber(row[key]);
                            if (stockQty > 0) break;
                        }
                    }
                }
                
                let price = 0;
                const pricePatterns = ['Price', 'MRP', 'Rate', 'Cost'];
                for (const pattern of pricePatterns) {
                    if (row[pattern]) { price = safeNumber(row[pattern]); break; }
                }
                if (price === 0) {
                    for (const key of Object.keys(row)) {
                        const lower = key.toLowerCase();
                        if (lower.includes('price') || lower.includes('mrp') || lower.includes('rate')) {
                            price = safeNumber(row[key]);
                            if (price > 0) break;
                        }
                    }
                }
                
                let leadTime = safeNumber(row['Lead Time (Days)'] || row['leadTime'] || 3);
                
                if (part && stockQty > 0) {
                    distributorStock.push({
                        part: normalizeText(part),
                        distributor: String(distributor).trim(),
                        stock: stockQty,
                        price: price,
                        leadTime: leadTime
                    });
                }
            }

            distributorStockMap.clear();
            distributorStock.forEach(item => {
                distributorStockMap.set(item.part, item);
            });

            console.log(`✅ Distributor stock loaded from Excel: ${distributorStock.length} items`);

        } catch(err) {

            console.warn("Could not load distributor-stock.xlsx", err);
            distributorStock = [];
            distributorStockMap.clear();
        }
    }

    // ===================================================
    // LOAD RETAILER MASTER
    // ===================================================

    async function loadRetailerMaster() {

        retailerMaster.clear();
        
        const customers = getStorageItem('customers') || [];
        console.log(`📋 Customer Master: ${customers.length} customers`);
        
        for (const c of customers) {
            const dealer = normalizeDealerName(c.name);
            if (!dealer) continue;
            
            retailerMaster.set(dealer, {
                dealer: c.name.toUpperCase(),
                normalized: dealer,
                district: c.district || '',
                mobile: c.mobileNo || c.phone || '',
                phone: c.mobileNo || c.phone || '',
                ownerName: c.business ? c.business.toUpperCase() : '',
                customerType: 'customer',
                rlpCode: c.customerCode || '',
                source: 'customer-master'
            });
        }
        
        try {
            const rows = await loadExcelFile('data/RETAILER data Deatils.xlsx', 'SAPUI5 Export');
            console.log(`📋 Excel Master: ${rows.length} entries`);
            
            for (const row of rows) {
                const dealerRaw = String(row['Retailer Name'] || '').trim();
                if (!dealerRaw) continue;
                
                const dealer = normalizeDealerName(dealerRaw);
                const district = row['District'] || '';
                const mobile = row['Mobile No'] || '';
                
                if (!retailerMaster.has(dealer)) {
                    retailerMaster.set(dealer, {
                        dealer: dealerRaw.toUpperCase(),
                        normalized: dealer,
                        district: district,
                        mobile: mobile,
                        phone: mobile,
                        ownerName: row['Owner Name'] ? String(row['Owner Name']).toUpperCase() : '',
                        customerType: row['Customer Type'] || '',
                        rlpCode: row['RLP Code'] || '',
                        source: 'excel'
                    });
                } else {
                    const existing = retailerMaster.get(dealer);
                    if (!existing.district && district) existing.district = district;
                    if (!existing.mobile && mobile) {
                        existing.mobile = mobile;
                        existing.phone = mobile;
                    }
                }
            }
        } catch(e) {
            console.warn("Excel master file not found", e);
        }
        
        const users = getStorageItem('users') || [];
        const dealers = getStorageItem('dealers') || [];
        const allLocal = [...users, ...dealers];
        
        for (const u of allLocal) {
            const dealerRaw = u.name || u.business || '';
            if (!dealerRaw) continue;
            
            const dealer = normalizeDealerName(dealerRaw);
            const district = u.district || '';
            const mobile = u.phone || u.mobile || '';
            
            if (!retailerMaster.has(dealer)) {
                retailerMaster.set(dealer, {
                    dealer: dealerRaw.toUpperCase(),
                    normalized: dealer,
                    district: district,
                    mobile: mobile,
                    phone: mobile,
                    source: 'user-dealer'
                });
            } else {
                const existing = retailerMaster.get(dealer);
                if (!existing.district && district) existing.district = district;
                if (!existing.mobile && mobile) {
                    existing.mobile = mobile;
                    existing.phone = mobile;
                }
            }
        }
        
        const allInvoices = getStorageItem('allInvoices') || [];
        for (const inv of allInvoices) {
            let dealerRaw = inv.customerName || inv.buyer?.name || '';
            if (!dealerRaw) continue;
            
            const dealer = normalizeDealerName(dealerRaw);
            let mobile = inv.customerPhone || inv.buyer?.phone || inv.phone || '';
            let district = inv.customerDistrict || inv.buyer?.district || inv.district || '';
            
            if (!retailerMaster.has(dealer)) {
                retailerMaster.set(dealer, {
                    dealer: dealerRaw.toUpperCase(),
                    normalized: dealer,
                    district: district,
                    mobile: mobile,
                    phone: mobile,
                    source: 'invoice'
                });
            } else {
                const existing = retailerMaster.get(dealer);
                if (!existing.district && district) existing.district = district;
                if (!existing.mobile && mobile) {
                    existing.mobile = mobile;
                    existing.phone = mobile;
                }
            }
        }
        
        let withPhone = 0;
        let withDistrict = 0;
        for (const [name, data] of retailerMaster) {
            if (data.mobile) withPhone++;
            if (data.district) withDistrict++;
        }
        
        console.log(`✅ Retailer master: ${retailerMaster.size} dealers`);
        console.log(`   📞 Has phone: ${withPhone} | 📍 Has district: ${withDistrict}`);
    }

    // ===================================================
    // LOAD RETAILER SALES
    // ===================================================

    async function loadRetailerOfftakeAuto() {

        dealerData = [];
        dealerPurchaseHistory.clear();

        const sheets = ['AD', 'LMM'];

        for (const sheetName of sheets) {

            const rows = await loadExcelFile(
                'data/Retailer Wise Part Line Wise Sale.xlsx',
                sheetName
            );

            for (const row of rows) {

                const dealerRaw = String(row['Retailer Name'] || '').trim();
                const dealer = normalizeDealerName(dealerRaw);
                const part = normalizeText(row['Part No'] || '');

                if (!dealer || !part) continue;

                const district = row['Retailer District'] || '';

                const months = ['JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER'];

                let totalQty = 0;
                let monthCount = 0;

                for (const m of months) {
                    const qty = safeNumber(row[m]);
                    totalQty += qty;
                    if (qty > 0) monthCount++;
                }

                const grandTotal = safeNumber(row['Grand Total']);

                if (grandTotal > 0 && totalQty === 0) {
                    totalQty = grandTotal;
                }

                if (monthCount === 0 && totalQty > 0) {
                    monthCount = 1;
                }

                const avgQty = monthCount > 0 ? totalQty / monthCount : 0;

                const master = retailerMaster.get(dealer) || {};

                dealerData.push({
                    dealer: dealer,
                    dealerRaw: dealerRaw.toUpperCase(),
                    part: part,
                    avgQty: avgQty,
                    district: district || master.district || '',
                    mobile: master.mobile || '',
                    source: 'Excel Offtake'
                });
                
                if (!dealerPurchaseHistory.has(dealer)) {
                    dealerPurchaseHistory.set(dealer, {
                        totalParts: 0,
                        totalQty: 0,
                        partCount: 0,
                        lastPurchase: new Date().toISOString()
                    });
                }
                const history = dealerPurchaseHistory.get(dealer);
                history.totalParts += 1;
                history.totalQty += avgQty;
                history.partCount += 1;
            }
        }

        console.log(`✅ Retailer sales: ${dealerData.length}`);
        console.log(`📊 Dealers tracked: ${dealerPurchaseHistory.size}`);
    }

    // ===================================================
    // LOAD MY STOCK
    // ===================================================

    async function loadMyStock() {

        try {

            console.log("🔄 Fetching stock data from prices.csv...");

            const response = await fetch('prices.csv');
            if (!response.ok) {
                throw new Error(`Failed to fetch prices.csv: ${response.status}`);
            }
            
            const csvText = await response.text();
            console.log(`📄 prices.csv loaded: ${csvText.length} characters`);
            
            let parsedData;
            if (typeof Papa !== 'undefined') {
                const result = Papa.parse(csvText, {
                    header: true,
                    skipEmptyLines: true,
                    trimHeaders: true
                });
                parsedData = result.data;
                console.log(`📊 PapaParse loaded ${parsedData.length} rows`);
            } else {
                console.warn("PapaParse not found, using XLSX fallback");
                const workbook = XLSX.read(csvText, { type: 'string' });
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
                
                let headerRow = rows.find(row => 
                    row.some(cell => 
                        String(cell || '').toLowerCase().includes('material') ||
                        String(cell || '').toLowerCase().includes('part')
                    )
                );
                
                if (!headerRow) {
                    headerRow = rows[0];
                }
                
                const headers = headerRow.map(h => String(h || '').trim());
                const dataStart = rows.indexOf(headerRow) + 1;
                
                parsedData = rows.slice(dataStart).map(row => {
                    const obj = {};
                    headers.forEach((h, i) => {
                        obj[h] = row[i] || '';
                    });
                    return obj;
                });
            }

            currentStock.clear();

            const headers = Object.keys(parsedData[0] || {});
            console.log('📋 Available columns in prices.csv:', headers);

            // Column detection
            let partCol = headers.find(h => 
                h.toLowerCase() === 'material' || 
                h.toLowerCase().includes('material') || 
                h.toLowerCase().includes('part')
            );
            
            let descCol = headers.find(h => 
                h.toLowerCase() === 'material2' ||
                h.toLowerCase().includes('description') ||
                h.toLowerCase().includes('desc')
            );
            
            // FIX: Application from Model column (M column)
            let appCol = headers.find(h => 
                h.toLowerCase() === 'model' ||
                h.toLowerCase().includes('model')
            );
            
            if (!appCol) {
                appCol = headers.find(h => 
                    h.toLowerCase().includes('application') ||
                    h.toLowerCase().includes('make') ||
                    h.toLowerCase().includes('segment')
                );
            }
            
            let mrpCol = headers.find(h => 
                h.toLowerCase() === 'mrp price' ||
                h.toLowerCase().includes('mrp price') ||
                h.toLowerCase().includes('mrp') ||
                h.toLowerCase().includes('price')
            );
            
            let stockCol = headers.find(h => 
                h.toLowerCase().includes('stock') || 
                h.toLowerCase().includes('qty')
            );

            console.log('🔍 Detected columns from prices.csv:', {
                part: partCol || '⚠️ NOT FOUND',
                description: descCol || '⚠️ NOT FOUND',
                application: appCol || '⚠️ NOT FOUND (looking for Model column)',
                distMrp: mrpCol || '⚠️ NOT FOUND',
                stock: stockCol || '⚠️ NOT FOUND'
            });

            if (!partCol) {
                console.error('❌ Part column not found in prices.csv!');
                showToast('Part column not found in prices.csv', 'error');
                return;
            }

            let loadedCount = 0;
            let descCount = 0;
            let appCount = 0;

            for (const row of parsedData) {
                if (!row || !row[partCol]) continue;

                const part = String(row[partCol] || '').trim().toUpperCase();
                if (!part) continue;

                const stock = safeNumber(row[stockCol]);
                const distMrp = safeNumber(row[mrpCol]);
                const description = descCol ? String(row[descCol] || '').trim() : '';
                const application = appCol ? String(row[appCol] || '').trim() : '';

                currentStock.set(part, {
                    stock: stock,
                    distMrp: distMrp,
                    description: description,
                    application: application
                });
                
                loadedCount++;
                if (description) descCount++;
                if (application) appCount++;
            }

            let totalStock = 0;
            let partsWithStock = 0;
            let partsWithMRP = 0;
            for (const [part, data] of currentStock) {
                if (data.stock > 0) {
                    totalStock += data.stock;
                    partsWithStock++;
                }
                if (data.distMrp > 0) partsWithMRP++;
            }

            console.log(`✅ My stock loaded from prices.csv: ${loadedCount} parts`);
            console.log(`   📦 Parts with stock > 0: ${partsWithStock}`);
            console.log(`   📦 Total stock units: ${totalStock}`);
            console.log(`   💰 Parts with Dist MRP: ${partsWithMRP}`);
            console.log(`   📝 Parts with description: ${descCount}`);
            console.log(`   🔧 Parts with application (from Model column): ${appCount}`);
            
            const sample = Array.from(currentStock.entries()).slice(0, 5);
            console.log('📋 Sample stock data from prices.csv:');
            sample.forEach(([part, data]) => {
                console.log(`   ${part}:`);
                console.log(`      Dist MRP: ₹${data.distMrp || 0}`);
                console.log(`      Description: ${data.description || '(empty)'}`);
                console.log(`      Application (Model): ${data.application || '(empty)'}`);
                console.log(`      Stock: ${data.stock}`);
            });

        } catch (err) {

            console.error("Error loading prices.csv:", err);
            showToast("Error loading stock data: " + err.message, "error");
        }
    }

    // ===================================================
    // AREA DEMAND
    // ===================================================

    function updateAreaFromOfftake() {

        for (const dealer of dealerData) {

            const district = dealer.district;

            if (!district) continue;

            if (!areaDemand.has(district)) {

                areaDemand.set(district, {
                    totalQty: 0,
                    partWise: new Map(),
                    dealerCount: new Set()
                });
            }

            const area = areaDemand.get(district);

            area.totalQty += dealer.avgQty;
            area.dealerCount.add(dealer.dealer);
            area.partWise.set(
                dealer.part,
                (area.partWise.get(dealer.part) || 0) + dealer.avgQty
            );
        }

        console.log(`✅ Area demand updated`);
    }

    // ===================================================
    // ANALYSE INVOICES
    // ===================================================

    function analyseInvoices() {

        const allInvoices = getStorageItem('allInvoices') || [];

        dealerPartAverages.clear();

        for (const inv of allInvoices) {

            if (!Array.isArray(inv.items)) continue;

            let dealerRaw = inv.customerName || '';

            if (!dealerRaw) {
                dealerRaw = inv.customerEmail || 'Guest';
            }

            const dealer = normalizeDealerName(dealerRaw);

            for (const item of inv.items) {

                const part = normalizeText(item.part);
                const key = `${dealer}|${part}`;

                dealerPartAverages.set(key, {
                    dealer: dealer,
                    dealerRaw: dealerRaw.toUpperCase(),
                    part: part,
                    avgQty: safeNumber(item.qty),
                    pincode: inv.customerPincode || '',
                    district: '',
                    source: 'Invoice History'
                });
            }
        }

        console.log(`✅ Invoice analysis complete`);
    }

    // ===================================================
    // AREA MULTIPLIER
    // ===================================================

    function getAreaDemandMultiplier(area) {

        if (!areaDemand.has(area)) {
            return 1.0;
        }

        const a = areaDemand.get(area);

        if (a.totalQty > 1000) {
            return CONFIG.areaMultipliers.high;
        }

        if (a.totalQty > 500) {
            return CONFIG.areaMultipliers.medium;
        }

        return CONFIG.areaMultipliers.low;
    }

    // ===================================================
    // CENTRALIZED PRICE CALCULATION
    // ===================================================

    function calculateNetPrice(mrp, discount = 0) {
        const basic = mrp - (mrp * 31.77 / 100);
        const afterDiscount = basic - (basic * discount / 100);
        const withGST = afterDiscount * 1.18;
        return {
            mrp: mrp,
            basicPrice: basic,
            discount: discount,
            discountedPrice: afterDiscount,
            finalPrice: withGST,
            gst: withGST - afterDiscount
        };
    }

    // ===================================================
    // DISCOUNT DETERMINATION SYSTEM
    // ===================================================

    function calculateDiscount(avgQty, myStock, district, dealer, part) {
        let discount = 0;
        
        let volumeTier = CONFIG.volumeTiers[5];
        for (const tier of CONFIG.volumeTiers) {
            if (avgQty >= tier.min) {
                volumeTier = tier;
                break;
            }
        }
        discount = volumeTier.discount;
        
        const multiplier = getAreaDemandMultiplier(district);
        discount = Math.min(discount * multiplier, CONFIG.dynamicOffers.maxDiscount);
        
        const dealerHistory = dealerPurchaseHistory.get(dealer);
        if (dealerHistory && dealerHistory.totalQty > 50) {
            discount += CONFIG.dynamicOffers.loyaltyBonus;
        }
        
        if (dealerHistory && dealerHistory.partCount <= 3 && avgQty > 0) {
            discount += CONFIG.dynamicOffers.newCustomerBonus;
        }
        
        if (myStock < CONFIG.lowStockThreshold && myStock > 0) {
            discount += CONFIG.dynamicOffers.urgentStockBonus;
        }
        
        const currentMonth = new Date().getMonth();
        const festiveMonths = [10, 11, 12];
        if (festiveMonths.includes(currentMonth)) {
            discount += CONFIG.dynamicOffers.seasonalBoost;
        }
        
        discount = Math.min(Math.round(discount), CONFIG.dynamicOffers.maxDiscount);
        discount = Math.max(discount, CONFIG.dynamicOffers.minDiscount);
        
        return discount;
    }

    // ===================================================
    // CALCULATE OFFER
    // ===================================================

    function calculateOffer(
        dealer,
        part,
        avgQty,
        district,
        source,
        stockType
    ) {
        
        let myStock = 0;
        let distributorStockQty = 0;
        let offerType = '';
        let basicPrice = 0;
        let discount = 0;
        let description = '';
        let application = '';
        let mrp = 0;
        let distMrp = 0;
        
        const stockData = findPartMatch(part);
        
        if (stockData) {
            distMrp = stockData.distMrp || 0;
            description = stockData.description || '';
            application = stockData.application || '';
            myStock = stockData.stock || 0;
        }
        
        mrp = distMrp;
        
        if (stockType === 'my-stock') {
            if (myStock <= 0 || mrp <= 0) return null;
            
            distributorStockQty = 0;
            
            discount = calculateDiscount(avgQty, myStock, district, dealer, part);
            
            const pricing = calculateNetPrice(mrp, discount);
            basicPrice = pricing.basicPrice;
            const offerPrice = pricing.finalPrice;
            
            if (discount >= 6) {
                offerType = "⭐ Premium Deal";
            } else {
                let volumeTier = CONFIG.volumeTiers[5];
                for (const tier of CONFIG.volumeTiers) {
                    if (avgQty >= tier.min) {
                        volumeTier = tier;
                        break;
                    }
                }
                offerType = volumeTier.label;
            }
            
            return {
                dealer: dealer,
                dealerRaw: dealer,
                part: part,
                description: description,
                application: application,
                avgQty: avgQty,
                pincode: district,
                district: district,
                myStock: myStock,
                distributorStock: 0,
                discount: discount,
                offerType: offerType,
                minQty: 1,
                mrp: mrp,
                originalPrice: mrp,
                basicPrice: basicPrice,
                offerPrice: offerPrice,
                gst: pricing.gst,
                stockType: 'my-stock',
                priceSource: 'my-stock',
                source: source,
                generatedAt: new Date().toISOString(),
                expiresAt: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString()
            };
            
        } else if (stockType === 'distributor-stock') {
            const distItem = distributorStockMap.get(part);
            
            if (!distItem || distItem.stock <= 0) return null;
            
            distributorStockQty = distItem.stock;
            
            if (mrp <= 0) {
                mrp = distItem.price || 0;
            }
            
            if (mrp <= 0) return null;
            
            basicPrice = mrp;
            discount = 0;
            const offerPrice = mrp;
            
            offerType = "🏭 Distributor Stock (MRP)";
            
            return {
                dealer: dealer,
                dealerRaw: dealer,
                part: part,
                description: description,
                application: application,
                avgQty: avgQty,
                pincode: district,
                district: district,
                myStock: 0,
                distributorStock: distributorStockQty,
                discount: 0,
                offerType: offerType,
                minQty: 1,
                mrp: mrp,
                originalPrice: mrp,
                basicPrice: basicPrice,
                offerPrice: offerPrice,
                gst: 0,
                stockType: 'distributor-stock',
                priceSource: 'distributor-stock',
                source: source,
                generatedAt: new Date().toISOString(),
                expiresAt: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString()
            };
        }
        
        return null;
    }

    // ===================================================
    // SAVE TO INDEXEDDB - NEW
    // ===================================================

    async function saveToIndexedDB() {
        try {
            if (typeof DealerDB === 'undefined') {
                console.warn('⚠️ DealerDB not loaded, falling back to localStorage');
                saveOffersToStorage();
                return;
            }
            
            console.log('💾 Saving offers to IndexedDB...');
            const result = await DealerDB.saveOffersToDB(activeOffers);
            
            if (result.success) {
                console.log(`✅ Saved ${result.offersSaved} offers, ${result.dealersSaved} dealers to IndexedDB`);
                showToast(`✅ Saved ${result.offersSaved} offers to database`, 'success');
            } else {
                console.error('❌ Failed to save to IndexedDB:', result.error);
                saveOffersToStorage();
            }
            
            return result;
            
        } catch (error) {
            console.error('❌ Error saving to IndexedDB:', error);
            saveOffersToStorage();
            return { success: false, error: error.message };
        }
    }

    // ===================================================
    // SAVE OFFERS TO STORAGE (localStorage - backup)
    // ===================================================

    function saveOffersToStorage() {
        try {
            localStorage.removeItem('dealerOffers');
            
            const MAX_OFFERS = 5000;
            let offersToSave = activeOffers;
            
            if (activeOffers.length > MAX_OFFERS) {
                console.warn(`⚠️ Too many offers (${activeOffers.length}), limiting to ${MAX_OFFERS}`);
                offersToSave = activeOffers.slice(0, MAX_OFFERS);
            }
            
            const data = {
                generatedAt: new Date().toISOString(),
                offerCount: offersToSave.length,
                totalGenerated: activeOffers.length,
                offers: offersToSave,
                version: "2.0"
            };
            
            localStorage.setItem('dealerOffers', JSON.stringify(data));
            console.log(`💾 Saved ${offersToSave.length} offers to localStorage (backup)`);
            
        } catch(err) {
            console.error("Could not save offers:", err.message);
        }
    }

    // ===================================================
    // GENERATE OFFERS
    // ===================================================

    async function generateOffers() {

        areaDemand.clear();
        
        console.log("🔄 Generating new offers...");
        
        activeOffers = [];
        dealerPartAverages.clear();
        localStorage.removeItem('dealerOffers');
        console.log("🧹 Cleared ALL old offers");
        
        await loadMyStock();
        await loadDistributorStockAuto();
        await loadRetailerMaster();
        await loadRetailerOfftakeAuto();
        analyseInvoices();
        updateAreaFromOfftake();

        const offers = [];
        const processed = new Set();

        console.log(`📊 Processing ${dealerPartAverages.size} dealer-part combinations...`);

        for (const [key, data] of dealerPartAverages) {

            const master = retailerMaster.get(data.dealer) || {};
            const dealer = data.dealer;
            const part = data.part;
            const avgQty = data.avgQty;
            const district = master.district || '';
            const source = data.source || 'Invoice History';
            
            const stockData = findPartMatch(part);
            const myStock = stockData ? stockData.stock || 0 : 0;
            const distItem = distributorStockMap.get(part);
            const distStock = distItem?.stock || 0;
            const distPrice = distItem?.price || 0;
            
            if (myStock > 0) {
                const offer = calculateOffer(
                    dealer, part, avgQty, district, source, 'my-stock'
                );
                if (offer) {
                    offers.push(offer);
                    processed.add(`${dealer}|${part}|my-stock`);
                }
            }
            
            if (distStock > 0 && distPrice > 0) {
                const offer = calculateOffer(
                    dealer, part, avgQty, district, source, 'distributor-stock'
                );
                if (offer) {
                    offers.push(offer);
                    processed.add(`${dealer}|${part}|distributor-stock`);
                }
            }
        }

        for (const retailer of dealerData) {

            const dealer = retailer.dealer;
            const part = retailer.part;
            const avgQty = retailer.avgQty;
            const district = retailer.district;
            const source = retailer.source || 'Excel Offtake';
            
            const myKey = `${dealer}|${part}|my-stock`;
            const distKey = `${dealer}|${part}|distributor-stock`;
            
            if (processed.has(myKey) && processed.has(distKey)) continue;
            
            const stockData = findPartMatch(part);
            const myStock = stockData ? stockData.stock || 0 : 0;
            const distItem = distributorStockMap.get(part);
            const distStock = distItem?.stock || 0;
            const distPrice = distItem?.price || 0;
            
            if (myStock > 0 && !processed.has(myKey)) {
                const offer = calculateOffer(
                    dealer, part, avgQty, district, source, 'my-stock'
                );
                if (offer) {
                    offers.push(offer);
                    processed.add(myKey);
                }
            }
            
            if (distStock > 0 && distPrice > 0 && !processed.has(distKey)) {
                const offer = calculateOffer(
                    dealer, part, avgQty, district, source, 'distributor-stock'
                );
                if (offer) {
                    offers.push(offer);
                    processed.add(distKey);
                }
            }
        }

        offers.sort((a, b) => {
            const dealerA = a.dealer || '';
            const dealerB = b.dealer || '';
            return dealerA.localeCompare(dealerB);
        });
        
        activeOffers = offers;

        console.log(`📊 Generated ${activeOffers.length} offers`);
        
        // ================================================
        // FIX: Save to IndexedDB AND localStorage
        // ================================================
        await saveToIndexedDB();
        saveOffersToStorage();

        const myStockOffers = activeOffers.filter(o => o.stockType === 'my-stock');
        const distStockOffers = activeOffers.filter(o => o.stockType === 'distributor-stock');

        console.log(`✅ Offers generated: ${activeOffers.length}`);
        console.log(`   📦 My Stock Offers: ${myStockOffers.length}`);
        console.log(`   🏭 Distributor Stock Offers: ${distStockOffers.length}`);

        return activeOffers;
    }

    // ===================================================
    // GET FUNCTIONS
    // ===================================================

    function getDistributorStock() {
        return distributorStock;
    }

    function getDistributorStockMap() {
        return distributorStockMap;
    }

    function getRetailerMaster() {
        return retailerMaster;
    }

    function getCurrentStock() {
        return currentStock;
    }

    function getActiveOffers() {
        return activeOffers;
    }

    // ===================================================
    // RUN FULL ANALYSIS
    // ===================================================

    async function runFullAnalysis() {

        if (isRunning) {
            showToast('Analysis already running...', 'warning');
            return null;
        }

        isRunning = true;
        
        const btn = document.getElementById('runAnalysisBtn');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Running...';
        }

        try {
            console.log("Running full analysis...");
            showToast('Running analysis...', 'info');
            
            activeOffers = [];
            dealerPartAverages.clear();
            localStorage.removeItem('dealerOffers');
            console.log("🧹 Cleared all old offers before analysis");

            const offers = await generateOffers();

            const displayLimit = 100;
            const result = {
                timestamp: new Date().toISOString(),
                offersGenerated: offers ? offers.length : 0,
                myStockOffers: offers ? offers.filter(o => o.stockType === 'my-stock').length : 0,
                distStockOffers: offers ? offers.filter(o => o.stockType === 'distributor-stock').length : 0,
                highDiscountOffers: offers ? offers.filter(o => o.discount >= 5).length : 0,
                lowStockAlerts: offers ? offers.filter(o => (o.myStock + o.distributorStock) < CONFIG.lowStockThreshold).length : 0,
                areasAnalysed: areaDemand ? areaDemand.size : 0,
                offers: offers ? offers.slice(0, displayLimit) : []
            };

            showToast(`✅ Analysis complete: ${result.offersGenerated} offers generated`, 'success');
            console.log('✅ Analysis complete.');
            return result;

        } catch (err) {
            console.error('Analysis error:', err);
            showToast('Analysis failed: ' + err.message, 'error');
            return {
                timestamp: new Date().toISOString(),
                offersGenerated: 0,
                myStockOffers: 0,
                distStockOffers: 0,
                highDiscountOffers: 0,
                lowStockAlerts: 0,
                areasAnalysed: 0,
                offers: []
            };
        } finally {
            isRunning = false;
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-sync"></i> Run Analysis';
            }
        }
    }

    // ===================================================
    // CLEAR OFFERS
    // ===================================================

    function clearOffers() {
        activeOffers = [];
        dealerPartAverages.clear();
        localStorage.removeItem('dealerOffers');
        localStorage.removeItem('offers');
        console.log("🧹 All offers cleared completely");
        showToast('All offers cleared', 'warning');
    }

    // ===================================================
    // CLEAR CACHE
    // ===================================================

    function clearCache() {
        excelCache.clear();
        console.log("🧹 Excel cache cleared");
        showToast('Cache cleared', 'info');
    }

    // ===================================================
    // REFRESH STOCK
    // ===================================================

    async function refreshStock() {
        await loadDistributorStockAuto();
        console.log(`Stock refreshed: ${distributorStock.length} distributor items`);
        return distributorStock.length;
    }

    // ===================================================
    // EXPORT
    // ===================================================

    function exportOffersCSV() {
        if (activeOffers.length === 0) return null;

        let csv = "Dealer,Part No,Description,Application (Model),MRP (Dist MRP),Basic Price,Discount %,Offer Price,GST,Our Stock,Dist Stock,Stock Type,Offer Type,Source,Expires\n";

        for (const o of activeOffers) {
            csv += `"${o.dealer}",${o.part},"${o.description || ''}","${o.application || ''}",${o.mrp.toFixed(2)},${o.basicPrice.toFixed(2)},${o.discount},${o.offerPrice.toFixed(2)},${o.gst ? o.gst.toFixed(2) : 0},${o.myStock},${o.distributorStock},"${o.stockType || 'unknown'}","${o.offerType || 'Standard'}","${o.source || 'Unknown'}",${o.expiresAt ? new Date(o.expiresAt).toLocaleDateString() : 'N/A'}\n`;
        }

        return csv;
    }

    // ===================================================
    // AUTO RUN
    // ===================================================

    setTimeout(async () => {
        try {
            await runFullAnalysis();
        } catch(err) {
            console.error("Auto-run failed:", err);
        }
    }, 3000);

    // ===================================================
    // GLOBAL EXPORTS
    // ===================================================

    window.DealerIntelligence = {
        runFullAnalysis,
        generateOffers,
        getDistributorStock,
        getDistributorStockMap,
        getRetailerMaster,
        getCurrentStock,
        getActiveOffers,
        loadRetailerMaster,
        clearOffers,
        clearCache,
        refreshStock,
        exportOffersCSV,
        calculateNetPrice,
        calculateDiscount,
        findPartMatch,
        cleanPartNumber,
        saveToIndexedDB,
        CONFIG,
        isRunning: () => isRunning
    };

})();
