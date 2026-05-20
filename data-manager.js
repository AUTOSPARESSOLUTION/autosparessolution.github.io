// ========== CENTRAL DATA STORE – AUTOMATIC STOCK REBUILD ==========
// This version checks for missing inventoryTransactions and rebuilds them
// from existing invoices. Then getProducts() always returns correct stock.

// ----- Helper: get / save data -----
function getProducts() {
    ensureInventoryTransactions();  // rebuild if missing
    let products = JSON.parse(localStorage.getItem('products') || '[]');
    let invTransactions = getInventoryTransactions();
    
    // Compute current stock for each product using inventory ledger
    return products.map(p => {
        let stock = 0;
        invTransactions.forEach(t => {
            if (t.productId == p.id || t.productId == p.sku) {
                stock += t.quantity;
            }
        });
        p.currentStock = stock;
        return p;
    });
}

function saveProducts(products) {
    localStorage.setItem('products', JSON.stringify(products));
}

function getInventoryTransactions() {
    return JSON.parse(localStorage.getItem('inventoryTransactions') || '[]');
}
function saveInventoryTransactions(trans) {
    localStorage.setItem('inventoryTransactions', JSON.stringify(trans));
}

function getSalesInvoices() {
    return JSON.parse(localStorage.getItem('salesInvoices') || '[]');
}
function saveSalesInvoices(invoices) {
    localStorage.setItem('salesInvoices', JSON.stringify(invoices));
}

function getPurchaseInvoices() {
    return JSON.parse(localStorage.getItem('purchaseInvoices') || '[]');
}
function savePurchaseInvoices(invoices) {
    localStorage.setItem('purchaseInvoices', JSON.stringify(invoices));
}

// ----- Auto‑rebuild inventoryTransactions from invoices if needed -----
function ensureInventoryTransactions() {
    let invTransactions = getInventoryTransactions();
    if (invTransactions.length > 0) return; // already exists
    
    console.log("Rebuilding inventoryTransactions from invoices...");
    invTransactions = [];
    let productsMap = new Map();
    
    // Load all products for ID mapping
    let products = JSON.parse(localStorage.getItem('products') || '[]');
    products.forEach(p => {
        productsMap.set(p.sku, p.id);
        productsMap.set(p.id, p.id);
    });
    
    // 1. Purchase invoices (stock IN)
    let purchases = JSON.parse(localStorage.getItem('purchaseInvoices') || '[]');
    purchases.forEach(pur => {
        (pur.items || []).forEach(item => {
            let productId = item.productId || item.part;
            if (!productId) return;
            let qty = parseFloat(item.quantity) || 0;
            if (qty === 0) return;
            // Use product ID from map if available, else keep as string
            let realId = productsMap.get(productId) || String(productId);
            invTransactions.push({
                id: Date.now() + Math.random(),
                productId: realId,
                type: 'purchase',
                quantity: qty,
                date: pur.date,
                ref: pur.invoiceNo || pur.poNo
            });
        });
    });
    
    // 2. Sales invoices (stock OUT)
    let sales = JSON.parse(localStorage.getItem('allInvoices') || '[]');
    sales.forEach(sale => {
        (sale.items || []).forEach(item => {
            let productId = item.productId || item.part;
            if (!productId) return;
            let qty = parseFloat(item.qty) || 0;
            if (qty === 0) return;
            let realId = productsMap.get(productId) || String(productId);
            invTransactions.push({
                id: Date.now() + Math.random(),
                productId: realId,
                type: 'sales',
                quantity: -qty,
                date: sale.date,
                ref: sale.invoiceNo
            });
        });
    });
    
    saveInventoryTransactions(invTransactions);
    
    // Update product currentStock for direct usage (optional)
    let allProducts = JSON.parse(localStorage.getItem('products') || '[]');
    allProducts.forEach(p => {
        let stock = 0;
        invTransactions.forEach(t => {
            if (t.productId == p.id || t.productId == p.sku) stock += t.quantity;
        });
        p.currentStock = stock;
    });
    saveProducts(allProducts);
    console.log("InventoryTransactions rebuilt. Total entries:", invTransactions.length);
}

