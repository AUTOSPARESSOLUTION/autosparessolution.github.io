// dealer-intelligence.js – Auto-learning dealer offer system
(function() {
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
        areaMultipliers: { high: 1.5, medium: 1.2, low: 1.0 },
        lowStockThreshold: 10,
        analysisMonths: 6
    };

    let dealerPartAverages = new Map();
    let areaDemand = new Map();
    let currentStock = new Map();
    let activeOffers = [];
    let distributorStock = [];
    let dealerData = [];

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
        
        // Try both sheets: AD and LMM
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
        
        // If still empty, try first sheet
        if (rows.length === 0) {
            let anyRows = await loadExcelFile(fileName);
            if (anyRows.length > 0) {
                rows = anyRows;
                loadedFrom = 'first sheet';
                console.log(`✅ Loaded ${rows.length} rows from first sheet`);
            }
        }
        
        if (rows.length === 0) {
            console.error('❌ Could not load retailer off-take data. Make sure file exists at: data/Retailer Wise Part Line Wise Sale.xlsx');
            return [];
        }
        
        const dealerPartMap = new Map();
        
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
                dealerPartMap.set(key, { dealer, part, totalQty: 0, count: 0, district });
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
                district: val.district,
                phone: '',
                email: ''
            });
        }
        console.log(`✅ Loaded ${dealerData.length} dealer-part combinations from Excel (${loadedFrom})`);
        return dealerData;
    }

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
            console.log(`✅ Loaded ${currentStock.size} products from prices.csv`);
            return true;
        } catch(err) {
            console.error("Failed to load prices.csv", err);
            return false;
        }
    }

    function analyseInvoices() {
        const allInvoices = JSON.parse(localStorage.getItem('allInvoices') || '[]');
        const validInvoices = allInvoices.filter(inv => inv.customerName && inv.customerName !== 'Guest');
        console.log(`📊 Analysing ${validInvoices.length} invoices`);
        
        dealerPartAverages.clear();
        const transactions = new Map();
        
        for (const inv of validInvoices) {
            for (const item of inv.items) {
                const key = `${inv.customerName}|${item.part}`;
                if (!transactions.has(key)) transactions.set(key, []);
                transactions.get(key).push({ qty: item.qty, date: inv.date });
            }
        }
        
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        
        for (const [key, txs] of transactions) {
            const recent = txs.filter(t => new Date(t.date) >= sixMonthsAgo);
            if (recent.length === 0) continue;
            const totalQty = recent.reduce((s, t) => s + t.qty, 0);
            const avgQty = totalQty / recent.length;
            const [dealer, part] = key.split('|');
            dealerPartAverages.set(key, { dealer, part, avgQty });
        }
        console.log(`✅ Analysed ${dealerPartAverages.size} dealer-part combinations from invoices`);
    }

    function calculateOffer(dealer, part, avgQty, district) {
        const stock = currentStock.get(part)?.stock || 0;
        const originalPrice = currentStock.get(part)?.price || 0;
        
        const distStock = distributorStock.filter(d => d.part === part);
        const totalDistStock = distStock.reduce((sum, d) => sum + d.stock, 0);
        const totalStock = stock + totalDistStock;
        
        let discount = 0, offerType = "", minQty = 1;
        
        if (avgQty >= 20) { discount = 10; offerType = "High Volume"; minQty = 20; }
        else if (avgQty >= 10) { discount = 5; offerType = "Medium Volume"; minQty = 10; }
        else if (avgQty >= 5) { discount = 2; offerType = "Regular"; minQty = 5; }
        
        if (totalStock < 5 && avgQty > 0) {
            offerType = "Low Stock Alert";
            discount = 0;
        }
        
        if (!offerType && avgQty === 0) return null;
        
        return {
            dealer, part, avgQty, district: district || '',
            myStock: stock, totalStock: totalStock,
            discount, offerType, minQty,
            originalPrice,
            offerPrice: originalPrice * (1 - discount/100)
        };
    }

    async function generateOffers() {
        await loadMyStock();
        await loadDistributorStockAuto();
        await loadRetailerOfftakeAuto();
        analyseInvoices();
        
        const offers = [];
        const processed = new Set();
        
        // From invoice history
        for (const [key, data] of dealerPartAverages) {
            const offer = calculateOffer(data.dealer, data.part, data.avgQty, '');
            if (offer) {
                offer.source = 'Invoice History';
                offers.push(offer);
                processed.add(`${data.dealer}|${data.part}`);
            }
        }
        
        // From Excel only
        for (const retailer of dealerData) {
            const key = `${retailer.dealer}|${retailer.part}`;
            if (processed.has(key)) continue;
            const offer = calculateOffer(retailer.dealer, retailer.part, retailer.avgQty, retailer.district);
            if (offer) {
                offer.source = 'Excel Only';
                offers.push(offer);
            }
        }
        
        offers.sort((a,b) => b.discount - a.discount);
        activeOffers = offers;
        localStorage.setItem('dealerOffers', JSON.stringify({ generatedAt: new Date().toISOString(), offers: activeOffers }));
        
        const invoiceCount = offers.filter(o => o.source === 'Invoice History').length;
        const excelCount = offers.filter(o => o.source === 'Excel Only').length;
        console.log(`✅ Generated ${offers.length} offers (${invoiceCount} from invoices, ${excelCount} from Excel)`);
        return offers;
    }

    function exportOffersCSV() {
        if (activeOffers.length === 0) return null;
        let csv = "Dealer,Part No,Avg Monthly Qty,District,Stock,Discount %,Offer Type,Min Order,Original Price,Offer Price,Source\n";
        for (const o of activeOffers) {
            csv += `"${o.dealer}",${o.part},${o.avgQty.toFixed(1)},${o.district || ''},${o.totalStock},${o.discount},${o.offerType},${o.minQty},${o.originalPrice},${o.offerPrice.toFixed(2)},${o.source}\n`;
        }
        return csv;
    }

    function generateWhatsAppMessage(offer) {
        let msg = `Dear ${offer.dealer},\n\n`;
        if (offer.discount > 0) {
            msg += `🎉 Special Offer for ${offer.part}!\n`;
            msg += `Your monthly average: ${offer.avgQty.toFixed(1)} units\n`;
            msg += `💸 Get ${offer.discount}% OFF for orders above ${offer.minQty} units.\n`;
            msg += `💰 Offer: ₹${offer.offerPrice.toFixed(2)} (was ₹${offer.originalPrice.toFixed(2)})\n`;
        } else {
            msg += `⚠️ Stock Alert for ${offer.part}\nOnly ${offer.totalStock} units left.\n`;
        }
        msg += `\nReply YES to order.\n\nAuto Spares Solution`;
        return msg;
    }

    async function runFullAnalysis() {
        console.log("Running full analysis...");
        const offers = await generateOffers();
        return {
            offersGenerated: offers.length,
            highDiscountOffers: offers.filter(o => o.discount >= 10).length,
            lowStockAlerts: offers.filter(o => o.totalStock < 5).length,
            offers: offers.slice(0, 20)
        };
    }

    window.DealerIntelligence = {
        runFullAnalysis,
        generateOffers,
        exportOffersCSV,
        generateWhatsAppMessage
    };
    
    setTimeout(() => { runFullAnalysis(); }, 3000);
})();
