// ========== SAFE DATA-MANAGER.JS – NO DATA LOSS ==========
// This version preserves all products, invoices, customers.
// It rebuilds inventoryTransactions from invoices only if missing,
// and always returns all products (stock may be zero).

// ----- Core get/set helpers (safe) -----
function getProducts() {
    return JSON.parse(localStorage.getItem('products') || '[]');
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

// ----- Rebuild inventoryTransactions from invoices (if needed) -----
function rebuildInventoryTransactions() {
    let existing = getInventoryTransactions();
    if (existing.length > 0) return existing; // already built

    console.log("Rebuilding inventory transactions from invoices...");
    let newTrans = [];
    let products = getProducts();
    let productMap = new Map();
    products.forEach(p => {
        if (p.sku) productMap.set(p.sku, p.id);
        if (p.id) productMap.set(p.id, p.id);
    });

    // Purchase invoices (stock in)
    let purchases = getPurchaseInvoices();
    purchases.forEach(inv => {
        (inv.items || []).forEach(item => {
            let ref = item.productId || item.part || item.sku;
            if (!ref) return;
            let qty = parseFloat(item.quantity) || parseFloat(item.qty) || 0;
            if (qty <= 0) return;
            let pid = productMap.get(ref) || ref;
            newTrans.push({
                id: Date.now() + Math.random(),
                productId: String(pid),
                type: 'purchase',
                quantity: qty,
                date: inv.date,
                ref: inv.invoiceNo || inv.poNo
            });
        });
    });

    // Sales invoices (stock out) from allInvoices and salesInvoices
    let allInvoices = JSON.parse(localStorage.getItem('allInvoices') || '[]');
    let salesInvoices = getSalesInvoices();
    let combined = [...allInvoices, ...salesInvoices];
    let unique = new Map();
    combined.forEach(inv => { let key = inv.id || inv.invoiceNo; if (key) unique.set(key, inv); });
    let salesList = Array.from(unique.values());

    salesList.forEach(inv => {
        (inv.items || []).forEach(item => {
            let ref = item.productId || item.part || item.sku;
            if (!ref) return;
            let qty = parseFloat(item.qty) || parseFloat(item.quantity) || 0;
            if (qty <= 0) return;
            let pid = productMap.get(ref) || ref;
            newTrans.push({
                id: Date.now() + Math.random(),
                productId: String(pid),
                type: 'sales',
                quantity: -qty,
                date: inv.date,
                ref: inv.invoiceNo
            });
        });
    });

    saveInventoryTransactions(newTrans);
    console.log(`Rebuilt ${newTrans.length} transactions.`);
    return newTrans;
}

// ----- getProductsWithStock: returns all products with live stock -----
function getProductsWithStock() {
    let products = getProducts();
    let transactions = rebuildInventoryTransactions(); // ensures exists
    return products.map(p => {
        let stock = 0;
        transactions.forEach(t => {
            if (t.productId == p.id || t.productId == p.sku) stock += t.quantity;
        });
        p.currentStock = stock;
        return p;
    });
}

// Override the global getProducts to use dynamic stock
window.getProducts = getProductsWithStock;

// ----- Helper to find product by SKU or ID -----
function findProduct(productId) {
    let products = getProductsWithStock();
    return products.find(p => p.sku === productId) || products.find(p => p.id == productId);
}

// ----- Create Sales Invoice (reduces stock, adds to customer outstanding) -----
function createSalesInvoice(invoice) {
    let transactions = getInventoryTransactions();
    let customers = JSON.parse(localStorage.getItem('customers') || '[]');
    let products = getProducts(); // raw product list (without stock)

    for (let item of invoice.items) {
        let product = findProduct(item.productId);
        if (!product) {
            // Auto-create product if missing
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
        transactions.push({
            id: Date.now() + Math.random(),
            productId: product.id,
            type: 'sales',
            quantity: -item.quantity,
            date: invoice.date,
            ref: invoice.invoiceNo || `INV-${invoice.id}`
        });
    }
    saveInventoryTransactions(transactions);

    let salesInvoices = getSalesInvoices();
    salesInvoices.push(invoice);
    saveSalesInvoices(salesInvoices);
    let allInvoices = JSON.parse(localStorage.getItem('allInvoices') || '[]');
    allInvoices.push(invoice);
    localStorage.setItem('allInvoices', JSON.stringify(allInvoices));

    let customer = customers.find(c => c.email === invoice.customerEmail);
    if (customer) {
        customer.outstanding = (customer.outstanding || 0) + invoice.total;
        localStorage.setItem('customers', JSON.stringify(customers));
        let ledger = JSON.parse(localStorage.getItem('customerLedger') || '[]');
        ledger.push({
            id: Date.now(),
            customerEmail: invoice.customerEmail,
            date: invoice.date,
            type: 'invoice',
            ref: invoice.invoiceNo,
            debit: invoice.total,
            credit: 0,
            balance: customer.outstanding
        });
        localStorage.setItem('customerLedger', JSON.stringify(ledger));
    }
    return true;
}

// ----- Create Purchase Invoice (increases stock) -----
function createPurchaseInvoice(purchase) {
    let transactions = getInventoryTransactions();
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
        transactions.push({
            id: Date.now() + Math.random(),
            productId: product.id,
            type: 'purchase',
            quantity: item.quantity,
            date: purchase.date,
            ref: purchase.poNo || `PO-${purchase.id}`
        });
    }
    saveInventoryTransactions(transactions);

    let purchaseInvoices = getPurchaseInvoices();
    purchaseInvoices.push(purchase);
    savePurchaseInvoices(purchaseInvoices);

    let supplier = suppliers.find(s => s.email === purchase.supplierEmail);
    if (supplier) {
        supplier.outstanding = (supplier.outstanding || 0) + purchase.total;
        localStorage.setItem('suppliers', JSON.stringify(suppliers));
        let ledger = JSON.parse(localStorage.getItem('supplierLedger') || '[]');
        ledger.push({
            id: Date.now(),
            supplierEmail: purchase.supplierEmail,
            date: purchase.date,
            type: 'purchase',
            ref: purchase.poNo,
            debit: purchase.total,
            credit: 0,
            balance: supplier.outstanding
        });
        localStorage.setItem('supplierLedger', JSON.stringify(ledger));
    }
    return true;
}

// ----- Customer Payment -----
function receiveCustomerPayment(payment) {
    let customers = JSON.parse(localStorage.getItem('customers') || '[]');
    let customer = customers.find(c => c.email === payment.customerEmail);
    if (!customer) throw new Error('Customer not found');
    customer.outstanding = Math.max(0, (customer.outstanding || 0) - payment.amount);
    localStorage.setItem('customers', JSON.stringify(customers));
    let ledger = JSON.parse(localStorage.getItem('customerLedger') || '[]');
    ledger.push({
        id: Date.now(),
        customerEmail: payment.customerEmail,
        date: payment.date,
        type: 'payment',
        ref: payment.reference,
        debit: 0,
        credit: payment.amount,
        balance: customer.outstanding
    });
    localStorage.setItem('customerLedger', JSON.stringify(ledger));
    let payments = JSON.parse(localStorage.getItem('customerPayments') || '[]');
    payments.push(payment);
    localStorage.setItem('customerPayments', JSON.stringify(payments));
    return true;
}

// ----- Supplier Payment -----
function paySupplier(payment) {
    let suppliers = JSON.parse(localStorage.getItem('suppliers') || '[]');
    let supplier = suppliers.find(s => s.email === payment.supplierEmail);
    if (!supplier) throw new Error('Supplier not found');
    supplier.outstanding = Math.max(0, (supplier.outstanding || 0) - payment.amount);
    localStorage.setItem('suppliers', JSON.stringify(suppliers));
    let ledger = JSON.parse(localStorage.getItem('supplierLedger') || '[]');
    ledger.push({
        id: Date.now(),
        supplierEmail: payment.supplierEmail,
        date: payment.date,
        type: 'payment',
        ref: payment.reference,
        debit: 0,
        credit: payment.amount,
        balance: supplier.outstanding
    });
    localStorage.setItem('supplierLedger', JSON.stringify(ledger));
    let payments = JSON.parse(localStorage.getItem('supplierPayments') || '[]');
    payments.push(payment);
    localStorage.setItem('supplierPayments', JSON.stringify(payments));
    return true;
}

// ----- Delete Sales Invoice (reverse stock & outstanding) -----
function deleteSalesInvoice(invoiceId) {
    let salesInvoices = getSalesInvoices();
    let invoice = salesInvoices.find(i => i.id == invoiceId);
    if (!invoice) return false;

    let transactions = getInventoryTransactions();
    for (let item of invoice.items) {
        let product = findProduct(item.productId);
        if (product) {
            transactions.push({
                id: Date.now(),
                productId: product.id,
                type: 'sales_return',
                quantity: item.quantity,
                date: new Date().toISOString().slice(0,10),
                ref: `RET-${invoiceId}`
            });
        }
    }
    saveInventoryTransactions(transactions);

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
        let ledger = JSON.parse(localStorage.getItem('customerLedger') || '[]');
        ledger.push({
            id: Date.now(),
            customerEmail: invoice.customerEmail,
            date: new Date().toISOString().slice(0,10),
            type: 'reversal',
            ref: `DEL-${invoice.invoiceNo}`,
            debit: 0,
            credit: invoice.total,
            balance: customer.outstanding
        });
        localStorage.setItem('customerLedger', JSON.stringify(ledger));
    }
    return true;
}

// ----- Stock Report -----
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
    localStorage.removeItem('inventoryTransactions');
    rebuildInventoryTransactions();
    console.log("Stock manually rebuilt.");
}

// Initialize: rebuild only if needed
rebuildInventoryTransactions();
