// ============================================================
// 🔍 ENHANCED PRODUCT SEARCH - COMPLETE FIXED VERSION
// ============================================================

const db = require('./database');

// ============================================================
// 🛠️ HELPER FUNCTIONS (Self-contained)
// ============================================================

const CONFIG = {
    businessPhone: process.env.PHONE || "9830300193",
    phoneNumberId: process.env.ID,
    accessToken: process.env.TOKEN
};

const ADMIN_PHONE = process.env.ADMIN_PHONE || "9830300193";

function isAdmin(phone) {
    if (!phone) return false;
    const normalizedFrom = phone.replace(/\D/g, '');
    const normalizedAdmin = ADMIN_PHONE.replace(/\D/g, '');
    return normalizedFrom === normalizedAdmin;
}

async function sendWhatsAppMessage(to, message) {
    const maxRetries = 3;
    let retries = 0;
    
    while (retries < maxRetries) {
        try {
            const normalizedPhone = to.replace(/\D/g, '');
            const url = `https://graph.facebook.com/v23.0/${CONFIG.phoneNumberId}/messages`;
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${CONFIG.accessToken}`,
                    'Content-Type': 'application/json'
                },
                signal: controller.signal,
                body: JSON.stringify({
                    messaging_product: 'whatsapp',
                    to: normalizedPhone,
                    type: 'text',
                    text: { body: message.slice(0, 4096) }
                })
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                const errorText = await response.text();
                if (response.status === 429) {
                    await new Promise(resolve => setTimeout(resolve, 5000));
                    retries++;
                    continue;
                }
                throw new Error(`WhatsApp API error ${response.status}: ${errorText}`);
            }
            
            const result = await response.json();
            if (result.messages?.[0]?.id) {
                console.log(`✅ Message sent to ${normalizedPhone}`);
                return result;
            }
            throw new Error('No message ID in response');
            
        } catch (error) {
            retries++;
            console.error(`❌ Send attempt ${retries} failed: ${error.message}`);
            if (retries < maxRetries) {
                const delay = retries * 2000;
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                throw error;
            }
        }
    }
}

// ============================================================
// 🔍 ENHANCED SEARCH FUNCTIONS
// ============================================================

async function searchProducts(text, from) {
    try {
        const query = text.trim();
        console.log(`🔍 Enhanced search: "${query}"`);
        
        const isAdminUser = isAdmin(from);
        const partMatch = query.match(/\b([A-Z0-9]{5,20})\b/i);
        if (!partMatch) {
            await searchByDescription(query, from);
            return;
        }
        const partNumber = partMatch[1].toUpperCase();
        console.log(`🔍 Looking for part: "${partNumber}"`);
        
        // ✅ FIX: Use the SAME method as old search to find product
        let master = await db.db.get(`SELECT * FROM products WHERE part = ?`, [partNumber]);
        
        // ✅ If not found, try case-insensitive (SQLite COLLATE NOCASE)
        if (!master) {
            console.log(`🔄 Not found, trying case-insensitive...`);
            master = await db.db.get(`SELECT * FROM products WHERE part COLLATE NOCASE = ?`, [partNumber]);
        }
        
        // ✅ If still not found, try using LIKE with wildcard
        if (!master) {
            console.log(`🔄 Not found, trying LIKE search...`);
            // Try to find with partial match (first 10 characters)
            const searchPart = partNumber.slice(0, 10);
            const results = await db.db.all(`SELECT * FROM products WHERE part LIKE ? LIMIT 1`, [`${searchPart}%`]);
            if (results && results.length > 0) {
                master = results[0];
                console.log(`✅ Found via LIKE: ${master.part}`);
            }
        }
        
        // ✅ If still not found, try removing special characters
        if (!master) {
            console.log(`🔄 Not found, trying clean part search...`);
            const cleanPart = partNumber.replace(/[^A-Z0-9]/g, '');
            const results = await db.db.all(`SELECT * FROM products WHERE part LIKE ? LIMIT 1`, [`%${cleanPart}%`]);
            if (results && results.length > 0) {
                master = results[0];
                console.log(`✅ Found via clean search: ${master.part}`);
            }
        }
        
        // ✅ If STILL not found, try searching by description
        if (!master) {
            console.log(`🔄 Not found, trying description search...`);
            const results = await db.db.all(`SELECT * FROM products WHERE description LIKE ? LIMIT 1`, [`%${partNumber}%`]);
            if (results && results.length > 0) {
                master = results[0];
                console.log(`✅ Found via description: ${master.part}`);
            }
        }
        
        // ✅ If STILL not found, check database to debug
        if (!master) {
            // Check if product exists in database
            const count = await db.db.get(`SELECT COUNT(*) as count FROM products WHERE part = ?`, [partNumber]);
            console.log(`📊 Product count for ${partNumber}: ${count?.count || 0}`);
            
            // Try to get any product with similar pattern
            const sample = await db.db.all(`SELECT part FROM products LIMIT 5`);
            console.log(`📊 Sample products in DB:`, sample.map(p => p.part).join(', '));
        }
        
        if (!master) {
            console.log(`❌ Product NOT found: ${partNumber}`);
            // Show a friendly message with suggestion
            let reply = `🔍 *Product Not Found*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
            reply += `❌ *${partNumber}*\n   Not found in our inventory\n\n`;
            reply += `💡 *Try:*\n`;
            reply += `   • Check the part number spelling (case doesn't matter)\n`;
            reply += `   • Try searching by description\n`;
            reply += `   • Send "Help" for assistance\n\n`;
            reply += `📞 Call: ${CONFIG.businessPhone}`;
            await sendWhatsAppMessage(from, reply);
            return;
        }
        
        console.log(`✅ Product FOUND: ${master.part} - ${master.description}`);
        
        // ✅ Get suppliers with safe array
        let suppliers = await db.db.all(`
            SELECT s.name as supplier_name, s.phone, si.quantity, si.price, si.last_updated
            FROM supplier_inventory si
            JOIN suppliers s ON si.supplier_id = s.id
            WHERE si.part = ? AND si.is_active = 1 AND si.quantity > 0
            ORDER BY si.price ASC, si.quantity DESC
        `, [partNumber]);
        
        if (!suppliers) suppliers = [];
        if (!Array.isArray(suppliers)) suppliers = [suppliers];
        
        // ✅ Calculate stock safely
        const totalSupplierStock = suppliers.reduce((sum, s) => sum + (parseInt(s.quantity) || 0), 0);
        const masterStock = parseInt(master?.stock) || 0;
        const totalAvailable = masterStock + totalSupplierStock;
        const hasMasterStock = masterStock > 0;
        const hasSupplierStock = suppliers.length > 0;
        
        let bestPrice = null;
        if (suppliers.length > 0) {
            const best = suppliers.reduce((min, s) => ((parseFloat(s.price) || 0) < (parseFloat(min.price) || 0) ? s : min), suppliers[0]);
            bestPrice = parseFloat(best.price) || null;
        }
        
        let reply = `🔍 *Product Details*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
        
        // ✅ Show ALL product details like old search
        if (master && master.part) {
            reply += `1. *${master.part}*\n`;
            reply += `📝 ${master.description || 'N/A'}\n`;
            if (master.brand) reply += `🏷️ Brand: ${master.brand}\n`;
            if (master.make) reply += `🚗 Make: ${master.make}\n`;
            if (master.model) reply += `🎯 Model: ${master.model}\n`;
            
            const listPrice = parseFloat(master.list_price) || 0;
            const mrpPrice = parseFloat(master.mrp) || 0;
            const billingPrice = parseFloat(master.billing_price) || 0;
            const priceWithGST = billingPrice * 1.18;
            
            if (listPrice > 0) reply += `💰 LIST PRICE: ₹${listPrice.toFixed(2)}\n`;
            if (mrpPrice > 0) reply += `💰 MRP PRICE: ₹${mrpPrice.toFixed(2)}\n`;
            if (billingPrice > 0) {
                reply += `💳 Billing Price: ₹${billingPrice.toFixed(2)}\n`;
                reply += `💳 Price incl. GST: ₹${priceWithGST.toFixed(2)}\n`;
            }
            
            reply += `📦 ${masterStock > 0 ? `✅ ${masterStock} pcs available` : '❌ Out of Stock'}`;
            
            if (hasSupplierStock && !isAdminUser) {
                reply += `\n🔗 ${totalSupplierStock} pcs available from partners`;
                if (bestPrice) reply += ` (Best Price: ₹${bestPrice.toFixed(2)})`;
            }
            
        } else {
            reply += `❌ *${partNumber}*\n📝 Product not found in database\n`;
        }
        
        reply += `\n🛒 To order: "${master?.part || partNumber} 2"\n`;
        reply += `📞 Call: ${CONFIG.businessPhone}`;
        
        await sendWhatsAppMessage(from, reply);
        
    } catch (error) {
        console.error('❌ Search error:', error.message);
        console.error('❌ Stack:', error.stack);
        await sendWhatsAppMessage(from, `⚠️ *Search Error*\n\nSomething went wrong. Please try again.\n📞 Call: ${CONFIG.businessPhone}`);
    }
}

async function searchByDescription(query, from) {
    try {
        const isAdminUser = isAdmin(from);
        const results = await db.db.all(`
            SELECT p.part, p.description, p.brand, p.stock as master_stock,
                   p.list_price, p.mrp, p.billing_price,
                   COALESCE(SUM(si.quantity), 0) as supplier_stock,
                   COUNT(DISTINCT si.supplier_id) as supplier_count,
                   MIN(si.price) as best_price
            FROM products p
            LEFT JOIN supplier_inventory si ON p.part = si.part AND si.is_active = 1 AND si.quantity > 0
            WHERE p.description LIKE ? OR p.brand LIKE ? OR p.make LIKE ? OR p.model LIKE ?
            GROUP BY p.part
            ORDER BY (p.stock + COALESCE(SUM(si.quantity), 0)) DESC
            LIMIT 10
        `, [`%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`]);
        
        if (results.length === 0) {
            await sendWhatsAppMessage(from, `🔍 *No Results for "${query}"*\n\n💡 Try:\n   • Part number: "0801BA0285N"\n   • Brand: "RANE"\n   • Vehicle: "Maruti 800"\n\n📞 Call: ${CONFIG.businessPhone}`);
            return;
        }
        
        let reply = `🔍 *Search Results for "${query}"*\n━━━━━━━━━━━━━━━━━━━━\n\nFound ${results.length} result(s)\n\n`;
        results.forEach((p, i) => {
            const total = (parseInt(p.master_stock) || 0) + (parseInt(p.supplier_stock) || 0);
            reply += `${i + 1}. *${p.part}*\n`;
            reply += `📝 ${p.description || 'N/A'}\n`;
            if (p.brand) reply += `🏷️ Brand: ${p.brand}\n`;
            
            const billingPrice = parseFloat(p.billing_price) || 0;
            const priceWithGST = billingPrice * 1.18;
            if (billingPrice > 0) reply += `💳 Price: ₹${priceWithGST.toFixed(2)} (incl. GST)\n`;
            
            reply += `📦 ${total} pcs available`;
            if (!isAdminUser && p.supplier_count > 0) reply += ` (Partner Network)`;
            else if (isAdminUser && p.supplier_count > 0) reply += ` (${p.supplier_count} partner${p.supplier_count > 1 ? 's' : ''})`;
            if (!isAdminUser && p.best_price) reply += `\n   💰 Best Partner Price: ₹${parseFloat(p.best_price).toFixed(2)}`;
            reply += `\n\n`;
        });
        reply += `━━━━━━━━━━━━━━━━━━━━\n🛒 To order: Send part number with quantity\n📞 Call: ${CONFIG.businessPhone}`;
        await sendWhatsAppMessage(from, reply);
    } catch (error) {
        console.error('❌ Description search error:', error.message);
        await sendWhatsAppMessage(from, `⚠️ *Search Error*\n\nPlease try again.\n📞 Call: ${CONFIG.businessPhone}`);
    }
}

async function handleProductNotFound(from, partNumber, query) {
    const similar = await db.db.all(`
        SELECT part, description, brand FROM products 
        WHERE part LIKE ? OR description LIKE ? 
        LIMIT 5
    `, [`${partNumber.slice(0, 8)}%`, `%${partNumber.slice(0, 6)}%`]);
    
    let reply = `🔍 *Product Not Found*\n━━━━━━━━━━━━━━━━━━━━\n\n❌ *${partNumber}*\n   Not found in our inventory\n\n`;
    if (similar.length > 0) {
        reply += `💡 *Similar Parts:*\n`;
        similar.forEach((p, i) => { 
            reply += `   ${i + 1}. ${p.part} - ${p.description || 'N/A'}\n`; 
        });
        reply += `\n`;
    }
    reply += `💡 *Suggestions:*\n   1️⃣ Check the part number spelling\n   2️⃣ Try a partial search\n   3️⃣ Describe the part\n\n📞 Call: ${CONFIG.businessPhone}`;
    await sendWhatsAppMessage(from, reply);
}

module.exports = {
    searchProducts,
    searchByDescription,
    handleProductNotFound
};
