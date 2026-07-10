// ============================================================
// 📱 ASSIST WHATSAPP WEBHOOK - COMPLETE WORKING VERSION
// ============================================================

const express = require("express");
const fetch = require("node-fetch");
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createLogger, transports, format } = require('winston');
const helmet = require('helmet');

const app = express();
app.set('trust proxy', 1);
app.use(helmet());

// ============================================================
// 📊 LOGGING
// ============================================================

const logger = createLogger({
    level: 'info',
    format: format.combine(
        format.timestamp(),
        format.printf(({ timestamp, level, message }) => {
            return `${timestamp} [${level}]: ${message}`;
        })
    ),
    transports: [
        new transports.Console()
    ]
});

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
    geminiKey: process.env.GEMINI_API_KEY,
    defaultGST: 18
};

// ============================================================
// 📦 PRODUCT DATA - IN-MEMORY CACHE
// ============================================================

let allProducts = [];
let productMap = new Map();

// ============================================================
// 📦 LOAD PRODUCTS FROM CSV
// ============================================================

async function loadProductsFromCSV() {
    const csvPath = path.join(__dirname, 'prices.csv');
    
    if (!fs.existsSync(csvPath)) {
        console.log('⚠️ prices.csv not found');
        return false;
    }

    const products = [];

    await new Promise((resolve, reject) => {
        fs.createReadStream(csvPath)
            .pipe(csv({ headers: true }))
            .on('data', (row) => {
                const part = (row['Material'] || row['material'] || '').trim();
                if (!part) return;

                products.push({
                    part: part,
                    description: (row['Material2'] || row['Description'] || 'Auto Spare Part').trim(),
                    brand: (row['brand'] || row['Brand'] || 'Unknown').trim(),
                    make: (row['Make'] || '').trim(),
                    type: (row['TYPE'] || '').trim(),
                    finish: (row['FINISH'] || '').trim(),
                    list_value: parseFloat(row['LIST PRICE'] || row['List Price'] || 0),
                    mrp: parseFloat(row['MRP PRICE'] || row['MRP Price'] || 0),
                    billing_price: parseFloat(row['billing price'] || row['Billing Price'] || 0),
                    stock: parseInt(row['STOCK'] || 0),
                    box_qty: parseInt(row['Box Qty'] || 0),
                    carton: parseInt(row['Carton'] || 0),
                    gst: CONFIG.defaultGST
                });
            })
            .on('end', resolve)
            .on('error', reject);
    });

    if (products.length === 0) {
        console.log('⚠️ No products found in CSV');
        return false;
    }

    allProducts = products;
    productMap.clear();
    products.forEach(p => {
        productMap.set(p.part.toUpperCase(), p);
    });

    console.log(`✅ Loaded ${products.length} products from prices.csv`);
    return true;
}

// ============================================================
// 💰 PRICE CALCULATIONS
// ============================================================

function calculatePrices(product, qty = 1) {
    const billingPrice = product.billing_price || product.list_value || 0;
    const gstRate = product.gst || CONFIG.defaultGST || 18;
    const gstAmount = billingPrice * (gstRate / 100);
    const priceWithGST = billingPrice + gstAmount;
    
    return {
        billingPrice: billingPrice,
        mrp: product.mrp || 0,
        listValue: product.list_value || 0,
        gstRate: gstRate,
        gstAmount: gstAmount,
        priceWithGST: priceWithGST,
        totalBilling: billingPrice * qty,
        totalGST: gstAmount * qty,
        totalWithGST: priceWithGST * qty
    };
}

// ============================================================
// 🔍 SEARCH FUNCTIONS
// ============================================================

