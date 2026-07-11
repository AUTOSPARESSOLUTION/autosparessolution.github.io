// ============================================================
// 📤 WHATSAPP MODULE - COMPLETE FIXED
// Supports multi-line orders, multiple products
// ============================================================

const fetch = require('node-fetch');
const db = require('./database');
const { parseOrder } = require('./order-parser');

// ============================================================
// 🔧 CONFIG - Using your exact Render variable names
// ============================================================

const CONFIG = {
    phoneNumberId: process.env.ID,
    accessToken: process.env.TOKEN,
    businessPhone: process.env.PHONE || '9830300193',
};

// ============================================================
// 📤 SEND WHATSAPP MESSAGE
// ============================================================

async function sendWhatsAppMessage(to, message) {
    try {
        const normalizedPhone = to.replace(/\D/g, '');
        const url = `https://graph.facebook.com/v23.0/${CONFIG.phoneNumberId}/messages`;
        
        console.log(`📤 Sending to: ${normalizedPhone}`);
        
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
    const gstRate = product.gst || 18;
    const gstAmount = billingPrice * (gstRate / 100);
    const priceWithGST = billingPrice + gstAmount;
    
    let reply = `${index + 1}. *${product.part}*\n`;
    reply += `📝 ${product.description || 'N/A'}\n`;
    
    if (product.brand && product.brand !== 'Unknown') {
        reply += `🏷️ Brand: ${product.brand}`;
        if (product.model) {
            reply += `\n🚗 Model: ${product.model}`;
        }
        reply += `\n`;
    } else if (product.model) {
        reply += `🚗 Model: ${product.model}\n`;
    }
    
    if (product.list_price > 0) {
        reply += `💰 LIST PRICE: ₹${product.list_price.toFixed(2)}\n`;
    }
    if (product.mrp > 0 && product.mrp !== product.list_price) {
        reply += `💰 MRP PRICE: ₹${product.mrp.toFixed(2)}\n`;
    } else if (product.mrp > 0) {
        reply += `💰 MRP PRICE: ₹${product.mrp.toFixed(2)}\n`;
    }
    if (billingPrice > 0) {
        reply += `💳 Billing Price: ₹${billingPrice.toFixed(2)}\n`;
        reply += `🧾 GST (${gstRate}%): ₹${gstAmount.toFixed(2)}\n`;
        reply += `💳 Price incl. GST: ₹${priceWithGST.toFixed(2)}\n`;
    }
    
    if (product.stock > 0) {
        reply += `📦 ✅ ${product.stock} pcs`;
        if (product.box_qty > 0) {
            reply += ` | Box: ${product.box_qty}`;
        }
        if (product.carton > 0) {
            reply += ` | Carton: ${product.carton}`;
        }
        reply += `\n`;
    } else {
        reply += `📦 ❌ Out of Stock\n`;
    }
    
    if (product.hsn) {
        reply += `📋 HSN: ${product.hsn}\n`;
    }
    
    return reply;
}

// ============================================================
// 📩 HANDLE WHATSAPP MESSAGE - FIXED FOR MULTI-LINE
// ============================================================

async function handleWhatsAppMessage(message, from, type) {
    try {
        if (type === 'text') {
            const text = message.text?.body || '';
            
            console.log("==================================");
            console.log("FROM :", from);
            console.log("TEXT :", text);
            console.log("==================================");
            
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
                    `Send part number like "0603BAA0005KT"\n` +
                    `Send description like "brake pad"\n` +
                    `Send brand like "M&M"\n\n` +
                    `📦 *Multiple Products:*\n` +
                    `"0802CAA08871N 2\n0801BA0285N 2"\n\n` +
                    `💰 *Check Price:*\n` +
                    `"Price 0603BAA0005KT"\n\n` +
                    `📦 *Check Stock:*\n` +
                    `"Stock 0603BAA0005KT"\n\n` +
                    `🛒 *Place Order:*\n` +
                    `"Order 0603BAA0005KT 2"\n\n` +
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
                const partMatch = text.toUpperCase().match(/[A-Z0-9]{3,20}/);
                if (partMatch) {
                    const partNumber = partMatch[0];
                    console.log(`🔍 Price check for: ${partNumber}`);
                    const product = await db.getProduct(partNumber);
                    if (product) {
                        const billingPrice = product.billing_price || product.list_price || 0;
                        const gstRate = product.gst || 18;
                        const gstAmount = billingPrice * (gstRate / 100);
                        const priceWithGST = billingPrice + gstAmount;
                        
                        let reply = `💰 *Price: ${product.part}*\n\n`;
                        reply += `📝 ${product.description}\n`;
                        if (product.brand) reply += `🏷️ Brand: ${product.brand}\n`;
                        if (product.list_price > 0) reply += `💰 LIST PRICE: ₹${product.list_price.toFixed(2)}\n`;
                        if (product.mrp > 0) reply += `💰 MRP PRICE: ₹${product.mrp.toFixed(2)}\n`;
                        reply += `💳 Billing Price: ₹${billingPrice.toFixed(2)}\n`;
                        reply += `🧾 GST (${gstRate}%): ₹${gstAmount.toFixed(2)}\n`;
                        reply += `💳 *Total: ₹${priceWithGST.toFixed(2)} (incl. GST)*\n\n`;
                        reply += `📦 Stock: ${product.stock > 0 ? `✅ ${product.stock} pcs` : '❌ Out of Stock'}`;
                        
                        await sendWhatsAppMessage(from, reply);
                        return;
                    }
                }
            }
            
            // ============================================================
            // STOCK CHECK
            // ============================================================
            if (msgLower.includes('stock') || msgLower.includes('available')) {
                const partMatch = text.toUpperCase().match(/[A-Z0-9]{3,20}/);
                if (partMatch) {
                    const partNumber = partMatch[0];
                    console.log(`🔍 Stock check for: ${partNumber}`);
                    const product = await db.getProduct(partNumber);
                    if (product) {
                        let reply = `📦 *Stock: ${product.part}*\n\n`;
                        reply += `📝 ${product.description}\n`;
                        reply += `📦 ${product.stock > 0 ? `✅ ${product.stock} pcs available` : '❌ Out of Stock'}`;
                        await sendWhatsAppMessage(from, reply);
                        return;
                    }
                }
            }
            
            // ============================================================
            // ✅ FIX: CHECK FOR MULTI-LINE OR MULTIPLE PRODUCTS FIRST
            // ============================================================
            
            // Check if text contains multiple lines or multiple part numbers
            const lines = text.split('\n').filter(line => line.trim().length > 0);
            const hasMultipleLines = lines.length > 1;
            
            // Extract all potential part numbers
            const potentialParts = text.match(/[A-Z0-9]{3,20}/g);
            const hasMultipleParts = potentialParts && potentialParts.length > 1;
            
            // If multiple lines OR multiple part numbers, treat as order
            if (hasMultipleLines || hasMultipleParts) {
                console.log(`🛒 Detected multiple products: ${potentialParts?.length || 0} parts, ${lines.length} lines`);
                
                // Parse the order
                const { items, unparsed } = parseOrder(text);
                console.log(`📦 Parsed ${items.length} items from order`);
                
                if (items.length > 0) {
                    let cartItems = [];
                    let total = 0;
                    let notFound = [];
                    let outOfStock = [];
                    
                    for (const item of items) {
                        const product = await db.getProduct(item.part);
                        if (product) {
                            console.log(`✅ Found: ${product.part}`);
                            const billingPrice = product.billing_price || product.list_price || 0;
                            const gstRate = product.gst || 18;
                            const gstAmount = billingPrice * (gstRate / 100);
                            const priceWithGST = billingPrice + gstAmount;
                            const itemTotal = priceWithGST * item.qty;
                            
                            cartItems.push({
                                part: product.part,
                                description: product.description,
                                qty: item.qty,
                                price: priceWithGST,
                                list_price: product.list_price,
                                mrp: product.mrp,
                                billing_price: billingPrice
                            });
                            
                            total += itemTotal;
                            
                            if (product.stock === 0) {
                                outOfStock.push(product.part);
                            }
                        } else {
                            console.log(`❌ Not found: ${item.part}`);
                            notFound.push(item.part);
                        }
                    }
                    
                    if (notFound.length > 0) {
                        await sendWhatsAppMessage(from, 
                            `❌ Products not found: ${notFound.join(', ')}\n\n` +
                            `💡 Please check the part numbers and try again.`
                        );
                        return;
                    }
                    
                    if (cartItems.length === 0) {
                        await sendWhatsAppMessage(from, 
                            `❌ No valid products found in your order. Please check the part numbers.`
                        );
                        return;
                    }
                    
                    // Save cart
                    await db.saveCart(from, cartItems, total, total);
                    console.log(`✅ Cart saved: ${cartItems.length} items, total: ₹${total.toFixed(2)}`);
                    
                    // Build response
                    let reply = `🛒 *ORDER SUMMARY*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
                    
                    for (const item of cartItems) {
                        const itemTotal = item.price * item.qty;
                        reply += `*${item.part}* x${item.qty}\n`;
                        reply += `📝 ${item.description}\n`;
                        if (item.list_price > 0) reply += `💰 LIST: ₹${item.list_price.toFixed(2)}\n`;
                        if (item.mrp > 0) reply += `💰 MRP: ₹${item.mrp.toFixed(2)}\n`;
                        reply += `💳 ₹${item.price.toFixed(2)} × ${item.qty} = ₹${itemTotal.toFixed(2)}\n\n`;
                    }
                    
                    reply += `━━━━━━━━━━━━━━━━━━━━\n`;
                    reply += `💰 *Total: ₹${total.toFixed(2)}* (incl. GST)\n`;
                    reply += `━━━━━━━━━━━━━━━━━━━━\n\n`;
                    
                    if (outOfStock.length > 0) {
                        reply += `⚠️ Out of Stock: ${outOfStock.join(', ')}\n`;
                        reply += `🔔 We'll notify you when available.\n\n`;
                    }
                    
                    reply += `✅ *Confirm order?* Reply "Confirm Order"\n`;
                    reply += `🗑️ *Clear Cart* - Start fresh\n\n`;
                    reply += `📞 Call: ${CONFIG.businessPhone}`;
                    
                    await sendWhatsAppMessage(from, reply);
                    return;
                }
            }
            
            // ============================================================
            // SINGLE PRODUCT SEARCH (if not multi-line)
            // ============================================================
            
            // Search for single product
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
