// gst-calculator.js
// GST Calculation Engine for Auto Spares Solution
// Version 1.0

(function() {
    console.log("GST Calculator loaded");

    // =====================================================
    // GST RATES (as per Indian GST)
    // =====================================================
    const GST_RATES = {
        STANDARD: 18,      // Most auto parts
        REDUCED: 12,       // Some auto components
        LOWER: 5,          // Certain items
        ZERO: 0            // Exempted
    };

    // HSN to GST Rate mapping (example – customize as per your products)
    const HSN_GST_MAP = {
        '87089900': 18,    // Auto parts
        '84219900': 18,    // Filters
        '40169330': 18,    // Oil seals
        '84212300': 18,    // Oil filters
        '70091010': 18,    // Rear view mirrors
        '40101110': 18     // Belts
    };

    // =====================================================
    // GET GST RATE FOR A PRODUCT
    // =====================================================
    function getGSTRate(product) {
        if (product && product.hsn && HSN_GST_MAP[product.hsn]) {
            return HSN_GST_MAP[product.hsn];
        }
        return GST_RATES.STANDARD; // Default 18%
    }

    // =====================================================
    // CALCULATE GST FOR A SINGLE ITEM
    // =====================================================
    function calculateItemGST(taxableValue, gstRate = 18) {
        const cgstRate = gstRate / 2;
        const sgstRate = gstRate / 2;
        const cgst = (taxableValue * cgstRate) / 100;
        const sgst = (taxableValue * sgstRate) / 100;
        const totalGST = cgst + sgst;
        
        return {
            taxableValue,
            gstRate,
            cgstRate,
            sgstRate,
            cgst,
            sgst,
            totalGST,
            totalAmount: taxableValue + totalGST
        };
    }

    // =====================================================
    // CALCULATE OUTPUT GST (FROM SALES)
    // =====================================================
    function calculateOutputGST(salesInvoices, periodStart = null, periodEnd = null) {
        let outputGST = {
            cgst: 0,
            sgst: 0,
            igst: 0,
            totalGST: 0,
            taxableValue: 0,
            details: []
        };
        
        let filteredSales = salesInvoices;
        if (periodStart && periodEnd) {
            filteredSales = salesInvoices.filter(inv => {
                const invDate = new Date(inv.date);
                return invDate >= new Date(periodStart) && invDate <= new Date(periodEnd);
            });
        }
        
        for (const inv of filteredSales) {
            const items = inv.items || [];
            for (const item of items) {
                const qty = item.qty || 0;
                const price = item.price || 0;
                const taxableValue = qty * price;
                const gstRate = item.gstRate || getGSTRate(item);
                const { cgst, sgst, totalGST } = calculateItemGST(taxableValue, gstRate);
                
                outputGST.cgst += cgst;
                outputGST.sgst += sgst;
                outputGST.totalGST += totalGST;
                outputGST.taxableValue += taxableValue;
                
                outputGST.details.push({
                    invoiceNo: inv.invoiceNo,
                    date: inv.date,
                    customer: inv.customerName,
                    part: item.part,
                    qty,
                    price,
                    taxableValue,
                    gstRate,
                    cgst,
                    sgst,
                    totalGST
                });
            }
        }
        
        return outputGST;
    }

    // =====================================================
    // CALCULATE INPUT GST (FROM PURCHASES)
    // =====================================================
    function calculateInputGST(purchaseInvoices, periodStart = null, periodEnd = null) {
        let inputGST = {
            cgst: 0,
            sgst: 0,
            igst: 0,
            totalGST: 0,
            taxableValue: 0,
            details: []
        };
        
        let filteredPurchases = purchaseInvoices;
        if (periodStart && periodEnd) {
            filteredPurchases = purchaseInvoices.filter(inv => {
                const invDate = new Date(inv.date);
                return invDate >= new Date(periodStart) && invDate <= new Date(periodEnd);
            });
        }
        
        for (const inv of filteredPurchases) {
            const items = inv.items || [];
            for (const item of items) {
                const qty = item.quantity || item.qty || 0;
                const cost = item.cost || item.price || 0;
                const taxableValue = qty * cost;
                const gstRate = item.gstRate || getGSTRate(item);
                const { cgst, sgst, totalGST } = calculateItemGST(taxableValue, gstRate);
                
                inputGST.cgst += cgst;
                inputGST.sgst += sgst;
                inputGST.totalGST += totalGST;
                inputGST.taxableValue += taxableValue;
                
                inputGST.details.push({
                    invoiceNo: inv.invoiceNo || inv.poNo,
                    date: inv.date,
                    supplier: inv.supplierName,
                    part: item.part,
                    qty,
                    cost,
                    taxableValue,
                    gstRate,
                    cgst,
                    sgst,
                    totalGST
                });
            }
        }
        
        return inputGST;
    }

    // =====================================================
    // CALCULATE GST PAYABLE
    // =====================================================
    function calculateGSTPayable(outputGST, inputGST) {
        return {
            cgstPayable: Math.max(0, outputGST.cgst - inputGST.cgst),
            sgstPayable: Math.max(0, outputGST.sgst - inputGST.sgst),
            igstPayable: Math.max(0, outputGST.igst - inputGST.igst),
            totalPayable: Math.max(0, outputGST.totalGST - inputGST.totalGST),
            itcAvailable: {
                cgst: inputGST.cgst,
                sgst: inputGST.sgst,
                igst: inputGST.igst,
                total: inputGST.totalGST
            }
        };
    }

    // =====================================================
    // CALCULATE STOCK MOVEMENT FOR GST RECONCILIATION
    // =====================================================
    function calculateStockMovement(products, purchaseInvoices, salesInvoices, periodStart, periodEnd) {
        const stockMovement = new Map();
        
        // Initialize with opening stock
        for (const product of products) {
            stockMovement.set(product.part || product.id, {
                part: product.part || product.id,
                description: product.desc || product.name,
                openingStock: product.stock,
                purchases: 0,
                sales: 0,
                closingStock: product.stock,
                purchaseValue: 0,
                salesValue: 0
            });
        }
        
        // Add purchases during period
        for (const inv of purchaseInvoices) {
            const invDate = new Date(inv.date);
            if (invDate >= new Date(periodStart) && invDate <= new Date(periodEnd)) {
                const items = inv.items || [];
                for (const item of items) {
                    const part = item.part || item.productId;
                    const qty = item.quantity || item.qty || 0;
                    const value = (item.cost || item.price || 0) * qty;
                    
                    if (stockMovement.has(part)) {
                        const entry = stockMovement.get(part);
                        entry.purchases += qty;
                        entry.purchaseValue += value;
                        entry.closingStock = entry.openingStock + entry.purchases - entry.sales;
                    }
                }
            }
        }
        
        // Add sales during period
        for (const inv of salesInvoices) {
            const invDate = new Date(inv.date);
            if (invDate >= new Date(periodStart) && invDate <= new Date(periodEnd)) {
                const items = inv.items || [];
                for (const item of items) {
                    const part = item.part;
                    const qty = item.qty || 0;
                    const value = (item.price || 0) * qty;
                    
                    if (stockMovement.has(part)) {
                        const entry = stockMovement.get(part);
                        entry.sales += qty;
                        entry.salesValue += value;
                        entry.closingStock = entry.openingStock + entry.purchases - entry.sales;
                    }
                }
            }
        }
        
        return Array.from(stockMovement.values());
    }

    // =====================================================
    // GENERATE GSTR-1 (Outward Supplies)
    // =====================================================
    function generateGSTR1(salesInvoices, periodStart, periodEnd, gstin) {
        const outputGST = calculateOutputGST(salesInvoices, periodStart, periodEnd);
        
        return {
            version: '1.0.0',
            gstin: gstin,
            fp: `${periodStart.slice(5,7)}${periodStart.slice(0,4)}`,
            b2b: outputGST.details.map(inv => ({
                ctin: inv.customerGSTIN || '',
                inv: [{
                    inum: inv.invoiceNo,
                    idt: inv.date,
                    val: inv.taxableValue,
                    pos: '19', // West Bengal code
                    itms: [{
                        num: 1,
                        itm_det: {
                            txval: inv.taxableValue,
                            rt: inv.gstRate,
                            iamt: inv.cgst + inv.sgst, // IGST if interstate
                            camt: inv.cgst,
                            samt: inv.sgst,
                            csamt: 0
                        }
                    }]
                }]
            }))
        };
    }

    // =====================================================
    // GENERATE GSTR-3B (Summary Return)
    // =====================================================
    function generateGSTR3B(outputGST, inputGST, periodStart, gstin) {
        const gstPayable = calculateGSTPayable(outputGST, inputGST);
        
        return {
            version: '1.0.0',
            gstin: gstin,
            fp: `${periodStart.slice(5,7)}${periodStart.slice(0,4)}`,
            supply_attr: {
                os_sup_zero: {
                    txval: 0,
                    iamt: 0,
                    camt: 0,
                    samt: 0
                }
            },
            intr_attr: {
                intr_sup: {
                    txval: outputGST.taxableValue,
                    iamt: outputGST.igst,
                    camt: outputGST.cgst,
                    samt: outputGST.sgst
                }
            },
            itc_avl: {
                itc_avl: {
                    iamt: inputGST.igst,
                    camt: inputGST.cgst,
                    samt: inputGST.sgst
                }
            },
            itc_elg: {
                itc_elg: {
                    iamt: inputGST.igst,
                    camt: inputGST.cgst,
                    samt: inputGST.sgst
                }
            },
            net_taxpay_attr: {
                os_taxpay: {
                    iamt: gstPayable.igstPayable,
                    camt: gstPayable.cgstPayable,
                    samt: gstPayable.sgstPayable
                }
            }
        };
    }

    // =====================================================
    // EXPORT FUNCTIONS
    // =====================================================
    window.GSTCalculator = {
        GST_RATES,
        HSN_GST_MAP,
        getGSTRate,
        calculateItemGST,
        calculateOutputGST,
        calculateInputGST,
        calculateGSTPayable,
        calculateStockMovement,
        generateGSTR1,
        generateGSTR3B
    };
    
    console.log("✅ GST Calculator ready");
})();
