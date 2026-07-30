// ============================================================
// 🚀 ASSIST WhatsApp Webhook v3.0 - FULLY INTEGRATED
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
    geminiTimeout: 30000,
    responseTimeout: 60000,
    debug: process.env.DEBUG === 'true'
};

const ADMIN_PHONE = process.env.ADMIN_PHONE || "9830300193";

console.log('====================================');
console.log('🚀 ASSIST WhatsApp Webhook v3.0 - FULLY INTEGRATED');
console.log(`📞 Business Phone: ${CONFIG.businessPhone}`);
console.log(`🔐 Admin Phone: ${ADMIN_PHONE}`);
console.log(`🆔 Phone Number ID: ${CONFIG.phoneNumberId}`);
console.log(`🔑 Token: ${CONFIG.accessToken ? '✅ Set' : '❌ Not set'}`);
console.log(`🧠 Gemini: ${CONFIG.geminiKey ? '✅ Set' : '❌ Not set'}`);
console.log(`⏱️ Gemini Timeout: ${CONFIG.geminiTimeout}ms`);
console.log(`⏱️ Response Timeout: ${CONFIG.responseTimeout}ms`);
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
// 🤖 GEMINI RATE LIMITER - CRITICAL FIX (from v2)
// ============================================================

class GeminiRateLimiter {
    constructor() {
        this.queue = [];
        this.processing = false;
        this.minDelay = 2000; // 2 seconds between requests
        this.lastRequest = 0;
        this.maxRetries = 3;
        this.retryDelay = 5000;
        this.requestCount = 0;
        this.windowStart = Date.now();
        this.maxRequestsPerMinute = 15;
    }

