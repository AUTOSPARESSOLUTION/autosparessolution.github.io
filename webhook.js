// ============================================================
// 🚀 ASSIST WhatsApp Webhook v3.1 - COMPLETE INTEGRATED
// ============================================================

const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const compression = require('compression');
const { LRUCache } = require('lru-cache');

// ============================================================
// 📁 ENSURE DIRECTORIES EXIST
// ============================================================

const dirs = ['db', 'logs', 'uploads', 'temp', 'invoices', 'data', 'backups', 'documents', 'archives'];
dirs.forEach(dir => {
    const dirPath = path.join(__dirname, dir);
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        console.log(`📁 Created directory: ${dir}`);
    }
});

// ============================================================
// 📦 IMPORT MODULES
// ============================================================

const db = require('./modules/database');
const { importCSV } = require('./modules/csv-loader');
const { parseOrder, extractPartNumber, extractQuantity, parseOrderWithDescription } = require('./modules/order-parser');
const scheduler = require('./modules/scheduler');
const invoice = require('./modules/invoice');

// 🎨 DYNAMIC BRAND MANAGER
let brandManager = null;
try {
    brandManager = require('./modules/brand-config');
    console.log('✅ Brand Manager loaded');
} catch(e) {
    console.log('⚠️ Brand Manager not found, using fallback');
    brandManager = {
        getActiveBrands: () => [],
        getBrandsForWhatsApp: () => [],
        getBrandTextList: () => 'RANE, TVS, WABCO, RBL, RML, GIRLING, LMM, M&M, MTBL, STL, VF',
        updateBrands: async () => false,
        brands: [],
        getSummary: () => ({ total: 0, active: 0 })
    };
}

// 🎨 BRAND COLLAGE GENERATOR
let brandCollage = null;
try {
    brandCollage = require('./modules/brand-collage');
    console.log('✅ Brand Collage Generator loaded');
} catch(e) {
    console.log('⚠️ Brand Collage Generator not found');
    brandCollage = {
        generateWelcomeBrochure: async () => null,
        cleanupTempFiles: () => {}
    };
}
// 🔄 DYNAMIC FILE WATCHER
// 🔄 DYNAMIC FILE WATCHER
let fileWatcher = null;
try {
    fileWatcher = require('./modules/file-watcher');
    console.log('✅ File Watcher loaded');
    
    // The enhancedLoader is now defined inside the file-watcher module
    // No need to inject it here
    
} catch(e) {
    console.log('⚠️ File Watcher not found');
    fileWatcher = {
        startWatching: () => {},
        stopWatching: () => {},
        getStatus: () => ({}),
        getProcessedFiles: () => []
    };
}
// Optional modules with fallbacks
let customerLog = null;
try { customerLog = require('./modules/customer-log'); } catch(e) { 
    customerLog = { 
        logEnquiry: async () => {}, 
        getEnquiryStats: async () => ({}), 
        getWaitingNotifications: async () => [],
        trackOutOfStock: async () => {},
        notifyRestock: async () => ({ notified: 0, failed: 0 })
    };
}

let dealerIntelligence = null;
try { dealerIntelligence = require('./modules/dealer-intelligence'); } catch(e) { 
    dealerIntelligence = { 
        getDealerOffersForCustomer: async () => ({ customer: null, offers: [] }), 
        init: () => {} 
    };
}

let supplierVendor = null;
try { supplierVendor = require('./modules/supplier-vendor'); } catch(e) { supplierVendor = {}; }

let supplierEnquiry = null;
try { supplierEnquiry = require('./modules/supplier-enquiry'); } catch(e) { supplierEnquiry = {}; }

let geminiPurchase = null;
try { geminiPurchase = require('./modules/gemini-purchase'); } catch(e) { geminiPurchase = { extractPurchaseInvoiceWithGemini: async () => null }; }

let geminiPayment = null;
try { geminiPayment = require('./modules/gemini-payment'); } catch(e) { geminiPayment = { extractPaymentWithGemini: async () => null }; }

let payment = null;
try { payment = require('./modules/payment'); } catch(e) { payment = { recordSupplierPayment: async () => ({}), recordCustomerPayment: async () => ({}) }; }

let deliverySystem = null;
try { deliverySystem = require('./modules/delivery-system'); } catch(e) { deliverySystem = { processOrderDelivery: async () => null }; }

let vendorManagement = null;
try { vendorManagement = require('./modules/vendor-management'); } catch(e) { vendorManagement = { getAllVendors: async () => [] }; }

let XLSX = null;
try { XLSX = require('xlsx'); } catch(e) {}

let ExcelJS = null;
try { ExcelJS = require('exceljs'); } catch(e) {}

let PdfPrinter = null;
try { PdfPrinter = require('pdfmake'); } catch(e) {}

let pdfParse = null;
try { pdfParse = require('pdf-parse'); } catch(e) {}

let Tesseract = null;
try { Tesseract = require('tesseract.js'); } catch(e) {}


// ============================================================
// 📁 AUTO SPARES JSON IMPORT SYSTEM
// ============================================================



// ============================================================
// 📁 JSON STORAGE PATHS
// ============================================================

const JSON_STORAGE = {
    fullBackup: path.join(__dirname, 'data', 'autospares_backup.json'),
    customers: path.join(__dirname, 'data', 'customers.json'),
    suppliers: path.join(__dirname, 'data', 'suppliers.json'),
    products: path.join(__dirname, 'data', 'products.json'),
    invoices: path.join(__dirname, 'data', 'invoices.json'),
    purchaseInvoices: path.join(__dirname, 'data', 'purchaseInvoices.json'),
    customerPayments: path.join(__dirname, 'data', 'customerPayments.json'),
    supplierPayments: path.join(__dirname, 'data', 'supplierPayments.json'),
    customerLedger: path.join(__dirname, 'data', 'customerLedger.json'),
    supplierLedger: path.join(__dirname, 'data', 'supplierLedger.json'),
    inventoryTransactions: path.join(__dirname, 'data', 'inventoryTransactions.json'),
    proformas: path.join(__dirname, 'data', 'proformas.json'),
    quotations: path.join(__dirname, 'data', 'quotations.json'),
    users: path.join(__dirname, 'data', 'users.json')
};

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    console.log('📁 Created data directory');
}

// ============================================================
// 📥 JSON IMPORT FUNCTIONS
// ============================================================

// 1️⃣ IMPORT FULL BACKUP JSON
async function importFullBackup(filePath = JSON_STORAGE.fullBackup) {
    try {
        if (!fs.existsSync(filePath)) {
            console.log(`⚠️ Backup JSON not found: ${filePath}`);
            return { success: false, message: 'File not found' };
        }

        console.log('📥 Loading full backup JSON...');
        const data = fs.readFileSync(filePath, 'utf8');
        const backup = JSON.parse(data);
        
        // Helper function to parse data (handles both stringified and array formats)
        function parseData(data) {
            if (!data) return [];
            if (Array.isArray(data)) return data;
            if (typeof data === 'string') {
                try {
                    const parsed = JSON.parse(data);
                    if (Array.isArray(parsed)) {
                        return parsed;
                    }
                    return [];
                } catch (e) {
                    console.log(`⚠️ Failed to parse data: ${data.substring(0, 100)}...`);
                    return [];
                }
            }
            return [];
        }

        const customers = parseData(backup.customers);
        const suppliers = parseData(backup.suppliers);
        const products = parseData(backup.products);
        const invoices = parseData(backup.allInvoices);
        const purchaseInvoices = parseData(backup.purchaseInvoices);
        const customerPayments = parseData(backup.customerPayments);
        const supplierPayments = parseData(backup.supplierPayments);
        const users = parseData(backup.users);

        console.log(`📊 Found data:`, {
            customers: customers.length,
            suppliers: suppliers.length,
            products: products.length,
            invoices: invoices.length,
            purchaseInvoices: purchaseInvoices.length
        });

        // 🔍 DEBUG: Log first item samples
        if (customers.length > 0) {
            console.log(`🔍 First customer:`, JSON.stringify(customers[0]).substring(0, 300));
        }
        if (suppliers.length > 0) {
            console.log(`🔍 First supplier:`, JSON.stringify(suppliers[0]).substring(0, 300));
        }
        if (products.length > 0) {
            console.log(`🔍 First product:`, JSON.stringify(products[0]).substring(0, 300));
        }

        const results = {
            customers: 0,
            suppliers: 0,
            products: 0,
            invoices: 0,
            purchaseInvoices: 0,
            customerPayments: 0,
            supplierPayments: 0,
            users: 0
        };

        // Import Customers
        if (customers.length > 0) {
            console.log(`👤 Importing ${customers.length} customers...`);
            results.customers = await importCustomersArray(customers);
        } else {
            console.log(`⚠️ No customers found in backup`);
        }

        // Import Suppliers
        if (suppliers.length > 0) {
            console.log(`🏢 Importing ${suppliers.length} suppliers...`);
            results.suppliers = await importSuppliersArray(suppliers);
        } else {
            console.log(`⚠️ No suppliers found in backup`);
        }

        // Import Products
        if (products.length > 0) {
            console.log(`📦 Importing ${products.length} products...`);
            results.products = await importProductsArray(products);
        }

        // Import Invoices
        if (invoices.length > 0) {
            console.log(`📄 Importing ${invoices.length} invoices...`);
            results.invoices = await importInvoicesArray(invoices);
        }

        // Import Purchase Invoices
        if (purchaseInvoices.length > 0) {
            console.log(`📥 Importing ${purchaseInvoices.length} purchase invoices...`);
            results.purchaseInvoices = await importPurchaseInvoicesArray(purchaseInvoices);
        }

        // Import Customer Payments
        if (customerPayments.length > 0) {
            console.log(`💰 Importing ${customerPayments.length} customer payments...`);
            results.customerPayments = await importCustomerPaymentsArray(customerPayments);
        }

        // Import Supplier Payments
        if (supplierPayments.length > 0) {
            console.log(`💰 Importing ${supplierPayments.length} supplier payments...`);
            results.supplierPayments = await importSupplierPaymentsArray(supplierPayments);
        }

        // Import Users
        if (users.length > 0) {
            console.log(`👥 Importing ${users.length} users...`);
            results.users = await importUsersArray(users);
        }

        console.log('✅ Full backup import complete!');
        console.log(`   👤 Customers: ${results.customers}`);
        console.log(`   🏢 Suppliers: ${results.suppliers}`);
        console.log(`   📦 Products: ${results.products}`);
        console.log(`   📄 Invoices: ${results.invoices}`);
        console.log(`   📥 Purchase Invoices: ${results.purchaseInvoices}`);
        console.log(`   💰 Customer Payments: ${results.customerPayments}`);
        console.log(`   💰 Supplier Payments: ${results.supplierPayments}`);
        console.log(`   👥 Users: ${results.users}`);

        return { success: true, results };

    } catch (error) {
        console.error('❌ Full backup import error:', error.message);
        return { success: false, error: error.message };
    }
}
// 2️⃣ IMPORT CUSTOMERS ARRAY - FIXED with dynamic column handling

// 2️⃣ IMPORT CUSTOMERS ARRAY - ENHANCED FOR JSON STRUCTURE
// 2️⃣ IMPORT CUSTOMERS ARRAY - FIXED to match actual table structure
async function importCustomersArray(customers) {
    let imported = 0;
    let errors = 0;
    let skipped = 0;

    console.log(`📊 Processing ${customers.length} customers...`);

    // Get existing columns in customers table
    const existingColumns = await new Promise((resolve) => {
        db.db.all(`PRAGMA table_info(customers)`, [], (err, rows) => {
            if (err) {
                console.error('❌ Error getting table info:', err.message);
                resolve([]);
            } else {
                resolve(rows.map(r => r.name));
            }
        });
    });
    console.log(`📋 Existing columns in customers: ${existingColumns.join(', ')}`);

    for (const customer of customers) {
        try {
            // Try multiple possible phone field names
            const phone = customer.phone || 
                         customer.mobileNo || 
                         customer.mobile || 
                         customer.phoneNumber ||
                         customer.phoneNumber;

            if (!phone) {
                console.log(`⚠️ Skipping customer - no phone`);
                skipped++;
                continue;
            }

            const cleanPhone = phone.toString().replace(/\D/g, '');
            if (cleanPhone.length < 10) {
                console.log(`⚠️ Skipping customer - invalid phone: ${cleanPhone}`);
                skipped++;
                continue;
            }

            // Check if customer exists
            const existing = await new Promise((resolve) => {
                db.db.get(
                    `SELECT phone FROM customers WHERE phone = ?`,
                    [cleanPhone],
                    (err, row) => resolve(row)
                );
            });

            // Map JSON fields to database fields - MATCH ACTUAL TABLE STRUCTURE
            const customerData = {
                phone: cleanPhone,
                name: customer.name || customer.customerName || `Customer-${cleanPhone.slice(-4)}`,
                email: customer.email || customer.customerEmail || '',
                address: customer.address || '',
                city: customer.district || customer.city || '',
                state: customer.state || '',
                gstin: customer.gstin || customer.gst || '',
                // Use the actual column names from your table
                business: customer.business || customer.company || customer.companyName || '',
                customer_type: customer.customer_type || customer.type || customer.role || 'retail',
                credit_limit: customer.creditLimit || customer.credit_limit || 0,
                customer_code: customer.customerCode || customer.customer_code || '',
                status: customer.status || 'active',
                total_purchases: customer.totalPurchased || customer.total_purchased || customer.total_spent || 0,
                // These might not exist in your table - check carefully
                outstanding: customer.outstanding || 0,
                total_orders: customer.totalOrders || customer.total_orders || 0
            };

            if (existing) {
                // Build dynamic UPDATE - ONLY use columns that exist
                const setFields = [];
                const setValues = [];
                
                // Only include fields that actually exist in the table
                const fieldMap = {
                    name: customerData.name,
                    email: customerData.email,
                    address: customerData.address,
                    city: customerData.city,
                    state: customerData.state,
                    gstin: customerData.gstin,
                    business: customerData.business,  // Note: 'business' not 'company_name'
                    customer_type: customerData.customer_type,
                    credit_limit: customerData.credit_limit,
                    customer_code: customerData.customer_code,
                    status: customerData.status,
                    total_purchases: customerData.total_purchases  // Note: 'total_purchases' not 'total_purchased'
                };

                for (const [field, value] of Object.entries(fieldMap)) {
                    if (existingColumns.includes(field) && value !== undefined && value !== null && value !== '') {
                        setFields.push(`${field} = ?`);
                        setValues.push(value);
                    }
                }

                if (setFields.length > 0) {
                    setFields.push('updated_at = CURRENT_TIMESTAMP');
                    setValues.push(cleanPhone);

                    await new Promise((resolve, reject) => {
                        db.db.run(
                            `UPDATE customers SET ${setFields.join(', ')} WHERE phone = ?`,
                            setValues,
                            function(err) {
                                if (err) reject(err);
                                else resolve();
                            }
                        );
                    });
                    console.log(`🔄 Updated customer: ${cleanPhone} - ${customerData.name}`);
                }
            } else {
                // Build dynamic INSERT - ONLY columns that exist
                const fields = ['phone', 'name', 'email', 'address'];
                const values = [cleanPhone, customerData.name, customerData.email, customerData.address];

                // Add optional fields if they exist and have values
                const optionalFields = [
                    { field: 'city', value: customerData.city },
                    { field: 'state', value: customerData.state },
                    { field: 'gstin', value: customerData.gstin },
                    { field: 'business', value: customerData.business },
                    { field: 'customer_type', value: customerData.customer_type || 'retail' },
                    { field: 'credit_limit', value: customerData.credit_limit },
                    { field: 'customer_code', value: customerData.customer_code },
                    { field: 'status', value: customerData.status || 'active' },
                    { field: 'total_purchases', value: customerData.total_purchases }
                ];

                for (const opt of optionalFields) {
                    if (existingColumns.includes(opt.field) && opt.value !== undefined && opt.value !== null && opt.value !== '') {
                        fields.push(opt.field);
                        values.push(opt.value);
                    }
                }

                // Add created_at if it exists
                if (existingColumns.includes('created_at')) {
                    fields.push('created_at');
                    values.push('CURRENT_TIMESTAMP');
                }

                const placeholders = values.map(v => v === 'CURRENT_TIMESTAMP' ? 'CURRENT_TIMESTAMP' : '?');
                const finalValues = values.filter(v => v !== 'CURRENT_TIMESTAMP');
                const query = `INSERT INTO customers (${fields.join(', ')}) VALUES (${placeholders.join(', ')})`;

                await new Promise((resolve, reject) => {
                    db.db.run(query, finalValues, function(err) {
                        if (err) {
                            console.error(`❌ Insert error for ${cleanPhone}:`, err.message);
                            reject(err);
                        } else {
                            resolve();
                        }
                    });
                });
                console.log(`✅ Imported customer: ${cleanPhone} - ${customerData.name}`);
            }
            imported++;
        } catch (err) {
            console.error(`❌ Error importing customer:`, err.message);
            errors++;
        }
    }

    console.log(`📊 Customers: ${imported} imported, ${skipped} skipped, ${errors} errors`);
    return imported;
}
         
