// ============================================================
// 📱 ASSIST WhatsApp Webhook Server (Using Your AI Engine)
// ============================================================

const express = require("express");
const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");

const app = express();

app.use(express.json());

// ============================================================
// CONFIG
// ============================================================

const CONFIG = {
    phoneNumberId: process.env.ID || "1158072170724432",
    accessToken: process.env.TOKEN || "EAAOS2aPmhzYBR5dGgAiTkz5nH5JOoheHnvI45lmOJiF3rnZA1cL6CR3POy3s6gI9mk1lxq3bjtOiBixhSvvFAxcbR6ut6kp2dZArnw3yk7r4TlqRpBbmMzV4YVAmVuFLZCTQ3bN7neJsZAiR6pNqZBmcQWP2341T59RvpG4hJnk4WfqIb5QLvZCYm40H17zXLNQQZDZD",
    verifyToken: process.env.VERIFY || "assist123",
    businessPhone: process.env.PHONE || "919038899962",
    // ===== YOUR GEMINI API KEY (from index.html) =====
    geminiKey: process.env.GEMINI_KEY || "AQ.Ab8RN6IQvM9VZYkn6_7mDEWir5IDPkLcHDfJcOGt5rsLheW_eg"
};

console.log("====================================");
console.log("🚀 ASSIST WhatsApp Started");
console.log("Phone Number ID:", CONFIG.phoneNumberId);
console.log("Business Phone :", CONFIG.businessPhone);
console.log("Gemini Key    :", CONFIG.geminiKey ? "✅ Set" : "❌ Missing");
console.log("====================================");

// ============================================================
// PRODUCT DATABASE (Loaded from prices.csv)
// ============================================================

let productDatabase = [];
let productsLoaded = false;

function loadProducts() {
    try {
        const csvPath = path.join(__dirname, 'prices.csv');
        
        if (fs.existsSync(csvPath)) {
            const csvData = fs.readFileSync(csvPath, 'utf8');
            const lines = csvData.split('\n');
            const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
            
            productDatabase = [];
            for (let i = 1; i < lines.length; i++) {
                if (!lines[i].trim()) continue;
                const values = lines[i].split(',').map(v => v.trim());
                const product = {};
                headers.forEach((h, idx) => {
                    product[h] = values[idx] || '';
                });
                
                product.price = parseFloat(product.price) || 0;
                product.stock = parseInt(product.stock) || 0;
                product.gst = parseFloat(product.gst) || 18;
                
                productDatabase.push(product);
            }
            
            productsLoaded = true;
            console.log(`✅ Loaded ${productDatabase.length} products from prices.csv`);
        } else {
            console.log('⚠️ prices.csv not found. Using sample data.');
            loadSampleProducts();
        }
    } catch (error) {
        console.error('❌ Error loading products:', error);
        loadSampleProducts();
    }
}

function loadSampleProducts() {
    productDatabase = [
        { part: "0357", desc: "Clutch Plate Alto", price: 425, stock: 18, brand: "TVS", gst: 18 },
        { part: "0358", desc: "Brake Pad Swift", price: 550, stock: 12, brand: "TVS", gst: 18 },
        { part: "A40778820", desc: "Engine Mounting", price: 890, stock: 5, brand: "Mitsubishi", gst: 18 }
    ];
    productsLoaded = true;
    console.log(`✅ Loaded ${productDatabase.length} sample products`);
}

// ============================================================
// YOUR AI ENGINE FUNCTIONS (from index.html)
// ============================================================

// ===== AI Search (YOUR EXACT FUNCTION) =====
function aiSearch(query) {
    if (!query || !productDatabase.length) return [];
    
    const q = query.toLowerCase().trim();
    return productDatabase.filter(p => {
        const part = (p.part || '').toLowerCase();
        const desc = (p.desc || '').toLowerCase();
        const brand = (p.brand || '').toLowerCase();
        return part.includes(q) || desc.includes(q) || brand.includes(q);
    });
}

// ===== AI Price with GST (YOUR EXACT FUNCTION) =====
function aiPriceWithGST(price, gst = 18) {
    return price + (price * gst / 100);
}

