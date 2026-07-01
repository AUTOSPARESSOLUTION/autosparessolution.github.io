// ============================================================
// 📱 ASSIST WhatsApp Webhook Server (Fixed Forbidden)
// ============================================================

const express = require('express');
const fetch = require('node-fetch');
const app = express();

// ===== Middleware =====
app.use(express.json());

// ===== CONFIGURATION =====
const CONFIG = {
    phoneNumberId: process.env.ID || '1158072170724432',
    accessToken: process.env.TOKEN || 'EAAOS2aPmhzYBRyydYO5ALkt4tVZCKtIk1XSg0RYs2wIv6E1HiNEZA8lFzsXYznt7wgs5rRtvFZAVRiD0g0CUJqGAXOwvAZCOcSWbWYs65TRQ73pI51zEP9kXTZCBqpPQUq0k9Fv2PtEhQqdwZBIozEZCPalwBrPHMTZBkietBFsx1QnobOC3NZCN4IfOrfkNDlAZDZD',
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
    
    // Always respond with 200 OK for any GET request to /webhook
    // This prevents "Forbidden" errors
    if (mode === 'subscribe' && token === CONFIG.verifyToken) {
        console.log('✅ Webhook verified successfully!');
        res.status(200).send(challenge);
    } else {
        // If no verification params, just show a friendly message
        res.status(200).send('Webhook endpoint is active. Waiting for Meta verification...');
    }
});

// ===== Receive WhatsApp Messages (POST) =====
app.post('/webhook', (req, res) => {
    console.log('📩 Webhook POST received at:', new Date().toISOString());
    
    const body = req.body;
    console.log('📦 Body:', JSON.stringify(body, null, 2));
    
    if (body.entry && body.entry[0].changes && body.entry[0].changes[0].value.messages) {
        const message = body.entry[0].changes[0].value.messages[0];
        const from = message.from;
        const text = message.text ? message.text.body : 'No text';
        
        console.log(`📩 WhatsApp from ${from}: "${text}"`);
        
        const reply = processWhatsAppMessage(text);
        console.log(`💬 Reply: "${reply.substring(0, 100)}..."`);
        
        sendWhatsAppMessage(from, reply).then(result => {
            console.log('✅ Reply sent to', from);
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
    
    if (query === 'help' || query === 'hi' || query === 'hello') {
        return `👋 *Welcome to Auto Spares Solution!*\n\n` +
               `🔍 Send part number like "0357"\n` +
               `💰 "Price 0357" - Check price\n` +
               `📦 "Stock 0357" - Check availability\n` +
               `🛒 "Order 0357" - Place order\n\n` +
               `📞 Call: ${CONFIG.businessPhone}`;
    }
    
    const results = aiSearch(query);
    
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
        return await response.json();
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
