// ============================================================
// 🚀 ASSIST WhatsApp Webhook v3.1 - COMPLETE FINAL
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
const { parseOrder, extractPartNumber } = require('./modules/order-parser');
const scheduler = require('./modules/scheduler');
const invoice = require('./modules/invoice');

// Brand Manager
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

// Brand Collage Generator
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

// Optional modules
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

let XLSX = null;
try { XLSX = require('xlsx'); } catch(e) {}

let ExcelJS = null;
try { ExcelJS = require('exceljs'); } catch(e) {}

let PdfPrinter = null;
try { PdfPrinter = require('pdfmake'); } catch(e) {}

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
    geminiKey: process.env.GEMINI_KEY,
    responseTimeout: 60000,
    debug: process.env.DEBUG === 'true'
};

const ADMIN_PHONE = process.env.ADMIN_PHONE || "9830300193";

console.log('====================================');
console.log('🚀 ASSIST WhatsApp Webhook v3.1 - COMPLETE FINAL');
console.log(`📞 Business Phone: ${CONFIG.businessPhone}`);
console.log(`🔐 Admin Phone: ${ADMIN_PHONE}`);
console.log(`🆔 Phone Number ID: ${CONFIG.phoneNumberId}`);
console.log(`🔑 Token: ${CONFIG.accessToken ? '✅ Set' : '❌ Not set'}`);
console.log(`🧠 Gemini: ${CONFIG.geminiKey ? '✅ Set' : '❌ Not set'}`);
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
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" }, contentSecurityPolicy: false }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    message: 'Too many requests, please try again later.'
});
app.use('/webhook', limiter);

// ============================================================
// 🛡️ DUPLICATE MESSAGE DETECTION
// ============================================================

const messageCache = new LRUCache({ max: 5000, ttl: 120000 });
const processingSet = new Set();

function isMessageProcessed(messageId) {
    if (!messageId) return false;
    if (processingSet.has(messageId)) return true;
    if (messageCache.has(messageId)) return true;
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
// 📤 SEND WHATSAPP MESSAGE
// ============================================================

async function sendWhatsAppMessage(to, message) {
    const maxRetries = 3;
    let retries = 0;
    
    while (retries < maxRetries) {
        try {
            const normalizedPhone = to.replace(/\D/g, '');
            const url = `https://graph.facebook.com/v23.0/${CONFIG.phoneNumberId}/messages`;
            
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
                    await new Promise(resolve => setTimeout(resolve, 5000));
                    retries++;
                    continue;
                }
                throw new Error(`WhatsApp API error ${response.status}: ${errorText}`);
            }
            
            const result = await response.json();
            if (result.messages?.[0]?.id) {
                return result;
            }
            throw new Error('No message ID in response');
            
        } catch (error) {
            retries++;
            if (retries < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, retries * 2000));
            } else {
                throw error;
            }
        }
    }
}

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
            headers: { 'Authorization': `Bearer ${CONFIG.accessToken}` },
            body: formData
        });
        
        const uploadResult = await uploadResponse.json();
        if (!uploadResult.id) throw new Error('Failed to upload image');
        
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
        
        if (!sendResponse.ok) throw new Error(`Failed to send image: ${sendResponse.status}`);
        
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
            headers: { 'Authorization': `Bearer ${CONFIG.accessToken}` },
            body: formData
        });
        
        const uploadResult = await uploadResponse.json();
        if (!uploadResult.id) throw new Error('Failed to upload image');
        
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
        
        if (!sendResponse.ok) throw new Error(`Failed to send image: ${sendResponse.status}`);
        
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
        
        const welcomeCaption = 
            `👋 Welcome to Auto Spares Solution!\n\n` +
            `🤖 I'm your AI Sales Assistant\n\n` +
            `🏷️ ${allBrands.length} Premium Brands: ${brandText}\n\n` +
            `🔍 Search: Send part number or description\n` +
            `📸 Send Photo: Take photo of your order list\n` +
            `🎙️ Send Voice: Speak your order\n` +
            `🛒 Order: "0801BA0285N 2"\n` +
            `✅ Confirm: "Confirm Order"\n` +
            `🗑️ Clear: "Clear Cart"\n\n` +
            `📞 Call: ${CONFIG.businessPhone}\n` +
            `🛒 Shop: https://autosparessolution.com`;
        
        if (brochureBuffer) {
            await sendImageBuffer(to, brochureBuffer, welcomeCaption);
        } else {
            await sendWhatsAppMessage(to, welcomeCaption);
        }
        
        await sendWhatsAppMessage(to,
            `📝 *How to Order:*\n\n` +
            `1️⃣ Send *Part Number* (e.g., "0801BA0285N")\n` +
            `2️⃣ Add *Quantity* (e.g., "0801BA0285N 2")\n` +
            `3️⃣ Send multiple parts in separate lines\n` +
            `4️⃣ Reply "Confirm Order" to complete\n` +
            `5️⃣ Get Excel & PDF summary\n\n` +
            `📞 Call: ${CONFIG.businessPhone}`
        );
        
    } catch (error) {
        console.error(`❌ Failed to send welcome to ${to}:`, error.message);
    }
}

