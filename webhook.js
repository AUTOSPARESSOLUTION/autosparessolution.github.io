// ============================================================
// 🚀 ASSIST WhatsApp Webhook v3.0 - COMPLETE FIXED
// Features: 
//   - Memory optimized (streaming, lazy loading)
//   - Description search
//   - Customer logging
//   - Out-of-stock notifications
//   - Anti-crash with duplicate detection
//   - Auto restock scheduler
//   - Gemini AI fallback with web search
//   - FIXED: Image processing with working Gemini prompt
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

const dirs = ['db', 'logs', 'uploads', 'temp'];
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
};

console.log('====================================');
console.log('🚀 ASSIST WhatsApp Webhook v3.0 - PRODUCTION');
console.log(`📞 Business Phone: ${CONFIG.businessPhone}`);
console.log(`🆔 Phone Number ID: ${CONFIG.phoneNumberId}`);
console.log(`🔑 Token: ${CONFIG.accessToken ? '✅ Set' : '❌ Not set'}`);
console.log(`🧠 ChatGPT: ${CONFIG.chatgptKey ? '✅ Set' : '❌ Not set'}`);
console.log(`🧠 DeepSeek: ${CONFIG.deepseekKey ? '✅ Set' : '❌ Not set'}`);
console.log(`🧠 Gemini: ${CONFIG.geminiKey ? '✅ Set' : '❌ Not set'}`);
console.log(`💾 Memory Limit: ${CONFIG.maxMemory}MB`);
console.log('====================================');

// ============================================================
// 🛡️ MIDDLEWARE
// ============================================================

app.use(cors());
app.use(compression({
    threshold: 1024,
    level: 6
}));

app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: false
}));

app.use(express.json({ 
    limit: '5mb',
    verify: (req, res, buf) => {
        req.rawBody = buf.toString();
    }
}));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.set('trust proxy', 1);

// ============================================================
// 🛡️ RATE LIMITING
// ============================================================

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    message: 'Too many requests, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/webhook', limiter);

const imageLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 50,
    message: 'Image processing limit reached. Please try again later.',
});
app.use('/webhook/image', imageLimiter);

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
        setTimeout(() => {
            messageCache.delete(messageId);
        }, CACHE_TTL);
    }
}

