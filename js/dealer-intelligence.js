// dealer-intelligence.js - COMPLETE FIXED VERSION
// FIXED: Description and Application ONLY from prices.csv

(function () {

    console.log("🚀 Dealer Intelligence System loaded");

    // ===================================================
    // DEPENDENCIES
    // ===================================================

    const Utils = window.Utils || {
        normalizeText: function(t) { 
            return String(t || '').replace(/\s+/g, ' ').trim().toLowerCase(); 
        },
        normalizeDealerName: function(t) { 
            return String(t || '').replace(/\s+/g, ' ').trim().toLowerCase(); 
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
    let currentStock = new Map();  // Stores: part -> {stock, price, description, application} ONLY from prices.csv
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
    // LOAD DISTRIBUTOR STOCK (FROM Excel ONLY)
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
    // LOAD RETAILER MASTER (FROM Excel + localStorage)
    // ===================================================

    async function loadRetailerMaster() {

        retailerMaster.clear();
        
        const customers = getStorageItem('customers') || [];
        console.log(`📋 Customer Master: ${customers.length} customers`);
        
        for (const c of customers) {
            const dealer = normalizeDealerName(c.name);
            if (!dealer) continue;
            
            retailerMaster.set(dealer, {
                dealer: c.name,
                normalized: dealer,
                district: c.district || '',
                mobile: c.mobileNo || c.phone || '',
                phone: c.mobileNo || c.phone || '',
                ownerName: c.business || '',
                customerType: 'customer',
                rlpCode: c.customerCode || '',
                source: 'customer-master'
            });
        }
        
        try {
            const rows = await loadExcelFile('data/RETAILER data details.xlsx', 'SAPUI5 Export');
            console.log(`📋 Excel Master: ${rows.length} entries`);
            
            for (const row of rows) {
                const dealerRaw = String(row['Retailer Name'] || '').trim();
                if (!dealerRaw) continue;
                
                const dealer = normalizeDealerName(dealerRaw);
                const district = row['District'] || '';
                const mobile = row['Mobile No'] || '';
                
                if (!retailerMaster.has(dealer)) {
                    retailerMaster.set(dealer, {
                        dealer: dealerRaw,
                        normalized: dealer,
                        district: district,
                        mobile: mobile,
                        phone: mobile,
                        ownerName: row['Owner Name'] || '',
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
                    dealer: dealerRaw,
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
                    dealer: dealerRaw,
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
    // LOAD RETAILER SALES (FROM Excel ONLY)
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
                    dealerRaw: dealerRaw,
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
    // LOAD MY STOCK (ONLY FROM prices.csv)
    // FIXED: Description and Application ONLY from prices.csv
    // ===================================================

    async function loadMyStock() {

        try {

            console.log("🔄 Fetching stock data ONLY from prices.csv...");

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
                // Fallback: Use XLSX
                console.warn("PapaParse not found, using XLSX fallback");
                const workbook = XLSX.read(csvText, { type: 'string' });
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
                
                let headerRow = rows.find(row => 
                    row.some(cell => 
                        String(cell || '').toLowerCase().includes('material') ||
                        String(cell || '').toLowerCase().includes('part') ||
                        String(cell || '').toLowerCase().includes('description')
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

            // Clear existing stock data
            currentStock.clear();
            console.log(`📊 Processing ${parsedData.length} rows from prices.csv`);

            // Find column names (case insensitive)
            const headers = Object.keys(parsedData[0] || {});
            console.log('📋 Available columns in prices.csv:', headers);

            // ================================================
            // CRITICAL: Find columns ONLY from prices.csv
            // ================================================
            
            // Part column
            let partCol = headers.find(h => 
                h.toLowerCase().includes('material') || 
                h.toLowerCase().includes('part') ||
                h.toLowerCase().includes('item') ||
                h.toLowerCase() === 'partno'
            );
            
            // Description column - ONLY from prices.csv
            let descCol = headers.find(h => 
                h.toLowerCase().includes('description') ||
                h.toLowerCase().includes('desc') ||
                h.toLowerCase().includes('product') ||
                h.toLowerCase().includes('item name')
            );
            
            // Application column - ONLY from prices.csv
            let appCol = headers.find(h => 
                h.toLowerCase().includes('application') ||
                h.toLowerCase().includes('appl') ||
                h.toLowerCase().includes('use') ||
                h.toLowerCase().includes('model') ||
                h.toLowerCase().includes('fitment')
            );
            
            // Price column
            let priceCol = headers.find(h => 
                h.toLowerCase().includes('price') ||
                h.toLowerCase().includes('mrp') ||
                h.toLowerCase().includes('rate') ||
                h.toLowerCase().includes('cost')
            );
            
            // Stock column
            let stockCol = headers.find(h => 
                h.toLowerCase().includes('stock') || 
                h.toLowerCase().includes('qty') ||
                h.toLowerCase().includes('quantity') ||
                h.toLowerCase().includes('avl')
            );

            console.log('🔍 Detected columns from prices.csv:', {
                part: partCol || '⚠️ NOT FOUND',
                description: descCol || '⚠️ NOT FOUND',
                application: appCol || '⚠️ NOT FOUND',
                price: priceCol || '⚠️ NOT FOUND',
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
            let stockCount = 0;

            for (const row of parsedData) {
                if (!row || !row[partCol]) continue;

                const part = normalizeText(row[partCol]);
                if (!part) continue;

                // Get data ONLY from prices.csv
                const stock = safeNumber(row[stockCol]);
                const price = safeNumber(row[priceCol]);
                
                // Description - ONLY from prices.csv
                const description = descCol ? String(row[descCol] || '').trim() : '';
                
                // Application - ONLY from prices.csv
                const application = appCol ? String(row[appCol] || '').trim() : '';

                // Store in currentStock - ONLY from prices.csv
                currentStock.set(part, {
                    stock: stock,
                    price: price,
                    description: description,
                    application: application
                });
                
                loadedCount++;
                if (description) descCount++;
                if (application) appCount++;
                if (stock > 0) stockCount++;
            }

            let totalStock = 0;
            let partsWithStock = 0;
            for (const [part, data] of currentStock) {
                if (data.stock > 0) {
                    totalStock += data.stock;
                    partsWithStock++;
                }
            }

            console.log(`✅ My stock loaded from prices.csv: ${loadedCount} parts`);
            console.log(`   📦 Parts with stock > 0: ${partsWithStock}`);
            console.log(`   📦 Total stock units: ${totalStock}`);
            console.log(`   📝 Parts with description: ${descCount}`);
            console.log(`   🔧 Parts with application: ${appCount}`);
            
            // Show sample data with description and application
            const sample = Array.from(currentStock.entries()).slice(0, 5);
            console.log('📋 Sample stock data from prices.csv:');
            sample.forEach(([part, data]) => {
                console.log(`   ${part}:`);
                console.log(`      Description: ${data.description || '(empty)'}`);
                console.log(`      Application: ${data.application || '(empty)'}`);
                console.log(`      Stock: ${data.stock}, Price: ${data.price}`);
            });

            if (descCount === 0 && appCount === 0) {
                console.warn('⚠️ No description or application found in prices.csv!');
                console.warn('   Available columns:', headers);
                showToast('No description/application found in prices.csv', 'warning');
            }

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
    // ANALYSE INVOICES (FROM localStorage ONLY)
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
                    dealerRaw: dealerRaw,
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
    // CALCULATE OFFER (FIXED)
    // Description and Application come ONLY from currentStock (prices.csv)
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
        let finalPrice = 0;
        let offerType = '';
        let basicPrice = 0;
        let discount = 0;
        let description = '';
        let application = '';
        
        // Get stock data from currentStock (ONLY from prices.csv)
        const stockData = currentStock.get(part);
        
        if (stockType === 'my-stock') {
            // ============================================
            // OUR STOCK OFFER (WITH DISCOUNT)
            // ============================================
            if (!stockData) {
                console.warn(`⚠️ No stock data for part: ${part} (from prices.csv)`);
                return null;
            }
            
            myStock = stockData.stock || 0;
            if (myStock <= 0) {
                console.warn(`⚠️ No stock for part: ${part}`);
                return null;
            }
            
            // Description and Application - ONLY from prices.csv (stockData)
            description = stockData.description || '';
            application = stockData.application || '';
            
            distributorStockQty = 0;
            finalPrice = stockData.price || 0;
            
            if (finalPrice <= 0) {
                console.warn(`⚠️ No price for part: ${part}`);
                return null;
            }
            
            // Calculate discount
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
            
            const pricing = calculateNetPrice(finalPrice, discount);
            basicPrice = pricing.basicPrice;
            const offerPrice = pricing.finalPrice;
            
            if (discount >= 6) {
                offerType = "⭐ Premium Deal";
            } else {
                offerType = volumeTier.label;
            }
            
            return {
                dealer: dealer,
                dealerRaw: dealer,
                part: part,
                description: description,      // ONLY from prices.csv
                application: application,      // ONLY from prices.csv
                avgQty: avgQty,
                pincode: district,
                district: district,
                myStock: myStock,
                distributorStock: 0,
                discount: discount,
                offerType: offerType,
                minQty: 1,
                mrp: finalPrice,
                originalPrice: finalPrice,
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
            // ============================================
            // DISTRIBUTOR STOCK OFFER - MRP ONLY
            // ============================================
            const distItem = distributorStockMap.get(part);
            
            if (!distItem || distItem.stock <= 0) {
                return null;
            }
            
            // Description and Application - ONLY from prices.csv (stockData)
            if (stockData) {
                description = stockData.description || '';
                application = stockData.application || '';
            }
            
            myStock = 0;
            distributorStockQty = distItem.stock;
            finalPrice = distItem.price || 0;
            
            if (finalPrice <= 0) {
                return null;
            }
            
            basicPrice = finalPrice;
            discount = 0;
            const offerPrice = finalPrice;
            
            offerType = "🏭 Distributor Stock (MRP)";
            
            return {
                dealer: dealer,
                dealerRaw: dealer,
                part: part,
                description: description,      // ONLY from prices.csv
                application: application,      // ONLY from prices.csv
                avgQty: avgQty,
                pincode: district,
                district: district,
                myStock: 0,
                distributorStock: distributorStockQty,
                discount: 0,
                offerType: offerType,
                minQty: 1,
                mrp: finalPrice,
                originalPrice: finalPrice,
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
    // SAVE OFFERS TO STORAGE
    // ===================================================

    function saveOffersToStorage() {
        try {
            localStorage.removeItem('dealerOffers');
            console.log("🧹 Cleared old offers from localStorage before saving");
            
            const MAX_OFFERS = 5000;
            let offersToSave = activeOffers;
            
            if (activeOffers.length > MAX_OFFERS) {
                console.warn(`⚠️ Too many offers (${activeOffers.length}), limiting to ${MAX_OFFERS}`);
                offersToSave = activeOffers.slice(0, MAX_OFFERS);
                showToast(`Limited to ${MAX_OFFERS} offers (${activeOffers.length} generated)`, 'warning');
            }
            
            const cleanedOffers = offersToSave.map(o => ({
                dealer: o.dealer || '',
                dealerRaw: o.dealerRaw || '',
                part: o.part || '',
                description: (o.description || '').substring(0, 200),  // From prices.csv
                application: (o.application || '').substring(0, 150),  // From prices.csv
                district: o.district || '',
                myStock: o.myStock || 0,
                distributorStock: o.distributorStock || 0,
                discount: o.discount || 0,
                offerType: o.offerType || '',
                mrp: o.mrp || 0,
                basicPrice: o.basicPrice || 0,
                offerPrice: o.offerPrice || 0,
                gst: o.gst || 0,
                stockType: o.stockType || 'my-stock',
                source: o.source || '',
                expiresAt: o.expiresAt || ''
            }));
            
            const data = {
                generatedAt: new Date().toISOString(),
                offerCount: cleanedOffers.length,
                totalGenerated: activeOffers.length,
                offers: cleanedOffers,
                version: "2.0",
                dataSource: {
                    description: "prices.csv",
                    application: "prices.csv",
                    stock: "prices.csv",
                    distributor: "Excel + localStorage",
                    dealer: "Excel + localStorage"
                }
            };
            
            localStorage.setItem('dealerOffers', JSON.stringify(data));
            console.log(`💾 Saved ${cleanedOffers.length} offers to localStorage`);
            
            const verify = localStorage.getItem('dealerOffers');
            if (verify) {
                const parsed = JSON.parse(verify);
                console.log(`✅ Verification: ${parsed.offers ? parsed.offers.length : 'No offers'} offers found`);
                
                if (parsed.offers && parsed.offers.length > 0) {
                    const sample = parsed.offers[0];
                    console.log('📋 Sample saved offer (description/application from prices.csv):', {
                        part: sample.part,
                        description: sample.description || '(empty)',
                        application: sample.application || '(empty)'
                    });
                }
            }
            
        } catch(err) {
            console.error("Could not save offers:", err.message);
            
            if (err.message && err.message.includes('quota')) {
                try {
                    console.warn("⚠️ Quota exceeded, trying emergency save with 500 offers");
                    const emergencyData = {
                        generatedAt: new Date().toISOString(),
                        offerCount: 500,
                        totalGenerated: activeOffers.length,
                        offers: activeOffers.slice(0, 500).map(o => ({
                            dealer: o.dealer || '',
                            part: o.part || '',
                            description: (o.description || '').substring(0, 100),
                            application: (o.application || '').substring(0, 80),
                            offerPrice: o.offerPrice || 0,
                            discount: o.discount || 0,
                            myStock: o.myStock || 0
                        })),
                        version: "2.0-emergency"
                    };
                    localStorage.setItem('dealerOffers', JSON.stringify(emergencyData));
                    showToast('⚠️ Saved only 500 offers (storage limit reached)', 'warning');
                } catch(e) {
                    console.error("Emergency save also failed:", e);
                    showToast('Storage full! Use "Clear Old Offers" button.', 'error');
                }
            } else {
                showToast("Error saving offers: " + err.message, "error");
            }
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
        console.log("🧹 Cleared ALL old offers from memory and localStorage");
        
        // Load data from different sources
        await loadMyStock();  // ONLY prices.csv - gets description, application, stock, price
        await loadDistributorStockAuto();  // Excel + localStorage - gets distributor stock
        await loadRetailerMaster();  // Excel + localStorage - gets dealer info
        await loadRetailerOfftakeAuto();  // Excel - gets sales data
        analyseInvoices();  // localStorage - gets invoice data
        updateAreaFromOfftake();

        const offers = [];
        const processed = new Set();

        console.log(`📊 Processing ${dealerPartAverages.size} dealer-part combinations...`);

        // Process from invoices
        for (const [key, data] of dealerPartAverages) {

            const master = retailerMaster.get(data.dealer) || {};
            const dealer = data.dealer;
            const part = data.part;
            const avgQty = data.avgQty;
            const district = master.district || '';
            const source = data.source || 'Invoice History';
            
            const myStock = currentStock.get(part)?.stock || 0;
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

        // Process from retailer sales
        for (const retailer of dealerData) {

            const dealer = retailer.dealer;
            const part = retailer.part;
            const avgQty = retailer.avgQty;
            const district = retailer.district;
            const source = retailer.source || 'Excel Offtake';
            
            const myKey = `${dealer}|${part}|my-stock`;
            const distKey = `${dealer}|${part}|distributor-stock`;
            
            if (processed.has(myKey) && processed.has(distKey)) continue;
            
            const myStock = currentStock.get(part)?.stock || 0;
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

        offers.sort((a, b) => b.discount - a.discount);
        
        activeOffers = offers;

        console.log(`📊 Generated ${activeOffers.length} offers`);
        
        // Log sample with description and application
        if (activeOffers.length > 0) {
            const sample = activeOffers.slice(0, 3);
            console.log('📋 Sample offers (description/application from prices.csv):');
            sample.forEach(o => {
                console.log(`   ${o.part}:`);
                console.log(`      Description: ${o.description || '(empty)'}`);
                console.log(`      Application: ${o.application || '(empty)'}`);
                console.log(`      Price: ₹${o.offerPrice}, Stock: ${o.myStock}`);
            });
        }
        
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
            return;
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
                offersGenerated: offers.length,
                myStockOffers: offers.filter(o => o.stockType === 'my-stock').length,
                distStockOffers: offers.filter(o => o.stockType === 'distributor-stock').length,
                highDiscountOffers: offers.filter(o => o.discount >= 5).length,
                lowStockAlerts: offers.filter(o => (o.myStock + o.distributorStock) < CONFIG.lowStockThreshold).length,
                areasAnalysed: areaDemand.size,
                offers: offers.slice(0, displayLimit)
            };

            showToast(`✅ Analysis complete: ${offers.length} offers generated (showing ${displayLimit})`, 'success');
            return result;

        } catch (err) {
            console.error('Analysis error:', err);
            showToast('Analysis failed: ' + err.message, 'error');
            throw err;
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

        let csv = "Dealer,Part No,Description,Application,MRP,Basic Price,Discount %,Offer Price,GST,Our Stock,Dist Stock,Stock Type,Offer Type,Source,Expires\n";

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
        CONFIG,
        isRunning: () => isRunning
    };

})();