// ===== GEMINI AI (YOUR EXACT FUNCTION from index.html) =====
async function aiGetGeminiReply(query) {
    if (!CONFIG.geminiKey || CONFIG.geminiKey === "YOUR_FREE_GEMINI_API_KEY") {
        return null;
    }

    try {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${CONFIG.geminiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: `You are an auto spares assistant for "Auto Spares Solution" in India.
                            Customer asks: "${query}"
                            
                            If they ask for a part:
                            - Suggest checking with part number
                            - Mention we have TVS, Mitsubishi, and other brands
                            
                            If they ask for help:
                            - Be friendly and helpful
                            - Reply in Hinglish (Hindi + English)
                            - Keep it short (2-3 sentences)
                            
                            If they ask about price or stock, ask for the part number.
                            
                            Reply in simple Hinglish.`
                        }]
                    }]
                })
            }
        );
        const data = await response.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || null;
    } catch (error) {
        console.error('Gemini error:', error);
        return null;
    }
}

// ============================================================
// HOME
// ============================================================

app.get("/", (req, res) => {
    res.json({
        status: "running",
        phone: CONFIG.businessPhone,
        phoneNumberId: CONFIG.phoneNumberId,
        productsLoaded: productsLoaded,
        productCount: productDatabase.length,
        gemini: CONFIG.geminiKey ? "✅ Configured" : "❌ Missing",
        time: new Date()
    });
});

// ============================================================
// WEBHOOK VERIFY
// ============================================================

app.get("/webhook", (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    console.log("Webhook Verification Request");

    if (mode === "subscribe" && token === CONFIG.verifyToken) {
        console.log("Webhook Verified");
        return res.status(200).send(challenge);
    }

    res.status(200).send("Webhook Active");
});

// ============================================================
// RECEIVE MESSAGE
// ============================================================

app.post("/webhook", async (req, res) => {
    console.log("====================================");
    console.log("Incoming Webhook");
    console.log(JSON.stringify(req.body, null, 2));

    try {
        if (
            req.body.entry &&
            req.body.entry[0].changes &&
            req.body.entry[0].changes[0].value.messages
        ) {
            const message = req.body.entry[0].changes[0].value.messages[0];
            const from = message.from;
            const text = message.text ? message.text.body : "";

            console.log("Message From :", from);
            console.log("Message Text :", text);

            // ===== AI ENGINE PROCESSES THE MESSAGE =====
            const reply = await processMessageWithAI(text);
            
            console.log("AI Reply:");
            console.log(reply);

            await sendWhatsAppMessage(from, reply);
        }
    } catch (err) {
        console.error(err);
    }

    res.sendStatus(200);
});

// ============================================================
// AI ENGINE - PROCESS MESSAGE (Using Your Functions)
// ============================================================