// ----- Helper: find product by SKU or ID (SKU first) -----
function findProduct(productId) {
    const products = getProducts(); // already dynamic
    return products.find(p => p.sku === productId) || products.find(p => p.id == productId);
}

// ----- 1. Sales Invoice – reduces stock, increases customer outstanding -----
function createSalesInvoice(invoice) {
    let invTransactions = getInventoryTransactions();
    let customers = JSON.parse(localStorage.getItem('customers') || '[]');
    let products = getProducts();  // dynamic stock, but we only need for product existence
    
    for (let item of invoice.items) {
        let product = findProduct(item.productId);
        if (!product) {
            // Auto-create product
            product = {
                id: item.productId,
                sku: item.productId,
                name: `Product ${item.productId}`,
                unit: 'pc',
                price: item.price,
                reorderLevel: 10,
                createdAt: new Date().toISOString()
            };
            let allProducts = JSON.parse(localStorage.getItem('products') || '[]');
            allProducts.push(product);
            saveProducts(allProducts);
        }
        invTransactions.push({
            id: Date.now() + Math.random(),
            productId: product.id,
            type: 'sales',
            quantity: -item.quantity,
            date: invoice.date,
            ref: invoice.invoiceNo || `INV-${invoice.id}`,
        });
    }
    saveInventoryTransactions(invTransactions);
    
    let salesInvoices = getSalesInvoices();
    salesInvoices.push(invoice);
    saveSalesInvoices(salesInvoices);
    
    // Also store in allInvoices for backward compatibility
    let allInvoices = JSON.parse(localStorage.getItem('allInvoices') || '[]');
    allInvoices.push(invoice);
    localStorage.setItem('allInvoices', JSON.stringify(allInvoices));
    
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
            ref: invoice.invoiceNo || `INV-${invoice.id}`,
            debit: invoice.total,
            credit: 0,
            balance: customer.outstanding
        });
        localStorage.setItem('customerLedger', JSON.stringify(customerLedger));
    }
    return true;
}

// ----- 2. Purchase Invoice – increases stock, increases supplier outstanding -----
function createPurchaseInvoice(purchase) {
    let invTransactions = getInventoryTransactions();
    let suppliers = JSON.parse(localStorage.getItem('suppliers') || '[]');
    
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
            let allProducts = JSON.parse(localStorage.getItem('products') || '[]');
            allProducts.push(product);
            saveProducts(allProducts);
        }
        invTransactions.push({
            id: Date.now() + Math.random(),
            productId: product.id,
            type: 'purchase',
            quantity: item.quantity,
            date: purchase.date,
            ref: purchase.poNo || `PO-${purchase.id}`,
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
            ref: purchase.poNo || `PO-${purchase.id}`,
            debit: purchase.total,
            credit: 0,
            balance: supplier.outstanding
        });
        localStorage.setItem('supplierLedger', JSON.stringify(supplierLedger));
    }
    return true;
}

// ----- 3. Customer Payment – reduces outstanding -----
function receiveCustomerPayment(payment) {
    let customers = JSON.parse(localStorage.getItem('customers') || '[]');
    let customer = customers.find(c => c.email === payment.customerEmail);
    if (!customer) throw new Error('Customer not found');
    
    let oldOutstanding = customer.outstanding || 0;
    let newOutstanding = Math.max(0, oldOutstanding - payment.amount);
    customer.outstanding = newOutstanding;
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
        balance: newOutstanding
    });
    localStorage.setItem('customerLedger', JSON.stringify(customerLedger));
    
    let payments = JSON.parse(localStorage.getItem('customerPayments') || '[]');
    payments.push(payment);
    localStorage.setItem('customerPayments', JSON.stringify(payments));
    return true;
}

