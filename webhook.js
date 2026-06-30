// ============================================================
// 📱 ASSIST WhatsApp Webhook Server (Fixed)
// ============================================================

const express = require('express');
const fetch = require('node-fetch');
const app = express();

app.use(express.json());

// ===== CONFIGURATION =====
const CONFIG = {
    phoneNumberId: process.env.ID || '1211088452085321',
    accessToken: process.env.TOKEN || 'EAAOS2aPmhzYBR9uZCQQhNguEMAVbbW5iwypMrh1ZA0DWjHqOhNMqKathKpWpD091OFxCQIOudVbZCSVgZCpX07nZC0z4mz1GdCG8GmXJIedgKyn4FXhW4eZBwjPzFhqM4M3EF8ayq3eQZBn0yXOs7pWUpZBJiDZBilu5BGXRi382aqTKClX2aOU8uGdcREV7ZAkgZDZD',
    verifyToken: process.env.VERIFY || 'assist123',
    businessPhone: process.env.PHONE || '919038899962'
};

console.log('📱 ASSIST WhatsApp Webhook Starting...');
console.log('📞 Business Phone:', CONFIG.businessPhone);
console.log('🆔 Phone ID:', CONFIG.phoneNumberId);
console.log('🔑 Verify Token:', CONFIG.verifyToken);

// ===== Health Check =====
app.get('/', (req, res) => {
    res.json({
        status: 'active',
        service: 'ASSIST WhatsApp Webhook',
        businessPhone: CONFIG.businessPhone,
        phoneNumberId: CONFIG.phoneNumberId,
        timestamp: new Date().toISOString()
    });
});

// ===== Webhook Verification (GET) =====
app.get('/webhook', (req, res) => {
    console.log('🔍 Webhook GET request received');
    console.log('📦 Query params:', req.query);
    
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    
    console.log(`Mode: ${mode}, Token: ${token}, Challenge: ${challenge}`);
    
    if (mode === 'subscribe' && token === CONFIG.verifyToken) {
        console.log('✅ Webhook verified successfully!');
        res.status(200).send(challenge);
    } else {
        console.log('❌ Webhook verification failed');
        console.log(`Expected token: ${CONFIG.verifyToken}, Received: ${token}`);
        res.sendStatus(403);
    }
});

// ===== Receive WhatsApp Messages (POST) =====
app.post('/webhook', (req, res) => {
    console.log('📩 Webhook POST received at:', new Date().toISOString());
    console.log('📦 Body:', JSON.stringify(req.body, null, 2));
    
    const body = req.body;
    
    if (body.entry && body.entry[0].changes && body.entry[0].changes[0].value.messages) {
        const message = body.entry[0].changes[0].value.messages[0];
        const from = message.from;
        const text = message.text ? message.text.body : 'No text';
        const timestamp = message.timestamp;
        
        console.log(`📩 WhatsApp from ${from}: "${text}" at ${new Date(timestamp * 1000).toISOString()}`);
        
        const reply = processWhatsAppMessage(text);
        console.log(`💬 Reply: "${reply.substring(0, 100)}..."`);
        
        sendWhatsAppMessage(from, reply).then(result => {
            console.log('✅ Reply sent to', from, 'Message ID:', result.messages?.[0]?.id);
        }).catch(error => {
            console.error('❌ Failed to send reply:', error);
        });
    } else {
        console.log('ℹ️ Not a WhatsApp message event');
    }
    
    res.sendStatus(200);
});

// ===== Process WhatsApp Message =====
function processWhatsAppMessage(message) {
    const query = message.toLowerCase().trim();
    console.log('🔍 Processing message:', query);
    
    if (query === 'help' || query === 'hi' || query === 'hello') {
        return `👋 *Welcome to Auto Spares Solution!*\n\n` +
               `🔍 Send part number like "0357"\n` +
               `💰 "Price 0357" - Check price\n` +
               `📦 "Stock 0357" - Check availability\n` +
               `🛒 "Order 0357" - Place order\n\n` +
               `📞 Call: ${CONFIG.businessPhone}`;
    }
    
    const results = aiSearch(query);
    console.log('📊 Search results:', results.length);
    
    if (results.length > 0) {
        let reply = `🔍 *Found ${results.length} result(s)*\n\n`;
        results.slice(0, 3).forEach((p, index) => {
            const priceGST = p.price * 1.18;
            reply += `*${index + 1}. ${p.part}*\n`;
            reply += `📝 ${p.desc || 'N/A'}\n`;
            reply += `💰 ₹${priceGST.toFixed(2)} (incl. GST)\n`;
            reply += `📦 ${p.stock > 0 ? `✅ ${p.stock} pcs` : '❌ Out of Stock'}\n\n`;
        });
        reply += `🛒 *Order:* https://autosparessolution.github.io\n`;
        reply += `📞 *Call:* ${CONFIG.businessPhone}`;
        return reply;
    }
    
    return `🔍 *I couldn't find "${message}" in our inventory.*\n\n` +
           `💡 Send a part number like *0357*\n` +
           `📞 *Call:* ${CONFIG.businessPhone}`;
}

// ===== AI Search =====
function aiSearch(query) {
    const products = [
        { part: '0357', desc: 'Clutch Plate Alto', price: 425, stock: 18 },
        { part: '0358', desc: 'Brake Pad Swift', price: 550, stock: 12 },
        { part: 'A40778820', desc: 'Engine Mounting', price: 890, stock: 5 }
    ];
    
    const q = query.toLowerCase();
    return products.filter(p => {
        const part = p.part.toLowerCase();
        const desc = p.desc.toLowerCase();
        return part.includes(q) || desc.includes(q);
    });
}

// ===== Send WhatsApp Message =====
async function sendWhatsAppMessage(to, message) {
    const url = `https://graph.facebook.com/v18.0/${CONFIG.phoneNumberId}/messages`;
    console.log('📤 Sending to:', to);
    
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${CONFIG.accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                messaging_product: 'whatsapp',
                to: to,
                type: 'text',
                text: { body: message }
            })
        });
        const result = await response.json();
        console.log('📤 Response:', JSON.stringify(result, null, 2));
        return result;
    } catch (error) {
        console.error('❌ Send error:', error);
        throw error;
    }
}

// ===== Start Server =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 ASSIST WhatsApp Webhook running on port ${PORT}`);
    console.log(`📱 Webhook URL: https://assist-whatsapp-webhook.onrender.com/webhook`);
});
