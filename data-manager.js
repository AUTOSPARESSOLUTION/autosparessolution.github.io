// ========== CENTRAL DATA STORE – DYNAMIC STOCK FROM LEDGER ==========
// All stock values are computed on‑the‑fly from inventoryTransactions.
// This ensures product selector always shows accurate stock.

// ----- Helper: get / save data -----
function getProducts() {
    let products = JSON.parse(localStorage.getItem('products') || '[]');
    let invTransactions = getInventoryTransactions();
    
    // Compute current stock for each product using inventory ledger
    return products.map(p => {
        let stock = 0;
        invTransactions.forEach(t => {
            if (t.productId == p.id || t.productId == p.sku) {
                stock += t.quantity;   // quantity is positive for purchase, negative for sales
            }
        });
        // Also add any manual opening stock stored in product's currentStock? 
        // But we trust ledger. Optionally include initialStock field.
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

// ----- Helper: find product by SKU or ID (SKU first) -----
function findProduct(productId) {
    const products = getProducts(); // already dynamic stock
    return products.find(p => p.sku === productId) || products.find(p => p.id == productId);
}

// ----- 1. Sales Invoice – reduces stock, increases customer outstanding -----
function createSalesInvoice(invoice) {
    // invoice: { id, date, customerEmail, items: [{productId, quantity, price}], total, invoiceNo, status }
    let products = getProducts(); // dynamic products (stock not used directly)
    let invTransactions = getInventoryTransactions();
    let customers = JSON.parse(localStorage.getItem('customers') || '[]');
    
    for (let item of invoice.items) {
        let product = findProduct(item.productId);
        if (!product) {
            // Auto-create product if missing (using SKU as ID)
            product = {
                id: item.productId,
                sku: item.productId,
                name: `Product ${item.productId}`,
                currentStock: 0,
                unit: 'pc',
                price: item.price,
                reorderLevel: 10,
                createdAt: new Date().toISOString()
            };
            products.push(product);
            // We'll need to save products after the loop
        }
        // Log a negative stock warning (but allow)
        let currentStock = product.currentStock; // dynamic
        let newStock = currentStock - item.quantity;
        if (newStock < 0) console.warn(`Negative stock for ${product.name}: ${newStock}`);
        
        invTransactions.push({
            id: Date.now() + Math.random(),
            productId: product.id,
            type: 'sales',
            quantity: -item.quantity,
            date: invoice.date,
            ref: invoice.invoiceNo || `INV-${invoice.id}`,
            balanceAfter: newStock  // This is just for reference; actual balance computed on read
        });
    }
    // Save products (if any new ones were added)
    saveProducts(products);
    saveInventoryTransactions(invTransactions);
    
    let salesInvoices = getSalesInvoices();
    salesInvoices.push(invoice);
    saveSalesInvoices(salesInvoices);
    
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
    // purchase: { id, date, supplierEmail, items: [{productId, quantity, cost}], total, poNo }
    let products = getProducts();
    let invTransactions = getInventoryTransactions();
    let suppliers = JSON.parse(localStorage.getItem('suppliers') || '[]');
    
    for (let item of purchase.items) {
        let product = findProduct(item.productId);
        if (!product) {
            product = {
                id: item.productId,
                sku: item.productId,
                name: item.desc || `Product ${item.productId}`,
                currentStock: 0,
                unit: 'pc',
                price: item.cost,
                reorderLevel: 10,
                createdAt: new Date().toISOString()
            };
            products.push(product);
        }
        let currentStock = product.currentStock;
        let newStock = currentStock + item.quantity;
        
        invTransactions.push({
            id: Date.now() + Math.random(),
            productId: product.id,
            type: 'purchase',
            quantity: item.quantity,
            date: purchase.date,
            ref: purchase.poNo || `PO-${purchase.id}`,
            balanceAfter: newStock
        });
    }
    saveProducts(products);
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

// ----- 3. Customer Payment – reduces customer outstanding -----
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

// ----- 4. Supplier Payment – reduces supplier outstanding -----
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

// ----- 5. Stock Report – current stock levels (dynamic) -----
function getCurrentStock() {
    let products = getProducts(); // already computed from ledger
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
    // Add reversal entries for stock
    for (let item of invoice.items) {
        let product = findProduct(item.productId);
        if (product) {
            let currentStock = product.currentStock;
            let newStock = currentStock + item.quantity;
            invTransactions.push({
                id: Date.now(),
                productId: product.id,
                type: 'sales_return',
                quantity: item.quantity,    // positive
                date: new Date().toISOString(),
                ref: `RET-${invoiceId}`,
                balanceAfter: newStock
            });
        }
    }
    saveInventoryTransactions(invTransactions);
    
    let remaining = salesInvoices.filter(i => i.id != invoiceId);
    saveSalesInvoices(remaining);
    
    let customers = JSON.parse(localStorage.getItem('customers') || '[]');
    let customer = customers.find(c => c.email === invoice.customerEmail);
    if (customer) {
        customer.outstanding -= invoice.total;
        if (customer.outstanding < 0) customer.outstanding = 0;
        localStorage.setItem('customers', JSON.stringify(customers));
        
        // Add reversal in customer ledger
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

// ----- 7. (Optional) Rebuild all product currentStock from inventoryTransactions -----
// This can be used after data migration or to fix inconsistencies.
function rebuildAllStock() {
    let products = JSON.parse(localStorage.getItem('products') || '[]');
    let invTransactions = getInventoryTransactions();
    for (let p of products) {
        let stock = 0;
        invTransactions.forEach(t => {
            if (t.productId == p.id || t.productId == p.sku) stock += t.quantity;
        });
        p.currentStock = stock;
    }
    saveProducts(products);
    console.log('Stock rebuilt from inventory transactions');
                             }
