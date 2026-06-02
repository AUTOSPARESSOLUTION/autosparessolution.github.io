// dealer-intelligence.js – Final Integrated Dealer Intelligence System
(function () {

    console.log("Dealer Intelligence System loaded");

    const CONFIG = {
        volumeTiers: [
            { min: 50, discount: 15, label: "Premium Bulk" },
            { min: 30, discount: 12, label: "High Volume" },
            { min: 20, discount: 10, label: "Large Volume" },
            { min: 10, discount: 7, label: "Medium Volume" },
            { min: 5, discount: 5, label: "Regular" },
            { min: 2, discount: 3, label: "Occasional" }
        ],
        areaMultipliers: {
            high: 1.5,
            medium: 1.2,
            low: 1.0
        },
        lowStockThreshold: 10,
        analysisMonths: 6
    };

    let dealerPartAverages = new Map();
    let areaDemand = new Map();
    let currentStock = new Map();
    let activeOffers = [];
    let distributorStock = [];
    let dealerData = [];
    let retailerMaster = new Map();

    // =========================================================
    // LOAD EXCEL
    // =========================================================

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

    // =========================================================
    // LOAD RETAILER MASTER
    // =========================================================

    async function loadRetailerMaster() {

        const rows = await loadExcelFile(
            'data/RETAILER data details.xlsx',
            'SAPUI5 Export'
        );

        retailerMaster.clear();

        for (const row of rows) {

            const dealer =
                row['Retailer Name'] ||
                '';

            if (!dealer) continue;

            retailerMaster.set(dealer.trim(), {

                dealer: dealer.trim(),

                rlpCode:
                    row['RLP Code'] || '',

                customerType:
                    row['Customer Type'] || '',

                ownerName:
                    row['Owner Name'] || '',

                subDistrict:
                    row['Sub Dist Dsc'] || '',

                district:
                    row['District'] || '',

                mobile:
                    row['Mobile No'] || ''

            });
        }

        console.log(`✅ Retailer master loaded: ${retailerMaster.size}`);
    }

    // =========================================================
    // LOAD DISTRIBUTOR STOCK
    // =========================================================

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
                    row['Distributor Name'] ||
                    row['distributor'] ||
                    '',

                stock:
                    parseFloat(
                        row['Available Stock'] ||
                        row['stock'] ||
                        0
                    ),

                price:
                    parseFloat(
                        row['Price'] ||
                        row['price'] ||
                        0
                    ),

                leadTime:
                    parseFloat(
                        row['Lead Time (Days)'] ||
                        row['leadTime'] ||
                        3
                    )

            });
        }

        console.log(`✅ Distributor stock loaded`);
    }

    // =========================================================
    // LOAD RETAILER SALES DATA
    // =========================================================

    async function loadRetailerOfftakeAuto() {

        dealerData = [];

        const sheets = ['AD', 'LMM'];

        for (const sheetName of sheets) {

            const rows = await loadExcelFile(
                'data/Retailer Wise Part Line Wise Sale.xlsx',
                sheetName
            );

            const dealerPartMap = new Map();

            for (const row of rows) {

                const dealer =
                    row['Retailer Name'] || '';

                const part =
                    row['Part No'] || '';

                if (!dealer || !part) continue;

                const district =
                    row['Retailer District'] ||
                    '';

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
                    parseFloat(row['Grand Total']) || 0;

                if (grandTotal > 0 && totalQty === 0) {
                    totalQty = grandTotal;
                }

                if (monthCount === 0 && totalQty > 0) {
                    monthCount = 1;
                }

                const key =
                    `${dealer}|${part}`;

                if (!dealerPartMap.has(key)) {

                    dealerPartMap.set(key, {

                        dealer,
                        part,
                        district,
                        totalQty: 0,
                        count: 0

                    });
                }

                const entry =
                    dealerPartMap.get(key);

                entry.totalQty += totalQty;
                entry.count += monthCount;
            }

            for (const [key, val] of dealerPartMap) {

                const master =
                    retailerMaster.get(
                        val.dealer.trim()
                    ) || {};

                dealerData.push({

                    dealer: val.dealer,

                    part: val.part,

                    avgQty:
                        val.count > 0
                            ? val.totalQty / val.count
                            : 0,

                    district:
                        val.district ||
                        master.district ||
                        '',

                    mobile:
                        master.mobile || '',

                    customerType:
                        master.customerType || '',

                    ownerName:
                        master.ownerName || '',

                    sourceSheet:
                        sheetName
                });
            }
        }

        console.log(`✅ Retailer sales loaded: ${dealerData.length}`);
    }

    // =========================================================
    // LOAD STOCK
    // =========================================================

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

                const cols =
                    row.split(',');

                if (!cols[0]) continue;

                const part =
                    cols[0].trim();

                const stock =
                    parseInt(cols[7]) || 0;

                const price =
                    parseFloat(cols[6]) || 0;

                currentStock.set(part, {
                    stock,
                    price
                });
            }

            console.log(`✅ Stock loaded`);

        } catch (err) {

            console.error(err);

        }
    }

    // =========================================================
    // AREA DEMAND
    // =========================================================

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

    // =========================================================
    // ANALYSE INVOICES
    // =========================================================

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
                inv.customerName ||
                '';

            if (
                !dealerName &&
                inv.customerEmail
            ) {

                const email =
                    inv.customerEmail;

                const matched =
                    Array.from(
                        retailerMaster.values()
                    ).find(r =>
                        r.mobile === inv.customerPhone
                    );

                if (matched) {
                    dealerName =
                        matched.dealer;
                } else {
                    dealerName = email;
                }
            }

            for (const item of inv.items) {

                const key =
                    `${dealerName}|${item.part}`;

                dealerPartAverages.set(key, {

                    dealer: dealerName,

                    part: item.part,

                    avgQty: item.qty,

                    pincode:
                        inv.customerPincode || '',

                    district:
                        '',

                    source:
                        'Invoice History'
                });
            }
        }

        console.log(`✅ Invoice analysis complete`);
    }

    // =========================================================
    // AREA MULTIPLIER
    // =========================================================

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

    // =========================================================
    // CALCULATE OFFER
    // =========================================================

    function calculateOffer(
        dealer,
        part,
        avgQty,
        district,
        source
    ) {

        const stock =
            currentStock.get(part)?.stock || 0;

        const originalPrice =
            currentStock.get(part)?.price || 0;

        const distStock =
            distributorStock.filter(
                d => d.part === part
            );

        const totalDistStock =
            distStock.reduce(
                (sum, d) => sum + d.stock,
                0
            );

        const totalStock =
            stock + totalDistStock;

        let volumeTier = null;

        for (const tier of CONFIG.volumeTiers) {

            if (avgQty >= tier.min) {

                volumeTier = tier;

                break;
            }
        }

        if (!volumeTier) {
            return null;
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
                25
            );

        let offerType =
            volumeTier.label;

        if (
            totalStock <
            CONFIG.lowStockThreshold &&
            totalStock > 0
        ) {

            offerType =
                'Limited Stock';

            discount =
                Math.min(discount, 8);

        }

        if (totalStock === 0) {

            offerType =
                'Out of Stock – Pre-order';

            discount = 5;
        }

        return {

            dealer,
            part,
            avgQty,

            district,

            myStock: stock,

            distributorStock:
                totalDistStock,

            totalStock,

            discount:
                Math.round(discount),

            offerType,

            originalPrice,

            offerPrice:
                originalPrice *
                (
                    1 - discount / 100
                ),

            source
        };
    }

    // =========================================================
    // GENERATE OFFERS
    // =========================================================

    async function generateOffers() {

        await loadRetailerMaster();

        await loadMyStock();

        await loadDistributorStockAuto();

        await loadRetailerOfftakeAuto();

        analyseInvoices();

        updateAreaFromOfftake();

        const offers = [];

        // Invoice offers

        for (const [key, data] of dealerPartAverages) {

            const master =
                retailerMaster.get(
                    data.dealer.trim()
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
            }
        }

        // Excel offers

        for (const retailer of dealerData) {

            const exists =
                offers.find(
                    o =>
                        o.dealer === retailer.dealer &&
                        o.part === retailer.part
                );

            if (exists) continue;

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

    // =========================================================
    // SAVE
    // =========================================================

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

    // =========================================================
    // EXPORT
    // =========================================================

    function exportOffersCSV() {

        if (activeOffers.length === 0) {
            return null;
        }

        let csv =
            "Dealer,Part No,Avg Monthly Qty,District,Stock,Discount %,Offer Type,Offer Price,Source\n";

        for (const o of activeOffers) {

            csv +=
                `"${o.dealer}",` +
                `${o.part},` +
                `${o.avgQty.toFixed(1)},` +
                `"${o.district}",` +
                `${o.totalStock},` +
                `${o.discount},` +
                `"${o.offerType}",` +
                `${o.offerPrice.toFixed(2)},` +
                `"${o.source}"\n`;
        }

        return csv;
    }

    // =========================================================
    // WHATSAPP
    // =========================================================

    function generateWhatsAppMessage(offer) {

        return `
Dear ${offer.dealer},

🎉 Special Offer for ${offer.part}

Average Monthly Demand:
${offer.avgQty.toFixed(1)}

Discount:
${offer.discount}% OFF

Offer Price:
₹${offer.offerPrice.toFixed(2)}

District:
${offer.district}

Reply YES to confirm order.

Auto Spares Solution
https://autosparessolution.com
`;
    }

    // =========================================================
    // AREA INSIGHTS
    // =========================================================

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

    // =========================================================
    // RUN
    // =========================================================

    async function runFullAnalysis() {

        console.log("Running analysis...");

        const offers =
            await generateOffers();

        return {

            timestamp:
                new Date().toISOString(),

            offersGenerated:
                offers.length,

            offers:
                offers.slice(0, 20)
        };
    }

    setTimeout(async () => {

        await runFullAnalysis();

    }, 3000);

    // =========================================================
    // GLOBAL
    // =========================================================

    window.DealerIntelligence = {

        runFullAnalysis,

        generateOffers,

        getAreaInsights,

        exportOffersCSV,

        generateWhatsAppMessage,

        CONFIG
    };

})();
