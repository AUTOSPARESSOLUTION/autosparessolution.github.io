// ========== CENTRAL DATA STORE – FORCED REBUILD ON VERSION MISMATCH ==========
// Version 2 – ensures stock correctly subtracts sold items.

const STOCK_VERSION_KEY = "inventoryTransactions_v2";

// ----- Helpers -----
function getProducts() { return JSON.parse(localStorage.getItem('products') || '[]'); }
function saveProducts(products) { localStorage.setItem('products', JSON.stringify(products)); }

function getInventoryTransactions() { return JSON.parse(localStorage.getItem('inventoryTransactions') || '[]'); }
function saveInventoryTransactions(trans) { localStorage.setItem('inventoryTransactions', JSON.stringify(trans)); }

function getSalesInvoices() { return JSON.parse(localStorage.getItem('salesInvoices') || '[]'); }
function saveSalesInvoices(invoices) { localStorage.setItem('salesInvoices', JSON.stringify(invoices)); }

function getPurchaseInvoices() { return JSON.parse(localStorage.getItem('purchaseInvoices') || '[]'); }
function savePurchaseInvoices(invoices) { localStorage.setItem('purchaseInvoices', JSON.stringify(invoices)); }

// ----- Force rebuild if version changed or no transactions -----
function ensureInventoryTransactions() {
    let savedVersion = localStorage.getItem(STOCK_VERSION_KEY);
    let invTransactions = getInventoryTransactions();
    
    // If version matches and transactions exist, assume correct
    if (savedVersion === "2" && invTransactions.length > 0) return;
    
    console.log("Rebuilding inventory transactions from invoices (version 2)");
    invTransactions = [];
    let products = getProducts();
    
    // Build map: both SKU and ID map to product ID
    let productIdMap = new Map();
    products.forEach(p => {
        if (p.sku) productIdMap.set(p.sku, p.id);
        if (p.id) productIdMap.set(p.id, p.id);
    });
    
    // ----- 1. Purchase invoices (stock IN) -----
    let purchases = getPurchaseInvoices();
    purchases.forEach(inv => {
        let items = inv.items || [];
        items.forEach(item => {
            let productRef = item.productId || item.part || item.sku;
            if (!productRef) return;
            let qty = parseFloat(item.quantity) || parseFloat(item.qty) || 0;
            if (qty <= 0) return;
            let productId = productIdMap.get(productRef);
            if (!productId) {
                // Unknown product – create placeholder
                productId = String(productRef);
                if (!productIdMap.has(productRef)) productIdMap.set(productRef, productId);
            }
            invTransactions.push({
                id: Date.now() + Math.random(),
                productId: productId,
                type: 'purchase',
                quantity: qty,
                date: inv.date,
                ref: inv.invoiceNo || inv.poNo
            });
        });
    });
    
    // ----- 2. Sales invoices (stock OUT) – read from BOTH allInvoices and salesInvoices -----
    let allInvoices = JSON.parse(localStorage.getItem('allInvoices') || '[]');
    let salesInvoices = getSalesInvoices();
    let combinedSales = [...allInvoices, ...salesInvoices];
    // Remove duplicates by invoiceNo/id (simple: use Set of stringified)
    let unique = new Map();
    combinedSales.forEach(inv => {
        let key = inv.id || inv.invoiceNo;
        if (key && !unique.has(key)) unique.set(key, inv);
    });
    let salesList = Array.from(unique.values());
    
    salesList.forEach(inv => {
        let items = inv.items || [];
        items.forEach(item => {
            let productRef = item.productId || item.part || item.sku;
            if (!productRef) return;
            let qty = parseFloat(item.qty) || parseFloat(item.quantity) || 0;
            if (qty <= 0) return;
            let productId = productIdMap.get(productRef);
            if (!productId) {
                productId = String(productRef);
                if (!productIdMap.has(productRef)) productIdMap.set(productRef, productId);
            }
            invTransactions.push({
                id: Date.now() + Math.random(),
                productId: productId,
                type: 'sales',
                quantity: -qty,
                date: inv.date,
                ref: inv.invoiceNo
            });
        });
    });
    
    // Save rebuilt transactions
    saveInventoryTransactions(invTransactions);
    
    // Update each product's currentStock
    products.forEach(p => {
        let stock = 0;
        invTransactions.forEach(t => {
            if (t.productId == p.id || t.productId == p.sku) stock += t.quantity;
        });
        p.currentStock = stock;
    });
    saveProducts(products);
    
    // Store version flag
    localStorage.setItem(STOCK_VERSION_KEY, "2");
    console.log(`Rebuilt ${invTransactions.length} inventory transactions.`);
}

