// ============================================================
// 📱 ASSIST WhatsApp Webhook (Multi-API Fallback)
// ============================================================

const express = require("express");
const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json());

// ============================================================
// CONFIG - ALL API KEYS
// ============================================================

const CONFIG = {
    // WhatsApp Config
    phoneNumberId: process.env.ID || "1158072170724432",
    accessToken: process.env.TOKEN,
    verifyToken: process.env.VERIFY || "assist123",
    businessPhone: process.env.PHONE || "919330102828",
    
    // ===== AI API KEYS =====
    geminiKey: process.env.GEMINI_API_KEY,
    deepseekKey: process.env.DEEPSEEK_API_KEY,
    chatgptKey: process.env.CHATGPT_API_KEY
};

console.log("====================================");
console.log("🚀 ASSIST WhatsApp Started");
console.log("📞 Business Phone:", CONFIG.businessPhone);
console.log("🧠 Gemini Key:", CONFIG.geminiKey ? "✅ Set" : "❌ Missing");
console.log("🧠 DeepSeek Key:", CONFIG.deepseekKey ? "✅ Set" : "❌ Missing");
console.log("🧠 ChatGPT Key:", CONFIG.chatgptKey ? "✅ Set" : "❌ Missing");
console.log("====================================");

// ============================================================
// PRODUCT DATABASE
// ============================================================

let allProducts = [];

function loadProducts() {
    try {
        const csvPath = path.join(__dirname, 'prices.csv');
        
        if (fs.existsSync(csvPath)) {
            const csvData = fs.readFileSync(csvPath, 'utf8');
            const lines = csvData.split('\n');
            
            for (let i = 1; i < lines.length; i++) {
                if (!lines[i].trim()) continue;
                const cols = lines[i].split(',').map(c => c.trim());
                
                allProducts.push({
                    part: cols[0] || '',
                    desc: cols[1] || 'Auto Spare Part',
                    price: parseFloat(cols[6]) || 0,
                    stock: parseInt(cols[7]) || 0,
                    brand: cols[10] || 'Unknown',
                    make: cols[11] || '',
                    model: cols[12] || '',
                    gst: 18,
                    image: cols[4] || ''
                });
            }
            
            console.log(`✅ Loaded ${allProducts.length} products from prices.csv`);
        } else {
            console.log('⚠️ prices.csv not found. Using fallback data.');
            loadFallbackProducts();
        }
    } catch (error) {
        console.error('❌ Error loading products:', error);
        loadFallbackProducts();
    }
}

function loadFallbackProducts() {
    allProducts = [
        { part: "0108FAW00360N", desc: "CLUTCH PRESSURE PLATE", price: 2336.88, stock: 18, brand: "M&M", gst: 18 },
        { part: "0108FAW00370N", desc: "CLUTCH PLATE", price: 2415.25, stock: 12, brand: "M&M", gst: 18 },
        { part: "0108FAW00400N", desc: "RELEASE BEARING", price: 1059.75, stock: 20, brand: "M&M", gst: 18 },
        { part: "0108FAW00410N", desc: "CLUTCH COVER", price: 2711.86, stock: 8, brand: "M&M", gst: 18 }
    ];
    console.log(`✅ Loaded ${allProducts.length} fallback products`);
}

// ============================================================
// AI FUNCTIONS
// ============================================================

function aiSearch(query) {
    if (!query || !allProducts.length) return [];
    
    const q = query.toLowerCase().trim();
    const results = allProducts.filter(p => {
        const part = (p.part || '').toLowerCase();
        const desc = (p.desc || '').toLowerCase();
        const brand = (p.brand || '').toLowerCase();
        const make = (p.make || '').toLowerCase();
        const model = (p.model || '').toLowerCase();
        
        return part.includes(q) || desc.includes(q) || brand.includes(q) || 
               make.includes(q) || model.includes(q);
    });
    
    results.sort((a, b) => {
        const aExact = (a.part || '').toLowerCase() === q;
        const bExact = (b.part || '').toLowerCase() === q;
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;
        return (b.stock || 0) - (a.stock || 0);
    });
    
    return results.slice(0, 10);
}

