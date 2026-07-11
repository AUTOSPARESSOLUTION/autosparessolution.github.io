// ============================================================
// 🚀 ASSIST WhatsApp Webhook v3.0 - COMPLETE WORKING
// Uses: ID, TOKEN, VERIFY, PHONE, CHATGPT_API_KEY, DEEPSEEK_API_KEY, GEMINI_KEY
// ============================================================

const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const compression = require('compression');

// Ensure directories exist
const dirs = ['db', 'logs', 'uploads'];
dirs.forEach(dir => {
    const dirPath = path.join(__dirname, dir);
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        console.log(`📁 Created directory: ${dir}`);
    }
});

// Import modules
const db = require('./modules/database');
const { importCSV } = require('./modules/csv-loader');

const app = express();
const PORT = process.env.PORT || 10000;

// ============================================================
// 🔧 CONFIGURATION - Using Your Render Variables
// ============================================================

const CONFIG = {
    // WhatsApp - Using your exact variable names
    phoneNumberId: process.env.ID,           // Your Phone Number ID
    accessToken: process.env.TOKEN,          // Your Access Token
    verifyToken: process.env.VERIFY || "assist123",
    businessPhone: process.env.PHONE || "9830300193",
    
    // AI Keys
    chatgptKey: process.env.CHATGPT_API_KEY,
    deepseekKey: process.env.DEEPSEEK_API_KEY,
    geminiKey: process.env.GEMINI_KEY,
};

console.log('====================================');
console.log('🚀 ASSIST WhatsApp Webhook v3.0');
console.log(`📞 Business Phone: ${CONFIG.businessPhone}`);
console.log(`🆔 Phone Number ID: ${CONFIG.phoneNumberId}`);
console.log(`🔑 Token: ${CONFIG.accessToken ? '✅ Set' : '❌ Not set'}`);
console.log(`🔐 Verify Token: ${CONFIG.verifyToken}`);
console.log(`🧠 ChatGPT: ${CONFIG.chatgptKey ? '✅ Set' : '❌ Not set'}`);
console.log(`🧠 DeepSeek: ${CONFIG.deepseekKey ? '✅ Set' : '❌ Not set'}`);
console.log(`🧠 Gemini: ${CONFIG.geminiKey ? '✅ Set' : '❌ Not set'}`);
console.log('====================================');

// ============================================================
// 🛡️ MIDDLEWARE
// ============================================================

app.use(cors());
app.use(compression());
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.set('trust proxy', 1);

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Too many requests, please try again later.'
});
app.use('/webhook', limiter);

// ============================================================
// 📂 STATIC FILES
// ============================================================

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/logs', express.static(path.join(__dirname, 'logs')));

// ============================================================
// 📄 ROUTES
// ============================================================

