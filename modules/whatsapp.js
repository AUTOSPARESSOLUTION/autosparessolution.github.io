// ============================================================
// 📤 WHATSAPP MODULE - COMPLETE FIXED
// Supports: Multi-product, Single product, Stock, Price, Quotes
// ============================================================

const fetch = require('node-fetch');
const db = require('./database');
const { parseOrder, extractPartNumber, extractQuantity } = require('./order-parser');

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
// 🔧 CLEAN TEXT - Remove quotes, extra spaces
// ============================================================

function cleanText(text) {
    if (!text) return '';
    return text
        .replace(/^["']|["']$/g, '')
        .replace(/["']/g, '')
        .replace(/\s+/g, ' ')
        .trim();
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
    
    // Stock & Packaging
    let stockInfo = [];
    if (product.stock > 0) {
        stockInfo.push(`✅ ${product.stock} pcs`);
        if (product.most_selling) {
            stockInfo.push(`⭐ Best Seller`);
        }
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
// 📩 HANDLE WHATSAPP MESSAGE - COMPLETE FIXED
// ============================================================

async function handleWhatsAppMessage(message, from, type) {
    try {
        if (type !== 'text') {
            await sendWhatsAppMessage(from, 
                `📩 Received your ${type} message.\n\n` +
                `💡 Please send text with part numbers.\n` +
                `📞 Call: ${CONFIG.businessPhone}`
            );
            return;
        }
        
        const text = message.text?.body || '';
        console.log(`💬 Message: "${text}"`);
        
        // Clean the text
        const cleaned = cleanText(text);
        console.log(`📝 Cleaned: "${cleaned}"`);
        
        const stats = await db.getStats();
        console.log(`📊 Database has ${stats.total_products || 0} products`);
        
        const msgLower = cleaned.toLowerCase().trim();
        
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
                `📦 *Multiple Products:*\n` +
                `"0802CAA08871N 2\n0801BA0285N 2"\n` +
                `"0801BA0285N 2, 0303BC0071N 3"\n\n` +
                `💰 *Check Price:*\n` +
                `"Price 0801BA0285N"\n\n` +
                `📦 *Check Stock:*\n` +
                `"Stock 0303BC0071N"\n\n` +
                `🛒 *Place Order:*\n` +
                `"Order 0801BA0285N 2"\n\n` +
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
            const partNumber = extractPartNumber(cleaned);
            console.log(`🔍 Price check for: ${partNumber}`);
            
            if (partNumber) {
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
                    if (product.box_qty > 0) reply += ` | Box: ${product.box_qty}`;
                    if (product.carton > 0) reply += ` | Carton: ${product.carton}`;
                    
                    await sendWhatsAppMessage(from, reply);
                    return;
                } else {
                    await sendWhatsAppMessage(from, `❌ Product "${partNumber}" not found. Please check the part number.`);
                    return;
                }
            }
        }
        
        // ============================================================
        // STOCK CHECK
        // ============================================================
        if (msgLower.includes('stock') || msgLower.includes('available')) {
            const partNumber = extractPartNumber(cleaned);
            console.log(`🔍 Stock check for: ${partNumber}`);
            
            if (partNumber) {
                const product = await db.getProduct(partNumber);
                if (product) {
                    let reply = `📦 *Stock: ${product.part}*\n\n`;
                    reply += `📝 ${product.description}\n`;
                    reply += `📦 ${product.stock > 0 ? `✅ ${product.stock} pcs available` : '❌ Out of Stock'}`;
                    if (product.box_qty > 0) reply += ` | Box: ${product.box_qty}`;
                    if (product.carton > 0) reply += ` | Carton: ${product.carton}`;
                    if (product.most_selling) reply += `\n⭐ Best Seller`;
                    await sendWhatsAppMessage(from, reply);
                    return;
                } else {
                    await sendWhatsAppMessage(from, `❌ Product "${partNumber}" not found. Please check the part number.`);
                    return;
                }
            }
        }
        
        // ============================================================
        // ✅ FIX: MULTI-PRODUCT ORDER DETECTION
        // ============================================================
        
        // Count how many part numbers are in the message
        const allParts = text.match(/\b[A-Z0-9]{5,20}\b/gi);
        const uniqueParts = allParts ? [...new Set(allParts.map(p => p.toUpperCase()))] : [];
        const hasMultipleProducts = uniqueParts.length > 1;
        const hasNewLines = text.includes('\n');
        const hasCommas = text.includes(',');
        const hasSemicolons = text.includes(';');
        
        console.log(`🔍 Found ${uniqueParts.length} part numbers:`, uniqueParts);
        console.log(`📊 Has multiple products: ${hasMultipleProducts}`);
        console.log(`📊 Has new lines: ${hasNewLines}`);
        console.log(`📊 Has commas: ${hasCommas}`);
        
        // If multiple parts, commas, semicolons, or new lines, treat as multi-product order
        if (hasMultipleProducts || hasNewLines || hasCommas || hasSemicolons) {
            console.log(`🛒 Processing multi-product order...`);
            
            // Parse the order using your existing order-parser
            const { items, unparsed } = parseOrder(text);
            console.log(`📦 Parsed ${items.length} items from order`);
            
            if (items.length > 0) {
                let cartItems = [];
                let total = 0;
                let outOfStock = [];
                let notFound = [];
                
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
                        } else if (product.stock < item.qty) {
                            outOfStock.push(`${product.part} (only ${product.stock} available)`);
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
        // SINGLE PRODUCT ORDER
        // ============================================================
        const partNumber = extractPartNumber(cleaned);
        const quantity = extractQuantity(cleaned);
        
        if (partNumber && quantity && quantity > 0) {
            console.log(`🛒 Single product order: ${partNumber} x${quantity}`);
            
            const product = await db.getProduct(partNumber);
            if (product) {
                const billingPrice = product.billing_price || product.list_price || 0;
                const gstRate = product.gst || 18;
                const gstAmount = billingPrice * (gstRate / 100);
                const priceWithGST = billingPrice + gstAmount;
                const total = priceWithGST * quantity;
                
                const cartItems = [{
                    part: product.part,
                    description: product.description,
                    qty: quantity,
                    price: priceWithGST,
                    list_price: product.list_price,
                    mrp: product.mrp,
                    billing_price: billingPrice
                }];
                
                await db.saveCart(from, cartItems, total, total);
                console.log(`✅ Cart saved: ${quantity} x ${product.part} = ₹${total.toFixed(2)}`);
                
                let reply = `🛒 *ORDER SUMMARY*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
                reply += `*${product.part}* x${quantity}\n`;
                reply += `📝 ${product.description}\n`;
                if (product.list_price > 0) reply += `💰 LIST: ₹${product.list_price.toFixed(2)}\n`;
                if (product.mrp > 0) reply += `💰 MRP: ₹${product.mrp.toFixed(2)}\n`;
                reply += `💳 ₹${priceWithGST.toFixed(2)} × ${quantity} = ₹${total.toFixed(2)}\n\n`;
                reply += `━━━━━━━━━━━━━━━━━━━━\n`;
                reply += `💰 *Total: ₹${total.toFixed(2)}* (incl. GST)\n`;
                reply += `━━━━━━━━━━━━━━━━━━━━\n\n`;
                
                if (product.stock === 0) {
                    reply += `⚠️ Out of Stock\n`;
                    reply += `🔔 We'll notify you when available.\n\n`;
                } else if (product.stock < quantity) {
                    reply += `⚠️ Only ${product.stock} available (requested ${quantity})\n\n`;
                }
                
                reply += `✅ *Confirm order?* Reply "Confirm Order"\n`;
                reply += `🗑️ *Clear Cart* - Start fresh\n\n`;
                reply += `📞 Call: ${CONFIG.businessPhone}`;
                
                await sendWhatsAppMessage(from, reply);
                return;
            } else {
                await sendWhatsAppMessage(from, `❌ Product "${partNumber}" not found. Please check the part number.`);
                return;
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
                items.forEach((item, index) => {
                    reply += `   ${index + 1}. ${item.part} x${item.qty} = ₹${(item.price * item.qty).toFixed(2)}\n`;
                });
                reply += `💰 Total: ₹${cart.total.toFixed(2)}\n`;
                reply += `📞 *Call:* ${CONFIG.businessPhone}\n`;
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
        // SEARCH PRODUCTS (Part number without quantity)
        // ============================================================
        if (partNumber) {
            console.log(`🔍 Searching for part: ${partNumber}`);
            const results = await db.searchProducts(partNumber, 5);
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
                return;
            }
        }
        
        // ============================================================
        // NO RESULTS FOUND
        // ============================================================
        await sendWhatsAppMessage(from, 
            `🔍 No results found for "${text}"\n\n` +
            `💡 Try sending a part number like:\n` +
            `"0801BA0285N"\n\n` +
            `💡 Or send "Help" for options\n\n` +
            `📞 Call: ${CONFIG.businessPhone}`
        );
        
    } catch (error) {
        console.error(`❌ Message handler error: ${error.message}`);
        console.error(error.stack);
        await sendWhatsAppMessage(from, '⚠️ Sorry, something went wrong. Please try again.');
    }
}

// ============================================================
// 🚀 EXPORT
// ============================================================

module.exports = {
    sendWhatsAppMessage,
    handleWhatsAppMessage,
    formatProductForWhatsApp,
    cleanText
};