function searchProducts(query) {
    if (!query || query.trim().length < 2 || allProducts.length === 0) {
        return [];
    }
    
    const clean = query.trim().toUpperCase();
    const results = [];
    
    // 1. EXACT MATCH
    const exactMatches = allProducts.filter(p => p.part.toUpperCase() === clean);
    results.push(...exactMatches.map(p => ({ ...p, matchType: 'exact', confidence: 1.0 })));
    
    // 2. PARTIAL MATCH
    if (results.length < 10) {
        const partialMatches = allProducts.filter(p => 
            p.part.toUpperCase().includes(clean) && 
            !results.some(r => r.part === p.part)
        );
        results.push(...partialMatches.slice(0, 10).map(p => ({ ...p, matchType: 'partial', confidence: 0.7 })));
    }
    
    // 3. DESCRIPTION SEARCH
    if (results.length < 10) {
        const descMatches = allProducts.filter(p => 
            (p.description || '').toUpperCase().includes(clean) && 
            !results.some(r => r.part === p.part)
        );
        results.push(...descMatches.slice(0, 5).map(p => ({ ...p, matchType: 'description', confidence: 0.5 })));
    }
    
    // 4. BRAND SEARCH
    if (results.length < 10) {
        const brandMatches = allProducts.filter(p => 
            (p.brand || '').toUpperCase().includes(clean) && 
            !results.some(r => r.part === p.part)
        );
        results.push(...brandMatches.slice(0, 5).map(p => ({ ...p, matchType: 'brand', confidence: 0.4 })));
    }
    
    const uniqueResults = [];
    const seen = new Set();
    for (const r of results) {
        if (!seen.has(r.part)) {
            seen.add(r.part);
            uniqueResults.push(r);
        }
        if (uniqueResults.length >= 10) break;
    }
    return uniqueResults;
}

function searchProduct(partNumber) {
    const clean = partNumber.toUpperCase().trim();
    if (!clean || clean.length < 3) return null;

    let product = productMap.get(clean);
    if (product) {
        return { product: product, confidence: 1.0, method: 'exact' };
    }

    const partialMatches = allProducts.filter(p => 
        p.part.toUpperCase().includes(clean) && 
        p.part.toUpperCase() !== clean
    );
    if (partialMatches.length > 0) {
        const best = partialMatches[0];
        return { product: best, confidence: 0.7, method: 'partial', original: clean };
    }

    return null;
}

// ============================================================
// 📋 FORMAT SEARCH RESULTS
// ============================================================

function formatSearchResults(products, query) {
    if (!products || products.length === 0) {
        return `🔍 No results found for "${query}"\n\n💡 Try:\n• Check the spelling\n• Use part number\n• Search by brand\n\n📞 Call: ${CONFIG.businessPhone}`;
    }
    
    let reply = `🔍 Found ${products.length} result(s)\n\n`;
    
    let index = 1;
    for (const product of products) {
        const prices = calculatePrices(product);
        
        reply += `${index}. *${product.part}*`;
        if (product.matchType && product.matchType !== 'exact') {
            reply += ` (${product.matchType})`;
        }
        reply += `\n`;
        
        if (product.description && product.description !== 'Auto Spare Part') {
            reply += `📝 ${product.description}\n`;
        }
        
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
        
        // ✅ FULL PRICE BREAKDOWN
        if (prices.listValue > 0) {
            reply += `💰 LIST PRICE: ₹${prices.listValue.toFixed(2)}\n`;
        }
        if (prices.mrp > 0) {
            reply += `💰 MRP PRICE: ₹${prices.mrp.toFixed(2)}\n`;
        }
        if (prices.billingPrice > 0) {
            reply += `💳 Billing Price: ₹${prices.billingPrice.toFixed(2)}\n`;
            reply += `🧾 GST (${prices.gstRate}%): ₹${prices.gstAmount.toFixed(2)}\n`;
            reply += `💳 Price incl. GST: ₹${prices.priceWithGST.toFixed(2)}\n`;
        }
        
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
        
        reply += `\n`;
        index++;
    }
    
    reply += `━━━━━━━━━━━━━━━━━━━━\n`;
    reply += `🛒 To order: Send part number with quantity\n`;
    reply += `📝 Example: "${products[0]?.part} 2"\n`;
    reply += `━━━━━━━━━━━━━━━━━━━━\n`;
    reply += `🛒 Order: https://autosparessolution.com\n`;
    reply += `📞 Call: ${CONFIG.businessPhone}`;
    
    return reply;
}