// ----- 4. Supplier Payment – reduces outstanding -----
function paySupplier(payment) {
    let suppliers = JSON.parse(localStorage.getItem('suppliers') || '[]');
    let supplier = suppliers.find(s => s.email === payment.supplierEmail);
    if (!supplier) throw new Error('Supplier not found');
    
    let oldOutstanding = supplier.outstanding || 0;
    let newOutstanding = Math.max(0, oldOutstanding - payment.amount);
    supplier.outstanding = newOutstanding;
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
        balance: newOutstanding
    });
    localStorage.setItem('supplierLedger', JSON.stringify(supplierLedger));
    
    let supplierPayments = JSON.parse(localStorage.getItem('supplierPayments') || '[]');
    supplierPayments.push(payment);
    localStorage.setItem('supplierPayments', JSON.stringify(supplierPayments));
    return true;
}

// ----- 5. Stock Report – current stock levels -----
function getCurrentStock() {
    let products = getProducts();
    return products.map(p => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        currentStock: p.currentStock,
        reorderLevel: p.reorderLevel || 0,
        unit: p.unit
    }));
}

// ----- 6. Delete Sales Invoice (reverse effects) -----
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
    
    // Also remove from allInvoices
    let allInvoices = JSON.parse(localStorage.getItem('allInvoices') || '[]');
    allInvoices = allInvoices.filter(i => i.id != invoiceId);
    localStorage.setItem('allInvoices', JSON.stringify(allInvoices));
    
    let customers = JSON.parse(localStorage.getItem('customers') || '[]');
    let customer = customers.find(c => c.email === invoice.customerEmail);
    if (customer) {
        customer.outstanding -= invoice.total;
        if (customer.outstanding < 0) customer.outstanding = 0;
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
            balance: customer.outstanding,
            note: `Invoice ${invoice.invoiceNo} deleted`
        });
        localStorage.setItem('customerLedger', JSON.stringify(customerLedger));
    }
    return true;
}

// ----- 7. Public rebuild function (if needed manually) -----
function rebuildAllStock() {
    let invTransactions = [];
    let productsMap = new Map();
    let products = JSON.parse(localStorage.getItem('products') || '[]');
    products.forEach(p => {
        productsMap.set(p.sku, p.id);
        productsMap.set(p.id, p.id);
    });
    
    let purchases = JSON.parse(localStorage.getItem('purchaseInvoices') || '[]');
    purchases.forEach(pur => {
        (pur.items || []).forEach(item => {
            let pid = item.productId || item.part;
            if (!pid) return;
            let qty = parseFloat(item.quantity) || 0;
            if (qty === 0) return;
            let realId = productsMap.get(pid) || String(pid);
            invTransactions.push({
                id: Date.now() + Math.random(),
                productId: realId,
                type: 'purchase',
                quantity: qty,
                date: pur.date,
                ref: pur.invoiceNo || pur.poNo
            });
        });
    });
    
    let sales = JSON.parse(localStorage.getItem('allInvoices') || '[]');
    sales.forEach(sale => {
        (sale.items || []).forEach(item => {
            let pid = item.productId || item.part;
            if (!pid) return;
            let qty = parseFloat(item.qty) || 0;
            if (qty === 0) return;
            let realId = productsMap.get(pid) || String(pid);
            invTransactions.push({
                id: Date.now() + Math.random(),
                productId: realId,
                type: 'sales',
                quantity: -qty,
                date: sale.date,
                ref: sale.invoiceNo
            });
        });
    });
    
    saveInventoryTransactions(invTransactions);
    
    products.forEach(p => {
        let stock = 0;
        invTransactions.forEach(t => {
            if (t.productId == p.id || t.productId == p.sku) stock += t.quantity;
        });
        p.currentStock = stock;
    });
    saveProducts(products);
    console.log("Stock rebuilt. Transactions:", invTransactions.length);
}

// Ensure inventoryTransactions exist immediately on script load
ensureInventoryTransactions();
