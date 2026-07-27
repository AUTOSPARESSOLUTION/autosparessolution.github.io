// ============================================================
// 🚀 ASSIST WhatsApp Webhook v3.0 - COMPLETE FIXED VERSION
// Priority: Fast Startup → Exact Match → Multi-Product → Search
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
    geminiTimeout: 15000,
    responseTimeout: 30000,
    debug: process.env.DEBUG === 'true'
};

const ADMIN_PHONE = process.env.ADMIN_PHONE || "9830300193";

console.log('====================================');
console.log('🚀 ASSIST WhatsApp Webhook v3.0 - COMPLETE FIXED');
console.log(`📞 Business Phone: ${CONFIG.businessPhone}`);
console.log(`🔐 Admin Phone: ${ADMIN_PHONE}`);
console.log(`🆔 Phone Number ID: ${CONFIG.phoneNumberId}`);
console.log(`🔑 Token: ${CONFIG.accessToken ? '✅ Set' : '❌ Not set'}`);
console.log(`🧠 Gemini: ${CONFIG.geminiKey ? '✅ Set' : '❌ Not set'}`);
console.log(`⏱️ Gemini Timeout: ${CONFIG.geminiTimeout}ms`);
console.log(`⏱️ Response Timeout: ${CONFIG.responseTimeout}ms`);
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
// 🛡️ DUPLICATE MESSAGE DETECTION - LRU CACHE
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
            status: 'ok', 
            version: '3.0.0',
            timestamp: new Date().toISOString(),
            products: stats || { total_products: 0 },
            memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB',
            cache: messageCache.size
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
// 📩 WEBHOOK RECEIVE - FIXED: No setImmediate, direct processing
// ============================================================

