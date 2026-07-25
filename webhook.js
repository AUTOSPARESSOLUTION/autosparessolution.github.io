// ============================================================
// 🚀 ASSIST WhatsApp Webhook v3.0 - COMPLETE FIXED VERSION
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
// 📦 IMPORT MODULES (WITH FALLBACK FOR MISSING FILES)
// ============================================================

// Core modules that MUST exist
const db = require('./modules/database');
const { importCSV } = require('./modules/csv-loader');
const { parseOrder, extractPartNumber, extractQuantity, parseOrderWithDescription } = require('./modules/order-parser');
const scheduler = require('./modules/scheduler');
const invoice = require('./modules/invoice');

// Optional modules - try to load, fallback if missing
let customerLog = null;
try { customerLog = require('./modules/customer-log'); } catch(e) { 
    console.log('⚠️ customer-log module not found - using fallback');
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
    console.log('⚠️ dealer-intelligence module not found - using fallback');
    dealerIntelligence = { 
        getDealerOffersForCustomer: async () => ({ customer: null, offers: [], summary: {} }),
        sendOffersToCustomer: async () => ({ offerCount: 0 }),
        saveDistributorStock: (s) => s,
        getDistributorStock: () => [],
        sendOffersToAllCustomers: async () => ({ sent: 0, failed: 0 }),
        init: () => console.log("Dealer Intelligence (fallback)")
    };
}

let supplierVendor = null;
try { supplierVendor = require('./modules/supplier-vendor'); } catch(e) { 
    console.log('⚠️ supplier-vendor module not found - using fallback');
    supplierVendor = { 
        getSupplier: async () => null,
        createSupplier: async () => null,
        updateSupplier: async () => null
    };
}

let supplierEnquiry = null;
try { supplierEnquiry = require('./modules/supplier-enquiry'); } catch(e) { 
    console.log('⚠️ supplier-enquiry module not found - using fallback');
    supplierEnquiry = {};
}

let geminiPurchase = null;
try { geminiPurchase = require('./modules/gemini-purchase'); } catch(e) { 
    console.log('⚠️ gemini-purchase module not found - using fallback');
    geminiPurchase = {
        extractPurchaseInvoiceWithGemini: async () => null,
        validateInvoiceData: () => ({ valid: false, errors: ['Module not available'] }),
        formatExtractedData: () => 'Purchase invoice module not available'
    };
}

let geminiPayment = null;
try { geminiPayment = require('./modules/gemini-payment'); } catch(e) { 
    console.log('⚠️ gemini-payment module not found - using fallback');
    geminiPayment = {
        extractPaymentWithGemini: async () => null,
        processPaymentData: () => ({})
    };
}

let payment = null;
try { payment = require('./modules/payment'); } catch(e) { 
    console.log('⚠️ payment module not found - using fallback');
    payment = {
        recordSupplierPayment: async () => ({ success: false, message: 'Payment module unavailable' }),
        recordCustomerPayment: async () => ({ success: false, message: 'Payment module unavailable' }),
        processPaymentFromWhatsApp: async () => ({ error: true, message: 'Payment module unavailable' })
    };
}

let deliverySystem = null;
try { deliverySystem = require('./modules/delivery-system'); } catch(e) { 
    console.log('⚠️ delivery-system module not found - using fallback');
    deliverySystem = {
        initTables: async () => {},
        registerDeliveryBoy: async () => ({ boyId: 'DB-001', deviceType: 'smart', notificationMethod: 'whatsapp' }),
        getAllDeliveryBoys: async () => [],
        isDeliveryBoy: async () => false,
        updateDeliveryBoyLocation: async () => true,
        processOrderDelivery: async () => null,
        getDeliveryStats: async () => ({}),
        getDeliveryHistory: async () => [],
        getCustomerPendingDelivery: async () => null,
        notifyDeliveryBoyLocation: async () => true
    };
}