// 3️⃣ IMPORT SUPPLIERS ARRAY - FIXED
async function importSuppliersArray(suppliers) {
    let imported = 0;
    let errors = 0;
    let skipped = 0;

    console.log(`📊 Processing ${suppliers.length} suppliers...`);

    // Get existing columns in suppliers table
    const existingColumns = await new Promise((resolve) => {
        db.db.all(`PRAGMA table_info(suppliers)`, [], (err, rows) => {
            if (err) {
                console.error('❌ Error getting table info:', err.message);
                resolve([]);
            } else {
                resolve(rows.map(r => r.name));
            }
        });
    });
    console.log(`📋 Existing columns in suppliers: ${existingColumns.join(', ')}`);

    for (const supplier of suppliers) {
        try {
            const phone = supplier.phone || 
                         supplier.phoneNumber || 
                         supplier.mobile || 
                         supplier.mobileNo ||
                         supplier.contactPhone ||
                         supplier.supplierPhone;
            
            if (!phone) {
                console.log(`⚠️ Skipping supplier - no phone`);
                skipped++;
                continue;
            }

            const cleanPhone = phone.toString().replace(/\D/g, '');
            if (cleanPhone.length < 10) {
                console.log(`⚠️ Skipping supplier - invalid phone: ${cleanPhone}`);
                skipped++;
                continue;
            }

            const existing = await new Promise((resolve) => {
                db.db.get(
                    `SELECT phone FROM suppliers WHERE phone = ?`,
                    [cleanPhone],
                    (err, row) => resolve(row)
                );
            });

            const supplierName = supplier.name || 
                                supplier.supplierName || 
                                supplier.business || 
                                supplier.companyName || 
                                'Unknown';

            if (existing) {
                // Build dynamic UPDATE
                const setFields = [];
                const setValues = [];

                // Always include these fields
                setFields.push('name = ?');
                setValues.push(supplierName);
                setFields.push('email = ?');
                setValues.push(supplier.email || '');
                setFields.push('address = ?');
                setValues.push(supplier.address || '');
                setFields.push('gstin = ?');
                setValues.push(supplier.gstin || supplier.gst || '');
                setFields.push('status = ?');
                setValues.push(supplier.status || 'active');

                // Only add contact_person if column exists
                if (existingColumns.includes('contact_person')) {
                    setFields.push('contact_person = ?');
                    setValues.push(supplier.contactPerson || supplier.contact_person || '');
                }
                if (existingColumns.includes('contact_person_phone')) {
                    setFields.push('contact_person_phone = ?');
                    setValues.push(supplier.contactPersonPhone || supplier.contact_person_phone || '');
                }

                setFields.push('updated_at = CURRENT_TIMESTAMP');
                setValues.push(cleanPhone);

                await new Promise((resolve, reject) => {
                    db.db.run(
                        `UPDATE suppliers SET ${setFields.join(', ')} WHERE phone = ?`,
                        setValues,
                        function(err) {
                            if (err) reject(err);
                            else resolve();
                        }
                    );
                });
                console.log(`🔄 Updated supplier: ${cleanPhone}`);
            } else {
                // Build dynamic INSERT
                const fields = ['name', 'phone', 'email', 'address', 'gstin', 'status'];
                const values = [supplierName, cleanPhone, supplier.email || '', supplier.address || '', supplier.gstin || supplier.gst || '', supplier.status || 'active'];

                if (existingColumns.includes('contact_person') && (supplier.contactPerson || supplier.contact_person)) {
                    fields.push('contact_person');
                    values.push(supplier.contactPerson || supplier.contact_person || '');
                }
                if (existingColumns.includes('contact_person_phone') && (supplier.contactPersonPhone || supplier.contact_person_phone)) {
                    fields.push('contact_person_phone');
                    values.push(supplier.contactPersonPhone || supplier.contact_person_phone || '');
                }

                if (existingColumns.includes('created_at')) {
                    fields.push('created_at');
                    values.push('CURRENT_TIMESTAMP');
                }

                const placeholders = values.map(v => v === 'CURRENT_TIMESTAMP' ? 'CURRENT_TIMESTAMP' : '?');
                const finalValues = values.filter(v => v !== 'CURRENT_TIMESTAMP');
                const query = `INSERT INTO suppliers (${fields.join(', ')}) VALUES (${placeholders.join(', ')})`;

                await new Promise((resolve, reject) => {
                    db.db.run(query, finalValues, function(err) {
                        if (err) reject(err);
                        else resolve();
                    });
                });
                console.log(`✅ Imported supplier: ${cleanPhone} - ${supplierName}`);
            }
            imported++;
        } catch (err) {
            console.error(`❌ Error importing supplier:`, err.message);
            errors++;
        }
    }

    console.log(`📊 Suppliers: ${imported} imported, ${skipped} skipped, ${errors} errors`);
    return imported;
}
// 4️⃣ IMPORT PRODUCTS ARRAY
async function importProductsArray(products) {
    let imported = 0;
    let errors = 0;

    for (const product of products) {
        try {
            const part = product.id || product.sku || product.part;
            if (!part) {
                console.warn('⚠️ Skipping product with no part number:', product);
                errors++;
                continue;
            }

            await new Promise((resolve, reject) => {
                db.db.run(
                    `INSERT OR REPLACE INTO products 
                     (part, description, brand, make, model, stock, list_price, mrp, billing_price, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                    [
                        part,
                        product.name || product.description || '',
                        product.brand || '',
                        product.make || '',
                        product.model || '',
                        product.currentStock || product.stock || 0,
                        product.price || product.list_price || 0,
                        product.price || product.mrp || 0,
                        product.billing_price || product.price || 0
                    ],
                    function(err) {
                        if (err) reject(err);
                        else resolve();
                    }
                );
            });
            imported++;
        } catch (err) {
            console.error(`❌ Error importing product ${product.id || product.sku}:`, err.message);
            errors++;
        }
    }

    return imported;
}

// 5️⃣ IMPORT INVOICES ARRAY
async function importInvoicesArray(invoices) {
    let imported = 0;
    let errors = 0;

    for (const invoice of invoices) {
        try {
            const invoiceData = {
                invoice_no: invoice.invoiceNo || `INV-${Date.now().toString().slice(-6)}`,
                customer_phone: invoice.buyer?.phone || '',
                customer_name: invoice.buyer?.name || '',
                customer_gstin: invoice.buyer?.gstin || '',
                customer_address: invoice.buyer?.address || '',
                invoice_date: invoice.date || new Date().toISOString(),
                due_date: invoice.dueDate || invoice.date || new Date().toISOString(),
                subtotal: invoice.subtotal || 0,
                cgst: invoice.cgst || 0,
                sgst: invoice.sgst || 0,
                igst: invoice.igst || 0,
                round_off: invoice.roundOff || 0,
                grand_total: invoice.grandTotal || invoice.total || 0,
                items: JSON.stringify(invoice.items || []),
                payment_status: invoice.status === 'Paid' ? 'paid' : 'Pending',
                invoice_type: invoice.invoiceType || 'credit',
                status: invoice.status || 'Pending'
            };

            if (invoiceData.customer_phone) {
                // Use 'sales_invoices' table (not 'order_master')
                await new Promise((resolve, reject) => {
                    db.db.run(
                        `INSERT OR REPLACE INTO sales_invoices 
                         (invoice_no, customer_phone, customer_name, customer_gstin, customer_address,
                          invoice_date, due_date, subtotal, cgst, sgst, igst, round_off, grand_total,
                          items, payment_status, invoice_type, status, created_at)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                            invoiceData.invoice_no,
                            invoiceData.customer_phone,
                            invoiceData.customer_name,
                            invoiceData.customer_gstin,
                            invoiceData.customer_address,
                            invoiceData.invoice_date,
                            invoiceData.due_date,
                            invoiceData.subtotal,
                            invoiceData.cgst,
                            invoiceData.sgst,
                            invoiceData.igst,
                            invoiceData.round_off,
                            invoiceData.grand_total,
                            invoiceData.items,
                            invoiceData.payment_status,
                            invoiceData.invoice_type,
                            invoiceData.status,
                            invoiceData.invoice_date
                        ],
                        function(err) {
                            if (err) reject(err);
                            else resolve();
                        }
                    );
                });
                imported++;
            } else {
                console.warn(`⚠️ Skipping invoice ${invoiceData.invoice_no} - no customer phone`);
                errors++;
            }
        } catch (err) {
            console.error(`❌ Error importing invoice ${invoice.invoiceNo}:`, err.message);
            errors++;
        }
    }

    return imported;
}
// 6️⃣ IMPORT PURCHASE INVOICES ARRAY
async function importPurchaseInvoicesArray(purchaseInvoices) {
    let imported = 0;
    let errors = 0;

    for (const invoice of purchaseInvoices) {
        try {
            const supplierPhone = invoice.supplier?.phone || '';
            const supplierName = invoice.supplier?.name || '';

            if (!supplierPhone) {
                console.warn(`⚠️ Skipping purchase invoice - no supplier phone`);
                errors++;
                continue;
            }

            // Use 'suppliers' table (not 'supplier_master')
            await new Promise((resolve, reject) => {
                db.db.run(
                    `INSERT OR REPLACE INTO purchase_invoices 
                     (invoice_no, supplier_id, supplier_name, supplier_gstin,
                      invoice_date, due_date, subtotal, gst_amount, total_amount,
                      items, payment_status, notes, created_at)
                     VALUES (?, 
                        (SELECT id FROM suppliers WHERE phone = ?),
                        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        invoice.invoiceNo || `PI-${Date.now().toString().slice(-6)}`,
                        supplierPhone,
                        supplierName,
                        invoice.supplier?.gstin || '',
                        invoice.date || new Date().toISOString(),
                        invoice.dueDate || invoice.date || new Date().toISOString(),
                        invoice.subtotal || 0,
                        invoice.gst || 0,
                        invoice.grandTotal || invoice.total || 0,
                        JSON.stringify(invoice.items || []),
                        'pending',
                        invoice.notes || '',
                        invoice.date || new Date().toISOString()
                    ],
                    function(err) {
                        if (err) reject(err);
                        else resolve();
                    }
                );
            });
            imported++;
        } catch (err) {
            console.error(`❌ Error importing purchase invoice ${invoice.invoiceNo}:`, err.message);
            errors++;
        }
    }

    return imported;
}
// 7️⃣ IMPORT CUSTOMER PAYMENTS - FIXED FOR JSON STRUCTURE
// 7️⃣ IMPORT CUSTOMER PAYMENTS - IMPROVED FOR EMAIL & PHONE
// 7️⃣ IMPORT CUSTOMER PAYMENTS - FIXED FOR EMAIL MATCHING
async function importCustomerPaymentsArray(payments) {
    let imported = 0;
    let errors = 0;
    let skipped = 0;

    console.log(`💰 Importing ${payments.length} customer payments...`);

    // Ensure customer_payments table exists
    await new Promise((resolve) => {
        db.db.run(`
            CREATE TABLE IF NOT EXISTS customer_payments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                receipt_no TEXT UNIQUE NOT NULL,
                customer_phone TEXT NOT NULL,
                customer_email TEXT,
                amount REAL NOT NULL,
                payment_mode TEXT NOT NULL,
                reference TEXT,
                remarks TEXT,
                payment_date TEXT DEFAULT CURRENT_TIMESTAMP,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `, (err) => {
            if (err) console.error('❌ Error creating customer_payments table:', err.message);
            resolve();
        });
    });

    // Check if customer table has required columns
    const columns = await new Promise((resolve) => {
        db.db.all(`PRAGMA table_info(customers)`, [], (err, rows) => {
            if (err) resolve([]);
            else resolve(rows.map(r => r.name));
        });
    });
    console.log(`📋 Customer columns: ${columns.join(', ')}`);

    const hasTotalSpent = columns.includes('total_spent');
    const hasTotalPurchases = columns.includes('total_purchases');
    const hasTotalPurchased = columns.includes('total_purchased');
    const hasOutstanding = columns.includes('outstanding');

    for (const payment of payments) {
        try {
            // Extract payment data - support multiple field names
            const customerEmail = payment.customerEmail || payment.customer_email || '';
            const customerPhone = payment.customerPhone || payment.customer_phone || payment.phone || '';
            const amount = parseFloat(payment.amount) || 0;
            const mode = payment.mode || payment.payment_mode || 'Cash';
            const reference = payment.reference || payment.ref || '';
            const remarks = payment.remarks || payment.note || '';
            const receiptNo = payment.receiptNo || payment.receipt_no || `PR-${Date.now().toString().slice(-6)}`;
            const paymentDate = payment.date || payment.payment_date || new Date().toISOString();

            if (!customerEmail && !customerPhone) {
                console.log(`⚠️ Skipping payment - no email or phone`);
                skipped++;
                continue;
            }

            console.log(`🔍 Looking for customer: Email=${customerEmail}, Phone=${customerPhone}`);

            let foundCustomer = null;
            let foundPhone = null;
            let searchMethod = '';

            // METHOD 1: Search by email
            if (customerEmail) {
                foundCustomer = await new Promise((resolve) => {
                    db.db.get(
                        `SELECT phone, name, email FROM customers WHERE email = ? OR phone = ?`,
                        [customerEmail, customerEmail],
                        (err, row) => {
                            if (err) resolve(null);
                            else resolve(row);
                        }
                    );
                });
                
                if (foundCustomer) {
                    foundPhone = foundCustomer.phone;
                    searchMethod = 'by email';
                    console.log(`✅ Found customer ${searchMethod}: ${foundPhone}`);
                }
            }

            // METHOD 2: Search by phone
            if (!foundCustomer && customerPhone) {
                const cleanPhone = customerPhone.toString().replace(/\D/g, '');
                if (cleanPhone.length >= 10) {
                    foundCustomer = await new Promise((resolve) => {
                        db.db.get(
                            `SELECT phone, name, email FROM customers WHERE phone = ?`,
                            [cleanPhone],
                            (err, row) => {
                                if (err) resolve(null);
                                else resolve(row);
                            }
                        );
                    });
                    
                    if (foundCustomer) {
                        foundPhone = foundCustomer.phone;
                        searchMethod = 'by phone';
                        console.log(`✅ Found customer ${searchMethod}: ${foundPhone}`);
                    }
                }
            }

            // METHOD 3: Extract phone from email (e.g., sahuja57332@gmail.com -> 57332)
            if (!foundCustomer && customerEmail) {
                const phoneMatch = customerEmail.match(/(\d{10})/);
                if (phoneMatch) {
                    const extractedPhone = phoneMatch[1];
                    foundCustomer = await new Promise((resolve) => {
                        db.db.get(
                            `SELECT phone, name, email FROM customers WHERE phone = ?`,
                            [extractedPhone],
                            (err, row) => {
                                if (err) resolve(null);
                                else resolve(row);
                            }
                        );
                    });
                    
                    if (foundCustomer) {
                        foundPhone = foundCustomer.phone;
                        searchMethod = 'by extracted phone from email';
                        console.log(`✅ Found customer ${searchMethod}: ${foundPhone}`);
                    }
                }
            }

            // METHOD 4: Search by email prefix
            if (!foundCustomer && customerEmail) {
                const emailPrefix = customerEmail.split('@')[0];
                if (emailPrefix && emailPrefix.length > 3) {
                    foundCustomer = await new Promise((resolve) => {
                        db.db.get(
                            `SELECT phone, name, email FROM customers WHERE email LIKE ? OR name LIKE ?`,
                            [`%${emailPrefix}%`, `%${emailPrefix}%`],
                            (err, row) => {
                                if (err) resolve(null);
                                else resolve(row);
                            }
                        );
                    });
                    
                    if (foundCustomer) {
                        foundPhone = foundCustomer.phone;
                        searchMethod = 'by email prefix';
                        console.log(`✅ Found customer ${searchMethod}: ${foundPhone}`);
                    }
                }
            }

            // METHOD 5: Search by name if available
            if (!foundCustomer && payment.customerName) {
                foundCustomer = await new Promise((resolve) => {
                    db.db.get(
                        `SELECT phone, name, email FROM customers WHERE name LIKE ?`,
                        [`%${payment.customerName}%`],
                        (err, row) => {
                            if (err) resolve(null);
                            else resolve(row);
                        }
                    );
                });
                
                if (foundCustomer) {
                    foundPhone = foundCustomer.phone;
                    searchMethod = 'by name';
                    console.log(`✅ Found customer ${searchMethod}: ${foundPhone}`);
                }
            }

            if (!foundCustomer) {
                console.log(`⚠️ Customer NOT found for: ${customerEmail || customerPhone}`);
                console.log(`   Trying to create new customer...`);
                
                // Create a new customer with the email
                const newPhone = customerPhone || (customerEmail.match(/(\d{10})/) ? customerEmail.match(/(\d{10})/)[1] : `99${Date.now().toString().slice(-8)}`);
                const cleanNewPhone = newPhone.toString().replace(/\D/g, '');
                
                if (cleanNewPhone.length >= 10) {
                    const customerName = payment.customerName || `Customer-${cleanNewPhone.slice(-4)}`;
                    
                    await new Promise((resolve, reject) => {
                        db.db.run(
                            `INSERT OR IGNORE INTO customers (phone, name, email, created_at, updated_at) 
                             VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
                            [cleanNewPhone, customerName, customerEmail],
                            function(err) {
                                if (err) {
                                    console.error(`❌ Failed to create customer:`, err.message);
                                    reject(err);
                                } else {
                                    console.log(`✅ Created new customer: ${cleanNewPhone} (${customerName})`);
                                    resolve();
                                }
                            }
                        );
                    });
                    
                    foundPhone = cleanNewPhone;
                    foundCustomer = { phone: cleanNewPhone, name: customerName };
                    searchMethod = 'by creation';
                } else {
                    console.log(`⚠️ Could not create customer - invalid phone: ${cleanNewPhone}`);
                    skipped++;
                    continue;
                }
            }

            if (!foundPhone) {
                console.log(`⚠️ No phone found for customer`);
                skipped++;
                continue;
            }

            const cleanPhone = foundPhone.toString().replace(/\D/g, '');
            if (cleanPhone.length < 10) {
                console.log(`⚠️ Invalid phone: ${cleanPhone}`);
                skipped++;
                continue;
            }

            // Check if customer exists in database
            const customerExists = await new Promise((resolve) => {
                db.db.get(
                    `SELECT phone FROM customers WHERE phone = ?`,
                    [cleanPhone],
                    (err, row) => {
                        if (err) resolve(null);
                        else resolve(row);
                    }
                );
            });

            if (!customerExists) {
                console.log(`⚠️ Customer not found in database: ${cleanPhone}`);
                skipped++;
                continue;
            }

            // Update customer total spent/purchased
            if (hasTotalSpent && amount > 0) {
                await new Promise((resolve, reject) => {
                    db.db.run(
                        `UPDATE customers 
                         SET total_spent = COALESCE(total_spent, 0) + ?,
                             updated_at = CURRENT_TIMESTAMP
                         WHERE phone = ?`,
                        [amount, cleanPhone],
                        function(err) {
                            if (err) reject(err);
                            else resolve();
                        }
                    );
                });
                console.log(`💰 Updated total_spent for ${cleanPhone}: +₹${amount}`);
            }

            if (hasTotalPurchases && amount > 0) {
                await new Promise((resolve, reject) => {
                    db.db.run(
                        `UPDATE customers 
                         SET total_purchases = COALESCE(total_purchases, 0) + ?,
                             updated_at = CURRENT_TIMESTAMP
                         WHERE phone = ?`,
                        [amount, cleanPhone],
                        function(err) {
                            if (err) reject(err);
                            else resolve();
                        }
                    );
                });
                console.log(`💰 Updated total_purchases for ${cleanPhone}: +₹${amount}`);
            }

            if (hasTotalPurchased && amount > 0) {
                await new Promise((resolve, reject) => {
                    db.db.run(
                        `UPDATE customers 
                         SET total_purchased = COALESCE(total_purchased, 0) + ?,
                             updated_at = CURRENT_TIMESTAMP
                         WHERE phone = ?`,
                        [amount, cleanPhone],
                        function(err) {
                            if (err) reject(err);
                            else resolve();
                        }
                    );
                });
                console.log(`💰 Updated total_purchased for ${cleanPhone}: +₹${amount}`);
            }

            if (hasOutstanding && amount > 0) {
                await new Promise((resolve, reject) => {
                    db.db.run(
                        `UPDATE customers 
                         SET outstanding = COALESCE(outstanding, 0) - ?,
                             updated_at = CURRENT_TIMESTAMP
                         WHERE phone = ?`,
                        [amount, cleanPhone],
                        function(err) {
                            if (err) reject(err);
                            else resolve();
                        }
                    );
                });
                console.log(`💰 Updated outstanding for ${cleanPhone}: -₹${amount}`);
            }

            // Check if payment already exists
            const existingPayment = await new Promise((resolve) => {
                db.db.get(
                    `SELECT receipt_no FROM customer_payments WHERE receipt_no = ?`,
                    [receiptNo],
                    (err, row) => {
                        if (err) resolve(null);
                        else resolve(row);
                    }
                );
            });

            if (existingPayment) {
                console.log(`ℹ️ Payment ${receiptNo} already exists, skipping`);
                skipped++;
                continue;
            }

            // Insert into customer_payments table
            await new Promise((resolve, reject) => {
                db.db.run(
                    `INSERT INTO customer_payments 
                     (receipt_no, customer_phone, customer_email, amount, payment_mode, reference, remarks, payment_date, created_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                    [
                        receiptNo,
                        cleanPhone,
                        customerEmail || foundCustomer?.email || '',
                        amount,
                        mode,
                        reference,
                        remarks,
                        paymentDate
                    ],
                    function(err) {
                        if (err) {
                            console.error(`❌ Insert error:`, err.message);
                            reject(err);
                        } else {
                            resolve();
                        }
                    }
                );
            });

            imported++;
            console.log(`✅ Imported payment: ${receiptNo} - ₹${amount} for ${cleanPhone} (${customerEmail})`);
            
        } catch (err) {
            console.error(`❌ Error importing customer payment:`, err.message);
            errors++;
        }
    }

    console.log(`📊 Customer Payments: ${imported} imported, ${skipped} skipped, ${errors} errors`);
    return imported;
}
                            
// 8️⃣ IMPORT SUPPLIER PAYMENTS
// 8️⃣ IMPORT SUPPLIER PAYMENTS - IMPROVED
// 8️⃣ IMPORT SUPPLIER PAYMENTS - FIXED
async function importSupplierPaymentsArray(payments) {
    let imported = 0;
    let errors = 0;
    let skipped = 0;

    console.log(`💰 Importing ${payments.length} supplier payments...`);

    // Ensure supplier_payments table exists
    await new Promise((resolve) => {
        db.db.run(`
            CREATE TABLE IF NOT EXISTS supplier_payments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                payment_id TEXT UNIQUE NOT NULL,
                supplier_phone TEXT NOT NULL,
                supplier_name TEXT,
                supplier_email TEXT,
                amount REAL NOT NULL,
                payment_method TEXT NOT NULL,
                payment_reference TEXT,
                payment_date TEXT DEFAULT CURRENT_TIMESTAMP,
                invoice_no TEXT,
                notes TEXT,
                status TEXT DEFAULT 'completed',
                created_by TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `, (err) => {
            if (err) console.error('❌ Error creating supplier_payments table:', err.message);
            resolve();
        });
    });

    for (const payment of payments) {
        try {
            // Extract payment data - support multiple field names
            const supplierEmail = payment.supplierEmail || payment.supplier_email || '';
            const supplierPhone = payment.supplierPhone || payment.supplier_phone || payment.phone || '';
            const supplierName = payment.supplierName || payment.supplier_name || payment.name || 'Unknown';
            const amount = parseFloat(payment.amount) || 0;
            const paymentMethod = payment.payment_method || payment.mode || 'Cash';
            const paymentRef = payment.payment_reference || payment.reference || payment.ref || '';
            const paymentDate = payment.payment_date || payment.date || new Date().toISOString();
            const invoiceNo = payment.invoice_no || payment.invoiceNo || '';
            const notes = payment.notes || payment.remarks || '';
            const paymentId = payment.payment_id || payment.id || `SP-${Date.now().toString().slice(-6)}`;

            if (!supplierEmail && !supplierPhone) {
                console.log(`⚠️ Skipping supplier payment - no email or phone`);
                skipped++;
                continue;
            }

            console.log(`🔍 Looking for supplier: Email=${supplierEmail}, Phone=${supplierPhone}`);

            let foundSupplier = null;
            let foundPhone = null;
            let searchMethod = '';

            // METHOD 1: Search by email
            if (supplierEmail) {
                foundSupplier = await new Promise((resolve) => {
                    db.db.get(
                        `SELECT phone, name, email FROM suppliers WHERE email = ? OR phone = ?`,
                        [supplierEmail, supplierEmail],
                        (err, row) => {
                            if (err) resolve(null);
                            else resolve(row);
                        }
                    );
                });
                
                if (foundSupplier) {
                    foundPhone = foundSupplier.phone;
                    searchMethod = 'by email';
                    console.log(`✅ Found supplier ${searchMethod}: ${foundPhone}`);
                }
            }

            // METHOD 2: Search by phone
            if (!foundSupplier && supplierPhone) {
                const cleanPhone = supplierPhone.toString().replace(/\D/g, '');
                if (cleanPhone.length >= 10) {
                    foundSupplier = await new Promise((resolve) => {
                        db.db.get(
                            `SELECT phone, name, email FROM suppliers WHERE phone = ?`,
                            [cleanPhone],
                            (err, row) => {
                                if (err) resolve(null);
                                else resolve(row);
                            }
                        );
                    });
                    
                    if (foundSupplier) {
                        foundPhone = foundSupplier.phone;
                        searchMethod = 'by phone';
                        console.log(`✅ Found supplier ${searchMethod}: ${foundPhone}`);
                    }
                }
            }

            // METHOD 3: Search by name
            if (!foundSupplier && supplierName && supplierName !== 'Unknown') {
                foundSupplier = await new Promise((resolve) => {
                    db.db.get(
                        `SELECT phone, name, email FROM suppliers WHERE name LIKE ?`,
                        [`%${supplierName}%`],
                        (err, row) => {
                            if (err) resolve(null);
                            else resolve(row);
                        }
                    );
                });
                
                if (foundSupplier) {
                    foundPhone = foundSupplier.phone;
                    searchMethod = 'by name';
                    console.log(`✅ Found supplier ${searchMethod}: ${foundPhone}`);
                }
            }

            if (!foundSupplier) {
                console.log(`⚠️ Supplier NOT found for: ${supplierEmail || supplierPhone}`);
                console.log(`   Creating new supplier...`);
                
                // Create a new supplier
                const newPhone = supplierPhone || `99${Date.now().toString().slice(-8)}`;
                const cleanNewPhone = newPhone.toString().replace(/\D/g, '');
                
                if (cleanNewPhone.length >= 10) {
                    await new Promise((resolve, reject) => {
                        db.db.run(
                            `INSERT OR IGNORE INTO suppliers (name, phone, email, status, created_at, updated_at) 
                             VALUES (?, ?, ?, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
                            [supplierName, cleanNewPhone, supplierEmail],
                            function(err) {
                                if (err) {
                                    console.error(`❌ Failed to create supplier:`, err.message);
                                    reject(err);
                                } else {
                                    console.log(`✅ Created new supplier: ${cleanNewPhone} (${supplierName})`);
                                    resolve();
                                }
                            }
                        );
                    });
                    
                    foundPhone = cleanNewPhone;
                    foundSupplier = { phone: cleanNewPhone, name: supplierName };
                    searchMethod = 'by creation';
                } else {
                    console.log(`⚠️ Could not create supplier - invalid phone: ${cleanNewPhone}`);
                    skipped++;
                    continue;
                }
            }

            if (!foundPhone) {
                console.log(`⚠️ No phone found for supplier`);
                skipped++;
                continue;
            }

            const cleanPhone = foundPhone.toString().replace(/\D/g, '');
            if (cleanPhone.length < 10) {
                console.log(`⚠️ Invalid phone: ${cleanPhone}`);
                skipped++;
                continue;
            }

            // Check if supplier exists
            const supplierExists = await new Promise((resolve) => {
                db.db.get(
                    `SELECT phone FROM suppliers WHERE phone = ?`,
                    [cleanPhone],
                    (err, row) => {
                        if (err) resolve(null);
                        else resolve(row);
                    }
                );
            });

            if (!supplierExists) {
                console.log(`⚠️ Supplier not found in database: ${cleanPhone}`);
                skipped++;
                continue;
            }

            // Check if payment already exists
            const existingPayment = await new Promise((resolve) => {
                db.db.get(
                    `SELECT payment_id FROM supplier_payments WHERE payment_id = ?`,
                    [paymentId],
                    (err, row) => {
                        if (err) resolve(null);
                        else resolve(row);
                    }
                );
            });

            if (existingPayment) {
                console.log(`ℹ️ Supplier payment ${paymentId} already exists, skipping`);
                skipped++;
                continue;
            }

            // Update supplier outstanding
            if (amount > 0) {
                await new Promise((resolve, reject) => {
                    db.db.run(
                        `UPDATE suppliers 
                         SET outstanding = COALESCE(outstanding, 0) - ?,
                             updated_at = CURRENT_TIMESTAMP
                         WHERE phone = ?`,
                        [amount, cleanPhone],
                        function(err) {
                            if (err) reject(err);
                            else resolve();
                        }
                    );
                });
                console.log(`💰 Updated outstanding for ${cleanPhone}: -₹${amount}`);
            }

            // Insert payment
            await new Promise((resolve, reject) => {
                db.db.run(
                    `INSERT INTO supplier_payments 
                     (payment_id, supplier_phone, supplier_name, supplier_email, amount, 
                      payment_method, payment_reference, payment_date, invoice_no, notes, status, created_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                    [
                        paymentId,
                        cleanPhone,
                        foundSupplier?.name || supplierName,
                        supplierEmail || foundSupplier?.email || '',
                        amount,
                        paymentMethod,
                        paymentRef,
                        paymentDate,
                        invoiceNo,
                        notes,
                        'completed'
                    ],
                    function(err) {
                        if (err) {
                            console.error(`❌ Insert error:`, err.message);
                            reject(err);
                        } else {
                            resolve();
                        }
                    }
                );
            });

            imported++;
            console.log(`✅ Imported supplier payment: ${paymentId} - ₹${amount} for ${cleanPhone}`);

        } catch (err) {
            console.error(`❌ Error importing supplier payment:`, err.message);
            errors++;
        }
    }

    console.log(`📊 Supplier Payments: ${imported} imported, ${skipped} skipped, ${errors} errors`);
    return imported;
}
// 9️⃣ IMPORT USERS - FIXED with dynamic column handling
async function importUsersArray(users) {
    let imported = 0;
    let errors = 0;
    let skipped = 0;

    console.log(`📊 Processing ${users.length} users...`);

    // Get existing columns in customers table
    const existingColumns = await new Promise((resolve) => {
        db.db.all(`PRAGMA table_info(customers)`, [], (err, rows) => {
            if (err) {
                console.error('❌ Error getting table info:', err.message);
                resolve([]);
            } else {
                resolve(rows.map(r => r.name));
            }
        });
    });
    console.log(`📋 Existing columns in customers: ${existingColumns.join(', ')}`);

    for (const user of users) {
        try {
            const phone = user.phone || user.mobile || user.mobileNo;
            if (!phone) {
                console.log(`⚠️ Skipping user - no phone`);
                skipped++;
                continue;
            }

            const cleanPhone = phone.toString().replace(/\D/g, '');
            if (cleanPhone.length < 10) {
                console.log(`⚠️ Skipping user - invalid phone: ${cleanPhone}`);
                skipped++;
                continue;
            }

            // Check if user already exists
            const existing = await new Promise((resolve) => {
                db.db.get(
                    `SELECT phone FROM customers WHERE phone = ?`,
                    [cleanPhone],
                    (err, row) => resolve(row)
                );
            });

            if (existing) {
                console.log(`ℹ️ User ${cleanPhone} already exists`);
                continue;
            }

            if (user.role === 'customer' || user.role === undefined) {
                // Build dynamic insert based on existing columns
                const fields = ['phone', 'name', 'email', 'address'];
                const values = [
                    cleanPhone,
                    user.name || `Customer-${cleanPhone.slice(-4)}`,
                    user.email || '',
                    user.address || ''
                ];

                // Add columns if they exist
                if (existingColumns.includes('city')) {
                    fields.push('city');
                    values.push(user.district || user.city || '');
                }
                if (existingColumns.includes('state')) {
                    fields.push('state');
                    values.push(user.state || '');
                }
                if (existingColumns.includes('pincode')) {
                    fields.push('pincode');
                    values.push(user.pincode || '');
                }
                if (existingColumns.includes('gstin')) {
                    fields.push('gstin');
                    values.push(user.gstin || '');
                }
                if (existingColumns.includes('company_name')) {
                    fields.push('company_name');
                    values.push(user.business || '');
                }
                if (existingColumns.includes('customer_type')) {
                    fields.push('customer_type');
                    values.push(user.role || 'retail');
                }
                if (existingColumns.includes('registered_at')) {
                    fields.push('registered_at');
                    values.push('CURRENT_TIMESTAMP');
                }

                const placeholders = values.map((v, i) => {
                    if (v === 'CURRENT_TIMESTAMP') return 'CURRENT_TIMESTAMP';
                    return '?';
                });

                const query = `INSERT INTO customers (${fields.join(', ')}) VALUES (${placeholders.join(', ')})`;
                const finalValues = values.filter(v => v !== 'CURRENT_TIMESTAMP');

                await new Promise((resolve, reject) => {
                    db.db.run(query, finalValues, function(err) {
                        if (err) {
                            console.error(`❌ Insert error for ${cleanPhone}:`, err.message);
                            reject(err);
                        } else {
                            resolve();
                        }
                    });
                });
                imported++;
                console.log(`✅ Imported user: ${cleanPhone}`);
            }
        } catch (err) {
            console.error(`❌ Error importing user ${user.phone}:`, err.message);
            errors++;
        }
    }

    console.log(`📊 Users: ${imported} imported, ${skipped} skipped, ${errors} errors`);
    return imported;
}
// ============================================================
// 👤 CUSTOMER HELPER FUNCTIONS - FIXED
// ============================================================
// ============================================================
// 👤 CUSTOMER HELPER FUNCTIONS - FIXED TABLE NAMES
// ============================================================

async function getCustomerByPhone(phone) {
    return new Promise((resolve, reject) => {
        db.db.get(
            `SELECT * FROM customers WHERE phone = ?`,
            [phone],
            (err, row) => {
                if (err) reject(err);
                else resolve(row);
            }
        );
    });
}

async function getAllCustomers(limit = 100) {
    return new Promise((resolve, reject) => {
        db.db.all(
            `SELECT * FROM customers ORDER BY name LIMIT ?`,
            [limit],
            (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            }
        );
    });
}

async function getAllSuppliers() {
    return new Promise((resolve, reject) => {
        db.db.all(
            `SELECT * FROM suppliers ORDER BY name`,
            [],
            (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            }
        );
    });
}

async function getCustomerStats(phone) {
    return new Promise((resolve) => {
        // Check if orders table exists
        db.db.get(
            `SELECT name FROM sqlite_master WHERE type='table' AND name='orders'`,
            [],
            (err, tableExists) => {
                if (err || !tableExists) {
                    resolve({ total_orders: 0, total_spent: 0, avg_order_value: 0, last_order_date: null });
                    return;
                }
                
                db.db.get(
                    `SELECT 
                        COUNT(*) as total_orders,
                        COALESCE(SUM(total), 0) as total_spent,
                        COALESCE(AVG(total), 0) as avg_order_value,
                        MAX(created_at) as last_order_date
                     FROM orders 
                     WHERE customer_phone = ? AND status != 'cancelled'`,
                    [phone],
                    (err, row) => {
                        if (err) resolve({ total_orders: 0, total_spent: 0, avg_order_value: 0, last_order_date: null });
                        else resolve(row || { total_orders: 0, total_spent: 0, avg_order_value: 0, last_order_date: null });
                    }
                );
            }
        );
    });
}

async function getCustomerOrderHistory(phone, limit = 5) {
    return new Promise((resolve) => {
        db.db.get(
            `SELECT name FROM sqlite_master WHERE type='table' AND name='orders'`,
            [],
            (err, tableExists) => {
                if (err || !tableExists) {
                    resolve([]);
                    return;
                }
                
                db.db.all(
                    `SELECT * FROM orders 
                     WHERE customer_phone = ? 
                     ORDER BY created_at DESC LIMIT ?`,
                    [phone, limit],
                    (err, rows) => {
                        if (err) resolve([]);
                        else resolve(rows || []);
                    }
                );
            }
        );
    });
}

const app = express();
const PORT = process.env.PORT || 10000;
// ============================================================
// 🔧 CONFIGURATION
// ============================================================

const CONFIG = {
    phoneNumberId: process.env.ID,
    accessToken: process.env.TOKEN,
    verifyToken: process.env.VERIFY || "assist123",
    businessPhone: process.env.PHONE || "9830300193",
    chatgptKey: process.env.CHATGPT_API_KEY,
    deepseekKey: process.env.DEEPSEEK_API_KEY,
    geminiKey: process.env.GEMINI_KEY,
    maxMemory: process.env.MAX_OLD_SPACE_SIZE || 512,
    cacheTTL: 120000,
    defaultPickup: process.env.DEFAULT_PICKUP || 'default',
    geminiTimeout: 30000,
    responseTimeout: 60000,
    debug: process.env.DEBUG === 'true',
    brandUpdateInterval: parseInt(process.env.BRAND_UPDATE_INTERVAL) || 300000
};

const ADMIN_PHONE = process.env.ADMIN_PHONE || "9830300193";

console.log('====================================');
console.log('🚀 ASSIST WhatsApp Webhook v3.1 - COMPLETE INTEGRATED');
console.log(`📞 Business Phone: ${CONFIG.businessPhone}`);
console.log(`🔐 Admin Phone: ${ADMIN_PHONE}`);
console.log(`🆔 Phone Number ID: ${CONFIG.phoneNumberId}`);
console.log(`🔑 Token: ${CONFIG.accessToken ? '✅ Set' : '❌ Not set'}`);
console.log(`🧠 Gemini: ${CONFIG.geminiKey ? '✅ Set' : '❌ Not set'}`);
console.log(`🎨 Brand Manager: ${brandManager ? '✅ Active' : '❌ Fallback'}`);
console.log(`🎨 Brand Collage: ${brandCollage ? '✅ Active' : '❌ Fallback'}`);
console.log(`⏱️ Gemini Timeout: ${CONFIG.geminiTimeout}ms`);
console.log(`⏱️ Response Timeout: ${CONFIG.responseTimeout}ms`);
console.log('====================================');

// ============================================================
// 📞 PHONE NUMBER NORMALIZATION
// ============================================================

function normalizePhone(phone) {
    if (!phone) return '';
    let cleaned = phone.replace(/\D/g, '');
    if (cleaned.startsWith('91') && cleaned.length > 10) {
        cleaned = cleaned.substring(2);
    }
    if (cleaned.length === 12 && cleaned.startsWith('91')) {
        cleaned = cleaned.substring(2);
    }
    return cleaned;
}

function isAdmin(phone) {
    const normalizedFrom = normalizePhone(phone);
    const normalizedAdmin = normalizePhone(ADMIN_PHONE);
    return normalizedFrom === normalizedAdmin;
}

// ============================================================
// 🛡️ MIDDLEWARE
// ============================================================

app.use(cors());
app.use(compression({ threshold: 1024, level: 6 }));
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: false
}));
app.use(express.json({ limit: '10mb', verify: (req, res, buf) => { req.rawBody = buf.toString(); } }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.set('trust proxy', 1);

// ============================================================
// 🛡️ RATE LIMITING
// ============================================================

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    message: 'Too many requests, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/webhook', limiter);

// ============================================================
// 🛡️ DUPLICATE MESSAGE DETECTION
// ============================================================

const messageCache = new LRUCache({
    max: 5000,
    ttl: 120000
});

const processingSet = new Set();

function isMessageProcessed(messageId) {
    if (!messageId) return false;
    if (processingSet.has(messageId)) {
        if (CONFIG.debug) console.log(`⏳ Message ${messageId} is already being processed`);
        return true;
    }
    if (messageCache.has(messageId)) {
        if (CONFIG.debug) console.log(`⏩ Duplicate message ${messageId} - skipping`);
        return true;
    }
    processingSet.add(messageId);
    return false;
}

function markMessageProcessed(messageId) {
    if (messageId) {
        messageCache.set(messageId, Date.now());
        processingSet.delete(messageId);
    }
}

// ============================================================
// ⏱️ TIMEOUT WRAPPER
// ============================================================

async function withTimeout(promise, ms = CONFIG.responseTimeout, errorMessage = 'Operation timed out') {
    return Promise.race([
        promise,
        new Promise((_, reject) => 
            setTimeout(() => reject(new Error(errorMessage)), ms)
        )
    ]);
}

// ============================================================
// 🤖 GEMINI RATE LIMITER
// ============================================================

class GeminiRateLimiter {
    constructor() {
        this.queue = [];
        this.processing = false;
        this.minDelay = 2000;
        this.lastRequest = 0;
        this.maxRetries = 3;
        this.retryDelay = 5000;
        this.requestCount = 0;
        this.windowStart = Date.now();
        this.maxRequestsPerMinute = 15;
    }

    async request(prompt, data, mimeType = 'image/jpeg', retries = 0) {
        const now = Date.now();
        if (now - this.windowStart > 60000) {
            this.requestCount = 0;
            this.windowStart = now;
        }

        if (this.requestCount >= this.maxRequestsPerMinute) {
            console.log(`⏳ Gemini rate limit reached. Waiting 60 seconds...`);
            await new Promise(resolve => setTimeout(resolve, 60000));
            this.requestCount = 0;
            this.windowStart = Date.now();
        }

        const waitTime = Math.max(0, this.minDelay - (now - this.lastRequest));
        if (waitTime > 0) {
            console.log(`⏳ Waiting ${waitTime}ms before Gemini request...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }

        this.lastRequest = Date.now();
        this.requestCount++;

        try {
            const result = await this.callGemini(prompt, data, mimeType);
            return result;
        } catch (error) {
            if (retries < this.maxRetries) {
                const delay = this.retryDelay * (retries + 1);
                console.log(`🔄 Gemini retry ${retries + 1}/${this.maxRetries} in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                return this.request(prompt, data, mimeType, retries + 1);
            }
            throw error;
        }
    }

    async callGemini(prompt, data, mimeType) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${CONFIG.geminiKey}`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { text: prompt },
                        { inline_data: { mime_type: mimeType, data: data } }
                    ]
                }],
                generationConfig: {
                    temperature: 0.1,
                    maxOutputTokens: 500,
                    topP: 0.95
                }
            })
        });

        if (!response.ok) {
            const error = await response.json();
            console.error(`❌ Gemini API error:`, error);
            
            if (response.status === 429) {
                console.log(`⏳ Gemini rate limited. Waiting 30 seconds...`);
                await new Promise(resolve => setTimeout(resolve, 30000));
                throw new Error('Rate limited');
            }
            
            throw new Error(`Gemini API error: ${response.status}`);
        }

        return await response.json();
    }
}