    async request(prompt, data, mimeType = 'image/jpeg', retries = 0) {
        // Check rate limit
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

        // Wait between requests
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

// Initialize Gemini rate limiter
const geminiRateLimiter = new GeminiRateLimiter();

// ============================================================
// 💾 GEMINI CACHE (from v2)
// ============================================================

const geminiCache = new LRUCache({
    max: 100,
    ttl: 60 * 60 * 1000 // 1 hour
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
            systemError: '❌'
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
            systemError: 'System Error ❌'
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

    async sendOrderConfirmation(phone, orderId, items, total) {
        let message = `📋 *Order #${orderId}*\n\n`;
        message += `📝 Items:\n`;
        items.forEach((item, index) => {
            message += `   ${index + 1}. ${item.part} x${item.qty} = ₹${(item.price * item.qty).toFixed(2)}\n`;
        });
        message += `\n💰 *Total: ₹${total.toFixed(2)}*`;
        
        await this.sendUserAlert(phone, 'orderConfirmation', message, { orderId, items, total });
    }

    async sendOutOfStockAlert(phone, part, description) {
        const message = `❌ *Out of Stock*\n\n` +
                        `Part: ${part}\n` +
                        `📝 ${description || 'N/A'}\n\n` +
                        `🔔 We'll notify you when it's back in stock!`;
        
        await this.sendUserAlert(phone, 'outOfStock', message, { part, description });
    }

    async sendNewOrderAlert(orderId, customer, items, total) {
        const message = `🆕 *New Order!*\n\n` +
                        `📦 Order: ${orderId}\n` +
                        `👤 Customer: ${customer}\n` +
                        `📝 Items: ${items.length}\n` +
                        `💰 Total: ₹${total.toFixed(2)}\n\n` +
                        `✅ Process order now`;
        
        await this.sendUserAlert(ADMIN_PHONE, 'newOrder', message, { orderId, customer, items, total });
    }

    async sendImportCompleteAlert(products) {
        const message = `✅ *Import Complete!*\n\n` +
                        `📦 ${products} products loaded\n` +
                        `⏱️ System ready for requests\n\n` +
                        `🚀 Bot is now active`;
        
        await this.sendUserAlert(ADMIN_PHONE, 'importComplete', message, { products });
    }
}

const alertSystem = new AlertSystem();

// ============================================================
// 📦 DATABASE READY FLAG
// ============================================================

let isDbReady = false;
let dbReadyMessage = 'Loading database...';
let importProgress = 0;
const TOTAL_PRODUCTS = 93098;

// ============================================================
// 🗄️ DATABASE INITIALIZATION - FIXED
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

        // ============================================================
        // 📋 OUT OF STOCK TRACKING TABLE
        // ============================================================
        
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

        // ============================================================
        // 🛠️ FIX: ADD MISSING COLUMNS - THIS IS THE CRITICAL FIX
        // ============================================================
        
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

        // ============================================================
        // 📋 ALERTS TABLE
        // ============================================================
        
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
        console.log('✅ Indexes created');
    } catch (error) {
        console.error('❌ Index creation error:', error.message);
    }
}

// ============================================================
// 🏥 HEALTH CHECK - Enhanced with Gemini status (from v2)
// ============================================================

app.get('/health', async (req, res) => {
    try {
        const stats = await db.getStats();
        res.json({ 
            status: isDbReady ? 'ready' : 'loading',
            version: '3.0.0',
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
            import: '/api/import-status'
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
// 🤖 GEMINI STATUS API (from v2)
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
// 📊 IMPORT STATUS API (from v2)
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
        
        // ✅ Check if database is ready
        if (!isDbReady) {
            const progress = Math.round((importProgress / TOTAL_PRODUCTS) * 100);
            
            await sendWhatsAppMessage(from, 
                `⏳ *System is Loading...*\n\n` +
                `📊 Progress: ${progress}%\n` +
                `⏱️ Please wait ${Math.ceil((100 - progress) / 3)} seconds\n\n` +
                `💡 Try again in a moment!\n` +
                `📞 Call: ${CONFIG.businessPhone}`
            );
            
            markMessageProcessed(messageId);
            return res.sendStatus(200);
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
// 📤 SEND WHATSAPP MESSAGE - WITH RETRY LOGIC (from v2)
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
// 🎙️ VOICE MESSAGE HANDLER - ENHANCED (from v2)
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
        
        // ✅ Use rate limiter (from v2)
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
// 📸 IMAGE HANDLER - ENHANCED (from v2)
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

        // ✅ Check cache first (from v2)
        const cacheKey = `image_${imageBuffer.length}_${caption}`;
        let extractedText = null;
        
        if (geminiCache.has(cacheKey)) {
            console.log(`📦 Returning cached result for image`);
            extractedText = geminiCache.get(cacheKey);
        } else {
            console.log(`🤖 Processing image with Gemini Vision...`);
            
            // ✅ Enhance image quality (from v2)
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

            // ✅ Use rate limiter (from v2)
            const data = await geminiRateLimiter.request(prompt, base64Image, 'image/jpeg');
            
            if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
                let content = data.candidates[0].content.parts[0].text.trim();
                console.log(`📝 Gemini extracted: "${content}"`);
                
                content = content.replace(/^["']|["']$/g, '').trim();
                
                if (content !== 'NO_PARTS_FOUND' && content.length > 3) {
                    // Extract valid part numbers
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
            
            // Cache the result (from v2)
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
            
            // ✅ Try Tesseract fallback if available (from v2)
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
// 📱 HANDLE WHATSAPP TEXT MESSAGE - SIMPLIFIED
// ============================================================

async function handleWhatsAppMessage(message, from) {
    try {
        const text = message.text?.body || '';
        console.log(`💬 Message: "${text}"`);
        
        const cleaned = text.replace(/^["']|["']$/g, '').replace(/["']/g, '').replace(/\s+/g, ' ').trim();
        const msgLower = cleaned.toLowerCase().trim();

        // ============================================================
        // 1️⃣ WELCOME / HELP
        // ============================================================
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

        // ============================================================
        // 2️⃣ CHECK: Is this MULTI-PRODUCT?
        // ============================================================
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

        // ============================================================
        // 3️⃣ CHECK: Exact part number
        // ============================================================
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

        // ============================================================
        // 4️⃣ CHECK: Part number with quantity
        // ============================================================
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
                
                let reply = `🛒 *ORDER SUMMARY*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
                reply += `*${exactProduct.part}* x${quantity}\n`;
                reply += `📝 ${exactProduct.description}\n`;
                if (exactProduct.list_price > 0) reply += `💰 LIST PRICE: ₹${exactProduct.list_price.toFixed(2)}\n`;
                if (exactProduct.mrp > 0) reply += `💰 MRP PRICE: ₹${exactProduct.mrp.toFixed(2)}\n`;
                reply += `💳 ₹${priceWithGST.toFixed(2)} × ${quantity} = ₹${total.toFixed(2)}\n\n`;
                reply += `━━━━━━━━━━━━━━━━━━━━\n`;
                reply += `💰 *Total: ₹${total.toFixed(2)}* (incl. GST)\n`;
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

        // ============================================================
        // 5️⃣ CHECK: Part number only
        // ============================================================
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

        // ============================================================
        // 6️⃣ CHECK: Confirm Order
        // ============================================================
        if (msgLower === 'confirm order' || msgLower === 'confirm') {
            const cart = await db.getCart(from);
            if (cart && cart.items) {
                const items = JSON.parse(cart.items);
                const orderId = `ORD-${Date.now().toString().slice(-6)}`;
                await db.saveOrder(orderId, from, items, cart.total);
                await db.clearCart(from);
                
                await alertSystem.sendOrderConfirmation(from, orderId, items, cart.total);
                await alertSystem.sendNewOrderAlert(orderId, from, items, cart.total);
                
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
        // 7️⃣ CHECK: Clear Cart
        // ============================================================
        if (msgLower === 'clear cart' || msgLower === 'clear') {
            await db.clearCart(from);
            await sendWhatsAppMessage(from, '🗑️ Cart cleared!');
            return;
        }

        // ============================================================
        // 8️⃣ CHECK: Price Check
        // ============================================================
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

        // ============================================================
        // 9️⃣ CHECK: Stock Check
        // ============================================================
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

        // ============================================================
        // 🔟 SEARCH PRODUCTS
        // ============================================================
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

        // ============================================================
        // 1️⃣1️⃣ GEMINI FALLBACK
        // ============================================================
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

        // ============================================================
        // 1️⃣2️⃣ NO RESULTS
        // ============================================================
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
// 📄 DOCUMENT MESSAGE HANDLER - ENHANCED
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
        
        // ============================================================
        // 📊 PROCESS EXCEL FILE
        // ============================================================
        
        let extractedItems = [];
        let documentMetadata = {};
        
        if (isExcel && XLSX) {
            console.log(`📊 Processing Excel file: ${filename}`);
            
            try {
                // Read Excel file
                const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                const jsonData = XLSX.utils.sheet_to_json(firstSheet);
                
                console.log(`📊 Found ${jsonData.length} rows in Excel`);
                
                // Try to find part numbers in the Excel data
                for (const row of jsonData) {
                    // Look for part number in any column
                    const rowValues = Object.values(row);
                    for (const value of rowValues) {
                        if (typeof value === 'string') {
                            // Check if it looks like a part number
                            const partMatch = value.match(/\b([A-Z0-9]{5,20})\b/i);
                            if (partMatch) {
                                const partNumber = partMatch[1].toUpperCase();
                                
                                // Look for quantity in the same row
                                let qty = 1;
                                for (const v of rowValues) {
                                    const num = parseFloat(v);
                                    if (!isNaN(num) && num > 0 && num < 1000) {
                                        qty = Math.round(num);
                                        break;
                                    }
                                }
                                
                                extractedItems.push({
                                    part: partNumber,
                                    qty: qty,
                                    row: row
                                });
                            }
                        }
                    }
                }
                
                console.log(`📊 Extracted ${extractedItems.length} items from Excel`);
                
            } catch (excelError) {
                console.error('❌ Excel processing error:', excelError.message);
            }
        }
        
        // ============================================================
        // 🤖 USE GEMINI VISION FOR PDF/IMAGES (or fallback)
        // ============================================================
        
        if (extractedItems.length === 0 && CONFIG.geminiKey) {
            console.log(`🤖 Using Gemini Vision for extraction`);
            
            try {
                const base64Data = fileBuffer.toString('base64');
                const mimeTypeForGemini = isPDF ? 'application/pdf' : 
                                         isExcel ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' :
                                         mimeType || 'image/jpeg';
                
                const prompt = `Extract ALL part numbers from this document.
                
CRITICAL RULES:
1. Look for PART NUMBERS (alphanumeric, 5-20 characters like 0801BA0285N)
2. Look for QUANTITIES (numbers after part numbers)
3. Extract EVERY part number you can find
4. If quantity is present, include it (format: PART_NUMBER QUANTITY)
5. If multiple parts, list each on new line
6. DO NOT return random numbers unless they are part of a part number

OUTPUT FORMAT:
- Single part: "PART_NUMBER QUANTITY"
- Multiple parts: "PART_NUMBER1 QUANTITY1\nPART_NUMBER2 QUANTITY2"

Document: ${filename}`;

                const data = await geminiRateLimiter.request(prompt, base64Data, mimeTypeForGemini);
                
                if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
                    const content = data.candidates[0].content.parts[0].text.trim();
                    console.log(`📝 Gemini extracted: "${content}"`);
                    
                    // Parse Gemini output
                    const lines = content.split('\n');
                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (!trimmed) continue;
                        
                        const partMatch = trimmed.match(/\b([A-Z0-9]{5,20})\b/i);
                        if (partMatch) {
                            const partNumber = partMatch[1].toUpperCase();
                            const qtyMatch = trimmed.match(/(\d+)/);
                            const qty = qtyMatch ? parseInt(qtyMatch[1]) : 1;
                            
                            // Avoid duplicates
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
        
        // ============================================================
        // 📊 PROCESS EXTRACTED ITEMS
        // ============================================================
        
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
        
        // ============================================================
        // 🛒 CREATE ORDER FROM EXTRACTED ITEMS
        // ============================================================
        
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
        
        // Save to cart
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
        
        // Build order summary
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
// 🚀 START SERVER
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
            
            // Send import complete alert to admin
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

async function startServer() {
    console.log('====================================');
    console.log('🚀 ASSIST WhatsApp Webhook v3.0 - FULLY INTEGRATED');
    console.log(`📞 Business Phone: ${CONFIG.businessPhone}`);
    console.log(`🗄️ Database: ${process.env.DB_PATH || './db/products.db'}`);
    console.log('====================================');
    
    try {
        await db.initDatabase();
        console.log('✅ Database initialized');

        await initAllTables();
        console.log('✅ All tables ready');

        const stats = await db.getStats();
        if (stats.total_products === 0) {
            console.log('📦 No products found. Starting background import...');
            setImmediate(importCSVInBackground);
        } else {
            console.log(`📦 ${stats.total_products} products already in database`);
            importProgress = stats.total_products;
            isDbReady = true;
            dbReadyMessage = 'Database ready';
            
            // Send ready alert to admin
            await alertSystem.sendImportCompleteAlert(stats.total_products);
        }

        if (dealerIntelligence && dealerIntelligence.init) {
            dealerIntelligence.init();
        }

        scheduler.startScheduler();
        console.log('✅ Scheduler started');

        app.listen(PORT, '0.0.0.0', () => {
            console.log(`🚀 Server Running On Port ${PORT}`);
            console.log(`🔗 Health Check: /health`);
            console.log(`📱 Webhook: /webhook`);
            console.log(`📊 Admin Dashboard: /api/admin/dashboard`);
            console.log(`🎙️ Voice Processing: ✅ Active (with rate limiter)`);
            console.log(`📸 Image Processing: ✅ Active (with rate limiter)`);
            console.log(`🤖 Gemini Rate Limiter: ✅ Active (2s delay, 3 retries)`);
            console.log(`📢 Alert System: ✅ Active`);
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