// ----- getProducts with dynamic stock (always from ledger) -----
function getProductsWithStock() {
    ensureInventoryTransactions();
    let products = getProducts();
    let invTransactions = getInventoryTransactions();
    return products.map(p => {
        let stock = 0;
        invTransactions.forEach(t => {
            if (t.productId == p.id || t.productId == p.sku) stock += t.quantity;
        });
        p.currentStock = stock;
        return p;
    });
}
// Override the old getProducts to use this dynamic version
window.getProducts = getProductsWithStock;

// ----- Helper: find product (using dynamic stock) -----
function findProduct(productId) {
    let products = getProductsWithStock();
    return products.find(p => p.sku === productId) || products.find(p => p.id == productId);
}

// ----- 1. Create Sales Invoice (updates stock & customer) -----
function createSalesInvoice(invoice) {
    ensureInventoryTransactions();
    let invTransactions = getInventoryTransactions();
    let customers = JSON.parse(localStorage.getItem('customers') || '[]');
    let products = getProducts(); // raw products without stock (we'll add transactions)
    
    for (let item of invoice.items) {
        let product = findProduct(item.productId);
        if (!product) {
            // Auto-create
            product = {
                id: item.productId,
                sku: item.productId,
                name: `Product ${item.productId}`,
                unit: 'pc',
                price: item.price,
                reorderLevel: 10,
                createdAt: new Date().toISOString()
            };
            products.push(product);
            saveProducts(products);
        }
        invTransactions.push({
            id: Date.now() + Math.random(),
            productId: product.id,
            type: 'sales',
            quantity: -item.quantity,
            date: invoice.date,
            ref: invoice.invoiceNo || `INV-${invoice.id}`
        });
    }
    saveInventoryTransactions(invTransactions);
    
    // Save invoice
    let salesInvoices = getSalesInvoices();
    salesInvoices.push(invoice);
    saveSalesInvoices(salesInvoices);
    let allInvoices = JSON.parse(localStorage.getItem('allInvoices') || '[]');
    allInvoices.push(invoice);
    localStorage.setItem('allInvoices', JSON.stringify(allInvoices));
    
    // Customer outstanding
    let customer = customers.find(c => c.email === invoice.customerEmail);
    if (customer) {
        customer.outstanding = (customer.outstanding || 0) + invoice.total;
        localStorage.setItem('customers', JSON.stringify(customers));
        let customerLedger = JSON.parse(localStorage.getItem('customerLedger') || '[]');
        customerLedger.push({
            id: Date.now(),
            customerEmail: invoice.customerEmail,
            date: invoice.date,
            type: 'invoice',
            ref: invoice.invoiceNo,
            debit: invoice.total,
            credit: 0,
            balance: customer.outstanding
        });
        localStorage.setItem('customerLedger', JSON.stringify(customerLedger));
    }
    return true;
}

// ----- 2. Create Purchase Invoice (increases stock) -----
function createPurchaseInvoice(purchase) {
    ensureInventoryTransactions();
    let invTransactions = getInventoryTransactions();
    let suppliers = JSON.parse(localStorage.getItem('suppliers') || '[]');
    let products = getProducts();
    
    for (let item of purchase.items) {
        let product = findProduct(item.productId);
        if (!product) {
            product = {
                id: item.productId,
                sku: item.productId,
                name: item.desc || `Product ${item.productId}`,
                unit: 'pc',
                price: item.cost,
                reorderLevel: 10,
                createdAt: new Date().toISOString()
            };
            products.push(product);
            saveProducts(products);
        }
        invTransactions.push({
            id: Date.now() + Math.random(),
            productId: product.id,
            type: 'purchase',
            quantity: item.quantity,
            date: purchase.date,
            ref: purchase.poNo || `PO-${purchase.id}`
        });
    }
    saveInventoryTransactions(invTransactions);
    
    let purchaseInvoices = getPurchaseInvoices();
    purchaseInvoices.push(purchase);
    savePurchaseInvoices(purchaseInvoices);
    
    let supplier = suppliers.find(s => s.email === purchase.supplierEmail);
    if (supplier) {
        supplier.outstanding = (supplier.outstanding || 0) + purchase.total;
        localStorage.setItem('suppliers', JSON.stringify(suppliers));
        let supplierLedger = JSON.parse(localStorage.getItem('supplierLedger') || '[]');
        supplierLedger.push({
            id: Date.now(),
            supplierEmail: purchase.supplierEmail,
            date: purchase.date,
            type: 'purchase',
            ref: purchase.poNo,
            debit: purchase.total,
            credit: 0,
            balance: supplier.outstanding
        });
        localStorage.setItem('supplierLedger', JSON.stringify(supplierLedger));
    }
    return true;
}

