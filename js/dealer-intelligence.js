// dealer-intelligence.js - COMPLETE FIXED VERSION
// Integrates with Customer Master for phone numbers and districts

(function () {

    console.log("Dealer Intelligence System loaded");

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
            { min: 0, discount: 1, label: "Welcome Offer" }

        ],

        areaMultipliers: {
            high: 1.2,
            medium: 1.1,
            low: 1.0
        },

        lowStockThreshold: 10,

        analysisMonths: 6
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
    // LOAD DISTRIBUTOR STOCK - FLEXIBLE COLUMN DETECTION
    // ===================================================

    async function loadDistributorStockAuto() {

        // FIRST: Check if distributor stock exists in localStorage (from HTML upload)
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
        
        // SECOND: Fallback - try to read from Excel file on server
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
    // LOAD RETAILER MASTER (UPDATED - INCLUDES CUSTOMER MASTER)
    // ===================================================

    async function loadRetailerMaster() {

        retailerMaster.clear();
        
        // ====================================
        // SOURCE 1: Customer Master (HIGHEST PRIORITY)
        // ====================================
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
        
        // ====================================
        // SOURCE 2: Excel Master File
        // ====================================
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
        
        // ====================================
        // SOURCE 3: Users and Dealers
        // ====================================
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
        
        // ====================================
        // SOURCE 4: Invoices (allInvoices)
        // ====================================
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
        
        // List dealers without phone for debugging
        const missingPhone = [];
        for (const [name, data] of retailerMaster) {
            if (!data.mobile) missingPhone.push(name);
        }
        if (missingPhone.length > 0) {
            console.warn(`⚠️ ${missingPhone.length} dealers missing phone numbers:`, missingPhone.slice(0, 10));
        }
    }

    // ===================================================
    // LOAD RETAILER SALES
    // ===================================================

    async function loadRetailerOfftakeAuto() {

        dealerData = [];

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
            }
        }

        console.log(`✅ Retailer sales loaded: ${dealerData.length}`);
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
    // ANALYSE INVOICES
    // ===================================================

    function analyseInvoices() {

        const allInvoices =
            JSON.parse(
                localStorage.getItem('allInvoices') || '[]'
            );

        dealerPartAverages.clear();

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

        console.log(`✅ Invoice analysis complete`);
    }

    // ===================================================
    // AREA MULTIPLIER
    // ===================================================

    function getAreaDemandMultiplier(area) {

        if (!areaDemand.has(area)) {
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
    // CALCULATE OFFER - Includes distributor stock
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
        const totalStock = myStock + distributorStockQty;

        if (myStock <= 0 && distributorStockQty <= 0) {
            return null;
        }

        const originalPrice = currentStock.get(part)?.price || 0;

        let finalPrice = originalPrice;
        if (myStock === 0 && distributorStockQty > 0 && distItem?.price > 0) {
            finalPrice = distItem.price;
        }

        let volumeTier = CONFIG.volumeTiers[5];

        for (const tier of CONFIG.volumeTiers) {

            if (avgQty >= tier.min) {

                volumeTier = tier;

                break;
            }
        }

        let discount =
            volumeTier.discount;

        const multiplier =
            getAreaDemandMultiplier(
                district
            );

        discount =
            Math.min(
                discount * multiplier,
                6
            );

        discount =
            Math.round(discount);

        const offerPrice =
            finalPrice *
            (1 - discount / 100);

        const basicPrice =
            finalPrice -
            (finalPrice * 31.77 / 100);

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

            offerType:
                volumeTier.label,

            minQty: 1,

            mrp: finalPrice,

            originalPrice: finalPrice,

            basicPrice,

            offerPrice,

            source
        };
    }

    // ===================================================
    // GENERATE OFFERS
    // ===================================================

    async function generateOffers() {

        areaDemand.clear();

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

                    'Invoice History'
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

        return offers;
    }

    // ===================================================
    // SAVE
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
            "Dealer,Part No,MRP,Basic Price,Discount %,Offer Price,My Stock,Dist Stock,Total Stock\n";

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

                `${o.totalStock}\n`;
        }

        return csv;
    }

    // ===================================================
    // WHATSAPP MESSAGE
    // ===================================================

    function generateWhatsAppMessage(offer) {

        return `
Dear ${offer.dealer},

🎉 Special Offer for ${offer.part}

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
    // REFRESH STOCK (for external calls)
    // ===================================================

    async function refreshStock() {
        await loadDistributorStockAuto();
        console.log(`Stock refreshed: ${distributorStock.length} distributor items`);
        return distributorStock.length;
    }

    // ===================================================
    // GET DISTRIBUTOR STOCK (for external calls)
    // ===================================================

    function getDistributorStock() {
        return distributorStock;
    }

    // ===================================================
    // GET RETAILER MASTER (for debugging)
    // ===================================================

    function getRetailerMaster() {
        return retailerMaster;
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

            offers:
                offers.slice(0, 50)
        };
    }

    // ===================================================
    // AUTO RUN (DELAYED)
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
