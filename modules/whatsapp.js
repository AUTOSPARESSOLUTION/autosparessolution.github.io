// ============================================================
// 📤 WHATSAPP MODULE - FIXED WITH QUOTE HANDLING
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
// 🔧 CLEAN TEXT - Remove quotes, extra spaces, special chars
// ============================================================

function cleanText(text) {
    if (!text) return '';
    return text
        .replace(/^["']|["']$/g, '')           // Remove quotes at start/end
        .replace(/["']/g, '')                  // Remove all quotes
        .replace(/\s+/g, ' ')                  // Normalize spaces
        .trim();
}

// ============================================================
// 🔍 EXTRACT PART NUMBER - With quote handling
// ============================================================

function extractPartNumber(text) {
    if (!text) return null;
    
    // Clean the text first
    const clean = cleanText(text);
    
    // Try multiple patterns
    
    // Pattern 1: Part number with quotes removed
    let match = clean.match(/\b([A-Z0-9]{5,20})\b/i);
    if (match) {
        const part = match[1].toUpperCase();
        // If it's all numbers and length is 1-4, it might be a quantity
        if (/^\d{1,4}$/.test(part)) {
            return null;
        }
        return part;
    }
    
    // Pattern 2: Part number with hyphen (A15979020-0200)
    match = clean.match(/\b([A-Z0-9]{3,15}[-][A-Z0-9]{1,10})\b/i);
    if (match) {
        return match[1].toUpperCase();
    }
    
    // Pattern 3: Part number with dot
    match = clean.match(/\b([A-Z0-9]{3,15}\.[A-Z0-9]{1,10})\b/i);
    if (match) {
        return match[1].toUpperCase();
    }
    
    // Pattern 4: Part number with slash
    match = clean.match(/\b([A-Z0-9]{3,15}\/[A-Z0-9]{1,10})\b/i);
    if (match) {
        return match[1].toUpperCase();
    }
    
    return null;
}

// ============================================================
// 🔍 EXTRACT QUANTITY - With quote handling
// ============================================================

function extractQuantity(text) {
    if (!text) return null;
    
    const clean = cleanText(text);
    
    // Look for quantity patterns
    const patterns = [
        clean.match(/\b(\d{1,5})\s*(?:pcs|nos|pc|no|qty|piece|pieces)\b/i),
        clean.match(/\b(\d{1,5})\s*[xX]\b/),
        clean.match(/\b[pP][cC][sS]?\s*(\d{1,5})\b/),
        clean.match(/\b(\d{1,5})\s*$/)  // Number at the end
    ];
    
    for (const pattern of patterns) {
        if (pattern) {
            const qty = parseInt(pattern[1]);
            if (qty > 0 && qty < 1000000) {
                return qty;
            }
        }
    }
    
    // If no quantity indicators, check for any number
    const numbers = clean.match(/\b(\d{1,5})\b/g);
    if (numbers && numbers.length > 0) {
        // Try to find a number that looks like a quantity
        for (const num of numbers) {
            const qty = parseInt(num);
            if (qty > 1 && qty < 10000) {
                return qty;
            }
        }
        return parseInt(numbers[numbers.length - 1]);
    }
    
    return null;
}

// ============================================================
// 🔍 PARSE ORDER - With quote handling
// ============================================================

function parseOrder(text) {
    console.log('📝 Parsing order:', text);
    
    if (!text || text.trim() === '') {
        return { items: [], unparsed: [] };
    }
    
    // Clean the text
    const clean = cleanText(text);
    console.log('📝 Cleaned:', clean);
    
    // Split by common separators
    let segments = clean
        .split(/\n/)
        .flatMap(s => s.split(','))
        .flatMap(s => s.split(';'))
        .flatMap(s => s.split(/\s+and\s+/i))
        .flatMap(s => s.split('+'))
        .map(s => s.trim())
        .filter(s => s.length > 0);
    
    // If only one segment, try to split by part number pattern
    if (segments.length === 1 && segments[0].length > 20) {
        const multipleParts = segments[0].match(/\b[A-Z0-9]{3,15}\s+\d{1,5}\s+(?=[A-Z0-9])/gi);
        if (multipleParts && multipleParts.length > 1) {
            segments = multipleParts.map(s => s.trim());
        }
    }
    
    console.log('📝 Segments:', segments);
    
    // Parse each segment
    const items = [];
    const unparsed = [];
    const seenParts = new Set();
    
    for (const segment of segments) {
        if (!segment || segment.trim() === '') continue;
        
        // Extract part number and quantity
        const partNumber = extractPartNumber(segment);
        let quantity = extractQuantity(segment);
        
        if (partNumber) {
            // If quantity is null, default to 1
            if (quantity === null || quantity === undefined) {
                quantity = 1;
            }
            
            // Validate quantity
            if (isNaN(quantity) || quantity < 1) {
                quantity = 1;
            }
            
            if (!seenParts.has(partNumber)) {
                seenParts.add(partNumber);
                items.push({ part: partNumber, qty: quantity });
                console.log(`✅ Added: ${partNumber} x${quantity}`);
            } else {
                console.log(`⚠️ Duplicate: ${partNumber} - skipping`);
            }
        } else {
            unparsed.push(segment);
            console.log(`⚠️ Unparsed: "${segment}"`);
        }
    }
    
    console.log(`📦 Total parsed items: ${items.length}`);
    return { items, unparsed };
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
// 📩 HANDLE WHATSAPP MESSAGE - FIXED WITH QUOTE HANDLING
// ============================================================

async function handleWhatsAppMessage(message, from, type) {
    try {
        if (type === 'text') {
            const text = message.text?.body || '';
            
            console.log("==================================");
            console.log("FROM :", from);
            console.log("RAW TEXT :", text);
            console.log("==================================");
            
            // Clean the text
            const cleaned = cleanText(text);
            console.log("CLEANED TEXT :", cleaned);
            
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
                    `"0801BA0285N 2, 0303BC0071N 3"\n\n` +
                    `💰 *Check Price:*\n` +
                    `"Price 0801BA0285N"\n\n` +
                    `📦 *Check Stock:*\n` +
                    `"Stock 0801BA0285N"\n\n` +
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
                if (partNumber) {
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
                const partNumber = extractPartNumber(cleaned);
                if (partNumber) {
                    console.log(`🔍 Stock check for: ${partNumber}`);
                    const product = await db.getProduct(partNumber);
                    if (product) {
                        let reply = `📦 *Stock: ${product.part}*\n\n`;
                        reply += `📝 ${product.description}\n`;
                        reply += `📦 ${product.stock > 0 ? `✅ ${product.stock} pcs available` : '❌ Out of Stock'}`;
                        if (product.box_qty > 0) reply += ` | Box: ${product.box_qty}`;
                        if (product.carton > 0) reply += ` | Carton: ${product.carton}`;
                        await sendWhatsAppMessage(from, reply);
                        return;
                    }
                }
            }
            
            // ============================================================
            // ORDER - Using Parser
            // ============================================================
            // Check if it contains part numbers
            const partMatch = extractPartNumber(cleaned);
            
            if (partMatch) {
                console.log(`🛒 Detected order with part: ${partMatch}`);
                
                // Parse the order
                const { items, unparsed } = parseOrder(text);
                console.log(`📦 Parsed ${items.length} items from order`);
                
                if (items.length > 0) {
                    let cartItems = [];
                    let total = 0;
                    let outOfStock = [];
                    let partialStock = [];
                    let notFound = [];
                    
                    for (const item of items) {
                        const product = await db.getProduct(item.part);
                        if (product) {
                            console.log(`✅ Found product: ${product.part}`);
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
                                partialStock.push({ part: product.part, available: product.stock, requested: item.qty });
                            }
                        } else {
                            console.log(`❌ Product not found: ${item.part}`);
                            notFound.push(item.part);
                        }
                    }
                    
                    if (notFound.length > 0) {
                        await sendWhatsAppMessage(from, 
                            `❌ Products not found: ${notFound.join(', ')}\n\n💡 Please check the part numbers and try again.`
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
                    
                    if (partialStock.length > 0) {
                        for (const p of partialStock) {
                            reply += `⚠️ ${p.part}: Only ${p.available} available (requested ${p.requested})\n`;
                        }
                        reply += `\n`;
                    }
                    
                    reply += `✅ *Confirm order?* Reply "Confirm Order"\n`;
                    reply += `🗑️ *Clear Cart* - Start fresh\n\n`;
                    reply += `📞 Call: ${CONFIG.businessPhone}`;
                    
                    await sendWhatsAppMessage(from, reply);
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
            // SEARCH PRODUCTS
            // ============================================================
            console.log(`🔍 Searching for: "${cleaned}"`);
            
            // Try to find the part number
            const searchPart = extractPartNumber(cleaned);
            const searchQuery = searchPart || cleaned;
            
            const results = await db.searchProducts(searchQuery, 5);
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

// ============================================================
// 🚀 EXPORT
// ============================================================

module.exports = {
    sendWhatsAppMessage,
    handleWhatsAppMessage,
    formatProductForWhatsApp,
    cleanText,
    extractPartNumber,
    extractQuantity,
    parseOrder
};
