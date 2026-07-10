// ============================================================
// 📤 WHATSAPP MODULE - Send and Receive Messages
// ============================================================

const fetch = require('node-fetch');
const db = require('./database');

// ============================================================
// 📤 SEND WHATSAPP MESSAGE
// ============================================================

async function sendWhatsAppMessage(to, message) {
    try {
        const normalizedPhone = to.replace(/\D/g, '');
        const url = `https://graph.facebook.com/v23.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
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
        console.error(`❌ WhatsApp error:`, result);
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
                    `📞 *Call:* ${process.env.BUSINESS_PHONE || '9830300193'}\n` +
                    `🛒 *Shop:* https://autosparessolution.com\n\n` +
                    `*How can I help you today?* 🚗`;
                
                await sendWhatsAppMessage(from, welcome);
                return;
            }
            
            // ============================================================
            // PRICE CHECK
            // ============================================================
            if (msgLower.includes('price') || msgLower.includes('cost') || msgLower.includes('rate')) {
                const partMatch = text.match(/([A-Z0-9]{5,})/i);
                if (partMatch) {
                    const product = await db.getProduct(partMatch[1]);
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
                        
                        await sendWhatsAppMessage(from, reply);
                        return;
                    }
                }
            }
            
            // ============================================================
            // STOCK CHECK
            // ============================================================
            if (msgLower.includes('stock') || msgLower.includes('available')) {
                const partMatch = text.match(/([A-Z0-9]{5,})/i);
                if (partMatch) {
                    const product = await db.getProduct(partMatch[1]);
                    if (product) {
                        let reply = `📦 *Stock: ${product.part}*\n\n`;
                        reply += `📝 ${product.description}\n`;
                        reply += `📦 ${product.stock > 0 ? `✅ ${product.stock} pcs available` : '