// ----- 3. Customer Payment -----
function receiveCustomerPayment(payment) {
    let customers = JSON.parse(localStorage.getItem('customers') || '[]');
    let customer = customers.find(c => c.email === payment.customerEmail);
    if (!customer) throw new Error('Customer not found');
    customer.outstanding = Math.max(0, (customer.outstanding || 0) - payment.amount);
    localStorage.setItem('customers', JSON.stringify(customers));
    
    let customerLedger = JSON.parse(localStorage.getItem('customerLedger') || '[]');
    customerLedger.push({
        id: Date.now(),
        customerEmail: payment.customerEmail,
        date: payment.date,
        type: 'payment',
        ref: payment.reference,
        debit: 0,
        credit: payment.amount,
        balance: customer.outstanding
    });
    localStorage.setItem('customerLedger', JSON.stringify(customerLedger));
    
    let payments = JSON.parse(localStorage.getItem('customerPayments') || '[]');
    payments.push(payment);
    localStorage.setItem('customerPayments', JSON.stringify(payments));
    return true;
}

// ----- 4. Supplier Payment -----
function paySupplier(payment) {
    let suppliers = JSON.parse(localStorage.getItem('suppliers') || '[]');
    let supplier = suppliers.find(s => s.email === payment.supplierEmail);
    if (!supplier) throw new Error('Supplier not found');
    supplier.outstanding = Math.max(0, (supplier.outstanding || 0) - payment.amount);
    localStorage.setItem('suppliers', JSON.stringify(suppliers));
    
    let supplierLedger = JSON.parse(localStorage.getItem('supplierLedger') || '[]');
    supplierLedger.push({
        id: Date.now(),
        supplierEmail: payment.supplierEmail,
        date: payment.date,
        type: 'payment',
        ref: payment.reference,
        debit: 0,
        credit: payment.amount,
        balance: supplier.outstanding
    });
    localStorage.setItem('supplierLedger', JSON.stringify(supplierLedger));
    
    let supplierPayments = JSON.parse(localStorage.getItem('supplierPayments') || '[]');
    supplierPayments.push(payment);
    localStorage.setItem('supplierPayments', JSON.stringify(supplierPayments));
    return true;
}

// ----- 5. Delete Sales Invoice (reverse stock & outstanding) -----
function deleteSalesInvoice(invoiceId) {
    let salesInvoices = getSalesInvoices();
    let invoice = salesInvoices.find(i => i.id == invoiceId);
    if (!invoice) return false;
    
    let invTransactions = getInventoryTransactions();
    for (let item of invoice.items) {
        let product = findProduct(item.productId);
        if (product) {
            invTransactions.push({
                id: Date.now(),
                productId: product.id,
                type: 'sales_return',
                quantity: item.quantity,
                date: new Date().toISOString().slice(0,10),
                ref: `RET-${invoiceId}`
            });
        }
    }
    saveInventoryTransactions(invTransactions);
    
    let remaining = salesInvoices.filter(i => i.id != invoiceId);
    saveSalesInvoices(remaining);
    let allInvoices = JSON.parse(localStorage.getItem('allInvoices') || '[]');
    allInvoices = allInvoices.filter(i => i.id != invoiceId);
    localStorage.setItem('allInvoices', JSON.stringify(allInvoices));
    
    let customers = JSON.parse(localStorage.getItem('customers') || '[]');
    let customer = customers.find(c => c.email === invoice.customerEmail);
    if (customer) {
        customer.outstanding = Math.max(0, (customer.outstanding || 0) - invoice.total);
        localStorage.setItem('customers', JSON.stringify(customers));
        let customerLedger = JSON.parse(localStorage.getItem('customerLedger') || '[]');
        customerLedger.push({
            id: Date.now(),
            customerEmail: invoice.customerEmail,
            date: new Date().toISOString().slice(0,10),
            type: 'reversal',
            ref: `DEL-${invoice.invoiceNo}`,
            debit: 0,
            credit: invoice.total,
            balance: customer.outstanding
        });
        localStorage.setItem('customerLedger', JSON.stringify(customerLedger));
    }
    return true;
}

// ----- 6. Stock Report -----
function getCurrentStock() {
    let products = getProductsWithStock();
    return products.map(p => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        currentStock: p.currentStock,
        reorderLevel: p.reorderLevel || 0,
        unit: p.unit
    }));
}

// ----- Manual rebuild (if needed) -----
function rebuildAllStock() {
    localStorage.removeItem(STOCK_VERSION_KEY);
    ensureInventoryTransactions();
    console.log("Manual stock rebuild complete");
}

// Run once on load
ensureInventoryTransactions();