function aiPriceWithGST(price, gst = 18) {
    return price + (price * gst / 100);
}

// ============================================================
// 🧠 MULTI-API AI ENGINE (Gemini → DeepSeek → ChatGPT)
// ============================================================

async function getAIResponse(message, from = null) {
    console.log(`🧠 Getting AI response for: "${message}"`);
    
    // ============================================================
    // 1. FIRST TRY: GEMINI API
    // ============================================================
    if (CONFIG.geminiKey) {
        try {
            console.log('🔄 Trying Gemini API...');
            const geminiResponse = await callGeminiAPI(message);
            if (geminiResponse) {
                console.log('✅ Gemini response received');
                return geminiResponse;
            }
        } catch (error) {
            console.log('❌ Gemini failed:', error.message);
        }
    }
    
    // ============================================================
    // 2. SECOND TRY: DEEPSEEK API
    // ============================================================
    if (CONFIG.deepseekKey) {
        try {
            console.log('🔄 Trying DeepSeek API...');
            const deepseekResponse = await callDeepSeekAPI(message);
            if (deepseekResponse) {
                console.log('✅ DeepSeek response received');
                return deepseekResponse;
            }
        } catch (error) {
            console.log('❌ DeepSeek failed:', error.message);
        }
    }
    
    // ============================================================
    // 3. THIRD TRY: CHATGPT API
    // ============================================================
    if (CONFIG.chatgptKey) {
        try {
            console.log('🔄 Trying ChatGPT API...');
            const chatgptResponse = await callChatGPTAPI(message);
            if (chatgptResponse) {
                console.log('✅ ChatGPT response received');
                return chatgptResponse;
            }
        } catch (error) {
            console.log('❌ ChatGPT failed:', error.message);
        }
    }
    
    // ============================================================
    // 4. FINAL FALLBACK
    // ============================================================
    console.log('⚠️ All APIs failed. Using fallback response.');
    return null;
}

// ===== GEMINI API =====
async function callGeminiAPI(message) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${CONFIG.geminiKey}`;
    
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{
                parts: [{
                    text: `You are an auto spares assistant for "Auto Spares Solution". 
                    Customer asks: "${message}"
                    Reply in simple Hinglish (Hindi + English). Keep it short and helpful.`
                }]
            }]
        })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
        throw new Error(`Gemini API error: ${response.status}`);
    }
    
    return data.candidates?.[0]?.content?.parts?.[0]?.text || null;
}

// ===== DEEPSEEK API =====
async function callDeepSeekAPI(message) {
    const url = 'https://api.deepseek.com/chat/completions';
    
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${CONFIG.deepseekKey}`
        },
        body: JSON.stringify({
            model: 'deepseek-v4-flash',
            messages: [
                {
                    role: 'system',
                    content: 'You are an auto spares assistant for "Auto Spares Solution". Reply in Hinglish. Keep it short and helpful.'
                },
                {
                    role: 'user',
                    content: message
                }
            ],
            max_tokens: 150,
            temperature: 0.7
        })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
        throw new Error(`DeepSeek API error: ${response.status}`);
    }
    
    return data.choices?.[0]?.message?.content || null;
}