const geminiRateLimiter = new GeminiRateLimiter();

// ============================================================
// 💾 GEMINI CACHE
// ============================================================

const geminiCache = new LRUCache({
    max: 100,
    ttl: 60 * 60 * 1000
});

// ============================================================
// 📢 ALERT SYSTEM
// ============================================================

class AlertSystem {
    constructor() {
        this.alerts = [];
        this.subscribers = new Map();
        this.startTime = Date.now();
    }

    async sendUserAlert(phone, type, message, data = {}) {
        try {
            const alertKey = `${phone}-${type}-${Date.now().toString().slice(0, 10)}`;
            if (messageCache.has(alertKey)) {
                console.log(`⏩ Duplicate alert skipped: ${type} for ${phone}`);
                return false;
            }
            messageCache.set(alertKey, true);

            const formattedMessage = this.formatAlertMessage(type, message, data);
            await sendWhatsAppMessage(phone, formattedMessage);
            console.log(`📢 Alert sent to ${phone}: ${type}`);
            
            await this.storeAlert(phone, type, message, data);
            return true;
        } catch (error) {
            console.error(`❌ Failed to send alert to ${phone}:`, error.message);
            return false;
        }
    }

    formatAlertMessage(type, message, data) {
        const icons = {
            orderConfirmation: '✅',
            orderShipped: '🚚',
            orderDelivered: '📦',
            outOfStock: '⚠️',
            restockNotification: '🔄',
            paymentReceived: '💰',
            paymentFailed: '❌',
            deliveryAssigned: '📋',
            deliveryCompleted: '🎯',
            systemLoading: '⏳',
            systemReady: '✅',
            lowStock: '⚠️',
            newOrder: '🆕',
            importComplete: '✅',
            systemError: '❌',
            adminNotification: '👑',
            brandUpdate: '🎨'
        };

        const icon = icons[type] || '📢';
        const timestamp = new Date().toLocaleString('en-IN', { 
            timeZone: 'Asia/Kolkata',
            hour: '2-digit',
            minute: '2-digit',
            day: '2-digit',
            month: 'short'
        });

        let formatted = `${icon} *${this.getAlertTitle(type)}*\n━━━━━━━━━━━━━━━━━━━━\n`;
        formatted += `${message}\n\n`;
        formatted += `🕐 ${timestamp}\n`;
        formatted += `\n📞 Call: ${CONFIG.businessPhone}`;
        return formatted;
    }

    getAlertTitle(type) {
        const titles = {
            orderConfirmation: 'Order Confirmed! 🎉',
            orderShipped: 'Order Shipped! 🚚',
            orderDelivered: 'Order Delivered! 📦',
            outOfStock: 'Out of Stock ⚠️',
            restockNotification: 'Back in Stock! 🔄',
            paymentReceived: 'Payment Received 💰',
            paymentFailed: 'Payment Failed ❌',
            deliveryAssigned: 'Delivery Assigned 📋',
            deliveryCompleted: 'Delivery Completed 🎯',
            systemLoading: 'System Loading ⏳',
            systemReady: 'System Ready ✅',
            lowStock: 'Low Stock Alert ⚠️',
            newOrder: 'New Order! 🆕',
            importComplete: 'Import Complete ✅',
            systemError: 'System Error ❌',
            adminNotification: 'Admin Notification 👑',
            brandUpdate: 'Brands Updated 🎨'
        };
        return titles[type] || 'Alert';
    }

    async storeAlert(phone, type, message, data) {
        try {
            await db.db.run(
                `INSERT INTO alerts (phone, type, message, data, created_at) 
                 VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                [phone, type, message, JSON.stringify(data)]
            );
        } catch (error) {
            console.error('❌ Failed to store alert:', error.message);
        }
    }

    async getUserAlerts(phone, limit = 10) {
        return new Promise((resolve, reject) => {
            db.db.all(
                `SELECT * FROM alerts WHERE phone = ? ORDER BY created_at DESC LIMIT ?`,
                [phone, limit],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });
    }

    async sendSystemStatus(phone, status, progress = 0) {
        let message, type;
        
        if (status === 'loading') {
            type = 'systemLoading';
            message = `🔧 *System is Loading*\n\n` +
                      `📦 Products being loaded: ${progress}%\n` +
                      `⏱️ Estimated time: ${Math.ceil((100 - progress) / 3)} seconds\n\n` +
                      `💡 Please wait a moment...`;
        } else if (status === 'ready') {
            type = 'systemReady';
            const stats = await db.getStats();
            message = `✅ *System is Ready!*\n\n` +
                      `📦 ${stats.total_products || 0} products available\n` +
                      `🔍 Send a part number or description to search\n` +
                      `📸 Send a photo of your order list\n` +
                      `🎙️ Send a voice message to order`;
        }

        await this.sendUserAlert(phone, type, message);
    }

    async sendOrderConfirmation(phone, orderId, items, total, outOfStockItems = [], notFoundItems = []) {
        let message = `✅ *ORDER CONFIRMED!*\n\n`;
        message += `📦 Order ID: ${orderId}\n`;
        message += `📝 Items:\n`;
        items.forEach((item, index) => {
            message += `   ${index + 1}. ${item.part} x${item.qty} = ₹${(item.price * item.qty).toFixed(2)}\n`;
        });
        message += `\n💰 *Total: ₹${total.toFixed(2)}*\n\n`;
        
        if (outOfStockItems && outOfStockItems.length > 0) {
            message += `⚠️ *Out of Stock:* ${outOfStockItems.join(', ')}\n`;
            message += `🔔 We'll notify you when available.\n\n`;
        }
        
        if (notFoundItems && notFoundItems.length > 0) {
            message += `❌ *Not Found:* ${notFoundItems.join(', ')}\n\n`;
        }
        
        message += `📊 *Download Options:*\n`;
        message += `   Reply "Download Excel" or "Download PDF"\n\n`;
        message += `📞 Call: ${CONFIG.businessPhone}`;
        
        await this.sendUserAlert(phone, 'orderConfirmation', message, { orderId, items, total });
        
        try {
            const excelBuffer = await generateExcelSummary(orderId, items, total, phone, notFoundItems, outOfStockItems);
            if (excelBuffer) {
                await sendDocumentMessage(phone, excelBuffer, `${orderId}_Summary.xlsx`, 
                    `📊 Order Summary - ${orderId}`);
            }
        } catch (excelError) {
            console.error('❌ Excel generation error:', excelError.message);
        }
        
        try {
            const pdfBuffer = await generatePDFSummary(orderId, items, total, phone);
            if (pdfBuffer) {
                await sendDocumentMessage(phone, pdfBuffer, `${orderId}_Summary.pdf`,
                    `📄 Order Summary - ${orderId}`);
            }
        } catch (pdfError) {
            console.error('❌ PDF generation error:', pdfError.message);
        }
        
        return true;
    }

    async sendOutOfStockAlert(phone, part, description) {
        const message = `❌ *Out of Stock*\n\n` +
                        `Part: ${part}\n` +
                        `📝 ${description || 'N/A'}\n\n` +
                        `🔔 We'll notify you when it's back in stock!`;
        
        await this.sendUserAlert(phone, 'outOfStock', message, { part, description });
    }

    async sendNewOrderAlert(orderId, customer, items, total) {
        const adminPhone = normalizePhone(ADMIN_PHONE);
        const message = `🆕 *New Order!*\n\n` +
                        `📦 Order: ${orderId}\n` +
                        `👤 Customer: ${customer}\n` +
                        `📝 Items: ${items.length}\n` +
                        `💰 Total: ₹${total.toFixed(2)}\n\n` +
                        `✅ Process order now`;
        
        await this.sendUserAlert(adminPhone, 'newOrder', message, { orderId, customer, items, total });
    }

    async sendAdminNotification(customerPhone, messageText, type = 'enquiry') {
        const adminPhone = normalizePhone(ADMIN_PHONE);
        const message = `👤 *Customer Activity*\n━━━━━━━━━━━━━━━━━━━━\n\n` +
                        `📞 Customer: ${customerPhone}\n` +
                        `📝 Type: ${type}\n` +
                        `💬 Message: ${messageText}\n\n` +
                        `🕐 ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`;
        
        await this.sendUserAlert(adminPhone, 'adminNotification', message, { customerPhone, type, messageText });
    }

    async sendImportCompleteAlert(products) {
        const adminPhone = normalizePhone(ADMIN_PHONE);
        const message = `✅ *Import Complete!*\n\n` +
                        `📦 ${products} products loaded\n` +
                        `⏱️ System ready for requests\n\n` +
                        `🚀 Bot is now active`;
        
        await this.sendUserAlert(adminPhone, 'importComplete', message, { products });
    }
}

const alertSystem = new AlertSystem();

// ============================================================
// 📤 SEND IMAGE MESSAGE
// ============================================================

async function sendImageMessage(to, imageUrl, caption) {
    try {
        const normalizedPhone = to.replace(/\D/g, '');
        
        const response = await fetch(imageUrl);
        if (!response.ok) throw new Error(`Failed to download image: ${response.status}`);
        const buffer = await response.arrayBuffer();
        
        const formData = new FormData();
        const blob = new Blob([buffer], { type: 'image/png' });
        formData.append('file', blob, 'logo.png');
        formData.append('messaging_product', 'whatsapp');
        formData.append('type', 'image/png');
        
        const uploadUrl = `https://graph.facebook.com/v23.0/${CONFIG.phoneNumberId}/media`;
        const uploadResponse = await fetch(uploadUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${CONFIG.accessToken}`,
            },
            body: formData
        });
        
        const uploadResult = await uploadResponse.json();
        if (!uploadResult.id) {
            throw new Error('Failed to upload image');
        }
        
        const sendUrl = `https://graph.facebook.com/v23.0/${CONFIG.phoneNumberId}/messages`;
        const sendResponse = await fetch(sendUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${CONFIG.accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                messaging_product: 'whatsapp',
                to: normalizedPhone,
                type: 'image',
                image: {
                    id: uploadResult.id,
                    caption: caption || ''
                }
            })
        });
        
        if (!sendResponse.ok) {
            throw new Error(`Failed to send image: ${sendResponse.status}`);
        }
        
        console.log(`📸 Image sent to ${normalizedPhone}: ${caption}`);
        return await sendResponse.json();
        
    } catch (error) {
        console.error('❌ Image send error:', error.message);
        return null;
    }
}

// ============================================================
// 📤 SEND IMAGE BUFFER (For Brochure)
// ============================================================

async function sendImageBuffer(to, buffer, caption) {
    try {
        const normalizedPhone = to.replace(/\D/g, '');
        
        const formData = new FormData();
        const blob = new Blob([buffer], { type: 'image/jpeg' });
        formData.append('file', blob, 'welcome_brochure.jpg');
        formData.append('messaging_product', 'whatsapp');
        formData.append('type', 'image/jpeg');
        
        const uploadUrl = `https://graph.facebook.com/v23.0/${CONFIG.phoneNumberId}/media`;
        const uploadResponse = await fetch(uploadUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${CONFIG.accessToken}`,
            },
            body: formData
        });
        
        const uploadResult = await uploadResponse.json();
        if (!uploadResult.id) {
            throw new Error('Failed to upload image');
        }
        
        const sendUrl = `https://graph.facebook.com/v23.0/${CONFIG.phoneNumberId}/messages`;
        const sendResponse = await fetch(sendUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${CONFIG.accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                messaging_product: 'whatsapp',
                to: normalizedPhone,
                type: 'image',
                image: {
                    id: uploadResult.id,
                    caption: caption || 'Welcome to Auto Spares Solution!'
                }
            })
        });
        
        if (!sendResponse.ok) {
            throw new Error(`Failed to send image: ${sendResponse.status}`);
        }
        
        console.log(`📸 Brochure sent to ${normalizedPhone}`);
        return await sendResponse.json();
        
    } catch (error) {
        console.error('❌ Image buffer send error:', error.message);
        return null;
    }
}

// ============================================================
// 👋 SEND WELCOME WITH DYNAMIC BROCHURE
// ============================================================

async function sendWelcomeWithAllBrands(to) {
    try {
        console.log(`🎨 Generating dynamic brochure for ${to}`);
        
        let allBrands = [];
        let brandText = '';
        
        if (brandManager && brandManager.getActiveBrands) {
            await brandManager.updateBrands(false);
            allBrands = brandManager.getActiveBrands();
            brandText = allBrands.map(b => b.name).join(' • ');
            console.log(`📊 Retrieved ${allBrands.length} brands from manager`);
        } else {
            allBrands = [
                { id: 'rane', name: 'RANE', active: true },
                { id: 'tvs', name: 'TVS', active: true },
                { id: 'rbl', name: 'RBL', active: true },
                { id: 'rml', name: 'RML', active: true },
                { id: 'girling', name: 'GIRLING', active: true },
                { id: 'lmm', name: 'LMM', active: true },
                { id: 'mm', name: 'M&M', active: true },
                { id: 'mtbl', name: 'MTBL', active: true },
                { id: 'stl', name: 'STL', active: true },
                { id: 'vf', name: 'VF', active: true },
                { id: 'wabco', name: 'WABCO', active: true }
            ];
            brandText = allBrands.map(b => b.name).join(' • ');
        }
        
        // Generate brochure
        let brochureBuffer = null;
        try {
            brochureBuffer = await brandCollage.generateWelcomeBrochure(allBrands, to);
        } catch (error) {
            console.error('❌ Brochure generation failed:', error.message);
        }
        
        if (brochureBuffer) {
            await sendImageBuffer(to, brochureBuffer, 
                `🚗 Welcome to Auto Spares Solution!\n🏷️ ${allBrands.length} Premium Brands`
            );
            
            await sendWhatsAppMessage(to,
                `👋 *Welcome to Auto Spares Solution!*\n\n` +
                `🤖 I'm your AI Sales Assistant\n\n` +
                `🏷️ *${allBrands.length} Premium Brands:* ${brandText}\n\n` +
                `🔍 *Search:* Send part number or description\n` +
                `📸 *Send Photo:* Take photo of your order list\n` +
                `🎙️ *Send Voice:* Speak your order\n` +
                `🛒 *Order:* "0801BA0285N 2"\n` +
                `✅ *Confirm:* "Confirm Order"\n` +
                `🗑️ *Clear:* "Clear Cart"\n\n` +
                `📞 *Call:* ${CONFIG.businessPhone}\n` +
                `🛒 *Shop:* https://autosparessolution.com`
            );
            
            await sendWhatsAppMessage(to,
                `📝 *How to Order:*\n\n` +
                `1️⃣ Send *Part Number* (e.g., "0801BA0285N")\n` +
                `2️⃣ Add *Quantity* (e.g., "0801BA0285N 2")\n` +
                `3️⃣ Send multiple parts in separate lines\n` +
                `4️⃣ Reply "Confirm Order" to complete\n` +
                `5️⃣ Get Excel & PDF summary\n\n` +
                `📞 Call: ${CONFIG.businessPhone}`
            );
        } else {
            // Fallback: Text-only
            await sendWhatsAppMessage(to, 
                `👋 *Welcome to Auto Spares Solution!*\n\n` +
                `🤖 I'm your AI Sales Assistant\n\n` +
                `🏷️ *${allBrands.length} Premium Brands:* ${brandText}\n\n` +
                `🔍 *Search:* Send part number or description\n` +
                `📸 *Send Photo:* Take photo of your order list\n` +
                `🎙️ *Send Voice:* Speak your order\n` +
                `🛒 *Order:* "0801BA0285N 2"\n` +
                `✅ *Confirm:* "Confirm Order"\n` +
                `🗑️ *Clear:* "Clear Cart"\n\n` +
                `📞 *Call:* ${CONFIG.businessPhone}\n` +
                `🛒 *Shop:* https://autosparessolution.com`
            );
        }
        
        setTimeout(() => {
            try {
                brandCollage.cleanupTempFiles();
            } catch (error) {}
        }, 5000);
        
    } catch (error) {
        console.error(`❌ Failed to send welcome to ${to}:`, error.message);
        await sendWhatsAppMessage(to, 
            `👋 *Welcome to Auto Spares Solution!*\n\n` +
            `📞 Call: ${CONFIG.businessPhone}\n` +
            `🛒 Shop: https://autosparessolution.com`
        );
    }
}

// ============================================================
// 📊 EXCEL GENERATOR
// ============================================================

async function generateExcelSummary(orderId, items, total, customerPhone, notFoundItems = [], outOfStockItems = []) {
    try {
        if (!ExcelJS) {
            console.error('❌ ExcelJS not available');
            return null;
        }

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Auto Spares Solution';
        workbook.created = new Date();
        
        const sheet = workbook.addWorksheet('Order Summary');
        
        sheet.mergeCells('A1:G1');
        const titleCell = sheet.getCell('A1');
        titleCell.value = '🛒 AUTO SPARES SOLUTION';
        titleCell.font = { bold: true, size: 20, color: { argb: 'FF0072B0' } };
        titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
        sheet.getRow(1).height = 40;
        
        sheet.mergeCells('A2:G2');
        const orderCell = sheet.getCell('A2');
        orderCell.value = `Order ID: ${orderId} | Date: ${new Date().toLocaleDateString('en-IN')}`;
        orderCell.alignment = { horizontal: 'center', vertical: 'middle' };
        orderCell.font = { size: 12, color: { argb: 'FF666666' } };
        
        sheet.mergeCells('A3:G3');
        const customerCell = sheet.getCell('A3');
        customerCell.value = `Customer: ${customerPhone}`;
        customerCell.alignment = { horizontal: 'center', vertical: 'middle' };
        customerCell.font = { size: 10, color: { argb: 'FF666666' } };
        
        sheet.addRow([]);
        
        const headers = ['#', 'Part Number', 'Description', 'Qty', 'Price (₹)', 'Total (₹)', 'Status'];
        const headerRow = sheet.addRow(headers);
        headerRow.height = 30;
        headerRow.eachCell((cell) => {
            cell.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0072B0' } };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            cell.border = {
                top: { style: 'thin' },
                left: { style: 'thin' },
                bottom: { style: 'thin' },
                right: { style: 'thin' }
            };
        });
        
        sheet.getColumn(1).width = 6;
        sheet.getColumn(2).width = 20;
        sheet.getColumn(3).width = 35;
        sheet.getColumn(4).width = 10;
        sheet.getColumn(5).width = 15;
        sheet.getColumn(6).width = 18;
        sheet.getColumn(7).width = 22;
        
        let rowIndex = 0;
        for (const item of items) {
            const itemTotal = (item.price || 0) * (item.qty || 0);
            
            let status = '✅ In Stock';
            let statusColor = 'FF00B050';
            
            if (outOfStockItems && outOfStockItems.includes(item.part)) {
                status = '❌ Out of Stock';
                statusColor = 'FFFF0000';
            }
            
            if (notFoundItems && notFoundItems.includes(item.part)) {
                status = '⚠️ Not Found';
                statusColor = 'FFFFA500';
            }
            
            if (item.requestedPart && item.requestedPart !== item.part) {
                status = '🔄 Matched: ' + item.requestedPart;
                statusColor = 'FF0072B0';
            }
            
            const row = sheet.addRow([
                rowIndex + 1,
                item.part || 'N/A',
                item.description || 'N/A',
                item.qty || 0,
                (item.price || 0).toFixed(2),
                itemTotal.toFixed(2),
                status
            ]);
            row.height = 25;
            row.eachCell((cell, colNumber) => {
                cell.alignment = { horizontal: 'left', vertical: 'middle' };
                cell.border = {
                    top: { style: 'thin' },
                    left: { style: 'thin' },
                    bottom: { style: 'thin' },
                    right: { style: 'thin' }
                };
                
                if (colNumber === 7) {
                    cell.font = { 
                        bold: true, 
                        color: { argb: statusColor } 
                    };
                }
            });
            rowIndex++;
        }
        
        sheet.addRow([]);
        
        const totalRow = sheet.addRow(['', '', '', '', 'TOTAL:', total.toFixed(2), '']);
        totalRow.height = 30;
        totalRow.getCell(5).font = { bold: true, size: 14 };
        totalRow.getCell(5).alignment = { horizontal: 'right', vertical: 'middle' };
        totalRow.getCell(6).font = { bold: true, size: 14, color: { argb: 'FF0072B0' } };
        totalRow.getCell(6).alignment = { horizontal: 'right', vertical: 'middle' };
        sheet.mergeCells(`A${totalRow.number}:D${totalRow.number}`);
        
        let summaryRowCount = 0;
        
        if (outOfStockItems && outOfStockItems.length > 0) {
            sheet.addRow([]);
            const warningRow = sheet.addRow(['⚠️ OUT OF STOCK ITEMS:']);
            warningRow.height = 25;
            warningRow.getCell(1).font = { bold: true, size: 12, color: { argb: 'FFFF0000' } };
            sheet.mergeCells(`A${warningRow.number}:G${warningRow.number}`);
            
            const outOfStockRow = sheet.addRow([outOfStockItems.join(', ')]);
            outOfStockRow.height = 25;
            outOfStockRow.getCell(1).font = { color: { argb: 'FFFF0000' } };
            sheet.mergeCells(`A${outOfStockRow.number}:G${outOfStockRow.number}`);
            summaryRowCount += 2;
        }
        
        if (notFoundItems && notFoundItems.length > 0) {
            if (summaryRowCount > 0) {
                sheet.addRow([]);
            } else {
                sheet.addRow([]);
            }
            const notFoundRow = sheet.addRow(['⚠️ NOT FOUND ITEMS:']);
            notFoundRow.height = 25;
            notFoundRow.getCell(1).font = { bold: true, size: 12, color: { argb: 'FFFFA500' } };
            sheet.mergeCells(`A${notFoundRow.number}:G${notFoundRow.number}`);
            
            const notFoundListRow = sheet.addRow([notFoundItems.join(', ')]);
            notFoundListRow.height = 25;
            notFoundListRow.getCell(1).font = { color: { argb: 'FFFFA500' } };
            sheet.mergeCells(`A${notFoundListRow.number}:G${notFoundListRow.number}`);
            summaryRowCount += 2;
        }
        
        sheet.addRow([]);
        const footerRow = sheet.addRow(['Thank you for your order!']);
        footerRow.height = 30;
        footerRow.getCell(1).font = { bold: true, size: 12, color: { argb: 'FF0072B0' } };
        footerRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
        sheet.mergeCells(`A${footerRow.number}:G${footerRow.number}`);
        
        const contactRow = sheet.addRow([`📞 Call: ${CONFIG.businessPhone} | 🛒 Shop: https://autosparessolution.com`]);
        contactRow.height = 25;
        contactRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
        contactRow.getCell(1).font = { size: 10, color: { argb: 'FF666666' } };
        sheet.mergeCells(`A${contactRow.number}:G${contactRow.number}`);
        
        const buffer = await workbook.xlsx.writeBuffer();
        return buffer;
        
    } catch (error) {
        console.error('❌ Excel generation error:', error.message);
        return null;
    }
}

// ============================================================
// 📄 PDF GENERATOR
// ============================================================