// ============================================================
// 🔧 QUANTITY PARSER
// ============================================================

function extractItemsFromTextUltimate(text) {
    const items = [];
    const lines = text.split(/[,;\n]/).map(l => l.trim()).filter(l => l.length > 0);
    
    for (const line of lines) {
        // Pattern: 2 PART123 or PART123 2
        let match = line.match(/(\d+)\s+([A-Z0-9]{5,30})/i);
        if (match) {
            items.push({ part: match[2].toUpperCase(), qty: parseInt(match[1]) || 1 });
            continue;
        }
        
        // Pattern: PART123 2
        match = line.match(/([A-Z0-9]{5,30})\s+(\d+)/i);
        if (match) {
            items.push({ part: match[1].toUpperCase(), qty: parseInt(match[2]) || 1 });
            continue;
        }
        
        // Pattern: PART123 = 2
        match = line.match(/([A-Z0-9]{5,30})\s*[=\-:]\s*(\d+)/i);
        if (match) {
            items.push({ part: match[1].toUpperCase(), qty: parseInt(match[2]) || 1 });
            continue;
        }
        
        // Pattern: PART123 (no quantity)
        match = line.match(/\b([A-Z0-9]{5,30})\b/i);
        if (match) {
            items.push({ part: match[1].toUpperCase(), qty: 1 });
            continue;
        }
    }
    
    return items;
}

// ============================================================
// 📦 ORDER PROCESSING
// ============================================================

function processOrder(text, from) {
    console.log(`📝 Processing order from ${from}`);
    
    const items = extractItemsFromTextUltimate(text);
    if (items.length === 0) {
        return null;
    }
    
    const results = [];
    for (const item of items) {
        const searchResult = searchProduct(item.part);
        if (searchResult) {
            results.push({ ...searchResult, qty: item.qty });
        }
    }
    
    if (results.length === 0) {
        const notFound = items.map(i => i.part).join(', ');
        return `❌ Parts not found: ${notFound}\n\n💡 Please check the part numbers.\n📞 Call: ${CONFIG.businessPhone}`;
    }
    
    let reply = `📋 *ORDER EXTRACTED*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
    
    for (const r of results) {
        const p = r.product;
        const prices = calculatePrices(p, r.qty);
        
        reply += `*${p.part}*`;
        if (r.confidence < 1) reply += ` (${Math.round(r.confidence * 100)}%)`;
        if (r.original) reply += `\n   📝 OCR read: ${r.original}`;
        reply += `\n📝 ${p.description}`;
        if (p.brand && p.brand !== 'Unknown') reply += `\n🏷️ Brand: ${p.brand}`;
        if (p.make && p.make !== 'Unknown') reply += `\n🏭 Make: ${p.make}`;
        
        if (prices.listValue > 0) {
            reply += `\n💰 LIST PRICE: ₹${prices.listValue.toFixed(2)}`;
        }
        if (prices.mrp > 0) {
            reply += `\n💰 MRP PRICE: ₹${prices.mrp.toFixed(2)}`;
        }
        if (prices.billingPrice > 0) {
            reply += `\n💳 Billing Price: ₹${prices.billingPrice.toFixed(2)}`;
            reply += `\n🧾 GST (${prices.gstRate}%): ₹${prices.gstAmount.toFixed(2)}`;
            reply += `\n💳 Price incl. GST: ₹${prices.priceWithGST.toFixed(2)}`;
        }
        
        reply += `\n📦 ${r.qty} x ₹${prices.priceWithGST.toFixed(2)} = ₹${(prices.priceWithGST * r.qty).toFixed(2)}`;
        
        if (p.stock > 0 && p.stock >= r.qty) {
            reply += `\n📦 ✅ ${p.stock} pcs available`;
        } else if (p.stock > 0 && p.stock < r.qty) {
            reply += `\n📦 ⚠️ Only ${p.stock} pcs available (requested ${r.qty})`;
        } else {
            reply += `\n📦 ❌ OUT OF STOCK`;
        }
        reply += `\n\n`;
    }
    
    reply += `━━━━━━━━━━━━━━━━━━━━\n`;
    reply += `🛒 "Confirm Order" - Place order\n`;
    reply += `📄 "Get Quote" - Generate quotation\n`;
    reply += `🗑️ "Clear Cart" - Start fresh\n\n`;
    reply += `📞 Call: ${CONFIG.businessPhone}`;
    
    return reply;
}

// ============================================================
// 🧠 AI FALLBACK
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
                        { role: 'system', content: 'You are an auto spares assistant. Reply in Hinglish.' },
                        { role: 'user', content: message }
                    ],
                    max_tokens: 150,
                    temperature: 0.7
                })
            });
            const data = await response.json();
            if (data.choices?.[0]?.message?.content) {
                return data.choices[0].message.content;
            }
        } catch (error) {
            console.log('ChatGPT error:', error.message);
        }
    }
    return null;
}

// ============================================================
// 📤 WHATSAPP SEND
// ============================================================

async function sendWhatsAppMessage(to, message) {
    try {
        const normalizedPhone = to.replace(/\D/g, '');
        const url = `https://graph.facebook.com/v23.0/${CONFIG.phoneNumberId}/messages`;
        
        const response = await fetch(url, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${CONFIG.accessToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                messaging_product: "whatsapp",
                to: normalizedPhone,
                type: "text",
                text: { body: message }
            })
        });
        
        const result = await response.json();
        if (result.messages?.[0]?.id) {
            console.log(`✅ Message sent to ${normalizedPhone}`);
            return result;
        }
        console.log(`❌ WhatsApp error:`, JSON.stringify(result));
        return result;
    } catch (error) {
        console.log(`❌ Send error: ${error.message}`);
        throw error;
    }
}