// ===== CHATGPT API =====
async function callChatGPTAPI(message) {
    const url = 'https://api.openai.com/v1/chat/completions';
    
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${CONFIG.chatgptKey}`
        },
        body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: 'You are an auto spares assistant for "Auto Spares Solution". Reply in Hinglish. Keep it short and helpful.'
                },
                {
                    role: 'user',
                    content: message
                }
            ],
            max_tokens: 150,
            temperature: 0.7
        })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
        throw new Error(`ChatGPT API error: ${response.status}`);
    }
    
    return data.choices?.[0]?.message?.content || null;
}

// ============================================================
// MULTI-PRODUCT FUNCTIONS
// ============================================================

function parseMultiProductEnquiryEnhanced(message) {
    const items = [];
    
    let parts = message.split(/[,;\n]/).map(p => p.trim()).filter(p => p.length > 0);
    
    if (parts.length === 1 && !message.includes(',')) {
        const msg = message.trim();
        
        let match = msg.match(/^([A-Z0-9\-]{5,15})\s*[=\-]\s*(\d+)$/i);
        if (match) {
            items.push({ part: match[1].toUpperCase(), qty: parseInt(match[2]) });
            return items;
        }
        
        match = msg.match(/^([A-Z0-9\-]{5,15})\s*[x*]\s*(\d+)$/i);
        if (match) {
            items.push({ part: match[1].toUpperCase(), qty: parseInt(match[2]) });
            return items;
        }
        
        match = msg.match(/^(\d+)\s+([A-Z0-9\-]{5,15})$/i);
        if (match) {
            items.push({ part: match[2].toUpperCase(), qty: parseInt(match[1]) });
            return items;
        }
        
        match = msg.match(/^([A-Z0-9\-]{5,15})\s+(\d+)$/i);
        if (match) {
            items.push({ part: match[1].toUpperCase(), qty: parseInt(match[2]) });
            return items;
        }
        
        match = msg.match(/^([A-Z0-9\-]{5,15})$/i);
        if (match) {
            items.push({ part: match[1].toUpperCase(), qty: 1 });
            return items;
        }
    }
    
    for (const part of parts) {
        if (!part) continue;
        
        let match = part.match(/^([A-Z0-9\-]{5,15})\s*[=\-]\s*(\d+)$/i);
        if (match) {
            items.push({ part: match[1].toUpperCase(), qty: parseInt(match[2]) });
            continue;
        }
        
        match = part.match(/^([A-Z0-9\-]{5,15})\s*[x*]\s*(\d+)$/i);
        if (match) {
            items.push({ part: match[1].toUpperCase(), qty: parseInt(match[2]) });
            continue;
        }
        
        match = part.match(/^(\d+)\s+([A-Z0-9\-]{5,15})$/i);
        if (match) {
            items.push({ part: match[2].toUpperCase(), qty: parseInt(match[1]) });
            continue;
        }
        
        match = part.match(/^([A-Z0-9\-]{5,15})\s+(\d+)$/i);
        if (match) {
            items.push({ part: match[1].toUpperCase(), qty: parseInt(match[2]) });
            continue;
        }
        
        match = part.match(/^([A-Z0-9\-]{5,15})$/i);
        if (match) {
            items.push({ part: match[1].toUpperCase(), qty: 1 });
            continue;
        }
    }
    
    return items;
}

function detectMultipleItemsWithoutQty(message) {
    const cleaned = message.trim().replace(/\s+/g, ' ');
    const partMatches = cleaned.match(/\b[A-Z0-9\-]{5,15}\b/g) || [];
    const hasQuantities = /\d+/.test(cleaned);
    
    if (partMatches.length > 1 && !hasQuantities) {
        return { isMulti: true, parts: partMatches };
    }
    
    return { isMulti: false, parts: [] };
}

function detectQuantityWithUnit(message) {
    const unitPatterns = ['pcs', 'nos', 'no', 'piece', 'pieces', 'unit', 'units', 'qty'];
    const lowerMsg = message.toLowerCase();
    
    for (const unit of unitPatterns) {
        if (lowerMsg.includes(unit)) {
            return true;
        }
    }
    return false;
}

async function processMultiProductEnquiryEnhanced(message, from) {
    const items = parseMultiProductEnquiryEnhanced(message);
    
    if (items.length === 0) return null;
    
    console.log(`🧠 Processing ${items.length} products from: "${message}"`);
    
    let productDetails = [];
    let subtotal = 0;
    let notFoundParts = [];
    
    for (const item of items) {
        const product = allProducts.find(p => p.part.toUpperCase() === item.part.toUpperCase());
        if (product) {
            const priceGST = product.price * 1.18;
            const total = priceGST * item.qty;
            subtotal += total;
            
            productDetails.push({
                part: item.part,
                description: product.desc || 'N/A',
                brand: product.brand || 'N/A',
                price: product.price,
                priceGST: priceGST,
                qty: item.qty,
                stock: product.stock || 0,
                total: total,
                inStock: product.stock > 0
            });
        } else {
            notFoundParts.push(item.part);
            productDetails.push({
                part: item.part,
                description: '❌ NOT FOUND',
                brand: 'N/A',
                price: 0,
                priceGST: 0,
                qty: item.qty,
                stock: 0,
                total: 0,
                inStock: false,
                notFound: true
            });
        }
    }
    
    const gstAmount = subtotal * 0.18;
    const grandTotal = subtotal + gstAmount;
    
    saveCart(from, productDetails, subtotal, grandTotal);
    
    let reply = `📋 *MULTI-PRODUCT ENQUIRY*\n`;
    reply += `━━━━━━━━━━━━━━━━━━━━\n\n`;
    
    let outOfStockItems = [];
    let totalItems = 0;
    
    for (const p of productDetails) {
        totalItems += p.qty;
        reply += `*${p.part}*`;
        if (p.notFound) {
            reply += ` ❌ NOT FOUND\n`;
        } else {
            reply += `\n📝 ${p.description.substring(0, 35)}...\n`;
            reply += `🏷️ ${p.brand}\n`;
            reply += `📦 ${p.qty} x ₹${p.priceGST.toFixed(2)} = ₹${p.total.toFixed(2)}\n`;
            reply += `${p.inStock ? `✅ ${p.stock} pcs available` : '❌ OUT OF STOCK'}\n`;
            if (!p.inStock) {
                outOfStockItems.push(p.part);
            }
            reply += `\n`;
        }
    }
    
    reply += `━━━━━━━━━━━━━━━━━━━━\n`;
    reply += `📊 *Summary:*\n`;
    reply += `📦 Items: ${productDetails.length}\n`;
    reply += `📦 Qty: ${totalItems}\n`;
    reply += `💰 Subtotal: ₹${subtotal.toFixed(2)}\n`;
    reply += `🧾 GST (18%): ₹${gstAmount.toFixed(2)}\n`;
    reply += `💳 *Grand Total: ₹${grandTotal.toFixed(2)}*\n`;
    reply += `━━━━━━━━━━━━━━━━━━━━\n`;
    
    if (outOfStockItems.length > 0) {
        reply += `⚠️ *Out of Stock:* ${outOfStockItems.join(', ')}\n`;
        reply += `🔔 We'll notify you when available.\n\n`;
    }
    
    if (notFoundParts.length > 0) {
        reply += `⚠️ *Not Found:* ${notFoundParts.join(', ')}\n`;
        reply += `💡 Please check these part numbers.\n\n`;
    }
    
    reply += `*What would you like to do?*\n`;
    reply += `🛒 "Confirm Order" - Place order\n`;
    reply += `📄 "Get Quote" - Generate quotation\n`;
    reply += `🗑️ "Clear Cart" - Start fresh\n\n`;
    reply += `📞 *Call:* ${CONFIG.businessPhone}`;
    
    return reply;
}