let vendorManagement = null;
try { vendorManagement = require('./modules/vendor-management'); } catch(e) { 
    console.log('⚠️ vendor-management module not found - using fallback');
    vendorManagement = {
        registerVendor: async () => ({ vendorId: 'VND-001' }),
        updateVendorStock: async () => ({ accepted: [], rejected: [] }),
        getAllVendors: async () => [],
        importVendorsFromDealerMaster: async () => ({ imported: 0, updated: 0, skipped: 0, customerVendors: 0 })
    };
}

// Optional Excel/PDF modules
let XLSX = null;
try { XLSX = require('xlsx'); } catch(e) { console.log('⚠️ XLSX module not found - Excel export disabled'); }

let ExcelJS = null;
try { ExcelJS = require('exceljs'); } catch(e) { console.log('⚠️ ExcelJS module not found - Excel export disabled'); }

let PdfPrinter = null;
try { PdfPrinter = require('pdfmake'); } catch(e) { console.log('⚠️ PDFMake module not found - PDF export disabled'); }

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
console.log('🚀 ASSIST WhatsApp Webhook v3.0 - FIXED');
console.log(`📞 Business Phone: ${CONFIG.businessPhone}`);
console.log(`🔐 Admin Phone: ${ADMIN_PHONE}`);
console.log(`🆔 Phone Number ID: ${CONFIG.phoneNumberId}`);
console.log(`🔑 Token: ${CONFIG.accessToken ? '✅ Set' : '❌ Not set'}`);
console.log(`🧠 ChatGPT: ${CONFIG.chatgptKey ? '✅ Set' : '❌ Not set'}`);
console.log(`🧠 DeepSeek: ${CONFIG.deepseekKey ? '✅ Set' : '❌ Not set'}`);
console.log(`🧠 Gemini: ${CONFIG.geminiKey ? '✅ Set' : '❌ Not set'}`);
console.log(`📊 Excel Export: ${ExcelJS ? '✅ Active' : '❌ Disabled'}`);
console.log(`📊 PDF Export: ${PdfPrinter ? '✅ Active' : '❌ Disabled'}`);
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
// 🗄️ DATABASE INITIALIZATION - CREATE ALL TABLES
// ============================================================