// ============================================================
// 📄 ROUTES
// ============================================================

app.get("/health", (req, res) => {
    res.json({ 
        status: "ok", 
        timestamp: new Date().toISOString(),
        productsLoaded: allProducts.length
    });
});

app.get("/", (req, res) => {
    res.json({ 
        status: "ok", 
        version: "WORKING",
        message: "Assist WhatsApp Webhook is running"
    });
});

// ============================================================
// 📩 WEBHOOK VERIFICATION
// ============================================================

app.get("/webhook", (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    
    console.log(`🔐 Webhook Verification: mode=${mode}, token=${token}`);
    
    if (mode === "subscribe" && token === CONFIG.verifyToken) {
        console.log("✅ Webhook Verified!");
        return res.status(200).send(challenge);
    }
    
    console.log("❌ Verification Failed!");
    res.status(403).send("Verification failed");
});

// ============================================================
// 📩 RECEIVE MESSAGE - FIXED
// ============================================================

app.post("/webhook", async (req, res) => {
    console.log("📨 Incoming Webhook POST");
    
    try {
        // Check if body exists
        if (!req.body) {
            console.log("⚠️ Empty body");
            return res.sendStatus(200);
        }
        
        console.log(`📦 Body keys: ${Object.keys(req.body).join(', ')}`);
        
        // Check for entry
        if (!req.body.entry || !Array.isArray(req.body.entry) || req.body.entry.length === 0) {
            console.log("⚠️ No entry in webhook");
            console.log(`📦 Body:`, JSON.stringify(req.body).substring(0, 200));
            return res.sendStatus(200);
        }
        
        const entry = req.body.entry[0];
        if (!entry.changes || !Array.isArray(entry.changes) || entry.changes.length === 0) {
            console.log("⚠️ No changes in webhook");
            return res.sendStatus(200);
        }
        
        const change = entry.changes[0];
        if (!change.value) {
            console.log("⚠️ No value in webhook");
            return res.sendStatus(200);
        }
        
        // Check for messages
        const value = change.value;
        if (!value.messages || !Array.isArray(value.messages) || value.messages.length === 0) {
            console.log("📊 Status update - ignoring");
            return res.sendStatus(200);
        }
        
        // ✅ We have a valid message!
        const message = value.messages[0];
        const from = message.from;
        const type = message.type || 'text';
        const messageId = message.id;
        
        console.log(`📩 From: ${from} | Type: ${type} | ID: ${messageId}`);
        
        // Process asynchronously
        setImmediate(async () => {
            try {
                await handleMessage(message, from, type);
            } catch (error) {
                console.log(`❌ Async error: ${error.message}`);
            }
        });
        
        res.sendStatus(200);
        
    } catch (error) {
        console.log(`❌ Webhook error: ${error.message}`);
        console.log(`📦 Body:`, JSON.stringify(req.body || {}).substring(0, 300));
        res.sendStatus(200);
    }
});

