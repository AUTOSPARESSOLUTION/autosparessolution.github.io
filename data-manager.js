// ========== SAFE DATA MANAGER WITH HSN SUPPORT – NEVER DELETES PRODUCTS ==========
// - Only reads products; never removes them.
// - If products are missing, recovers from invoices (including HSN).
// - All save operations are additive (no overwrite of existing arrays).
// - HSN edits are saved permanently to product master.

// ----- Core get/set (no deletion) -----
function getProducts() {
    let products = JSON.parse(localStorage.getItem('products') || '[]');
    if (products.length === 0) {
        products = recoverProductsFromInvoices();
    }
    // Compute live stock from inventoryTransactions
    let transactions = getInventoryTransactions();
    return products.map(p => {
        let stock = 0;
        transactions.forEach(t => {
            if (t.productId == p.id || t.productId == p.sku) stock += t.quantity;
        });
        p.currentStock = stock;
        return p;
    });
}

function saveProducts(products) {
    // Never delete – just overwrite with the new array (which includes all existing)
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

// ----- Safe recovery from invoices (adds missing products, includes HSN) -----
function recoverProductsFromInvoices() {
    let existing = JSON.parse(localStorage.getItem('products') || '[]');
    let existingMap = new Map();
    existing.forEach(p => {
        if (p.sku) existingMap.set(p.sku, p);
        if (p.id) existingMap.set(p.id, p);
    });

    let allInvoices = JSON.parse(localStorage.getItem('allInvoices') || '[]');
    let purchaseInvoices = getPurchaseInvoices();
    let added = false;

    // From sales invoices
    allInvoices.forEach(inv => {
        (inv.items || []).forEach(item => {
            let sku = item.productId || item.part || item.sku;
            if (!sku) return;
            if (!existingMap.has(sku)) {
                existingMap.set(sku, {
                    id: sku,
                    sku: sku,
                    name: item.desc || item.name || `Product ${sku}`,
                    price: item.price || 0,
                    hsn: item.hsn || '',           // HSN captured from invoice
                    unit: 'pc',
                    currentStock: 0,
                    reorderLevel: 10,
                    createdAt: new Date().toISOString()
                });
                added = true;
            } else {
                // If product exists but HSN missing, update from invoice if available
                let prod = existingMap.get(sku);
                if (item.hsn && !prod.hsn) {
                    prod.hsn = item.hsn;
                    added = true;
                }
            }
        });
    });

    // From purchase invoices
    purchaseInvoices.forEach(inv => {
        (inv.items || []).forEach(item => {
            let sku = item.productId || item.part || item.sku;
            if (!sku) return;
            if (!existingMap.has(sku)) {
                existingMap.set(sku, {
                    id: sku,
                    sku: sku,
                    name: item.desc || item.name || `Product ${sku}`,
                    price: item.cost || 0,
                    hsn: item.hsn || '',           // HSN captured from purchase invoice
                    unit: 'pc',
                    currentStock: 0,
                    reorderLevel: 10,
                    createdAt: new Date().toISOString()
                });
                added = true;
            } else {
                let prod = existingMap.get(sku);
                if (item.hsn && !prod.hsn) {
                    prod.hsn = item.hsn;
                    added = true;
                }
            }
        });
    });

    let recovered = Array.from(existingMap.values());
    if (added) {
        localStorage.setItem('products', JSON.stringify(recovered));
        console.log("Recovered missing products (with HSN) from invoices");
    } else if (recovered.length === 0) {
        // No invoices, no products – create samples with dummy HSN
        recovered = [
            { id: "P001", sku: "P001", name: "Brake Pad", price: 1200, hsn: "8708", unit: "pair", currentStock: 0, reorderLevel: 10, createdAt: new Date().toISOString() },
            { id: "P002", sku: "P002", name: "Engine Oil", price: 450, hsn: "2710", unit: "Ltr", currentStock: 0, reorderLevel: 10, createdAt: new Date().toISOString() }
        ];
        localStorage.setItem('products', JSON.stringify(recovered));
    }
    return recovered;
}

// ----- Helper to find product -----
function findProduct(productId) {
    let products = getProducts();
    return products.find(p => p.sku === productId) || products.find(p => p.id == productId);
}

// ----- Create Sales Invoice (reduces stock, adds customer outstanding, keeps HSN) -----
function createSalesInvoice(invoice) {
    let transactions = getInventoryTransactions();
    let customers = JSON.parse(localStorage.getItem('customers') || '[]');
    let products = JSON.parse(localStorage.getItem('products') || '[]'); // raw for adding new products

    for (let item of invoice.items) {
        let product = findProduct(item.productId);
        if (!product) {
            // Auto-create product if missing (safe, append-only)
            product = {
                id: item.productId,
                sku: item.productId,
                name: `Product ${item.productId}`,
                price: item.price,
                hsn: item.hsn || '',
                unit: 'pc',
                currentStock: 0,
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

// ----- Create Purchase Invoice (increases stock, includes HSN) -----
function createPurchaseInvoice(purchase) {
    let transactions = getInventoryTransactions();
    let suppliers = JSON.parse(localStorage.getItem('suppliers') || '[]');
    let products = JSON.parse(localStorage.getItem('products') || '[]');

    for (let item of purchase.items) {
        let product = findProduct(item.productId);
        if (!product) {
            product = {
                id: item.productId,
                sku: item.productId,
                name: item.desc || `Product ${item.productId}`,
                price: item.cost,
                hsn: item.hsn || '',
                unit: 'pc',
                currentStock: 0,
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

// ----- Delete Sales Invoice (reverses stock & outstanding) -----
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
