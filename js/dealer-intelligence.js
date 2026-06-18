// dealer-intelligence.js - COMPLETE FIXED VERSION
// FIX 1: Distributor Stock = MRP ONLY (NO 31.77%, NO DISCOUNT)
// FIX 2: Individual stock display (Our Stock OR Dist Stock, NOT combined)

(function () {

    console.log("🚀 Dealer Intelligence System loaded (FIXED: Individual Stock Display)");

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
    let dealerData = [];
    let retailerMaster = new Map();
    let dealerPurchaseHistory = new Map();

    // ===================================================
    // HELPER FUNCTIONS
    // ===================================================

    function normalizeText(t) {
        return String(t || "")
            .replace(/[\u200B-\u200D\uFEFF]/g, "")
            .replace(/\n|\r|\t/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .toUpperCase();
    }

    function cleanPhone(p) {
        let x = String(p || "").replace(/\D/g, "");
        if (!x) return "";
        if (x.length === 10) return "91" + x;
        if (x.length === 11 && x.startsWith("0")) return "91" + x.substring(1);
        if (x.length === 12 && x.startsWith("91")) return x;
        return x;
    }

    // ===================================================
    // LOAD EXCEL FILE
    // ===================================================

    async function loadExcelFile(url, sheetName = null) {

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

            return XLSX.utils.sheet_to_json(sheet);

        } catch (err) {

            console.warn(`Could not load ${url}`, err);
            return [];
        }
    }

    // ===================================================
    // LOAD DISTRIBUTOR STOCK
    // ===================================================

    async function loadDistributorStockAuto() {

        const localStock = localStorage.getItem('distributorStock');
        
        if (localStock) {
            try {
                const parsedStock = JSON.parse(localStock);
                if (parsedStock && parsedStock.length > 0) {
                    distributorStock = parsedStock.map(item => ({
                        part: String(item.part || item['Part No'] || '').trim(),
                        distributor: String(item.distributor || item['Distributor Name'] || ''),
                        stock: Number(item.stock || item['Available Stock'] || 0),
                        price: Number(item.price || 0),
                        leadTime: Number(item.leadTime || item['Lead Time (Days)'] || 3)
                    })).filter(item => item.part && item.stock > 0);
                    
                    console.log(`✅ Distributor stock loaded from localStorage: ${distributorStock.length} items`);
                    return;
                }
            } catch(e) {
                console.warn("Error parsing localStorage stock", e);
            }
        }
        
        try {
            const rows = await loadExcelFile('data/distributor-stock.xlsx');
            distributorStock = [];

            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                
                let part = row['Part No'] || row['part_no'] || row['PartNumber'] || row['Part'];
                if (!part) continue;
                
                let distributor = row['Distributor Name'] || row['Distributor'] || row['distributor'] || 'Auto Links';
                
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
                    stockQty = Number(row['Available Stock'] || row['stock'] || row['Stock'] || 0);
                }
                
                let price = Number(row['Price'] || row['price'] || 0);
                let leadTime = Number(row['Lead Time (Days)'] || row['leadTime'] || 3);
                
                if (part && stockQty > 0) {
                    distributorStock.push({
                        part: String(part).trim(),
                        distributor: String(distributor).trim(),
                        stock: stockQty,
                        price: price,
                        leadTime: leadTime
                    });
                }
            }

            console.log(`✅ Distributor stock loaded from Excel file: ${distributorStock.length} items`);

        } catch(err) {

            console.warn("Could not load distributor-stock.xlsx", err);
            distributorStock = [];
        }
    }

    // ===================================================
    // LOAD RETAILER MASTER
    // ===================================================

    async function loadRetailerMaster() {

        retailerMaster.clear();
        
        const customers = JSON.parse(localStorage.getItem('customers') || '[]');
        console.log(`📋 Customer Master loaded: ${customers.length} customers`);
        
        for (const c of customers) {
            const dealer = c.name || '';
            if (!dealer) continue;
            
            retailerMaster.set(dealer, {
                dealer: dealer,
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
            console.log(`📋 Excel Master loaded: ${rows.length} entries`);
            
            for (const row of rows) {
                const dealer = String(row['Retailer Name'] || '').trim();
                if (!dealer) continue;
                
                const district = row['District'] || '';
                const mobile = row['Mobile No'] || '';
                
                if (!retailerMaster.has(dealer)) {
                    retailerMaster.set(dealer, {
                        dealer: dealer,
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
        
        const users = JSON.parse(localStorage.getItem('users') || '[]');
        const dealers = JSON.parse(localStorage.getItem('dealers') || '[]');
        const allLocal = [...users, ...dealers];
        
        for (const u of allLocal) {
            const dealer = u.name || u.business || '';
            if (!dealer) continue;
            
            const district = u.district || '';
            const mobile = u.phone || u.mobile || '';
            
            if (!retailerMaster.has(dealer)) {
                retailerMaster.set(dealer, {
                    dealer: dealer,
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
        
        const allInvoices = JSON.parse(localStorage.getItem('allInvoices') || '[]');
        for (const inv of allInvoices) {
            let dealer = inv.customerName || inv.buyer?.name || '';
            if (!dealer) continue;
            
            let mobile = inv.customerPhone || inv.buyer?.phone || inv.phone || '';
            let district = inv.customerDistrict || inv.buyer?.district || inv.district || '';
            
            if (!retailerMaster.has(dealer)) {
                retailerMaster.set(dealer, {
                    dealer: dealer,
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
        
        console.log(`✅ Retailer master loaded: ${retailerMaster.size} dealers`);
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

                const dealer = String(row['Retailer Name'] || '').trim();
                const part = String(row['Part No'] || '').trim();

                if (!dealer || !part) continue;

                const district = row['Retailer District'] || '';

                const months = ['JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER'];

                let totalQty = 0;
                let monthCount = 0;

                for (const m of months) {
                    const qty = parseFloat(row[m]) || 0;
                    totalQty += qty;
                    if (qty > 0) monthCount++;
                }

                const grandTotal = parseFloat(row['Grand Total']) || 0;

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

        console.log(`✅ Retailer sales loaded: ${dealerData.length}`);
        console.log(`📊 Dealers tracked: ${dealerPurchaseHistory.size}`);
    }

    // ===================================================
    // LOAD MY STOCK (ALWAYS FETCH LATEST)
    // ===================================================

    async function loadMyStock() {

        try {

            console.log("🔄 Fetching latest stock from prices.csv...");

            const response = await fetch('prices.csv');
            const csvText = await response.text();
            const rows = csvText.split('\n').slice(1);

            currentStock.clear();

            for (const row of rows) {

                const cols = row.split(',');

                if (!cols[0]) continue;

                const part = cols[0].trim();
                const stock = parseInt(cols[7]) || 0;
                const price = parseFloat(cols[3]) || 0;

                currentStock.set(part, {
                    stock,
                    price
                });
            }

            let totalStock = 0;
            let partsWithStock = 0;
            for (const [part, data] of currentStock) {
                if (data.stock > 0) {
                    totalStock += data.stock;
                    partsWithStock++;
                }
            }

            console.log(`✅ My stock loaded: ${currentStock.size} parts`);
            console.log(`   📦 Parts with stock > 0: ${partsWithStock}`);
            console.log(`   📦 Total stock units: ${totalStock}`);

        } catch (err) {

            console.error("Error loading prices.csv:", err);
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

        const allInvoices = JSON.parse(localStorage.getItem('allInvoices') || '[]');

        dealerPartAverages.clear();

        for (const inv of allInvoices) {

            if (!Array.isArray(inv.items)) continue;

            let dealerName = inv.customerName || '';

            if (!dealerName) {
                dealerName = inv.customerEmail || 'Guest';
            }

            for (const item of inv.items) {

                const key = `${dealerName}|${item.part}`;

                dealerPartAverages.set(key, {
                    dealer: dealerName,
                    part: item.part,
                    avgQty: parseFloat(item.qty) || 0,
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
    // CALCULATE OFFER - FIXED: Individual Stock Display
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
        let stockQty = 0;
        let basicPrice = 0;
        let discount = 0;
        
        if (stockType === 'my-stock') {
            // ============================================
            // OUR STOCK OFFER (WITH DISCOUNT)
            // ============================================
            myStock = currentStock.get(part)?.stock || 0;
            
            if (myStock <= 0) {
                return null;
            }
            
            distributorStockQty = 0;
            finalPrice = currentStock.get(part)?.price || 0;
            stockQty = myStock;
            
            // Calculate discount (ONLY for our stock)
            let volumeTier = CONFIG.volumeTiers[5];
            for (const tier of CONFIG.volumeTiers) {
                if (avgQty >= tier.min) {
                    volumeTier = tier;
                    break;
                }
            }
            discount = volumeTier.discount;
            
            // Area multiplier
            const multiplier = getAreaDemandMultiplier(district);
            discount = Math.min(discount * multiplier, CONFIG.dynamicOffers.maxDiscount);
            
            // Loyalty bonus
            const dealerHistory = dealerPurchaseHistory.get(dealer);
            if (dealerHistory && dealerHistory.totalQty > 50) {
                discount += CONFIG.dynamicOffers.loyaltyBonus;
            }
            
            // New customer bonus
            if (dealerHistory && dealerHistory.partCount <= 3 && avgQty > 0) {
                discount += CONFIG.dynamicOffers.newCustomerBonus;
            }
            
            // Urgent stock bonus
            if (myStock < CONFIG.lowStockThreshold && myStock > 0) {
                discount += CONFIG.dynamicOffers.urgentStockBonus;
            }
            
            // Seasonal boost
            const currentMonth = new Date().getMonth();
            const festiveMonths = [10, 11, 12];
            if (festiveMonths.includes(currentMonth)) {
                discount += CONFIG.dynamicOffers.seasonalBoost;
            }
            
            discount = Math.min(Math.round(discount), CONFIG.dynamicOffers.maxDiscount);
            discount = Math.max(discount, CONFIG.dynamicOffers.minDiscount);
            
            // Calculate Basic Price (31.77% deduction) and Offer Price
            basicPrice = finalPrice - (finalPrice * 31.77 / 100);
            const offerPrice = basicPrice * (1 - discount / 100);
            
            if (discount >= 6) {
                offerType = "⭐ Premium Deal";
            } else {
                offerType = volumeTier.label;
            }
            
            return {
                dealer,
                part,
                avgQty,
                pincode: district,
                district: district,
                myStock: myStock,
                distributorStock: 0,
                totalStock: myStock,
                discount: discount,
                offerType: offerType,
                minQty: 1,
                mrp: finalPrice,
                originalPrice: finalPrice,
                basicPrice: basicPrice,
                offerPrice: offerPrice,
                stockType: 'my-stock',
                priceSource: 'my-stock',
                source: source,
                generatedAt: new Date().toISOString(),
                expiresAt: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString()
            };
            
        } else if (stockType === 'distributor-stock') {
            // ============================================
            // DISTRIBUTOR STOCK OFFER - MRP ONLY (NO 31.77%, NO DISCOUNT)
            // ============================================
            const distItem = distributorStock.find(d => d.part === part);
            
            if (!distItem || distItem.stock <= 0) {
                return null;
            }
            
            myStock = 0;
            distributorStockQty = distItem.stock;
            finalPrice = distItem.price || 0;
            stockQty = distributorStockQty;
            
            if (finalPrice <= 0) {
                return null;
            }
            
            // NO 31.77% deduction, NO discount - just MRP
            basicPrice = finalPrice; // MRP as Basic Price
            discount = 0;
            const offerPrice = finalPrice; // Offer Price = MRP
            
            offerType = "🏭 Distributor Stock (MRP)";
            
            return {
                dealer,
                part,
                avgQty,
                pincode: district,
                district: district,
                myStock: 0,
                distributorStock: distributorStockQty,
                totalStock: distributorStockQty,
                discount: 0,
                offerType: offerType,
                minQty: 1,
                mrp: finalPrice,
                originalPrice: finalPrice,
                basicPrice: basicPrice,  // MRP only, no 31.77% deduction
                offerPrice: offerPrice,  // MRP only, no discount
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
    // GENERATE OFFERS
    // ===================================================

    async function generateOffers() {

        areaDemand.clear();
        
        console.log("🔄 Generating new offers...");
        
        await loadMyStock();
        await loadDistributorStockAuto();
        
        console.log(`📦 My Stock: ${currentStock.size} parts`);
        console.log(`🏭 Distributor Stock: ${distributorStock.length} parts`);

        await loadRetailerMaster();
        await loadRetailerOfftakeAuto();
        analyseInvoices();
        updateAreaFromOfftake();

        const offers = [];
        const processed = new Set();

        // Process from invoices
        for (const [key, data] of dealerPartAverages) {

            const master = retailerMaster.get(String(data.dealer).trim()) || {};
            const dealerName = data.dealer;
            const part = data.part;
            const avgQty = data.avgQty;
            const district = master.district || '';
            const source = data.source || 'Invoice History';
            
            const myStock = currentStock.get(part)?.stock || 0;
            const distItem = distributorStock.find(d => d.part === part);
            const distStock = distItem?.stock || 0;
            const distPrice = distItem?.price || 0;
            
            // Our Stock offer
            if (myStock > 0) {
                const offer = calculateOffer(
                    dealerName, part, avgQty, district, source, 'my-stock'
                );
                if (offer) {
                    offers.push(offer);
                    processed.add(`${dealerName}|${part}|my-stock`);
                }
            }
            
            // Distributor Stock offer (MRP only)
            if (distStock > 0 && distPrice > 0) {
                const offer = calculateOffer(
                    dealerName, part, avgQty, district, source, 'distributor-stock'
                );
                if (offer) {
                    offers.push(offer);
                    processed.add(`${dealerName}|${part}|distributor-stock`);
                }
            }
        }

        // Process from retailer sales
        for (const retailer of dealerData) {

            const dealerName = retailer.dealer;
            const part = retailer.part;
            const avgQty = retailer.avgQty;
            const district = retailer.district;
            const source = retailer.source || 'Excel Offtake';
            
            const myKey = `${dealerName}|${part}|my-stock`;
            const distKey = `${dealerName}|${part}|distributor-stock`;
            
            if (processed.has(myKey) && processed.has(distKey)) continue;
            
            const myStock = currentStock.get(part)?.stock || 0;
            const distItem = distributorStock.find(d => d.part === part);
            const distStock = distItem?.stock || 0;
            const distPrice = distItem?.price || 0;
            
            if (myStock > 0 && !processed.has(myKey)) {
                const offer = calculateOffer(
                    dealerName, part, avgQty, district, source, 'my-stock'
                );
                if (offer) {
                    offers.push(offer);
                    processed.add(myKey);
                }
            }
            
            if (distStock > 0 && distPrice > 0 && !processed.has(distKey)) {
                const offer = calculateOffer(
                    dealerName, part, avgQty, district, source, 'distributor-stock'
                );
                if (offer) {
                    offers.push(offer);
                    processed.add(distKey);
                }
            }
        }

        offers.sort((a, b) => b.discount - a.discount);

        activeOffers = offers;

        saveOffersToStorage();

        const myStockOffers = offers.filter(o => o.stockType === 'my-stock');
        const distStockOffers = offers.filter(o => o.stockType === 'distributor-stock');

        console.log(`✅ Offers generated: ${offers.length}`);
        console.log(`   📦 My Stock Offers: ${myStockOffers.length}`);
        console.log(`   🏭 Distributor Stock Offers: ${distStockOffers.length}`);
        console.log(`📊 Offer types:`, offers.reduce((acc, o) => {
            acc[o.offerType] = (acc[o.offerType] || 0) + 1;
            return acc;
        }, {}));

        return offers;
    }

    // ===================================================
    // SAVE OFFERS
    // ===================================================

    function saveOffersToStorage() {
        try {
            localStorage.setItem(
                'dealerOffers',
                JSON.stringify({
                    generatedAt: new Date().toISOString(),
                    offerCount: activeOffers.length,
                    offers: activeOffers
                })
            );
        } catch(err) {
            console.warn("Could not save offers to localStorage (quota exceeded)", err.message);
        }
    }

    // ===================================================
    // EXPORT CSV
    // ===================================================

    function exportOffersCSV() {
        if (activeOffers.length === 0) return null;

        let csv = "Dealer,Part No,MRP,Basic Price,Discount %,Offer Price,Our Stock,Dist Stock,Total Stock,Stock Type,Offer Type,Source,Expires\n";

        for (const o of activeOffers) {
            csv += `"${o.dealer}",${o.part},${o.mrp.toFixed(2)},${o.basicPrice.toFixed(2)},${o.discount},${o.offerPrice.toFixed(2)},${o.myStock},${o.distributorStock},${o.totalStock},"${o.stockType || 'unknown'}","${o.offerType || 'Standard'}","${o.source || 'Unknown'}",${o.expiresAt ? new Date(o.expiresAt).toLocaleDateString() : 'N/A'}\n`;
        }

        return csv;
    }

    // ===================================================
    // WHATSAPP MESSAGE
    // ===================================================

    function generateWhatsAppMessage(offer) {

        const expiryDate = offer.expiresAt ? new Date(offer.expiresAt).toLocaleDateString() : 'N/A';
        const isDistributorStock = offer.stockType === 'distributor-stock';

        let msg = `Dear ${offer.dealer},\n\n`;
        msg += `🎉 Special Offer for ${offer.part}\n`;
        msg += `${offer.offerType ? `🏷️ ${offer.offerType}\n` : ''}`;
        msg += `\n`;
        msg += `MRP: ₹${offer.mrp.toFixed(2)}\n`;
        
        if (isDistributorStock) {
            msg += `⚠️ Distributor Stock: MRP (NO DISCOUNT)\n`;
        } else {
            msg += `Basic Price: ₹${offer.basicPrice.toFixed(2)}\n`;
            msg += `Extra Discount: ${offer.discount}% OFF\n`;
        }
        
        msg += `Offer Price: ₹${offer.offerPrice.toFixed(2)}\n`;
        msg += `\n`;
        msg += `Available Stock: ${offer.totalStock} units\n`;
        if (isDistributorStock) {
            msg += `🏭 Source: Distributor Stock\n`;
        } else {
            msg += `📦 Source: Our Stock\n`;
        }
        msg += `\n`;
        msg += `District: ${offer.district || 'N/A'}\n`;
        msg += `⏰ Offer valid until: ${expiryDate}\n`;
        
        if (isDistributorStock) {
            msg += `\n⚠️ Additional courier charges apply for distributor stock items.\n`;
        }
        
        msg += `\nReply YES to confirm order.\n`;
        msg += `Auto Spares Solution\n`;
        msg += `https://autosparessolution.com`;

        return msg;
    }

    // ===================================================
    // AREA INSIGHTS
    // ===================================================

    function getAreaInsights() {

        const insights = [];

        for (const [district, data] of areaDemand) {

            insights.push({
                district,
                totalDemand: data.totalQty,
                dealerCount: data.dealerCount.size,
                topParts: Array.from(data.partWise.entries())
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 5)
            });
        }

        return insights.sort((a, b) => b.totalDemand - a.totalDemand);
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
    // GET FUNCTIONS
    // ===================================================

    function getDistributorStock() {
        return distributorStock;
    }

    function getRetailerMaster() {
        return retailerMaster;
    }

    // ===================================================
    // RUN
    // ===================================================

    async function runFullAnalysis() {

        console.log("Running full analysis...");

        const offers = await generateOffers();

        return {
            timestamp: new Date().toISOString(),
            offersGenerated: offers.length,
            myStockOffers: offers.filter(o => o.stockType === 'my-stock').length,
            distStockOffers: offers.filter(o => o.stockType === 'distributor-stock').length,
            highDiscountOffers: offers.filter(o => o.discount >= 5).length,
            lowStockAlerts: offers.filter(o => o.totalStock < CONFIG.lowStockThreshold).length,
            areasAnalysed: areaDemand.size,
            offers: offers.slice(0, 50)
        };
    }

    // ===================================================
    // AUTO RUN
    // ===================================================

    setTimeout(async () => {
        await runFullAnalysis();
    }, 3000);

    // ===================================================
    // GLOBAL EXPORTS
    // ===================================================

    window.DealerIntelligence = {
        runFullAnalysis,
        generateOffers,
        getAreaInsights,
        exportOffersCSV,
        generateWhatsAppMessage,
        refreshStock,
        getDistributorStock,
        getRetailerMaster,
        loadRetailerMaster,
        CONFIG
    };

})();