// ============================================================
// 📩 MESSAGE HANDLER - WITH WELCOME MESSAGE
// ============================================================

async function handleMessage(message, from, type) {
    try {
        // Handle text messages
        if (type === 'text') {
            const text = message.text?.body || "";
            console.log(`💬 Message: "${text}"`);
            
            if (!text || text.trim() === '') {
                console.log('⚠️ Empty message');
                return;
            }
            
            const msgLower = text.toLowerCase().trim();
            
            // ============================================================
            // ✅ WELCOME MESSAGE - Full version
            // ============================================================
            if (msgLower === "hi" || msgLower === "hello" || msgLower === "help" || msgLower === "start" || msgLower === "menu") {
                const welcomeMessage = 
                    `👋 *Welcome to Auto Spares Solution!*\n\n` +
                    `🤖 I'm your AI Sales Assistant\n\n` +
                    `🔍 *Search Parts:*\n` +
                    `Send part number like "0108FAW00360N"\n` +
                    `Send description like "clutch plate"\n` +
                    `Send brand like "TVS" or "M&M"\n\n` +
                    `📦 *Multiple Products:*\n` +
                    `"0108FAW00360N 0108FAW00370N"\n` +
                    `"0108FAW00360N x2, 0108FAW00370N x3"\n\n` +
                    `📸 *Upload Photo:*\n` +
                    `Send photo of any part (add part number in caption)\n\n` +
                    `🎤 *Voice Message:*\n` +
                    `Send voice note with your query\n\n` +
                    `💰 *Check Price:*\n` +
                    `"Price 0108FAW00360N"\n\n` +
                    `📦 *Check Stock:*\n` +
                    `"Stock 0108FAW00360N"\n\n` +
                    `🛒 *Place Order:*\n` +
                    `"Order 0108FAW00360N"\n\n` +
                    `📞 *Call:* ${CONFIG.businessPhone}\n` +
                    `🛒 *Shop:* https://autosparessolution.com\n\n` +
                    `*How can I help you today?* 🚗`;
                
                await sendWhatsAppMessage(from, welcomeMessage);
                return;
            }
            
            // ============================================================
            // ✅ PRICE CHECK
            // ============================================================
            if (msgLower.includes('price') || msgLower.includes('cost') || msgLower.includes('rate')) {
                const partMatch = text.match(/([A-Z0-9]{5,})/i);
                if (partMatch) {
                    const partNumber = partMatch[1].toUpperCase();
                    const searchResults = searchProducts(partNumber);
                    if (searchResults.length > 0) {
                        const product = searchResults[0];
                        const prices = calculatePrices(product);
                        let reply = `💰 *Price: ${product.part}*\n\n`;
                        reply += `📝 ${product.description}\n`;
                        if (product.brand && product.brand !== 'Unknown') {
                            reply += `🏷️ Brand: ${product.brand}\n`;
                        }
                        if (prices.listValue > 0) {
                            reply += `💰 LIST PRICE: ₹${prices.listValue.toFixed(2)}\n`;
                        }
                        if (prices.mrp > 0) {
                            reply += `💰 MRP PRICE: ₹${prices.mrp.toFixed(2)}\n`;
                        }
                        if (prices.billingPrice > 0) {
                            reply += `💳 Billing Price: ₹${prices.billingPrice.toFixed(2)}\n`;
                            reply += `🧾 GST (${prices.gstRate}%): ₹${prices.gstAmount.toFixed(2)}\n`;
                            reply += `💳 *Total: ₹${prices.priceWithGST.toFixed(2)} (incl. GST)*\n`;
                        }
                        reply += `\n📦 Stock: ${product.stock > 0 ? `✅ ${product.stock} pcs` : '❌ Out of Stock'}`;
                        reply += `\n\n🛒 Order: https://autosparessolution.com`;
                        await sendWhatsAppMessage(from, reply);
                        return;
                    }
                }
            }
            
            // ============================================================
            // ✅ STOCK CHECK
            // ============================================================
            if (msgLower.includes('stock') || msgLower.includes('available')) {
                const partMatch = text.match(/([A-Z0-9]{5,})/i);
                if (partMatch) {
                    const partNumber = partMatch[1].toUpperCase();
                    const searchResults = searchProducts(partNumber);
                    if (searchResults.length > 0) {
                        const product = searchResults[0];
                        let reply = `📦 *Stock: ${product.part}*\n\n`;
                        reply += `📝 ${product.description}\n`;
                        reply += `📦 ${product.stock > 0 ? `✅ ${product.stock} pcs available` : '❌ Out of Stock'}`;
                        if (product.box_qty > 0) {
                            reply += ` | Box: ${product.box_qty}`;
                        }
                        if (product.carton > 0) {
                            reply += ` | Carton: ${product.carton}`;
                        }
                        reply += `\n\n🛒 Order: https://autosparessolution.com`;
                        await sendWhatsAppMessage(from, reply);
                        return;
                    }
                }
            }
            
            // ============================================================
            // ✅ ORDER COMMAND
            // ============================================================
            if (msgLower.includes('order') || msgLower.includes('buy') || msgLower.includes('purchase')) {
                const partMatch = text.match(/([A-Z0-9]{5,})/i);
                if (partMatch) {
                    const partNumber = partMatch[1].toUpperCase();
                    const searchResults = searchProducts(partNumber);
                    if (searchResults.length > 0) {
                        const product = searchResults[0];
                        const prices = calculatePrices(product);
                        let reply = `🛒 *Order: ${product.part}*\n\n`;
                        reply += `📝 ${product.description}\n`;
                        reply += `💰 ₹${prices.priceWithGST.toFixed(2)} (incl. GST)\n`;
                        reply += `📦 ${product.stock > 0 ? `✅ ${product.stock} pcs available` : '❌ Out of Stock'}\n\n`;
                        if (product.stock > 0) {
                            reply += `✅ *Confirm order?* Reply "Confirm Order"`;
                        } else {
                            reply += `🔔 *We'll notify you when back in stock!*`;
                        }
                        await sendWhatsAppMessage(from, reply);
                        return;
                    }
                }
            }
            
            // ============================================================
            // ✅ PART NUMBER SEARCH
            // ============================================================
            const partMatch = text.match(/([A-Z0-9]{5,})/i);
            if (partMatch) {
                const partNumber = partMatch[1].toUpperCase();
                console.log(`🔍 Searching for: "${partNumber}"`);
                
                // Check for quantity
                const qtyMatch = text.match(/(\d+)\s+([A-Z0-9]{5,})/i);
                
                if (qtyMatch) {
                    const reply = processOrder(text, from);
                    if (reply) {
                        await sendWhatsAppMessage(from, reply);
                        return;
                    }
                }
                
                const searchResults = searchProducts(partNumber);
                console.log(`📊 Found ${searchResults.length} results`);
                
                if (searchResults.length > 0) {
                    const reply = formatSearchResults(searchResults, partNumber);
                    await sendWhatsAppMessage(from, reply);
                    return;
                }
            }
            
            // ============================================================
            // ✅ AI FALLBACK
            // ============================================================
            const aiReply = await getAIResponse(text);
            if (aiReply) {
                await sendWhatsAppMessage(from, `🤖 ${aiReply}`);
                return;
            }
            
            // ============================================================
            // ✅ DEFAULT RESPONSE
            // ============================================================
            await sendWhatsAppMessage(from, 
                `🔍 I couldn't find "${text}"\n\n` +
                `💡 Try sending a part number like:\n` +
                `"0108FAW00360N"\n\n` +
                `💡 Or send "Help" for options\n\n` +
                `📞 Call: ${CONFIG.businessPhone}`
            );
            return;
        }
        
        // ============================================================
        // ✅ IMAGE HANDLING
        // ============================================================
        if (type === 'image') {
            await sendWhatsAppMessage(from, 
                `📸 *Photo Received!*\n\n` +
                `💡 Please send the part number directly.\n` +
                `📝 Example: "0108FAW00360N 2"\n\n` +
                `💡 Or send "Help" for options\n\n` +
                `📞 Call: ${CONFIG.businessPhone}`
            );
            return;
        }
        
        // ============================================================
        // ✅ AUDIO HANDLING
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
        // ✅ OTHER TYPES
        // ============================================================
        await sendWhatsAppMessage(from, 
            `📩 Received your ${type} message.\n\n` +
            `💡 Please send text with part numbers.\n` +
            `💡 Or send "Help" for options\n\n` +
            `📞 Call: ${CONFIG.businessPhone}`
        );
        
    } catch (error) {
        console.log(`❌ Message handler error: ${error.message}`);
        await sendWhatsAppMessage(from, "⚠️ Sorry, something went wrong. Please try again.");
    }
}