// Health check
app.get('/health', async (req, res) => {
    try {
        const stats = await db.getStats();
        res.json({
            status: 'ok',
            version: '3.0.0',
            timestamp: new Date().toISOString(),
            config: {
                phoneNumberId: CONFIG.phoneNumberId ? '✅ Set' : '❌ Not set',
                accessToken: CONFIG.accessToken ? '✅ Set' : '❌ Not set',
                verifyToken: CONFIG.verifyToken,
                businessPhone: CONFIG.businessPhone
            },
            products: stats || { total_products: 0 }
        });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
});

app.get('/', (req, res) => {
    res.json({
        name: 'ASSIST WhatsApp Webhook',
        version: '3.0.0',
        status: 'running',
        endpoints: {
            health: '/health',
            webhook: '/webhook',
            search: '/api/search?q=part_number',
            product: '/api/product/part_number',
            stats: '/api/stats',
            import: '/api/import',
            tokenTest: '/token-test'
        }
    });
});

// Token test endpoint
app.get('/token-test', async (req, res) => {
    try {
        const fetch = require('node-fetch');
        const response = await fetch(`https://graph.facebook.com/v23.0/${CONFIG.phoneNumberId}`, {
            headers: {
                'Authorization': `Bearer ${CONFIG.accessToken}`
            }
        });
        const data = await response.json();
        res.json({
            success: true,
            phoneNumberId: CONFIG.phoneNumberId,
            tokenValid: !data.error,
            data: data
        });
    } catch (error) {
        res.json({
            success: false,
            error: error.message
        });
    }
});

// Import CSV
app.post('/api/import', async (req, res) => {
    try {
        const csvPath = path.join(__dirname, 'prices.csv');
        if (!fs.existsSync(csvPath)) {
            return res.status(404).json({ 
                success: false, 
                error: 'prices.csv not found' 
            });
        }
        const result = await importCSV(csvPath);
        res.json(result);
    } catch (error) {
        console.error('Import error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Search products
app.get('/api/search', async (req, res) => {
    try {
        const { q, limit = 10 } = req.query;
        if (!q) {
            return res.status(400).json({ error: 'Query parameter "q" is required' });
        }
        const results = await db.searchProducts(q, parseInt(limit));
        res.json({ query: q, count: results.length, results });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get product by part number
app.get('/api/product/:part', async (req, res) => {
    try {
        const product = await db.getProduct(req.params.part);
        if (product) {
            res.json(product);
        } else {
            res.status(404).json({ error: 'Product not found' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get stats
app.get('/api/stats', async (req, res) => {
    try {
        const stats = await db.getStats();
        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get import history
app.get('/api/history', async (req, res) => {
    try {
        const history = await db.getImportHistory();
        res.json(history);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================================
// 📩 WEBHOOK
// ============================================================

// Webhook verification (GET)
app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    
    console.log(`🔐 Webhook Verification: mode=${mode}, token=${token}`);
    console.log(`🔐 Expected Token: ${CONFIG.verifyToken}`);
    
    if (mode === 'subscribe' && token === CONFIG.verifyToken) {
        console.log('✅ Webhook Verified!');
        return res.status(200).send(challenge);
    }
    
    console.log('❌ Verification Failed!');
    res.status(403).send('Verification failed');
});

// Webhook receive (POST)
app.post('/webhook', async (req, res) => {
    console.log('📨 Webhook POST received');
    
    try {
        const entry = req.body.entry?.[0];
        const change = entry?.changes?.[0];
        const value = change?.value;
        const message = value?.messages?.[0];
        
        if (message) {
            const from = message.from;
            const type = message.type || 'text';
            
            console.log(`📩 From: ${from} | Type: ${type}`);
            
            // Process message asynchronously
            setImmediate(async () => {
                try {
                    await handleWhatsAppMessage(message, from, type);
                } catch (error) {
                    console.error(`❌ Async error: ${error.message}`);
                }
            });
        }
        
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
        console.log(`📤 URL: ${url}`);
        console.log(`📤 Token: ${CONFIG.accessToken ? '✅ Present' : '❌ Missing'}`);
        
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
                text: { body: message }
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
// 🔍 FORMAT PRODUCT FOR WHATSAPP
// ============================================================

function formatProductForWhatsApp(product, index = 0) {
    const billingPrice = product.billing_price || product.list_price || 0;
    const priceWithGST = billingPrice * 1.18;
    const gstAmount = billingPrice * 0.18;
    
    let reply = `${index + 1}. *${product.part}*\n`;
    reply += `📝 ${product.description || 'N/A'}\n`;
    
    if (product.brand && product.brand !== 'Unknown') {
        reply += `🏷️ Brand: ${product.brand}`;
        if (product.make && product.make !== 'Unknown' && product.make !== product.brand) {
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
        reply += `🚗 Model: ${product.model}`;
        if (product.segment) {
            reply += ` | Segment: ${product.segment}`;
        }
        reply += `\n`;
    }
    
    // ✅ FULL PRICE BREAKDOWN
    if (product.list_price > 0) {
        reply += `💰 LIST PRICE: ₹${product.list_price.toFixed(2)}\n`;
    }
    if (product.mrp > 0) {
        reply += `💰 MRP PRICE: ₹${product.mrp.toFixed(2)}\n`;
    }
    if (billingPrice > 0) {
        reply += `💳 Billing Price: ₹${billingPrice.toFixed(2)}\n`;
        reply += `🧾 GST (18%): ₹${gstAmount.toFixed(2)}\n`;
        reply += `💳 Price incl. GST: ₹${priceWithGST.toFixed(2)}\n`;
    }
    
    // Stock & Packaging
    let stockInfo = [];
    if (product.stock > 0) {
        stockInfo.push(`✅ ${product.stock} pcs`);
    } else {
        stockInfo.push(`❌ Out of Stock`);
    }
    if (product.box_qty > 0) {
        stockInfo.push(`Box: ${product.box_qty}`);
    }
    if (product.carton > 0) {
        stockInfo.push(`Carton: ${product.carton}`);
    }
    if (stockInfo.length > 0) {
        reply += `📦 ${stockInfo.join(' | ')}\n`;
    }
    
    if (product.hsn) {
        reply += `📋 HSN: ${product.hsn}\n`;
    }
    
    return reply;
}

// ============================================================
// 📩 HANDLE WHATSAPP MESSAGE
// ============================================================

async function handleWhatsAppMessage(message, from, type) {
    try {
        if (type === 'text') {
            const text = message.text?.body || '';
            console.log(`💬 Message: "${text}"`);
            
            // ✅ DEBUG: Check database stats
            const stats = await db.getStats();
            console.log(`📊 Database has ${stats.total_products || 0} products`);
            
            // ✅ DEBUG: Search immediately
            console.log(`🔍 Searching for: "${text}"`);
            const results = await db.searchProducts(text, 5);
            console.log(`📊 Found ${results.length} results`);
            
            if (results.length > 0) {
                console.log(`📦 First result: ${results[0].part}`);
            }
            
            const msgLower = text.toLowerCase().trim();
            
            // ============================================================
            // WELCOME MESSAGE
            // ============================================================
            if (msgLower === 'hi' || msgLower === 'hello' || msgLower === 'help' || msgLower === 'start' || msgLower === 'menu') {
                const welcome = 
                    `👋 *Welcome to Auto Spares Solution!*\n\n` +
                    `🤖 I'm your AI Sales Assistant\n\n` +
                    `🔍 *Search Parts:*\n` +
                    `Send part number like "0801BA0285N"\n` +
                    `Send description like "clutch plate"\n` +
                    `Send brand like "M&M"\n\n` +
                    `💰 *Check Price:*\n` +
                    `"Price 0801BA0285N"\n\n` +
                    `📦 *Check Stock:*\n` +
                    `"Stock 0801BA0285N"\n\n` +
                    `🛒 *Place Order:*\n` +
                    `"Order 0801BA0285N 2"\n\n` +
                    `📞 *Call:* ${CONFIG.businessPhone}\n` +
                    `🛒 *Shop:* https://autosparessolution.com\n\n` +
                    `*How can I help you today?* 🚗`;
                
                await sendWhatsAppMessage(from, welcome);
                return;
            }
            
            // ============================================================
            // PRICE CHECK
            // ============================================================
            if (msgLower.includes('price') || msgLower.includes('cost') || msgLower.includes('rate')) {
                const partMatch = text.toUpperCase().match(/[A-Z0-9]{8,20}/);
                if (partMatch) {
                    const partNumber = partMatch[0];
                    console.log(`🔍 Price check for: ${partNumber}`);
                    const product = await db.getProduct(partNumber);
                    if (product) {
                        console.log(`✅ Found: ${product.part}`);
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
                        
                        await sendWhatsAppMessage(from, reply);
                        return;
                    }
                }
            }
            
            // ============================================================
            // STOCK CHECK
            // ============================================================
            if (msgLower.includes('stock') || msgLower.includes('available')) {
                const partMatch = text.toUpperCase().match(/[A-Z0-9]{8,20}/);
                if (partMatch) {
                    const partNumber = partMatch[0];
                    console.log(`🔍 Stock check for: ${partNumber}`);
                    const product = await db.getProduct(partNumber);
                    if (product) {
                        let reply = `📦 *Stock: ${product.part}*\n\n`;
                        reply += `📝 ${product.description}\n`;
                        reply += `📦 ${product.stock > 0 ? `✅ ${product.stock} pcs available` : '❌ Out of Stock'}`;
                        if (product.box_qty > 0) reply += ` | Box: ${product.box_qty}`;
                        if (product.carton > 0) reply += ` | Carton: ${product.carton}`;
                        await sendWhatsAppMessage(from, reply);
                        return;
                    }
                }
            }
            
            // ============================================================
            // ORDER COMMAND
            // ============================================================
            if (msgLower.includes('order') || msgLower.includes('buy')) {
                const orderMatch = text.toUpperCase().match(/(\d+)?\s*([A-Z0-9]{8,20})/);
                if (orderMatch) {
                    const qty = parseInt(orderMatch[1]) || 1;
                    const partNumber = orderMatch[2];
                    console.log(`🛒 Order: ${qty} x ${partNumber}`);
                    
                    const product = await db.getProduct(partNumber);
                    if (product) {
                        const billingPrice = product.billing_price || product.list_price || 0;
                        const priceWithGST = billingPrice * 1.18;
                        const total = priceWithGST * qty;
                        
                        const cartItems = [{
                            part: product.part,
                            description: product.description,
                            qty: qty,
                            price: priceWithGST,
                            list_price: product.list_price,
                            mrp: product.mrp,
                            billing_price: billingPrice
                        }];
                        
                        await db.saveCart(from, cartItems, total, total);
                        console.log(`✅ Cart saved: ${qty} x ${product.part} = ₹${total.toFixed(2)}`);
                        
                        let reply = `🛒 *Order: ${product.part} x${qty}*\n\n`;
                        reply += `📝 ${product.description}\n`;
                        if (product.brand) reply += `🏷️ Brand: ${product.brand}\n`;
                        if (product.list_price > 0) reply += `💰 LIST PRICE: ₹${product.list_price.toFixed(2)}\n`;
                        if (product.mrp > 0) reply += `💰 MRP PRICE: ₹${product.mrp.toFixed(2)}\n`;
                        reply += `💳 Billing Price: ₹${billingPrice.toFixed(2)}\n`;
                        const gstAmount = billingPrice * 0.18;
                        reply += `🧾 GST (18%): ₹${gstAmount.toFixed(2)}\n`;
                        reply += `💳 ₹${priceWithGST.toFixed(2)} × ${qty} = ₹${total.toFixed(2)} (incl. GST)\n`;
                        reply += `📦 ${product.stock > 0 ? `✅ ${product.stock} pcs available` : '❌ Out of Stock'}\n\n`;
                        
                        if (product.stock > 0 && product.stock >= qty) {
                            reply += `✅ *Confirm order?* Reply "Confirm Order"`;
                        } else if (product.stock > 0 && product.stock < qty) {
                            reply += `⚠️ Only ${product.stock} pcs available (requested ${qty})\n\n`;
                            reply += `✅ *Confirm partial order?* Reply "Confirm Order"`;
                        } else {
                            reply += `🔔 *We'll notify you when back in stock!*`;
                        }
                        
                        await sendWhatsAppMessage(from, reply);
                        return;
                    }
                }
            }
            
            // ============================================================
            // CONFIRM ORDER
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
                    items.forEach(item => {
                        reply += `   - ${item.part} x${item.qty} = ₹${(item.price * item.qty).toFixed(2)}\n`;
                    });
                    reply += `💰 Total: ₹${cart.total.toFixed(2)}\n`;
                    reply += `📞 *Call:* ${CONFIG.businessPhone}\n`;
                    reply += `🛒 *Shop:* https://autosparessolution.com`;
                    await sendWhatsAppMessage(from, reply);
                    return;
                } else {
                    await sendWhatsAppMessage(from, '🛒 Your cart is empty. Add items first!');
                    return;
                }
            }
            
            // ============================================================
            // CLEAR CART
            // ============================================================
            if (msgLower === 'clear cart' || msgLower === 'clear') {
                await db.clearCart(from);
                await sendWhatsAppMessage(from, '🗑️ Cart cleared!');
                return;
            }
            
            // ============================================================
            // SEARCH RESULTS - Already searched above
            // ============================================================
            if (results.length > 0) {
                let reply = `🔍 Found ${results.length} result(s)\n\n`;
                
                results.forEach((p, i) => {
                    reply += formatProductForWhatsApp(p, i);
                    reply += `\n`;
                });
                
                reply += `━━━━━━━━━━━━━━━━━━━━\n`;
                reply += `🛒 To order: Send part number with quantity\n`;
                reply += `📝 Example: "${results[0]?.part} 2"\n`;
                reply += `━━━━━━━━━━━━━━━━━━━━\n`;
                reply += `🛒 Order: https://autosparessolution.com\n`;
                reply += `📞 Call: ${CONFIG.businessPhone}`;
                
                await sendWhatsAppMessage(from, reply);
            } else {
                await sendWhatsAppMessage(from, 
                    `🔍 No results found for "${text}"\n\n` +
                    `💡 Try sending a part number like:\n` +
                    `"0801BA0285N"\n\n` +
                    `💡 Or send "Help" for options\n\n` +
                    `📞 Call: ${CONFIG.businessPhone}`
                );
            }
        }
        
        // ============================================================
        // IMAGE HANDLING
        // ============================================================
        if (type === 'image') {
            await sendWhatsAppMessage(from, 
                `📸 *Photo Received!*\n\n` +
                `💡 Please send the part number directly.\n` +
                `📝 Example: "0801BA0285N 2"\n\n` +
                `💡 Or send "Help" for options\n\n` +
                `📞 Call: ${CONFIG.businessPhone}`
            );
            return;
        }
        
        // ============================================================
        // AUDIO HANDLING
        // ============================================================
        if (type === 'audio') {
            await sendWhatsAppMessage(from, 
                `🎤 *Voice Received!*\n\n` +
                `💡 Please send text or images.\n\n` +
                `💡 Or send "Help" for options\n\n` +
                `📞 Call: ${CONFIG.businessPhone}`
            );
            return;
        }
        
        // ============================================================
        // OTHER TYPES
        // ============================================================
        await sendWhatsAppMessage(from, 
            `📩 Received your ${type} message.\n\n` +
            `💡 Please send text with part numbers.\n` +
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
// 🚀 START SERVER
// ============================================================

async function startServer() {
    console.log('====================================');
    console.log('🚀 ASSIST WhatsApp Webhook v3.0');
    console.log(`📞 Business Phone: ${CONFIG.businessPhone}`);
    console.log(`🆔 Phone Number ID: ${CONFIG.phoneNumberId}`);
    console.log(`🗄️ Database: ${process.env.DB_PATH || './db/products.db'}`);
    console.log('====================================');
    
    try {
        await db.initDatabase();
        console.log('✅ Database initialized');
        
        const csvPath = path.join(__dirname, 'prices.csv');
        if (fs.existsSync(csvPath)) {
            console.log('📥 Importing CSV...');
            const result = await importCSV(csvPath);
            console.log(`✅ Imported ${result.imported} products`);
        } else {
            console.log('⚠️ prices.csv not found - using sample data');
            await db.importProducts([
                { part: '0801BA0285N', description: 'CLUTCH DISC ASSEMBLY DIA 240 mm', brand: 'M&M', make: 'MARUTI', list_price: 2103.53, mrp: 2482.17, billing_price: 2103.53, stock: 19, box_qty: 1, carton: 12, gst: 18 },
                { part: '0303BC0071N', description: 'ELEMENT OIL FILTER', brand: 'M&M', make: 'MARUTI', list_price: 182.86, mrp: 215.77, billing_price: 182.86, stock: 462, box_qty: 10, carton: 100, gst: 18 }
            ]);
            console.log('✅ Added sample products');
        }
        
        const stats = await db.getStats();
        console.log(`📦 ${stats.total_products || 0} products in database`);
        console.log(`📦 ${stats.in_stock || 0} in stock`);
        console.log('====================================');
        
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`🚀 Server Running On Port ${PORT}`);
            console.log(`🔗 Health Check: /health`);
            console.log(`📱 Webhook: /webhook`);
            console.log(`🔑 Token Test: /token-test`);
            console.log('====================================');
        });
    } catch (error) {
        console.error('❌ Startup error:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

startServer();

module.exports = { app };