async function handleWhatsAppMessage(message, from) {
    try {
        const text = message.text?.body || '';
        const cleaned = text.replace(/^["']|["']$/g, '').trim();
        const msgLower = cleaned.toLowerCase();
        
        console.log(`💬 From: ${from} | Message: "${text}"`);
        console.log(`🔑 Is Admin: ${isAdmin(from)}`);

        // ============================================================
        // 🛑 IMMEDIATE ADMIN CHECK - BEFORE ANYTHING ELSE!
        // ============================================================
        
        if (isAdmin(from)) {
            console.log('👑 Admin mode activated');
            
            // ------------------------------------------------
            // ✅ ADD SUPPLIER - ABSOLUTE HIGHEST PRIORITY
            // ------------------------------------------------
            if (msgLower.startsWith('add supplier')) {
                console.log(`🏭 Processing add supplier: ${text}`);
                
                // Parse: Add supplier Name|Phone|Email|Address|GSTIN
                const parts = text.split('|').map(p => p.trim());
                const name = parts[0]?.replace(/^add supplier\s*/i, '').trim() || 'Unknown';
                const phone = parts[1]?.trim() || '';
                const email = parts[2]?.trim() || '';
                const address = parts[3]?.trim() || '';
                const gstin = parts[4]?.trim() || '';
                
                if (!name || !phone) {
                    await sendWhatsAppMessage(from,
                        `❌ *Invalid Format*\n\n` +
                        `📝 Format: Add supplier Name|Phone|Email|Address|GSTIN\n` +
                        `📝 Example: Add supplier Rane Motors|9876543210|contact@rane.com|123 MG Road|22ABCDE1234F1Z5\n\n` +
                        `📞 Call: ${CONFIG.businessPhone}`
                    );
                    return;
                }
                
                try {
                    // Check if supplier already exists
                    const existing = await db.db.get(
                        `SELECT * FROM suppliers WHERE phone = ? OR name = ?`,
                        [phone, name]
                    );
                    
                    if (existing) {
                        await sendWhatsAppMessage(from,
                            `⚠️ *Supplier Already Exists*\n\n` +
                            `🏭 Name: ${existing.name}\n` +
                            `📞 Phone: ${existing.phone}\n` +
                            `🆔 ID: ${existing.id}\n\n` +
                            `💡 Use "Add product ${existing.id} [part]" to link products.`
                        );
                        return;
                    }
                    
                    // Insert supplier
                    await db.db.run(
                        `INSERT INTO suppliers (name, phone, email, address, gstin, status, created_at) 
                         VALUES (?, ?, ?, ?, ?, 'active', CURRENT_TIMESTAMP)`,
                        [name, phone, email, address, gstin]
                    );
                    
                    // Get the new supplier ID
                    const newSupplier = await db.db.get(
                        `SELECT * FROM suppliers WHERE phone = ? ORDER BY id DESC LIMIT 1`,
                        [phone]
                    );
                    
                    await sendWhatsAppMessage(from,
                        `✅ *Supplier Added!*\n━━━━━━━━━━━━━━━━━━━━\n\n` +
                        `🆔 ID: ${newSupplier.id}\n` +
                        `🏭 Name: ${name}\n` +
                        `📞 Phone: ${phone}\n` +
                        `📧 Email: ${email || 'N/A'}\n` +
                        `📍 Address: ${address || 'N/A'}\n` +
                        `🆔 GST: ${gstin || 'N/A'}\n\n` +
                        `📝 *To add product:* "Add product ${newSupplier.id} [part]"\n` +
                        `📋 *List suppliers:* "List suppliers"\n\n` +
                        `📞 Call: ${CONFIG.businessPhone}`
                    );
                    return;
                } catch (error) {
                    console.error('❌ Add supplier error:', error.message);
                    await sendWhatsAppMessage(from,
                        `❌ *Failed to add supplier*\n\n` +
                        `Error: ${error.message}\n\n` +
                        `📞 Call: ${CONFIG.businessPhone}`
                    );
                    return;
                }
            }
            
            // ------------------------------------------------
            // ✅ REGISTER DELIVERY BOY
            // ------------------------------------------------
            if (msgLower.startsWith('register delivery') || msgLower.startsWith('add delivery boy')) {
                console.log(`🚚 Processing register delivery: ${text}`);
                
                let name = '', phone = '', pincodes = '';
                
                if (msgLower.startsWith('register delivery')) {
                    const match = text.match(/register delivery\s+([^|]+)\s*[\|]?\s*(\d+)\s*[\|]?\s*(.+)/i);
                    if (match) {
                        name = match[1]?.trim() || 'Unknown';
                        phone = match[2]?.trim() || '';
                        pincodes = match[3]?.trim() || '';
                    }
                } else {
                    const parts = text.split('|').map(p => p.trim());
                    name = parts[0]?.replace(/^add delivery boy\s*/i, '').trim() || 'Unknown';
                    phone = parts[1]?.trim() || '';
                    pincodes = parts[2]?.trim() || '';
                }
                
                if (!name || !phone) {
                    await sendWhatsAppMessage(from,
                        `❌ *Invalid Format*\n\n` +
                        `📝 Format: Register delivery Name|Phone|Pincodes|Vehicle\n` +
                        `📝 Example: Register delivery Ravi Kumar|9876543210|110001,110002|Bike\n\n` +
                        `📞 Call: ${CONFIG.businessPhone}`
                    );
                    return;
                }
                
                try {
                    const existing = await db.db.get(
                        `SELECT * FROM delivery_boys WHERE phone = ?`,
                        [phone]
                    );
                    
                    if (existing) {
                        await sendWhatsAppMessage(from,
                            `⚠️ *Delivery Boy Already Exists*\n\n` +
                            `👤 Name: ${existing.name}\n` +
                            `📞 Phone: ${existing.phone}\n` +
                            `🆔 ID: ${existing.boy_id}\n\n` +
                            `📊 Status: ${existing.status}`
                        );
                        return;
                    }
                    
                    const boyId = `DB-${Date.now().toString().slice(-6)}`;
                    
                    await db.db.run(
                        `INSERT INTO delivery_boys (boy_id, phone, name, preferred_pincodes, vehicle_type, status, is_available, created_at) 
                         VALUES (?, ?, ?, ?, ?, 'active', 1, CURRENT_TIMESTAMP)`,
                        [boyId, phone, name, pincodes, 'Bike']
                    );
                    
                    await sendWhatsAppMessage(from,
                        `✅ *Delivery Boy Registered!*\n━━━━━━━━━━━━━━━━━━━━\n\n` +
                        `🆔 ID: ${boyId}\n` +
                        `👤 Name: ${name}\n` +
                        `📞 Phone: ${phone}\n` +
                        `📌 Pincodes: ${pincodes || 'N/A'}\n` +
                        `✅ Status: Active & Available\n\n` +
                        `📝 "Assign delivery for ORD-XXXXXX to ${phone}" to assign.`
                    );
                    
                    // Send welcome to delivery boy
                    await sendWhatsAppMessage(phone,
                        `🚚 *Welcome to Auto Spares Solution Delivery!*\n\n` +
                        `📋 Your ID: ${boyId}\n` +
                        `👤 Name: ${name}\n` +
                        `📌 Pincodes: ${pincodes || 'N/A'}\n\n` +
                        `📦 You'll receive delivery assignments here.`
                    );
                    return;
                } catch (error) {
                    console.error('❌ Register delivery boy error:', error.message);
                    await sendWhatsAppMessage(from,
                        `❌ *Failed to register delivery boy*\n\n` +
                        `Error: ${error.message}\n\n` +
                        `📞 Call: ${CONFIG.businessPhone}`
                    );
                    return;
                }
            }
            
            // ------------------------------------------------
            // ✅ LIST SUPPLIERS
            // ------------------------------------------------
            if (msgLower === 'list suppliers' || msgLower === 'suppliers') {
                try {
                    const suppliers = await db.db.all(
                        `SELECT * FROM suppliers WHERE status = 'active' ORDER BY name`
                    );
                    
                    if (suppliers.length === 0) {
                        await sendWhatsAppMessage(from, '🏭 *No suppliers registered.*\n\n📝 "Add supplier Name|Phone" to add one.');
                        return;
                    }
                    
                    let reply = `🏭 *Suppliers*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
                    suppliers.forEach((s, index) => {
                        reply += `${index + 1}. *${s.name}*\n`;
                        reply += `   🆔 ID: ${s.id}\n`;
                        reply += `   📞 ${s.phone}\n`;
                        if (s.email) reply += `   📧 ${s.email}\n`;
                        reply += `\n`;
                    });
                    reply += `📝 "Add product [supplierId] [part]" to link products.`;
                    await sendWhatsAppMessage(from, reply);
                    return;
                } catch (error) {
                    console.error('❌ List suppliers error:', error.message);
                    await sendWhatsAppMessage(from, '⚠️ Error fetching suppliers.');
                    return;
                }
            }
            
            // ------------------------------------------------
            // ✅ LIST DELIVERY BOYS
            // ------------------------------------------------
            if (msgLower === 'list delivery boys' || msgLower === 'delivery boys') {
                try {
                    const deliveryBoys = await db.db.all(
                        `SELECT * FROM delivery_boys WHERE status = 'active' ORDER BY name`
                    );
                    
                    if (deliveryBoys.length === 0) {
                        await sendWhatsAppMessage(from, '🚚 *No delivery boys registered.*\n\n📝 "Register delivery Name|Phone|Pincodes" to add one.');
                        return;
                    }
                    
                    let reply = `🚚 *Delivery Boys*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
                    deliveryBoys.forEach((db, index) => {
                        reply += `${index + 1}. *${db.name}*\n`;
                        reply += `   🆔 ID: ${db.boy_id}\n`;
                        reply += `   📞 ${db.phone}\n`;
                        reply += `   📌 ${db.preferred_pincodes || 'N/A'}\n`;
                        reply += `   ${db.is_available ? '✅ Available' : '❌ Busy'}\n`;
                        reply += `\n`;
                    });
                    reply += `📝 "Assign delivery for ORD-XXXXXX to [phone]" to assign.`;
                    await sendWhatsAppMessage(from, reply);
                    return;
                } catch (error) {
                    console.error('❌ List delivery boys error:', error.message);
                    await sendWhatsAppMessage(from, '⚠️ Error fetching delivery boys.');
                    return;
                }
            }
            
            // ------------------------------------------------
            // ✅ ADD PRODUCT TO SUPPLIER
            // ------------------------------------------------
            const addProductMatch = msgLower.match(/add product (\d+)\s+([a-z0-9]{5,20})/i);
            if (addProductMatch) {
                const supplierId = parseInt(addProductMatch[1]);
                const partNumber = addProductMatch[2].toUpperCase();
                
                try {
                    const supplier = await db.db.get(
                        `SELECT * FROM suppliers WHERE id = ? AND status = 'active'`,
                        [supplierId]
                    );
                    
                    if (!supplier) {
                        await sendWhatsAppMessage(from, `❌ Supplier ID ${supplierId} not found.`);
                        return;
                    }
                    
                    const product = await db.getProductExact(partNumber);
                    if (!product) {
                        await sendWhatsAppMessage(from, `❌ Part ${partNumber} not found.`);
                        return;
                    }
                    
                    const existing = await db.db.get(
                        `SELECT * FROM supplier_products WHERE supplier_id = ? AND part = ?`,
                        [supplierId, partNumber]
                    );
                    
                    if (existing) {
                        await sendWhatsAppMessage(from,
                            `⚠️ *Already Linked*\n\n` +
                            `🏭 ${supplier.name}\n📦 ${partNumber}\n📝 ${product.description || 'N/A'}`
                        );
                        return;
                    }
                    
                    await db.db.run(
                        `INSERT INTO supplier_products (supplier_id, part, description, price, stock, last_updated)
                         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                        [supplierId, partNumber, product.description || '', product.billing_price || 0, product.stock || 0]
                    );
                    
                    await sendWhatsAppMessage(from,
                        `✅ *Product Linked!*\n━━━━━━━━━━━━━━━━━━━━\n\n` +
                        `🏭 Supplier: ${supplier.name}\n📦 Part: ${partNumber}\n📝 ${product.description || 'N/A'}\n` +
                        `💰 Price: ₹${(product.billing_price * 1.18).toFixed(2)}\n📦 Stock: ${product.stock || 0}`
                    );
                    return;
                } catch (error) {
                    await sendWhatsAppMessage(from, `❌ Failed to link product: ${error.message}`);
                    return;
                }
            }
            
            // ------------------------------------------------
            // ✅ HELP ADMIN
            // ------------------------------------------------
            if (msgLower === 'help admin' || msgLower === 'admin help') {
                await sendWhatsAppMessage(from,
                    `👑 *Admin Commands*\n━━━━━━━━━━━━━━━━━━━━\n\n` +
                    `📋 *Orders:* "Admin orders"\n` +
                    `✅ *Confirm Order:* "Confirm order for 919XXXXXXXXX"\n` +
                    `🛒 *Cart:* "Customer cart 919XXXXXXXXX"\n` +
                    `📦 *Stock:* "Stock status 0801BA0285N"\n\n` +
                    `🏭 *Suppliers:*\n` +
                    `   "List suppliers"\n` +
                    `   "Add supplier Name|Phone|Email"\n` +
                    `   "Add product supplierId PART"\n\n` +
                    `🚚 *Delivery:*\n` +
                    `   "List delivery boys"\n` +
                    `   "Register delivery Name|Phone|Pincodes"\n` +
                    `   "Assign delivery for ORD-XXXXXX to phone"\n\n` +
                    `🎨 *Brands:* "Brands" | "Update brands"\n\n` +
                    `📞 Call: ${CONFIG.businessPhone}`
                );
                return;
            }
            
            // ------------------------------------------------
            // ✅ ADMIN ORDERS
            // ------------------------------------------------
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
                    reply += `✅ "Confirm order for [phone]" to confirm.`;
                    await sendWhatsAppMessage(from, reply);
                    return;
                } catch (error) {
                    await sendWhatsAppMessage(from, '⚠️ Error fetching orders.');
                    return;
                }
            }
            
            // ------------------------------------------------
            // ✅ CONFIRM ORDER (Admin)
            // ------------------------------------------------
            const confirmMatch = msgLower.match(/confirm order for (\d+)/);
            if (confirmMatch) {
                const customerPhone = confirmMatch[1];
                
                try {
                    const cart = await db.getCart(customerPhone);
                    if (!cart || !cart.items) {
                        await sendWhatsAppMessage(from, `❌ No cart found for ${customerPhone}`);
                        return;
                    }
                    
                    const items = JSON.parse(cart.items);
                    const orderId = `ORD-${Date.now().toString().slice(-6)}`;
                    await db.saveOrder(orderId, customerPhone, items, cart.total);
                    await db.clearCart(customerPhone);
                    
                    await sendWhatsAppMessage(from,
                        `✅ *Order Confirmed!*\n\n` +
                        `📦 Order ID: ${orderId}\n👤 Customer: ${customerPhone}\n💰 Total: ₹${cart.total.toFixed(2)}`
                    );
                    return;
                } catch (error) {
                    await sendWhatsAppMessage(from, `❌ Failed to confirm order: ${error.message}`);
                    return;
                }
            }
            
            // ------------------------------------------------
            // ✅ CUSTOMER CART (Admin)
            // ------------------------------------------------
            const cartMatch = msgLower.match(/customer cart (\d+)/);
            if (cartMatch) {
                const customerPhone = cartMatch[1];
                
                try {
                    const cart = await db.getCart(customerPhone);
                    if (!cart || !cart.items) {
                        await sendWhatsAppMessage(from, `🛒 Cart is empty for ${customerPhone}`);
                        return;
                    }
                    
                    const items = JSON.parse(cart.items);
                    let reply = `🛒 *Cart for ${customerPhone}*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
                    items.forEach((item, index) => {
                        reply += `${index + 1}. ${item.part} x${item.qty} = ₹${(item.price * item.qty).toFixed(2)}\n`;
                    });
                    reply += `\n💰 *Total: ₹${cart.total.toFixed(2)}*\n\n`;
                    reply += `✅ "Confirm order for ${customerPhone}" to confirm.`;
                    await sendWhatsAppMessage(from, reply);
                    return;
                } catch (error) {
                    await sendWhatsAppMessage(from, '⚠️ Error fetching cart.');
                    return;
                }
            }
            
            // ------------------------------------------------
            // ✅ STOCK STATUS (Admin)
            // ------------------------------------------------
            const stockMatch = msgLower.match(/stock status ([a-z0-9]{5,20})/);
            if (stockMatch) {
                const partNumber = stockMatch[1].toUpperCase();
                const product = await db.getProductExact(partNumber);
                if (product) {
                    await sendWhatsAppMessage(from,
                        `📦 *Stock: ${product.part}*\n━━━━━━━━━━━━━━━━━━━━\n\n` +
                        `📝 ${product.description || 'N/A'}\n` +
                        `📦 ${product.stock > 0 ? `✅ ${product.stock} pcs available` : '❌ Out of Stock'}\n` +
                        `💰 ₹${(product.billing_price * 1.18).toFixed(2)}`
                    );
                } else {
                    await sendWhatsAppMessage(from, `❌ Part ${partNumber} not found.`);
                }
                return;
            }
            
            // ------------------------------------------------
            // ✅ BRANDS
            // ------------------------------------------------
            if (msgLower === 'brands' || msgLower === 'list brands') {
                const brands = brandManager.getActiveBrands ? brandManager.getActiveBrands() : [];
                
                if (brands.length === 0) {
                    await sendWhatsAppMessage(from, '🎨 *No brands loaded.*');
                    return;
                }
                
                let reply = `🎨 *Brands*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
                brands.forEach((b, index) => {
                    reply += `${index + 1}. *${b.name}*\n`;
                    if (b.logo) reply += `   📷 ${b.logo}\n`;
                    reply += `\n`;
                });
                reply += `📊 Total: ${brands.length} brands`;
                await sendWhatsAppMessage(from, reply);
                return;
            }
            
            // ------------------------------------------------
            // ✅ UPDATE BRANDS
            // ------------------------------------------------
            if (msgLower === 'update brands' || msgLower === 'refresh brands') {
                await sendWhatsAppMessage(from, '🔄 Updating brands...');
                const result = brandManager.updateBrands ? await brandManager.updateBrands(true) : false;
                
                if (result) {
                    const brands = brandManager.getActiveBrands ? brandManager.getActiveBrands() : [];
                    await sendWhatsAppMessage(from,
                        `✅ *Brands Updated!*\n\n` +
                        `📊 Total: ${brands.length} brands\n\n📋 "Brands" to view all`
                    );
                } else {
                    await sendWhatsAppMessage(from, '❌ Failed to update brands.');
                }
                return;
            }
        }

        // ============================================================
        // 🛒 CUSTOMER COMMANDS (Only if not admin OR no admin command matched)
        // ============================================================
        
        console.log('👤 Processing as customer command');
        
        // 1️⃣ WELCOME / HELP
        if (['hi', 'hello', 'help', 'start', 'menu'].includes(msgLower)) {
            await sendWelcomeWithAllBrands(from);
            return;
        }
        
        // 2️⃣ CONFIRM ORDER
        if (msgLower === 'confirm order' || msgLower === 'confirm') {
            const cart = await db.getCart(from);
            if (cart && cart.items) {
                const items = JSON.parse(cart.items);
                if (items.length === 0) {
                    await sendWhatsAppMessage(from, '🛒 Your cart is empty.');
                    return;
                }
                const orderId = `ORD-${Date.now().toString().slice(-6)}`;
                await db.saveOrder(orderId, from, items, cart.total);
                await db.clearCart(from);
                await sendWhatsAppMessage(from,
                    `✅ *ORDER CONFIRMED!*\n\n📦 Order ID: ${orderId}\n💰 Total: ₹${cart.total.toFixed(2)}\n\n` +
                    `📊 "Download Excel" or "Download PDF"`
                );
                return;
            }
            await sendWhatsAppMessage(from, '🛒 Your cart is empty.');
            return;
        }
        
        // 3️⃣ CLEAR CART
        if (msgLower === 'clear cart' || msgLower === 'clear') {
            await db.clearCart(from);
            await sendWhatsAppMessage(from, '🗑️ Cart cleared!');
            return;
        }
        
        // 4️⃣ ORDER SUMMARY
        if (msgLower === 'order summary' || msgLower === 'cart') {
            const cart = await db.getCart(from);
            if (cart && cart.items) {
                const items = JSON.parse(cart.items);
                let reply = `🛒 *Your Cart*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
                items.forEach((item, index) => {
                    reply += `${index + 1}. ${item.part} x${item.qty} = ₹${(item.price * item.qty).toFixed(2)}\n`;
                });
                reply += `\n💰 *Total: ₹${cart.total.toFixed(2)}*\n\n✅ "Confirm Order" to complete`;
                await sendWhatsAppMessage(from, reply);
                return;
            }
            await sendWhatsAppMessage(from, '🛒 Your cart is empty.');
            return;
        }
        
        // 5️⃣ PART NUMBER SEARCH
        const partMatch = cleaned.match(/\b([A-Z0-9]{5,20})\b/);
        if (partMatch) {
            const partNumber = partMatch[1];
            const product = await db.getProductExact(partNumber);
            
            if (product) {
                const priceWithGST = (product.billing_price || 0) * 1.18;
                let reply = `🔍 *${product.part}*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
                reply += `📝 ${product.description || 'N/A'}\n`;
                if (product.brand) reply += `🏷️ Brand: ${product.brand}\n`;
                if (product.make) reply += `🚗 Make: ${product.make}\n`;
                if (product.model) reply += `🎯 Model: ${product.model}\n`;
                reply += `\n💰 Price: ₹${priceWithGST.toFixed(2)}\n`;
                reply += `📦 ${product.stock > 0 ? `✅ ${product.stock} pcs available` : '❌ Out of Stock'}\n\n`;
                reply += `🛒 To order: "${product.part} 2"`;
                await sendWhatsAppMessage(from, reply);
                return;
            }
        }
        
        // 6️⃣ PART WITH QUANTITY
        const partWithQty = cleaned.match(/\b([A-Z0-9]{5,20})\s*(\d+)\b/);
        if (partWithQty) {
            const partNumber = partWithQty[1];
            const quantity = parseInt(partWithQty[2]);
            const product = await db.getProductExact(partNumber);
            
            if (product) {
                const priceWithGST = (product.billing_price || 0) * 1.18;
                const total = priceWithGST * quantity;
                
                // Add to cart
                const cart = await db.getCart(from);
                let cartItems = [];
                let cartTotal = 0;
                if (cart && cart.items) {
                    cartItems = JSON.parse(cart.items);
                    cartTotal = cart.total || 0;
                }
                
                cartItems.push({
                    part: product.part,
                    description: product.description,
                    qty: quantity,
                    price: priceWithGST,
                    stock: product.stock
                });
                cartTotal += total;
                await db.saveCart(from, cartItems, cartTotal, cartTotal);
                
                await sendWhatsAppMessage(from,
                    `🛒 *Added to Cart!*\n━━━━━━━━━━━━━━━━━━━━\n\n` +
                    `*${product.part}* x${quantity}\n📝 ${product.description || 'N/A'}\n` +
                    `💳 ₹${priceWithGST.toFixed(2)} × ${quantity} = ₹${total.toFixed(2)}\n\n` +
                    `💰 *Cart Total: ₹${cartTotal.toFixed(2)}*\n\n✅ "Confirm Order" to complete`
                );
                return;
            }
        }
        
        // 7️⃣ SEARCH
        if (cleaned.length >= 2) {
            const results = await db.searchProducts(cleaned, 5);
            if (results.length > 0) {
                let reply = `🔍 Found ${results.length} result(s) for "${cleaned}"\n\n`;
                results.forEach((p, i) => {
                    reply += `${i + 1}. *${p.part}*\n📝 ${p.description || 'N/A'}\n💰 ₹${((p.billing_price || 0) * 1.18).toFixed(2)}\n📦 ${p.stock > 0 ? `✅ ${p.stock} pcs` : '❌ Out of Stock'}\n\n`;
                });
                reply += `🛒 Send part number with quantity to order.`;
                await sendWhatsAppMessage(from, reply);
                return;
            }
        }
        
        // 8️⃣ NO RESULTS
        await sendWhatsAppMessage(from,
            `🔍 No results for "${text}"\n\n` +
            `💡 Send a part number like "0801BA0285N"\n` +
            `💡 Or send "Help" for options\n\n📞 Call: ${CONFIG.businessPhone}`
        );
        
    } catch (error) {
        console.error(`❌ Message handler error: ${error.message}`);
        console.error(error.stack);
        await sendWhatsAppMessage(from, '⚠️ Sorry, something went wrong. Please try again.');
    }
}
// ============================================================
// 📩 WEBHOOK
// ============================================================

app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token === CONFIG.verifyToken) {
        return res.status(200).send(challenge);
    }
    res.status(403).send('Verification failed');
});

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
        
        console.log(`📩 From: ${from} | Type: ${type}`);
        
        if (type === 'text') {
            await handleWhatsAppMessage(message, from);
        } else {
            await sendWhatsAppMessage(from,
                `📩 Received your ${type} message.\n\n` +
                `💡 Please send text messages.\n📞 Call: ${CONFIG.businessPhone}`
            );
        }
        
        markMessageProcessed(messageId);
        res.sendStatus(200);
        
    } catch (error) {
        console.error(`❌ Webhook error: ${error.message}`);
        res.sendStatus(200);
    }
});

// ============================================================
// 🏥 HEALTH CHECK
// ============================================================

app.get('/health', async (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============================================================
// 🏠 ROOT
// ============================================================

app.get('/', (req, res) => {
    res.json({
        name: 'ASSIST WhatsApp Webhook v3.1',
        version: '3.1.0',
        status: 'running',
        endpoints: {
            health: '/health',
            webhook: '/webhook'
        }
    });
});

// ============================================================
// 🗄️ DATABASE INITIALIZATION - COMPLETE FIXED
// ============================================================

async function initAllTables() {
    try {
        // customer_enquiries
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

        // customer_interests
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

        // customer_stock_alerts
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

        // stock_update_history
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

        // otp_attempts
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

        // credit_notes
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

        // invoice_audit
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

        // ✅ DELIVERY BOYS TABLE - FIXED
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

        // ✅ DELIVERIES TABLE - FIXED
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

        // ✅ DELIVERY LOCATIONS TABLE - FIXED
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

        // out_of_stock_tracking
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

        // Add missing columns
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

        // alerts
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

        // user_preferences
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

        // customers
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

        // suppliers
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

        // supplier_products
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

        // supplier_enquiries
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

        // purchase_invoices
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

        // purchase_order_items
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

        // supplier_payments
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

        // Create indexes
        await createIndexes();
        console.log('✅ All tables created/verified');

    } catch (error) {
        console.error('❌ Create tables error:', error.message);
    }
}
// ============================================================
// 🚀 START SERVER
// ============================================================

async function startServer() {
    try {
        await initAllTables();
        console.log('✅ Database ready');
        
        // Initialize brand manager
        if (brandManager && brandManager.updateBrands) {
            await brandManager.updateBrands();
        }
        
        // Start scheduler
        scheduler.startScheduler();
        console.log('✅ Scheduler started');
        
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`🚀 Server Running On Port ${PORT}`);
            console.log(`🔗 Health Check: /health`);
            console.log(`📱 Webhook: /webhook`);
            console.log(`📦 Database Status: ${isDbReady ? '✅ Ready' : '⏳ Loading'}`);
            console.log('====================================');
        });
        
    } catch (error) {
        console.error('❌ Startup error:', error.message);
        process.exit(1);
    }
}

process.on('SIGTERM', () => { console.log('🛑 Shutting down...'); process.exit(0); });
process.on('SIGINT', () => { console.log('🛑 Shutting down...'); process.exit(0); });

startServer();

module.exports = { app };