async function generatePDFSummary(orderId, items, total, customerPhone) {
    try {
        if (!PdfPrinter) {
            console.error('❌ PdfPrinter not available');
            return null;
        }

        const printer = new PdfPrinter({
            Roboto: {
                normal: 'Helvetica',
                bold: 'Helvetica-Bold',
                italics: 'Helvetica-Oblique',
                bolditalics: 'Helvetica-BoldOblique'
            }
        });

        const tableBody = [
            [
                { text: '#', style: 'tableHeader' },
                { text: 'Part Number', style: 'tableHeader' },
                { text: 'Description', style: 'tableHeader' },
                { text: 'Qty', style: 'tableHeader' },
                { text: 'Price (₹)', style: 'tableHeader' },
                { text: 'Total (₹)', style: 'tableHeader' }
            ]
        ];

        let rowIndex = 0;
        for (const item of items) {
            const itemTotal = (item.price || 0) * (item.qty || 0);
            tableBody.push([
                { text: (rowIndex + 1).toString(), alignment: 'center' },
                { text: item.part || 'N/A', bold: true },
                { text: item.description || 'N/A' },
                { text: (item.qty || 0).toString(), alignment: 'center' },
                { text: (item.price || 0).toFixed(2), alignment: 'right' },
                { text: itemTotal.toFixed(2), alignment: 'right', bold: true }
            ]);
            rowIndex++;
        }

        tableBody.push([
            { text: '', colSpan: 4, border: [false, false, false, false] },
            { text: '', colSpan: 0 },
            { text: '', colSpan: 0 },
            { text: '', colSpan: 0 },
            { text: 'TOTAL:', bold: true, alignment: 'right', fontSize: 14 },
            { text: `₹${total.toFixed(2)}`, bold: true, alignment: 'right', fontSize: 14, color: '#0072B0' }
        ]);

        const docDefinition = {
            pageSize: 'A4',
            pageMargins: [40, 60, 40, 60],
            content: [
                {
                    text: 'AUTO SPARES SOLUTION',
                    style: 'companyHeader',
                    alignment: 'center',
                    margin: [0, 0, 0, 5]
                },
                {
                    canvas: [
                        {
                            type: 'line',
                            x1: 40,
                            y1: 0,
                            x2: 555,
                            y2: 0,
                            lineWidth: 2,
                            color: '#0072B0'
                        }
                    ],
                    margin: [0, 0, 0, 15]
                },
                {
                    text: 'ORDER SUMMARY',
                    style: 'title',
                    alignment: 'center',
                    margin: [0, 0, 0, 10]
                },
                {
                    columns: [
                        { text: `Order ID: ${orderId}`, width: '50%' },
                        { text: `Date: ${new Date().toLocaleDateString('en-IN')}`, width: '50%', alignment: 'right' }
                    ],
                    margin: [0, 0, 0, 5]
                },
                {
                    text: `Customer: ${customerPhone}`,
                    alignment: 'center',
                    fontSize: 10,
                    color: '#666666',
                    margin: [0, 0, 0, 20]
                },
                {
                    table: {
                        headerRows: 1,
                        widths: ['5%', '20%', '35%', '8%', '15%', '17%'],
                        body: tableBody
                    },
                    layout: {
                        fillColor: function(rowIndex) {
                            return rowIndex % 2 === 0 ? '#F5F5F5' : null;
                        },
                        hLineWidth: function(i) {
                            return i === 0 || i === 1 ? 1 : 0.5;
                        },
                        vLineWidth: function(i) {
                            return 0.5;
                        },
                        hLineColor: function(i) {
                            return i === 0 || i === 1 ? '#0072B0' : '#CCCCCC';
                        },
                        vLineColor: function(i) {
                            return '#CCCCCC';
                        }
                    }
                },
                {
                    text: 'Thank you for your order!',
                    style: 'footer',
                    alignment: 'center',
                    margin: [0, 25, 0, 10]
                },
                {
                    text: `Call: ${CONFIG.businessPhone}`,
                    alignment: 'center',
                    fontSize: 11,
                    color: '#333333',
                    margin: [0, 0, 0, 3]
                },
                {
                    text: `Shop: https://autosparessolution.com`,
                    alignment: 'center',
                    fontSize: 11,
                    color: '#333333',
                    margin: [0, 0, 0, 0]
                }
            ],
            styles: {
                companyHeader: {
                    fontSize: 20,
                    bold: true,
                    color: '#0072B0',
                    alignment: 'center'
                },
                title: {
                    fontSize: 16,
                    bold: true,
                    color: '#333333'
                },
                tableHeader: {
                    bold: true,
                    fontSize: 11,
                    color: '#FFFFFF',
                    fillColor: '#0072B0',
                    alignment: 'center'
                },
                footer: {
                    fontSize: 14,
                    bold: true,
                    color: '#0072B0'
                }
            },
            defaultStyle: {
                fontSize: 10
            }
        };

        const pdfDoc = printer.createPdfKitDocument(docDefinition);
        return new Promise((resolve, reject) => {
            const chunks = [];
            pdfDoc.on('data', chunk => chunks.push(chunk));
            pdfDoc.on('end', () => {
                const buffer = Buffer.concat(chunks);
                resolve(buffer);
            });
            pdfDoc.on('error', (error) => {
                console.error('❌ PDF generation error:', error);
                reject(error);
            });
            pdfDoc.end();
        });

    } catch (error) {
        console.error('❌ PDF generation error:', error.message);
        return null;
    }
}

// ============================================================
// 📤 SEND DOCUMENT MESSAGE
// ============================================================

async function sendDocumentMessage(to, buffer, filename, caption) {
    try {
        const normalizedPhone = to.replace(/\D/g, '');
        
        const formData = new FormData();
        const blob = new Blob([buffer], { type: getMimeType(filename) });
        formData.append('file', blob, filename);
        formData.append('messaging_product', 'whatsapp');
        formData.append('type', getMimeType(filename));
        
        const uploadUrl = `https://graph.facebook.com/v23.0/${CONFIG.phoneNumberId}/media`;
        const uploadResponse = await fetch(uploadUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${CONFIG.accessToken}`,
            },
            body: formData
        });
        
        const uploadResult = await uploadResponse.json();
        
        if (!uploadResult.id) {
            console.error('❌ Upload failed:', uploadResult);
            throw new Error('Failed to upload document');
        }
        
        const url = `https://graph.facebook.com/v23.0/${CONFIG.phoneNumberId}/messages`;
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${CONFIG.accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                messaging_product: 'whatsapp',
                to: normalizedPhone,
                type: 'document',
                document: {
                    id: uploadResult.id,
                    filename: filename,
                    caption: caption || 'Order Summary'
                }
            })
        });
        
        const result = await response.json();
        console.log(`📤 Document sent to ${normalizedPhone}: ${filename}`);
        return result;
        
    } catch (error) {
        console.error('❌ Document send error:', error.message);
        try {
            await sendWhatsAppMessage(to, 
                `⚠️ *Could not send document directly.*\n\n` +
                `📊 ${filename}\n` +
                `💡 Please download from: https://assist-whatsapp-webhook.onrender.com/download/${filename}\n\n` +
                `📞 Call: ${CONFIG.businessPhone}`
            );
        } catch (fallbackError) {
            console.error('❌ Fallback message failed:', fallbackError.message);
        }
        return null;
    }
}

