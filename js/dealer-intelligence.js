// dealer-intelligence.js – Production-grade dealer offer system
(function() {
    console.log("Dealer Intelligence System loaded");

    // ========== HELPER FUNCTIONS ==========
    
    // Normalize part number (standardize comparison)
    function normalizePart(part) {
        if (!part) return '';
        return String(part)
            .trim()
            .toUpperCase()
            .replace(/^0+/, '');  // Remove leading zeros
    }
    
    // Clean number from Excel (remove ₹, commas, etc.)
    function cleanNumber(val) {
        if (val === undefined || val === null) return 0;
        const cleaned = String(val).replace(/[^\d.-]/g, '');
        const num = parseFloat(cleaned);
        return isNaN(num) ? 0 : num;
    }
    
    // Sanitize CSV export (prevent Excel formula injection)
    function sanitizeCSV(value) {
        const str = String(value || '');
        if (/^[=+\-@]/.test(str)) {
            return "'" + str;
        }
        return str;
    }
    
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
    let distributorStockMap = new Map();  // Indexed for fast lookup
    let activeOffers = [];
    let dealerData = [];

    // ========== LOAD EXCEL FILES WITH PAPA PARSE ==========
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

    // Load Distributor Stock with Indexing
    async function loadDistributorStockAuto() {
        distributorStockMap.clear();
        const rows = await loadExcelFile('data/distributor-stock.xlsx');
        
        for (const row of rows) {
            const part = normalizePart(row['Part No'] || row['part_no'] || row['Part Number']);
            const stock = cleanNumber(row['Available Stock'] || row['stock'] || 0);
            const price = cleanNumber(row['Price'] || row['price'] || 0);
            const leadTime = cleanNumber(row['Lead Time (Days)'] || row['leadTime'] || 3);
            
            if (part) {
                if (!distributorStockMap.has(part)) {
                    distributorStockMap.set(part, []);
                }
                distributorStockMap.get(part).push({ 
                    part, 
                    distributor: row['Distributor Name'] || row['distributor'] || '',
                    stock, 
                    price, 
                    leadTime 
                });
            }
        }
        console.log(`✅ Loaded ${distributorStockMap.size} distributor parts with stock`);
        return distributorStockMap;
    }

    // Load Retailer Off-take from your Excel file
    async function loadRetailerOfftakeAuto() {
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
        
        if (rows.length > 0) {
            console.log("📊 First row columns:", Object.keys(rows[0]));
        }
        
        const dealerPartMap = new Map();
        
        for (const row of rows) {
            const dealer = row['Retailer Name'] || row['Dealer Name'] || row['dealer'] || row['Retailer'];
            const partRaw = row['Part No'] || row['part_no'] || row['Part Number'] || row['Part'];
            const part = normalizePart(partRaw);
            const district = row['Retailer District'] || row['District'] || row['district'] || '';
            
            // Calculate total from monthly columns
            let totalQty = 0;
            let monthCount = 0;
            const months = ['JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'July', 'August', 'September', 'October'];
            for (const m of months) {
                const qty = cleanNumber(row[m]);
                if (qty > 0) monthCount++;
                totalQty += qty;
            }
            
            const grandTotal = cleanNumber(row['Grand Total'] || row['Total']);
            if (grandTotal > 0 && totalQty === 0) {
                totalQty = grandTotal;
                monthCount = 1;
            }
            
            if (!dealer || !part) continue;
            
            const key = `${dealer}|${part}`;
            if (!dealerPartMap.has(key)) {
                dealerPartMap.set(key, { 
                    dealer, part, totalQty: 0, count: 0, district,
                    phone: row['Phone'] || row['Mobile No'] || '',
                    email: row['Email'] || ''
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
        return dealerData;
    }

    // Load stock from prices.csv using PapaParse (handles commas in fields)
    async function loadMyStock() {
        return new Promise((resolve, reject) => {
            fetch('prices.csv')
                .then(response => response.text())
                .then(csvText => {
                    currentStock.clear();
                    
                    Papa.parse(csvText, {
                        header: true,
                        skipEmptyLines: true,
                        complete: function(results) {
                            for (const row of results.data) {
                                const part = normalizePart(row['Part No'] || row['part'] || row['Part']);
                                const stock = cleanNumber(row['Stock'] || row['stock'] || row['Qty'] || 0);
                                const price = cleanNumber(row['Price'] || row['price'] || row['Our Price'] || 0);
                                
                                if (part) {
                                    currentStock.set(part, { stock, price });
                                }
                            }
                            console.log(`✅ My stock loaded: ${currentStock.size} parts`);
                            resolve(true);
                        },
                        error: function(err) {
                            console.error("PapaParse error:", err);
                            resolve(false);
                        }
                    });
                })
                .catch(err => {
                    console.error("Failed to load prices.csv", err);
                    resolve(false);
                });
        });
    }

    // Update area demand (cleared before use)
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

    // Analyse sales invoices (monthly average calculation)
    function analyseInvoices() {
        const allInvoices = JSON.parse(localStorage.getItem('allInvoices') || '[]');
        const validInvoices = allInvoices.filter(inv => inv.customerName && inv.customerName !== 'Guest');
        console.log(`📊 Analysing ${validInvoices.length} valid invoices`);
        
        dealerPartAverages.clear();
        
        // Group by month for proper monthly average
        const monthlyData = new Map(); // key: dealer|part|yearMonth
        
        for (const inv of validInvoices) {
            // Skip malformed invoices
            if (!Array.isArray(inv.items)) continue;
            
            const dealerName = inv.customerName;
            const invDate = new Date(inv.date);
            const yearMonth = `${invDate.getFullYear()}-${invDate.getMonth() + 1}`;
            
            for (const item of inv.items) {
                const part = normalizePart(item.part);
                const qty = cleanNumber(item.qty);
                const key = `${dealerName}|${part}|${yearMonth}`;
                
                if (!monthlyData.has(key)) {
                    monthlyData.set(key, { dealer: dealerName, part, yearMonth, totalQty: 0 });
                }
                monthlyData.get(key).totalQty += qty;
            }
        }
        
        // Calculate averages across months
        const dealerPartMonthly = new Map(); // key: dealer|part -> array of monthly totals
        
        for (const [key, data] of monthlyData) {
            const dpKey = `${data.dealer}|${data.part}`;
            if (!dealerPartMonthly.has(dpKey)) {
                dealerPartMonthly.set(dpKey, []);
            }
            dealerPartMonthly.get(dpKey).push(data.totalQty);
        }
        
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - CONFIG.analysisMonths);
        
        for (const [dpKey, monthlyQtys] of dealerPartMonthly) {
            const avgQty = monthlyQtys.reduce((a, b) => a + b, 0) / monthlyQtys.length;
            const [dealer, part] = dpKey.split('|');
            
            dealerPartAverages.set(dpKey, {
                dealer, part, avgQty,
                monthsCount: monthlyQtys.length
            });
        }
        
        console.log(`✅ Analysed ${dealerPartAverages.size} dealer-part combinations from invoices`);
        return dealerPartAverages.size;
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
        const stockData = currentStock.get(part) || { stock: 0, price: 0 };
        const stock = stockData.stock;
        const originalPrice = stockData.price;
        
        // Fast indexed lookup
        const distStock = distributorStockMap.get(part) || [];
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
        
        // Prevent NaN
        const offerPrice = originalPrice > 0 
            ? originalPrice * (1 - finalDiscount / 100) 
            : 0;
        
        return {
            dealer, part, avgQty, pincode,
            myStock: stock,
            distributorStock: totalDistStock,
            totalStock: totalStock,
            discount: Math.round(finalDiscount),
            offerType, minQty,
            originalPrice,
            offerPrice: offerPrice,
            areaMultiplier: areaMultiplier.toFixed(1)
        };
    }

    async function generateOffers() {
        // Clear areaDemand before each run to prevent accumulation
        areaDemand.clear();
        
        // Parallel loading for better performance
        await Promise.all([
            loadMyStock(),
            loadDistributorStockAuto(),
            loadRetailerOfftakeAuto()
        ]);
        
        updateAreaFromOfftake();
        analyseInvoices();
        
        const offers = [];
        const processedDealerParts = new Set();
        
        // Offers from invoice history
        for (const [key, data] of dealerPartAverages) {
            try {
                const offer = calculateOffer(data.dealer, data.part, data.avgQty, '');
                if (offer && offer.discount > 0) {
                    offer.source = 'Invoice History';
                    offers.push(offer);
                    processedDealerParts.add(`${data.dealer}|${data.part}`);
                }
            } catch(err) {
                console.error("Error calculating offer:", err);
            }
        }
        
        // Offers from Excel only
        for (const retailer of dealerData) {
            try {
                const key = `${retailer.dealer}|${retailer.part}`;
                if (processedDealerParts.has(key)) continue;
                
                const offer = calculateOffer(retailer.dealer, retailer.part, retailer.avgQty, retailer.district);
                if (offer && offer.discount > 0) {
                    offer.source = 'Excel Only';
                    offers.push(offer);
                }
            } catch(err) {
                console.error("Error calculating Excel offer:", err);
            }
        }
        
        offers.sort((a,b) => b.discount - a.discount);
        activeOffers = offers;
        
        // Limit storage size to prevent localStorage quota issues
        const storageData = {
            generatedAt: new Date().toISOString(),
            offerCount: activeOffers.length,
            offers: activeOffers.slice(0, 500)  // Limit to 500 offers
        };
        
        try {
            localStorage.setItem('dealerOffers', JSON.stringify(storageData));
        } catch(err) {
            console.error("localStorage quota exceeded, saving only first 100 offers");
            storageData.offers = activeOffers.slice(0, 100);
            localStorage.setItem('dealerOffers', JSON.stringify(storageData));
        }
        
        const invoiceCount = offers.filter(o => o.source === 'Invoice History').length;
        const excelCount = offers.filter(o => o.source === 'Excel Only').length;
        console.log(`✅ Generated ${offers.length} offers (${invoiceCount} from invoices, ${excelCount} from Excel)`);
        
        return offers;
    }

    function exportOffersCSV() {
        if (activeOffers.length === 0) return null;
        
        let csv = "Dealer,Part No,Avg Monthly Qty,District,My Stock,Total Stock,Discount %,Offer Type,Min Order,Original Price,Offer Price,Source\n";
        
        for (const o of activeOffers) {
            csv += `"${sanitizeCSV(o.dealer)}",`;
            csv += `"${sanitizeCSV(o.part)}",`;
            csv += `${o.avgQty.toFixed(1)},`;
            csv += `"${sanitizeCSV(o.pincode || '')}",`;
            csv += `${o.myStock},`;
            csv += `${o.totalStock},`;
            csv += `${o.discount},`;
            csv += `"${sanitizeCSV(o.offerType)}",`;
            csv += `${o.minQty},`;
            csv += `${o.originalPrice},`;
            csv += `${o.offerPrice.toFixed(2)},`;
            csv += `"${sanitizeCSV(o.source || '')}"\n`;
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
                topParts: Array.from(data.partWise.entries())
                    .sort((a,b) => b[1] - a[1])
                    .slice(0, 5)
            });
        }
        return insights.sort((a,b) => b.totalDemand - a.totalDemand);
    }

    async function runFullAnalysis() {
        console.log("Running full dealer intelligence analysis...");
        try {
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
        } catch(err) {
            console.error("Analysis failed:", err);
            return {
                offersGenerated: 0,
                highDiscountOffers: 0,
                lowStockAlerts: 0,
                areasAnalysed: 0,
                offers: []
            };
        }
    }

    // Expose globally
    window.DealerIntelligence = {
        runFullAnalysis,
        generateOffers,
        getOffersForDealer,
        getAreaInsights,
        exportOffersCSV,
        generateWhatsAppMessage,
        CONFIG,
        normalizePart,
        cleanNumber
    };
    
    // Wait for full page load before auto-run
    window.addEventListener('load', async () => {
        await runFullAnalysis();
    });
})();
