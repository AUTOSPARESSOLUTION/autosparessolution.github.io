// ============================================================
// 📱 ASSIST WhatsApp Webhook Server (AI Assistant Version)
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
    businessPhone: process.env.PHONE || "919038899962"
};

console.log("====================================");
console.log("🚀 ASSIST WhatsApp Started");
console.log("Phone Number ID:", CONFIG.phoneNumberId);
console.log("Business Phone :", CONFIG.businessPhone);
console.log("====================================");

// ============================================================
// PRODUCT DATABASE (Loaded from prices.csv)
// ============================================================

let productDatabase = [];
let productsLoaded = false;

// ===== Load products from prices.csv =====
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

// ===== Sample products (fallback - your existing data) =====
function loadSampleProducts() {
    productDatabase = [
        {
            part: "0357",
            desc: "Clutch Plate Alto",
            price: 425,
            stock: 18,
            brand: "TVS",
            gst: 18
        },
        {
            part: "0358",
            desc: "Brake Pad Swift",
            price: 550,
            stock: 12,
            brand: "TVS",
            gst: 18
        },
        {
            part: "A40778820",
            desc: "Engine Mounting",
            price: 890,
            stock: 5,
            brand: "Mitsubishi",
            gst: 18
        }
    ];
    productsLoaded = true;
    console.log(`✅ Loaded ${productDatabase.length} sample products`);
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

            // ===== AI Assistant Processes the Message =====
            const reply = processMessageWithAI(text);
            
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
// AI ASSISTANT - PROCESS MESSAGE (Full CSV Integration)
// ============================================================

function processMessageWithAI(msg) {
    msg = msg.toLowerCase().trim();
    
    // ===== HELP COMMANDS (Preserved) =====
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
        const possiblePart = words.find(w => w.match(/^[A-Z0-9]{5,10}$/i));
        
        if (possiblePart) {
            const results = searchProducts(possiblePart);
            if (results.length > 0) {
                const p = results[0];
                const priceGST = getPriceWithGST(p.price, p.gst || 18);
                
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
    
    // ===== SEARCH PRODUCTS (AI Brain) =====
    const results = searchProducts(msg);
    
    if (results.length > 0) {
        return formatProductReply(results);
    }
    
    // ===== NO RESULTS FOUND =====
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
// AI BRAIN - SEARCH PRODUCTS
// ============================================================

function searchProducts(query) {
    if (!query || !productDatabase.length) return [];
    
    const q = query.toLowerCase().trim();
    const results = productDatabase.filter(p => {
        const part = (p.part || '').toLowerCase();
        const desc = (p.desc || '').toLowerCase();
        const brand = (p.brand || '').toLowerCase();
        const make = (p.make || '').toLowerCase();
        const model = (p.model || '').toLowerCase();
        
        return part.includes(q) || desc.includes(q) || brand.includes(q) || 
               make.includes(q) || model.includes(q);
    });
    
    // Sort: exact part match first, then stock availability
    results.sort((a, b) => {
        const aExact = (a.part || '').toLowerCase() === q;
        const bExact = (b.part || '').toLowerCase() === q;
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;
        return (b.stock || 0) - (a.stock || 0);
    });
    
    return results.slice(0, 5);
}

// ============================================================
// AI BRAIN - FORMAT PRODUCT REPLY
// ============================================================

function formatProductReply(results) {
    if (results.length === 0) {
        return `🔍 No products found in our inventory.

📞 Call: ${CONFIG.businessPhone}`;
    }
    
    let reply = `🔍 Found ${results.length} result(s)\n\n`;
    
    results.forEach((p, index) => {
        const priceGST = getPriceWithGST(p.price, p.gst || 18);
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
// AI BRAIN - GET PRICE WITH GST
// ============================================================

function getPriceWithGST(price, gst = 18) {
    return price + (price * gst / 100);
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

// Load products before starting
loadProducts();

const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
    console.log("====================================");
    console.log("Server Running On Port", PORT);
    console.log("====================================");
});