function getMimeType(filename) {
    if (filename.endsWith('.xlsx')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    if (filename.endsWith('.xls')) return 'application/vnd.ms-excel';
    if (filename.endsWith('.pdf')) return 'application/pdf';
    if (filename.endsWith('.csv')) return 'text/csv';
    return 'application/octet-stream';
}

// ============================================================
// 📦 DATABASE READY FLAG
// ============================================================

let isDbReady = false;
let dbReadyMessage = 'Loading database...';
let importProgress = 0;
const TOTAL_PRODUCTS = 93098;

// ============================================================
// 🗄️ DATABASE INITIALIZATION
// ============================================================

async function initAllTables() {
    try {
        await new Promise((resolve, reject) => {
            db.db.run(`
                CREATE TABLE IF NOT EXISTS customer_enquiries (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    phone TEXT NOT NULL,
                    type TEXT NOT NULL,
                    text TEXT,
                    media_id TEXT,
                    products_found TEXT,
                    products_out_of_stock TEXT,
                    status TEXT,
                    response TEXT,
                    metadata TEXT,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            `, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        console.log('✅ customer_enquiries table ready');

        await new Promise((resolve, reject) => {
            db.db.run(`
                CREATE TABLE IF NOT EXISTS customer_interests (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    phone TEXT NOT NULL,
                    part TEXT NOT NULL,
                    interest_type TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(phone, part)
                )
            `, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        console.log('✅ customer_interests table ready');

        await new Promise((resolve, reject) => {
            db.db.run(`
                CREATE TABLE IF NOT EXISTS customer_stock_alerts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    phone TEXT NOT NULL,
                    part TEXT NOT NULL,
                    alert_type TEXT DEFAULT 'restock',
                    status TEXT DEFAULT 'pending',
                    sent_at TEXT,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(phone, part)
                )
            `, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        console.log('✅ customer_stock_alerts table ready');

        await new Promise((resolve, reject) => {
            db.db.run(`
                CREATE TABLE IF NOT EXISTS stock_update_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    part TEXT NOT NULL,
                    description TEXT,
                    brand TEXT,
                    model TEXT,
                    old_stock INTEGER DEFAULT 0,
                    new_stock INTEGER DEFAULT 0,
                    change_amount INTEGER DEFAULT 0,
                    update_type TEXT,
                    source TEXT,
                    file_name TEXT,
                    updated_by TEXT,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            `, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        console.log('✅ stock_update_history table ready');

        await new Promise((resolve, reject) => {
            db.db.run(`
                CREATE TABLE IF NOT EXISTS otp_attempts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    delivery_id TEXT NOT NULL,
                    attempted_otp TEXT NOT NULL,
                    verified_by TEXT,
                    success BOOLEAN DEFAULT 0,
                    timestamp TEXT DEFAULT CURRENT_TIMESTAMP
                )
            `, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        console.log('✅ otp_attempts table ready');

        await new Promise((resolve, reject) => {
            db.db.run(`
                CREATE TABLE IF NOT EXISTS credit_notes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    credit_note_no TEXT UNIQUE NOT NULL,
                    invoice_no TEXT NOT NULL,
                    customer_phone TEXT NOT NULL,
                    customer_name TEXT NOT NULL,
                    amount REAL NOT NULL,
                    reason TEXT,
                    created_by TEXT,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    status TEXT DEFAULT 'issued'
                )
            `, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        console.log('✅ credit_notes table ready');

        await new Promise((resolve, reject) => {
            db.db.run(`
                CREATE TABLE IF NOT EXISTS invoice_audit (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    invoice_no TEXT NOT NULL,
                    action TEXT NOT NULL,
                    details TEXT,
                    performed_by TEXT,
                    performed_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            `, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        console.log('✅ invoice_audit table ready');

        await new Promise((resolve, reject) => {
            db.db.run(`
                CREATE TABLE IF NOT EXISTS delivery_boys (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    boy_id TEXT UNIQUE NOT NULL,
                    phone TEXT UNIQUE NOT NULL,
                    name TEXT NOT NULL,
                    email TEXT,
                    address TEXT,
                    pincode TEXT,
                    vehicle_type TEXT DEFAULT 'Bike',
                    vehicle_number TEXT,
                    license_number TEXT,
                    device_type TEXT DEFAULT 'smart',
                    notification_method TEXT DEFAULT 'whatsapp',
                    status TEXT DEFAULT 'active',
                    rating REAL DEFAULT 0,
                    total_deliveries INTEGER DEFAULT 0,
                    successful_deliveries INTEGER DEFAULT 0,
                    failed_deliveries INTEGER DEFAULT 0,
                    current_location TEXT,
                    is_available BOOLEAN DEFAULT 1,
                    max_distance_km INTEGER DEFAULT 10,
                    preferred_pincodes TEXT,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            `, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        console.log('✅ delivery_boys table ready');

        await new Promise((resolve, reject) => {
            db.db.run(`
                CREATE TABLE IF NOT EXISTS deliveries (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    delivery_id TEXT UNIQUE NOT NULL,
                    order_id TEXT NOT NULL,
                    customer_phone TEXT NOT NULL,
                    customer_name TEXT NOT NULL,
                    customer_address TEXT NOT NULL,
                    customer_pincode TEXT NOT NULL,
                    customer_location TEXT,
                    delivery_boy_phone TEXT NOT NULL,
                    delivery_boy_name TEXT NOT NULL,
                    delivery_boy_device_type TEXT DEFAULT 'smart',
                    delivery_boy_notification_method TEXT DEFAULT 'whatsapp',
                    vendor_id TEXT NOT NULL,
                    vendor_name TEXT NOT NULL,
                    vendor_address TEXT NOT NULL,
                    vendor_pincode TEXT NOT NULL,
                    vendor_location TEXT,
                    status TEXT DEFAULT 'assigned',
                    status_history TEXT,
                    current_location TEXT,
                    otp TEXT,
                    otp_verified BOOLEAN DEFAULT 0,
                    otp_verified_by TEXT,
                    otp_verified_at TEXT,
                    customer_confirmed BOOLEAN DEFAULT 0,
                    delivery_boy_confirmed BOOLEAN DEFAULT 0,
                    delivery_mode TEXT DEFAULT 'local',
                    vendor_as_delivery BOOLEAN DEFAULT 0,
                    transporter_name TEXT,
                    transporter_phone TEXT,
                    transporter_vehicle TEXT,
                    transporter_notes TEXT,
                    booking_reference TEXT,
                    assigned_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    accepted_at TEXT,
                    picked_up_at TEXT,
                    out_for_delivery_at TEXT,
                    delivered_at TEXT,
                    cancelled_at TEXT,
                    delivery_charges REAL DEFAULT 0,
                    distance_km REAL DEFAULT 0,
                    estimated_pickup_time TEXT,
                    estimated_delivery_time TEXT,
                    actual_delivery_time TEXT,
                    rating INTEGER,
                    feedback TEXT,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            `, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        console.log('✅ deliveries table ready');

        await new Promise((resolve, reject) => {
            db.db.run(`
                CREATE TABLE IF NOT EXISTS delivery_locations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    delivery_id TEXT NOT NULL,
                    lat REAL NOT NULL,
                    lng REAL NOT NULL,
                    address TEXT,
                    accuracy REAL,
                    speed REAL,
                    bearing REAL,
                    timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
                    source TEXT DEFAULT 'gps'
                )
            `, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        console.log('✅ delivery_locations table ready');

        await new Promise((resolve, reject) => {
            db.db.run(`
                CREATE TABLE IF NOT EXISTS out_of_stock_tracking (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    part TEXT NOT NULL,
                    description TEXT,
                    brand TEXT,
                    customer_phone TEXT NOT NULL,
                    customer_name TEXT,
                    quantity_requested INTEGER DEFAULT 1,
                    enquiry_text TEXT,
                    notified BOOLEAN DEFAULT 0,
                    notified_at TEXT,
                    restocked_at TEXT,
                    status TEXT DEFAULT 'waiting',
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(part, customer_phone)
                )
            `, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        console.log('✅ out_of_stock_tracking table ready');

        try {
            await new Promise((resolve, reject) => {
                db.db.run('ALTER TABLE out_of_stock_tracking ADD COLUMN phone TEXT', (err) => {
                    if (err && !err.message.includes('duplicate column name')) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            });
            console.log('✅ Added phone column to out_of_stock_tracking');
        } catch (error) {
            console.log('⚠️ Phone column already exists:', error.message);
        }

        try {
            await new Promise((resolve, reject) => {
                db.db.run('ALTER TABLE out_of_stock_tracking ADD COLUMN customer_phone TEXT', (err) => {
                    if (err && !err.message.includes('duplicate column name')) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            });
            console.log('✅ Added customer_phone column to out_of_stock_tracking');
        } catch (error) {
            console.log('⚠️ customer_phone column already exists:', error.message);
        }

        await new Promise((resolve, reject) => {
            db.db.run(`
                CREATE TABLE IF NOT EXISTS alerts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    phone TEXT NOT NULL,
                    type TEXT NOT NULL,
                    message TEXT NOT NULL,
                    data TEXT,
                    read BOOLEAN DEFAULT 0,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            `, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        console.log('✅ alerts table ready');

        await new Promise((resolve, reject) => {
            db.db.run(`
                CREATE TABLE IF NOT EXISTS user_preferences (
                    phone TEXT PRIMARY KEY,
                    preferences TEXT NOT NULL,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            `, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        console.log('✅ user_preferences table ready');

        // 🆕 Additional tables for complete system
        await new Promise((resolve, reject) => {
            db.db.run(`
                CREATE TABLE IF NOT EXISTS customers (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    phone TEXT NOT NULL UNIQUE,
                    name TEXT,
                    email TEXT,
                    address TEXT,
                    city TEXT,
                    state TEXT,
                    pincode TEXT,
                    gstin TEXT,
                    company_name TEXT,
                    customer_type TEXT DEFAULT 'retail',
                    total_orders INTEGER DEFAULT 0,
                    total_spent REAL DEFAULT 0,
                    last_order_at TEXT,
                    registered_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            `, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        console.log('✅ customers table ready');

        await new Promise((resolve, reject) => {
            db.db.run(`
                CREATE TABLE IF NOT EXISTS suppliers (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    phone TEXT NOT NULL,
                    email TEXT,
                    address TEXT,
                    gstin TEXT,
                    contact_person TEXT,
                    status TEXT DEFAULT 'active',
                    rating REAL DEFAULT 0,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            `, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        console.log('✅ suppliers table ready');

        await new Promise((resolve, reject) => {
            db.db.run(`
                CREATE TABLE IF NOT EXISTS supplier_products (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    supplier_id INTEGER NOT NULL,
                    part TEXT NOT NULL,
                    description TEXT,
                    price REAL DEFAULT 0,
                    stock INTEGER DEFAULT 0,
                    is_primary BOOLEAN DEFAULT 0,
                    last_updated TEXT DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
                    UNIQUE(supplier_id, part)
                )
            `, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        console.log('✅ supplier_products table ready');

        await new Promise((resolve, reject) => {
            db.db.run(`
                CREATE TABLE IF NOT EXISTS supplier_enquiries (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    supplier_id INTEGER NOT NULL,
                    part TEXT NOT NULL,
                    customer_phone TEXT NOT NULL,
                    customer_name TEXT,
                    quantity INTEGER DEFAULT 1,
                    status TEXT DEFAULT 'pending',
                    enquiry_text TEXT,
                    response_text TEXT,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    responded_at TEXT,
                    FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
                )
            `, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        console.log('✅ supplier_enquiries table ready');

        await new Promise((resolve, reject) => {
            db.db.run(`
                CREATE TABLE IF NOT EXISTS purchase_invoices (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    invoice_no TEXT UNIQUE NOT NULL,
                    supplier_id INTEGER NOT NULL,
                    supplier_name TEXT NOT NULL,
                    supplier_gstin TEXT,
                    invoice_date TEXT,
                    due_date TEXT,
                    subtotal REAL DEFAULT 0,
                    gst_amount REAL DEFAULT 0,
                    total_amount REAL DEFAULT 0,
                    items TEXT,
                    payment_status TEXT DEFAULT 'pending',
                    payment_date TEXT,
                    payment_method TEXT,
                    payment_reference TEXT,
                    notes TEXT,
                    uploaded_by TEXT,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
                )
            `, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        console.log('✅ purchase_invoices table ready');

        await new Promise((resolve, reject) => {
            db.db.run(`
                CREATE TABLE IF NOT EXISTS purchase_order_items (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    purchase_invoice_id INTEGER NOT NULL,
                    part TEXT NOT NULL,
                    description TEXT,
                    quantity INTEGER DEFAULT 0,
                    unit_price REAL DEFAULT 0,
                    total_price REAL DEFAULT 0,
                    gst_rate REAL DEFAULT 18,
                    gst_amount REAL DEFAULT 0,
                    status TEXT DEFAULT 'pending',
                    received_quantity INTEGER DEFAULT 0,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (purchase_invoice_id) REFERENCES purchase_invoices(id)
                )
            `, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        console.log('✅ purchase_order_items table ready');

        await new Promise((resolve, reject) => {
            db.db.run(`
                CREATE TABLE IF NOT EXISTS supplier_payments (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    payment_id TEXT UNIQUE NOT NULL,
                    supplier_id INTEGER NOT NULL,
                    supplier_name TEXT NOT NULL,
                    amount REAL NOT NULL,
                    payment_method TEXT NOT NULL,
                    payment_reference TEXT,
                    payment_date TEXT DEFAULT CURRENT_TIMESTAMP,
                    invoice_no TEXT,
                    notes TEXT,
                    status TEXT DEFAULT 'completed',
                    created_by TEXT,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
                )
            `, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        console.log('✅ supplier_payments table ready');
                // ============================================================
        // 🔧 FIX: Add missing columns to customers table
        // ============================================================

        try {
            await new Promise((resolve, reject) => {
                db.db.run('ALTER TABLE customers ADD COLUMN city TEXT', (err) => {
                    if (err && !err.message.includes('duplicate column name')) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            });
            console.log('✅ Added city column to customers');
        } catch (error) {
            console.log('⚠️ city column already exists:', error.message);
        }

        try {
            await new Promise((resolve, reject) => {
                db.db.run('ALTER TABLE customers ADD COLUMN state TEXT', (err) => {
                    if (err && !err.message.includes('duplicate column name')) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            });
            console.log('✅ Added state column to customers');
        } catch (error) {
            console.log('⚠️ state column already exists:', error.message);
        }

        try {
            await new Promise((resolve, reject) => {
                db.db.run('ALTER TABLE customers ADD COLUMN gstin TEXT', (err) => {
                    if (err && !err.message.includes('duplicate column name')) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            });
            console.log('✅ Added gstin column to customers');
        } catch (error) {
            console.log('⚠️ gstin column already exists:', error.message);
        }
        // ============================================================
        // 📋 MISSING TABLES FOR ORDER MANAGEMENT SYSTEM
        // ============================================================

        // 1️⃣ SALES INVOICES TABLE
        await new Promise((resolve, reject) => {
            db.db.run(`
                CREATE TABLE IF NOT EXISTS sales_invoices (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    invoice_no TEXT UNIQUE NOT NULL,
                    customer_phone TEXT NOT NULL,
                    customer_name TEXT NOT NULL,
                    customer_gstin TEXT,
                    customer_address TEXT,
                    invoice_date TEXT,
                    due_date TEXT,
                    subtotal REAL DEFAULT 0,
                    cgst REAL DEFAULT 0,
                    sgst REAL DEFAULT 0,
                    igst REAL DEFAULT 0,
                    round_off REAL DEFAULT 0,
                    grand_total REAL DEFAULT 0,
                    items TEXT NOT NULL,
                    payment_status TEXT DEFAULT 'Pending',
                    invoice_type TEXT DEFAULT 'credit',
                    status TEXT DEFAULT 'Pending',
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            `, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        console.log('✅ sales_invoices table ready');

        // 2️⃣ CUSTOMER PAYMENTS TABLE
        await new Promise((resolve, reject) => {
            db.db.run(`
                CREATE TABLE IF NOT EXISTS customer_payments (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    receipt_no TEXT UNIQUE NOT NULL,
                    customer_phone TEXT NOT NULL,
                    amount REAL NOT NULL,
                    payment_mode TEXT NOT NULL,
                    reference TEXT,
                    remarks TEXT,
                    payment_date TEXT DEFAULT CURRENT_TIMESTAMP,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            `, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        console.log('✅ customer_payments table ready');

        // 3️⃣ CUSTOMER LEDGER TABLE
        await new Promise((resolve, reject) => {
            db.db.run(`
                CREATE TABLE IF NOT EXISTS customer_ledger (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    customer_phone TEXT NOT NULL,
                    date TEXT NOT NULL,
                    type TEXT NOT NULL,
                    ref TEXT NOT NULL,
                    debit REAL DEFAULT 0,
                    credit REAL DEFAULT 0,
                    balance REAL DEFAULT 0,
                    narration TEXT,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            `, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        console.log('✅ customer_ledger table ready');

        // 4️⃣ SUPPLIER LEDGER TABLE
        await new Promise((resolve, reject) => {
            db.db.run(`
                CREATE TABLE IF NOT EXISTS supplier_ledger (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    supplier_phone TEXT NOT NULL,
                    date TEXT NOT NULL,
                    type TEXT NOT NULL,
                    ref TEXT NOT NULL,
                    debit REAL DEFAULT 0,
                    credit REAL DEFAULT 0,
                    balance REAL DEFAULT 0,
                    narration TEXT,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            `, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        console.log('✅ supplier_ledger table ready');

        // 5️⃣ PROFORMA INVOICES TABLE
        await new Promise((resolve, reject) => {
            db.db.run(`
                CREATE TABLE IF NOT EXISTS proforma_invoices (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    proforma_no TEXT UNIQUE NOT NULL,
                    customer_phone TEXT NOT NULL,
                    customer_name TEXT NOT NULL,
                    customer_gstin TEXT,
                    customer_address TEXT,
                    date TEXT,
                    valid_until TEXT,
                    items TEXT NOT NULL,
                    subtotal REAL DEFAULT 0,
                    cgst REAL DEFAULT 0,
                    sgst REAL DEFAULT 0,
                    grand_total REAL DEFAULT 0,
                    status TEXT DEFAULT 'active',
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            `, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        console.log('✅ proforma_invoices table ready');

        // 6️⃣ QUOTATIONS TABLE
        await new Promise((resolve, reject) => {
            db.db.run(`
                CREATE TABLE IF NOT EXISTS quotations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    quotation_no TEXT UNIQUE NOT NULL,
                    customer_phone TEXT NOT NULL,
                    customer_name TEXT NOT NULL,
                    customer_gstin TEXT,
                    customer_address TEXT,
                    date TEXT,
                    valid_until TEXT,
                    items TEXT NOT NULL,
                    subtotal REAL DEFAULT 0,
                    cgst REAL DEFAULT 0,
                    sgst REAL DEFAULT 0,
                    grand_total REAL DEFAULT 0,
                    status TEXT DEFAULT 'active',
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            `, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        console.log('✅ quotations table ready');

        // 7️⃣ INVENTORY TRANSACTIONS TABLE
        await new Promise((resolve, reject) => {
            db.db.run(`
                CREATE TABLE IF NOT EXISTS inventory_transactions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    product_part TEXT NOT NULL,
                    type TEXT NOT NULL,
                    quantity INTEGER NOT NULL,
                    date TEXT NOT NULL,
                    ref TEXT,
                    balance_after INTEGER DEFAULT 0,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            `, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        console.log('✅ inventory_transactions table ready');

        // 8️⃣ SUPPLIER CREDIT NOTES TABLE
        await new Promise((resolve, reject) => {
            db.db.run(`
                CREATE TABLE IF NOT EXISTS supplier_credit_notes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    credit_note_no TEXT UNIQUE NOT NULL,
                    supplier_phone TEXT NOT NULL,
                    amount REAL NOT NULL,
                    reason TEXT,
                    invoice_no TEXT,
                    status TEXT DEFAULT 'issued',
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            `, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        console.log('✅ supplier_credit_notes table ready');
        await createIndexes();
        console.log('✅ All tables created/verified');

    } catch (error) {
        console.error('❌ Create tables error:', error.message);
    }
}

async function createIndexes() {
    try {
        await db.db.run('CREATE INDEX IF NOT EXISTS idx_products_part ON products(part)');
        await db.db.run('CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand)');
        await db.db.run('CREATE INDEX IF NOT EXISTS idx_products_make ON products(make)');
        await db.db.run('CREATE INDEX IF NOT EXISTS idx_products_model ON products(model)');
        await db.db.run('CREATE INDEX IF NOT EXISTS idx_products_stock ON products(stock)');
        await db.db.run('CREATE INDEX IF NOT EXISTS idx_products_description ON products(description)');
        await db.db.run('CREATE INDEX IF NOT EXISTS idx_orders_phone ON orders(phone)');
        await db.db.run('CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)');
        await db.db.run('CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at)');
        await db.db.run('CREATE INDEX IF NOT EXISTS idx_invoices_phone ON invoices(customer_phone)');
        await db.db.run('CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status)');
        await db.db.run('CREATE INDEX IF NOT EXISTS idx_deliveries_status ON deliveries(status)');
        await db.db.run('CREATE INDEX IF NOT EXISTS idx_deliveries_boy ON deliveries(delivery_boy_phone)');
        await db.db.run('CREATE INDEX IF NOT EXISTS idx_out_of_stock_part ON out_of_stock_tracking(part)');
        await db.db.run('CREATE INDEX IF NOT EXISTS idx_out_of_stock_phone ON out_of_stock_tracking(customer_phone)');
        await db.db.run('CREATE INDEX IF NOT EXISTS idx_out_of_stock_status ON out_of_stock_tracking(status)');
        await db.db.run('CREATE INDEX IF NOT EXISTS idx_alerts_phone ON alerts(phone)');
        await db.db.run('CREATE INDEX IF NOT EXISTS idx_alerts_created ON alerts(created_at)');
        await db.db.run('CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone)');
        await db.db.run('CREATE INDEX IF NOT EXISTS idx_suppliers_phone ON suppliers(phone)');
        await db.db.run('CREATE INDEX IF NOT EXISTS idx_purchase_invoices_no ON purchase_invoices(invoice_no)');
        console.log('✅ Indexes created');
    } catch (error) {
        console.error('❌ Index creation error:', error.message);
    }
}

// ============================================================
// 🏥 HEALTH CHECK
// ============================================================

app.get('/health', async (req, res) => {
    try {
        const stats = await db.getStats();
        res.json({ 
            status: isDbReady ? 'ready' : 'loading',
            version: '3.1.0',
            timestamp: new Date().toISOString(),
            products: stats || { total_products: 0 },
            memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB',
            cache: messageCache.size,
            isReady: isDbReady,
            importProgress: Math.round((importProgress / TOTAL_PRODUCTS) * 100),
            message: dbReadyMessage,
            gemini: {
                queueLength: geminiRateLimiter.queue.length,
                processing: geminiRateLimiter.processing,
                cacheSize: geminiCache.size
            },
            brands: brandManager ? {
                total: brandManager.brands?.length || 0,
                active: brandManager.getActiveBrands?.().length || 0,
                lastUpdate: brandManager.lastUpdate || null
            } : null
        });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
});

// ============================================================
// 🏠 ROOT
// ============================================================

app.get('/', (req, res) => {
    res.json({
        name: 'ASSIST WhatsApp Webhook v3.1',
        version: '3.1.0',
        status: isDbReady ? 'ready' : 'loading',
        memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB used',
        endpoints: {
            health: '/health',
            webhook: '/webhook',
            search: '/api/search?q=part_number',
            invoice: '/api/invoice/:invoiceNo',
            invoices: '/api/invoices',
            admin: '/api/admin/dashboard',
            customers: '/api/customers',
            suppliers: '/api/suppliers',
            alerts: '/api/alerts/:phone',
            gemini: '/api/gemini-status',
            import: '/api/import-status',
            brands: '/api/brands'
        }
    });
});

// ============================================================
// 🔍 API: SEARCH PRODUCTS
// ============================================================

app.get('/api/search', async (req, res) => {
    try {
        const { q, limit = 20 } = req.query;
        if (!q) return res.status(400).json({ error: 'Query parameter "q" is required' });
        const results = await db.searchProducts(q, parseInt(limit));
        res.json({ query: q, count: results.length, results });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================================
// 📊 ADMIN: DASHBOARD
// ============================================================

app.get('/api/admin/dashboard', async (req, res) => {
    try {
        const stats = await db.getStats();
        res.json({ success: true, products: stats, timestamp: new Date().toISOString() });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// 👤 CUSTOMER MASTER API
// ============================================================

app.get('/api/customers', async (req, res) => {
    try {
        const customers = await db.getAllCustomers();
        res.json({ success: true, customers, count: customers.length });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/customers/:phone', async (req, res) => {
    try {
        const { phone } = req.params;
        const customer = await db.getCustomerByPhone(phone);
        if (customer) res.json({ success: true, customer });
        else res.status(404).json({ success: false, error: 'Customer not found' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// 📊 SUPPLIER API
// ============================================================

app.get('/api/suppliers', async (req, res) => {
    try {
        const suppliers = await db.getAllSuppliers();
        res.json({ success: true, suppliers, count: suppliers.length });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// 📢 ALERT API ENDPOINTS
// ============================================================

app.get('/api/alerts/:phone', async (req, res) => {
    try {
        const { phone } = req.params;
        const { limit = 10 } = req.query;
        const alerts = await alertSystem.getUserAlerts(phone, parseInt(limit));
        res.json({ success: true, alerts, count: alerts.length });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// 🤖 GEMINI STATUS API
// ============================================================

app.get('/api/gemini-status', (req, res) => {
    res.json({
        rateLimiter: {
            queueLength: geminiRateLimiter.queue.length,
            processing: geminiRateLimiter.processing,
            lastRequest: geminiRateLimiter.lastRequest,
            requestCount: geminiRateLimiter.requestCount,
            maxRequestsPerMinute: geminiRateLimiter.maxRequestsPerMinute
        },
        cache: {
            size: geminiCache.size,
            max: geminiCache.max
        },
        status: 'active',
        timestamp: new Date().toISOString()
    });
});

// ============================================================
// 📊 IMPORT STATUS API
// ============================================================

app.get('/api/import-status', (req, res) => {
    res.json({
        isReady: isDbReady,
        totalProducts: TOTAL_PRODUCTS,
        loadedProducts: importProgress,
        progress: Math.round((importProgress / TOTAL_PRODUCTS) * 100),
        message: dbReadyMessage
    });
});

// ============================================================
// 🎨 BRAND API ENDPOINTS
// ============================================================

app.get('/api/brands', async (req, res) => {
    try {
        const { active = 'true', limit } = req.query;
        
        let brands = brandManager.brands || [];
        
        if (active === 'true') {
            brands = brandManager.getActiveBrands ? brandManager.getActiveBrands() : brands;
        }
        
        if (limit) {
            brands = brands.slice(0, parseInt(limit));
        }
        
        res.json({
            success: true,
            count: brands.length,
            total: brandManager.brands?.length || 0,
            brands: brands.map(b => ({
                id: b.id,
                name: b.name,
                logo: b.logo,
                active: b.active !== false,
                priority: b.priority || 999
            })),
            lastUpdate: brandManager.lastUpdate || null
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.post('/api/brands/update', async (req, res) => {
    try {
        const from = req.body.from || req.query.from;
        if (!isAdmin(from) && !req.query.admin === 'true') {
            return res.status(403).json({
                success: false,
                error: 'Admin access required'
            });
        }
        
        const result = brandManager.updateBrands ? 
            await brandManager.updateBrands(true) : false;
        
        res.json({
            success: result,
            message: result ? 'Brands updated successfully' : 'Update failed',
            totalBrands: brandManager.brands?.length || 0,
            activeBrands: brandManager.getActiveBrands ? 
                brandManager.getActiveBrands().length : 0,
            lastUpdate: brandManager.lastUpdate || null
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.get('/api/brands/summary', async (req, res) => {
    try {
        const summary = brandManager.getSummary ? 
            brandManager.getSummary() : 
            { total: brandManager.brands?.length || 0, active: 0 };
        res.json({
            success: true,
            summary
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================
// 📩 WEBHOOK VERIFICATION
// ============================================================

app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token === CONFIG.verifyToken) {
        console.log('✅ Webhook Verified!');
        return res.status(200).send(challenge);
    }
    console.log('❌ Verification Failed!');
    res.status(403).send('Verification failed');
});

// ============================================================
// 📩 WEBHOOK RECEIVE
// ============================================================

app.post('/webhook', async (req, res) => {
    try {
        const entry = req.body.entry?.[0];
        const change = entry?.changes?.[0];
        const value = change?.value;
        
        if (value?.statuses) {
            return res.sendStatus(200);
        }
        
        const message = value?.messages?.[0];
        if (!message) {
            return res.sendStatus(200);
        }
        
        const from = message.from;
        const type = message.type || 'text';
        const messageId = message.id;
        
        if (isMessageProcessed(messageId)) {
            return res.sendStatus(200);
        }
        
        console.log(`📩 From: ${from} | Type: ${type} | ID: ${messageId}`);
        
        if (!isDbReady) {
    // Get actual import progress from the database
    let actualProgress = 0;
    let totalProducts = 0;
    try {
        const stats = await db.getStats();
        totalProducts = stats.total_products || 0;
        // Use actual imported count vs expected total
        const expectedTotal = 174460; // Total rows in your CSV
        actualProgress = Math.min(100, Math.round((totalProducts / expectedTotal) * 100));
    } catch (e) {
        // Fallback to old calculation
        actualProgress = Math.round((importProgress / TOTAL_PRODUCTS) * 100);
    }
    
    // Calculate remaining time based on actual progress
    const remainingPercent = Math.max(0, 100 - actualProgress);
    const estimatedTime = Math.ceil(remainingPercent / 2); // ~0.5% per second average
    
    await sendWhatsAppMessage(from, 
        `⏳ *System is Loading...*\n\n` +
        `📊 Progress: ${actualProgress}%\n` +
        `📦 ${totalProducts.toLocaleString()} products loaded so far\n` +
        `⏱️ Estimated wait: ${estimatedTime} seconds\n\n` +
        `💡 We'll notify you when the system is ready!\n` +
        `📞 Call: ${CONFIG.businessPhone}`
    );
    
    const pendingWelcomeKey = `pending_welcome_${from}`;
    messageCache.set(pendingWelcomeKey, true);
    
    markMessageProcessed(messageId);
    return res.sendStatus(200);
}
        
        const pendingWelcomeKey = `pending_welcome_${from}`;
        const welcomeKey = `welcome_sent_${from}`;
        
        if (messageCache.has(pendingWelcomeKey) && !messageCache.has(welcomeKey)) {
            console.log(`👋 Auto-sending welcome to ${from} (was waiting during loading)`);
            
            await sendWelcomeWithAllBrands(from);
            
            messageCache.set(welcomeKey, true);
            messageCache.delete(pendingWelcomeKey);
            
            try {
                await withTimeout(
                    processMessage(message, from, type),
                    CONFIG.responseTimeout,
                    'Message processing timed out'
                );
            } catch (error) {
                console.error(`❌ Processing error: ${error.message}`);
                await sendWhatsAppMessage(from, 
                    `⚠️ Sorry, couldn't process your message.\n` +
                    `Please try again.\n📞 Call: ${CONFIG.businessPhone}`
                );
            }
            
            markMessageProcessed(messageId);
            return res.sendStatus(200);
        }
        
        if (!messageCache.has(welcomeKey) && type === 'text') {
            const msgText = message.text?.body || '';
            const isCommand = msgText.toLowerCase().includes('admin') || 
                             msgText.toLowerCase().includes('confirm') ||
                             msgText.toLowerCase().includes('clear') ||
                             msgText.toLowerCase().includes('help') ||
                             msgText.toLowerCase().includes('hi') ||
                             msgText.toLowerCase().includes('hello') ||
                             msgText.toLowerCase().includes('status') ||
                             msgText.toLowerCase().includes('health');
            
            if (!isCommand && !isAdmin(from) && msgText.length > 1) {
                await sendWelcomeWithAllBrands(from);
                messageCache.set(welcomeKey, true);
            } else {
                messageCache.set(welcomeKey, true);
            }
        }
        
        if (!isAdmin(from) && type === 'text') {
            const msgText = message.text?.body || '';
            if (msgText && msgText.length > 2 &&
                !msgText.toLowerCase().includes('status') && 
                !msgText.toLowerCase().includes('health') &&
                !msgText.toLowerCase().includes('welcome')) {
                await alertSystem.sendAdminNotification(from, msgText, 'customer_message');
            }
        }
        
        try {
            await withTimeout(
                processMessage(message, from, type),
                CONFIG.responseTimeout,
                'Message processing timed out'
            );
        } catch (error) {
            console.error(`❌ Processing error: ${error.message}`);
            
            await sendWhatsAppMessage(from, 
                `⚠️ Sorry, couldn't process your message.\n` +
                `Please try again.\n📞 Call: ${CONFIG.businessPhone}`
            );
        } finally {
            markMessageProcessed(messageId);
        }
        
        res.sendStatus(200);
        
    } catch (error) {
        console.error(`❌ Webhook error: ${error.message}`);
        res.sendStatus(200);
    }
});

// ============================================================
// 📨 MESSAGE PROCESSOR
// ============================================================

async function processMessage(message, from, type) {
    if (type === 'image') {
        await handleWhatsAppImage(message, from);
    } else if (type === 'text') {
        await handleWhatsAppMessage(message, from);
    } else if (type === 'document') {
        await handleDocumentMessage(message, from);
    } else if (type === 'audio') {
        await handleVoiceMessage(message, from);
    } else if (type === 'location') {
        await handleLocationMessage(message, from);
    } else {
        await sendWhatsAppMessage(from, 
            `📩 Received your ${type} message.\n\n` +
            `💡 Please send text, images, or documents.\n` +
            `📞 Call: ${CONFIG.businessPhone}`
        );
    }
}

// ============================================================
// 📤 SEND WHATSAPP MESSAGE
// ============================================================

async function sendWhatsAppMessage(to, message) {
    const maxRetries = 3;
    let retries = 0;
    
    while (retries < maxRetries) {
        try {
            const normalizedPhone = to.replace(/\D/g, '');
            const url = `https://graph.facebook.com/v23.0/${CONFIG.phoneNumberId}/messages`;
            
            console.log(`📤 Sending to ${normalizedPhone}`);
            console.log(`📤 Message length: ${message.length}`);
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${CONFIG.accessToken}`,
                    'Content-Type': 'application/json'
                },
                signal: controller.signal,
                body: JSON.stringify({
                    messaging_product: 'whatsapp',
                    to: normalizedPhone,
                    type: 'text',
                    text: { body: message.slice(0, 4096) }
                })
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                const errorText = await response.text();
                if (response.status === 429) {
                    console.log(`⏳ Rate limited. Waiting 5 seconds...`);
                    await new Promise(resolve => setTimeout(resolve, 5000));
                    retries++;
                    continue;
                }
                throw new Error(`WhatsApp API error ${response.status}: ${errorText}`);
            }
            
            const result = await response.json();
            if (result.messages?.[0]?.id) {
                console.log(`✅ Message sent to ${normalizedPhone}`);
                return result;
            }
            throw new Error('No message ID in response');
            
        } catch (error) {
            retries++;
            console.error(`❌ Send attempt ${retries} failed: ${error.message}`);
            
            if (retries < maxRetries) {
                const delay = retries * 2000;
                console.log(`🔄 Retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                console.error(`❌ All ${maxRetries} attempts failed`);
                throw error;
            }
        }
    }
}

// ============================================================
// 🛡️ PENDING REQUESTS
// ============================================================

const pendingInvoiceRequests = new Map();
const pendingCustomerDetails = new Map();
const pendingOrderFinalization = new Map();
const pendingPurchaseUpload = new Map();
const pendingPaymentConfirmation = new Map();

// ============================================================
// 📥 MEDIA DOWNLOAD
// ============================================================

async function downloadMediaWithToken(mediaId) {
    try {
        const url = `https://graph.facebook.com/v23.0/${mediaId}`;
        const response = await fetch(url, { headers: { 'Authorization': `Bearer ${CONFIG.accessToken}` } });
        if (!response.ok) throw new Error(`Failed to get media URL: ${response.status}`);
        const data = await response.json();
        if (!data.url) throw new Error('No URL in media response');
        const downloadResponse = await fetch(data.url, { headers: { 'Authorization': `Bearer ${CONFIG.accessToken}` } });
        if (!downloadResponse.ok) throw new Error(`Failed to download media: ${downloadResponse.status}`);
        const buffer = await downloadResponse.arrayBuffer();
        return Buffer.from(buffer);
    } catch (error) {
        console.error('❌ Media download error:', error.message);
        throw error;
    }
}

// ============================================================
// 🚀 OPTIMIZED SEARCH
// ============================================================

async function optimizedSearch(query, limit = 10) {
    const exact = await db.getProductExact(query.toUpperCase());
    if (exact) return [exact];
    
    try {
        const [byPart, byVehicle, byDesc] = await Promise.all([
            db.searchProducts(query, limit),
            db.searchByVehicle(query, limit),
            db.searchDescriptionOnly(query, limit)
        ]);
        
        const seen = new Set();
        const results = [];
        for (const arr of [byPart, byVehicle, byDesc]) {
            for (const item of arr) {
                if (!seen.has(item.part)) {
                    seen.add(item.part);
                    results.push(item);
                }
            }
        }
        return results.slice(0, limit);
    } catch (error) {
        console.error('❌ Optimized search error:', error.message);
        return await db.searchProducts(query, limit);
    }
}

// ============================================================
// 🎙️ VOICE MESSAGE HANDLER
// ============================================================

async function handleVoiceMessage(message, from) {
    try {
        const audioId = message.audio?.id;
        const duration = message.audio?.duration || 0;
        
        console.log(`🎙️ Voice message from ${from}, duration: ${duration}s, ID: ${audioId}`);

        await sendWhatsAppMessage(from, 
            `🎙️ *Voice Message Received!*\n\n` +
            `🔊 Processing your voice...\n` +
            `⏳ Please wait 15-30 seconds...\n\n` +
            `📝 You can also type your message.\n` +
            `📞 Call: ${CONFIG.businessPhone}`
        );

        if (!CONFIG.geminiKey) {
            await sendWhatsAppMessage(from, 
                `🎙️ *Voice Processing Limited*\n\n` +
                `💡 Please type your message.\n` +
                `📞 Call: ${CONFIG.businessPhone}`
            );
            return;
        }

        console.log(`📥 Downloading audio: ${audioId}`);
        const audioBuffer = await withTimeout(
            downloadMediaWithToken(audioId),
            10000,
            'Audio download timed out'
        );
        console.log(`📥 Audio downloaded: ${audioBuffer.length} bytes`);

        console.log(`🤖 Transcribing with Gemini...`);
        
        const base64Audio = audioBuffer.toString('base64');
        const prompt = `Transcribe this audio message from a customer.
        
IMPORTANT RULES:
1. Look for EXACT part numbers (alphanumeric, 5-20 characters like 0801BA0285N)
2. If you find a part number, return ONLY the part number
3. If you find part number with quantity, return "PART_NUMBER QTY"
4. Example: "0801BA0285N 2"
5. If multiple part numbers, list each on new line
6. If no part number found, return the full transcription`;

        const data = await geminiRateLimiter.request(prompt, base64Audio, 'audio/ogg');
        
        let transcribedText = null;
        if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
            transcribedText = data.candidates[0].content.parts[0].text.trim();
            if (transcribedText === 'INVALID' || transcribedText.length < 2) {
                transcribedText = null;
            }
        }
        
        if (!transcribedText) {
            console.log(`⚠️ No transcription result`);
            await sendWhatsAppMessage(from, 
                `🎙️ *Couldn't understand the audio*\n\n` +
                `💡 Please try speaking clearly and slowly.\n` +
                `📝 You can also type your message.\n\n` +
                `📞 Call: ${CONFIG.businessPhone}`
            );
            return;
        }

        console.log(`📝 Transcribed: "${transcribedText}"`);

        const mockMessage = { text: { body: transcribedText } };
        await handleWhatsAppMessage(mockMessage, from);

    } catch (error) {
        console.error(`❌ Voice handler error:`, error.message);
        await sendWhatsAppMessage(from, 
            `🎙️ *Voice Processing Failed*\n\n` +
            `⚠️ Error: ${error.message}\n\n` +
            `💡 Please try again or type your message.\n` +
            `📞 Call: ${CONFIG.businessPhone}`
        );
    }
}

// ============================================================
// 📸 IMAGE HANDLER
// ============================================================

async function handleWhatsAppImage(message, from) {
    try {
        const mediaId = message.image.id;
        const caption = message.image.caption || "";
        console.log(`📸 Processing image from ${from}`);
        console.log(`📸 Media ID: ${mediaId}`);
        console.log(`📸 Caption: "${caption}"`);

        await sendWhatsAppMessage(from, 
            `📸 *Photo Received!*\n\n` +
            `🔍 Extracting part numbers from image...\n` +
            `⏳ Please wait 15-30 seconds...\n\n` +
            `💡 You can also type the part number directly.\n` +
            `📞 Call: ${CONFIG.businessPhone}`
        );

        if (!CONFIG.geminiKey) {
            await sendWhatsAppMessage(from, 
                `📸 *Image Processing Limited*\n\n` +
                `💡 Please type the part numbers directly.\n` +
                `📝 Example: "0801BA0285N 2"\n\n` +
                `📞 Call: ${CONFIG.businessPhone}`
            );
            return;
        }

        console.log(`📥 Downloading image: ${mediaId}`);
        const imageBuffer = await withTimeout(
            downloadMediaWithToken(mediaId),
            15000,
            'Image download timed out'
        );
        console.log(`📸 Image downloaded: ${imageBuffer.length} bytes`);

        const cacheKey = `image_${imageBuffer.length}_${caption}`;
        let extractedText = null;
        
        if (geminiCache.has(cacheKey)) {
            console.log(`📦 Returning cached result for image`);
            extractedText = geminiCache.get(cacheKey);
        } else {
            console.log(`🤖 Processing image with Gemini Vision...`);
            
            let buffer = imageBuffer;
            try {
                const sharp = require('sharp');
                buffer = await sharp(buffer)
                    .resize(2000, 2000, { fit: 'inside', withoutEnlargement: true })
                    .sharpen({ sigma: 1.5, m1: 1.0, m2: 2.0 })
                    .normalize()
                    .modulate({ brightness: 1.1, saturation: 1.2 })
                    .jpeg({ quality: 95, progressive: true, chromaSubsampling: '4:4:4' })
                    .toBuffer();
                console.log(`📸 Enhanced image: ${buffer.length} bytes`);
            } catch (sharpError) {
                console.log(`⚠️ Sharp processing failed: ${sharpError.message}`);
                buffer = imageBuffer;
            }

            const base64Image = buffer.toString('base64');
            const prompt = `You are an OCR expert for auto parts. Extract ALL part numbers from this image.

CRITICAL RULES:
1. Look for PART NUMBERS (alphanumeric, 5-20 characters like 0801BA0285N)
2. Look for QUANTITIES (numbers after part numbers)
3. Extract EVERY part number you can find
4. If quantity is present, include it (format: PART_NUMBER QUANTITY)
5. If multiple parts, list each on new line
6. DO NOT return random numbers (like 11648, 0, 1, 2) unless they are part of a part number

OUTPUT FORMAT:
- Single part: "PART_NUMBER QUANTITY"
- Multiple parts: "PART_NUMBER1 QUANTITY1\nPART_NUMBER2 QUANTITY2"

Caption: "${caption || 'No caption'}"

Extracted text:`;

            const data = await geminiRateLimiter.request(prompt, base64Image, 'image/jpeg');
            
            if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
                let content = data.candidates[0].content.parts[0].text.trim();
                console.log(`📝 Gemini extracted: "${content}"`);
                
                content = content.replace(/^["']|["']$/g, '').trim();
                
                if (content !== 'NO_PARTS_FOUND' && content.length > 3) {
                    const lines = content.split('\n');
                    const validParts = [];
                    
                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (!trimmed) continue;
                        
                        const partMatch = trimmed.match(/\b([A-Z0-9]{5,20})\b/i);
                        if (partMatch) {
                            const partNumber = partMatch[1].toUpperCase();
                            if (/^[A-Z0-9]{5,20}$/.test(partNumber)) {
                                const qtyMatch = trimmed.match(/(\d+)/);
                                const qty = qtyMatch ? parseInt(qtyMatch[1]) : 1;
                                validParts.push(`${partNumber} ${qty}`);
                            }
                        }
                    }
                    
                    if (validParts.length > 0) {
                        extractedText = validParts.join('\n');
                        console.log(`✅ Valid parts: ${extractedText}`);
                    } else if (content.length > 3) {
                        extractedText = content;
                    }
                }
            }
            
            if (extractedText) {
                geminiCache.set(cacheKey, extractedText);
            }
        }
        
        if (extractedText) {
            const parts = extractedText.split('\n').filter(line => line.trim().length > 0);
            
            if (parts.length === 1) {
                const mockMessage = { text: { body: parts[0] } };
                await handleWhatsAppMessage(mockMessage, from);
            } else if (parts.length > 1) {
                const mockMessage = { text: { body: extractedText } };
                await handleWhatsAppMessage(mockMessage, from);
            } else {
                const partMatch = extractedText.match(/\b([A-Z0-9]{5,20})\b/i);
                if (partMatch) {
                    const mockMessage = { text: { body: partMatch[1] } };
                    await handleWhatsAppMessage(mockMessage, from);
                } else {
                    await sendWhatsAppMessage(from, 
                        `📸 *No valid part numbers found*\n\n` +
                        `💡 Please type the part numbers directly.\n` +
                        `📝 Example: "0801BA0285N 2"\n\n` +
                        `📞 Call: ${CONFIG.businessPhone}`
                    );
                }
            }
        } else {
            console.log(`⚠️ No text extracted from image`);
            
            if (Tesseract) {
                console.log(`🔄 Trying Tesseract OCR fallback...`);
                try {
                    const result = await Tesseract.recognize(imageBuffer, 'eng', {
                        logger: m => console.log(`📊 Tesseract: ${m.status}`)
                    });
                    
                    const ocrText = result.data.text.trim();
                    if (ocrText.length > 3) {
                        console.log(`📝 Tesseract extracted: "${ocrText}"`);
                        const partMatch = ocrText.match(/\b([A-Z0-9]{5,20})\b/i);
                        if (partMatch) {
                            const mockMessage = { text: { body: partMatch[1] } };
                            await handleWhatsAppMessage(mockMessage, from);
                            return;
                        }
                    }
                } catch (tesseractError) {
                    console.log(`⚠️ Tesseract failed: ${tesseractError.message}`);
                }
            }
            
            await sendWhatsAppMessage(from, 
                `📸 *Couldn't read the image*\n\n` +
                `💡 Please type the part numbers directly.\n` +
                `📝 Example: "0801BA0285N 2"\n\n` +
                `📞 Call: ${CONFIG.businessPhone}`
            );
        }

    } catch (error) {
        console.error(`❌ Image handler error:`, error.message);
        await sendWhatsAppMessage(from, 
            `📸 *Sorry, couldn't process your image.*\n\n` +
            `💡 Please send the part number directly.\n` +
            `📞 Call: ${CONFIG.businessPhone}`
        );
    }
}

// ============================================================
// 🔍 HELPER FUNCTIONS
// ============================================================

function formatProductForWhatsApp(product, index = 0) {
    const listPrice = product.list_price || 0;
    const mrpPrice = product.mrp || 0;
    const billingPrice = product.billing_price || 0;
    const priceWithGST = billingPrice * 1.18;

    let reply = `${index + 1}. *${product.part}*\n`;
    reply += `📝 ${product.description || 'N/A'}\n`;
    if (product.brand) reply += `🏷️ Brand: ${product.brand}\n`;
    if (product.make) reply += `🚗 Make: ${product.make}\n`;
    if (product.model) reply += `🎯 Model: ${product.model}\n`;
    if (listPrice > 0) reply += `💰 LIST PRICE: ₹${listPrice.toFixed(2)}\n`;
    if (mrpPrice > 0) reply += `💰 MRP PRICE: ₹${mrpPrice.toFixed(2)}\n`;
    if (billingPrice > 0) {
        reply += `💳 Billing Price: ₹${billingPrice.toFixed(2)}\n`;
        reply += `💳 Price incl. GST: ₹${priceWithGST.toFixed(2)}\n`;
    }
    reply += `📦 ${product.stock > 0 ? `✅ ${product.stock} pcs` : '❌ Out of Stock'}`;
    return reply;
}

// ============================================================
// 📱 HANDLE WHATSAPP TEXT MESSAGE
// ============================================================

async function handleWhatsAppMessage(message, from) {
    try {
        const text = message.text?.body || '';
        console.log(`💬 Message: "${text}"`);
        
        const cleaned = text.replace(/^["']|["']$/g, '').replace(/["']/g, '').replace(/\s+/g, ' ').trim();
        const msgLower = cleaned.toLowerCase().trim();

        // ============================================================
        // 🛡️ STEP 1: ADMIN COMMANDS
        // ============================================================
        
        if (isAdmin(from)) {
            
            // 📋 Admin: Show admin commands
            if (msgLower === 'help admin' || msgLower === 'admin help') {
                await sendWhatsAppMessage(from,
                    `👑 *Admin Commands*\n━━━━━━━━━━━━━━━━━━━━\n\n` +
                    `📋 *Admin Orders:*\n` +
                    `   "Admin orders" - View all pending orders\n\n` +
                    `✅ *Confirm Customer Order:*\n` +
                    `   "Confirm order for 919XXXXXXXXX"\n\n` +
                    `🛒 *View Customer Cart:*\n` +
                    `   "Customer cart 919XXXXXXXXX"\n\n` +
                    `📦 *Stock Status:*\n` +
                    `   "Stock status 0801BA0285N"\n\n` +
                    `📢 *Admin Alerts:*\n` +
                    `   "Admin alerts"\n\n` +
                    `🎨 *Brand Management:*\n` +
                    `   "Brands" - List all brands\n` +
                    `   "Update brands" - Force brand update\n` +
                    `   "Add brand id|name|logo" - Add new brand\n` +
                    `   "Remove brand id" - Remove brand\n` +
                    `   "Refresh brochure" - Regenerate brochure\n\n` +
                           `📁 *File Watcher:*\n` +
`   "Watcher status" - Check file watcher status\n` +
`   "Scan files" - Force scan for new files\n` +
`   "Processed files" - List imported files\n` +
`   "Start watcher" - Start auto-import\n` +
`   "Stop watcher" - Stop auto-import\n` +
`   "Reset watcher" - Reset and restart\n\n` +               
                    `📞 *Call:* ${CONFIG.businessPhone}`
                );
                return;
            }
            
            // 📋 Admin: View all pending orders
            if (msgLower === 'admin orders' || msgLower === 'pending orders') {
                try {
                    const orders = await db.getAllOrders();
                    const pendingOrders = orders.filter(o => o.status === 'pending' || o.status === 'confirmed');
                    
                    if (pendingOrders.length === 0) {
                        await sendWhatsAppMessage(from, '📋 *No pending orders.*');
                        return;
                    }
                    
                    let reply = `📋 *Pending Orders*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
                    pendingOrders.forEach((order, index) => {
                        reply += `${index + 1}. *${order.order_id}*\n`;
                        reply += `   👤 ${order.customer_phone}\n`;
                        reply += `   💰 ₹${order.total}\n`;
                        reply += `   📝 ${order.items ? JSON.parse(order.items).length : 0} items\n`;
                        reply += `   🕐 ${new Date(order.created_at).toLocaleString()}\n\n`;
                    });
                    reply += `✅ *To confirm:* "Confirm order for [phone]"\n`;
                    await sendWhatsAppMessage(from, reply);
                    return;
                } catch (error) {
                    console.error('❌ Admin orders error:', error.message);
                    await sendWhatsAppMessage(from, '⚠️ Error fetching orders.');
                    return;
                }
            }
            
            // ✅ Admin: Confirm customer order
            const confirmMatch = msgLower.match(/confirm order for (\d+)/);
            if (confirmMatch) {
                const customerPhone = confirmMatch[1];
                console.log(`👑 Admin confirming order for ${customerPhone}`);
                
                try {
                    const cart = await db.getCart(customerPhone);
                    if (!cart || !cart.items) {
                        await sendWhatsAppMessage(from, 
                            `❌ *No cart found for ${customerPhone}*\n\n` +
                            `Customer hasn't added any items to cart.`
                        );
                        return;
                    }
                    
                    const items = JSON.parse(cart.items);
                    const orderId = `ORD-${Date.now().toString().slice(-6)}`;
                    await db.saveOrder(orderId, customerPhone, items, cart.total);
                    await db.clearCart(customerPhone);
                    
                    await alertSystem.sendOrderConfirmation(customerPhone, orderId, items, cart.total);
                    
                    await sendWhatsAppMessage(from,
                        `✅ *ORDER CONFIRMED ON BEHALF OF CUSTOMER!*\n\n` +
                        `📦 Order ID: ${orderId}\n` +
                        `👤 Customer: ${customerPhone}\n` +
                        `📝 Items: ${items.length}\n` +
                        `💰 Total: ₹${cart.total.toFixed(2)}\n\n` +
                        `✅ Customer has been notified.`
                    );
                    
                    await alertSystem.sendNewOrderAlert(orderId, customerPhone, items, cart.total);
                    return;
                    
                } catch (error) {
                    console.error('❌ Admin confirm order error:', error.message);
                    await sendWhatsAppMessage(from,
                        `❌ *Failed to confirm order*\n\n` +
                        `Error: ${error.message}`
                    );
                    return;
                }
            }
            
            // 🛒 Admin: View customer cart
            const cartMatch = msgLower.match(/customer cart (\d+)/);
            if (cartMatch) {
                const customerPhone = cartMatch[1];
                console.log(`👑 Admin viewing cart for ${customerPhone}`);
                
                try {
                    const cart = await db.getCart(customerPhone);
                    if (!cart || !cart.items) {
                        await sendWhatsAppMessage(from,
                            `🛒 *Cart is empty for ${customerPhone}*`
                        );
                        return;
                    }
                    
                    const items = JSON.parse(cart.items);
                    let reply = `🛒 *Cart for ${customerPhone}*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
                    items.forEach((item, index) => {
                        reply += `${index + 1}. ${item.part} x${item.qty} = ₹${(item.price * item.qty).toFixed(2)}\n`;
                    });
                    reply += `\n💰 *Total: ₹${cart.total.toFixed(2)}*\n\n`;
                    reply += `✅ *To confirm:* "Confirm order for ${customerPhone}"`;
                    await sendWhatsAppMessage(from, reply);
                    return;
                } catch (error) {
                    console.error('❌ Admin cart error:', error.message);
                    await sendWhatsAppMessage(from, '⚠️ Error fetching cart.');
                    return;
                }
            }
            
            // 📦 Stock Status
            const stockMatch = msgLower.match(/stock status ([a-z0-9]{5,20})/);
            if (stockMatch) {
                const partNumber = stockMatch[1].toUpperCase();
                const product = await db.getProductExact(partNumber);
                if (product) {
                    let reply = `📦 *Stock Status: ${product.part}*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
                    reply += `📝 ${product.description || 'N/A'}\n`;
                    if (product.brand) reply += `🏷️ Brand: ${product.brand}\n`;
                    if (product.make) reply += `🚗 Make: ${product.make}\n`;
                    if (product.model) reply += `🎯 Model: ${product.model}\n`;
                    reply += `\n📦 Stock: ${product.stock > 0 ? `✅ ${product.stock} pcs available` : '❌ Out of Stock'}`;
                    reply += `\n💰 Price: ₹${(product.billing_price * 1.18).toFixed(2)} (incl. GST)`;
                    await sendWhatsAppMessage(from, reply);
                } else {
                    await sendWhatsAppMessage(from, `❌ Part ${partNumber} not found.`);
                }
                return;
            }
            
            // 📢 Admin Alerts
            if (msgLower === 'admin alerts' || msgLower === 'alerts') {
                const alerts = await alertSystem.getUserAlerts(normalizePhone(ADMIN_PHONE), 10);
                if (alerts.length === 0) {
                    await sendWhatsAppMessage(from, '📢 *No recent alerts.*');
                    return;
                }
                let reply = `📢 *Recent Alerts*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
                alerts.forEach((alert, index) => {
                    reply += `${index + 1}. ${alert.type}\n`;
                    reply += `   ${alert.message.substring(0, 60)}...\n`;
                    reply += `   🕐 ${new Date(alert.created_at).toLocaleString()}\n\n`;
                });
                reply += `📞 Call: ${CONFIG.businessPhone}`;
                await sendWhatsAppMessage(from, reply);
                return;
            }
            
            // 🎨 Brand Management Commands
            
            // 📋 List brands
            if (msgLower === 'brands' || msgLower === 'list brands') {
                const active = brandManager.getActiveBrands ? brandManager.getActiveBrands() : [];
                const all = brandManager.brands || [];
                
                let reply = `🎨 *Brands*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
                reply += `📊 Total: ${all.length} | Active: ${active.length}\n\n`;
                
                active.slice(0, 15).forEach((b, i) => {
                    reply += `${i + 1}. *${b.name}* (${b.id})\n`;
                    reply += `   📷 ${b.logo || 'No logo'}\n`;
                    reply += `   🎯 Priority: ${b.priority || 999}\n\n`;
                });
                
                if (active.length > 15) {
                    reply += `... and ${active.length - 15} more\n\n`;
                }
                
                reply += `📝 *Commands:*\n`;
                reply += `   "Update brands" - Force update from remote\n`;
                reply += `   "Add brand id|name|logo" - Add new brand\n`;
                reply += `   "Remove brand id" - Remove brand\n`;
                reply += `   "Refresh brochure" - Regenerate brochure`;
                
                await sendWhatsAppMessage(from, reply);
                return;
            }
            
            // 🔄 Update brands
            if (msgLower === 'update brands' || msgLower === 'refresh brands') {
                await sendWhatsAppMessage(from, '🔄 Updating brands from remote sources...');
                
                const result = brandManager.updateBrands ? 
                    await brandManager.updateBrands(true) : false;
                
                if (result) {
                    const active = brandManager.getActiveBrands ? 
                        brandManager.getActiveBrands() : [];
                    await sendWhatsAppMessage(from,
                        `✅ *Brands Updated!*\n\n` +
                        `📊 Total: ${brandManager.brands?.length || 0}\n` +
                        `✅ Active: ${active.length}\n` +
                        `🕐 Last Update: ${brandManager.lastUpdate?.toLocaleString() || 'N/A'}\n\n` +
                        `📋 "Brands" to view all`
                    );
                } else {
                    await sendWhatsAppMessage(from, '❌ Failed to update brands. Please try again later.');
                }
                return;
            }
            
            // 🔄 Refresh brochure
            if (msgLower === 'refresh brochure' || msgLower === 'update brochure') {
                await sendWhatsAppMessage(from, '🔄 Refreshing brochure cache...');
                
                // Clear cache
                if (brandCollage && brandCollage.clearCache) {
                    brandCollage.clearCache();
                } else {
                    // Manually clear cache
                    try {
                        const { LRUCache } = require('lru-cache');
                    } catch (e) {}
                }
                
                // Force brand update
                if (brandManager && brandManager.updateBrands) {
                    await brandManager.updateBrands(true);
                }
                
                await sendWhatsAppMessage(from,
                    `✅ *Brochure Refreshed!*\n\n` +
                    `📊 Total Brands: ${brandManager?.getActiveBrands?.().length || 0}\n` +
                    `🕐 Last Updated: ${new Date().toLocaleString()}\n\n` +
                    `📋 New users will see the updated brochure.`
                );
                return;
            }
            
            // ➕ Add brand
            const addBrandMatch = msgLower.match(/add brand ([^|]+)\|([^|]+)\|([^|]+)/);
            if (addBrandMatch) {
                const id = addBrandMatch[1].trim().toLowerCase();
                const name = addBrandMatch[2].trim();
                const logo = addBrandMatch[3].trim();
                
                const existing = brandManager.getBrandById ? 
                    brandManager.getBrandById(id) : null;
                
                if (existing) {
                    await sendWhatsAppMessage(from, `❌ Brand "${id}" already exists.`);
                    return;
                }
                
                if (brandManager.brands) {
                    brandManager.brands.push({
                        id,
                        name,
                        logo,
                        active: true,
                        priority: brandManager.brands.length + 1
                    });
                    
                    if (brandManager.saveBrandsToFile) {
                        brandManager.saveBrandsToFile();
                    }
                }
                
                await sendWhatsAppMessage(from,
                    `✅ *Brand Added!*\n\n` +
                    `🆔 ID: ${id}\n` +
                    `📛 Name: ${name}\n` +
                    `📷 Logo: ${logo}\n\n` +
                    `📋 "Brands" to view all\n` +
                    `🔄 "Refresh brochure" to update brochure`
                );
                return;
            }
            
            // ❌ Remove brand
            const removeBrandMatch = msgLower.match(/remove brand ([a-z0-9-]+)/);
            if (removeBrandMatch) {
                const id = removeBrandMatch[1].trim().toLowerCase();
                
                const brand = brandManager.getBrandById ? 
                    brandManager.getBrandById(id) : null;
                    
                if (!brand) {
                    await sendWhatsAppMessage(from, `❌ Brand "${id}" not found.`);
                    return;
                }
                
                brand.active = false;
                
                if (brandManager.saveBrandsToFile) {
                    brandManager.saveBrandsToFile();
                }
                
                await sendWhatsAppMessage(from,
                    `✅ *Brand Deactivated!*\n\n` +
                    `🆔 ID: ${id}\n` +
                    `📛 Name: ${brand.name}\n\n` +
                    `💡 Use "Update brands" to reactivate from remote\n` +
                    `🔄 "Refresh brochure" to update brochure`
                );
                return;
            }
            
            // 📊 Brand summary
            if (msgLower === 'brand summary' || msgLower === 'brand stats') {
                const summary = brandManager.getSummary ? 
                    brandManager.getSummary() : 
                    { total: brandManager.brands?.length || 0, active: 0 };
                
                let reply = `📊 *Brand Summary*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
                reply += `📦 Total: ${summary.total || 0}\n`;
                reply += `✅ Active: ${summary.active || 0}\n`;
                reply += `❌ Inactive: ${(summary.total || 0) - (summary.active || 0)}\n`;
                reply += `🕐 Last Update: ${summary.lastUpdate?.toLocaleString() || 'N/A'}\n\n`;
                reply += `📋 "Brands" to view all`;
                
                await sendWhatsAppMessage(from, reply);
                return;
            }
            // 📊 Check database tables
if (isAdmin(from) && msgLower === 'check tables') {
    try {
        const tables = await new Promise((resolve) => {
            db.db.all(
                `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`,
                [],
                (err, rows) => {
                    if (err) resolve([]);
                    else resolve(rows || []);
                }
            );
        });
        
        let reply = `📊 *Database Tables*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
        tables.forEach((t, i) => {
            reply += `${i + 1}. ${t.name}\n`;
        });
        reply += `\n📊 Total: ${tables.length} tables`;
        
        await sendWhatsAppMessage(from, reply);
        return;
    } catch (error) {
        await sendWhatsAppMessage(from, `❌ Error: ${error.message}`);
        return;
    }
}

// 📋 Check customers table
if (isAdmin(from) && msgLower === 'check customers') {
    try {
        const count = await new Promise((resolve) => {
            db.db.get(
                `SELECT COUNT(*) as count FROM customers`,
                [],
                (err, row) => {
                    if (err) resolve(0);
                    else resolve(row?.count || 0);
                }
            );
        });
        
        const sample = await new Promise((resolve) => {
            db.db.all(
                `SELECT * FROM customers LIMIT 3`,
                [],
                (err, rows) => {
                    if (err) resolve([]);
                    else resolve(rows || []);
                }
            );
        });
        
        let reply = `👤 *Customers Table*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
        reply += `📊 Total: ${count} customers\n\n`;
        
        if (sample.length > 0) {
            reply += `📋 *Sample:*\n`;
            sample.forEach((c, i) => {
                reply += `${i + 1}. ${c.name || 'Unknown'} (${c.phone})\n`;
                reply += `   📍 ${c.city || 'N/A'}\n`;
                reply += `   📌 ${c.state || 'N/A'}\n\n`;
            });
        }
        
        await sendWhatsAppMessage(from, reply);
        return;
    } catch (error) {
        await sendWhatsAppMessage(from, `❌ Error: ${error.message}`);
        return;
    }
}
        }
       // ============================================================
// 🔧 FIX: Add ALL Missing Columns to Database
// ============================================================

if (isAdmin(from) && msgLower === 'fix columns') {
    try {
        await sendWhatsAppMessage(from, '🔄 Adding all missing columns to database...');
        
        const results = [];
        
        // ALL columns needed for customers table
        const customerColumns = [
            { name: 'pincode', type: 'TEXT' },
            { name: 'total_spent', type: 'REAL DEFAULT 0' },
            { name: 'total_orders', type: 'INTEGER DEFAULT 0' },
            { name: 'last_order_at', type: 'TEXT' },
            { name: 'credit_limit', type: 'REAL DEFAULT 0' },
            { name: 'outstanding', type: 'REAL DEFAULT 0' },
            { name: 'company_name', type: 'TEXT' },
            { name: 'city', type: 'TEXT' },
            { name: 'state', type: 'TEXT' },
            { name: 'gstin', type: 'TEXT' },
            { name: 'customer_type', type: 'TEXT' },
            { name: 'registered_at', type: 'TEXT' },
            { name: 'updated_at', type: 'TEXT' },
            { name: 'address', type: 'TEXT' }
        ];
        
        for (const col of customerColumns) {
            try {
                await new Promise((resolve, reject) => {
                    db.db.run(`ALTER TABLE customers ADD COLUMN ${col.name} ${col.type}`, (err) => {
                        if (err && !err.message.includes('duplicate column name')) {
                            reject(err);
                        } else {
                            resolve();
                        }
                    });
                });
                results.push(`✅ Added customer.${col.name}`);
            } catch (error) {
                if (error.message && error.message.includes('duplicate column name')) {
                    results.push(`⚠️ customer.${col.name} already exists`);
                } else {
                    results.push(`⚠️ customer.${col.name}: ${error.message}`);
                }
            }
        }
        
       // ALL columns needed for suppliers table
const supplierColumns = [
    { name: 'city', type: 'TEXT' },
    { name: 'state', type: 'TEXT' },
    { name: 'pincode', type: 'TEXT' },
    { name: 'outstanding', type: 'REAL DEFAULT 0' },
    { name: 'credit_limit', type: 'REAL DEFAULT 0' },
    { name: 'rating', type: 'REAL DEFAULT 0' },
    { name: 'updated_at', type: 'TEXT' },
    { name: 'contact_person', type: 'TEXT' },
    { name: 'contact_person_phone', type: 'TEXT' }
];
        
        for (const col of supplierColumns) {
            try {
                await new Promise((resolve, reject) => {
                    db.db.run(`ALTER TABLE suppliers ADD COLUMN ${col.name} ${col.type}`, (err) => {
                        if (err && !err.message.includes('duplicate column name')) {
                            reject(err);
                        } else {
                            resolve();
                        }
                    });
                });
                results.push(`✅ Added supplier.${col.name}`);
            } catch (error) {
                if (error.message && error.message.includes('duplicate column name')) {
                    results.push(`⚠️ supplier.${col.name} already exists`);
                } else {
                    results.push(`⚠️ supplier.${col.name}: ${error.message}`);
                }
            }
        }
        
        let reply = `🔧 *Column Fix Results*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
        reply += results.join('\n');
        reply += `\n\n✅ Column fix complete!\n📝 Run "import backup" to import data.`;
        
        await sendWhatsAppMessage(from, reply);
        return;
    } catch (error) {
        await sendWhatsAppMessage(from, `❌ Error: ${error.message}`);
        return;
    }
}
// ============================================================
// 📁 FILE WATCHER COMMANDS - ADD AFTER BRAND SUMMARY
// ============================================================

// 📊 File watcher status
if (msgLower === 'watcher status' || msgLower === 'file watcher') {
    const status = fileWatcher.getStatus ? fileWatcher.getStatus() : {};
    
    let reply = `🔍 *File Watcher Status*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
    reply += `🔄 Status: ${status.isWatching ? '✅ Active' : '❌ Stopped'}\n`;
    reply += `📁 Watching: ${status.rootDir || 'N/A'}\n`;
    reply += `⏱️ Scan Interval: ${status.config?.scanInterval / 1000 || 5}s\n`;
    reply += `📦 Processed: ${status.processedFiles || 0} files\n`;
    reply += `⏳ Processing: ${status.processingFiles || 0} files\n`;
    reply += `📥 Pending: ${status.pendingFiles || 0} files\n\n`;
    
    if (status.importHistory && status.importHistory.length > 0) {
        reply += `📋 *Recent Imports:*\n`;
        status.importHistory.slice(-5).forEach(item => {
            const statusIcon = item.success ? '✅' : '❌';
            reply += `   ${statusIcon} ${item.file}\n`;
            if (item.success) {
                reply += `      📦 ${item.rows} rows\n`;
            }
            reply += `      🕐 ${new Date(item.timestamp).toLocaleTimeString()}\n`;
        });
    }
    
    await sendWhatsAppMessage(from, reply);
    return;
}

// 📥 Force scan
if (msgLower === 'scan files' || msgLower === 'scan now') {
    await sendWhatsAppMessage(from, '🔍 Scanning for new files...');
    
    if (fileWatcher.scanDirectory) {
        fileWatcher.scanDirectory();
    }
    
    const status = fileWatcher.getStatus ? fileWatcher.getStatus() : {};
    await sendWhatsAppMessage(from,
        `✅ *Scan Complete!*\n\n` +
        `📦 Processed: ${status.processedFiles || 0} files\n` +
        `⏳ Processing: ${status.processingFiles || 0} files\n` +
        `📥 Pending: ${status.pendingFiles || 0} files\n\n` +
        `📋 "Watcher status" for details`
    );
    return;
}

// 📄 List processed files
if (msgLower === 'processed files' || msgLower === 'imported files') {
    const files = fileWatcher.getProcessedFiles ? fileWatcher.getProcessedFiles() : [];
    
    if (files.length === 0) {
        await sendWhatsAppMessage(from, '📋 No files have been processed yet.');
        return;
    }
    
    let reply = `📄 *Processed Files*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
    files.slice(-20).forEach((file, index) => {
        reply += `${index + 1}. ${file.filename}\n`;
        reply += `   🕐 ${file.timestamp ? new Date(file.timestamp).toLocaleString() : 'Unknown'}\n\n`;
    });
    
    reply += `📊 Total: ${files.length} files`;
    await sendWhatsAppMessage(from, reply);
    return;
}

// ⏹️ Stop watcher
if (msgLower === 'stop watcher') {
    if (fileWatcher.stopWatching) {
        fileWatcher.stopWatching();
    }
    await sendWhatsAppMessage(from, '🛑 File watcher stopped.');
    return;
}

// ▶️ Start watcher
if (msgLower === 'start watcher') {
    if (fileWatcher.startWatching) {
        fileWatcher.startWatching();
    }
    await sendWhatsAppMessage(from, '▶️ File watcher started.');
    return;
}

// 🔄 Reset watcher
if (msgLower === 'reset watcher') {
    if (fileWatcher.reset) {
        fileWatcher.reset();
    }
    if (fileWatcher.startWatching) {
        fileWatcher.startWatching();
    }
    await sendWhatsAppMessage(from, '🔄 File watcher reset and restarted.');
    return;
            }
        // ============================================================
// 📁 JSON IMPORT COMMANDS
// ============================================================

// 1️⃣ IMPORT FULL BACKUP
if (isAdmin(from) && (msgLower === 'import backup' || msgLower === 'import all')) {
    try {
        await sendWhatsAppMessage(from, '🔄 Starting full backup import... This may take a few minutes.');
        
        const result = await importFullBackup();
        
        if (result.success) {
            let reply = `✅ *Full Backup Import Complete!*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
            reply += `👤 Customers: ${result.results.customers}\n`;
            reply += `🏢 Suppliers: ${result.results.suppliers}\n`;
            reply += `📦 Products: ${result.results.products}\n`;
            reply += `📄 Invoices: ${result.results.invoices}\n`;
            reply += `📥 Purchase Invoices: ${result.results.purchaseInvoices}\n`;
            reply += `💰 Customer Payments: ${result.results.customerPayments}\n`;
            reply += `💰 Supplier Payments: ${result.results.supplierPayments}\n`;
            reply += `👥 Users: ${result.results.users}\n\n`;
            reply += `✅ All data imported successfully!`;
            
            await sendWhatsAppMessage(from, reply);
        } else {
            await sendWhatsAppMessage(from, `❌ Import failed: ${result.error || result.message}`);
        }
        return;
    } catch (error) {
        await sendWhatsAppMessage(from, `❌ Import failed: ${error.message}`);
        return;
    }
}

// 2️⃣ IMPORT CUSTOMERS ONLY
if (isAdmin(from) && msgLower === 'import customers') {
    try {
        await sendWhatsAppMessage(from, '🔄 Importing customers...');
        
        const data = fs.readFileSync(JSON_STORAGE.fullBackup, 'utf8');
        const backup = JSON.parse(data);
        const customers = JSON.parse(backup.customers || '[]');
        
        const result = await importCustomersArray(customers);
        
        await sendWhatsAppMessage(from,
            `✅ *Customers Imported!*\n\n` +
            `👤 ${result} customers imported/updated\n` +
            `🕐 ${new Date().toLocaleString()}`
        );
        return;
    } catch (error) {
        await sendWhatsAppMessage(from, `❌ Import failed: ${error.message}`);
        return;
    }
}

// 3️⃣ IMPORT SUPPLIERS ONLY
if (isAdmin(from) && msgLower === 'import suppliers') {
    try {
        await sendWhatsAppMessage(from, '🔄 Importing suppliers...');
        
        const data = fs.readFileSync(JSON_STORAGE.fullBackup, 'utf8');
        const backup = JSON.parse(data);
        const suppliers = JSON.parse(backup.suppliers || '[]');
        
        const result = await importSuppliersArray(suppliers);
        
        await sendWhatsAppMessage(from,
            `✅ *Suppliers Imported!*\n\n` +
            `🏢 ${result} suppliers imported/updated\n` +
            `🕐 ${new Date().toLocaleString()}`
        );
        return;
    } catch (error) {
        await sendWhatsAppMessage(from, `❌ Import failed: ${error.message}`);
        return;
    }
}

// 4️⃣ IMPORT PRODUCTS ONLY
if (isAdmin(from) && msgLower === 'import products') {
    try {
        await sendWhatsAppMessage(from, '🔄 Importing products...');
        
        const data = fs.readFileSync(JSON_STORAGE.fullBackup, 'utf8');
        const backup = JSON.parse(data);
        const products = JSON.parse(backup.products || '[]');
        
        const result = await importProductsArray(products);
        
        await sendWhatsAppMessage(from,
            `✅ *Products Imported!*\n\n` +
            `📦 ${result} products imported/updated\n` +
            `🕐 ${new Date().toLocaleString()}`
        );
        return;
    } catch (error) {
        await sendWhatsAppMessage(from, `❌ Import failed: ${error.message}`);
        return;
    }
}

// 5️⃣ EXPORT DATA TO JSON
if (isAdmin(from) && msgLower === 'export all') {
    try {
        await sendWhatsAppMessage(from, '🔄 Exporting all data to JSON...');
        
        const exports = {};
        
        // Export Customers from 'customers' table
        const customers = await new Promise((resolve) => {
            db.db.all(`SELECT * FROM customers`, [], (err, rows) => {
                if (err) {
                    console.error('❌ Export customers error:', err.message);
                    resolve([]);
                } else {
                    resolve(rows || []);
                }
            });
        });
        exports.customers = customers;
        fs.writeFileSync(JSON_STORAGE.customers, JSON.stringify(customers, null, 2));
        console.log(`👤 Exported ${customers.length} customers`);
        
        // Export Suppliers from 'suppliers' table
        const suppliers = await new Promise((resolve) => {
            db.db.all(`SELECT * FROM suppliers`, [], (err, rows) => {
                if (err) {
                    console.error('❌ Export suppliers error:', err.message);
                    resolve([]);
                } else {
                    resolve(rows || []);
                }
            });
        });
        exports.suppliers = suppliers;
        fs.writeFileSync(JSON_STORAGE.suppliers, JSON.stringify(suppliers, null, 2));
        console.log(`🏢 Exported ${suppliers.length} suppliers`);
        
        // Export Products
        const products = await new Promise((resolve) => {
            db.db.all(`SELECT * FROM products`, [], (err, rows) => {
                if (err) {
                    console.error('❌ Export products error:', err.message);
                    resolve([]);
                } else {
                    resolve(rows || []);
                }
            });
        });
        exports.products = products;
        fs.writeFileSync(JSON_STORAGE.products, JSON.stringify(products, null, 2));
        console.log(`📦 Exported ${products.length} products`);
        
        await sendWhatsAppMessage(from,
            `✅ *Data Exported!*\n\n` +
            `📁 Location: /data/\n` +
            `👤 Customers: ${customers.length}\n` +
            `🏢 Suppliers: ${suppliers.length}\n` +
            `📦 Products: ${products.length}\n\n` +
            `💡 Files saved to data directory.`
        );
        return;
    } catch (error) {
        console.error('❌ Export error:', error.message);
        await sendWhatsAppMessage(from, `❌ Export failed: ${error.message}`);
        return;
    }
}
// 6️⃣ CHECK IMPORT STATUS
if (isAdmin(from) && (msgLower === 'import status' || msgLower === 'data status')) {
    try {
        const stats = await db.getStats();
        const customerCount = await new Promise((resolve) => {
            db.db.get(`SELECT COUNT(*) as count FROM customer_master`, [], (err, row) => {
                resolve(row?.count || 0);
            });
        });
        const supplierCount = await new Promise((resolve) => {
            db.db.get(`SELECT COUNT(*) as count FROM supplier_master`, [], (err, row) => {
                resolve(row?.count || 0);
            });
        });
        const invoiceCount = await new Promise((resolve) => {
            db.db.get(`SELECT COUNT(*) as count FROM order_master`, [], (err, row) => {
                resolve(row?.count || 0);
            });
        });
        const purchaseCount = await new Promise((resolve) => {
            db.db.get(`SELECT COUNT(*) as count FROM purchase_invoices`, [], (err, row) => {
                resolve(row?.count || 0);
            });
        });
        
        // Check if backup file exists
        const backupExists = fs.existsSync(JSON_STORAGE.fullBackup);
        const backupSize = backupExists ? (fs.statSync(JSON_STORAGE.fullBackup).size / 1024).toFixed(1) : 0;
        
        await sendWhatsAppMessage(from,
            `📊 *Import Status*\n━━━━━━━━━━━━━━━━━━━━\n\n` +
            `📦 Products: ${stats.total_products || 0}\n` +
            `👤 Customers: ${customerCount}\n` +
            `🏢 Suppliers: ${supplierCount}\n` +
            `📄 Invoices: ${invoiceCount}\n` +
            `📥 Purchase Invoices: ${purchaseCount}\n` +
            `📁 Backup File: ${backupExists ? '✅ Yes' : '❌ No'} (${backupSize}KB)\n` +
            `📁 Data Dir: ${dataDir}\n\n` +
            `📝 Commands:\n` +
            `   "import backup" - Full import\n` +
            `   "import customers" - Customers only\n` +
            `   "import suppliers" - Suppliers only\n` +
            `   "import products" - Products only\n` +
            `   "export all" - Export to JSON`
        );
        return;
    } catch (error) {
        await sendWhatsAppMessage(from, `❌ Error: ${error.message}`);
        return;
    }
}
        // ============================================================
// 👤 CUSTOMER DETAILS COMMAND (Admin Only)
// ============================================================

if (isAdmin(from) && msgLower.startsWith('customer details')) {
    try {
        const phone = cleaned.replace(/customer details/i, '').trim();
        if (!phone) {
            await sendWhatsAppMessage(from, '📝 Format: "Customer details 9876543210"');
            return;
        }
        
        console.log(`🔍 Looking for customer: ${phone}`);
        const customer = await getCustomerByPhone(phone);
        
        if (!customer) {
            await sendWhatsAppMessage(from, `❌ No customer found with phone: ${phone}`);
            return;
        }
        
        const stats = await getCustomerStats(phone);
        const orders = await getCustomerOrderHistory(phone, 5);
        
        let reply = `👤 *Customer Profile*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
        reply += `👤 Name: ${customer.name || 'N/A'}\n`;
        reply += `📞 Phone: ${customer.phone}\n`;
        reply += `📧 Email: ${customer.email || 'N/A'}\n`;
        reply += `🏢 Company: ${customer.company_name || customer.business || 'N/A'}\n`;
        reply += `📍 Address: ${customer.address || 'N/A'}\n`;
        reply += `🏙️ City: ${customer.city || customer.district || 'N/A'}\n`;
        reply += `📌 Pincode: ${customer.pincode || 'N/A'}\n`;
        reply += `📋 Type: ${customer.customer_type || customer.type || 'retail'}\n`;
        reply += `📊 Status: ${customer.status || 'Active'}\n\n`;
        reply += `📊 *Order Statistics*\n`;
        reply += `📦 Total Orders: ${stats.total_orders || 0}\n`;
        reply += `💰 Total Spent: ₹${(stats.total_spent || 0).toFixed(2)}\n`;
        reply += `💳 Avg Order: ₹${(stats.avg_order_value || 0).toFixed(2)}\n`;
        reply += `📅 Last Order: ${stats.last_order_date ? new Date(stats.last_order_date).toLocaleDateString() : 'Never'}\n`;
        
        if (orders && orders.length > 0) {
            reply += `\n📋 *Recent Orders:*\n`;
            orders.slice(0, 3).forEach((order, i) => {
                reply += `${i + 1}. ${order.order_id || order.id} - ₹${(order.total_amount || order.total || 0).toFixed(2)} (${order.order_status || order.status || 'N/A'})\n`;
            });
        }
        
        await sendWhatsAppMessage(from, reply);
        return;
    } catch (error) {
        console.error('❌ Customer details error:', error.message);
        await sendWhatsAppMessage(from, `❌ Error: ${error.message}`);
        return;
    }
}

// ============================================================
// 📋 LIST CUSTOMERS COMMAND (Admin Only)
// ============================================================

if (isAdmin(from) && (msgLower === 'list customers' || msgLower === 'customers list')) {
    try {
        const customers = await getAllCustomers(20);
        
        if (customers.length === 0) {
            await sendWhatsAppMessage(from, '📋 No customers found.');
            return;
        }
        
        let reply = `👥 *Customer List (${customers.length})*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
        customers.forEach((c, i) => {
            reply += `${i + 1}. ${c.name || 'Unknown'} (${c.phone})\n`;
            reply += `   📍 ${c.city || 'N/A'} | 📌 ${c.pincode || 'N/A'}\n`;
            reply += `   📊 ${c.status || 'Active'} | 📦 ${c.total_orders || 0} orders\n\n`;
        });
        
        reply += `📝 To see details: "Customer details [phone]"`;
        await sendWhatsAppMessage(from, reply);
        return;
    } catch (error) {
        console.error('❌ List customers error:', error.message);
        await sendWhatsAppMessage(from, `❌ Error: ${error.message}`);
        return;
    }
}

// ============================================================
// 📋 LIST SUPPLIERS COMMAND (Admin Only)
// ============================================================

if (isAdmin(from) && (msgLower === 'list suppliers' || msgLower === 'suppliers list')) {
    try {
        const suppliers = await getAllSuppliers();
        
        if (suppliers.length === 0) {
            await sendWhatsAppMessage(from, '📋 No suppliers found.');
            return;
        }
        
        let reply = `🏢 *Supplier List (${suppliers.length})*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
        suppliers.forEach((s, i) => {
            reply += `${i + 1}. ${s.name || 'Unknown'} (${s.phone})\n`;
            reply += `   📍 ${s.address || 'N/A'}\n`;
            reply += `   📊 ${s.status || 'Active'}\n\n`;
        });
        
        await sendWhatsAppMessage(from, reply);
        return;
    } catch (error) {
        console.error('❌ List suppliers error:', error.message);
        await sendWhatsAppMessage(from, `❌ Error: ${error.message}`);
        return;
    }
}
        // ============================================================
// 📋 LIST CUSTOMER PAYMENTS COMMAND (Admin Only)
// ============================================================

if (isAdmin(from) && (msgLower === 'customer payments' || msgLower === 'payments list')) {
    try {
        const payments = await new Promise((resolve) => {
            db.db.all(
                `SELECT * FROM customer_payments ORDER BY payment_date DESC LIMIT 20`,
                [],
                (err, rows) => {
                    if (err) {
                        console.error('❌ Error fetching payments:', err.message);
                        resolve([]);
                    } else {
                        resolve(rows || []);
                    }
                }
            );
        });
        
        if (payments.length === 0) {
            await sendWhatsAppMessage(from, '📋 No customer payments found.');
            return;
        }
        
        let reply = `💰 *Customer Payments (${payments.length})*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
        payments.forEach((p, i) => {
            reply += `${i + 1}. ₹${(p.amount || 0).toFixed(2)} - ${p.customer_phone || 'N/A'}\n`;
            reply += `   📋 ${p.receipt_no || 'N/A'}\n`;
            reply += `   💳 ${p.payment_mode || 'Cash'}\n`;
            reply += `   🕐 ${p.payment_date ? new Date(p.payment_date).toLocaleDateString() : 'N/A'}\n\n`;
        });
        
        await sendWhatsAppMessage(from, reply);
        return;
    } catch (error) {
        console.error('❌ Customer payments error:', error.message);
        await sendWhatsAppMessage(from, `❌ Error: ${error.message}`);
        return;
    }
}

// ============================================================
// 📋 LIST SUPPLIER PAYMENTS COMMAND (Admin Only)
// ============================================================

if (isAdmin(from) && (msgLower === 'supplier payments' || msgLower === 'payments to suppliers')) {
    try {
        const payments = await new Promise((resolve) => {
            db.db.all(
                `SELECT * FROM supplier_payments ORDER BY payment_date DESC LIMIT 20`,
                [],
                (err, rows) => {
                    if (err) {
                        console.error('❌ Error fetching supplier payments:', err.message);
                        resolve([]);
                    } else {
                        resolve(rows || []);
                    }
                }
            );
        });
        
        if (payments.length === 0) {
            await sendWhatsAppMessage(from, '📋 No supplier payments found.');
            return;
        }
        
        let reply = `💰 *Supplier Payments (${payments.length})*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
        payments.forEach((p, i) => {
            reply += `${i + 1}. ₹${(p.amount || 0).toFixed(2)} - ${p.supplier_name || 'N/A'}\n`;
            reply += `   📋 ${p.payment_id || 'N/A'}\n`;
            reply += `   📝 ${p.payment_reference || 'N/A'}\n`;
            reply += `   🕐 ${p.payment_date ? new Date(p.payment_date).toLocaleDateString() : 'N/A'}\n\n`;
        });
        
        await sendWhatsAppMessage(from, reply);
        return;
    } catch (error) {
        console.error('❌ Supplier payments error:', error.message);
        await sendWhatsAppMessage(from, `❌ Error: ${error.message}`);
        return;
    }
}

// ============================================================
// 📋 LIST INVOICES COMMAND (Admin Only)
// ============================================================

if (isAdmin(from) && (msgLower === 'list invoices' || msgLower === 'invoices list')) {
    try {
        const invoices = await new Promise((resolve) => {
            db.db.all(
                `SELECT * FROM sales_invoices ORDER BY invoice_date DESC LIMIT 20`,
                [],
                (err, rows) => {
                    if (err) {
                        console.error('❌ Error fetching invoices:', err.message);
                        resolve([]);
                    } else {
                        resolve(rows || []);
                    }
                }
            );
        });
        
        if (invoices.length === 0) {
            await sendWhatsAppMessage(from, '📋 No invoices found.');
            return;
        }
        
        let reply = `📄 *Invoices (${invoices.length})*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
        invoices.forEach((inv, i) => {
            reply += `${i + 1}. ${inv.invoice_no || 'N/A'}\n`;
            reply += `   👤 ${inv.customer_name || 'N/A'}\n`;
            reply += `   💰 ₹${(inv.grand_total || 0).toFixed(2)}\n`;
            reply += `   📊 ${inv.status || 'Pending'}\n`;
            reply += `   🕐 ${inv.invoice_date ? new Date(inv.invoice_date).toLocaleDateString() : 'N/A'}\n\n`;
        });
        
        await sendWhatsAppMessage(from, reply);
        return;
    } catch (error) {
        console.error('❌ List invoices error:', error.message);
        await sendWhatsAppMessage(from, `❌ Error: ${error.message}`);
        return;
    }
}

// ============================================================
// 📋 LIST PURCHASE INVOICES COMMAND (Admin Only)
// ============================================================

if (isAdmin(from) && (msgLower === 'purchase invoices' || msgLower === 'list purchase invoices')) {
    try {
        const invoices = await new Promise((resolve) => {
            db.db.all(
                `SELECT * FROM purchase_invoices ORDER BY invoice_date DESC LIMIT 20`,
                [],
                (err, rows) => {
                    if (err) {
                        console.error('❌ Error fetching purchase invoices:', err.message);
                        resolve([]);
                    } else {
                        resolve(rows || []);
                    }
                }
            );
        });
        
        if (invoices.length === 0) {
            await sendWhatsAppMessage(from, '📋 No purchase invoices found.');
            return;
        }
        
        let reply = `📥 *Purchase Invoices (${invoices.length})*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
        invoices.forEach((inv, i) => {
            reply += `${i + 1}. ${inv.invoice_no || 'N/A'}\n`;
            reply += `   🏢 ${inv.supplier_name || 'N/A'}\n`;
            reply += `   💰 ₹${(inv.total_amount || 0).toFixed(2)}\n`;
            reply += `   📊 ${inv.payment_status || 'Pending'}\n`;
            reply += `   🕐 ${inv.invoice_date ? new Date(inv.invoice_date).toLocaleDateString() : 'N/A'}\n\n`;
        });
        
        await sendWhatsAppMessage(from, reply);
        return;
    } catch (error) {
        console.error('❌ List purchase invoices error:', error.message);
        await sendWhatsAppMessage(from, `❌ Error: ${error.message}`);
        return;
    }
}

// ============================================================
// 📋 LIST DELETED INVOICES COMMAND (Admin Only)
// ============================================================

if (isAdmin(from) && (msgLower === 'deleted invoices' || msgLower === 'list deleted invoices')) {
    try {
        const deleted = await new Promise((resolve) => {
            db.db.all(
                `SELECT * FROM deleted_invoice_numbers ORDER BY deleted_at DESC LIMIT 20`,
                [],
                (err, rows) => {
                    if (err) {
                        console.error('❌ Error fetching deleted invoices:', err.message);
                        resolve([]);
                    } else {
                        resolve(rows || []);
                    }
                }
            );
        });
        
        if (deleted.length === 0) {
            await sendWhatsAppMessage(from, '📋 No deleted invoices found.');
            return;
        }
        
        let reply = `🗑️ *Deleted Invoices (${deleted.length})*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
        deleted.forEach((d, i) => {
            reply += `${i + 1}. ${d.invoice_type || 'N/A'} - ${d.invoice_number || 'N/A'}\n`;
            reply += `   📅 ${d.fin_year || 'N/A'}\n`;
            reply += `   🕐 ${d.deleted_at ? new Date(d.deleted_at).toLocaleDateString() : 'N/A'}\n\n`;
        });
        
        await sendWhatsAppMessage(from, reply);
        return;
    } catch (error) {
        console.error('❌ List deleted invoices error:', error.message);
        await sendWhatsAppMessage(from, `❌ Error: ${error.message}`);
        return;
    }
}

// ============================================================
// 📋 LIST USER PAYMENTS COMMAND (Admin Only)
// ============================================================

if (isAdmin(from) && (msgLower === 'all payments' || msgLower === 'payments summary')) {
    try {
        // Get customer payments
        const customerPayments = await new Promise((resolve) => {
            db.db.all(
                `SELECT COUNT(*) as count, SUM(amount) as total FROM customer_payments`,
                [],
                (err, rows) => resolve(rows[0] || { count: 0, total: 0 })
            );
        });
        
        // Get supplier payments
        const supplierPayments = await new Promise((resolve) => {
            db.db.all(
                `SELECT COUNT(*) as count, SUM(amount) as total FROM supplier_payments`,
                [],
                (err, rows) => resolve(rows[0] || { count: 0, total: 0 })
            );
        });
        
        let reply = `💰 *Payments Summary*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
        reply += `👤 *Customer Payments*\n`;
        reply += `   📦 Count: ${customerPayments.count || 0}\n`;
        reply += `   💰 Total: ₹${(customerPayments.total || 0).toFixed(2)}\n\n`;
        reply += `🏢 *Supplier Payments*\n`;
        reply += `   📦 Count: ${supplierPayments.count || 0}\n`;
        reply += `   💰 Total: ₹${(supplierPayments.total || 0).toFixed(2)}\n\n`;
        reply += `📝 Commands:\n`;
        reply += `   "customer payments" - View customer payments\n`;
        reply += `   "supplier payments" - View supplier payments\n`;
        reply += `   "list invoices" - View sales invoices\n`;
        reply += `   "purchase invoices" - View purchase invoices\n`;
        reply += `   "deleted invoices" - View deleted invoices`;
        
        await sendWhatsAppMessage(from, reply);
        return;
    } catch (error) {
        console.error('❌ Payments summary error:', error.message);
        await sendWhatsAppMessage(from, `❌ Error: ${error.message}`);
        return;
    }
}
        // ============================================================
        // 1️⃣ WELCOME / HELP
        // ============================================================
        if (['hi', 'hello', 'help', 'start', 'menu'].includes(msgLower)) {
            await sendWelcomeWithAllBrands(from);
            return;
        }

        // ============================================================
        // 2️⃣ CONFIRM ORDER
        // ============================================================
        if (msgLower === 'confirm order' || msgLower === 'confirm') {
            console.log(`🛒 Customer confirming order: ${from}`);
            
            const cart = await db.getCart(from);
            if (cart && cart.items) {
                const items = JSON.parse(cart.items);
                
                if (items.length === 0) {
                    await sendWhatsAppMessage(from, '🛒 Your cart is empty. Add items first!');
                    return;
                }
                
                const outOfStockItems = items
                    .filter(item => item.stock === 0 || item.stock === undefined)
                    .map(item => item.part);
                
                const notFoundItems = items
                    .filter(item => item.requestedPart && item.requestedPart !== item.part)
                    .map(item => item.requestedPart);
                
                const orderId = `ORD-${Date.now().toString().slice(-6)}`;
                await db.saveOrder(orderId, from, items, cart.total);
                await db.clearCart(from);
                
                await alertSystem.sendOrderConfirmation(from, orderId, items, cart.total, outOfStockItems, notFoundItems);
                await alertSystem.sendNewOrderAlert(orderId, from, items, cart.total);
                
                return;
            }
            await sendWhatsAppMessage(from, '🛒 Your cart is empty. Add items first!');
            return;
        }

        // ============================================================
        // 3️⃣ CLEAR CART
        // ============================================================
        if (msgLower === 'clear cart' || msgLower === 'clear') {
            await db.clearCart(from);
            await sendWhatsAppMessage(from, '🗑️ Cart cleared!');
            return;
        }

        // ============================================================
        // 4️⃣ DOWNLOAD EXCEL
        // ============================================================
        if (msgLower === 'download excel' || msgLower === 'excel') {
            try {
                const lastOrder = await db.getLastOrder(from);
                if (lastOrder) {
                    const items = JSON.parse(lastOrder.items);
                    const excelBuffer = await generateExcelSummary(lastOrder.order_id, items, lastOrder.total, from);
                    if (excelBuffer) {
                        await sendDocumentMessage(from, excelBuffer, `${lastOrder.order_id}_Summary.xlsx`, 
                            `📊 Order Summary - ${lastOrder.order_id}`);
                    } else {
                        await sendWhatsAppMessage(from, 
                            `⚠️ *Could not generate Excel.*\n\n` +
                            `💡 Please try again later.\n` +
                            `📞 Call: ${CONFIG.businessPhone}`
                        );
                    }
                } else {
                    await sendWhatsAppMessage(from, '⚠️ No recent order found.');
                }
            } catch (error) {
                console.error('❌ Excel download error:', error.message);
                await sendWhatsAppMessage(from, 
                    `⚠️ *Could not generate Excel.*\n\n` +
                    `Error: ${error.message}\n` +
                    `📞 Call: ${CONFIG.businessPhone}`
                );
            }
            return;
        }

        // ============================================================
        // 5️⃣ DOWNLOAD PDF
        // ============================================================
        if (msgLower === 'download pdf' || msgLower === 'pdf') {
            try {
                console.log(`📄 PDF download requested by ${from}`);
                const lastOrder = await db.getLastOrder(from);
                if (lastOrder) {
                    const items = JSON.parse(lastOrder.items);
                    const pdfBuffer = await generatePDFSummary(lastOrder.order_id, items, lastOrder.total, from);
                    if (pdfBuffer) {
                        await sendDocumentMessage(from, pdfBuffer, `${lastOrder.order_id}_Summary.pdf`,
                            `📄 Order Summary - ${lastOrder.order_id}`);
                    } else {
                        console.log(`📄 PDF generation failed, trying Excel fallback...`);
                        const excelBuffer = await generateExcelSummary(lastOrder.order_id, items, lastOrder.total, from);
                        if (excelBuffer) {
                            await sendWhatsAppMessage(from, 
                                `⚠️ *PDF generation failed, but Excel is available.*\n\n` +
                                `📊 Sending Excel instead...`
                            );
                            await sendDocumentMessage(from, excelBuffer, `${lastOrder.order_id}_Summary.xlsx`, 
                                `📊 Order Summary - ${lastOrder.order_id}`);
                        } else {
                            await sendWhatsAppMessage(from, 
                                `⚠️ *Could not generate PDF or Excel.*\n\n` +
                                `💡 Please try again later.\n` +
                                `📞 Call: ${CONFIG.businessPhone}`
                            );
                        }
                    }
                } else {
                    await sendWhatsAppMessage(from, '⚠️ No recent order found.');
                }
            } catch (error) {
                console.error('❌ PDF download error:', error.message);
                await sendWhatsAppMessage(from, 
                    `⚠️ *Could not generate PDF.*\n\n` +
                    `Error: ${error.message}\n` +
                    `💡 Please try "Download Excel" instead.\n` +
                    `📞 Call: ${CONFIG.businessPhone}`
                );
            }
            return;
        }

        // ============================================================
        // 🔍 STEP 2: PART NUMBER EXTRACTION
        // ============================================================
        
        // 6️⃣ Multi-product check
        const allParts = text.match(/\b[A-Z0-9]{5,20}\b/gi);
        const uniqueParts = allParts ? [...new Set(allParts.map(p => p.toUpperCase()))] : [];
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        const hasMultipleParts = uniqueParts.length > 1;
        const hasMultipleLines = lines.length > 1;
        const separatorParts = text.match(/[A-Z0-9]{5,20}\s*[-/xX:]\s*\d+/gi);
        const hasMultipleSeparatorParts = separatorParts && separatorParts.length > 1;
        const isMultiProduct = hasMultipleParts || hasMultipleLines || hasMultipleSeparatorParts;

        console.log(`📋 Multi-product check: parts=${uniqueParts.length}, lines=${lines.length}`);

        if (isMultiProduct) {
            console.log(`📋 Processing multi-product enquiry...`);
            
            const parsedResult = parseOrder(text);
            const items = parsedResult.items;
            
            console.log(`📦 Parsed ${items.length} items`);
            
            if (items.length === 0) {
                console.log(`⚠️ No items parsed from multi-product input`);
                await sendWhatsAppMessage(from, 
                    `⚠️ *Couldn't parse your order.*\n\n` +
                    `💡 Please use format: PART-QUANTITY\n` +
                    `📝 Example: 0801BA0285N-2\n` +
                    `📞 Call: ${CONFIG.businessPhone}`
                );
                return;
            }
            
            let foundItems = [];
            let notFound = [];
            let outOfStock = [];
            let total = 0;
            
            const searchPromises = items.map(async (item) => {
                let product = await db.getProductExact(item.part.toUpperCase());
                if (!product) {
                    const results = await db.searchProducts(item.part, 1);
                    if (results && results.length > 0) {
                        product = results[0];
                    }
                }
                return { item, product };
            });
            
            const results = await Promise.all(searchPromises);
            
            for (const { item, product } of results) {
                if (product) {
                    const billingPrice = product.billing_price || product.list_price || 0;
                    const priceWithGST = billingPrice * 1.18;
                    
                    foundItems.push({
                        part: product.part,
                        requestedPart: item.part,
                        description: product.description,
                        qty: item.qty || 1,
                        price: priceWithGST,
                        list_price: product.list_price,
                        mrp: product.mrp,
                        billing_price: billingPrice,
                        stock: product.stock,
                        brand: product.brand,
                        make: product.make,
                        model: product.model
                    });
                    
                    total += priceWithGST * (item.qty || 1);
                    
                    if (product.stock === 0) {
                        outOfStock.push(product.part);
                        await alertSystem.sendOutOfStockAlert(from, product.part, product.description);
                        try {
                            await customerLog.trackOutOfStock(from, product.part, product.description, item.qty || 1);
                        } catch (trackError) {
                            console.error('⚠️ Track error (non-critical):', trackError.message);
                        }
                    }
                } else {
                    notFound.push(item.part);
                }
            }
            
            if (foundItems.length === 0) {
                let reply = `❌ *No products found*\n\n`;
                if (notFound.length > 0) {
                    reply += `Not found: ${notFound.join(', ')}\n\n`;
                }
                reply += `💡 Please check the part numbers.\n`;
                reply += `📞 Call: ${CONFIG.businessPhone}`;
                await sendWhatsAppMessage(from, reply);
                return;
            }
            
            const cartItems = foundItems.map(item => ({
                part: item.part,
                description: item.description,
                qty: item.qty,
                price: item.price,
                list_price: item.list_price,
                mrp: item.mrp,
                billing_price: item.billing_price,
                stock: item.stock,
                requestedPart: item.requestedPart || item.part
            }));
            
            await db.saveCart(from, cartItems, total, total);
            
            let reply = `🛒 *ORDER SUMMARY*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
            
            for (const item of foundItems) {
                const itemTotal = item.price * item.qty;
                reply += `*${item.part}*`;
                if (item.requestedPart && item.requestedPart !== item.part) {
                    reply += ` (matched: ${item.requestedPart})`;
                }
                reply += ` x${item.qty}\n`;
                reply += `📝 ${item.description}\n`;
                if (item.list_price > 0) reply += `💰 LIST PRICE: ₹${item.list_price.toFixed(2)}\n`;
                if (item.mrp > 0) reply += `💰 MRP PRICE: ₹${item.mrp.toFixed(2)}\n`;
                reply += `💳 ₹${item.price.toFixed(2)} × ${item.qty} = ₹${itemTotal.toFixed(2)}\n`;
                reply += `📦 ${item.stock > 0 ? `✅ ${item.stock} pcs available` : '❌ Out of Stock'}\n\n`;
            }
            
            reply += `━━━━━━━━━━━━━━━━━━━━\n`;
            reply += `💰 *Total: ₹${total.toFixed(2)}* (incl. GST)\n`;
            reply += `━━━━━━━━━━━━━━━━━━━━\n\n`;
            
            if (outOfStock.length > 0) {
                reply += `⚠️ *Out of Stock:* ${outOfStock.join(', ')}\n`;
                reply += `🔔 We'll notify you when available.\n\n`;
            }
            
            if (notFound.length > 0) {
                reply += `❌ *Not found:* ${notFound.join(', ')}\n\n`;
            }
            
            reply += `✅ *Confirm order?* Reply "Confirm Order"\n`;
            reply += `🗑️ *Clear Cart* - Start fresh\n\n`;
            reply += `📞 Call: ${CONFIG.businessPhone}`;
            
            await sendWhatsAppMessage(from, reply);
            return;
        }

        // 7️⃣ Part number with quantity
        const partWithQty = cleaned.match(/\b([A-Z0-9]{5,20})\s*(\d+)\b/);
        if (partWithQty) {
            const partNumber = partWithQty[1];
            const quantity = parseInt(partWithQty[2]);
            console.log(`🔍 Part with quantity: ${partNumber} x${quantity}`);
            
            const exactProduct = await db.getProductExact(partNumber);
            if (exactProduct) {
                const billingPrice = exactProduct.billing_price || exactProduct.list_price || 0;
                const priceWithGST = billingPrice * 1.18;
                const total = priceWithGST * quantity;
                
                const cart = await db.getCart(from);
                let cartItems = [];
                let cartTotal = 0;
                
                if (cart && cart.items) {
                    cartItems = JSON.parse(cart.items);
                    cartTotal = cart.total || 0;
                }
                
                const newItem = {
                    part: exactProduct.part,
                    description: exactProduct.description,
                    qty: quantity,
                    price: priceWithGST,
                    list_price: exactProduct.list_price,
                    mrp: exactProduct.mrp,
                    billing_price: billingPrice,
                    stock: exactProduct.stock,
                    requestedPart: partNumber
                };
                
                cartItems.push(newItem);
                cartTotal += total;
                
                await db.saveCart(from, cartItems, cartTotal, cartTotal);
                
                let reply = `🛒 *ADDED TO CART*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
                reply += `*${exactProduct.part}* x${quantity}\n`;
                reply += `📝 ${exactProduct.description}\n`;
                if (exactProduct.list_price > 0) reply += `💰 LIST PRICE: ₹${exactProduct.list_price.toFixed(2)}\n`;
                if (exactProduct.mrp > 0) reply += `💰 MRP PRICE: ₹${exactProduct.mrp.toFixed(2)}\n`;
                reply += `💳 ₹${priceWithGST.toFixed(2)} × ${quantity} = ₹${total.toFixed(2)}\n\n`;
                reply += `━━━━━━━━━━━━━━━━━━━━\n`;
                reply += `💰 *Cart Total: ₹${cartTotal.toFixed(2)}* (incl. GST)\n`;
                reply += `━━━━━━━━━━━━━━━━━━━━\n\n`;
                if (exactProduct.stock === 0) {
                    reply += `⚠️ Out of Stock\n🔔 We'll notify you when available.\n\n`;
                    await alertSystem.sendOutOfStockAlert(from, exactProduct.part, exactProduct.description);
                } else if (exactProduct.stock < quantity) {
                    reply += `⚠️ Only ${exactProduct.stock} available (requested ${quantity})\n\n`;
                }
                reply += `✅ *Confirm order?* Reply "Confirm Order"\n`;
                reply += `📞 Call: ${CONFIG.businessPhone}`;
                await sendWhatsAppMessage(from, reply);
                return;
            }
        }

        // 8️⃣ Exact part number only
        const exactPartMatch = cleaned.match(/^[A-Z0-9]{5,20}$/);
        if (exactPartMatch) {
            const partNumber = exactPartMatch[0];
            console.log(`🔍 Exact part number detected: ${partNumber}`);
            
            const exactProduct = await db.getProductExact(partNumber);
            if (exactProduct) {
                let reply = `🔍 *Exact Match Found*\n\n`;
                reply += formatProductForWhatsApp(exactProduct, 0);
                reply += `\n🛒 To order: "${exactProduct.part} 2"\n`;
                reply += `📞 Call: ${CONFIG.businessPhone}`;
                await sendWhatsAppMessage(from, reply);
                return;
            }
        }

        // 9️⃣ Part number from text
        const partOnly = cleaned.match(/\b([A-Z0-9]{5,20})\b/);
        if (partOnly) {
            const partNumber = partOnly[1];
            console.log(`🔍 Part number only: ${partNumber}`);
            
            const exactProduct = await db.getProductExact(partNumber);
            if (exactProduct) {
                let reply = `🔍 *Product Found*\n\n`;
                reply += formatProductForWhatsApp(exactProduct, 0);
                reply += `\n🛒 To order: "${exactProduct.part} 2"\n`;
                reply += `📞 Call: ${CONFIG.businessPhone}`;
                await sendWhatsAppMessage(from, reply);
                return;
            }
        }

        // 🔟 Price Check
        if (msgLower.includes('price') || msgLower.includes('cost') || msgLower.includes('rate')) {
            const partNumber = extractPartNumber(cleaned);
            if (partNumber) {
                let product = await db.getProductExact(partNumber);
                if (!product) product = await db.getProduct(partNumber);
                if (product) {
                    const listPrice = product.list_price || 0;
                    const mrpPrice = product.mrp || 0;
                    const billingPrice = product.billing_price || 0;
                    const priceWithGST = billingPrice * 1.18;
                    
                    let reply = `💰 *Price: ${product.part}*\n\n`;
                    reply += `📝 ${product.description || 'N/A'}\n`;
                    if (product.brand) reply += `🏷️ Brand: ${product.brand}\n`;
                    if (product.make) reply += `🚗 Make: ${product.make}\n`;
                    if (product.model) reply += `🎯 Model: ${product.model}\n`;
                    reply += `\n`;
                    if (listPrice > 0) reply += `💰 LIST PRICE: ₹${listPrice.toFixed(2)}\n`;
                    if (mrpPrice > 0) reply += `💰 MRP PRICE: ₹${mrpPrice.toFixed(2)}\n`;
                    if (billingPrice > 0) {
                        reply += `💳 Billing Price: ₹${billingPrice.toFixed(2)}\n`;
                        reply += `💳 Price incl. GST: ₹${priceWithGST.toFixed(2)}\n`;
                    }
                    reply += `\n📦 ${product.stock > 0 ? `✅ ${product.stock} pcs available` : '❌ Out of Stock'}`;
                    await sendWhatsAppMessage(from, reply);
                    return;
                }
            }
        }

        // 1️⃣1️⃣ Stock Check
        if (msgLower.includes('stock') || msgLower.includes('available')) {
            const partNumber = extractPartNumber(cleaned);
            if (partNumber) {
                let product = await db.getProductExact(partNumber);
                if (!product) product = await db.getProduct(partNumber);
                if (product) {
                    let reply = `📦 *Stock: ${product.part}*\n\n`;
                    reply += `📝 ${product.description || 'N/A'}\n`;
                    reply += `📦 ${product.stock > 0 ? `✅ ${product.stock} pcs available` : '❌ Out of Stock'}`;
                    await sendWhatsAppMessage(from, reply);
                    return;
                }
            }
        }

        // 1️⃣2️⃣ Search Products
        if (cleaned.length >= 2) {
            const commonWords = ['i', 'need', 'want', 'for', 'my', 'the', 'a', 'an', 'me', 'please', 'from', 'to', 'of', 'with', 'have', 'has', 'is', 'are', 'was', 'were', 'and', 'or', 'but'];
            let searchWords = cleaned.toLowerCase().split(' ').filter(w => !commonWords.includes(w) && w.length > 1).join(' ');
            if (!searchWords) searchWords = cleaned;

            console.log(`🔍 Searching for: "${searchWords}"`);

            let results = await optimizedSearch(searchWords, 10);

            if (results.length === 0) {
                console.log(`🔄 No results, trying word-by-word search...`);
                const words = cleaned.split(' ').filter(w => w.length > 2 && !commonWords.includes(w.toLowerCase()));
                const searchPromises = words.map(word => optimizedSearch(word, 3));
                const allResults = await Promise.all(searchPromises);
                for (const res of allResults) {
                    if (res.length > 0) {
                        results = res;
                        break;
                    }
                }
            }

            if (results.length > 0) {
                let reply = `🔍 Found ${results.length} result(s) for "${cleaned}"\n\n`;
                results.slice(0, 5).forEach((p, i) => {
                    reply += formatProductForWhatsApp(p, i);
                    reply += `\n`;
                });
                if (results.length > 5) {
                    reply += `... and ${results.length - 5} more\n\n`;
                }
                reply += `🛒 To order: Send part number with quantity\n`;
                reply += `📞 Call: ${CONFIG.businessPhone}`;
                await sendWhatsAppMessage(from, reply);
                return;
            }
        }

        // 1️⃣3️⃣ Gemini Fallback
        console.log(`🔄 No product found. Trying Gemini...`);
        const geminiReply = await withTimeout(
            getGeminiWebSearch(cleaned),
            10000,
            'Gemini web search timed out'
        );
        if (geminiReply) {
            await sendWhatsAppMessage(from, `🤖 ${geminiReply}`);
            return;
        }

        // 1️⃣4️⃣ No Results
        await sendWhatsAppMessage(from, 
            `🔍 No results for "${text}"\n\n` +
            `💡 Try sending a part number like "0801BA0285N"\n` +
            `💡 Or send a description like "clutch plate"\n` +
            `💡 Or send "Help" for options\n\n📞 Call: ${CONFIG.businessPhone}`
        );

    } catch (error) {
        console.error(`❌ Message handler error: ${error.message}`);
        console.error(error.stack);
        await sendWhatsAppMessage(from, '⚠️ Sorry, something went wrong. Please try again.');
    }
}

// ============================================================
// 📍 HANDLE LOCATION MESSAGE
// ============================================================

async function handleLocationMessage(message, from) {
    try {
        const location = message.location;
        console.log(`📍 Location received from ${from}: ${location.latitude}, ${location.longitude}`);
        await sendWhatsAppMessage(from, 
            `📍 *Location Received!*\n\n✅ Your location has been recorded.\n\n📞 Call: ${CONFIG.businessPhone}`
        );
    } catch (error) {
        console.error(`❌ Location handler error:`, error.message);
    }
}

// ============================================================
// 📄 DOCUMENT MESSAGE HANDLER
// ============================================================

async function handleDocumentMessage(message, from) {
    try {
        const doc = message.document;
        const filename = doc.filename || 'document.pdf';
        const mimeType = doc.mime_type || '';
        const docId = doc.id;
        
        console.log(`📁 Processing document from ${from}: ${filename}`);
        
        const isExcel = mimeType.includes('spreadsheet') || 
                       mimeType.includes('excel') || 
                       filename.endsWith('.xlsx') || 
                       filename.endsWith('.xls') || 
                       filename.endsWith('.csv');
        const isPDF = mimeType === 'application/pdf' || filename.endsWith('.pdf');
        const isImage = mimeType.startsWith('image/');
        
        if (!isExcel && !isPDF && !isImage) {
            await sendWhatsAppMessage(from, 
                `📁 *Document Received!*\n\n` +
                `We process Excel, PDF, and Image files for bulk orders.\n\n` +
                `📞 Call: ${CONFIG.businessPhone}`
            );
            return;
        }
        
        await sendWhatsAppMessage(from, 
            `📄 *Processing Your Document...*\n\n` +
            `⏳ Please wait...\n\n` +
            `📁 File: ${filename}`
        );
        
        const fileBuffer = await withTimeout(
            downloadMediaWithToken(docId),
            15000,
            'Document download timed out'
        );
        console.log(`📥 File downloaded: ${fileBuffer.length} bytes`);
        
        let extractedItems = [];
        
        if (isExcel && XLSX) {
            console.log(`📊 Processing Excel file: ${filename}`);
            
            try {
                const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
                
                console.log(`📊 Found ${jsonData.length} rows in Excel`);
                
                let partCol = -1;
                let qtyCol = -1;
                let headerRow = -1;
                
                for (let i = 0; i < Math.min(jsonData.length, 20); i++) {
                    const row = jsonData[i];
                    if (!row || row.length === 0) continue;
                    
                    const rowStr = row.join(' ').toLowerCase();
                    if (rowStr.includes('prt') || rowStr.includes('part') || 
                        rowStr.includes('no') || rowStr.includes('code') ||
                        rowStr.includes('sku') || rowStr.includes('item') ||
                        rowStr.includes('qty') || rowStr.includes('quantity')) {
                        
                        headerRow = i;
                        for (let j = 0; j < row.length; j++) {
                            const cell = String(row[j] || '').toLowerCase();
                            if (cell.includes('prt') || cell.includes('part') || 
                                cell.includes('no') || cell.includes('code') || 
                                cell.includes('sku') || cell.includes('item') ||
                                cell.includes('material')) {
                                if (partCol === -1) partCol = j;
                            }
                            if (cell.includes('qty') || cell.includes('quantity') || 
                                cell.includes('req') || cell.includes('order') ||
                                cell.includes('need')) {
                                qtyCol = j;
                            }
                        }
                        break;
                    }
                }
                
                console.log(`📊 Part column: ${partCol}, Qty column: ${qtyCol}, Header row: ${headerRow}`);
                
                if (partCol === -1) {
                    for (let i = 0; i < jsonData.length; i++) {
                        const row = jsonData[i];
                        if (!row || row.length === 0) continue;
                        
                        for (let j = 0; j < row.length; j++) {
                            const cell = String(row[j] || '');
                            if (cell.match(/\b([A-Z0-9]{5,20})\b/)) {
                                partCol = j;
                                if (j + 1 < row.length) {
                                    const nextCell = String(row[j + 1] || '');
                                    if (nextCell.match(/^\d+$/) && parseInt(nextCell) > 0 && parseInt(nextCell) < 1000) {
                                        qtyCol = j + 1;
                                    }
                                }
                                break;
                            }
                        }
                        if (partCol !== -1) break;
                    }
                }
                
                console.log(`📊 Final - Part col: ${partCol}, Qty col: ${qtyCol}`);
                
                for (let i = 0; i < jsonData.length; i++) {
                    const row = jsonData[i];
                    if (!row || row.length === 0) continue;
                    
                    if (i === headerRow) continue;
                    
                    let partNumber = null;
                    if (partCol !== -1 && partCol < row.length) {
                        const cell = String(row[partCol] || '').trim();
                        const partMatch = cell.match(/\b([A-Z0-9]{5,20})\b/i);
                        if (partMatch) {
                            partNumber = partMatch[1].toUpperCase();
                        }
                    }
                    
                    if (!partNumber) continue;
                    
                    let qty = 1;
                    
                    if (qtyCol !== -1 && qtyCol < row.length) {
                        const qtyValue = row[qtyCol];
                        if (qtyValue !== undefined && qtyValue !== null && qtyValue !== '') {
                            if (typeof qtyValue === 'number') {
                                qty = Math.round(qtyValue);
                            } else if (typeof qtyValue === 'string') {
                                const parsed = parseFloat(qtyValue);
                                if (!isNaN(parsed) && parsed > 0 && parsed < 1000) {
                                    qty = Math.round(parsed);
                                }
                            }
                        }
                    }
                    
                    if (qty > 100) {
                        const rowNum = i + 1;
                        if (Math.abs(qty - rowNum) <= 2) {
                            console.log(`⚠️ Quantity ${qty} looks like row index ${rowNum}. Looking for real quantity...`);
                            
                            let foundQty = 1;
                            for (let j = 0; j < row.length; j++) {
                                if (j === partCol) continue;
                                const val = row[j];
                                if (typeof val === 'number' && val > 0 && val < 100 && Number.isInteger(val)) {
                                    foundQty = val;
                                    break;
                                }
                                if (typeof val === 'string') {
                                    const parsed = parseFloat(val);
                                    if (!isNaN(parsed) && parsed > 0 && parsed < 100 && Number.isInteger(parsed)) {
                                        foundQty = parsed;
                                        break;
                                    }
                                }
                            }
                            
                            if (foundQty !== qty) {
                                qty = foundQty;
                                console.log(`✅ Found real quantity: ${qty}`);
                            }
                        }
                    }
                    
                    if (qty > 1000) qty = 1;
                    if (qty < 1) qty = 1;
                    
                    if (!extractedItems.find(item => item.part === partNumber)) {
                        extractedItems.push({ part: partNumber, qty: qty });
                        console.log(`📊 Extracted: ${partNumber} x${qty}`);
                    }
                }
                
                console.log(`📊 Total extracted: ${extractedItems.length} items`);
                
            } catch (excelError) {
                console.error('❌ Excel processing error:', excelError.message);
            }
        }
        
        if (extractedItems.length === 0 && CONFIG.geminiKey) {
            console.log(`🤖 Using Gemini Vision for extraction`);
            
            try {
                const base64Data = fileBuffer.toString('base64');
                const mimeTypeForGemini = isPDF ? 'application/pdf' : 
                                         isExcel ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' :
                                         mimeType || 'image/jpeg';
                
                const prompt = `Extract ALL part numbers and quantities from this document.

CRITICAL RULES:
1. Look for PART NUMBERS (alphanumeric, 5-20 characters like 0801BA0285N)
2. Look for QUANTITIES (numbers after part numbers)
3. Extract EVERY part number you can find
4. If quantity is present, include it (format: PART_NUMBER QUANTITY)
5. If multiple parts, list each on new line

OUTPUT FORMAT:
PART_NUMBER1 QUANTITY1
PART_NUMBER2 QUANTITY2

Document: ${filename}`;

                const data = await geminiRateLimiter.request(prompt, base64Data, mimeTypeForGemini);
                
                if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
                    const content = data.candidates[0].content.parts[0].text.trim();
                    console.log(`📝 Gemini extracted: "${content}"`);
                    
                    const lines = content.split('\n');
                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (!trimmed) continue;
                        
                        const partMatch = trimmed.match(/\b([A-Z0-9]{5,20})\b/i);
                        if (partMatch) {
                            const partNumber = partMatch[1].toUpperCase();
                            const qtyMatch = trimmed.match(/(\d+)/);
                            const qty = qtyMatch ? parseInt(qtyMatch[1]) : 1;
                            
                            if (!extractedItems.find(item => item.part === partNumber)) {
                                extractedItems.push({ part: partNumber, qty: qty });
                            }
                        }
                    }
                }
            } catch (geminiError) {
                console.error('❌ Gemini extraction error:', geminiError.message);
            }
        }
        
        if (extractedItems.length === 0) {
            await sendWhatsAppMessage(from, 
                `📄 *Document Processed*\n\n` +
                `📁 File: ${filename}\n` +
                `📦 Size: ${(fileBuffer.length / 1024).toFixed(1)} KB\n\n` +
                `⚠️ *No part numbers found in this document.*\n\n` +
                `💡 Please ensure your document contains part numbers (5-20 alphanumeric characters).\n` +
                `📝 You can also type the part numbers directly.\n\n` +
                `📞 Call: ${CONFIG.businessPhone}`
            );
            return;
        }
        
        console.log(`📦 Processing ${extractedItems.length} extracted items from document`);
        
        let foundItems = [];
        let notFound = [];
        let outOfStock = [];
        let total = 0;
        
        const searchPromises = extractedItems.map(async (item) => {
            let product = await db.getProductExact(item.part.toUpperCase());
            if (!product) {
                const results = await db.searchProducts(item.part, 1);
                if (results && results.length > 0) {
                    product = results[0];
                }
            }
            return { item, product };
        });
        
        const results = await Promise.all(searchPromises);
        
        for (const { item, product } of results) {
            if (product) {
                const billingPrice = product.billing_price || product.list_price || 0;
                const priceWithGST = billingPrice * 1.18;
                
                foundItems.push({
                    part: product.part,
                    requestedPart: item.part,
                    description: product.description,
                    qty: item.qty || 1,
                    price: priceWithGST,
                    list_price: product.list_price,
                    mrp: product.mrp,
                    billing_price: billingPrice,
                    stock: product.stock,
                    brand: product.brand,
                    make: product.make,
                    model: product.model
                });
                
                total += priceWithGST * (item.qty || 1);
                
                if (product.stock === 0) {
                    outOfStock.push(product.part);
                    await alertSystem.sendOutOfStockAlert(from, product.part, product.description);
                    try {
                        await customerLog.trackOutOfStock(from, product.part, product.description, item.qty || 1);
                    } catch (trackError) {
                        console.error('⚠️ Track error (non-critical):', trackError.message);
                    }
                }
            } else {
                notFound.push(item.part);
            }
        }
        
        if (foundItems.length === 0) {
            let reply = `📄 *Document Processed*\n\n`;
            reply += `📁 File: ${filename}\n`;
            reply += `📦 ${extractedItems.length} items found\n\n`;
            reply += `❌ *No products found*\n\n`;
            if (notFound.length > 0) {
                reply += `Not found: ${notFound.join(', ')}\n\n`;
            }
            reply += `💡 Please check the part numbers.\n`;
            reply += `📞 Call: ${CONFIG.businessPhone}`;
            await sendWhatsAppMessage(from, reply);
            return;
        }
        
        const cartItems = foundItems.map(item => ({
            part: item.part,
            description: item.description,
            qty: item.qty,
            price: item.price,
            list_price: item.list_price,
            mrp: item.mrp,
            billing_price: item.billing_price,
            stock: item.stock,
            requestedPart: item.requestedPart || item.part
        }));
        
        await db.saveCart(from, cartItems, total, total);
        
        let reply = `📄 *DOCUMENT ORDER SUMMARY*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
        reply += `📁 File: ${filename}\n`;
        reply += `📦 Items: ${foundItems.length} valid products\n\n`;
        
        for (const item of foundItems) {
            const itemTotal = item.price * item.qty;
            reply += `*${item.part}*`;
            if (item.requestedPart && item.requestedPart !== item.part) {
                reply += ` (matched: ${item.requestedPart})`;
            }
            reply += ` x${item.qty}\n`;
            reply += `📝 ${item.description || 'N/A'}\n`;
            if (item.list_price > 0) reply += `💰 LIST PRICE: ₹${item.list_price.toFixed(2)}\n`;
            if (item.mrp > 0) reply += `💰 MRP PRICE: ₹${item.mrp.toFixed(2)}\n`;
            reply += `💳 ₹${item.price.toFixed(2)} × ${item.qty} = ₹${itemTotal.toFixed(2)}\n`;
            reply += `📦 ${item.stock > 0 ? `✅ ${item.stock} pcs available` : '❌ Out of Stock'}\n\n`;
        }
        
        reply += `━━━━━━━━━━━━━━━━━━━━\n`;
        reply += `💰 *Total: ₹${total.toFixed(2)}* (incl. GST)\n`;
        reply += `━━━━━━━━━━━━━━━━━━━━\n\n`;
        
        if (outOfStock.length > 0) {
            reply += `⚠️ *Out of Stock:* ${outOfStock.join(', ')}\n`;
            reply += `🔔 We'll notify you when available.\n\n`;
        }
        
        if (notFound.length > 0) {
            reply += `❌ *Not found:* ${notFound.join(', ')}\n\n`;
        }
        
        reply += `✅ *Confirm order?* Reply "Confirm Order"\n`;
        reply += `🗑️ *Clear Cart* - Start fresh\n\n`;
        reply += `📞 Call: ${CONFIG.businessPhone}`;
        
        await sendWhatsAppMessage(from, reply);
        
    } catch (error) {
        console.error(`❌ Document handler error:`, error.message);
        await sendWhatsAppMessage(from, 
            `❌ *Failed to process document.*\n\n` +
            `Error: ${error.message}\n\n` +
            `💡 Please check your file and try again.\n` +
            `📞 Call: ${CONFIG.businessPhone}`
        );
    }
}

// ============================================================
// 🤖 GEMINI WEB SEARCH
// ============================================================

const webSearchCache = new LRUCache({
    max: 1000,
    ttl: 15 * 60 * 1000
});

async function getGeminiWebSearch(query) {
    if (!CONFIG.geminiKey) return null;
    
    const cacheKey = query.toLowerCase().trim();
    if (webSearchCache.has(cacheKey)) {
        return webSearchCache.get(cacheKey);
    }

    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${CONFIG.geminiKey}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: `You are an auto spares assistant for "Auto Spares Solution" in India.
Customer Enquiry: "${query}"
IMPORTANT RULES:
1. Help with useful information about auto parts
2. Suggest what they might need
3. ALWAYS include phone: ${CONFIG.businessPhone}
4. Reply in Hinglish
5. Keep response concise (max 3-4 sentences)`
                    }]
                }],
                generationConfig: { temperature: 0.7, maxOutputTokens: 200 }
            })
        });

        const data = await response.json();
        if (response.ok && data.candidates?.[0]?.content?.parts?.[0]?.text) {
            let content = data.candidates[0].content.parts[0].text;
            if (!content.includes(CONFIG.businessPhone)) content += `\n\n📞 Call: ${CONFIG.businessPhone}`;
            webSearchCache.set(cacheKey, content);
            return content;
        }
        return null;

    } catch (error) {
        console.error('❌ Gemini web search error:', error.message);
        return null;
    }
}

// ============================================================
// 📥 IMPORT CSV IN BACKGROUND
// ============================================================

let csvImportStarted = false;
let csvImportCompleted = false;

async function importCSVInBackground() {
    if (csvImportStarted) return;
    csvImportStarted = true;
    
    try {
        const csvPath = path.join(__dirname, 'prices.csv');
        if (fs.existsSync(csvPath)) {
            console.log('📥 Background CSV import started...');
            const result = await importCSV(csvPath);
            console.log(`✅ Background import completed: ${result.imported} products`);
            importProgress = result.imported;
            csvImportCompleted = true;
            isDbReady = true;
            dbReadyMessage = 'Database ready';
            
            console.log(`📨 Checking for pending customers to send welcome...`);
            
            const allKeys = messageCache.keys ? [...messageCache.keys()] : [];
            const pendingKeys = allKeys.filter(key => key.startsWith('pending_welcome_'));
            
            console.log(`📨 Found ${pendingKeys.length} customers waiting for welcome`);
            
            for (const key of pendingKeys) {
                const phone = key.replace('pending_welcome_', '');
                const welcomeKey = `welcome_sent_${phone}`;
                
                if (!messageCache.has(welcomeKey)) {
                    console.log(`👋 Auto-sending welcome to ${phone} (system just became ready)`);
                    
                    try {
                        await sendWelcomeWithAllBrands(phone);
                        messageCache.set(welcomeKey, true);
                        messageCache.delete(key);
                    } catch (sendError) {
                        console.error(`❌ Failed to send welcome to ${phone}:`, sendError.message);
                    }
                }
            }
            
            await alertSystem.sendImportCompleteAlert(result.imported);
            
        } else {
            console.log('⚠️ prices.csv not found, skipping import');
            csvImportCompleted = true;
            isDbReady = true;
            dbReadyMessage = 'Database ready (no import needed)';
        }
    } catch (error) {
        console.error('❌ Background import error:', error.message);
        csvImportCompleted = true;
        isDbReady = true;
        dbReadyMessage = 'Database ready (with errors)';
        
        await alertSystem.sendUserAlert(ADMIN_PHONE, 'systemError',
            `❌ *Import Failed*\n\n` +
            `Error: ${error.message}\n\n` +
            `💡 Please check the CSV file and restart.`
        );
    }
}

// ============================================================
// 🚀 START SERVER
// ============================================================

async function startServer() {
    console.log('====================================');
    console.log('🚀 ASSIST WhatsApp Webhook v3.1 - COMPLETE INTEGRATED');
    console.log(`📞 Business Phone: ${CONFIG.businessPhone}`);
    console.log(`🗄️ Database: ${process.env.DB_PATH || './db/products.db'}`);
    console.log('====================================');
    
    try {
        await db.initDatabase();
        console.log('✅ Database initialized');

        await initAllTables();
        console.log('✅ All tables ready');
// ✅ ADD LOGO PRELOAD HERE - EXACT POSITION
        console.log('📥 Preloading brand logos...');
        const { preloadAllLogos } = require('./modules/brand-collage');
        await preloadAllLogos();
        console.log('✅ Brand logos preloaded');

        const stats = await db.getStats();
        if (stats.total_products === 0) {
            console.log('📦 No products found. Starting background import...');
            setImmediate(importCSVInBackground);
        } else {
            console.log(`📦 ${stats.total_products} products already in database`);
            importProgress = stats.total_products;
            isDbReady = true;
            dbReadyMessage = 'Database ready';
            
            await alertSystem.sendImportCompleteAlert(stats.total_products);
        }

        // Initialize brand manager
        if (brandManager && brandManager.updateBrands) {
            try {
                await brandManager.updateBrands();
                console.log(`🎨 Brand Manager initialized: ${brandManager.getActiveBrands ? brandManager.getActiveBrands().length : 0} active brands`);
            } catch (err) {
                console.error('❌ Brand Manager init error:', err.message);
            }
        }

        if (dealerIntelligence && dealerIntelligence.init) {
            dealerIntelligence.init();
        }

        scheduler.startScheduler();
        console.log('✅ Scheduler started');
// ✅ START DYNAMIC FILE WATCHER - ENABLED WITH FIXES
if (fileWatcher && fileWatcher.startWatching) {
    console.log('🔄 Starting dynamic file watcher with fixes...');
    fileWatcher.startWatching({
        scanInterval: 60000,  // 60 seconds to avoid conflicts
        importBatchSize: 1000
    });
    console.log('✅ Dynamic file watcher started (scan interval: 10s)');
}
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`🚀 Server Running On Port ${PORT}`);
            console.log(`🔗 Health Check: /health`);
            console.log(`📱 Webhook: /webhook`);
            console.log(`📊 Admin Dashboard: /api/admin/dashboard`);
            console.log(`🎙️ Voice Processing: ✅ Active (with rate limiter)`);
            console.log(`📸 Image Processing: ✅ Active (with rate limiter)`);
            console.log(`🤖 Gemini Rate Limiter: ✅ Active (2s delay, 3 retries)`);
            console.log(`📢 Alert System: ✅ Active`);
            console.log(`👑 Admin Features: ✅ Active (${ADMIN_PHONE})`);
            console.log(`📊 Excel/PDF Export: ✅ Active`);
            console.log(`🎨 Dynamic Brands: ✅ Active (Auto-update every 5 min)`);
            console.log(`🎨 Brand Collage: ✅ Active (All brands in one image)`);
            console.log(`💾 Memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`);
            console.log(`⏱️ Response Timeout: ${CONFIG.responseTimeout}ms`);
            console.log(`⏱️ Gemini Timeout: ${CONFIG.geminiTimeout}ms`);
            console.log(`📦 Database Status: ${isDbReady ? '✅ Ready' : '⏳ Loading'}`);
            console.log('====================================');
        });

    } catch (error) {
        console.error('❌ Startup error:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

process.on('SIGTERM', () => { console.log('🛑 Shutting down...'); process.exit(0); });
process.on('SIGINT', () => { console.log('🛑 Shutting down...'); process.exit(0); });
process.on('uncaughtException', (error) => { console.error('❌ Uncaught Exception:', error.message); });
process.on('unhandledRejection', (reason) => { console.error('❌ Unhandled Rejection:', reason); });

startServer();

module.exports = { app };