app.post('/webhook', async (req, res) => {
    try {
        const entry = req.body.entry?.[0];
        const change = entry?.changes?.[0];
        const value = change?.value;
        
        // ⚡ FAST PATH: Status updates - return immediately
        if (value?.statuses) {
            // Silent return - no logging
            return res.sendStatus(200);
        }
        
        const message = value?.messages?.[0];
        if (!message) {
            return res.sendStatus(200);
        }
        
        const from = message.from;
        const type = message.type || 'text';
        const messageId = message.id;
        
        // Check duplicate
        if (isMessageProcessed(messageId)) {
            return res.sendStatus(200);
        }
        
        console.log(`📩 From: ${from} | Type: ${type} | ID: ${messageId}`);
        
        // ⚡ PROCESS DIRECTLY (NO setImmediate)
        try {
            await withTimeout(
                processMessage(message, from, type),
                CONFIG.responseTimeout,
                'Message processing timed out'
            );
        } catch (error) {
            console.error(`❌ Processing error: ${error.message}`);
            // Try to send error message to user
            try {
                await sendWhatsAppMessage(from, `⚠️ Sorry, couldn't process your message. Please try again.\n📞 Call: ${CONFIG.businessPhone}`);
            } catch (e) {}
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
// 📨 MESSAGE PROCESSOR - Extracted for clarity
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
// 🚀 OPTIMIZED SEARCH - PARALLEL EXECUTION
// ============================================================

async function optimizedSearch(query, limit = 10) {
    // Try exact match first (fastest)
    const exact = await db.getProductExact(query.toUpperCase());
    if (exact) return [exact];
    
    // Run all searches in PARALLEL (not sequential)
    try {
        const [byPart, byVehicle, byDesc] = await Promise.all([
            db.searchProducts(query, limit),
            db.searchByVehicle(query, limit),
            db.searchDescriptionOnly(query, limit)
        ]);
        
        // Merge and deduplicate
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
            `⏳ Processing your voice command...\n` +
            `📝 Duration: ${duration} seconds\n\n` +
            `🔊 *I'm listening...*`
        );

        if (!CONFIG.geminiKey) {
            console.log(`⚠️ No Gemini key, skipping voice processing`);
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
        const transcribedText = await withTimeout(
            transcribeWithGemini(audioBuffer),
            CONFIG.geminiTimeout,
            'Gemini transcription timed out'
        );
        
        if (!transcribedText || transcribedText.trim().length === 0) {
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
// 🎤 TRANSCRIBE WITH GEMINI
// ============================================================

async function transcribeWithGemini(audioBuffer) {
    try {
        const base64Audio = audioBuffer.toString('base64');
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${CONFIG.geminiKey}`;
        
        console.log(`🔊 Sending audio to Gemini (${base64Audio.length} chars)`);
        
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        {
                            text: `Transcribe this audio message from a customer.
                            
IMPORTANT RULES:
1. Look for EXACT part numbers (alphanumeric, 5-20 characters like 0801BA0285N)
2. If you find a part number, return ONLY the part number
3. If you find part number with quantity, return "PART_NUMBER QTY"
4. Example: "0801BA0285N 2"
5. If multiple part numbers, list each on new line
6. If no part number found, return the full transcription`
                        },
                        {
                            inline_data: {
                                mime_type: 'audio/ogg',
                                data: base64Audio
                            }
                        }
                    ]
                }],
                generationConfig: {
                    temperature: 0.1,
                    maxOutputTokens: 300
                }
            })
        });

        const data = await response.json();
        console.log(`📊 Gemini response received`);
        
        if (response.ok && data.candidates?.[0]?.content?.parts?.[0]?.text) {
            const text = data.candidates[0].content.parts[0].text.trim();
            if (text !== 'INVALID' && text.length > 2) {
                return text;
            }
        }
        console.log(`⚠️ No valid transcription from Gemini`);
        return null;

    } catch (error) {
        console.error('❌ Gemini transcription error:', error.message);
        return null;
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

        await sendWhatsAppMessage(from, 
            `📸 *Photo Received!*\n\n` +
            `I'm processing your image. Please wait...\n\n` +
            `💡 You can also type the part number directly.\n` +
            `📞 Call: ${CONFIG.businessPhone}`
        );

        if (!CONFIG.geminiKey) {
            console.log(`⚠️ No Gemini key, skipping image processing`);
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
            10000,
            'Image download timed out'
        );
        console.log(`📸 Image downloaded: ${imageBuffer.length} bytes`);

        console.log(`🤖 Processing image with Gemini Vision...`);
        const extractedText = await withTimeout(
            processImageWithGemini(imageBuffer, caption),
            CONFIG.geminiTimeout,
            'Gemini vision timed out'
        );
        
        if (extractedText) {
            console.log(`📝 Extracted: "${extractedText}"`);
            const mockMessage = { text: { body: extractedText } };
            await handleWhatsAppMessage(mockMessage, from);
        } else {
            console.log(`⚠️ No text extracted from image`);
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
// 🤖 PROCESS IMAGE WITH GEMINI VISION
// ============================================================

async function processImageWithGemini(imageBuffer, caption) {
    try {
        if (!CONFIG.geminiKey) return null;

        let buffer = imageBuffer;
        if (buffer.length > 2 * 1024 * 1024) {
            try {
                const sharp = require('sharp');
                buffer = await sharp(buffer)
                    .resize(800, 800, { fit: 'inside' })
                    .jpeg({ quality: 80 })
                    .toBuffer();
                console.log(`📸 Image compressed: ${buffer.length} bytes`);
            } catch (e) {
                console.log(`⚠️ Sharp compression failed: ${e.message}`);
            }
        }

        const base64Image = buffer.toString('base64');
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${CONFIG.geminiKey}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        {
                            text: `Extract ALL part numbers from this image.
                            
INSTRUCTIONS:
1. Look for part numbers (alphanumeric, 5-20 characters like 0801BA0285N)
2. Extract EVERY part number you can find
3. If quantities are present, include them
4. Return each part number on a new line
5. Format: PART_NUMBER QTY (if quantity found)
6. Example output:
   0801BA0285N 2
   0303BC0071N 1
7. If no part numbers found, return "NO_PARTS_FOUND"

Caption: "${caption}"`
                        },
                        {
                            inline_data: {
                                mime_type: 'image/jpeg',
                                data: base64Image
                            }
                        }
                    ]
                }],
                generationConfig: {
                    temperature: 0.1,
                    maxOutputTokens: 300
                }
            })
        });

        const data = await response.json();
        if (response.ok && data.candidates?.[0]?.content?.parts?.[0]?.text) {
            const content = data.candidates[0].content.parts[0].text.trim();
            if (content !== 'NO_PARTS_FOUND' && content.length > 5) {
                return content;
            }
        }
        return null;

    } catch (error) {
        console.error('❌ Gemini vision error:', error.message);
        return null;
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
// 📄 DOCUMENT MESSAGE HANDLER
// ============================================================

async function handleDocumentMessage(message, from) {
    try {
        const doc = message.document;
        const filename = doc.filename || 'document.pdf';
        const mimeType = doc.mime_type || '';
        const docId = doc.id;
        
        console.log(`📁 Processing document from ${from}: ${filename}`);
        console.log(`📁 MIME Type: ${mimeType}`);
        
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
            `🤖 Using Gemini Vision to extract...\n` +
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
        let documentMetadata = {};
        let isPurchaseInvoice = false;
        
        // Use Gemini Vision for extraction
        if (CONFIG.geminiKey) {
            console.log(`🤖 Using Gemini Vision to extract from ${filename}`);
            
            const base64Data = fileBuffer.toString('base64');
            const mimeTypeForGemini = isPDF ? 'application/pdf' : 
                                     isExcel ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' :
                                     mimeType || 'image/jpeg';
            
            try {
                const extracted = await withTimeout(
                    extractWithGeminiVision(base64Data, mimeTypeForGemini, filename),
                    CONFIG.geminiTimeout,
                    'Gemini extraction timed out'
                );
                
                if (extracted) {
                    if (extracted.notPurchase) {
                        console.log(`📄 Not a purchase invoice, processing as customer order`);
                    } else if (extracted.seller || extracted.invoiceNo || extracted.total) {
                        isPurchaseInvoice = true;
                        documentMetadata = extracted;
                        extractedItems = extracted.items || [];
                        console.log(`✅ Purchase Invoice Detected`);
                        console.log(`   Seller: ${documentMetadata.seller}`);
                        console.log(`   Invoice: ${documentMetadata.invoiceNo}`);
                        console.log(`   Items: ${extractedItems.length}`);
                        console.log(`   Total: ₹${documentMetadata.total}`);
                    }
                }
            } catch (geminiError) {
                console.error(`❌ Gemini error:`, geminiError.message);
            }
        }
        
        // Process as purchase invoice (for admin)
        if (isPurchaseInvoice && from === ADMIN_PHONE && extractedItems.length > 0) {
            const purchaseData = {
                supplier: documentMetadata.seller || 'Unknown Supplier',
                invoiceNo: documentMetadata.invoiceNo || `PUR-${Date.now().toString().slice(-6)}`,
                date: documentMetadata.date || new Date().toISOString().split('T')[0],
                items: extractedItems.map(item => ({
                    part: item.part,
                    qty: item.qty || 1,
                    price: item.price || 0,
                    total: (item.qty || 1) * (item.price || 0),
                    hsn: item.hsn || ''
                })),
                total: documentMetadata.total || extractedItems.reduce((sum, i) => sum + ((i.qty || 1) * (i.price || 0)), 0),
                gstin: documentMetadata.gstin || ''
            };
            
            let preview = `📦 *Purchase Invoice Detected*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
            preview += `📄 Supplier: ${purchaseData.supplier}\n`;
            preview += `📄 Invoice No: ${purchaseData.invoiceNo}\n`;
            preview += `📅 Date: ${purchaseData.date}\n`;
            if (purchaseData.gstin) preview += `🆔 GSTIN: ${purchaseData.gstin}\n`;
            preview += `📊 Items: ${purchaseData.items.length}\n\n`;
            preview += `📝 *Items:*\n`;
            purchaseData.items.slice(0, 5).forEach((item, i) => {
                preview += `   ${i+1}. ${item.part} x${item.qty} @ ₹${item.price} = ₹${(item.qty * item.price).toFixed(2)}\n`;
            });
            if (purchaseData.items.length > 5) {
                preview += `   ... and ${purchaseData.items.length - 5} more items\n`;
            }
            preview += `\n💰 Total: ₹${purchaseData.total.toFixed(2)}\n\n`;
            preview += `✅ *Reply "CONFIRM" to process this purchase.*\n`;
            preview += `✏️ *Reply "EDIT" to modify details.*\n`;
            preview += `❌ *Reply "CANCEL" to cancel.*\n\n`;
            preview += `📞 Call: ${CONFIG.businessPhone}`;
            
            await sendWhatsAppMessage(from, preview);
            pendingPurchaseUpload.set(from, { 
                step: 'awaiting_confirmation', 
                data: purchaseData,
                imageBuffer: fileBuffer
            });
            return;
        }
        
        // Process as customer order
        if (extractedItems.length > 0) {
            await processExtractedItems(from, extractedItems, filename);
        } else {
            await sendWhatsAppMessage(from, 
                `⚠️ *No valid items found in document.*\n\n` +
                `💡 Please ensure your document contains part numbers (5-20 alphanumeric characters).\n\n` +
                `📝 You can also type the part numbers directly.\n` +
                `📞 Call: ${CONFIG.businessPhone}`
            );
        }
        
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
// 🧠 GEMINI VISION EXTRACTION
// ============================================================

async function extractWithGeminiVision(base64Data, mimeType, filename) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${CONFIG.geminiKey}`;
    
    const prompt = `Extract the following information from this document:

1. SELLER/SUPPLIER NAME: The name of the seller or supplier
2. INVOICE NUMBER: The invoice or bill number
3. DATE: The invoice date
4. PART NUMBERS: All part numbers (alphanumeric, 5-20 characters like 1103ACB00011N)
5. QUANTITIES: The quantity for each part number
6. PRICES: The price for each part number (if available)
7. TOTAL AMOUNT: The total invoice amount
8. GSTIN: The GSTIN number (if available)

Return the extracted data in this EXACT JSON format:
{
    "seller": "ABC Auto Parts",
    "invoiceNo": "INV-2026-001",
    "date": "26/07/2026",
    "items": [
        {"part": "1103ACB00011N", "qty": 10, "price": 1250, "total": 12500}
    ],
    "total": 12500,
    "gstin": "19ABCDE1234F1Z5"
}

If a field is not found, use null.
If it's not a purchase invoice, return {"notPurchase": true}.

Document: ${filename}`;

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{
                parts: [
                    { text: prompt },
                    {
                        inline_data: {
                            mime_type: mimeType,
                            data: base64Data
                        }
                    }
                ]
            }],
            generationConfig: {
                temperature: 0.1,
                maxOutputTokens: 500
            }
        })
    });
    
    const data = await response.json();
    console.log(`📊 Gemini response received`);
    
    if (response.ok && data.candidates?.[0]?.content?.parts?.[0]?.text) {
        const content = data.candidates[0].content.parts[0].text.trim();
        console.log(`📝 Gemini extracted: "${content.substring(0, 300)}..."`);
        
        try {
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
        } catch (parseError) {
            console.log(`⚠️ Failed to parse JSON:`, parseError.message);
            const items = extractItemsFromText(content);
            if (items.length > 0) {
                return { items };
            }
        }
    }
    return null;
}

// ============================================================
// 📦 EXTRACT ITEMS FROM TEXT
// ============================================================

function extractItemsFromText(text) {
    const items = [];
    const lines = text.split('\n');
    const partRegex = /\b([A-Z0-9]{5,20})\b/g;
    const qtyRegex = /(?:x|qty|quantity|qty:|x:)\s*(\d+)/i;
    
    for (const line of lines) {
        const parts = line.match(partRegex);
        if (parts) {
            for (const part of parts) {
                const qtyMatch = line.match(qtyRegex);
                const qty = qtyMatch ? parseInt(qtyMatch[1]) : 1;
                items.push({ part: part, qty: qty });
            }
        }
    }
    return items;
}

// ============================================================
// 🛒 PROCESS EXTRACTED ITEMS
// ============================================================

async function processExtractedItems(from, extractedItems, filename) {
    let foundItems = [];
    let notFound = [];
    let outOfStock = [];
    let total = 0;
    
    for (const item of extractedItems) {
        let product = await db.getProductExact(item.part);
        if (!product) {
            const results = await db.searchProducts(item.part, 1);
            if (results && results.length > 0) {
                product = results[0];
            }
        }
        
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
                await customerLog.trackOutOfStock(from, product.part, product.description, item.qty || 1);
            }
        } else {
            notFound.push(item.part);
        }
    }
    
    if (foundItems.length === 0) {
        await sendWhatsAppMessage(from, 
            `❌ *No products found*\n\n` +
            `Not found: ${notFound.join(', ')}\n\n` +
            `💡 Please check the part numbers.\n` +
            `📞 Call: ${CONFIG.businessPhone}`
        );
        return;
    }
    
    const cartItems = foundItems.map(item => ({
        part: item.part,
        description: item.description,
        qty: item.qty,
        price: item.price,
        list_price: item.list_price,
        mrp: item.mrp,
        billing_price: item.billing_price
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
        reply += `📝 ${item.description}\n`;
        if (item.list_price > 0) reply += `💰 LIST PRICE: ₹${item.list_price.toFixed(2)}\n`;
        if (item.mrp > 0) reply += `💰 MRP PRICE: ₹${item.mrp.toFixed(2)}\n`;
        reply += `💳 ₹${item.price.toFixed(2)} × ${item.qty} = ₹${itemTotal.toFixed(2)}\n`;
        reply += `📦 ${item.stock > 0 ? `✅ ${item.stock} pcs` : '❌ Out of Stock'}\n\n`;
    }
    
    reply += `━━━━━━━━━━━━━━━━━━━━\n`;
    reply += `💰 *Total: ₹${total.toFixed(2)}* (incl. GST)\n`;
    reply += `━━━━━━━━━━━━━━━━━━━━\n\n`;
    
    if (outOfStock.length > 0) {
        reply += `⚠️ Out of Stock: ${outOfStock.join(', ')}\n`;
        reply += `🔔 We'll notify you when available.\n\n`;
    }
    
    if (notFound.length > 0) {
        reply += `❌ Not found: ${notFound.join(', ')}\n\n`;
    }
    
    reply += `✅ *Confirm order?* Reply "Confirm Order"\n`;
    reply += `🗑️ *Clear Cart* - Start fresh\n\n`;
    reply += `📞 Call: ${CONFIG.businessPhone}`;
    
    await sendWhatsAppMessage(from, reply);
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

        // Welcome / Help
        if (['hi', 'hello', 'help', 'start', 'menu'].includes(msgLower)) {
            await sendWhatsAppMessage(from, 
                `👋 *Welcome to Auto Spares Solution!*\n\n` +
                `🤖 I'm your AI Sales Assistant\n\n` +
                `🔍 *Search:* Send part number or description\n` +
                `📸 *Send Photo:* Take photo of your order list\n` +
                `🎙️ *Send Voice:* Speak your order\n` +
                `🛒 *Order:* "ORDER 0801BA0285N 2"\n` +
                `📞 *Call:* ${CONFIG.businessPhone}\n` +
                `🛒 *Shop:* https://autosparessolution.com`
            );
            return;
        }

        // 🔍 EXACT PART NUMBER MATCH - Priority 1
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

        // Part number with extra words
        const partInMessage = cleaned.match(/\b([A-Z0-9]{5,20})\b/);
        if (partInMessage) {
            const partNumber = partInMessage[1];
            console.log(`🔍 Part number found in message: ${partNumber}`);
            
            const exactProduct = await db.getProductExact(partNumber);
            if (exactProduct) {
                const qtyMatch = cleaned.match(new RegExp(`${partNumber}\\s*(\\d+)`, 'i'));
                const quantity = qtyMatch ? parseInt(qtyMatch[1]) : 1;
                
                let reply = `🔍 *Exact Match Found for "${partNumber}"*\n\n`;
                reply += formatProductForWhatsApp(exactProduct, 0);
                
                if (quantity > 1) {
                    const price = (exactProduct.billing_price || exactProduct.list_price || 0) * 1.18;
                    const total = price * quantity;
                    reply += `\n📦 *Quantity: ${quantity}*\n`;
                    reply += `💰 *Total: ₹${total.toFixed(2)}*\n\n`;
                    reply += `✅ Reply "CONFIRM ORDER" to place order\n`;
                } else {
                    reply += `\n🛒 To order: "${exactProduct.part} 2"\n`;
                }
                reply += `📞 Call: ${CONFIG.businessPhone}`;
                await sendWhatsAppMessage(from, reply);
                return;
            }
        }

        // 📦 MULTI-PRODUCT DETECTION
        const allParts = text.match(/\b[A-Z0-9]{5,20}\b/gi);
        const uniqueParts = allParts ? [...new Set(allParts.map(p => p.toUpperCase()))] : [];

        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        const hasMultipleParts = uniqueParts.length > 1;
        const hasMultipleLines = lines.length > 1;
        const separatorParts = text.match(/[A-Z0-9]{5,20}\s*[-/xX:]\s*\d+/gi);
        const hasMultipleSeparatorParts = separatorParts && separatorParts.length > 1;
        const isMultiProduct = hasMultipleParts || hasMultipleLines || hasMultipleSeparatorParts;

        console.log(`📋 Multi-product check: parts=${uniqueParts.length}, lines=${lines.length}, separators=${separatorParts ? separatorParts.length : 0}`);

        if (isMultiProduct) {
            console.log(`📋 Processing multi-product enquiry...`);
            
            const parsedResult = parseOrder(text);
            const items = parsedResult.items;
            
            console.log(`📦 Parsed ${items.length} items`);
            
            if (items.length > 0) {
                let foundItems = [];
                let notFound = [];
                let outOfStock = [];
                let total = 0;
                
                for (const item of items) {
                    let product = await db.getProductExact(item.part);
                    if (!product) {
                        const results = await db.searchProducts(item.part, 1);
                        if (results && results.length > 0) {
                            product = results[0];
                        }
                    }
                    
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
                        }
                    } else {
                        notFound.push(item.part);
                    }
                }
                
                if (foundItems.length > 0) {
                    const cartItems = foundItems.map(item => ({
                        part: item.part,
                        description: item.description,
                        qty: item.qty,
                        price: item.price,
                        list_price: item.list_price,
                        mrp: item.mrp,
                        billing_price: item.billing_price
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
                        reply += `💳 ₹${item.price.toFixed(2)} × ${item.qty} = ₹${itemTotal.toFixed(2)}\n\n`;
                    }
                    
                    reply += `━━━━━━━━━━━━━━━━━━━━\n`;
                    reply += `💰 *Total: ₹${total.toFixed(2)}* (incl. GST)\n`;
                    reply += `━━━━━━━━━━━━━━━━━━━━\n\n`;
                    
                    if (outOfStock.length > 0) {
                        reply += `⚠️ Out of Stock: ${outOfStock.join(', ')}\n`;
                        reply += `🔔 We'll notify you when available.\n\n`;
                    }
                    
                    if (notFound.length > 0) {
                        reply += `❌ Not found: ${notFound.join(', ')}\n\n`;
                    }
                    
                    reply += `✅ *Confirm order?* Reply "Confirm Order"\n`;
                    reply += `🗑️ *Clear Cart* - Start fresh\n\n`;
                    reply += `📞 Call: ${CONFIG.businessPhone}`;
                    
                    await sendWhatsAppMessage(from, reply);
                    return;
                }
            }
        }

        // 🔍 SEARCH PRODUCTS - Using optimized search
        if (cleaned.length >= 2) {
            const commonWords = ['i', 'need', 'want', 'for', 'my', 'the', 'a', 'an', 'me', 'please', 'from', 'to', 'of', 'with', 'have', 'has', 'is', 'are', 'was', 'were', 'and', 'or', 'but'];
            let searchWords = cleaned.toLowerCase().split(' ').filter(w => !commonWords.includes(w) && w.length > 1).join(' ');
            if (!searchWords) searchWords = cleaned;

            console.log(`🔍 Searching for: "${searchWords}"`);

            // Use optimized search (parallel)
            let results = await optimizedSearch(searchWords, 10);

            if (results.length === 0) {
                console.log(`🔄 No results, trying word-by-word search...`);
                const words = cleaned.split(' ').filter(w => w.length > 2 && !commonWords.includes(w.toLowerCase()));
                // Try each word in parallel
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

        // 💰 PRICE CHECK
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

        // 📦 STOCK CHECK
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

        // 🛒 SINGLE PRODUCT ORDER
        const partNumber = extractPartNumber(cleaned);
        const quantity = extractQuantity(cleaned);

        if (partNumber && quantity && quantity > 0) {
            let product = await db.getProductExact(partNumber);
            if (!product) product = await db.getProduct(partNumber);
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
                if (product.list_price > 0) reply += `💰 LIST PRICE: ₹${product.list_price.toFixed(2)}\n`;
                if (product.mrp > 0) reply += `💰 MRP PRICE: ₹${product.mrp.toFixed(2)}\n`;
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

        // ✅ CONFIRM ORDER
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

        // 🗑️ CLEAR CART
        if (msgLower === 'clear cart' || msgLower === 'clear') {
            await db.clearCart(from);
            await sendWhatsAppMessage(from, '🗑️ Cart cleared!');
            return;
        }

        // 🤖 GEMINI WEB SEARCH FALLBACK
        console.log(`🔄 No product found. Trying Gemini...`);
        const geminiReply = await withTimeout(
            getGeminiWebSearch(cleaned),
            5000,
            'Gemini web search timed out'
        );
        if (geminiReply) {
            await sendWhatsAppMessage(from, `🤖 ${geminiReply}`);
            return;
        }

        // ❌ NO RESULTS
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
// 🤖 GEMINI WEB SEARCH
// ============================================================

const geminiCache = new LRUCache({
    max: 1000,
    ttl: 15 * 60 * 1000
});

async function getGeminiWebSearch(query) {
    if (!CONFIG.geminiKey) return null;
    
    const cacheKey = query.toLowerCase().trim();
    if (geminiCache.has(cacheKey)) {
        return geminiCache.get(cacheKey);
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
            geminiCache.set(cacheKey, content);
            return content;
        }
        return null;

    } catch (error) {
        console.error('❌ Gemini web search error:', error.message);
        return null;
    }
}

// ============================================================
// 📦 PURCHASE HELPER FUNCTIONS
// ============================================================

async function processPurchaseInvoice(adminPhone, purchaseData) {
    try {
        const { supplier, invoiceNo, date, items } = purchaseData;
        
        if (!supplier || items.length === 0) {
            await sendWhatsAppMessage(adminPhone, 
                `❌ *Invalid Purchase Data*\n\nPlease provide Supplier and at least one item.`
            );
            return;
        }

        let supplierRecord = await db.getSupplierByName(supplier);
        if (!supplierRecord) {
            const supplierId = await db.createSupplier({
                name: supplier,
                phone: '',
                email: `supplier_${Date.now()}@temp.com`,
                address: '',
                gstin: '',
                state: ''
            });
            supplierRecord = await db.getSupplierById(supplierId);
        }

        let purchaseItems = [];
        let totalPurchase = 0;

        for (const item of items) {
            let product = await db.getProductExact(item.part);
            if (!product) {
                await db.importProducts([{
                    part: item.part,
                    description: `Purchased from ${supplier}`,
                    brand: 'Unknown',
                    make: '',
                    stock: 0,
                    list_price: item.price || 0,
                    billing_price: item.price || 0,
                    mrp: item.price || 0,
                    hsn: item.hsn || ''
                }]);
                product = await db.getProductExact(item.part);
            }

            const oldStock = product ? product.stock : 0;
            const newStock = oldStock + (item.qty || 0);
            
            if (product) {
                await db.db.run(
                    'UPDATE products SET stock = ?, updated_at = CURRENT_TIMESTAMP WHERE part = ?',
                    [newStock, item.part]
                );
            }

            await db.recordStockTransaction({
                sku: item.part,
                productName: product?.description || item.part,
                transactionType: 'Purchase',
                inQty: item.qty || 0,
                outQty: 0,
                reference: `Purchase Invoice ${invoiceNo}`,
                invoiceNo: invoiceNo,
                metadata: { 
                    supplier: supplier, 
                    cost: item.price || 0, 
                    total: (item.qty || 0) * (item.price || 0),
                    hsn: item.hsn || '' 
                }
            });

            purchaseItems.push({
                part: item.part,
                qty: item.qty || 0,
                cost: item.price || 0,
                total: (item.qty || 0) * (item.price || 0),
                description: product?.description || '',
                hsn: item.hsn || ''
            });

            totalPurchase += (item.qty || 0) * (item.price || 0);
        }

        const purchaseInvoice = {
            id: `PUR-${Date.now()}`,
            invoiceNo: invoiceNo || `PUR-${Date.now().toString().slice(-6)}`,
            supplier: supplier,
            supplierId: supplierRecord?.id,
            date: date || new Date().toISOString().split('T')[0],
            items: purchaseItems,
            total: totalPurchase,
            gst: 0,
            grandTotal: totalPurchase,
            gstin: '',
            status: 'completed',
            created_at: new Date().toISOString()
        };

        await db.savePurchaseInvoice(purchaseInvoice);

        if (supplierRecord) {
            await db.updateSupplierOutstanding(supplierRecord.id, totalPurchase);
        }

        let reply = `✅ *PURCHASE INVOICE PROCESSED!*\n\n`;
        reply += `📄 Supplier: ${supplier}\n`;
        reply += `📄 Invoice No: ${invoiceNo || 'Auto-generated'}\n`;
        reply += `📄 Date: ${date || new Date().toISOString().split('T')[0]}\n`;
        reply += `📊 Items: ${purchaseItems.length}\n`;
        reply += `💰 Total: ₹${totalPurchase.toFixed(2)}\n\n`;
        reply += `📦 *Stock Updated:*\n`;
        purchaseItems.slice(0, 5).forEach(item => {
            reply += `   ${item.part} x${item.qty} @ ₹${item.cost.toFixed(2)} = ₹${item.total.toFixed(2)}\n`;
        });
        if (purchaseItems.length > 5) {
            reply += `   ... and ${purchaseItems.length - 5} more items\n`;
        }
        reply += `\n✅ Stock ledger updated.\n📞 Call: ${CONFIG.businessPhone}`;

        await sendWhatsAppMessage(adminPhone, reply);
        pendingPurchaseUpload.delete(adminPhone);

    } catch (error) {
        console.error('❌ Process purchase error:', error.message);
        await sendWhatsAppMessage(adminPhone, 
            `❌ *Failed to process purchase:* ${error.message}`
        );
    }
}

// ============================================================
// 🚀 START SERVER - FAST STARTUP (No CSV blocking)
// ============================================================

// Track import status
let csvImportStarted = false;
let csvImportCompleted = false;

// Background CSV import
async function importCSVInBackground() {
    if (csvImportStarted) return;
    csvImportStarted = true;
    
    try {
        const csvPath = path.join(__dirname, 'prices.csv');
        if (fs.existsSync(csvPath)) {
            console.log('📥 Background CSV import started...');
            const result = await importCSV(csvPath);
            console.log(`✅ Background import completed: ${result.imported} products`);
            csvImportCompleted = true;
        } else {
            console.log('⚠️ prices.csv not found, skipping import');
            csvImportCompleted = true;
        }
    } catch (error) {
        console.error('❌ Background import error:', error.message);
        csvImportCompleted = true;
    }
}

async function startServer() {
    console.log('====================================');
    console.log('🚀 ASSIST WhatsApp Webhook v3.0 - COMPLETE FIXED');
    console.log(`📞 Business Phone: ${CONFIG.businessPhone}`);
    console.log(`🗄️ Database: ${process.env.DB_PATH || './db/products.db'}`);
    console.log('====================================');
    
    try {
        // 1. Initialize database (fast)
        await db.initDatabase();
        console.log('✅ Database initialized');

        // 2. Create tables (fast)
        await initAllTables();
        console.log('✅ All tables ready');

        // 3. Check if products exist - DON'T import here (non-blocking)
        const stats = await db.getStats();
        if (stats.total_products === 0) {
            console.log('📦 No products found. Starting background import...');
            // Start import in background (non-blocking)
            setImmediate(importCSVInBackground);
        } else {
            console.log(`📦 ${stats.total_products} products already in database`);
        }

        // 4. Initialize other modules (fast)
        if (dealerIntelligence && dealerIntelligence.init) {
            dealerIntelligence.init();
        }

        // 5. Start scheduler
        scheduler.startScheduler();
        console.log('✅ Scheduler started');

        // 6. ✅ START SERVER IMMEDIATELY - Don't wait for import
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`🚀 Server Running On Port ${PORT}`);
            console.log(`🔗 Health Check: /health`);
            console.log(`📱 Webhook: /webhook`);
            console.log(`📊 Admin Dashboard: /api/admin/dashboard`);
            console.log(`🎙️ Voice Processing: ${CONFIG.geminiKey ? '✅ Active' : '⚠️ Limited'}`);
            console.log(`📸 Image Processing: ${CONFIG.geminiKey ? '✅ Active' : '⚠️ Limited'}`);
            console.log(`📄 Document Processing: ${CONFIG.geminiKey ? '✅ Active' : '⚠️ Limited'}`);
            console.log(`💾 Memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`);
            console.log(`⏱️ Response Timeout: ${CONFIG.responseTimeout}ms`);
            console.log(`⏱️ Gemini Timeout: ${CONFIG.geminiTimeout}ms`);
            console.log(`📦 Import Status: ${csvImportStarted ? 'In progress...' : 'Not started'}`);
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