async function processMessageWithAI(msg) {
    msg = msg.toLowerCase().trim();
    
    // ===== HELP COMMANDS =====
    if (msg === "hi" || msg === "hello" || msg === "help" || msg === "start") {
        return `👋 Welcome to Auto Spares Solution!

🤖 I'm your AI Sales Assistant

🔍 Search Parts:
Send part number like "0357"
Send description like "clutch plate"
Send brand like "TVS"

💰 Check Price:
"Price 0357"

📦 Check Stock:
"Stock 0357"

🛒 Place Order:
"Order 0357"

📞 Call: ${CONFIG.businessPhone}
🛒 Shop: https://autosparessolution.github.io

How can I help you today? 🚗`;
    }
    
    // ===== PRICE / STOCK / ORDER COMMANDS =====
    if (msg.includes("price") || msg.includes("stock") || msg.includes("order")) {
        const words = msg.split(' ');
        const possiblePart = words.find(w => w.match(/^[A-Z0-9]{5,12}$/i));
        
        if (possiblePart) {
            // ===== USING YOUR aiSearch() FUNCTION =====
            const results = aiSearch(possiblePart);
            if (results.length > 0) {
                const p = results[0];
                // ===== USING YOUR aiPriceWithGST() FUNCTION =====
                const priceGST = aiPriceWithGST(p.price, p.gst || 18);
                
                let reply = '';
                
                if (msg.includes("price")) {
                    reply = `💰 *Price: ${p.part}*\n\n`;
                    reply += `📝 ${p.desc || 'N/A'}\n`;
                    reply += `🏷️ ${p.brand || 'N/A'}\n`;
                    reply += `💳 Base Price: ₹${p.price || 0}\n`;
                    reply += `🧾 GST: ${p.gst || 18}%\n`;
                    reply += `💰 Total: ₹${priceGST.toFixed(2)} (incl. GST)\n\n`;
                    reply += `📦 Stock: ${p.stock > 0 ? `✅ ${p.stock} pcs` : '❌ Out of Stock'}\n\n`;
                    reply += `🛒 Order: https://autosparessolution.github.io`;
                } else if (msg.includes("stock")) {
                    reply = `📦 *Stock: ${p.part}*\n\n`;
                    reply += `📝 ${p.desc || 'N/A'}\n`;
                    reply += `📦 ${p.stock > 0 ? `✅ ${p.stock} pcs available` : '❌ Out of Stock'}\n`;
                    if (p.stock > 0) {
                        reply += `💰 ₹${priceGST.toFixed(2)} (incl. GST)\n\n`;
                        reply += `🛒 Order: https://autosparessolution.github.io`;
                    } else {
                        reply += `\n🔔 We'll notify you when back in stock!`;
                    }
                } else if (msg.includes("order")) {
                    reply = `🛒 *Order: ${p.part}*\n\n`;
                    reply += `📝 ${p.desc || 'N/A'}\n`;
                    if (p.stock > 0) {
                        reply += `💰 ₹${priceGST.toFixed(2)} (incl. GST)\n`;
                        reply += `📦 ✅ ${p.stock} pcs available\n\n`;
                        reply += `✅ Confirm order: https://autosparessolution.github.io\n`;
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
        
        return `❌ No product found.

💡 Try:
"Price 0357"
"Stock 0357"
"Order 0357"

📞 Call: ${CONFIG.businessPhone}`;
    }
    
    // ===== SEARCH PRODUCTS (Using YOUR aiSearch) =====
    const results = aiSearch(msg);
    
    if (results.length > 0) {
        return formatProductReply(results);
    }
    
    // ===== NO RESULTS - USE GEMINI AI (YOUR FUNCTION) =====
    console.log("🤖 No product found. Using Gemini AI...");
    const geminiReply = await aiGetGeminiReply(msg);
    
    if (geminiReply) {
        return `🔍 I couldn't find "${msg}" in our inventory.

${geminiReply}

📞 Call: ${CONFIG.businessPhone}
🛒 Shop: https://autosparessolution.github.io`;
    }
    
    // ===== FALLBACK =====
    return `🔍 I couldn't find "${msg}" in our inventory.

💡 Try:
1️⃣ Part number like 0357
2️⃣ Description like clutch plate
3️⃣ Brand name like TVS

📋 Quick Commands:
"Price 0357" → Check price
"Stock 0357" → Check availability
"Order 0357" → Place order

📞 Call: ${CONFIG.businessPhone}
🛒 Shop: https://autosparessolution.github.io

We'll help you find the right part! 🚗`;
}

// ============================================================
// FORMAT PRODUCT REPLY (Using Your Functions)
// ============================================================

function formatProductReply(results) {
    if (results.length === 0) {
        return `🔍 No products found in our inventory.

📞 Call: ${CONFIG.businessPhone}`;
    }
    
    let reply = `🔍 Found ${results.length} result(s)\n\n`;
    
    results.forEach((p, index) => {
        // ===== USING YOUR aiPriceWithGST() FUNCTION =====
        const priceGST = aiPriceWithGST(p.price, p.gst || 18);
        const stockStatus = p.stock > 0 ? `✅ ${p.stock} pcs` : '❌ Out of Stock';
        const brand = p.brand || 'N/A';
        const desc = p.desc || 'N/A';
        
        reply += `${index + 1}. ${p.part}\n`;
        reply += `📝 ${desc}\n`;
        reply += `🏷️ ${brand}\n`;
        reply += `💰 ₹${priceGST.toFixed(2)} (incl. GST)\n`;
        reply += `📦 ${stockStatus}\n\n`;
    });
    
    reply += `🛒 Order: https://autosparessolution.github.io\n`;
    reply += `📞 Call: ${CONFIG.businessPhone}\n\n`;
    reply += `Quick Actions:\n`;
    reply += `- "Price ${results[0].part}" → Check price\n`;
    reply += `- "Stock ${results[0].part}" → Check availability\n`;
    reply += `- "Order ${results[0].part}" → Place order`;
    
    return reply;
}

// ============================================================
// SEND WHATSAPP MESSAGE
// ============================================================

async function sendWhatsAppMessage(to, message) {
    const url =
        `https://graph.facebook.com/v23.0/${CONFIG.phoneNumberId}/messages`;

    console.log("Sending Message...");

    const payload = {
        messaging_product: "whatsapp",
        to: to,
        type: "text",
        text: {
            body: message
        }
    };

    console.log("Payload:");
    console.log(JSON.stringify(payload, null, 2));

    try {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${CONFIG.accessToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        console.log("====================================");
        console.log("META RESPONSE");
        console.log(JSON.stringify(result, null, 2));
        console.log("====================================");

        if (!response.ok) {
            console.log("Meta returned an error.");
        } else {
            console.log("✅ Message Sent Successfully");
        }

        return result;
    } catch (err) {
        console.log(err);
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
