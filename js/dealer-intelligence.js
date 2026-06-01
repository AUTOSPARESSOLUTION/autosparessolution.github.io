// dealer-intelligence.js – Auto-learning dealer offer system with file auto-load
(function() {
    console.log("Dealer Intelligence System loaded");

    // Configuration
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

    // Global data stores
    let dealerPartAverages = new Map();
    let areaDemand = new Map();
    let currentStock = new Map();
    let activeOffers = [];
    let distributorStock = [];
    let dealerData = [];

    // ========== AUTO-LOAD EXCEL FILES ==========
    async function loadExcelFile(url) {
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Failed to load ${url}`);
            const arrayBuffer = await response.arrayBuffer();
            const workbook = XLSX.read(arrayBuffer, { type: 'array' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            return XLSX.utils.sheet_to_json(sheet);
        } catch(err) {
            console.warn(`Could not load ${url}:`, err);
            return [];
        }
    }

    // Load Distributor Stock from Excel
    async function loadDistributorStockAuto() {
        const rows = await loadExcelFile('data/distributor-stock.xlsx');
        distributorStock = [];
        for (const row of rows) {
            const part = row['Part No'] || row['part_no'] || row['Part Number'];
            const distributor = row['Distributor Name'] || row['distributor'] || '';
            const stock = parseFloat(row['Available Stock'] || row['stock'] || 0);
            const price = parseFloat(row['Price'] || row['price'] || 0);
            const leadTime = parseFloat(row['Lead Time (Days)'] || row['leadTime'] || 3);
            if (part) {
                distributorStock.push({ part, distributor, stock, price, leadTime });
            }
        }
        console.log(`✅ Loaded ${distributorStock.length} distributor stock entries`);
        return distributorStock;
    }

    // Load Retailer Off-take Data from Excel
    // Load Retailer Off-take Data from Excel (purchase history)
async function loadRetailerOfftakeAuto() {
    const rows = await loadExcelFile('data/retailer-offtake.xlsx');
    const dealerPartMap = new Map();
    
    for (const row of rows) {
        // Map your columns - only these are needed for off-take calculation
        const dealer = row['Retailer Name'] || row['Dealer Name'] || row['dealer'];
        const part = row['Part No'] || row['part_no'] || row['Part Number'];
        const qty = parseFloat(row['Monthly Off-take Qty'] || row['qty'] || 0);
        
        // Optional - if phone is present in off-take file (not required)
        const phone = row['Mobile No'] || row['Phone'] || '';
        
        if (!dealer || !part) continue;
        
        const key = `${dealer}|${part}`;
        if (!dealerPartMap.has(key)) {
            dealerPartMap.set(key, { dealer, part, totalQty: 0, count: 0, phone });
        }
        const entry = dealerPartMap.get(key);
        entry.totalQty += qty;
        entry.count++;
    }
    
    dealerData = [];
    for (const [key, val] of dealerPartMap) {
        dealerData.push({
            dealer: val.dealer,
            part: val.part,
            avgQty: val.totalQty / val.count,
            phone: val.phone,
            email: '',
            gstin: ''
        });
    }
    console.log(`✅ Loaded ${dealerData.length} dealer-part combinations from off-take file`);
    return dealerData;
}

    // Load stock from prices.csv
    async function loadMyStock() {
        try {
            const response = await fetch('prices.csv');
            const csvText = await response.text();
            const rows = csvText.split('\n').slice(1);
            currentStock.clear();
            for (const row of rows) {
                const cols = row.split(',');
                if (cols[0]) {
                    const part = cols[0].trim();
                    const stock = parseInt(cols[7]) || 0;
                    const price = parseFloat(cols[6]) || 0;
                    currentStock.set(part, { stock, price });
                }
            }
            console.log(`✅ My stock loaded: ${currentStock.size} parts`);
            return true;
        } catch(err) {
            console.error("Failed to load prices.csv", err);
            return false;
        }
    }

    // Analyse sales invoices from localStorage
    function analyseInvoices() {
        const allInvoices = JSON.parse(localStorage.getItem('allInvoices') || '[]');
        console.log(`📊 Analysing ${allInvoices.length} invoices`);
        
        dealerPartAverages.clear();
        areaDemand.clear();
        
        const dealerPartTransactions = new Map();
        
        for (const inv of allInvoices) {
            const dealerName = inv.customerName || inv.customerEmail || 'Guest';
            const invoiceDate = new Date(inv.date);
            const pincode = inv.customerPincode || inv.shippingPincode || '';
            
            for (const item of inv.items) {
                const part = item.part;
                const qty = item.qty;
                const key = `${dealerName}|${part}`;
                
                if (!dealerPartTransactions.has(key)) {
                    dealerPartTransactions.set(key, []);
                }
                dealerPartTransactions.get(key).push({
                    qty: qty,
                    date: inv.date,
                    pincode: pincode
                });
                
                if (pincode) {
                    if (!areaDemand.has(pincode)) {
                        areaDemand.set(pincode, { totalQty: 0, partWise: new Map(), dealerCount: new Set() });
                    }
                    const area = areaDemand.get(pincode);
                    area.totalQty += qty;
                    area.dealerCount.add(dealerName);
                    area.partWise.set(part, (area.partWise.get(part) || 0) + qty);
                }
            }
        }
        
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - CONFIG.analysisMonths);
        
        for (const [key, transactions] of dealerPartTransactions) {
            const recent = transactions.filter(t => new Date(t.date) >= sixMonthsAgo);
            if (recent.length === 0) continue;
            
            const totalQty = recent.reduce((sum, t) => sum + t.qty, 0);
            const avgQty = totalQty / recent.length;
            const lastOrderDate = recent.sort((a,b) => new Date(b.date) - new Date(a.date))[0].date;
            const pincode = recent[0].pincode;
            
            const [dealer, part] = key.split('|');
            dealerPartAverages.set(key, {
                dealer, part, avgQty, lastOrderDate, pincode, phone: '', email: ''
            });
        }
        
        console.log(`✅ Analysed ${dealerPartAverages.size} dealer-part combinations`);
        console.log(`✅ Analysed ${areaDemand.size} pincode areas`);
        return { dealerCount: dealerPartAverages.size, areaCount: areaDemand.size };
    }

    function getAreaDemandMultiplier(pincode, part) {
        if (!pincode) return 1.0;
        const area = areaDemand.get(pincode);
        if (!area) return 1.0;
        if (area.totalQty > 1000) return CONFIG.areaMultipliers.high;
        if (area.totalQty > 500) return CONFIG.areaMultipliers.medium;
        return CONFIG.areaMultipliers.low;
    }

    function calculateOffer(dealer, part, avgQty, pincode) {
        const stock = currentStock.get(part)?.stock || 0;
        const originalPrice = currentStock.get(part)?.price || 0;
        
        // Combine with distributor stock
        const distStock = distributorStock.filter(d => d.part === part);
        const totalDistStock = distStock.reduce((sum, d) => sum + d.stock, 0);
        const totalStock = stock + totalDistStock;
        
        let volumeTier = null;
        for (const tier of CONFIG.volumeTiers) {
            if (avgQty >= tier.min) {
                volumeTier = tier;
                break;
            }
        }
        if (!volumeTier) return null;
        
        const areaMultiplier = getAreaDemandMultiplier(pincode, part);
        let finalDiscount = volumeTier.discount * areaMultiplier;
        finalDiscount = Math.min(finalDiscount, 25);
        
        let offerType = volumeTier.label;
        let minQty = volumeTier.min;
        
        if (totalStock < CONFIG.lowStockThreshold && totalStock > 0) {
            offerType = "Limited Stock";
            finalDiscount = Math.min(finalDiscount, 8);
            minQty = 1;
        } else if (totalStock === 0) {
            offerType = "Out of Stock – Pre-order";
            finalDiscount = 5;
            minQty = 1;
        }
        
        return {
            dealer, part, avgQty, pincode,
            myStock: stock,
            distributorStock: totalDistStock,
            totalStock: totalStock,
            discount: Math.round(finalDiscount),
            offerType, minQty,
            originalPrice,
            offerPrice: originalPrice * (1 - finalDiscount/100),
            areaMultiplier: areaMultiplier.toFixed(1)
        };
    }

    async function generateOffers() {
        await loadMyStock();
        await loadDistributorStockAuto();
        await loadRetailerOfftakeAuto();
        analyseInvoices();
        
        const offers = [];
        for (const [key, data] of dealerPartAverages) {
            const offer = calculateOffer(data.dealer, data.part, data.avgQty, data.pincode);
            if (offer && offer.discount > 0) offers.push(offer);
        }
        
        // Also generate offers from retailer off-take data (if no invoice history)
        for (const retailer of dealerData) {
            const existing = offers.find(o => o.dealer === retailer.dealer && o.part === retailer.part);
            if (!existing) {
                const offer = calculateOffer(retailer.dealer, retailer.part, retailer.avgQty, '');
                if (offer && offer.discount > 0) offers.push(offer);
            }
        }
        
        offers.sort((a,b) => b.discount - a.discount);
        activeOffers = offers;
        saveOffersToStorage();
        console.log(`✅ Generated ${offers.length} offers`);
        return offers;
    }

    function saveOffersToStorage() {
        localStorage.setItem('dealerOffers', JSON.stringify({
            generatedAt: new Date().toISOString(),
            offerCount: activeOffers.length,
            offers: activeOffers
        }));
    }

    function exportOffersCSV() {
        if (activeOffers.length === 0) return null;
        let csv = "Dealer,Part No,Avg Monthly Qty,Pincode,My Stock,Distributor Stock,Total Stock,Discount %,Offer Type,Min Order,Original Price,Offer Price\n";
        for (const o of activeOffers) {
            csv += `"${o.dealer}",${o.part},${o.avgQty.toFixed(1)},${o.pincode},${o.myStock},${o.distributorStock},${o.totalStock},${o.discount},${o.offerType},${o.minQty},${o.originalPrice},${o.offerPrice.toFixed(2)}\n`;
        }
        return csv;
    }

    function generateWhatsAppMessage(offer) {
        let msg = `Dear ${offer.dealer},\n\n`;
        if (offer.discount > 0) {
            msg += `🎉 Special Offer for ${offer.part}!\n`;
            msg += `Your monthly average: ${offer.avgQty.toFixed(1)} units\n`;
            msg += `💸 Get ${offer.discount}% OFF for orders above ${offer.minQty} units.\n`;
            msg += `💰 Original: ₹${offer.originalPrice.toFixed(2)} → Offer: ₹${offer.offerPrice.toFixed(2)}\n`;
        }
        if (offer.totalStock === 0) {
            msg += `⚠️ Currently out of stock. Pre-order at ${offer.discount}% discount.\n`;
        } else if (offer.totalStock < CONFIG.lowStockThreshold) {
            msg += `⚠️ Only ${offer.totalStock} units left. Order soon!\n`;
        }
        msg += `\nReply YES to confirm order.\n\nAuto Spares Solution\nhttps://autosparessolution.com`;
        return msg;
    }

    function getOffersForDealer(dealerName) {
        return activeOffers.filter(o => o.dealer === dealerName);
    }

    function getAreaInsights() {
        const insights = [];
        for (const [pincode, data] of areaDemand) {
            insights.push({
                pincode,
                totalDemand: data.totalQty,
                dealerCount: data.dealerCount.size,
                topParts: Array.from(data.partWise.entries()).sort((a,b) => b[1] - a[1]).slice(0, 5)
            });
        }
        return insights.sort((a,b) => b.totalDemand - a.totalDemand);
    }

    async function runFullAnalysis() {
        console.log("Running full dealer intelligence analysis...");
        const offers = await generateOffers();
        const insights = getAreaInsights();
        return {
            timestamp: new Date().toISOString(),
            offersGenerated: offers.length,
            highDiscountOffers: offers.filter(o => o.discount >= 10).length,
            lowStockAlerts: offers.filter(o => o.totalStock < CONFIG.lowStockThreshold).length,
            areasAnalysed: insights.length,
            topAreas: insights.slice(0, 5),
            offers: offers.slice(0, 20)
        };
    }

    // Auto-run on page load
    setTimeout(async () => {
        await runFullAnalysis();
    }, 3000);

    // Expose globally
    window.DealerIntelligence = {
        runFullAnalysis,
        generateOffers,
        getOffersForDealer,
        getAreaInsights,
        exportOffersCSV,
        generateWhatsAppMessage,
        CONFIG
    };
})();
