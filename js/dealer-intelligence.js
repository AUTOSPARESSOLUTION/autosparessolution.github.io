// dealer-intelligence.js - ENHANCED VERSION
// Features: Quotations, Proforma, Purchase Invoices, District-wise, Enquiry System

(function () {

    console.log("🚀 Enhanced Dealer Intelligence System loaded");

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
        
        // NEW: Enhanced offer settings
        offerSettings: {
            maxDiscount: 8,
            minDiscount: 1,
            loyaltyBonus: 1,
            newCustomerBonus: 2,
            urgentStockBonus: 2,
            seasonalBoost: 1,
            enquiryResponseTime: 24, // Hours
            proformaValidDays: 7
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
    // NEW DATA STRUCTURES
    // ===================================================
    let quotations = [];
    let proformas = [];
    let purchaseInvoices = [];
    let enquiries = [];
    let districtData = new Map();

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

    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    }

    // ===================================================
    // LOAD EXCEL FILE (from server)
    // ===================================================

    async function loadExcelFile(url, sheetName = null) {

        try {

            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`Failed to load ${url}`);
            }

            const arrayBuffer = await response.arrayBuffer();

            const workbook = XLSX.read(arrayBuffer, {
                type: 'array'
            });

            let sheet;

            if (
                sheetName &&
                workbook.SheetNames.includes(sheetName)
            ) {

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
        
        // SOURCE 1: Customer Master
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
        
        // SOURCE 2: Excel Master File
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
        
        // SOURCE 3: Users and Dealers
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
        
        // SOURCE 4: Invoices
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
        
        // ====================================
        // Statistics
        // ====================================
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
        districtData.clear();

        const sheets = ['AD', 'LMM'];

        for (const sheetName of sheets) {

            const rows = await loadExcelFile(
                'data/Retailer Wise Part Line Wise Sale.xlsx',
                sheetName
            );

            for (const row of rows) {

                const dealer =
                    String(
                        row['Retailer Name'] || ''
                    ).trim();

                const part =
                    String(
                        row['Part No'] || ''
                    ).trim();

                if (!dealer || !part) continue;

                const district =
                    row['Retailer District'] || '';

                const months = [
                    'JULY',
                    'AUGUST',
                    'SEPTEMBER',
                    'OCTOBER'
                ];

                let totalQty = 0;
                let monthCount = 0;

                for (const m of months) {

                    const qty =
                        parseFloat(row[m]) || 0;

                    totalQty += qty;

                    if (qty > 0) {
                        monthCount++;
                    }
                }

                const grandTotal =
                    parseFloat(
                        row['Grand Total']
                    ) || 0;

                if (
                    grandTotal > 0 &&
                    totalQty === 0
                ) {

                    totalQty = grandTotal;
                }

                if (
                    monthCount === 0 &&
                    totalQty > 0
                ) {

                    monthCount = 1;
                }

                const avgQty =
                    monthCount > 0
                        ? totalQty / monthCount
                        : 0;

                const master =
                    retailerMaster.get(dealer) || {};

                dealerData.push({

                    dealer: dealer,

                    part: part,

                    avgQty: avgQty,

                    district:
                        district ||
                        master.district ||
                        '',

                    mobile:
                        master.mobile || '',

                    source:
                        'Excel Offtake'
                });
                
                // Track dealer purchase history
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
                
                // Track district data
                if (district) {
                    if (!districtData.has(district)) {
                        districtData.set(district, {
                            dealers: new Set(),
                            totalDemand: 0,
                            partDemand: new Map()
                        });
                    }
                    const distData = districtData.get(district);
                    distData.dealers.add(dealer);
                    distData.totalDemand += avgQty;
                    distData.partDemand.set(part, (distData.partDemand.get(part) || 0) + avgQty);
                }
            }
        }

        console.log(`✅ Retailer sales loaded: ${dealerData.length}`);
        console.log(`📊 Dealers tracked: ${dealerPurchaseHistory.size}`);
        console.log(`📍 Districts tracked: ${districtData.size}`);
    }

    // ===================================================
    // LOAD MY STOCK
    // ===================================================

    async function loadMyStock() {

        try {

            const response =
                await fetch('prices.csv');

            const csvText =
                await response.text();

            const rows =
                csvText.split('\n').slice(1);

            currentStock.clear();

            for (const row of rows) {

                const cols = row.split(',');

                if (!cols[0]) continue;

                const part =
                    cols[0].trim();

                const stock =
                    parseInt(cols[7]) || 0;

                const price =
                    parseFloat(cols[3]) || 0;

                currentStock.set(part, {
                    stock,
                    price
                });
            }

            console.log(`✅ My stock loaded: ${currentStock.size}`);

        } catch (err) {

            console.error(err);
        }
    }

    // ===================================================
    // AREA DEMAND
    // ===================================================

    function updateAreaFromOfftake() {

        for (const dealer of dealerData) {

            const district =
                dealer.district;

            if (!district) continue;

            if (!areaDemand.has(district)) {

                areaDemand.set(district, {

                    totalQty: 0,

                    partWise: new Map(),

                    dealerCount: new Set()
                });
            }

            const area =
                areaDemand.get(district);

            area.totalQty += dealer.avgQty;

            area.dealerCount.add(
                dealer.dealer
            );

            area.partWise.set(

                dealer.part,

                (
                    area.partWise.get(
                        dealer.part
                    ) || 0
                ) + dealer.avgQty
            );
        }

        console.log(`✅ Area demand updated`);
    }

    // ===================================================
    // ANALYSE INVOICES (Includes Quotations & Proformas)
    // ===================================================

    function analyseInvoices() {

        const allInvoices =
            JSON.parse(
                localStorage.getItem('allInvoices') || '[]'
            );

        // Load quotations from localStorage
        quotations = JSON.parse(localStorage.getItem('quotations') || '[]');
        proformas = JSON.parse(localStorage.getItem('proformas') || '[]');
        enquiries = JSON.parse(localStorage.getItem('enquiries') || '[]');

        dealerPartAverages.clear();

        // Process invoices
        for (const inv of allInvoices) {

            if (!Array.isArray(inv.items)) {
                continue;
            }

            let dealerName =
                inv.customerName || '';

            if (!dealerName) {

                dealerName =
                    inv.customerEmail ||
                    'Guest';
            }

            for (const item of inv.items) {

                const key =
                    `${dealerName}|${item.part}`;

                dealerPartAverages.set(key, {

                    dealer: dealerName,

                    part: item.part,

                    avgQty:
                        parseFloat(item.qty) || 0,

                    pincode:
                        inv.customerPincode || '',

                    district: '',

                    source:
                        'Invoice History'
                });
            }
        }
        
        // Process quotations
        for (const quote of quotations) {
            if (!quote.items) continue;
            
            const dealerName = quote.customerName || '';
            if (!dealerName) continue;
            
            for (const item of quote.items) {
                const key = `${dealerName}|${item.part}`;
                
                if (!dealerPartAverages.has(key)) {
                    dealerPartAverages.set(key, {
                        dealer: dealerName,
                        part: item.part,
                        avgQty: Number(item.qty) || 0,
                        pincode: quote.pincode || '',
                        district: '',
                        source: 'Quotation'
                    });
                } else {
                    const existing = dealerPartAverages.get(key);
                    existing.avgQty += Number(item.qty) || 0;
                }
            }
        }
        
        // Process proformas
        for (const proforma of proformas) {
            if (!proforma.items) continue;
            
            const dealerName = proforma.customerName || '';
            if (!dealerName) continue;
            
            for (const item of proforma.items) {
                const key = `${dealerName}|${item.part}`;
                
                if (!dealerPartAverages.has(key)) {
                    dealerPartAverages.set(key, {
                        dealer: dealerName,
                        part: item.part,
                        avgQty: Number(item.qty) || 0,
                        pincode: proforma.pincode || '',
                        district: '',
                        source: 'Proforma Invoice'
                    });
                } else {
                    const existing = dealerPartAverages.get(key);
                    existing.avgQty += Number(item.qty) || 0;
                }
            }
        }

        console.log(`✅ Invoice analysis complete`);
        console.log(`📊 Quotations: ${quotations.length}, Proformas: ${proformas.length}, Enquiries: ${enquiries.length}`);
    }

    // ===================================================
    // AREA MULTIPLIER (Enhanced with district data)
    // ===================================================

    function getAreaDemandMultiplier(area) {

        if (!areaDemand.has(area)) {
            // Use district data if available
            if (districtData.has(area)) {
                const distData = districtData.get(area);
                if (distData.totalDemand > 1000) {
                    return CONFIG.areaMultipliers.high;
                }
                if (distData.totalDemand > 500) {
                    return CONFIG.areaMultipliers.medium;
                }
            }
            return 1.0;
        }

        const a =
            areaDemand.get(area);

        if (a.totalQty > 1000) {
            return CONFIG.areaMultipliers.high;
        }

        if (a.totalQty > 500) {
            return CONFIG.areaMultipliers.medium;
        }

        return CONFIG.areaMultipliers.low;
    }

    // ===================================================
    // CALCULATE OFFER (Enhanced with district data)
    // ===================================================

    function calculateOffer(
        dealer,
        part,
        avgQty,
        district,
        source
    ) {
        const myStock = currentStock.get(part)?.stock || 0;
        const distItem = distributorStock.find(d => d.part === part);
        const distributorStockQty = distItem?.stock || 0;
        
        // Create offer if: MY stock > 0 OR (MY stock = 0 AND Dist stock > 0)
        if (myStock <= 0 && distributorStockQty <= 0) {
            return null;
        }
        
        const totalStock = myStock + distributorStockQty;
        
        const originalPrice = currentStock.get(part)?.price || 0;
        let finalPrice = originalPrice;
        if (myStock === 0 && distributorStockQty > 0 && distItem?.price > 0) {
            finalPrice = distItem.price;
        }

        // DYNAMIC DISCOUNT CALCULATION
        
        // 1. Base discount from volume tier
        let volumeTier = CONFIG.volumeTiers[5];
        for (const tier of CONFIG.volumeTiers) {
            if (avgQty >= tier.min) {
                volumeTier = tier;
                break;
            }
        }
        let discount = volumeTier.discount;
        
        // 2. Area multiplier (enhanced with district data)
        const multiplier = getAreaDemandMultiplier(district);
        discount = Math.min(discount * multiplier, CONFIG.offerSettings.maxDiscount);
        
        // 3. Loyalty bonus
        const dealerHistory = dealerPurchaseHistory.get(dealer);
        if (dealerHistory && dealerHistory.totalQty > 50) {
            discount += CONFIG.offerSettings.loyaltyBonus;
        }
        
        // 4. New customer bonus
        if (dealerHistory && dealerHistory.partCount <= 3 && avgQty > 0) {
            discount += CONFIG.offerSettings.newCustomerBonus;
        }
        
        // 5. Urgent stock bonus
        if (totalStock < CONFIG.lowStockThreshold && totalStock > 0) {
            discount += CONFIG.offerSettings.urgentStockBonus;
        }
        
        // 6. Seasonal boost
        const currentMonth = new Date().getMonth();
        const festiveMonths = [10, 11, 12];
        if (festiveMonths.includes(currentMonth)) {
            discount += CONFIG.offerSettings.seasonalBoost;
        }
        
        discount = Math.min(Math.round(discount), CONFIG.offerSettings.maxDiscount);
        discount = Math.max(discount, CONFIG.offerSettings.minDiscount);

        // PRICE CALCULATION
        const offerPrice = finalPrice * (1 - discount / 100);
        const basicPrice = finalPrice - (finalPrice * 31.77 / 100);

        // OFFER TYPE DETERMINATION
        let offerType = volumeTier.label;
        if (myStock === 0 && distributorStockQty > 0) {
            offerType = "🏭 Distributor Backup";
        }
        if (totalStock < CONFIG.lowStockThreshold && totalStock > 0) {
            offerType = "🔥 Limited Stock";
        }
        if (discount >= 6) {
            offerType = "⭐ Premium Deal";
        }
        if (source === 'Quotation') {
            offerType = "📄 Quotation Based";
        }
        if (source === 'Proforma Invoice') {
            offerType = "📋 Proforma Based";
        }

        return {

            dealer,

            part,

            avgQty,

            pincode: district,

            district: district,

            myStock: myStock,

            distributorStock: distributorStockQty,

            totalStock: totalStock,

            discount: discount,

            offerType: offerType,

            minQty: 1,

            mrp: finalPrice,

            originalPrice: finalPrice,

            basicPrice,

            offerPrice,

            source,
            
            // Track offer generation
            generatedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString() // 15 days expiry
        };
    }

    // ===================================================
    // GENERATE OFFERS
    // ===================================================

    async function generateOffers() {

        areaDemand.clear();
        
        // Clear old offers
        localStorage.removeItem('dealerOffers');
        console.log("🗑️ Old offers cleared from localStorage");

        await loadRetailerMaster();

        await loadMyStock();

        await loadDistributorStockAuto();

        await loadRetailerOfftakeAuto();

        analyseInvoices();

        updateAreaFromOfftake();

        const offers = [];

        const processed = new Set();

        for (const [key, data] of dealerPartAverages) {

            const master =
                retailerMaster.get(
                    String(data.dealer).trim()
                ) || {};

            const offer =
                calculateOffer(

                    data.dealer,

                    data.part,

                    data.avgQty,

                    master.district || '',

                    data.source || 'Invoice History'
                );

            if (offer) {

                offers.push(offer);

                processed.add(
                    `${offer.dealer}|${offer.part}`
                );
            }
        }

        for (const retailer of dealerData) {

            const uniqueKey =
                `${retailer.dealer}|${retailer.part}`;

            if (processed.has(uniqueKey)) {
                continue;
            }

            const offer =
                calculateOffer(

                    retailer.dealer,

                    retailer.part,

                    retailer.avgQty,

                    retailer.district,

                    'Excel Offtake'
                );

            if (offer) {

                offers.push(offer);

                processed.add(uniqueKey);
            }
        }

        offers.sort(
            (a, b) =>
                b.discount - a.discount
        );

        activeOffers = offers;

        saveOffersToStorage();

        console.log(`✅ Offers generated: ${offers.length}`);
        console.log(`✅ Offers with distributor stock: ${offers.filter(o => o.distributorStock > 0).length}`);
        console.log(`📊 Offer types:`, offers.reduce((acc, o) => {
            acc[o.offerType] = (acc[o.offerType] || 0) + 1;
            return acc;
        }, {}));
        
        // Save district insights
        saveDistrictInsights();

        return offers;
    }

    // ===================================================
    // SAVE DISTRICT INSIGHTS
    // ===================================================

    function saveDistrictInsights() {
        const insights = [];
        for (const [district, data] of districtData) {
            insights.push({
                district: district,
                dealerCount: data.dealers.size,
                totalDemand: data.totalDemand,
                topParts: Array.from(data.partDemand.entries())
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 5)
                    .map(([part, qty]) => ({ part, qty }))
            });
        }
        localStorage.setItem('districtInsights', JSON.stringify(insights));
        console.log(`✅ District insights saved: ${insights.length} districts`);
    }

    // ===================================================
    // ENQUIRY SYSTEM
    // ===================================================

    function createEnquiry(dealerName, part, quantity, message, contactInfo) {
        const enquiry = {
            id: generateId(),
            dealerName: dealerName,
            part: part,
            quantity: quantity || 1,
            message: message || '',
            contactInfo: contactInfo || {},
            status: 'pending', // pending, responded, closed
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            response: null,
            responseDate: null
        };
        
        enquiries.push(enquiry);
        localStorage.setItem('enquiries', JSON.stringify(enquiries));
        
        // Auto-connect: Check if we have offers for this dealer
        const dealerOffers = activeOffers.filter(o => 
            normalizeText(o.dealer) === normalizeText(dealerName)
        );
        
        // Auto-respond if we have offers
        if (dealerOffers.length > 0) {
            const response = generateAutoResponse(enquiry, dealerOffers);
            respondToEnquiry(enquiry.id, response);
        }
        
        console.log(`📩 New enquiry created: ${enquiry.id} for ${dealerName}`);
        return enquiry;
    }

    function generateAutoResponse(enquiry, offers) {
        let response = `Dear ${enquiry.dealerName},\n\n`;
        response += `Thank you for your enquiry regarding ${enquiry.part}.\n\n`;
        response += `We have the following offers available:\n\n`;
        
        const relevantOffers = offers.filter(o => 
            !enquiry.part || normalizeText(o.part) === normalizeText(enquiry.part)
        ).slice(0, 5);
        
        if (relevantOffers.length > 0) {
            for (const offer of relevantOffers) {
                response += `🔹 ${offer.part}: ₹${offer.offerPrice.toFixed(2)} (${offer.discount}% OFF)\n`;
                response += `   Stock: ${offer.totalStock} units\n\n`;
            }
        } else {
            response += `We will get back to you with the best offer shortly.\n\n`;
        }
        
        response += `Reply with "YES" to confirm or ask for more details.\n\n`;
        response += `Thank you for choosing Auto Spares Solution!`;
        
        return response;
    }

    function respondToEnquiry(enquiryId, response) {
        const enquiry = enquiries.find(e => e.id === enquiryId);
        if (!enquiry) {
            console.warn(`Enquiry ${enquiryId} not found`);
            return false;
        }
        
        enquiry.status = 'responded';
        enquiry.response = response;
        enquiry.responseDate = new Date().toISOString();
        enquiry.updatedAt = new Date().toISOString();
        
        localStorage.setItem('enquiries', JSON.stringify(enquiries));
        console.log(`✅ Enquiry ${enquiryId} responded`);
        
        // Store in localStorage for WhatsApp sending
        localStorage.setItem('pendingWhatsAppMessage', JSON.stringify({
            phone: enquiry.contactInfo?.phone || '',
            message: response,
            dealerName: enquiry.dealerName
        }));
        
        return true;
    }

    function getEnquiries(status = null) {
        if (status) {
            return enquiries.filter(e => e.status === status);
        }
        return enquiries;
    }

    function getEnquiryById(id) {
        return enquiries.find(e => e.id === id);
    }

    // ===================================================
    // QUOTATION SYSTEM
    // ===================================================

    function createQuotation(customerName, items, validDays = 7) {
        const quotation = {
            id: generateId(),
            customerName: customerName,
            items: items,
            validDays: validDays,
            status: 'draft', // draft, sent, accepted, rejected
            createdAt: new Date().toISOString(),
            validUntil: new Date(Date.now() + validDays * 24 * 60 * 60 * 1000).toISOString()
        };
        
        quotations.push(quotation);
        localStorage.setItem('quotations', JSON.stringify(quotations));
        console.log(`📄 New quotation created: ${quotation.id}`);
        return quotation;
    }

    // ===================================================
    // PROFORMA SYSTEM
    // ===================================================

    function createProforma(customerName, items, validDays = 7) {
        const proforma = {
            id: generateId(),
            customerName: customerName,
            items: items,
            validDays: validDays,
            status: 'draft', // draft, sent, accepted, rejected
            createdAt: new Date().toISOString(),
            validUntil: new Date(Date.now() + validDays * 24 * 60 * 60 * 1000).toISOString()
        };
        
        proformas.push(proforma);
        localStorage.setItem('proformas', JSON.stringify(proformas));
        console.log(`📋 New proforma created: ${proforma.id}`);
        return proforma;
    }

    // ===================================================
    // SAVE OFFERS
    // ===================================================

    function saveOffersToStorage() {
        try {
            localStorage.setItem(

                'dealerOffers',

                JSON.stringify({

                    generatedAt:
                        new Date().toISOString(),

                    offerCount:
                        activeOffers.length,

                    offers:
                        activeOffers
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

        if (activeOffers.length === 0) {
            return null;
        }

        let csv =
            "Dealer,Part No,MRP,Basic Price,Discount %,Offer Price,My Stock,Dist Stock,Total Stock,Offer Type,Source,Expires\n";

        for (const o of activeOffers) {

            csv +=

                `"${o.dealer}",` +

                `${o.part},` +

                `${o.mrp.toFixed(2)},` +

                `${o.basicPrice.toFixed(2)},` +

                `${o.discount},` +

                `${o.offerPrice.toFixed(2)},` +

                `${o.myStock},` +

                `${o.distributorStock},` +

                `${o.totalStock},` +

                `"${o.offerType || 'Standard'}",` +

                `"${o.source || 'Unknown'}",` +

                `${o.expiresAt ? new Date(o.expiresAt).toLocaleDateString() : 'N/A'}\n`;
        }

        return csv;
    }

    // ===================================================
    // WHATSAPP MESSAGE
    // ===================================================

    function generateWhatsAppMessage(offer) {

        const expiryDate = offer.expiresAt ? new Date(offer.expiresAt).toLocaleDateString() : 'N/A';

        return `
Dear ${offer.dealer},

🎉 Special Offer for ${offer.part}
${offer.offerType ? `🏷️ ${offer.offerType}` : ''}

MRP:
₹${offer.mrp.toFixed(2)}

Basic Price:
₹${offer.basicPrice.toFixed(2)}

Extra Discount:
${offer.discount}% OFF

Offer Price:
₹${offer.offerPrice.toFixed(2)}

Available Stock:
${offer.totalStock} (Your: ${offer.myStock} | Dist: ${offer.distributorStock})

District:
${offer.district || 'N/A'}

⏰ Offer valid until: ${expiryDate}

⚠️ Additional courier charges apply for distributor stock items.

Reply YES to confirm order.

Auto Spares Solution
https://autosparessolution.com
`;
    }

    // ===================================================
    // AREA INSIGHTS
    // ===================================================

    function getAreaInsights() {

        const insights = [];

        for (const [district, data] of areaDemand) {

            insights.push({

                district,

                totalDemand:
                    data.totalQty,

                dealerCount:
                    data.dealerCount.size,

                topParts:
                    Array.from(
                        data.partWise.entries()
                    )
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 5)
            });
        }

        return insights.sort(
            (a, b) =>
                b.totalDemand - a.totalDemand
        );
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

    function getEnquiries() {
        return enquiries;
    }

    function getQuotations() {
        return quotations;
    }

    function getProformas() {
        return proformas;
    }

    function getDistrictInsights() {
        return JSON.parse(localStorage.getItem('districtInsights') || '[]');
    }

    // ===================================================
    // RUN
    // ===================================================

    async function runFullAnalysis() {

        console.log("Running full analysis...");

        const offers =
            await generateOffers();

        return {

            timestamp:
                new Date().toISOString(),

            offersGenerated:
                offers.length,

            highDiscountOffers:
                offers.filter(
                    o => o.discount >= 5
                ).length,

            lowStockAlerts:
                offers.filter(
                    o =>
                        o.totalStock <
                        CONFIG.lowStockThreshold
                ).length,

            areasAnalysed:
                areaDemand.size,

            districtsTracked:
                districtData.size,

            enquiriesPending:
                enquiries.filter(e => e.status === 'pending').length,

            offers:
                offers.slice(0, 50)
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

        // NEW: Quotation System
        createQuotation,
        getQuotations,

        // NEW: Proforma System
        createProforma,
        getProformas,

        // NEW: Enquiry System
        createEnquiry,
        respondToEnquiry,
        getEnquiries,
        getEnquiryById,
        generateAutoResponse,

        // NEW: District Insights
        getDistrictInsights,

        CONFIG
    };

})();
