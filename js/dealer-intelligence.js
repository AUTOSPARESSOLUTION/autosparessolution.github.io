// dealer-intelligence.js
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
    // LOAD EXCEL FILE
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
    // LOAD RETAILER MASTER
    // ===================================================

    async function loadRetailerMaster() {

        const rows = await loadExcelFile(
            'data/RETAILER data details.xlsx',
            'SAPUI5 Export'
        );

        retailerMaster.clear();

        for (const row of rows) {

            const dealer =
                String(
                    row['Retailer Name'] || ''
                ).trim();

            if (!dealer) continue;

            retailerMaster.set(dealer, {

                dealer: dealer,

                district:
                    row['District'] || '',

                mobile:
                    row['Mobile No'] || '',

                ownerName:
                    row['Owner Name'] || '',

                customerType:
                    row['Customer Type'] || '',

                rlpCode:
                    row['RLP Code'] || ''
            });
        }

        console.log(`✅ Retailer master loaded: ${retailerMaster.size}`);
    }

    // ===================================================
    // LOAD DISTRIBUTOR STOCK
    // ===================================================

    async function loadDistributorStockAuto() {

        const rows = await loadExcelFile(
            'data/distributor-stock.xlsx'
        );

        distributorStock = [];

        for (const row of rows) {

            const part =
                row['Part No'] ||
                row['part_no'] ||
                row['Part Number'];

            if (!part) continue;

            distributorStock.push({

                part: String(part).trim(),

                distributor:
                    row['Distributor Name'] || '',

                stock:
                    parseFloat(
                        row['Available Stock'] || 0
                    ),

                price:
                    parseFloat(
                        row['Price'] || 0
                    ),

                leadTime:
                    parseFloat(
                        row['Lead Time (Days)'] || 3
                    )
            });
        }

        console.log(`✅ Distributor stock loaded`);
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
    // CALCULATE OFFER
    // ===================================================

    function calculateOffer(
        dealer,
        part,
        avgQty,
        district,
        source
    ) {

        const stock =
            currentStock.get(part)?.stock || 0;

        if (stock <= 0) {
            return null;
        }

        const originalPrice =
            currentStock.get(part)?.price || 0;

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
            originalPrice *
            (1 - discount / 100);

        const basicPrice =
            originalPrice -
            (originalPrice * 31.77 / 100);

        return {

            dealer,

            part,

            avgQty,

            pincode: district,

            district: district,

            myStock: stock,

            distributorStock: 0,

            totalStock: stock,

            discount: discount,

            offerType:
                volumeTier.label,

            minQty: 1,

            mrp: originalPrice,

            originalPrice,

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

        return offers;
    }

    // ===================================================
    // SAVE
    // ===================================================

    function saveOffersToStorage() {

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
    }

    // ===================================================
    // EXPORT CSV
    // ===================================================

    function exportOffersCSV() {

        if (activeOffers.length === 0) {
            return null;
        }

        let csv =
            "Dealer,Part No,MRP,Basic Price,Discount %,Offer Price,Stock\n";

        for (const o of activeOffers) {

            csv +=

                `"${o.dealer}",` +

                `${o.part},` +

                `${o.mrp.toFixed(2)},` +

                `${o.basicPrice.toFixed(2)},` +

                `${o.discount},` +

                `${o.offerPrice.toFixed(2)},` +

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
${offer.totalStock}

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
                offers.slice(0, 20)
        };
    }

    // ===================================================
    // AUTO RUN
    // ===================================================

    setTimeout(async () => {

        await runFullAnalysis();

    }, 3000);

    // ===================================================
    // GLOBAL
    // ===================================================

    window.DealerIntelligence = {

        runFullAnalysis,

        generateOffers,

        getAreaInsights,

        exportOffersCSV,

        generateWhatsAppMessage,

        CONFIG
    };

})();
