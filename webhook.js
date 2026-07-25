// ============================================================
// 🚀 ASSIST WhatsApp Webhook v3.0 - COMPLETE ULTIMATE VERSION
// ALL Features: Customer Master, Invoice, Stock Ledger,
// Dealer Intelligence, Calendar Offers, Brochure,
// Proforma, Quotation, Purchase Invoice, Delivery,
// Order Finalization, Admin Notifications, Payment Detection,
// Gemini AI, Image Processing, Bulk Orders, Customer Ledger,
// Supplier-Vendor Integration, Supplier Enquiry, Payment System,
// Backup & Restore, Multi-Product Guide, Invoice Management,
// Quotation & Proforma Generation, Vendor Management,
// Delivery Boy System, PIN Code Based Assignment,
// Normal Phone Support, Vendor as Delivery Partner,
// Manual Transport Booking, OTP Verification,
// Vendor Price Negotiation, Customer-Vendor Protection,
// Stock Update Notifications with Brand, Voice Command Processing,
// Invoice Protection (Void/Credit Note), Auto Storage Cleanup,
// Interactive Buttons for All Users,
// Excel Download (All Data + Pending Orders),
// PDF Download (All Data + Pending Orders)
// ============================================================

const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const compression = require('compression');
const XLSX = require('xlsx');

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
const customerLog = require('./modules/customer-log');
const scheduler = require('./modules/scheduler');
const invoice = require('./modules/invoice');
const dealerIntelligence = require('./modules/dealer-intelligence');
const supplierVendor = require('./modules/supplier-vendor');
const supplierEnquiry = require('./modules/supplier-enquiry');
const geminiPurchase = require('./modules/gemini-purchase');
const geminiPayment = require('./modules/gemini-payment');
const payment = require('./modules/payment');
const deliverySystem = require('./modules/delivery-system');
const vendorManagement = require('./modules/vendor-management');

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
    DEALER_MASTER_URL: 'https://autosparessolution.github.io/data/dealer-master.xlsx',
    LOCAL_BOY_MAX_DISTANCE: 10,
    VENDOR_DELIVERY_MAX_DISTANCE: 20,
    MIN_MARGIN_PERCENTAGE: 5,
    VENDOR_PRICE_RATIO: 0.95,
    BACKUP_RETENTION_DAYS: 30,
    LOG_RETENTION_DAYS: 7,
    ORDER_ARCHIVE_DAYS: 365,
    STORAGE_WARNING_THRESHOLD: 85,
    STORAGE_CRITICAL_THRESHOLD: 95,
    ENABLE_VOICE: true,
    ENABLE_AI: true,
    ENABLE_IMAGE: true
};

const ADMIN_PHONE = process.env.ADMIN_PHONE || "9830300193";

console.log('====================================');
console.log('🚀 ASSIST WhatsApp Webhook v3.0 - ULTIMATE');
console.log(`📞 Business Phone: ${CONFIG.businessPhone}`);
console.log(`🔐 Admin Phone: ${ADMIN_PHONE}`);
console.log(`🆔 Phone Number ID: ${CONFIG.phoneNumberId}`);
console.log(`🔑 Token: ${CONFIG.accessToken ? '✅ Set' : '❌ Not set'}`);
console.log(`🧠 ChatGPT: ${CONFIG.chatgptKey ? '✅ Set' : '❌ Not set'}`);
console.log(`🧠 DeepSeek: ${CONFIG.deepseekKey ? '✅ Set' : '❌ Not set'}`);
console.log(`🧠 Gemini: ${CONFIG.geminiKey ? '✅ Set' : '❌ Not set'}`);
console.log(`🚚 Delivery System: ✅ Active`);
console.log(`🏭 Vendor Management: ✅ Active`);
console.log(`📱 Normal Phone Support: ✅ Active`);
console.log(`🎙️ Voice Processing: ${CONFIG.ENABLE_VOICE ? '✅ Active' : '❌ Disabled'}`);
console.log(`📊 Excel/PDF Download: ✅ Active`);
console.log(`💾 Memory Limit: ${CONFIG.maxMemory}MB`);
console.log('====================================');

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

const messageCache = new Map();
const processingSet = new Set();
const CACHE_TTL = CONFIG.cacheTTL;

setInterval(() => {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, timestamp] of messageCache) {
        if (now - timestamp > CACHE_TTL) {
            messageCache.delete(key);
            cleaned++;
        }
    }
    if (cleaned > 0) {
        console.log(`🧹 Cache cleaned: ${cleaned} entries removed, ${messageCache.size} remaining`);
    }
}, 5 * 60 * 1000);

function isMessageProcessed(messageId) {
    if (!messageId) return false;
    if (processingSet.has(messageId)) {
        console.log(`⏳ Message ${messageId} is already being processed`);
        return true;
    }
    if (messageCache.has(messageId)) {
        console.log(`⏩ Duplicate message ${messageId} - skipping`);
        return true;
    }
    processingSet.add(messageId);
    return false;
}

function markMessageProcessed(messageId) {
    if (messageId) {
        messageCache.set(messageId, Date.now());
        processingSet.delete(messageId);
        setTimeout(() => { messageCache.delete(messageId); }, CACHE_TTL);
    }
}

// ============================================================
// 🏥 HEALTH CHECK
// ============================================================