// ============================================================
// 🚀 START SERVER
// ============================================================

async function startServer() {
    console.log("====================================");
    console.log("🚀 ASSIST WhatsApp Started");
    console.log(`📞 Business Phone: ${CONFIG.businessPhone}`);
    console.log(`🧠 ChatGPT Key: ${CONFIG.chatgptKey ? '✅ Set' : '❌ Not set'}`);
    console.log(`🧠 DeepSeek Key: ${CONFIG.deepseekKey ? '✅ Set' : '❌ Not set'}`);
    console.log(`🧠 Gemini Key: ${CONFIG.geminiKey ? '✅ Set' : '❌ Not set'}`);
    console.log("====================================");
    
    // Load products
    const loaded = await loadProductsFromCSV();
    if (!loaded) {
        console.log("⚠️ No products loaded. Using fallback data.");
        allProducts = [
            { part: '0801BA0285N', description: 'CLUTCH DISC ASSEMBLY DIA 240 mm', brand: 'M&M', make: 'MARUTI', list_value: 2103.53, mrp: 2482.17, billing_price: 2103.53, stock: 19, box_qty: 1, carton: 12, gst: 18 },
            { part: '0303BC0071N', description: 'ELEMENT OIL FILTER', brand: 'M&M', make: 'MARUTI', list_value: 182.86, mrp: 215.77, billing_price: 182.86, stock: 462, box_qty: 10, carton: 100, gst: 18 }
        ];
        productMap.clear();
        allProducts.forEach(p => {
            productMap.set(p.part.toUpperCase(), p);
        });
        console.log(`✅ Loaded ${allProducts.length} fallback products`);
    }
    
    console.log(`📦 Product Map: ${allProducts.length} products loaded`);
    console.log("====================================");
    
    const PORT = process.env.PORT || 10000;
    app.listen(PORT, () => {
        console.log(`Server Running On Port ${PORT}`);
        console.log("====================================");
    });
}

startServer();