// ============================================================
// 📂 STATIC FILES
// ============================================================

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/logs', express.static(path.join(__dirname, 'logs')));

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
                heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + 'MB',
                heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + 'MB',
                external: Math.round(memUsage.external / 1024 / 1024) + 'MB'
            },
            config: {
                phoneNumberId: CONFIG.phoneNumberId ? '✅ Set' : '❌ Not set',
                accessToken: CONFIG.accessToken ? '✅ Set' : '❌ Not set',
                businessPhone: CONFIG.businessPhone,
                ai: {
                    chatgpt: CONFIG.chatgptKey ? '✅' : '❌',
                    deepseek: CONFIG.deepseekKey ? '✅' : '❌',
                    gemini: CONFIG.geminiKey ? '✅' : '❌'
                }
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
        name: 'ASSIST WhatsApp Webhook v3.0',
        version: '3.0.0',
        status: 'running',
        memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB used',
        ai: {
            chatgpt: CONFIG.chatgptKey ? '✅' : '❌',
            deepseek: CONFIG.deepseekKey ? '✅' : '❌',
            gemini: CONFIG.geminiKey ? '✅' : '❌'
        },
        endpoints: {
            health: '/health',
            webhook: '/webhook',
            search: '/api/search?q=part_number',
            product: '/api/product/part_number',
            stats: '/api/stats',
            admin: '/api/admin/dashboard'
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
        
        await customerLog.logEnquiry('api', 'search', {
            text: q,
            productsFound: results.map(p => p.part),
            status: 'processed'
        }).catch(() => {});
        
        res.json({ 
            query: q, 
            count: results.length, 
            results: results.map(p => ({
                part: p.part,
                description: p.description,
                brand: p.brand,
                make: p.make,
                model: p.model,
                stock: p.stock,
                list_price: p.list_price,
                mrp: p.mrp,
                billing_price: p.billing_price
            }))
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================================
// 🔍 API: GET PRODUCT
// ============================================================

app.get('/api/product/:part', async (req, res) => {
    try {
        let product = await db.getProductExact(req.params.part);
        if (!product) {
            product = await db.getProduct(req.params.part);
        }
        if (product) {
            res.json(product);
        } else {
            res.status(404).json({ error: 'Product not found' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================================
// 📊 API: GET STATS
// ============================================================

app.get('/api/stats', async (req, res) => {
    try {
        const stats = await db.getStats();
        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================================
// 📊 ADMIN: DASHBOARD
// ============================================================

app.get('/api/admin/dashboard', async (req, res) => {
    try {
        const [stats, waiting, stockStats] = await Promise.all([
            customerLog.getEnquiryStats(),
            customerLog.getWaitingNotifications(),
            db.getStats()
        ]);
        
        const memUsage = process.memoryUsage();
        
        res.json({
            success: true,
            memory: {
                rss: Math.round(memUsage.rss / 1024 / 1024) + 'MB',
                heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + 'MB',
                heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + 'MB'
            },
            stats: {
                enquiries: stats,
                waiting_notifications: waiting.length,
                products: stockStats
            },
            top_out_of_stock: waiting.slice(0, 10)
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// 📊 ADMIN: ENQUIRIES
// ============================================================

app.get('/api/admin/enquiries', async (req, res) => {
    try {
        const { phone, limit = 50, from, to } = req.query;
        let enquiries;
        if (phone) {
            enquiries = await customerLog.getEnquiryHistory(phone, parseInt(limit));
        } else {
            enquiries = await customerLog.getAllEnquiries(from, to, parseInt(limit));
        }
        res.json({
            success: true,
            count: enquiries.length,
            enquiries
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// 🔔 ADMIN: MANUAL RESTOCK NOTIFICATION
// ============================================================

app.post('/api/admin/notify-restock', async (req, res) => {
    try {
        const { part } = req.body;
        if (!part) {
            return res.status(400).json({ success: false, error: 'Part number is required' });
        }
        const product = await db.getProductExact(part);
        if (!product) {
            return res.status(404).json({ success: false, error: 'Product not found' });
        }
        if (product.stock <= 0) {
            return res.status(400).json({ success: false, error: 'Product is still out of stock' });
        }
        const result = await customerLog.notifyRestock(part);
        res.json({
            success: true,
            message: `Restock notifications sent for ${part}`,
            notified: result.notified,
            failed: result.failed
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// 📊 ADMIN: UPDATE STOCK
// ============================================================

app.post('/api/admin/update-stock', async (req, res) => {
    try {
        const { part, newStock, source = 'manual' } = req.body;
        if (!part || newStock === undefined) {
            return res.status(400).json({ success: false, error: 'Part and newStock are required' });
        }
        const product = await db.getProductExact(part);
        if (!product) {
            return res.status(404).json({ success: false, error: 'Product not found' });
        }
        const oldStock = product.stock;
        
        await new Promise((resolve, reject) => {
            db.db.run(
                'UPDATE products SET stock = ?, updated_at = CURRENT_TIMESTAMP WHERE part = ?',
                [newStock, part],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
        
        await customerLog.recordStockChange(part, oldStock, newStock, source);
        
        let notifications = { notified: 0, failed: 0 };
        if (oldStock === 0 && newStock > 0) {
            console.log(`🔔 Stock restocked! Notifying customers for ${part}...`);
            notifications = await customerLog.notifyRestock(part);
        }
        
        res.json({
            success: true,
            message: `Stock updated for ${part}`,
            old_stock: oldStock,
            new_stock: newStock,
            notifications
        });
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
    
    console.log(`🔐 Webhook Verification: mode=${mode}, token=${token}`);
    
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
                    } else {
                        await sendWhatsAppMessage(from, 
                            `📩 Received your ${type} message.\n\n` +
                            `💡 Please send text or images.\n` +
                            `📞 Call: ${CONFIG.businessPhone}`
                        );
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
// 🤖 GEMINI WEB SEARCH FALLBACK
// ============================================================

async function getGeminiWebSearch(query, customerPhone = null) {
    if (!CONFIG.geminiKey) {
        return null;
    }
    
    try {
        console.log(`🔍 Gemini Web Search: "${query}"`);
        
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
1. If you don't find the exact product in the database, help the customer with useful information
2. Use your knowledge to suggest:
   - What kind of product they might need
   - Where they can find it
   - Similar products that might work
   - Any technical details or specifications
3. If it's a part number they're asking about:
   - Explain what that part is used for
   - What vehicle it fits
   - Common replacements or alternatives
4. If it's a description (like "clutch plate"):
   - Explain what a clutch plate does
   - How to choose the right one
   - What to check when buying
5. ALWAYS include:
   - Our phone number: ${CONFIG.businessPhone}
   - Our website: https://autosparessolution.com
6. Be helpful, friendly, and practical
7. Reply in Hinglish (Hindi + English mix)
8. Keep the response informative but concise (max 5-6 sentences)`,
                    }]
                }],
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 500,
                    topK: 40,
                    topP: 0.95
                }
            })
        });
        
        const data = await response.json();
        
        if (response.ok && data.candidates?.[0]?.content?.parts?.[0]?.text) {
            let content = data.candidates[0].content.parts[0].text;
            
            if (!content.includes(CONFIG.businessPhone)) {
                content += `\n\n📞 Call: ${CONFIG.businessPhone}`;
            }
            if (!content.includes('autosparessolution.com')) {
                content += `\n🛒 Shop: https://autosparessolution.com`;
            }
            
            console.log(`✅ Gemini web search response received`);
            return content;
        }
        
        console.log(`⚠️ Gemini web search returned no content`);
        return null;
        
    } catch (error) {
        console.error(`❌ Gemini web search error:`, error.message);
        return null;
    }
}

// ============================================================
// 🤖 GEMINI VISION - RESTORED WORKING PROMPT
// ============================================================

async function getGeminiVisionWithWebSearch(imageBuffer, caption = '') {
    if (!CONFIG.geminiKey) {
        return null;
    }
    
    try {
        console.log(`🔍 Gemini Vision with Web Search Fallback`);
        
        let buffer = imageBuffer;
        if (buffer.length > 3 * 1024 * 1024) {
            try {
                const sharp = require('sharp');
                buffer = await sharp(buffer)
                    .resize(800, 800, { fit: 'inside' })
                    .jpeg({ quality: 80 })
                    .toBuffer();
            } catch (e) { /* use original */ }
        }
        
        const base64Image = buffer.toString('base64');
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${CONFIG.geminiKey}`;
        
        // ============================================================
        // ✅ RESTORED WORKING PROMPT FROM OLD CODE
        // ============================================================
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        {
                            text: `Extract all part numbers and quantities from this image.

INSTRUCTIONS:
1. Look for part numbers (alphanumeric, 5-20 characters like 0801BA0285N or 29370818JA)
2. Look for quantities (numbers after part numbers)
3. Return ONLY valid JSON format
4. If no quantities found, set qty to 1
5. If multiple parts, list all of them
6. If you can't find any part number, return {"items":[]}
7. Do NOT include any other text or explanation - ONLY JSON

Example: {"items":[{"part":"0801BA0285N","qty":2},{"part":"0303BC0071N","qty":1}]}

Return ONLY the JSON, no other text.

Caption (if any): "${caption}"`
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
                    maxOutputTokens: 500,
                    topK: 1,
                    topP: 0.1
                }
            })
        });
        
        const data = await response.json();
        
        if (response.ok && data.candidates?.[0]?.content?.parts?.[0]?.text) {
            let content = data.candidates[0].content.parts[0].text;
            console.log(`📸 Gemini Raw Response: ${content.substring(0, 300)}...`);
            
            // ============================================================
            // ✅ Parse JSON from response
            // ============================================================
            try {
                const jsonMatch = content.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    const parsed = JSON.parse(jsonMatch[0]);
                    console.log(`✅ Gemini parsed JSON:`, JSON.stringify(parsed, null, 2));
                    
                    // Check for items array (preferred format)
                    if (parsed.items && Array.isArray(parsed.items) && parsed.items.length > 0) {
                        const item = parsed.items[0];
                        if (item.part && item.part.length >= 5) {
                            return { 
                                type: 'part', 
                                data: { 
                                    part: item.part.toUpperCase(), 
                                    qty: item.qty || 1,
                                    description: item.description || ''
                                } 
                            };
                        }
                    }
                    
                    // Check for single part (fallback format)
                    if (parsed.part && parsed.part.length >= 5) {
                        return { 
                            type: 'part', 
                            data: { 
                                part: parsed.part.toUpperCase(), 
                                qty: parsed.qty || 1,
                                description: parsed.description || ''
                            } 
                        };
                    }
                }
            } catch (e) {
                console.log(`⚠️ Failed to parse JSON:`, e.message);
            }
            
            // ============================================================
            // ✅ If no part found, check if it's a helpful message
            // ============================================================
            if (content && content.length > 10 && !content.includes('{')) {
                if (!content.includes(CONFIG.businessPhone)) {
                    content += `\n\n📞 Call: ${CONFIG.businessPhone}`;
                }
                if (!content.includes('autosparessolution.com')) {
                    content += `\n🛒 Shop: https://autosparessolution.com`;
                }
                return { type: 'message', data: content };
            }
            
            console.log(`⚠️ No valid part number found in Gemini response`);
            return null;
        }
        
        console.log(`⚠️ Gemini vision returned no content`);
        return null;
        
    } catch (error) {
        console.error(`❌ Gemini vision error:`, error.message);
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
        
        await customerLog.logEnquiry(from, 'text', {
            text: text,
            status: 'pending'
        }).catch(() => {});
        
        const cleaned = text
            .replace(/^["']|["']$/g, '')
            .replace(/["']/g, '')
            .replace(/\s+/g, ' ')
            .trim();
        
        const msgLower = cleaned.toLowerCase().trim();
        
        // STEP 1: WELCOME / HELP
        if (['hi', 'hello', 'help', 'start', 'menu'].includes(msgLower)) {
            const welcome = 
                `👋 *Welcome to Auto Spares Solution!*\n\n` +
                `🤖 I'm your AI Sales Assistant\n\n` +
                `🔍 *Search Parts:*\n` +
                `Send part number like "0801BA0285N"\n` +
                `Send description like "clutch plate"\n` +
                `Send brand like "M&M"\n\n` +
                `📦 *Multiple Products:*\n` +
                `"0802CAA08871N 2\n0801BA0285N 2"\n\n` +
                `📸 *Send Photo:*\n` +
                `Take a photo of your order list\n\n` +
                `💰 *Check Price:*\n` +
                `"Price 0801BA0285N"\n\n` +
                `📦 *Check Stock:*\n` +
                `"Stock 0303BC0071N"\n\n` +
                `🛒 *Place Order:*\n` +
                `"Order 0801BA0285N 2"\n\n` +
                `🤖 *AI Assistant:*\n` +
                `Ask anything about auto spares!\n\n` +
                `📞 *Call:* ${CONFIG.businessPhone}\n` +
                `🛒 *Shop:* https://autosparessolution.com\n\n` +
                `*How can I help you today?* 🚗`;
            
            await sendWhatsAppMessage(from, welcome);
            return;
        }
        
        // STEP 2: PRICE CHECK
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
                    const gstAmount = billingPrice * 0.18;
                    
                    let reply = `💰 *Price: ${product.part}*\n\n`;
                    reply += `📝 ${product.description}\n`;
                    if (product.brand) reply += `🏷️ Brand: ${product.brand}\n`;
                    if (product.list_price > 0) reply += `💰 LIST PRICE: ₹${product.list_price.toFixed(2)}\n`;
                    if (product.mrp > 0) reply += `💰 MRP PRICE: ₹${product.mrp.toFixed(2)}\n`;
                    reply += `💳 Billing Price: ₹${billingPrice.toFixed(2)}\n`;
                    reply += `🧾 GST (18%): ₹${gstAmount.toFixed(2)}\n`;
                    reply += `💳 *Total: ₹${priceWithGST.toFixed(2)} (incl. GST)*\n\n`;
                    reply += `📦 Stock: ${product.stock > 0 ? `✅ ${product.stock} pcs` : '❌ Out of Stock'}`;
                    if (product.box_qty > 0) reply += ` | Box: ${product.box_qty}`;
                    if (product.carton > 0) reply += ` | Carton: ${product.carton}`;
                    
                    await customerLog.logEnquiry(from, 'price_check', {
                        text: text,
                        productsFound: [product.part],
                        status: 'processed',
                        response: reply
                    }).catch(() => {});
                    
                    await sendWhatsAppMessage(from, reply);
                    return;
                } else {
                    const geminiReply = await getGeminiWebSearch(`Part number ${partNumber} auto spare part`, from);
                    if (geminiReply) {
                        await sendWhatsAppMessage(from, `🔍 *Part "${partNumber}" not found in our database*\n\n${geminiReply}`);
                        return;
                    }
                    await sendWhatsAppMessage(from, `❌ Product "${partNumber}" not found.\n\n💡 Check the part number or try describing what you need.\n📞 Call: ${CONFIG.businessPhone}`);
                    return;
                }
            }
        }
        
        // STEP 3: STOCK CHECK
        if (msgLower.includes('stock') || msgLower.includes('available')) {
            const partNumber = extractPartNumber(cleaned);
            if (partNumber) {
                let product = await db.getProductExact(partNumber);
                if (!product) {
                    product = await db.getProduct(partNumber);
                }
                
                if (product) {
                    let reply = `📦 *Stock: ${product.part}*\n\n`;
                    reply += `📝 ${product.description}\n`;
                    reply += `📦 ${product.stock > 0 ? `✅ ${product.stock} pcs available` : '❌ Out of Stock'}`;
                    if (product.box_qty > 0) reply += ` | Box: ${product.box_qty}`;
                    if (product.carton > 0) reply += ` | Carton: ${product.carton}`;
                    await sendWhatsAppMessage(from, reply);
                    return;
                } else {
                    const geminiReply = await getGeminiWebSearch(`Stock availability for ${partNumber} auto part`, from);
                    if (geminiReply) {
                        await sendWhatsAppMessage(from, `🔍 *Part "${partNumber}" not found in our database*\n\n${geminiReply}`);
                        return;
                    }
                    await sendWhatsAppMessage(from, `❌ Product "${partNumber}" not found.`);
                    return;
                }
            }
        }
        
        // STEP 4: CONFIRM ORDER
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
        
        // STEP 5: CLEAR CART
        if (msgLower === 'clear cart' || msgLower === 'clear') {
            await db.clearCart(from);
            await sendWhatsAppMessage(from, '🗑️ Cart cleared!');
            return;
        }
        
        // STEP 6: MULTI-PRODUCT DETECTION
        const allParts = text.match(/\b[A-Z0-9]{5,20}\b/gi);
        const uniqueParts = allParts ? [...new Set(allParts.map(p => p.toUpperCase()))] : [];
        const hasMultipleParts = uniqueParts.length > 1;
        const hasNewLines = text.includes('\n');
        const hasCommas = text.includes(',');
        
        const isMultiProduct = hasMultipleParts || hasNewLines || hasCommas;
        
        if (isMultiProduct) {
            console.log(`📋 Processing multi-product enquiry...`);
            
            const result = await parseOrderWithDescription(text, db);
            
            let foundItems = [];
            let notFound = [];
            let outOfStock = [];
            
            for (const item of result.items) {
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
                        model: product.model,
                        box_qty: product.box_qty,
                        carton: product.carton,
                        hsn: product.hsn,
                        matchType: item.matchType || 'exact'
                    });
                    
                    if (product.stock === 0) {
                        outOfStock.push(product.part);
                        await customerLog.trackOutOfStock(from, product.part, product.description, item.qty || 1);
                    }
                } else {
                    notFound.push(item.part || item.searchText);
                }
            }
            
            if (notFound.length > 0 && foundItems.length === 0) {
                const geminiReply = await getGeminiWebSearch(text, from);
                if (geminiReply) {
                    await sendWhatsAppMessage(from, `🔍 *I couldn't find exact products for your enquiry*\n\n${geminiReply}`);
                    return;
                }
                await sendWhatsAppMessage(from, 
                    `❌ Products not found: ${notFound.join(', ')}\n\n` +
                    `💡 Please check the part numbers or try describing what you need.\n` +
                    `📞 Call: ${CONFIG.businessPhone}`
                );
                return;
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
                
                const total = foundItems.reduce((sum, item) => sum + (item.price * item.qty), 0);
                await db.saveCart(from, cartItems, total, total);
                
                let reply = `📋 *MULTI-PRODUCT ENQUIRY*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
                
                let index = 1;
                for (const item of foundItems) {
                    const itemTotal = item.price * item.qty;
                    
                    reply += `${index}. *${item.part}*`;
                    if (item.requestedPart && item.requestedPart !== item.part) {
                        reply += ` (matched: ${item.requestedPart})`;
                    }
                    if (item.matchType === 'description') {
                        reply += ` 🏷️ (via description)`;
                    }
                    if (item.qty > 1) reply += ` x${item.qty}`;
                    reply += `\n`;
                    reply += `📝 ${item.description}\n`;
                    if (item.brand && item.brand !== 'Unknown') {
                        reply += `🏷️ Brand: ${item.brand}`;
                        if (item.make && item.make !== 'Unknown') {
                            reply += ` | Make: ${item.make}`;
                        }
                        reply += `\n`;
                    }
                    if (item.list_price > 0) reply += `💰 LIST PRICE: ₹${item.list_price.toFixed(2)}\n`;
                    if (item.mrp > 0) reply += `💰 MRP PRICE: ₹${item.mrp.toFixed(2)}\n`;
                    reply += `💳 Price: ₹${item.price.toFixed(2)} (incl. GST)\n`;
                    reply += `📦 ${item.stock > 0 ? `✅ ${item.stock} pcs` : '❌ Out of Stock'}`;
                    if (item.box_qty > 0) reply += ` | Box: ${item.box_qty}`;
                    if (item.carton > 0) reply += ` | Carton: ${item.carton}`;
                    reply += `\n\n`;
                    index++;
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
                
                await customerLog.logEnquiry(from, 'order', {
                    text: text,
                    productsFound: foundItems.map(i => i.part),
                    productsOutOfStock: outOfStock,
                    status: 'processed',
                    response: reply
                }).catch(() => {});
                
                await sendWhatsAppMessage(from, reply);
                return;
            }
        }
        
        // STEP 7: SINGLE PRODUCT ORDER
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
                if (product.list_price > 0) reply += `💰 LIST: ₹${product.list_price.toFixed(2)}\n`;
                if (product.mrp > 0) reply += `💰 MRP: ₹${product.mrp.toFixed(2)}\n`;
                reply += `💳 ₹${priceWithGST.toFixed(2)} × ${quantity} = ₹${total.toFixed(2)}\n\n`;
                reply += `━━━━━━━━━━━━━━━━━━━━\n`;
                reply += `💰 *Total: ₹${total.toFixed(2)}* (incl. GST)\n`;
                reply += `━━━━━━━━━━━━━━━━━━━━\n\n`;
                
                if (product.stock === 0) {
                    reply += `⚠️ Out of Stock\n🔔 We'll notify you when available.\n\n`;
                    await customerLog.trackOutOfStock(from, product.part, product.description, quantity);
                } else if (product.stock < quantity) {
                    reply += `⚠️ Only ${product.stock} available (requested ${quantity})\n\n`;
                }
                
                reply += `✅ *Confirm order?* Reply "Confirm Order"\n`;
                reply += `🗑️ *Clear Cart* - Start fresh\n\n`;
                reply += `📞 Call: ${CONFIG.businessPhone}`;
                
                await customerLog.logEnquiry(from, 'order', {
                    text: text,
                    productsFound: [product.part],
                    productsOutOfStock: product.stock === 0 ? [product.part] : [],
                    status: 'processed',
                    response: reply
                }).catch(() => {});
                
                await sendWhatsAppMessage(from, reply);
                return;
            } else {
                const geminiReply = await getGeminiWebSearch(`Part number ${partNumber} auto spare part`, from);
                if (geminiReply) {
                    await sendWhatsAppMessage(from, `🔍 *Part "${partNumber}" not found in our database*\n\n${geminiReply}`);
                    return;
                }
                await sendWhatsAppMessage(from, `❌ Product "${partNumber}" not found.`);
                return;
            }
        }
        
        // STEP 8: SEARCH PRODUCTS
        if (cleaned.length >= 2) {
            let exactProduct = await db.getProductExact(cleaned);
            
            if (exactProduct) {
                let reply = `🔍 Found 1 result(s)\n\n`;
                reply += formatProductForWhatsApp(exactProduct, 0);
                reply += `\n🛒 To order: Send part number with quantity\n`;
                reply += `📝 Example: "${exactProduct.part} 2"\n`;
                reply += `📞 Call: ${CONFIG.businessPhone}`;
                
                await customerLog.logEnquiry(from, 'search', {
                    text: cleaned,
                    productsFound: [exactProduct.part],
                    status: 'processed',
                    response: reply
                }).catch(() => {});
                
                await sendWhatsAppMessage(from, reply);
                return;
            }
            
            const results = await db.searchProducts(cleaned, 10);
            if (results.length > 0) {
                let reply = `🔍 Found ${results.length} result(s) for "${cleaned}"\n\n`;
                results.forEach((p, i) => {
                    reply += formatProductForWhatsApp(p, i);
                    reply += `\n`;
                });
                reply += `🛒 To order: Send part number with quantity\n`;
                reply += `📞 Call: ${CONFIG.businessPhone}`;
                
                await customerLog.logEnquiry(from, 'search', {
                    text: cleaned,
                    productsFound: results.map(p => p.part),
                    status: 'processed',
                    response: reply
                }).catch(() => {});
                
                await sendWhatsAppMessage(from, reply);
                return;
            }
        }
        
        // STEP 9: GEMINI WEB SEARCH FALLBACK
        console.log(`🔄 No product found. Trying Gemini web search...`);
        const geminiReply = await getGeminiWebSearch(text, from);
        if (geminiReply) {
            await customerLog.logEnquiry(from, 'ai_help', {
                text: text,
                status: 'processed',
                response: geminiReply,
                metadata: { source: 'gemini_web_search' }
            }).catch(() => {});
            
            await sendWhatsAppMessage(from, `🤖 ${geminiReply}`);
            return;
        }
        
        // STEP 10: AI FALLBACK
        const aiReply = await getAIResponse(text);
        if (aiReply) {
            await sendWhatsAppMessage(from, `🤖 ${aiReply}`);
            return;
        }
        
        // STEP 11: NO RESULTS
        await sendWhatsAppMessage(from, 
            `🔍 No results found for "${text}"\n\n` +
            `💡 Try sending a part number like "0801BA0285N"\n` +
            `💡 Or send a description like "clutch plate"\n` +
            `💡 Or send "Help" for options\n\n` +
            `📞 Call: ${CONFIG.businessPhone}`
        );
        
    } catch (error) {
        console.error(`❌ Message handler error: ${error.message}`);
        console.error(error.stack);
        await sendWhatsAppMessage(from, '⚠️ Sorry, something went wrong. Please try again.');
    }
}

// ============================================================
// 🖼️ HANDLE WHATSAPP IMAGE - FIXED
// ============================================================

async function handleWhatsAppImage(message, from) {
    try {
        const mediaId = message.image.id;
        const caption = message.image.caption || "";
        const mimeType = message.image.mime_type || 'image/jpeg';
        
        console.log(`📸 Processing image from ${from}`);
        console.log(`📸 Media ID: ${mediaId}`);
        console.log(`📸 Caption: "${caption}"`);
        
        await customerLog.logEnquiry(from, 'image', {
            mediaId: mediaId,
            text: caption,
            status: 'pending'
        }).catch(() => {});
        
        let imageBuffer;
        try {
            const mediaUrl = await getMediaURL(mediaId);
            console.log(`📸 Fetching media URL: ${mediaUrl}`);
            imageBuffer = await downloadMedia(mediaUrl);
            console.log(`📸 Image size: ${imageBuffer.length} bytes`);
        } catch (downloadError) {
            console.error(`❌ Image download failed: ${downloadError.message}`);
            await sendWhatsAppMessage(from, 
                `📸 *Image Download Failed!*\n\n` +
                `Please try again or send the part number directly.\n` +
                `📞 Call: ${CONFIG.businessPhone}`
            );
            return;
        }
        
        let extractedItems = [];
        let source = 'none';
        let errors = [];
        let geminiHelpMessage = null;
        
        // STEP 1: Try Gemini Vision
        if (CONFIG.geminiKey) {
            try {
                console.log('🤖 Trying Gemini Vision...');
                const result = await getGeminiVisionWithWebSearch(imageBuffer, caption);
                
                console.log(`📸 Gemini Result:`, JSON.stringify(result, null, 2));
                
                if (result) {
                    if (result.type === 'part') {
                        extractedItems = [{ 
                            part: result.data.part, 
                            qty: result.data.qty || 1 
                        }];
                        source = 'gemini-vision';
                        console.log(`✅ Gemini extracted part: ${result.data.part}`);
                        if (result.data.description) {
                            console.log(`✅ Gemini description: ${result.data.description}`);
                        }
                    } else if (result.type === 'message') {
                        geminiHelpMessage = result.data;
                        source = 'gemini-help';
                        console.log(`✅ Gemini provided help message`);
                    }
                }
            } catch (error) {
                console.error(`❌ Gemini Vision error:`, error.message);
                errors.push(`Gemini: ${error.message}`);
            }
        }
        
        // STEP 2: Fallback to OCR
        if (extractedItems.length === 0 && !geminiHelpMessage) {
            try {
                console.log('🔍 Trying OCR...');
                const Tesseract = require('tesseract.js');
                const result = await Tesseract.recognize(imageBuffer, 'eng');
                const ocrText = result.data.text;
                console.log(`📸 OCR Text: "${ocrText.substring(0, 200)}..."`);
                const items = extractItemsFromText(ocrText);
                if (items && items.length > 0) {
                    extractedItems = items;
                    source = 'ocr';
                    console.log(`✅ OCR extracted ${extractedItems.length} items`);
                }
            } catch (error) {
                console.error(`❌ OCR error:`, error.message);
                errors.push(`OCR: ${error.message}`);
            }
        }
        
        // STEP 3: Try caption
        if (extractedItems.length === 0 && !geminiHelpMessage && caption && caption.trim().length > 0) {
            console.log(`🔍 Trying caption: "${caption}"`);
            const items = extractItemsFromText(caption);
            if (items && items.length > 0) {
                extractedItems = items;
                source = 'caption';
                console.log(`✅ Caption extracted ${extractedItems.length} items`);
            }
        }
        
        // STEP 4: Process extracted items
        if (extractedItems.length > 0) {
            console.log(`📦 Processing ${extractedItems.length} extracted items`);
            console.log(`📦 Items:`, JSON.stringify(extractedItems, null, 2));
            
            const orderText = extractedItems.map(i => `${i.part} ${i.qty || 1}`).join('\n');
            console.log(`📝 Order text: "${orderText}"`);
            
            const reply = await processOrderFromText(orderText, from);
            console.log(`📝 Reply from processOrderFromText:`, reply ? `Yes (length: ${reply.length})` : 'No');
            
            if (reply) {
                await customerLog.logEnquiry(from, 'image', {
                    mediaId: mediaId,
                    text: caption,
                    productsFound: extractedItems.map(i => i.part),
                    status: 'processed',
                    response: reply,
                    metadata: { source: source }
                }).catch(() => {});
                
                await sendWhatsAppMessage(from, `📸 *Image Processed (via ${source})*\n\n${reply}`);
                return;
            }
        }
        
        // STEP 5: Gemini Help Message
        if (geminiHelpMessage) {
            console.log(`📤 Sending Gemini help message`);
            await customerLog.logEnquiry(from, 'image', {
                mediaId: mediaId,
                text: caption,
                status: 'processed',
                response: geminiHelpMessage,
                metadata: { source: 'gemini_help' }
            }).catch(() => {});
            
            await sendWhatsAppMessage(from, `📸 ${geminiHelpMessage}`);
            return;
        }
        
        // STEP 6: No items found
        console.log(`❌ No items extracted. Errors:`, errors);
        
        let errorMessage = `📸 *Photo Received!*\n\n` +
            `I couldn't read any part numbers from the image.\n\n` +
            `💡 *Tips:*\n` +
            `• Take a clear photo with good lighting\n` +
            `• Make sure part numbers are visible\n` +
            `• Or send the part number directly\n` +
            `📝 Example: "0801BA0285N 2"\n\n` +
            `📞 Call: ${CONFIG.businessPhone}`;
        
        await customerLog.logEnquiry(from, 'image', {
            mediaId: mediaId,
            text: caption,
            status: 'failed',
            metadata: { errors }
        }).catch(() => {});
        
        await sendWhatsAppMessage(from, errorMessage);
        
    } catch (error) {
        console.error(`❌ Image handler error:`, error.message);
        console.error(error.stack);
        await sendWhatsAppMessage(from, 
            `📸 *Sorry, I couldn't process your image.*\n\n` +
            `💡 Please send the part number directly.\n` +
            `📞 Call: ${CONFIG.businessPhone}`
        );
    }
}

// ============================================================
// 🤖 HELPER FUNCTIONS
// ============================================================

function calculateSimilarity(str1, str2) {
    if (!str1 || !str2) return 0;
    const s1 = str1.toUpperCase();
    const s2 = str2.toUpperCase();
    if (s1 === s2) return 1.0;
    if (s1.includes(s2) || s2.includes(s1)) return 0.8;
    const distance = levenshteinDistance(s1, s2);
    return (Math.max(s1.length, s2.length) - distance) / Math.max(s1.length, s2.length);
}

function levenshteinDistance(str1, str2) {
    const m = str1.length;
    const n = str2.length;
    const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (str1[i - 1] === str2[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1];
            } else {
                dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + 1);
            }
        }
    }
    return dp[m][n];
}

function formatProductForWhatsApp(product, index = 0) {
    const billingPrice = product.billing_price || product.list_price || 0;
    const priceWithGST = billingPrice * 1.18;
    
    let reply = `${index + 1}. *${product.part}*\n`;
    reply += `📝 ${product.description || 'N/A'}\n`;
    if (product.brand && product.brand !== 'Unknown') {
        reply += `🏷️ Brand: ${product.brand}`;
        if (product.make && product.make !== 'Unknown') {
            reply += ` | Make: ${product.make}`;
        }
        reply += `\n`;
    }
    if (product.type) {
        reply += `📊 Type: ${product.type}`;
        if (product.finish) {
            reply += ` | Finish: ${product.finish}`;
        }
        reply += `\n`;
    }
    if (product.model) {
        reply += `🚗 Model: ${product.model}\n`;
    }
    if (product.list_price > 0) reply += `💰 LIST PRICE: ₹${product.list_price.toFixed(2)}\n`;
    if (product.mrp > 0) reply += `💰 MRP PRICE: ₹${product.mrp.toFixed(2)}\n`;
    if (billingPrice > 0) {
        reply += `💳 Price: ₹${priceWithGST.toFixed(2)} (incl. GST)\n`;
    }
    reply += `📦 ${product.stock > 0 ? `✅ ${product.stock} pcs` : '❌ Out of Stock'}`;
    if (product.box_qty > 0) reply += ` | Box: ${product.box_qty}`;
    if (product.carton > 0) reply += ` | Carton: ${product.carton}`;
    return reply;
}

function extractItemsFromText(text) {
    if (!text) return [];
    const items = [];
    const lines = text.split(/[,;\n\r]/).map(l => l.trim()).filter(l => l.length > 0);
    for (const line of lines) {
        let match = line.match(/\b([A-Z0-9]{5,20})\s*[=\-:|\/]\s*(\d+)\b/i);
        if (match) {
            items.push({ part: match[1].toUpperCase(), qty: parseInt(match[2]) || 1 });
            continue;
        }
        match = line.match(/(\d+)\s+([A-Z0-9]{5,20})\b/i);
        if (match) {
            items.push({ part: match[2].toUpperCase(), qty: parseInt(match[1]) || 1 });
            continue;
        }
        match = line.match(/\b([A-Z0-9]{5,20})\b/i);
        if (match) {
            items.push({ part: match[1].toUpperCase(), qty: 1 });
        }
    }
    return items;
}

// ============================================================
// 📤 MEDIA HELPERS
// ============================================================

async function getMediaURL(mediaId) {
    const url = `https://graph.facebook.com/v23.0/${mediaId}`;
    const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${CONFIG.accessToken}` }
    });
    if (!response.ok) {
        throw new Error(`Failed to get media URL: ${response.status}`);
    }
    const data = await response.json();
    if (!data.url) throw new Error('No URL in media response');
    return data.url;
}

async function downloadMedia(mediaUrl) {
    const response = await fetch(mediaUrl, {
        headers: { 'Authorization': `Bearer ${CONFIG.accessToken}` }
    });
    if (!response.ok) {
        throw new Error(`Failed to download media: ${response.status}`);
    }
    const buffer = await response.arrayBuffer();
    return Buffer.from(buffer);
}

// ============================================================
// 🤖 AI RESPONSE
// ============================================================

async function getAIResponse(message) {
    if (CONFIG.chatgptKey) {
        try {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${CONFIG.chatgptKey}`
                },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages: [
                        { role: 'system', content: `You are an auto spares assistant for "Auto Spares Solution" in India. Reply in Hinglish. Keep responses short (2-3 sentences). Include our phone number: ${CONFIG.businessPhone}` },
                        { role: 'user', content: message }
                    ],
                    max_tokens: 150,
                    temperature: 0.7
                })
            });
            const data = await response.json();
            if (response.ok && data.choices?.[0]?.message?.content) {
                return data.choices[0].message.content;
            }
        } catch (e) {}
    }
    if (CONFIG.deepseekKey) {
        try {
            const response = await fetch('https://api.deepseek.com/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${CONFIG.deepseekKey}`
                },
                body: JSON.stringify({
                    model: 'deepseek-chat',
                    messages: [
                        { role: 'system', content: `You are an auto spares assistant. Reply in Hinglish. Keep short. Phone: ${CONFIG.businessPhone}` },
                        { role: 'user', content: message }
                    ],
                    max_tokens: 150,
                    temperature: 0.7
                })
            });
            const data = await response.json();
            if (response.ok && data.choices?.[0]?.message?.content) {
                return data.choices[0].message.content;
            }
        } catch (e) {}
    }
    return null;
}

// ============================================================
// 📋 PROCESS ORDER FROM TEXT
// ============================================================

async function processOrderFromText(text, from) {
    console.log(`📋 processOrderFromText called with: "${text}"`);
    const items = extractItemsFromText(text);
    console.log(`📋 Extracted items:`, JSON.stringify(items, null, 2));
    
    if (items.length === 0) {
        console.log(`⚠️ No items extracted from text`);
        return null;
    }
    
    let cartItems = [];
    let total = 0;
    let notFound = [];
    let outOfStock = [];
    
    for (const item of items) {
        console.log(`🔍 Searching for: ${item.part}`);
        let product = await db.getProductExact(item.part);
        if (!product) {
            console.log(`🔍 No exact match, trying fuzzy search...`);
            const results = await db.searchProducts(item.part, 1);
            if (results && results.length > 0) {
                const firstResult = results[0];
                const similarity = calculateSimilarity(item.part, firstResult.part);
                console.log(`🔍 Similarity: ${similarity} for ${firstResult.part}`);
                if (similarity >= 0.7) {
                    product = firstResult;
                    console.log(`✅ Fuzzy match found: ${product.part}`);
                }
            }
        } else {
            console.log(`✅ Exact match found: ${product.part}`);
        }
        
        if (product) {
            const billingPrice = product.billing_price || product.list_price || 0;
            const priceWithGST = billingPrice * 1.18;
            const itemTotal = priceWithGST * (item.qty || 1);
            
            cartItems.push({
                part: product.part,
                requestedPart: item.part,
                description: product.description,
                qty: item.qty || 1,
                price: priceWithGST,
                list_price: product.list_price,
                mrp: product.mrp,
                billing_price: billingPrice
            });
            
            total += itemTotal;
            
            if (product.stock === 0) {
                outOfStock.push(product.part);
                await customerLog.trackOutOfStock(from, product.part, product.description, item.qty || 1);
            }
        } else {
            notFound.push(item.part);
            console.log(`❌ Product not found: ${item.part}`);
        }
    }
    
    if (notFound.length > 0 && cartItems.length === 0) {
        console.log(`❌ All products not found: ${notFound.join(', ')}`);
        return `❌ Products not found: ${notFound.join(', ')}\n\n💡 Please check the part numbers.`;
    }
    
    if (cartItems.length === 0) {
        console.log(`⚠️ No cart items after processing`);
        return null;
    }
    
    console.log(`✅ Cart items: ${cartItems.length}, Total: ₹${total.toFixed(2)}`);
    await db.saveCart(from, cartItems, total, total);
    
    let reply = `🛒 *ORDER SUMMARY*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
    for (const item of cartItems) {
        const itemTotal = item.price * item.qty;
        reply += `*${item.part}*`;
        if (item.requestedPart && item.requestedPart !== item.part) {
            reply += ` (matched: ${item.requestedPart})`;
        }
        reply += ` x${item.qty}\n`;
        reply += `📝 ${item.description}\n`;
        if (item.list_price > 0) reply += `💰 LIST: ₹${item.list_price.toFixed(2)}\n`;
        if (item.mrp > 0) reply += `💰 MRP: ₹${item.mrp.toFixed(2)}\n`;
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
    
    console.log(`📤 Returning reply of length: ${reply.length}`);
    return reply;
}

// ============================================================
// 🚀 START SERVER
// ============================================================

async function startServer() {
    console.log('====================================');
    console.log('🚀 ASSIST WhatsApp Webhook v3.0 - PRODUCTION');
    console.log(`📞 Business Phone: ${CONFIG.businessPhone}`);
    console.log(`🆔 Phone Number ID: ${CONFIG.phoneNumberId}`);
    console.log(`🗄️ Database: ${process.env.DB_PATH || './db/products.db'}`);
    console.log('====================================');
    
    try {
        await db.initDatabase();
        console.log('✅ Database initialized');
        
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
        
        scheduler.startScheduler();
        console.log('✅ Scheduler started');
        
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`🚀 Server Running On Port ${PORT}`);
            console.log(`🔗 Health Check: /health`);
            console.log(`📱 Webhook: /webhook`);
            console.log(`📊 Admin Dashboard: /api/admin/dashboard`);
            console.log(`🤖 Gemini Vision: ✅ Active (Working Prompt)`);
            console.log(`💾 Memory Usage: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`);
            console.log('====================================');
        });
        
    } catch (error) {
        console.error('❌ Startup error:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// ============================================================
// 🛑 GRACEFUL SHUTDOWN
// ============================================================

process.on('SIGTERM', () => {
    console.log('🛑 Received SIGTERM, shutting down gracefully...');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('🛑 Received SIGINT, shutting down gracefully...');
    process.exit(0);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error.message);
    console.error(error.stack);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection:', reason);
});

// ============================================================
// 🚀 START
// ============================================================

startServer();

module.exports = { app };
