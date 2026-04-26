// ========== CENTRAL DATA STORE – COMPLETE ==========
// All modules must use these functions to read/write data.
// This ensures every operation affects related data.

// ----- Helper: get / save data -----
function getProducts() { return JSON.parse(localStorage.getItem('products') || '[]'); }
function saveProducts(products) { localStorage.setItem('products', JSON.stringify(products)); }

function getInventoryTransactions() { return JSON.parse(localStorage.getItem('inventoryTransactions') || '[]'); }
function saveInventoryTransactions(trans) { localStorage.setItem('inventoryTransactions', JSON.stringify(trans)); }

function getSalesInvoices() { return JSON.parse(localStorage.getItem('salesInvoices') || '[]'); }
function saveSalesInvoices(invoices) { localStorage.setItem('salesInvoices', JSON.stringify(invoices)); }

function getPurchaseInvoices() { return JSON.parse(localStorage.getItem('purchaseInvoices') || '[]'); }
function savePurchaseInvoices(invoices) { localStorage.setItem('purchaseInvoices', JSON.stringify(invoices)); }

// ----- 1. Sales Invoice – reduces stock, increases customer outstanding -----
function createSalesInvoice(invoice) {
    // invoice: { id, date, customerEmail, items: [{productId, quantity, price}], total, invoiceNo, status }
    let products = getProducts();
    let invTransactions = getInventoryTransactions();
    let customers = JSON.parse(localStorage.getItem('customers') || '[]');
    
    for (let item of invoice.items) {
        let product = products.find(p => p.id == item.productId);
        if (!product) throw new Error(`Product ${item.productId} not found`);
        let oldStock = product.currentStock || 0;
        let newStock = oldStock - item.quantity;
        if (newStock < 0) throw new Error(`Insufficient stock for ${product.name}`);
        product.currentStock = newStock;
        
        invTransactions.push({
            id: Date.now() + Math.random(),
            productId: item.productId,
            type: 'sales',
            quantity: -item.quantity,
            date: invoice.date,
            ref: invoice.invoiceNo || `INV-${invoice.id}`,
            balanceAfter: newStock
        });
    }
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
        let product = products.find(p => p.id == item.productId);
        if (!product) {
            // Auto-create product if not exists (optional)
            product = {
                id: item.productId,
                name: `Product ${item.productId}`,
                sku: `SKU${item.productId}`,
                currentStock: 0,
                unit: 'pc',
                price: item.cost
            };
            products.push(product);
        }
        let oldStock = product.currentStock || 0;
        let newStock = oldStock + item.quantity;
        product.currentStock = newStock;
        
        invTransactions.push({
            id: Date.now() + Math.random(),
            productId: item.productId,
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
    // payment: { id, date, customerEmail, amount, reference, mode }
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
    // payment: { id, date, supplierEmail, amount, reference }
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
        currentStock: p.currentStock || 0,
        reorderLevel: p.reorderLevel || 0,
        unit: p.unit
    }));
}

// ----- 6. Delete Sales Invoice (reverse effects) -----
function deleteSalesInvoice(invoiceId) {
    let salesInvoices = getSalesInvoices();
    let invoice = salesInvoices.find(i => i.id == invoiceId);
    if (!invoice) return false;
    
    let products = getProducts();
    let invTransactions = getInventoryTransactions();
    for (let item of invoice.items) {
        let product = products.find(p => p.id == item.productId);
        if (product) {
            product.currentStock += item.quantity;
            invTransactions.push({
                id: Date.now(),
                productId: item.productId,
                type: 'sales_return',
                quantity: item.quantity,
                date: new Date().toISOString(),
                ref: `RET-${invoiceId}`,
                balanceAfter: product.currentStock
            });
        }
    }
    saveProducts(products);
    saveInventoryTransactions(invTransactions);
    
    let remaining = salesInvoices.filter(i => i.id != invoiceId);
    saveSalesInvoices(remaining);
    
    let customers = JSON.parse(localStorage.getItem('customers') || '[]');
    let customer = customers.find(c => c.email === invoice.customerEmail);
    if (customer) {
        customer.outstanding -= invoice.total;
        if (customer.outstanding < 0) customer.outstanding = 0;
        localStorage.setItem('customers', JSON.stringify(customers));
    }
    return true;
}