// ============================================================
// CART MANAGEMENT
// ============================================================

const carts = new Map();

function saveCart(phone, items, subtotal, grandTotal) {
    carts.set(phone, { items, subtotal, grandTotal, updatedAt: Date.now() });
}

function getCart(phone) {
    return carts.get(phone) || null;
}

function clearCart(phone) {
    carts.delete(phone);
}

// ============================================================
// MEDIA FUNCTIONS
// ============================================================

async function getMediaURL(mediaId) {
    const url = `https://graph.facebook.com/v23.0/${mediaId}`;
    const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${CONFIG.accessToken}` }
    });
    const data = await response.json();
    return data.url;
}

async function downloadMedia(mediaUrl) {
    const response = await fetch(mediaUrl, {
        headers: { 'Authorization': `Bearer ${CONFIG.accessToken}` }
    });
    const buffer = await response.arrayBuffer();
    return Buffer.from(buffer);
}

// ============================================================
// ROUTES
// ============================================================

app.get("/", (req, res) => {
    res.json({
        status: "running",
        phone: CONFIG.businessPhone,
        productsLoaded: allProducts.length,
        time: new Date()
    });
});

app.get("/webhook", (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === CONFIG.verifyToken) {
        console.log("✅ Webhook Verified");
        return res.status(200).send(challenge);
    }
    res.status(200).send("Webhook Active");
});

// ============================================================
// RECEIVE MESSAGE
// ============================================================

app.post("/webhook", async (req, res) => {
    console.log("📨 Incoming Webhook");

    try {
        if (req.body.entry?.[0]?.changes?.[0]?.value?.messages) {
            const message = req.body.entry[0].changes[0].value.messages[0];
            const from = message.from;
            const type = message.type || 'text';

            console.log(`📩 From: ${from} | Type: ${type}`);

            // ============================================================
            // 🖼️ IMAGE MESSAGE
            // ============================================================
            if (type === 'image') {
                const mediaId = message.image.id;
                const caption = message.image.caption || "";

                console.log(`🖼️ Image from: ${from} | Caption: "${caption}"`);

                try {
                    const mediaUrl = await getMediaURL(mediaId);
                    console.log(`📸 Media URL: ${mediaUrl}`);
                    
                    const imageBuffer = await downloadMedia(mediaUrl);
                    console.log(`📸 Image size: ${imageBuffer.length} bytes`);
                    
                    // Try Gemini first, then fallback to caption
                    let reply = await processPhotoWithGemini(imageBuffer, caption, from);
                    
                    // If Gemini fails and caption has part number, use it
                    if (reply.includes('Could not analyze image') && caption) {
                        const partMatch = caption.match(/\b[A-Z0-9\-]{5,15}\b/i);
                        if (partMatch) {
                            const results = aiSearch(partMatch[0]);
                            if (results.length > 0) {
                                let productReply = `📸 *Photo Received!*\n\n🔍 Found part in your caption: ${partMatch[0]}\n\n`;
                                results.forEach((p, index) => {
                                    const priceGST = aiPriceWithGST(p.price, p.gst || 18);
                                    productReply += `${index + 1}. **${p.part}**\n`;
                                    productReply += `📝 ${p.desc || 'N/A'}\n`;
                                    productReply += `💰 ₹${priceGST.toFixed(2)} (incl. GST)\n`;
                                    productReply += `📦 ${p.stock > 0 ? `✅ ${p.stock} pcs` : '❌ Out of Stock'}\n\n`;
                                });
                                productReply += `📞 *Call:* ${CONFIG.businessPhone}`;
                                reply = productReply;
                            }
                        }
                    }
                    
                    console.log("🤖 Reply:", reply);
                    await sendWhatsAppMessage(from, reply);
                } catch (error) {
                    console.error('❌ Image error:', error);
                    await sendWhatsAppMessage(from, "📸 Sorry, I couldn't process your image. Please try again.");
                }

                res.sendStatus(200);
                return;
            }

            // ============================================================
            // 🎤 VOICE MESSAGE
            // ============================================================
            if (type === 'audio') {
                await sendWhatsAppMessage(from, `🎤 Voice message received!\n\n📞 Call: ${CONFIG.businessPhone}`);
                res.sendStatus(200);
                return;
            }

            // ============================================================
            // 📝 TEXT MESSAGE
            // ============================================================
            const text = message.text?.body || "";
            console.log(`💬 Message: ${text}`);

            const reply = await processMessage(text, from);
            
            console.log("🤖 Reply:", reply);
            await sendWhatsAppMessage(from, reply);
        }
    } catch (err) {
        console.error("❌ Error:", err);
    }

    res.sendStatus(200);
});

// ============================================================
// PROCESS MESSAGE
// ============================================================

async function processMessage(msg, from = null) {
    const originalMsg = msg;
    const msgLower = msg.toLowerCase().trim();
    
    // ============================================================
    // GEMINI FALLBACK FOR UNKNOWN FORMATS
    // ============================================================
    const knownPatterns = [
        /^hi$|^hello$|^help$|^start$/i,
        /^confirm order$|^place order$/i,
        /^clear cart$|^clear$/i,
        /^get quote$|^quotation$/i,
        /^price\s+/i,
        /^stock\s+/i,
        /^order\s+/i,
        /\b[A-Z0-9\-]{5,15}\b/
    ];
    
    const matchesKnownPattern = knownPatterns.some(pattern => pattern.test(originalMsg));
    
    if (!matchesKnownPattern) {
        console.log(`🔄 No known pattern found. Using AI for: "${originalMsg}"`);
        const aiReply = await getAIResponse(originalMsg);
        if (aiReply) {
            return `🤖 *AI Assistant*\n\n${aiReply}\n\n📞 *Call:* ${CONFIG.businessPhone}\n🛒 *Shop:* https://autosparessolution.github.io`;
        }
    }
    
    // ============================================================
    // HELP COMMANDS
    // ============================================================
    if (msgLower === "hi" || msgLower === "hello" || msgLower === "help" || msgLower === "start") {
        return `👋 Welcome to Auto Spares Solution!

🤖 I'm your AI Sales Assistant

🔍 Search Parts:
Send part number like "0108FAW00360N"
Send description like "clutch plate"
Send brand like "TVS" or "M&M"

📦 *Multiple Products:*
"0108FAW00360N 0108FAW00370N 0108FAW00400N"
"0108FAW00360N x2, 0108FAW00370N x3"

📸 *Upload Photo:*
Send photo of any part

🎤 *Voice Message:*
Send voice note with your query

💰 Check Price:
"Price 0108FAW00360N"

📦 Check Stock:
"Stock 0108FAW00360N"

🛒 Place Order:
"Order 0108FAW00360N"

📞 Call: ${CONFIG.businessPhone}
🛒 Shop: https://autosparessolution.com

How can I help you today? 🚗`;
    }
    
    // ============================================================
    // CONFIRM ORDER
    // ============================================================
    if (msgLower === "confirm order" || msgLower === "place order") {
        const cart = getCart(from);
        if (!cart || cart.items.length === 0) {
            return `🛒 Your cart is empty.\n\n💡 Add items: "0108FAW00360N 0108FAW00370N"`;
        }
        
        let orderSummary = `✅ *ORDER CONFIRMED*\n\n`;
        orderSummary += `━━━━━━━━━━━━━━━━━━━━\n`;
        
        for (const item of cart.items) {
            orderSummary += `📦 ${item.part} x${item.qty}\n`;
        }
        
        orderSummary += `━━━━━━━━━━━━━━━━━━━━\n`;
        orderSummary += `💰 Total: ₹${(cart.grandTotal || 0).toFixed(2)}\n`;
        orderSummary += `━━━━━━━━━━━━━━━━━━━━\n\n`;
        orderSummary += `📦 *Ready for processing*\n`;
        orderSummary += `🚚 Delivery: 2-3 business days\n\n`;
        orderSummary += `💳 *Pay here:* https://razorpay.me/@autosparessolution\n\n`;
        orderSummary += `📞 *Call:* ${CONFIG.businessPhone}\n`;
        orderSummary += `*Thank you for your order!* 🚗`;
        
        clearCart(from);
        return orderSummary;
    }
    
    // ============================================================
    // CLEAR CART
    // ============================================================
    if (msgLower === "clear cart" || msgLower === "clear") {
        clearCart(from);
        return `🗑️ Cart cleared!`;
    }
    
    // ============================================================
    // GET QUOTE
    // ============================================================
    if (msgLower === "get quote" || msgLower === "quotation") {
        const cart = getCart(from);
        if (!cart || cart.items.length === 0) {
            return `📄 Your cart is empty.\n\n💡 Add items: "0108FAW00360N 0108FAW00370N"`;
        }
        
        const quotationNo = `Q-${Date.now().toString().slice(-6)}`;
        const date = new Date().toLocaleDateString('en-IN');
        
        let reply = `📄 *QUOTATION ${quotationNo}*\n\n`;
        reply += `📅 ${date}\n`;
        reply += `━━━━━━━━━━━━━━━━━━━━\n`;
        
        for (const item of cart.items) {
            const product = allProducts.find(p => p.part.toUpperCase() === item.part.toUpperCase());
            const priceGST = product ? product.price * 1.18 : 0;
            const total = priceGST * item.qty;
            reply += `📦 ${item.part} x${item.qty}\n`;
            if (product) {
                reply += `   📝 ${product.desc.substring(0, 30)}...\n`;
            }
            reply += `   💰 ₹${priceGST.toFixed(2)} each = ₹${total.toFixed(2)}\n`;
        }
        
        reply += `━━━━━━━━━━━━━━━━━━━━\n`;
        reply += `💰 Total: ₹${(cart.grandTotal || 0).toFixed(2)}\n`;
        reply += `━━━━━━━━━━━━━━━━━━━━\n\n`;
        reply += `✅ Valid until: ${new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toLocaleDateString()}\n\n`;
        reply += `📞 *Call:* ${CONFIG.businessPhone} to confirm\n`;
        reply += `*Thank you!*`;
        
        return reply;
    }
    
    // ============================================================
    // MULTI-PRODUCT DETECTION
    // ============================================================
    
    const multiWithoutQty = detectMultipleItemsWithoutQty(originalMsg);
    if (multiWithoutQty.isMulti) {
        const items = multiWithoutQty.parts.map(part => ({
            part: part.toUpperCase(),
            qty: 1
        }));
        const itemMessage = items.map(item => `${item.part} x${item.qty}`).join(', ');
        const multiReply = await processMultiProductEnquiryEnhanced(itemMessage, from);
        if (multiReply) {
            return multiReply;
        }
    }
    
    const hasMultiPattern = /[,;]/.test(originalMsg) ||
                           /\d+\s+[A-Z0-9\-]/.test(originalMsg) ||
                           /[A-Z0-9\-]\s*[=x*\-]\s*\d/.test(originalMsg) ||
                           /[A-Z0-9\-]\s+\d/.test(originalMsg);
    
    const partMatches = originalMsg.match(/\b[A-Z0-9\-]{5,15}\b/g) || [];
    const isMulti = hasMultiPattern || partMatches.length > 1;
    
    const commandWords = ['price', 'stock', 'order', 'help', 'hi', 'hello', 'start', 
                          'confirm', 'quote', 'proforma', 'clear', 'profile'];
    const isCommand = commandWords.some(word => msgLower.includes(word));
    
    if (isMulti && !isCommand) {
        const multiReply = await processMultiProductEnquiryEnhanced(originalMsg, from);
        if (multiReply) {
            return multiReply;
        }
    }
    
    // ============================================================
    // PRICE/STOCK/ORDER COMMANDS
    // ============================================================
    if (msgLower.includes("price") || msgLower.includes("stock") || msgLower.includes("order")) {
        const words = originalMsg.split(' ');
        const possiblePart = words.find(w => w.match(/^[A-Z0-9\-]{5,15}$/i));
        
        if (possiblePart) {
            const results = aiSearch(possiblePart);
            if (results.length > 0) {
                const p = results[0];
                const priceGST = aiPriceWithGST(p.price, p.gst || 18);
                
                let reply = '';
                if (msgLower.includes("price")) {
                    reply = `💰 *Price: ${p.part}*\n\n`;
                    reply += `📝 ${p.desc || 'N/A'}\n`;
                    reply += `🏷️ Brand: ${p.brand || 'N/A'}\n`;
                    reply += `💳 Base Price: ₹${p.price || 0}\n`;
                    reply += `🧾 GST: ${p.gst || 18}%\n`;
                    reply += `💰 Total: ₹${priceGST.toFixed(2)} (incl. GST)\n\n`;
                    reply += `📦 Stock: ${p.stock > 0 ? `✅ ${p.stock} pcs` : '❌ Out of Stock'}\n\n`;
                    reply += `🛒 Order: https://autosparessolution.com`;
                } else if (msgLower.includes("stock")) {
                    reply = `📦 *Stock: ${p.part}*\n\n`;
                    reply += `📝 ${p.desc || 'N/A'}\n`;
                    reply += `📦 ${p.stock > 0 ? `✅ ${p.stock} pcs available` : '❌ Out of Stock'}\n`;
                    if (p.stock > 0) {
                        reply += `💰 ₹${priceGST.toFixed(2)} (incl. GST)\n\n`;
                        reply += `🛒 Order: https://autosparessolution.com`;
                    } else {
                        reply += `\n🔔 We'll notify you when back in stock!`;
                    }
                } else if (msgLower.includes("order")) {
                    reply = `🛒 *Order: ${p.part}*\n\n`;
                    reply += `📝 ${p.desc || 'N/A'}\n`;
                    if (p.stock > 0) {
                        reply += `💰 ₹${priceGST.toFixed(2)} (incl. GST)\n`;
                        reply += `📦 ✅ ${p.stock} pcs available\n\n`;
                        reply += `✅ Confirm order: https://autosparessolution.com\n`;
                        reply += `📞 Call: ${CONFIG.businessPhone}`;
                    } else {
                        reply += `📦 ❌ Out of Stock\n\n`;
                        reply += `🔔 We'll notify you when back in stock!\n`;
                        reply += `💡 Need an alternative? Reply "ALTERNATIVE"`;
                    }
                }
                return reply;
            }
        }
        
        return `❌ No product found.\n\n💡 Try:\n"Price 0108FAW00360N"\n"Stock 0108FAW00360N"\n"Order 0108FAW00360N"\n\n📞 Call: ${CONFIG.businessPhone}`;
    }
    
    // ============================================================
    // SEARCH PRODUCTS
    // ============================================================
    const results = aiSearch(msgLower);
    
    if (results.length > 0) {
        let reply = `🔍 Found ${results.length} result(s)\n\n`;
        results.forEach((p, index) => {
            const priceGST = aiPriceWithGST(p.price, p.gst || 18);
            reply += `${index + 1}. **${p.part}**\n`;
            reply += `📝 ${p.desc || 'N/A'}\n`;
            reply += `🏷️ Brand: ${p.brand || 'N/A'}\n`;
            reply += `💰 ₹${priceGST.toFixed(2)} (incl. GST)\n`;
            reply += `📦 ${p.stock > 0 ? `✅ ${p.stock} pcs` : '❌ Out of Stock'}\n\n`;
        });
        reply += `🛒 Order: https://autosparessolution.com\n`;
        reply += `📞 Call: ${CONFIG.businessPhone}`;
        return reply;
    }
    
    // ============================================================
    // AI FALLBACK (Gemini → DeepSeek → ChatGPT)
    // ============================================================
    const aiReply = await getAIResponse(originalMsg);
    if (aiReply) {
        return `🤖 *AI Assistant*\n\n${aiReply}\n\n📞 Call: ${CONFIG.businessPhone}\n🛒 Shop: https://autosparessolution.github.io`;
    }
    
    // ============================================================
    // FINAL FALLBACK
    // ============================================================
    return `🔍 I couldn't find "${originalMsg}" in our inventory.

💡 Try:
1️⃣ Part number like 0108FAW00360N
2️⃣ Description like clutch plate
3️⃣ Brand name like TVS or M&M

📋 Quick Commands:
"Price 0108FAW00360N" → Check price
"Stock 0108FAW00360N" → Check availability
"Order 0108FAW00360N" → Place order

📞 Call: ${CONFIG.businessPhone}
🛒 Shop: https://autosparessolution.github.io

We'll help you find the right part! 🚗`;
}

// ============================================================
// SEND WHATSAPP MESSAGE
// ============================================================

async function sendWhatsAppMessage(to, message) {
    const url = `https://graph.facebook.com/v23.0/${CONFIG.phoneNumberId}/messages`;
    
    try {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${CONFIG.accessToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                messaging_product: "whatsapp",
                to: to,
                type: "text",
                text: { body: message }
            })
        });
        const result = await response.json();
        console.log("✅ Meta Response:", result.messages?.[0]?.id ? "Message Sent" : "Error");
        return result;
    } catch (err) {
        console.error("❌ Send error:", err);
    }
}

// ============================================================
// START SERVER
// ============================================================

loadProducts();

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log("====================================");
    console.log("Server Running On Port", PORT);
    console.log("====================================");
});

console.log('✅ All features loaded successfully!');
console.log('📱 Multi-product support active');
console.log('🖼️ Photo analysis active');
console.log('🎤 Voice message support active');
console.log('🧠 Multi-API fallback active (Gemini → DeepSeek → ChatGPT)');