app.get('/health', async (req, res) => {
    try {
        const stats = await db.getStats();
        const memUsage = process.memoryUsage();
        res.json({
            status: 'ok',
            version: '3.0.0',
            timestamp: new Date().toISOString(),
            memory: {
                rss: Math.round(memUsage.rss / 1024 / 1024) + 'MB',
                heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + 'MB'
            },
            products: stats || { total_products: 0 }
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
        name: 'ASSIST WhatsApp Webhook v3.0 - ULTIMATE',
        version: '3.0.0',
        status: 'running',
        memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB used',
        features: {
            customerMaster: '✅',
            invoiceSystem: '✅',
            stockLedger: '✅',
            dealerIntelligence: '✅',
            calendarOffers: '✅',
            brochure: '✅',
            proforma: '✅',
            quotation: '✅',
            purchaseInvoice: '✅',
            deliverySystem: '✅',
            orderFinalization: '✅',
            paymentDetection: '✅',
            geminiAI: CONFIG.geminiKey ? '✅' : '❌',
            backupRestore: '✅',
            multiProductGuide: '✅',
            invoiceManagement: '✅',
            vendorManagement: '✅',
            normalPhoneSupport: '✅',
            voiceProcessing: CONFIG.ENABLE_VOICE ? '✅' : '❌',
            invoiceProtection: '✅',
            excelDownload: '✅',
            pdfDownload: '✅'
        },
        endpoints: {
            health: '/health',
            webhook: '/webhook',
            search: '/api/search?q=part_number',
            invoice: '/api/invoice/:invoiceNo',
            invoices: '/api/invoices',
            admin: '/api/admin/dashboard',
            customers: '/api/customers',
            suppliers: '/api/suppliers',
            dealer: '/api/dealer/offers/:phone',
            brochure: '/api/brochure/:phone',
            proforma: '/api/proforma/:phone',
            quotation: '/api/quotation/:phone',
            pickup: '/api/pickup-points',
            payments: '/api/payments/summary',
            backup: '/api/backup',
            delivery: '/api/delivery',
            vendors: '/api/vendors',
            storage: '/api/admin/storage-status',
            download: '/api/admin/download'
        }
    });
});

// ============================================================
// 🔍 API: SEARCH PRODUCTS
// ============================================================

app.get('/api/search', async (req, res) => {
    try {
        const { q, limit = 20 } = req.query;
        if (!q) {
            return res.status(400).json({ error: 'Query parameter "q" is required' });
        }
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
        const [stats, waiting, stockStats, deliveryStats] = await Promise.all([
            customerLog.getEnquiryStats(),
            customerLog.getWaitingNotifications(),
            db.getStats(),
            deliverySystem.getDeliveryStats()
        ]);
        res.json({
            success: true,
            stats: {
                enquiries: stats,
                waiting_notifications: waiting.length,
                products: stockStats,
                delivery: deliveryStats
            },
            top_out_of_stock: waiting.slice(0, 10)
        });
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
        res.json({ success: true, customers: customers, count: customers.length });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/customers/:phone', async (req, res) => {
    try {
        const { phone } = req.params;
        const customer = await db.getCustomerByPhone(phone);
        if (customer) {
            res.json({ success: true, customer });
        } else {
            res.status(404).json({ success: false, error: 'Customer not found' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/customers/sync', async (req, res) => {
    try {
        const { customers } = req.body;
        if (!customers || !Array.isArray(customers)) {
            return res.status(400).json({ success: false, error: 'Invalid data' });
        }
        let synced = 0, updated = 0, skipped = 0, errors = 0;
        for (const cust of customers) {
            try {
                const phone = (cust.mobileNo || cust.phone || '').replace(/\D/g, '');
                if (!phone || phone.length < 10) { skipped++; continue; }
                const existing = await db.getCustomerByPhone(phone);
                if (existing) {
                    await db.db.run(`
                        UPDATE customers SET
                            name = COALESCE(?, name),
                            email = COALESCE(?, email),
                            address = COALESCE(?, address),
                            gstin = COALESCE(?, gstin),
                            state = COALESCE(?, state),
                            district = COALESCE(?, district),
                            business = COALESCE(?, business),
                            credit_limit = COALESCE(?, credit_limit),
                            customer_code = COALESCE(?, customer_code),
                            status = COALESCE(?, status),
                            updated_at = CURRENT_TIMESTAMP
                        WHERE phone = ?
                    `, [
                        cust.name || null, cust.email || null, cust.address || null,
                        cust.gstin || null, cust.state || null, cust.district || null,
                        cust.business || null, cust.creditLimit || null,
                        cust.customerCode || null, cust.status || 'active', phone
                    ]);
                    updated++;
                } else {
                    await db.db.run(`
                        INSERT INTO customers (
                            phone, name, email, address, gstin, state,
                            district, business, credit_limit, customer_code,
                            status, total_purchases, created_at, updated_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                    `, [
                        phone, cust.name || '', cust.email || '', cust.address || '',
                        cust.gstin || '', cust.state || '', cust.district || '',
                        cust.business || '', cust.creditLimit || 50000,
                        cust.customerCode || `CUST${String(Date.now()).slice(-6)}`,
                        cust.status || 'active', cust.totalPurchased || 0
                    ]);
                    synced++;
                }
            } catch (err) { errors++; }
        }
        res.json({ success: true, synced, updated, skipped, errors });
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
        res.json({ success: true, suppliers: suppliers, count: suppliers.length });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/suppliers/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const supplier = await db.getSupplierById(id);
        if (supplier) {
            res.json({ success: true, supplier });
        } else {
            res.status(404).json({ success: false, error: 'Supplier not found' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/suppliers', async (req, res) => {
    try {
        const supplier = await db.upsertSupplier(req.body);
        res.json({ success: true, supplier });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// 📊 CUSTOMER LEDGER API
// ============================================================

app.get('/api/customers/:phone/ledger', async (req, res) => {
    try {
        const { phone } = req.params;
        const { startDate, endDate, limit = 100 } = req.query;
        const cleanPhone = phone.replace(/\D/g, '');
        const customer = await db.getCustomerByPhone(cleanPhone);
        if (!customer) {
            return res.status(404).json({ success: false, error: 'Customer not found' });
        }
        let ordersQuery = `SELECT order_id as orderId, items, total, status, created_at as createdAt FROM orders WHERE phone = ?`;
        const params = [cleanPhone];
        if (startDate) { ordersQuery += ' AND created_at >= ?'; params.push(startDate); }
        if (endDate) { ordersQuery += ' AND created_at <= ?'; params.push(endDate); }
        ordersQuery += ' ORDER BY created_at DESC LIMIT ?';
        params.push(parseInt(limit) || 100);
        const orders = await new Promise((resolve, reject) => {
            db.db.all(ordersQuery, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
        const ledgerEntries = [];
        for (const order of orders) {
            const items = JSON.parse(order.items || '[]');
            ledgerEntries.push({
                date: order.createdAt,
                type: 'Invoice',
                reference: order.orderId,
                debit: order.total || 0,
                credit: 0,
                balance: 0,
                narration: `${items.length} item(s) - ${order.status || 'pending'}`
            });
        }
        const payments = await new Promise((resolve, reject) => {
            db.db.all(`
                SELECT id, message as narration, created_at as createdAt, metadata
                FROM notification_log WHERE phone = ? AND type = 'payment'
                ORDER BY created_at DESC LIMIT ?
            `, [cleanPhone, parseInt(limit) || 100], (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
        for (const payment of payments) {
            let amount = 0;
            try { amount = JSON.parse(payment.metadata || '{}').amount || 0; } catch (e) {}
            if (amount > 0) {
                ledgerEntries.push({
                    date: payment.createdAt,
                    type: 'Payment',
                    reference: payment.id,
                    debit: 0,
                    credit: amount,
                    balance: 0,
                    narration: payment.narration || 'Payment received'
                });
            }
        }
        ledgerEntries.sort((a, b) => new Date(b.date) - new Date(a.date));
        let runningBalance = 0;
        const entriesWithBalance = ledgerEntries.map(entry => {
            runningBalance += (entry.debit || 0) - (entry.credit || 0);
            return { ...entry, balance: runningBalance };
        });
        const totalDebit = ledgerEntries.reduce((sum, e) => sum + (e.debit || 0), 0);
        const totalCredit = ledgerEntries.reduce((sum, e) => sum + (e.credit || 0), 0);
        res.json({
            success: true,
            customer: {
                name: customer.name,
                email: customer.email,
                phone: customer.phone,
                outstanding: totalDebit - totalCredit,
                creditLimit: customer.creditLimit
            },
            summary: {
                totalInvoices: totalDebit,
                totalPayments: totalCredit,
                outstanding: totalDebit - totalCredit,
                entryCount: ledgerEntries.length
            },
            entries: entriesWithBalance
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// 📊 DEALER INTELLIGENCE API
// ============================================================

app.get('/api/dealer/offers/:phone', async (req, res) => {
    try {
        const { phone } = req.params;
        const cleanPhone = phone.replace(/\D/g, '');
        const customer = await db.getCustomerByPhone(cleanPhone);
        if (!customer) {
            return res.status(404).json({ success: false, error: 'Customer not found' });
        }
        const result = await dealerIntelligence.getDealerOffersForCustomer(cleanPhone, db);
        res.json({
            success: true,
            customer: result.customer,
            offers: result.offers,
            offerCount: result.offers.length,
            summary: result.summary
        });
    } catch (error) {
        console.error('❌ Dealer offers error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// 📄 INVOICE PROTECTION SYSTEM (NO DELETION)
// ============================================================

// INVOICE STATUS CONSTANTS
const INVOICE_STATUS = {
    DRAFT: 'draft',
    ISSUED: 'issued',
    PAID: 'paid',
    PARTIAL: 'partial',
    OVERDUE: 'overdue',
    VOID: 'void',
    CANCELLED: 'cancelled',
    CREDIT_NOTE: 'credit_note'
};

// ✅ VOID INVOICE (NOT DELETE)
app.post('/api/admin/invoices/:invoiceNo/void', async (req, res) => {
    try {
        const { invoiceNo } = req.params;
        const { reason, adminPhone } = req.body;

        if (adminPhone !== ADMIN_PHONE) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const result = await voidInvoice(invoiceNo, reason, adminPhone);
        res.json(result);

    } catch (error) {
        console.error('❌ Void invoice error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ✅ CREDIT NOTE (For paid invoices)
app.post('/api/admin/invoices/:invoiceNo/credit-note', async (req, res) => {
    try {
        const { invoiceNo } = req.params;
        const { reason, adminPhone } = req.body;

        if (adminPhone !== ADMIN_PHONE) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const result = await createCreditNote(invoiceNo, reason, adminPhone);
        res.json(result);

    } catch (error) {
        console.error('❌ Credit note error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ❌ DISABLE DELETE (Prevent deletion)
app.delete('/api/admin/invoices/:invoiceNo', async (req, res) => {
    return res.status(403).json({
        success: false,
        error: 'Invoice deletion is NOT allowed. Use VOID or Credit Note instead.',
        alternatives: [
            'Use "VOID INVOICE" to cancel an unpaid invoice',
            'Use "CREDIT NOTE" to reverse a paid invoice',
            'Contact admin for support'
        ]
    });
});

// ============================================================
// 📄 INVOICE PROTECTION FUNCTIONS
// ============================================================

async function voidInvoice(invoiceNo, reason, adminPhone) {
    try {
        const invoice = await getInvoice(invoiceNo);
        if (!invoice) {
            return { success: false, message: 'Invoice not found' };
        }

        if (invoice.status === 'void' || invoice.status === 'cancelled') {
            return { success: false, message: 'Invoice is already void/cancelled' };
        }

        if (invoice.status === 'paid') {
            return { 
                success: false, 
                message: 'Paid invoice must be reversed with a Credit Note' 
            };
        }

        await new Promise((resolve, reject) => {
            db.db.run(`
                UPDATE invoices SET
                    status = 'void',
                    void_reason = ?,
                    voided_by = ?,
                    voided_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
                WHERE invoice_no = ?
            `, [reason, adminPhone, invoiceNo], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        await logInvoiceAction(invoiceNo, 'VOID', { reason, adminPhone });

        await sendWhatsAppMessage(ADMIN_PHONE, 
            `✅ *Invoice Voided*\n\n📄 ${invoiceNo}\n📝 ${reason}\n📋 Record kept for audit trail.`
        );

        return {
            success: true,
            message: `Invoice ${invoiceNo} has been VOIDED (NOT DELETED)`,
            invoice: invoice,
            status: 'void',
            reason: reason
        };

    } catch (error) {
        console.error('❌ Void invoice error:', error.message);
        return { success: false, message: error.message };
    }
}

async function createCreditNote(invoiceNo, reason, adminPhone) {
    try {
        const invoice = await getInvoice(invoiceNo);
        if (!invoice) {
            return { success: false, message: 'Invoice not found' };
        }

        if (invoice.status !== 'paid') {
            return { success: false, message: 'Only paid invoices need credit note' };
        }

        const existing = await getCreditNoteByInvoice(invoiceNo);
        if (existing) {
            return { success: false, message: 'Credit note already exists for this invoice' };
        }

        const creditNoteNo = `CN-${Date.now().toString().slice(-6)}`;

        await new Promise((resolve, reject) => {
            db.db.run(`
                INSERT INTO credit_notes (
                    credit_note_no,
                    invoice_no,
                    customer_phone,
                    customer_name,
                    amount,
                    reason,
                    created_by,
                    created_at,
                    status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                creditNoteNo,
                invoiceNo,
                invoice.customer_phone,
                invoice.customer_name,
                invoice.total,
                reason || 'Invoice cancelled',
                adminPhone,
                new Date().toISOString(),
                'issued'
            ], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        await new Promise((resolve, reject) => {
            db.db.run(`
                UPDATE invoices SET
                    status = 'credit_note_issued',
                    credit_note_no = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE invoice_no = ?
            `, [creditNoteNo, invoiceNo], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        await sendCreditNoteToCustomer(invoice, creditNoteNo, reason);

        await sendWhatsAppMessage(ADMIN_PHONE, 
            `✅ *Credit Note Created*\n\n📄 ${creditNoteNo}\n📄 Original: ${invoiceNo}\n💰 ₹${invoice.total}`
        );

        return {
            success: true,
            message: `Credit Note ${creditNoteNo} created for invoice ${invoiceNo}`,
            creditNoteNo: creditNoteNo,
            amount: invoice.total
        };

    } catch (error) {
        console.error('❌ Create credit note error:', error.message);
        return { success: false, message: error.message };
    }
}

async function getInvoice(invoiceNo) {
    return new Promise((resolve, reject) => {
        db.db.get('SELECT * FROM invoices WHERE invoice_no = ?', [invoiceNo], (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

async function getCreditNoteByInvoice(invoiceNo) {
    return new Promise((resolve, reject) => {
        db.db.get('SELECT * FROM credit_notes WHERE invoice_no = ?', [invoiceNo], (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

async function logInvoiceAction(invoiceNo, action, details) {
    try {
        await new Promise((resolve, reject) => {
            db.db.run(`
                INSERT INTO invoice_audit (
                    invoice_no,
                    action,
                    details,
                    performed_by,
                    performed_at
                ) VALUES (?, ?, ?, ?, ?)
            `, [
                invoiceNo,
                action,
                JSON.stringify(details),
                details.adminPhone || 'system',
                new Date().toISOString()
            ], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    } catch (error) {
        console.error('❌ Log invoice action error:', error.message);
    }
}

async function sendCreditNoteToCustomer(invoice, creditNoteNo, reason) {
    try {
        const message = 
            `📄 *Credit Note Issued*\n\n` +
            `📋 Credit Note: ${creditNoteNo}\n` +
            `📄 Original Invoice: ${invoice.invoice_no}\n` +
            `👤 Customer: ${invoice.customer_name}\n` +
            `💰 Amount: ₹${invoice.total}\n` +
            `📝 Reason: ${reason || 'Invoice cancelled'}\n\n` +
            `✅ This credit note cancels the original invoice.\n` +
            `📞 Call: ${CONFIG.businessPhone}`;

        await sendWhatsAppMessage(invoice.customer_phone, message);

    } catch (error) {
        console.error('❌ Send credit note error:', error.message);
    }
}

// ============================================================
// 📥 DOWNLOAD - PENDING ORDERS EXCEL
// ============================================================

app.get('/api/admin/download-pending-orders-excel', async (req, res) => {
    try {
        const { adminPhone } = req.query;

        if (adminPhone !== ADMIN_PHONE) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const pendingOrders = await getPendingOrders();
        
        if (pendingOrders.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'No pending orders found' 
            });
        }

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Auto Spares Solution';
        workbook.created = new Date();

        // Sheet 1: Summary
        const summarySheet = workbook.addWorksheet('Pending Orders Summary', {
            properties: { tabColor: { argb: 'FFDC3545' } }
        });

        const headers = [
            'S.No', 'Order ID', 'Customer Name', 'Phone', 
            'Items', 'Total Amount', 'Status', 'Delivery Type',
            'Delivery Boy', 'Delivery Status', 'Created At', 'Days Pending'
        ];

        const headerRow = summarySheet.addRow(headers);
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDC3545' } };
        headerRow.alignment = { horizontal: 'center' };
        headerRow.height = 25;

        let serialNo = 1;
        let totalAmount = 0;

        for (const order of pendingOrders) {
            const itemsList = order.items_parsed.map(i => `${i.part} x${i.qty}`).join(', ');
            const daysPending = Math.floor((Date.now() - new Date(order.created_at).getTime()) / (1000 * 60 * 60 * 24));
            
            summarySheet.addRow([
                serialNo++,
                order.order_id || 'N/A',
                order.customer_name || 'N/A',
                order.customer_phone || 'N/A',
                itemsList || 'N/A',
                order.total || 0,
                order.status || 'pending',
                order.delivery_type || 'N/A',
                order.delivery_boy_name || 'Not Assigned',
                order.delivery_status || 'Not Started',
                new Date(order.created_at).toLocaleString(),
                daysPending + ' days'
            ]);

            totalAmount += order.total || 0;
        }

        summarySheet.columns = [
            { header: 'S.No', key: 'sno', width: 8 },
            { header: 'Order ID', key: 'order_id', width: 18 },
            { header: 'Customer Name', key: 'customer', width: 25 },
            { header: 'Phone', key: 'phone', width: 15 },
            { header: 'Items', key: 'items', width: 40 },
            { header: 'Total Amount', key: 'total', width: 15 },
            { header: 'Status', key: 'status', width: 12 },
            { header: 'Delivery Type', key: 'delivery_type', width: 15 },
            { header: 'Delivery Boy', key: 'delivery_boy', width: 20 },
            { header: 'Delivery Status', key: 'delivery_status', width: 15 },
            { header: 'Created At', key: 'created_at', width: 20 },
            { header: 'Days Pending', key: 'days_pending', width: 12 }
        ];

        // Sheet 2: Statistics
        const statsSheet = workbook.addWorksheet('Statistics', {
            properties: { tabColor: { argb: 'FF28A745' } }
        });

        const stats = {
            totalPending: pendingOrders.length,
            totalAmount: pendingOrders.reduce((sum, o) => sum + (o.total || 0), 0),
            pending: pendingOrders.filter(o => o.status === 'pending').length,
            confirmed: pendingOrders.filter(o => o.status === 'confirmed').length,
            finalized: pendingOrders.filter(o => o.status === 'finalized').length,
            takeaway: pendingOrders.filter(o => o.delivery_type === 'takeaway').length,
            delivery: pendingOrders.filter(o => o.delivery_type === 'delivery').length,
            assigned: pendingOrders.filter(o => o.delivery_status === 'assigned').length,
            notAssigned: pendingOrders.filter(o => !o.delivery_status || o.delivery_status === 'Not Started').length
        };

        const statsData = [
            ['PENDING ORDERS STATISTICS'],
            [''],
            ['Total Pending Orders:', stats.totalPending],
            ['Total Amount:', `₹${stats.totalAmount.toFixed(2)}`],
            [''],
            ['STATUS BREAKDOWN:'],
            ['Pending:', stats.pending],
            ['Confirmed:', stats.confirmed],
            ['Finalized:', stats.finalized],
            [''],
            ['DELIVERY TYPE:'],
            ['Take Away:', stats.takeaway],
            ['Door Delivery:', stats.delivery],
            [''],
            ['DELIVERY STATUS:'],
            ['Assigned to Boy:', stats.assigned],
            ['Not Assigned:', stats.notAssigned],
            [''],
            ['Generated On:', new Date().toLocaleString()]
        ];

        for (const row of statsData) {
            const r = statsSheet.addRow(row);
            if (row.length === 1 && row[0].includes('STATISTICS')) {
                r.font = { bold: true, size: 16 };
            }
        }

        statsSheet.columns = [
            { header: 'Stat', key: 'stat', width: 30 },
            { header: 'Value', key: 'value', width: 20 }
        ];

        const buffer = await workbook.xlsx.writeBuffer();

        const fileName = `pending_orders_${new Date().toISOString().split('T')[0]}.xlsx`;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
        res.send(buffer);

    } catch (error) {
        console.error('❌ Pending orders excel error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ============================================================
// 📥 GET PENDING ORDERS HELPER
// ============================================================

async function getPendingOrders() {
    try {
        const pendingOrders = await new Promise((resolve, reject) => {
            db.db.all(`
                SELECT 
                    o.*,
                    c.name as customer_name,
                    c.phone as customer_phone,
                    c.address as customer_address,
                    c.district as customer_district,
                    d.delivery_id,
                    d.status as delivery_status,
                    d.delivery_boy_name,
                    d.delivery_boy_phone,
                    d.otp,
                    d.assigned_at as delivery_assigned_at,
                    v.name as vendor_name
                FROM orders o
                LEFT JOIN customers c ON o.phone = c.phone
                LEFT JOIN deliveries d ON o.order_id = d.order_id
                LEFT JOIN vendors v ON d.vendor_id = v.vendor_id
                WHERE o.status IN ('pending', 'confirmed', 'finalized')
                ORDER BY o.created_at DESC
            `, (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });

        for (const order of pendingOrders) {
            if (order.items) {
                try {
                    order.items_parsed = JSON.parse(order.items);
                } catch(e) {
                    order.items_parsed = [];
                }
            }
        }

        return pendingOrders;

    } catch (error) {
        console.error('❌ Get pending orders error:', error.message);
        return [];
    }
}

// ============================================================
// 💾 BACKUP & RESTORE SYSTEM
// ============================================================

const backupDir = path.join(__dirname, 'backups');

// Create backup
app.post('/api/backup/create', async (req, res) => {
    try {
        const { adminPhone } = req.body;
        
        if (!adminPhone || adminPhone !== ADMIN_PHONE) {
            return res.status(403).json({ success: false, error: 'Unauthorized. Admin access required.' });
        }

        const backupData = await createFullBackup();
        const timestamp = new Date().toISOString().slice(0,19).replace(/:/g, '-');
        const fileName = `backup_${timestamp}.json`;
        const filePath = path.join(backupDir, fileName);
        
        fs.writeFileSync(filePath, JSON.stringify(backupData, null, 2));

        res.json({
            success: true,
            message: 'Backup created successfully',
            fileName: fileName,
            summary: backupData.summary,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Backup creation error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// List backups
app.get('/api/backup/list', async (req, res) => {
    try {
        const { adminPhone } = req.query;

        if (!adminPhone || adminPhone !== ADMIN_PHONE) {
            return res.status(403).json({ success: false, error: 'Unauthorized. Admin access required.' });
        }

        const files = fs.readdirSync(backupDir)
            .filter(f => f.endsWith('.json'))
            .map(f => {
                const filePath = path.join(backupDir, f);
                const stats = fs.statSync(filePath);
                return {
                    fileName: f,
                    size: stats.size,
                    created: stats.birthtime,
                    modified: stats.mtime
                };
            })
            .sort((a, b) => b.modified - a.modified);

        res.json({ success: true, backups: files, count: files.length });
    } catch (error) {
        console.error('❌ Backup list error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Restore backup
app.post('/api/backup/restore', async (req, res) => {
    try {
        const { fileName, adminPhone, confirm } = req.body;

        if (!adminPhone || adminPhone !== ADMIN_PHONE) {
            return res.status(403).json({ success: false, error: 'Unauthorized. Admin access required.' });
        }

        if (!confirm || confirm !== 'CONFIRM_RESTORE') {
            return res.status(400).json({ success: false, error: 'Please confirm restore with "CONFIRM_RESTORE"' });
        }

        let filePath;
        if (fileName) {
            filePath = path.join(backupDir, fileName);
        } else {
            const files = fs.readdirSync(backupDir)
                .filter(f => f.endsWith('.json'))
                .sort((a, b) => {
                    const aStat = fs.statSync(path.join(backupDir, a));
                    const bStat = fs.statSync(path.join(backupDir, b));
                    return bStat.mtime - aStat.mtime;
                });
            if (files.length === 0) {
                return res.status(404).json({ success: false, error: 'No backup files found' });
            }
            filePath = path.join(backupDir, files[0]);
        }

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ success: false, error: 'Backup file not found' });
        }

        const backupData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const result = await restoreFromBackup(backupData);

        res.json({
            success: true,
            message: 'Backup restored successfully',
            summary: result.summary,
            restoredKeys: result.restoredKeys
        });

    } catch (error) {
        console.error('❌ Backup restore error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// 📦 BACKUP FUNCTIONS
// ============================================================

async function createFullBackup() {
    const backupData = {
        version: '3.0.0',
        timestamp: new Date().toISOString(),
        data: {},
        summary: {}
    };

    try {
        // Customers
        const customers = await db.getAllCustomers();
        backupData.data.customers = customers;
        backupData.summary.customers = customers.length;

        // Suppliers
        const suppliers = await db.getAllSuppliers();
        backupData.data.suppliers = suppliers;
        backupData.summary.suppliers = suppliers.length;

        // Products
        const products = await new Promise((resolve, reject) => {
            db.db.all('SELECT * FROM products', (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
        backupData.data.products = products;
        backupData.summary.products = products.length;

        // Invoices
        const invoices = await new Promise((resolve, reject) => {
            db.db.all('SELECT * FROM invoices', (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
        backupData.data.invoices = invoices;
        backupData.summary.invoices = invoices.length;

        // Orders
        const orders = await new Promise((resolve, reject) => {
            db.db.all('SELECT * FROM orders', (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
        backupData.data.orders = orders;
        backupData.summary.orders = orders.length;

        // Payments
        const customerPayments = await new Promise((resolve, reject) => {
            db.db.all('SELECT * FROM customer_payments', (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
        backupData.data.customerPayments = customerPayments;
        backupData.summary.customerPayments = customerPayments.length;

        const supplierPayments = await new Promise((resolve, reject) => {
            db.db.all('SELECT * FROM supplier_payments', (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
        backupData.data.supplierPayments = supplierPayments;
        backupData.summary.supplierPayments = supplierPayments.length;

        // Delivery boys
        const deliveryBoys = await new Promise((resolve, reject) => {
            db.db.all('SELECT * FROM delivery_boys', (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
        backupData.data.deliveryBoys = deliveryBoys;
        backupData.summary.deliveryBoys = deliveryBoys.length;

        // Deliveries
        const deliveries = await new Promise((resolve, reject) => {
            db.db.all('SELECT * FROM deliveries', (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
        backupData.data.deliveries = deliveries;
        backupData.summary.deliveries = deliveries.length;

        // Vendors
        const vendors = await new Promise((resolve, reject) => {
            db.db.all('SELECT * FROM vendors', (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
        backupData.data.vendors = vendors;
        backupData.summary.vendors = vendors.length;

        // Vendor stock
        const vendorStock = await new Promise((resolve, reject) => {
            db.db.all('SELECT * FROM vendor_stock', (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
        backupData.data.vendorStock = vendorStock;
        backupData.summary.vendorStock = vendorStock.length;

        // Transport bookings
        const transportBookings = await new Promise((resolve, reject) => {
            db.db.all('SELECT * FROM transport_bookings', (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
        backupData.data.transportBookings = transportBookings;
        backupData.summary.transportBookings = transportBookings.length;

        // Credit notes
        const creditNotes = await new Promise((resolve, reject) => {
            db.db.all('SELECT * FROM credit_notes', (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
        backupData.data.creditNotes = creditNotes;
        backupData.summary.creditNotes = creditNotes.length;

        // Invoice audit
        const invoiceAudit = await new Promise((resolve, reject) => {
            db.db.all('SELECT * FROM invoice_audit', (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
        backupData.data.invoiceAudit = invoiceAudit;
        backupData.summary.invoiceAudit = invoiceAudit.length;

        // LocalStorage data
        const localStorageData = {};
        const storageKeys = [
            'customers', 'suppliers', 'products', 'allInvoices',
            'salesInvoices', 'purchaseInvoices', 'customerPayments',
            'supplierPayments', 'customerLedger', 'supplierLedger',
            'inventoryTransactions', 'proformas', 'quotations',
            'users', 'dealerOffers', 'distributorStock', 'offers'
        ];
        for (const key of storageKeys) {
            try {
                const value = localStorage.getItem(key);
                if (value) {
                    localStorageData[key] = JSON.parse(value);
                    backupData.summary[`local_${key}`] = JSON.parse(value).length || 
                        Object.keys(JSON.parse(value)).length;
                }
            } catch(e) {}
        }
        backupData.data.localStorage = localStorageData;

        // Total records
        let totalRecords = 0;
        for (const key in backupData.summary) {
            totalRecords += backupData.summary[key];
        }
        backupData.summary.totalRecords = totalRecords;

        return backupData;
    } catch (error) {
        console.error('❌ Create backup error:', error.message);
        throw error;
    }
}

async function restoreFromBackup(backupData) {
    let restoredKeys = 0;
    const summary = {};

    try {
        await new Promise((resolve, reject) => {
            db.db.run('BEGIN TRANSACTION', (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        const data = backupData.data;

        // Restore Customers
        if (data.customers && data.customers.length > 0) {
            for (const customer of data.customers) {
                await new Promise((resolve, reject) => {
                    db.db.run(`
                        INSERT OR REPLACE INTO customers (
                            phone, name, email, address, gstin, state,
                            district, business, credit_limit, customer_code,
                            status, total_purchases, created_at, updated_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `, [
                        customer.phone, customer.name, customer.email || '',
                        customer.address || '', customer.gstin || '',
                        customer.state || '', customer.district || '',
                        customer.business || '', customer.credit_limit || 50000,
                        customer.customer_code || `CUST${Date.now().toString().slice(-6)}`,
                        customer.status || 'active', customer.total_purchases || 0,
                        customer.created_at || new Date().toISOString(),
                        new Date().toISOString()
                    ], (err) => {
                        if (err) reject(err);
                        else resolve();
                    });
                });
            }
            restoredKeys++;
            summary.customers = data.customers.length;
        }

        // Restore Products
        if (data.products && data.products.length > 0) {
            for (const product of data.products) {
                await new Promise((resolve, reject) => {
                    db.db.run(`
                        INSERT OR REPLACE INTO products (
                            part, description, brand, make, application,
                            category, hsn, stock, list_price, billing_price,
                            mrp, gst, created_at, updated_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `, [
                        product.part, product.description || '',
                        product.brand || '', product.make || '',
                        product.application || '', product.category || '',
                        product.hsn || '', product.stock || 0,
                        product.list_price || 0, product.billing_price || 0,
                        product.mrp || 0, product.gst || 18,
                        product.created_at || new Date().toISOString(),
                        new Date().toISOString()
                    ], (err) => {
                        if (err) reject(err);
                        else resolve();
                    });
                });
            }
            restoredKeys++;
            summary.products = data.products.length;
        }

        // Restore Invoices
        if (data.invoices && data.invoices.length > 0) {
            for (const invoice of data.invoices) {
                await new Promise((resolve, reject) => {
                    db.db.run(`
                        INSERT OR REPLACE INTO invoices (
                            invoice_no, customer_name, customer_phone,
                            customer_email, customer_address, customer_gstin,
                            customer_state, items, total, type, status,
                            payment_status, payment_date, payment_mode,
                            payment_reference, created_at, updated_at,
                            invoice_pdf, void_reason, voided_by, voided_at,
                            credit_note_no
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `, [
                        invoice.invoice_no, invoice.customer_name,
                        invoice.customer_phone, invoice.customer_email || '',
                        invoice.customer_address || '', invoice.customer_gstin || '',
                        invoice.customer_state || '', invoice.items || '[]',
                        invoice.total || 0, invoice.type || 'cash',
                        invoice.status || 'paid', invoice.payment_status || 'paid',
                        invoice.payment_date || null, invoice.payment_mode || null,
                        invoice.payment_reference || null,
                        invoice.created_at || new Date().toISOString(),
                        new Date().toISOString(), invoice.invoice_pdf || null,
                        invoice.void_reason || null, invoice.voided_by || null,
                        invoice.voided_at || null, invoice.credit_note_no || null
                    ], (err) => {
                        if (err) reject(err);
                        else resolve();
                    });
                });
            }
            restoredKeys++;
            summary.invoices = data.invoices.length;
        }

        await new Promise((resolve, reject) => {
            db.db.run('COMMIT', (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        return { restoredKeys, summary };
    } catch (error) {
        await new Promise((resolve) => {
            db.db.run('ROLLBACK', () => resolve());
        });
        throw error;
    }
}

// ============================================================
// 📤 SEND WHATSAPP MESSAGE
// ============================================================

async function sendWhatsAppMessage(to, message) {
    try {
        const normalizedPhone = to.replace(/\D/g, '');
        const url = `https://graph.facebook.com/v23.0/${CONFIG.phoneNumberId}/messages`;
        console.log(`📤 Sending to ${normalizedPhone}`);
        console.log(`📤 Message length: ${message.length}`);
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${CONFIG.accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                messaging_product: 'whatsapp',
                to: normalizedPhone,
                type: 'text',
                text: { body: message.slice(0, 4096) }
            })
        });
        const result = await response.json();
        if (result.messages?.[0]?.id) {
            console.log(`✅ Message sent to ${normalizedPhone}`);
            return result;
        }
        console.error(`❌ WhatsApp error:`, JSON.stringify(result, null, 2));
        return result;
    } catch (error) {
        console.error(`❌ Send error: ${error.message}`);
        throw error;
    }
}

// ============================================================
// 🚀 START SERVER
// ============================================================

async function startServer() {
    console.log('====================================');
    console.log('🚀 ASSIST WhatsApp Webhook v3.0 - ULTIMATE');
    console.log(`📞 Business Phone: ${CONFIG.businessPhone}`);
    console.log(`🗄️ Database: ${process.env.DB_PATH || './db/products.db'}`);
    console.log('====================================');
    
    try {
        await db.initDatabase();
        console.log('✅ Database initialized');

        // Initialize delivery system tables
        await deliverySystem.initTables();
        console.log('✅ Delivery system tables ready');

        // Create credit notes table
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
        console.log('✅ Credit notes table ready');

        // Create invoice audit table
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
        console.log('✅ Invoice audit table ready');

        // Import vendors from dealer master
        setTimeout(async () => {
            try {
                const result = await vendorManagement.importVendorsFromDealerMaster(CONFIG.DEALER_MASTER_URL);
                console.log(`✅ Vendors imported: ${result.imported}, Updated: ${result.updated}`);
            } catch (error) {
                console.error('❌ Auto import vendors error:', error.message);
            }
        }, 5000);

        const stats = await db.getStats();
        if (stats.total_products === 0) {
            const csvPath = path.join(__dirname, 'prices.csv');
            if (fs.existsSync(csvPath)) {
                console.log('📥 Importing CSV...');
                const result = await importCSV(csvPath);
                console.log(`✅ Imported ${result.imported} products`);
            } else {
                console.log('⚠️ prices.csv not found');
            }
        } else {
            console.log(`📦 ${stats.total_products} products already in database`);
        }

        dealerIntelligence.init();
        console.log('✅ Dealer Intelligence initialized');

        scheduler.startScheduler();
        console.log('✅ Scheduler started');

        app.listen(PORT, '0.0.0.0', () => {
            console.log(`🚀 Server Running On Port ${PORT}`);
            console.log(`🔗 Health Check: /health`);
            console.log(`📱 Webhook: /webhook`);
            console.log(`📊 Admin Dashboard: /api/admin/dashboard`);
            console.log(`👤 Customer Master: ✅ Active`);
            console.log(`📄 Invoice System: ✅ Active`);
            console.log(`🛡️ Invoice Protection: ✅ Active (No Deletion)`);
            console.log(`💳 Payment Detection: ✅ Active`);
            console.log(`🎯 Dealer Intelligence: ✅ Active`);
            console.log(`📄 Proforma: ✅ Active`);
            console.log(`📄 Quotation: ✅ Active`);
            console.log(`📦 Purchase System: ✅ Active`);
            console.log(`🚚 Delivery System: ✅ Active`);
            console.log(`📍 Pickup Points: ${Object.keys(PICKUP_POINTS).length} configured`);
            console.log(`💳 Payment System: ✅ Active`);
            console.log(`🤖 Gemini Vision: ${CONFIG.geminiKey ? '✅ Active' : '❌ Disabled'}`);
            console.log(`💾 Backup System: ✅ Active`);
            console.log(`🧭 Enquiry Guide: ✅ Active`);
            console.log(`🏭 Vendor Management: ✅ Active`);
            console.log(`📱 Normal Phone Support: ✅ Active`);
            console.log(`🎙️ Voice Processing: ${CONFIG.ENABLE_VOICE ? '✅ Active' : '❌ Disabled'}`);
            console.log(`📊 Excel/PDF Download: ✅ Active`);
            console.log(`📦 Pending Orders Export: ✅ Active`);
            console.log(`💾 Memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`);
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
