// ============================================================
// 📱 ASSIST WhatsApp Webhook (Using Website's AI Logic)
// ============================================================

const express = require("express");
const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json());

// ===== CONFIGURATION =====
const CONFIG = {
    phoneNumberId: process.env.ID || "1158072170724432",
    accessToken: process.env.TOKEN || "EAAOS2aPmhzYBR5dGgAiTkz5nH5JOoheHnvI45lmOJiF3rnZA1cL6CR3POy3s6gI9mk1lxq3bjtOiBixhSvvFAxcbR6ut6kp2dZArnw3yk7r4TlqRpBbmMzV4YVAmVuFLZCTQ3bN7neJsZAiR6pNqZBmcQWP2341T59RvpG4hJnk4WfqIb5QLvZCYm40H17zXLNQQZDZD",
    verifyToken: process.env.VERIFY || "assist123",
    businessPhone: process.env.PHONE || "919330102828"
};

console.log("====================================");
console.log("🚀 ASSIST WhatsApp Started");
console.log("📞 Business Phone:", CONFIG.businessPhone);
console.log("====================================");

// ============================================================
// PRODUCT DATABASE (Same structure as website)
// ============================================================

let allProducts = [];

function loadProducts() {
    try {
        const csvPath = path.join(__dirname, 'prices.csv');
        
        if (fs.existsSync(csvPath)) {
            const csvData = fs.readFileSync(csvPath, 'utf8');
            const lines = csvData.split('\n');
            
            // Skip header row (same as website)
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
        { part: "A15979020-0200", desc: "M22X2.5X115 BOLT WITH M85900 NUT", price: 170.60, stock: 1800, brand: "TVS", gst: 18 },
        { part: "0603BA0291N", desc: "THAR - KIT BRAKE PAD", price: 4001.42, stock: 12, brand: "M&M", gst: 18 },
        { part: "0802CAA08871N", desc: "CONCENTRIC SLAVE CYLINDER", price: 2336.88, stock: 18, brand: "M&M", gst: 18 }
    ];
    console.log(`✅ Loaded ${allProducts.length} fallback products`);
}

// ============================================================
// AI FUNCTIONS (EXACTLY AS IN YOUR index.html)
// ============================================================

// ===== AI Search (IDENTICAL to your website) =====
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
    
    // Sort: exact part match first, then stock availability (matches website behavior)
    results.sort((a, b) => {
        const aExact = (a.part || '').toLowerCase() === q;
        const bExact = (b.part || '').toLowerCase() === q;
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;
        return (b.stock || 0) - (a.stock || 0);
    });
    
    return results.slice(0, 5);
}

// ===== AI Price with GST (IDENTICAL to your website) =====
function aiPriceWithGST(price, gst = 18) {
    return price + (price * gst / 100);
}

// ===== Gemini AI (IDENTICAL to your website) =====
async function aiGetGeminiReply(query) {
    const geminiKey = "AQ.Ab8RN6IQvM9VZYkn6_7mDEWir5IDPkLcHDfJcOGt5rsLheW_eg";
    
    if (!geminiKey) return null;
    
    try {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${geminiKey}`,
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
            const text = message.text?.body || "";

            console.log(`📩 From: ${from} | Text: ${text}`);

            // Process using website's logic
            const reply = await processMessage(text);
            
            console.log("🤖 Reply:", reply);
            await sendWhatsAppMessage(from, reply);
        }
    } catch (err) {
        console.error("❌ Error:", err);
    }

    res.sendStatus(200);
});

// ============================================================
// PROCESS MESSAGE (Using Website's Logic)
// ============================================================

async function processMessage(msg) {
    const originalMsg = msg;
    msg = msg.toLowerCase().trim();
    
    // Help commands (matches website's behavior)
    if (msg === "hi" || msg === "hello" || msg === "help" || msg === "start") {
        return `👋 Welcome to Auto Spares Solution!

🤖 I'm your AI Sales Assistant

🔍 Search Parts:
Send part number like "0801CAA00490N" or "0802CAA08871N"
Send description like "clutch plate" or " Brake Pad"
Send brand like "GIRLING" or "WABCO" or "TVS" or "M&M" or "STL" or "VF" or "MTBL" or "LMM"

💰 Check Price:
"Price 0802CAA08871N"

📦 Check Stock:
"Stock 0802CAA08871N"

🛒 Place Order:
"Order 0802CAA08871N"

📞 Call: ${CONFIG.businessPhone}
🛒 Shop: https://autosparessolution.com

How can I help you today? 🚗`;
    }
    
    // Price/Stock/Order commands
    if (msg.includes("price") || msg.includes("stock") || msg.includes("order")) {
        const words = originalMsg.split(' ');
        const possiblePart = words.find(w => w.match(/^[A-Z0-9]{5,12}$/i));
        
        if (possiblePart) {
            const results = aiSearch(possiblePart);
            if (results.length > 0) {
                const p = results[0];
                const priceGST = aiPriceWithGST(p.price, p.gst || 18);
                
                let reply = '';
                if (msg.includes("price")) {
                    reply = `💰 *Price: ${p.part}*\n\n`;
                    reply += `📝 ${p.desc || 'N/A'}\n`;
                    reply += `🏷️ Brand: ${p.brand || 'N/A'}\n`;
                    reply += `💳 Base Price: ₹${p.price || 0}\n`;
                    reply += `🧾 GST: ${p.gst || 18}%\n`;
                    reply += `💰 Total: ₹${priceGST.toFixed(2)} (incl. GST)\n\n`;
                    reply += `📦 Stock: ${p.stock > 0 ? `✅ ${p.stock} pcs` : '❌ Out of Stock'}\n\n`;
                    reply += `🛒 Order: https://autosparessolution.com`;
                } else if (msg.includes("stock")) {
                    reply = `📦 *Stock: ${p.part}*\n\n`;
                    reply += `📝 ${p.desc || 'N/A'}\n`;
                    reply += `📦 ${p.stock > 0 ? `✅ ${p.stock} pcs available` : '❌ Out of Stock'}\n`;
                    if (p.stock > 0) {
                        reply += `💰 ₹${priceGST.toFixed(2)} (incl. GST)\n\n`;
                        reply += `🛒 Order: https://autosparessolution.com`;
                    } else {
                        reply += `\n🔔 We'll notify you when back in stock!`;
                    }
                } else if (msg.includes("order")) {
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
        
        return `❌ No product found.\n\n💡 Try:\n"Price 0802CAA08871N"\n"Stock 0802CAA08871N"\n"Order 0802CAA08871N"\n\n📞 Call: ${CONFIG.businessPhone}`;
    }
    
    // Search products (same as website)
    const results = aiSearch(msg);
    
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
    
    // No results - try Gemini
    const geminiReply = await aiGetGeminiReply(originalMsg);
    if (geminiReply) {
        return `🔍 I couldn't find "${originalMsg}" in our inventory.\n\n${geminiReply}\n\n📞 Call: ${CONFIG.businessPhone}\n🛒 Shop: https://autosparessolution.github.io`;
    }
    
    // Final fallback
    return `🔍 I couldn't find "${originalMsg}" in our inventory.

💡 Try:
1️⃣ Part number like 0357 or 0802CAA08871N
2️⃣ Description like clutch plate
3️⃣ Brand name like TVS or M&M

📋 Quick Commands:
"Price 0802CAA08871N" → Check price
"Stock 0802CAA08871N" → Check availability
"Order 0802CAA08871N" → Place order

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
