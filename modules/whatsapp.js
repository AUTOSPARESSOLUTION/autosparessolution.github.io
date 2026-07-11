// ============================================================
// 📤 WHATSAPP MODULE - FIXED WITH CART SAVE
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
// 📩 HANDLE WHATSAPP MESSAGE - FIXED
// ============================================================

async function handleWhatsAppMessage(message, from, type) {
    try {
        if (type === 'text') {
            const text = message.text?.body || '';
            console.log(`💬 Message: "${text}"`);
            
            // ✅ DEBUG: Check database stats
            const stats = await db.getStats();
            console.log(`📊 Database has ${stats.total_products || 0} products`);
            
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
                    console.log(`🔍 Looking up price for: ${partMatch[1]}`);
                    const product = await db.getProduct(partMatch[1]);
                    if (product) {
                        console.log(`✅ Found product: ${product.part}`);
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
                    } else {
                        console.log(`❌ No product found for: ${partMatch[1]}`);
                    }
                }
            }
            
            // ============================================================
            // STOCK CHECK
            // ============================================================
            if (msgLower.includes('stock') || msgLower.includes('available')) {
                const partMatch = text.match(/([A-Z0-9]{5,})/i);
                if (partMatch) {
                    console.log(`🔍 Looking up stock for: ${partMatch[1]}`);
                    const product = await db.getProduct(partMatch[1]);
                    if (product) {
                        console.log(`✅ Found product: ${product.part}`);
                        let reply = `📦 *Stock: ${product.part}*\n\n`;
                        reply += `📝 ${product.description}\n`;
                        reply += `📦 ${product.stock > 0 ? `✅ ${product.stock} pcs available` : '❌ Out of Stock'}`;
                        if (product.box_qty > 0) reply += ` | Box: ${product.box_qty}`;
                        if (product.carton > 0) reply += ` | Carton: ${product.carton}`;
                        await sendWhatsAppMessage(from, reply);
                        return;
                    } else {
                        console.log(`❌ No product found for: ${partMatch[1]}`);
                    }
                }
            }
            
            // ============================================================
            // 🛒 FIXED: ORDER COMMAND - SAVE TO CART
            // ============================================================
            if (msgLower.includes('order') || msgLower.includes('buy')) {
                const partMatch = text.match(/(\d+)?\s*([A-Z0-9]{5,})/i);
                if (partMatch) {
                    const qty = parseInt(partMatch[1]) || 1;
                    const partNumber = partMatch[2].toUpperCase();
                    console.log(`🛒 Order: ${qty} x ${partNumber}`);
                    
                    const product = await db.getProduct(partNumber);
                    if (product) {
                        console.log(`✅ Found product: ${product.part}`);
                        const billingPrice = product.billing_price || product.list_price || 0;
                        const priceWithGST = billingPrice * 1.18;
                        const total = priceWithGST * qty;
                        
                        // ✅ FIX: Save to cart BEFORE asking for confirmation
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
                        console.log(`✅ Cart saved for ${from}: ${qty} x ${product.part} = ₹${total.toFixed(2)}`);
                        
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
                    } else {
                        console.log(`❌ No product found for: ${partNumber}`);
                        await sendWhatsAppMessage(from, `❌ Product "${partNumber}" not found. Please check the part number.`);
                        return;
                    }
                }
            }
            
            // ============================================================
            // CONFIRM ORDER
            // ============================================================
            if (msgLower === 'confirm order' || msgLower === 'confirm') {
                console.log(`📋 Confirming order for ${from}`);
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
                    reply += `📞 *Call:* ${process.env.BUSINESS_PHONE || '9830300193'}\n`;
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
            // SEARCH PRODUCTS - WITH DEBUG LOGGING
            // ============================================================
            console.log(`🔍 Searching for: "${text}"`);
            const results = await db.searchProducts(text, 5);
            console.log(`📊 Found ${results.length} results`);
            
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
                reply += `📞 Call: ${process.env.BUSINESS_PHONE || '9830300193'}`;
                
                await sendWhatsAppMessage(from, reply);
            } else {
                await sendWhatsAppMessage(from, 
                    `🔍 No results found for "${text}"\n\n` +
                    `💡 Try sending a part number like:\n` +
                    `"0801BA0285N"\n\n` +
                    `💡 Or send "Help" for options\n\n` +
                    `📞 Call: ${process.env.BUSINESS_PHONE || '9830300193'}`
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
                `📞 Call: ${process.env.BUSINESS_PHONE || '9830300193'}`
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
                `📞 Call: ${process.env.BUSINESS_PHONE || '9830300193'}`
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
            `📞 Call: ${process.env.BUSINESS_PHONE || '9830300193'}`
        );
        
    } catch (error) {
        console.error(`❌ Message handler error: ${error.message}`);
        console.error(error.stack);
        await sendWhatsAppMessage(from, '⚠️ Sorry, something went wrong. Please try again.');
    }
}

module.exports = {
    sendWhatsAppMessage,
    handleWhatsAppMessage,
    formatProductForWhatsApp
};
