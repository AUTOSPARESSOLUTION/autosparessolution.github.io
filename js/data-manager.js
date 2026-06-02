// data-manager.js
// Central Data Management for Auto Spares Solution
// Version 1.0

(function() {
    console.log("Data Manager loaded");

    // =====================================================
    // GLOBAL DATA STORES
    // =====================================================
    let productsData = [];
    let purchaseInvoicesData = [];
    let salesInvoicesData = [];
    let suppliersData = [];
    let customersData = [];
    let stockTransactionsData = [];

    // =====================================================
    // LOAD PRODUCTS FROM prices.csv
    // =====================================================
    async function loadProducts() {
        try {
            const response = await fetch('prices.csv');
            if (!response.ok) throw new Error('prices.csv not found');
            const csvText = await response.text();
            const rows = csvText.split('\n').slice(1);
            
            productsData = [];
            for (const row of rows) {
                const cols = row.split(',');
                if (cols[0] && cols[0].trim()) {
                    productsData.push({
                        id: cols[0].trim(),
                        sku: cols[0].trim(),
                        part: cols[0].trim(),
                        name: cols[1]?.trim() || '',
                        desc: cols[1]?.trim() || '',
                        listPrice: parseFloat(cols[2]) || 0,
                        mrp: parseFloat(cols[3]) || 0,
                        price: parseFloat(cols[6]) || 0,
                        stock: parseInt(cols[7]) || 0,
                        boxQty: parseInt(cols[8]) || 1,
                        masterCarton: parseInt(cols[9]) || 1,
                        brand: cols[10]?.trim() || '',
                        make: cols[11]?.trim() || '',
                        model: cols[12]?.trim() || '',
                        yearStart: cols[13]?.trim() || '',
                        yearEnd: cols[14]?.trim() || '',
                        segment: cols[15]?.trim() || '',
                        video: cols[16]?.trim() || '',
                        media: cols[17]?.trim() || '',
                        mostSelling: cols[18]?.trim() === '1',
                        hsn: cols[23]?.trim() || ''
                    });
                }
            }
            console.log(`✅ DataManager: Loaded ${productsData.length} products`);
            return productsData;
        } catch(err) {
            console.error("DataManager: Failed to load products", err);
            return [];
        }
    }

    // =====================================================
    // LOAD PURCHASE INVOICES
    // =====================================================
    function loadPurchaseInvoices() {
        purchaseInvoicesData = JSON.parse(localStorage.getItem('purchaseInvoices') || '[]');
        console.log(`✅ DataManager: Loaded ${purchaseInvoicesData.length} purchase invoices`);
        return purchaseInvoicesData;
    }

    // =====================================================
    // LOAD SALES INVOICES
    // =====================================================
    function loadSalesInvoices() {
        salesInvoicesData = JSON.parse(localStorage.getItem('allInvoices') || '[]');
        console.log(`✅ DataManager: Loaded ${salesInvoicesData.length} sales invoices`);
        return salesInvoicesData;
    }

    // =====================================================
    // LOAD SUPPLIERS
    // =====================================================
    function loadSuppliers() {
        suppliersData = JSON.parse(localStorage.getItem('suppliers') || '[]');
        console.log(`✅ DataManager: Loaded ${suppliersData.length} suppliers`);
        return suppliersData;
    }

    // =====================================================
    // LOAD CUSTOMERS
    // =====================================================
    function loadCustomers() {
        customersData = JSON.parse(localStorage.getItem('users') || '[]');
        console.log(`✅ DataManager: Loaded ${customersData.length} customers`);
        return customersData;
    }

    // =====================================================
    // BUILD STOCK TRANSACTIONS
    // =====================================================
    function buildStockTransactions() {
        stockTransactionsData = [];
        
        // Purchase Invoices (Stock IN)
        purchaseInvoicesData.forEach(inv => {
            const items = inv.items || [];
            items.forEach(item => {
                let productId = item.productId || item.part || item.sku;
                if (!productId) return;
                const qty = parseFloat(item.quantity) || parseFloat(item.qty) || 0;
                if (qty === 0) return;
                stockTransactionsData.push({
                    date: inv.date,
                    productId: String(productId),
                    type: 'Purchase',
                    inQty: qty,
                    outQty: 0,
                    ref: inv.invoiceNo || inv.poNo,
                    supplier: inv.supplierName || inv.supplierEmail
                });
            });
        });
        
        // Sales Invoices (Stock OUT)
        salesInvoicesData.forEach(inv => {
            const items = inv.items || [];
            items.forEach(item => {
                let productId = item.part || item.productId || item.sku;
                if (!productId) return;
                const qty = parseFloat(item.qty) || 0;
                if (qty === 0) return;
                stockTransactionsData.push({
                    date: inv.date,
                    productId: String(productId),
                    type: 'Sales',
                    inQty: 0,
                    outQty: qty,
                    ref: inv.invoiceNo,
                    customer: inv.customerName
                });
            });
        });
        
        // Sort by date
        stockTransactionsData.sort((a,b) => new Date(a.date) - new Date(b.date));
        
        console.log(`✅ DataManager: Built ${stockTransactionsData.length} stock transactions`);
        return stockTransactionsData;
    }

    // =====================================================
    // GET PRODUCT BY ID/SKU/PART
    // =====================================================
    function getProduct(productId) {
        return productsData.find(p => p.id === productId || p.sku === productId || p.part === productId);
    }

    // =====================================================
    // GET ALL PRODUCTS
    // =====================================================
    function getProducts() {
        return productsData;
    }

    // =====================================================
    // GET PRODUCTS WITH COMPUTED STOCK
    // =====================================================
    function getProductsWithStock() {
        // Create a map of stock changes from transactions
        const stockMap = new Map();
        
        // Initialize with current stock from products
        productsData.forEach(p => {
            stockMap.set(p.id, p.stock);
        });
        
        // Apply transactions (if needed for dynamic calculation)
        stockTransactionsData.forEach(t => {
            let current = stockMap.get(t.productId) || 0;
            if (t.type === 'Purchase') {
                stockMap.set(t.productId, current + t.inQty);
            } else if (t.type === 'Sales') {
                stockMap.set(t.productId, current - t.outQty);
            }
        });
        
        // Return products with computed stock
        return productsData.map(p => ({
            ...p,
            computedStock: stockMap.get(p.id) || p.stock
        }));
    }

    // =====================================================
    // GET UNIQUE BRANDS
    // =====================================================
    function getUniqueBrands() {
        const brands = new Set();
        productsData.forEach(p => {
            if (p.brand) brands.add(p.brand);
        });
        return [...brands].sort();
    }

    // =====================================================
    // GET UNIQUE MAKES
    // =====================================================
    function getUniqueMakes() {
        const makes = new Set();
        productsData.forEach(p => {
            if (p.make) makes.add(p.make);
        });
        return [...makes].sort();
    }

    // =====================================================
    // GET LOW STOCK PRODUCTS (<= threshold)
    // =====================================================
    function getLowStockProducts(threshold = 10) {
        return productsData.filter(p => p.stock > 0 && p.stock <= threshold);
    }

    // =====================================================
    // GET OUT OF STOCK PRODUCTS
    // =====================================================
    function getOutOfStockProducts() {
        return productsData.filter(p => p.stock === 0);
    }

    // =====================================================
    // GET TOTAL STOCK VALUE
    // =====================================================
    function getTotalStockValue() {
        return productsData.reduce((sum, p) => sum + (p.stock * p.price), 0);
    }

    // =====================================================
    // GET PURCHASE INVOICES (with supplier names)
    // =====================================================
    function getPurchaseInvoices() {
        return purchaseInvoicesData.map(inv => {
            const supplier = suppliersData.find(s => s.email === inv.supplierEmail);
            return {
                ...inv,
                supplierName: supplier ? supplier.name : (inv.supplierName || 'Unknown')
            };
        });
    }

    // =====================================================
    // GET SALES INVOICES (with customer names)
    // =====================================================
    function getSalesInvoices() {
        return salesInvoicesData.map(inv => ({
            ...inv,
            customerName: inv.customerName || inv.customerEmail || 'Guest'
        }));
    }

    // =====================================================
    // GET STOCK TRANSACTIONS FOR A PRODUCT
    // =====================================================
    function getStockTransactions(productId, fromDate = null, toDate = null) {
        let transactions = stockTransactionsData.filter(t => 
            t.productId === productId || t.productId === productId
        );
        
        if (fromDate) {
            transactions = transactions.filter(t => new Date(t.date) >= new Date(fromDate));
        }
        if (toDate) {
            transactions = transactions.filter(t => new Date(t.date) <= new Date(toDate));
        }
        
        return transactions;
    }

    // =====================================================
    // EXPORT DATA TO CSV
    // =====================================================
    function exportToCSV(data, filename, headers) {
        let csv = headers.join(',') + '\n';
        
        for (const row of data) {
            const rowData = headers.map(h => {
                let value = row[h] !== undefined ? row[h] : '';
                if (typeof value === 'string') {
                    value = value.replace(/"/g, '""');
                    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
                        value = `"${value}"`;
                    }
                }
                return value;
            });
            csv += rowData.join(',') + '\n';
        }
        
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    // =====================================================
    // REFRESH ALL DATA
    // =====================================================
    async function refreshAllData() {
        await loadProducts();
        loadPurchaseInvoices();
        loadSalesInvoices();
        loadSuppliers();
        loadCustomers();
        buildStockTransactions();
        console.log("✅ DataManager: All data refreshed");
        return {
            products: productsData.length,
            purchaseInvoices: purchaseInvoicesData.length,
            salesInvoices: salesInvoicesData.length,
            suppliers: suppliersData.length,
            customers: customersData.length,
            transactions: stockTransactionsData.length
        };
    }

    // =====================================================
    // EXPOSE GLOBAL FUNCTIONS
    // =====================================================
    window.DataManager = {
        // Load functions
        loadProducts,
        loadPurchaseInvoices,
        loadSalesInvoices,
        loadSuppliers,
        loadCustomers,
        refreshAllData,
        
        // Get functions
        getProducts,
        getProduct,
        getProductsWithStock,
        getPurchaseInvoices,
        getSalesInvoices,
        getStockTransactions,
        
        // Utility functions
        getUniqueBrands,
        getUniqueMakes,
        getLowStockProducts,
        getOutOfStockProducts,
        getTotalStockValue,
        exportToCSV,
        
        // Direct data access (read-only)
        get products() { return productsData; },
        get purchaseInvoices() { return purchaseInvoicesData; },
        get salesInvoices() { return salesInvoicesData; },
        get suppliers() { return suppliersData; },
        get customers() { return customersData; },
        get stockTransactions() { return stockTransactionsData; }
    };
    
    // Auto-refresh on load (optional)
    setTimeout(() => {
        refreshAllData();
    }, 1000);
})();