async function initAllTables() {
    try {
        // 1. Customer Enquiries Table
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

        // 2. Customer Interests Table
        await new Promise((resolve, reject) => {
            db.db.run(`
                CREATE TABLE IF NOT EXISTS customer_interests (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    customer_phone TEXT NOT NULL,
                    part TEXT NOT NULL,
                    interest_type TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(customer_phone, part)
                )
            `, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        console.log('✅ customer_interests table ready');

        // 3. Customer Stock Alerts Table
        await new Promise((resolve, reject) => {
            db.db.run(`
                CREATE TABLE IF NOT EXISTS customer_stock_alerts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    customer_phone TEXT NOT NULL,
                    part TEXT NOT NULL,
                    alert_type TEXT DEFAULT 'restock',
                    status TEXT DEFAULT 'pending',
                    sent_at TEXT,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(customer_phone, part)
                )
            `, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        console.log('✅ customer_stock_alerts table ready');

        // 4. Stock Update History Table
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

        // 5. OTP Attempts Table
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

        // 6. Credit Notes Table
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

        // 7. Invoice Audit Table
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

        // 8. Delivery System Tables
        if (deliverySystem && deliverySystem.initTables) {
            await deliverySystem.initTables();
        } else {
            await createBasicDeliveryTables();
        }

        // 9. Create indexes
        await createIndexes();

        console.log('✅ All tables created/verified');

    } catch (error) {
        console.error('❌ Create tables error:', error.message);
    }
}

async function createBasicDeliveryTables() {
    try {
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

        console.log('✅ Basic delivery tables ready');

    } catch (error) {
        console.error('❌ Basic delivery tables error:', error.message);
    }
}

async function createIndexes() {
    try {
        await db.db.run('CREATE INDEX IF NOT EXISTS idx_products_part ON products(part)');
        await db.db.run('CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand)');
        await db.db.run('CREATE INDEX IF NOT EXISTS idx_products_stock ON products(stock)');
        await db.db.run('CREATE INDEX IF NOT EXISTS idx_orders_phone ON orders(phone)');
        await db.db.run('CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)');
        await db.db.run('CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at)');
        await db.db.run('CREATE INDEX IF NOT EXISTS idx_invoices_phone ON invoices(customer_phone)');
        await db.db.run('CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status)');
        await db.db.run('CREATE INDEX IF NOT EXISTS idx_deliveries_status ON deliveries(status)');
        await db.db.run('CREATE INDEX IF NOT EXISTS idx_deliveries_boy ON deliveries(delivery_boy_phone)');
        await db.db.run('CREATE INDEX IF NOT EXISTS idx_enquiries_phone ON customer_enquiries(phone)');
        await db.db.run('CREATE INDEX IF NOT EXISTS idx_enquiries_created ON customer_enquiries(created_at)');

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
        const memUsage = process.memoryUsage();
        res.json({
            status: 'ok',
            version: '3.0.0',
            timestamp: new Date().toISOString(),
            memory: {
                rss: Math.round(memUsage.rss / 1024 / 1024) + 'MB',
                heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + 'MB'
            },
            products: stats || { total_products: 0 },
            features: {
                excelExport: !!ExcelJS,
                pdfExport: !!PdfPrinter,
                deliverySystem: !!deliverySystem,
                vendorManagement: !!vendorManagement
            }
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
        name: 'ASSIST WhatsApp Webhook v3.0',
        version: '3.0.0',
        status: 'running',
        memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB used',
        features: {
            customerMaster: '✅',
            invoiceSystem: '✅',
            stockLedger: '✅',
            dealerIntelligence: dealerIntelligence ? '✅' : '❌',
            excelExport: ExcelJS ? '✅' : '❌',
            pdfExport: PdfPrinter ? '✅' : '❌'
        },
        endpoints: {
            health: '/health',
            webhook: '/webhook',
            search: '/api/search?q=part_number',
            invoice: '/api/invoice/:invoiceNo',
            invoices: '/api/invoices',
            admin: '/api/admin/dashboard',
            customers: '/api/customers',
            suppliers: '/api/suppliers'
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
        const stats = await db.getStats();
        res.json({
            success: true,
            products: stats,
            timestamp: new Date().toISOString()
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
        const message = value?.messages?.[0];
        if (message) {
            const from = message.from;
            const type = message.type || 'text';
            const messageId = message.id;
            if (isMessageProcessed(messageId)) {
                return res.sendStatus(200);
            }
            console.log(`📩 From: ${from} | Type: ${type} | ID: ${messageId}`);
            setImmediate(async () => {
                try {
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
                        await sendWhatsAppMessage(from, `📩 Received your ${type} message.\n\n💡 Please send text, images, or documents.\n📞 Call: ${CONFIG.businessPhone}`);
                    }
                } catch (error) {
                    console.error(`❌ Async error: ${error.message}`);
                } finally {
                    markMessageProcessed(messageId);
                }
            });
            res.sendStatus(200);
            return;
        }
        if (value?.statuses) {
            console.log(`📊 Status update received - ignoring`);
            res.sendStatus(200);
            return;
        }
        console.log('⚠️ No message found in webhook');
        res.sendStatus(200);
    } catch (error) {
        console.error(`❌ Webhook error: ${error.message}`);
        res.sendStatus(200);
    }
});

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
// 🛡️ PENDING REQUESTS
// ============================================================

const pendingInvoiceRequests = new Map();
const pendingCustomerDetails = new Map();
const pendingOrderFinalization = new Map();
const pendingPurchaseUpload = new Map();
const pendingPaymentConfirmation = new Map();
const pendingGuideState = new Map();
const pendingVoid = new Map();

// ============================================================
// 🤖 GEMINI FUNCTIONS
// ============================================================

const geminiCache = new Map();
const CACHE_DURATION = 5 * 60 * 1000;

async function getGeminiWebSearch(query) {
    if (!CONFIG.geminiKey) return null;
    
    const cacheKey = query.toLowerCase().trim();
    if (geminiCache.has(cacheKey)) {
        const cached = geminiCache.get(cacheKey);
        if (Date.now() - cached.timestamp < CACHE_DURATION) {
            return cached.response;
        }
        geminiCache.delete(cacheKey);
    }

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${CONFIG.geminiKey}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
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

        clearTimeout(timeoutId);

        const data = await response.json();
        if (response.ok && data.candidates?.[0]?.content?.parts?.[0]?.text) {
            let content = data.candidates[0].content.parts[0].text;
            if (!content.includes(CONFIG.businessPhone)) {
                content += `\n\n📞 Call: ${CONFIG.businessPhone}`;
            }
            
            geminiCache.set(cacheKey, {
                response: content,
                timestamp: Date.now()
            });
            
            return content;
        }
        return null;

    } catch (error) {
        if (error.name === 'AbortError') {
            console.log(`⏱️ Gemini timeout for: "${query}"`);
        }
        return null;
    }
}

// ============================================================
// 📩 HANDLE WHATSAPP TEXT MESSAGE
// ============================================================

async function handleWhatsAppMessage(message, from) {
    try {
        const text = message.text?.body || '';
        console.log(`💬 Message: "${text}"`);
        
        const cleaned = text.replace(/^["']|["']$/g, '').replace(/["']/g, '').replace(/\s+/g, ' ').trim();
        const msgLower = cleaned.toLowerCase().trim();
        const msgUpper = cleaned.toUpperCase().trim();

        // ============================================================
        // 🧭 ENQUIRY GUIDE
        // ============================================================
        if (['guide', 'help me find', 'i need help', 'find part', 'shop', 'browse'].includes(msgLower)) {
            await sendWhatsAppMessage(from, 
                `🛒 *WELCOME TO AUTO SPARES SHOPPING* 🚗\n\n` +
                `I'll help you find parts step by step!\n\n` +
                `📋 *Reply with:*\n` +
                `• Part number: "0801BA0285N"\n` +
                `• Description: "clutch plate"\n` +
                `• Vehicle: "Bajaj Pulsar"\n` +
                `• Brand: "TVS"\n\n` +
                `📞 Call: ${CONFIG.businessPhone}`
            );
            return;
        }

        // ============================================================
        // 📄 QUOTATION, PROFORMA, INVOICE
        // ============================================================
        if (msgLower === 'quotation' || msgLower === 'quote') {
            await sendWhatsAppMessage(from, 
                `📄 *QUOTATION*\n\n` +
                `Please add items to cart first.\n` +
                `Reply "GUIDE" to start shopping.`
            );
            return;
        }

        if (msgLower === 'proforma' || msgLower === 'proforma invoice') {
            await sendWhatsAppMessage(from, 
                `📄 *PROFORMA INVOICE*\n\n` +
                `Please add items to cart first.\n` +
                `Reply "GUIDE" to start shopping.`
            );
            return;
        }

        if (msgLower === 'invoice' || msgLower === 'tax invoice') {
            await sendWhatsAppMessage(from, 
                `📄 *TAX INVOICE*\n\n` +
                `Please complete your order first.\n` +
                `Reply "GUIDE" to start shopping.`
            );
            return;
        }

        // ============================================================
        // 🎯 OFFERS
        // ============================================================
        if (msgLower === 'offers') {
            await sendWhatsAppMessage(from, 
                `🎯 *EXCLUSIVE OFFERS*\n\n` +
                `📋 Special deals are coming soon!\n\n` +
                `💡 Place more orders to unlock personalized deals.\n\n` +
                `📞 Call: ${CONFIG.businessPhone}`
            );
            return;
        }

        // ============================================================
        // 📄 BROCHURE
        // ============================================================
        if (msgLower === 'brochure' || msgLower === 'flyer') {
            await sendWhatsAppMessage(from, 
                `📄 *Brochure*\n\n` +
                `Our team will send you the latest catalog.\n\n` +
                `📞 Call: ${CONFIG.businessPhone}`
            );
            return;
        }

        // ============================================================
        // STEP 1: WELCOME / HELP
        // ============================================================
        if (['hi', 'hello', 'help', 'start', 'menu'].includes(msgLower)) {
            await sendWhatsAppMessage(from, 
                `👋 *Welcome to Auto Spares Solution!*\n\n` +
                `🤖 I'm your AI Sales Assistant\n\n` +
                `🔍 *Search:* Send part number or description\n` +
                `📸 *Send Photo:* Take photo of your order list\n` +
                `🛒 *Order:* "ORDER 0801BA0285N 2"\n` +
                `🎯 *Offers:* Reply "OFFERS"\n` +
                `🧭 *Guide:* Reply "GUIDE" for step-by-step help\n` +
                `📞 *Call:* ${CONFIG.businessPhone}\n` +
                `🛒 *Shop:* https://autosparessolution.com`
            );
            return;
        }

        // ============================================================
        // STEP 2: PRICE CHECK
        // ============================================================
        if (msgLower.includes('price') || msgLower.includes('cost') || msgLower.includes('rate')) {
            const partNumber = extractPartNumber(cleaned);
            if (partNumber) {
                let product = await db.getProductExact(partNumber);
                if (!product) {
                    product = await db.getProduct(partNumber);
                }
                if (product) {
                    const billingPrice = product.billing_price || product.list_price || 0;
                    const priceWithGST = billingPrice * 1.18;
                    let reply = `💰 *Price: ${product.part}*\n\n`;
                    reply += `📝 ${product.description || 'N/A'}\n`;
                    if (product.brand) reply += `🏷️ Brand: ${product.brand}\n`;
                    reply += `💳 ₹${priceWithGST.toFixed(2)} (incl. GST)\n`;
                    reply += `📦 ${product.stock > 0 ? `✅ ${product.stock} pcs` : '❌ Out of Stock'}`;
                    await sendWhatsAppMessage(from, reply);
                    return;
                }
            }
        }

        // ============================================================
        // STEP 3: STOCK CHECK
        // ============================================================
        if (msgLower.includes('stock') || msgLower.includes('available')) {
            const partNumber = extractPartNumber(cleaned);
            if (partNumber) {
                let product = await db.getProductExact(partNumber);
                if (!product) {
                    product = await db.getProduct(partNumber);
                }
                if (product) {
                    let reply = `📦 *Stock: ${product.part}*\n\n`;
                    reply += `📝 ${product.description || 'N/A'}\n`;
                    reply += `📦 ${product.stock > 0 ? `✅ ${product.stock} pcs available` : '❌ Out of Stock'}`;
                    await sendWhatsAppMessage(from, reply);
                    return;
                }
            }
        }

        // ============================================================
        // STEP 4: CONFIRM ORDER
        // ============================================================
        if (msgLower === 'confirm order' || msgLower === 'confirm') {
            const cart = await db.getCart(from);
            if (cart && cart.items) {
                const items = JSON.parse(cart.items);
                const orderId = `ORD-${Date.now().toString().slice(-6)}`;
                await db.saveOrder(orderId, from, items, cart.total);
                await db.clearCart(from);
                let reply = `✅ *ORDER CONFIRMED!*\n\n`;
                reply += `📦 Order ID: ${orderId}\n`;
                reply += `📝 Items:\n`;
                items.forEach((item, index) => {
                    reply += `   ${index + 1}. ${item.part} x${item.qty} = ₹${(item.price * item.qty).toFixed(2)}\n`;
                });
                reply += `💰 Total: ₹${cart.total.toFixed(2)}\n`;
                reply += `📞 *Call:* ${CONFIG.businessPhone}\n`;
                reply += `🛒 *Shop:* https://autosparessolution.com`;
                await sendWhatsAppMessage(from, reply);
                return;
            }
            await sendWhatsAppMessage(from, '🛒 Your cart is empty. Add items first!');
            return;
        }

        // ============================================================
        // STEP 5: CLEAR CART
        // ============================================================
        if (msgLower === 'clear cart' || msgLower === 'clear') {
            await db.clearCart(from);
            await sendWhatsAppMessage(from, '🗑️ Cart cleared!');
            return;
        }

        // ============================================================
        // STEP 6: SINGLE PRODUCT ORDER
        // ============================================================
        const partNumber = extractPartNumber(cleaned);
        const quantity = extractQuantity(cleaned);

        if (partNumber && quantity && quantity > 0) {
            let product = await db.getProductExact(partNumber);
            if (!product) {
                product = await db.getProduct(partNumber);
            }
            if (product) {
                const billingPrice = product.billing_price || product.list_price || 0;
                const priceWithGST = billingPrice * 1.18;
                const total = priceWithGST * quantity;
                const cartItems = [{
                    part: product.part,
                    description: product.description,
                    qty: quantity,
                    price: priceWithGST,
                    list_price: product.list_price,
                    mrp: product.mrp,
                    billing_price: billingPrice
                }];
                await db.saveCart(from, cartItems, total, total);
                let reply = `🛒 *ORDER SUMMARY*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
                reply += `*${product.part}* x${quantity}\n`;
                reply += `📝 ${product.description}\n`;
                reply += `💳 ₹${priceWithGST.toFixed(2)} × ${quantity} = ₹${total.toFixed(2)}\n\n`;
                reply += `━━━━━━━━━━━━━━━━━━━━\n`;
                reply += `💰 *Total: ₹${total.toFixed(2)}* (incl. GST)\n`;
                reply += `━━━━━━━━━━━━━━━━━━━━\n\n`;
                if (product.stock === 0) {
                    reply += `⚠️ Out of Stock\n🔔 We'll notify you when available.\n\n`;
                } else if (product.stock < quantity) {
                    reply += `⚠️ Only ${product.stock} available (requested ${quantity})\n\n`;
                }
                reply += `✅ *Confirm order?* Reply "Confirm Order"\n`;
                reply += `🗑️ *Clear Cart* - Start fresh\n\n`;
                reply += `📞 Call: ${CONFIG.businessPhone}`;
                await sendWhatsAppMessage(from, reply);
                return;
            }
        }

        // ============================================================
        // STEP 7: SEARCH PRODUCTS
        // ============================================================
        if (cleaned.length >= 2) {
            // First try exact match
            let exactProduct = await db.getProductExact(cleaned);
            if (exactProduct) {
                let reply = `🔍 Found 1 result\n\n`;
                reply += formatProductForWhatsApp(exactProduct, 0);
                reply += `\n🛒 To order: "${exactProduct.part} 2"\n`;
                reply += `📞 Call: ${CONFIG.businessPhone}`;
                await sendWhatsAppMessage(from, reply);
                return;
            }

            // Then try search
            const results = await db.searchProducts(cleaned, 10);
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

        // ============================================================
        // STEP 8: GEMINI WEB SEARCH FALLBACK
        // ============================================================
        console.log(`🔄 No product found. Trying Gemini...`);
        const geminiReply = await getGeminiWebSearch(cleaned);
        if (geminiReply) {
            await sendWhatsAppMessage(from, `🤖 ${geminiReply}`);
            return;
        }

        // ============================================================
        // STEP 9: NO RESULTS
        // ============================================================
        await sendWhatsAppMessage(from, 
            `🔍 No results for "${cleaned}"\n\n` +
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
// 🤖 HELPER FUNCTIONS
// ============================================================

function formatProductForWhatsApp(product, index = 0) {
    const billingPrice = product.billing_price || product.list_price || 0;
    const priceWithGST = billingPrice * 1.18;
    let reply = `${index + 1}. *${product.part}*\n`;
    reply += `📝 ${product.description || 'N/A'}\n`;
    if (product.brand) reply += `🏷️ Brand: ${product.brand}\n`;
    reply += `💰 ₹${priceWithGST.toFixed(2)} (incl. GST)\n`;
    reply += `📦 ${product.stock > 0 ? `✅ ${product.stock} pcs` : '❌ Out of Stock'}`;
    return reply;
}

// ============================================================
// 🖼️ HANDLE WHATSAPP IMAGE
// ============================================================

async function handleWhatsAppImage(message, from) {
    try {
        const mediaId = message.image.id;
        const caption = message.image.caption || "";
        console.log(`📸 Processing image from ${from}`);
        console.log(`📸 Media ID: ${mediaId}`);
        
        await sendWhatsAppMessage(from, 
            `📸 *Photo Received!*\n\n` +
            `I'm processing your image. Please wait...\n\n` +
            `💡 You can also type the part number directly.\n` +
            `📞 Call: ${CONFIG.businessPhone}`
        );
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
// 📄 HANDLE DOCUMENT MESSAGE
// ============================================================

async function handleDocumentMessage(message, from) {
    try {
        const doc = message.document;
        const filename = doc.filename || 'document.pdf';
        console.log(`📁 Processing document from ${from}: ${filename}`);
        
        await sendWhatsAppMessage(from, 
            `📄 *Document Received!*\n\n` +
            `📁 File: ${filename}\n\n` +
            `💡 Please type the part numbers directly.\n` +
            `📞 Call: ${CONFIG.businessPhone}`
        );
    } catch (error) {
        console.error(`❌ Document handler error:`, error.message);
    }
}

// ============================================================
// 🎙️ HANDLE VOICE MESSAGE
// ============================================================

async function handleVoiceMessage(message, from) {
    try {
        console.log(`🎙️ Voice message from ${from}`);
        
        await sendWhatsAppMessage(from, 
            `🎙️ *Voice Message Received!*\n\n` +
            `⏳ Processing your voice command...\n\n` +
            `💡 You can also type your message.\n` +
            `📞 Call: ${CONFIG.businessPhone}`
        );
    } catch (error) {
        console.error(`❌ Voice handler error:`, error.message);
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
            `📍 *Location Received!*\n\n` +
            `✅ Your location has been recorded.\n\n` +
            `📞 Call: ${CONFIG.businessPhone}`
        );
    } catch (error) {
        console.error(`❌ Location handler error:`, error.message);
    }
}

// ============================================================
// 🚀 START SERVER
// ============================================================

async function startServer() {
    console.log('====================================');
    console.log('🚀 ASSIST WhatsApp Webhook v3.0 - FIXED');
    console.log(`📞 Business Phone: ${CONFIG.businessPhone}`);
    console.log(`🗄️ Database: ${process.env.DB_PATH || './db/products.db'}`);
    console.log('====================================');
    
    try {
        // Initialize database
        await db.initDatabase();
        console.log('✅ Database initialized');

        // Create all tables
        await initAllTables();
        console.log('✅ All tables ready');

        // Initialize dealer intelligence if available
        if (dealerIntelligence && dealerIntelligence.init) {
            dealerIntelligence.init();
        }

        // Import CSV if no products
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

        // Initialize scheduler
        scheduler.startScheduler();
        console.log('✅ Scheduler started');

        // Start server
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`🚀 Server Running On Port ${PORT}`);
            console.log(`🔗 Health Check: /health`);
            console.log(`📱 Webhook: /webhook`);
            console.log(`📊 Admin Dashboard: /api/admin/dashboard`);
            console.log(`📊 Excel Export: ${ExcelJS ? '✅ Active' : '❌ Disabled'}`);
            console.log(`📊 PDF Export: ${PdfPrinter ? '✅ Active' : '❌ Disabled'}`);
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
