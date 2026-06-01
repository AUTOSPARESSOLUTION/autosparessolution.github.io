// dealer-intelligence.js – Auto-learning dealer offer system
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

    // Helper to load Excel files with specific sheet name
    async function loadExcelFile(url, sheetName = null) {
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Failed to load ${url}`);
            const arrayBuffer = await response.arrayBuffer();
            const workbook = XLSX.read(arrayBuffer, { type: 'array' });
            
            let sheet;
            if (sheetName && workbook.SheetNames.includes(sheetName)) {
                sheet = workbook.Sheets[sheetName];
                console.log(`✅ Loaded sheet: ${sheetName}`);
            } else {
                sheet = workbook.Sheets[workbook.SheetNames[0]];
                console.log(`✅ Loaded first sheet: ${workbook.SheetNames[0]}`);
            }
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
            const stock = parseFloat(row['Available Stock'] || row['stock'] || 0);
            if (part) distributorStock.push({ part, stock });
        }
        console.log(`✅ Loaded ${distributorStock.length} distributor stock entries`);
        return distributorStock;
    }

    // ========== YOUR EXCEL FILE WITH TWO SHEETS ==========
    async function loadRetailerOfftakeAuto() {
        // Your exact file name
        const fileName = 'data/Retailer Wise Part Line Wise Sale.xlsx';
        
        let rows = [];
        let loadedFrom = '';
        
        // Try AD sheet first
        let adRows = await loadExcelFile(fileName, 'AD');
        if (adRows.length > 0) {
            rows = adRows;
            loadedFrom = 'AD sheet';
            console.log(`✅ Loaded ${rows.length} rows from AD sheet`);
        }
        
        // If AD sheet empty, try LMM sheet
        if (rows.length === 0) {
            let lmmRows = await loadExcelFile(fileName, 'LMM');
            if (lmmRows.length > 0) {
                rows = lmmRows;
                loadedFrom = 'LMM sheet';
                console.log(`✅ Loaded ${rows.length} rows from LMM sheet`);
            }
        }
        
        if (rows.length === 0) {
            console.error(`❌ Could not load retailer off-take data. File: ${fileName}`);
            return [];
        }
        
        const dealerPartMap = new Map();
        
        // Print first row to see available columns (for debugging)
        if (rows.length > 0) {
            console.log("First row columns:", Object.keys(rows[0]));
            console.log("First row sample:", rows[0]);
        }
        
        for (const row of rows) {
            // Try multiple column name variations
            const dealer = row['Retailer Name'] || row['Dealer Name'] || row['dealer'] || row['Retailer'] || row['Dealer'];
            const part = row['Part No'] || row['part_no'] || row['Part Number'] || row['Part'];
            const district = row['Retailer District'] || row['District'] || row['district'] || row['Zone'] || '';
            
            // Month columns (both uppercase and capitalized)
            let totalQty = 0;
            let monthCount = 0;
            const months = ['JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'July', 'August', 'September', 'October'];
            for (const m of months) {
                const qty = parseFloat(row[m]) || 0;
                if (qty > 0) monthCount++;
                totalQty += qty;
            }
            
            // Optional Grand Total
            const grandTotal = parseFloat(row['Grand Total']) || parseFloat(row['Total']) || 0;
            if (grandTotal > 0 && totalQty === 0) {
                totalQty = grandTotal;
                monthCount = 1;
            }
            
            if (!dealer || !part) continue;
            
            const key = `${dealer}|${part}`;
            if (!dealerPartMap.has(key)) {
                dealerPartMap.set(key, { 
                    dealer, part, totalQty: 0, count: 0, 
                    district: district,
                    phone: '', email: ''
                });
            }
            const entry = dealerPartMap.get(key);
            entry.totalQty += totalQty;
            entry.count += monthCount;
            if (!entry.district && district) entry.district = district;
        }
        
        dealerData = [];
        for (const [key, val] of dealerPartMap) {
            dealerData.push({
                dealer: val.dealer,
                part: val.part,
                avgQty: val.count > 0 ? val.totalQty / val.count : 0,
                phone: val.phone,
                email: val.email,
                district: val.district
            });
        }
        console.log(`✅ Loaded ${dealerData.length} dealer-part combinations from ${loadedFrom}`);
        console.log(`   Sample district:`, dealerData.find(d => d.district)?.district || 'No district found');
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

    // Update area demand using district from off-take file
    function updateAreaFromOfftake() {
        let districtCount = 0;
        for (const dealer of dealerData) {
            if (dealer.district && dealer.district.trim() !== '') {
                districtCount++;
                if (!areaDemand.has(dealer.district)) {
                    areaDemand.set(dealer.district, { 
                        totalQty: 0, 
                        partWise: new Map(), 
                        dealerCount: new Set() 
                    });
                }
                const area = areaDemand.get(dealer.district);
                area.totalQty += dealer.avgQty;
                area.dealerCount.add(dealer.dealer);
                area.partWise.set(dealer.part, (area.partWise.get(dealer.part) || 0) + dealer.avgQty);
            }
        }
        console.log(`✅ Area demand updated: ${areaDemand.size} districts, ${districtCount} dealers with district info`);
    }

    // Analyse sales invoices from localStorage (skip Guest)
    function analyseInvoices() {
        const allInvoices = JSON.parse(localStorage.getItem('allInvoices') || '[]');
        
        const validInvoices = allInvoices.filter(inv => 
            inv.customerName && 
            inv.customerName !== 'Guest' && 
            inv.customerName !== 'guest'
        );
        
        console.log(`📊 Analysing ${validInvoices.length} valid invoices (skipped ${allInvoices.length - validInvoices.length} guest invoices)`);
        
        dealerPartAverages.clear();
        
        const dealerPartTransactions = new Map();
        
        for (const inv of validInvoices) {
            const dealerName = inv.customerName;
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
        
        console.log(`✅ Analysed ${dealerPartAverages.size} dealer-part combinations from invoices`);
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

    function calculateOffer(dealer, part, avgQty, pincode, source = 'auto') {
        const stock = currentStock.get(part)?.stock || 0;
        const originalPrice = currentStock.get(part)?.price || 0;
        
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
        
        if (!volumeTier && avgQty === 0) return null;
        
        let discount = 0;
        let offerType = "";
        let minQty = 1;
        
        if (volumeTier) {
            discount = volumeTier.discount;
            offerType = volumeTier.label;
            minQty = volumeTier.min;
        } else if (avgQty > 0) {
            discount = 2;
            offerType = "Welcome Offer";
            minQty = 1;
        }
        
        const areaMultiplier = getAreaDemandMultiplier(pincode, part);
        let finalDiscount = discount * areaMultiplier;
        finalDiscount = Math.min(finalDiscount, 25);
        
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
        
        updateAreaFromOfftake();
        analyseInvoices();
        
        const offers = [];
        const processedDealerParts = new Set();
        
        // Offers from invoice history
        for (const [key, data] of dealerPartAverages) {
            const offer = calculateOffer(data.dealer, data.part, data.avgQty, data.pincode, 'invoice');
            if (offer && offer.discount > 0) {
                offer.source = 'Invoice History';
                offers.push(offer);
                processedDealerParts.add(`${data.dealer}|${data.part}`);
            }
        }
        
        // Offers from Excel only
        for (const retailer of dealerData) {
            const key = `${retailer.dealer}|${retailer.part}`;
            if (processedDealerParts.has(key)) continue;
            
            const hasInvoiceHistory = Array.from(dealerPartAverages.keys()).some(k => k.startsWith(`${retailer.dealer}|`));
            const offer = calculateOffer(retailer.dealer, retailer.part, retailer.avgQty, retailer.district, 'excel');
            if (offer && offer.discount > 0) {
                offer.source = hasInvoiceHistory ? 'Excel (Supplement)' : 'Excel Only (Prospective)';
                offer.isProspective = !hasInvoiceHistory;
                offers.push(offer);
            }
        }
        
        offers.sort((a,b) => b.discount - a.discount);
        activeOffers = offers;
        saveOffersToStorage();
        
        const existingCount = offers.filter(o => o.source === 'Invoice History').length;
        const prospectiveCount = offers.filter(o => o.source === 'Excel Only (Prospective)').length;
        
        console.log(`✅ Generated ${offers.length} offers:`);
        console.log(`   - ${existingCount} from invoice history`);
        console.log(`   - ${prospectiveCount} from Excel only`);
        
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
        let csv = "Dealer,Part No,Avg Monthly Qty,Pincode/District,My Stock,Total Stock,Discount %,Offer Type,Min Order,Original Price,Offer Price,Source\n";
        for (const o of activeOffers) {
            csv += `"${o.dealer}",${o.part},${o.avgQty.toFixed(1)},${o.pincode || ''},${o.myStock},${o.totalStock},${o.discount},${o.offerType},${o.minQty},${o.originalPrice},${o.offerPrice.toFixed(2)},${o.source || ''}\n`;
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
    
    setTimeout(async () => {
        await runFullAnalysis();
    }, 3000);
})();
