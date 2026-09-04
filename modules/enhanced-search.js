// ============================================================
// 🔍 ENHANCED PRODUCT SEARCH - HIDE SUPPLIER NAMES FROM CUSTOMERS
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
        
        const master = await db.db.get(`SELECT * FROM products WHERE part = ?`, [partNumber]);
        const suppliers = await db.db.all(`
            SELECT s.name as supplier_name, s.phone, si.quantity, si.price, si.last_updated
            FROM supplier_inventory si
            JOIN suppliers s ON si.supplier_id = s.id
            WHERE si.part = ? AND si.is_active = 1 AND si.quantity > 0
            ORDER BY si.price ASC, si.quantity DESC
        `, [partNumber]);
        
        const hasMasterStock = master && master.stock > 0;
        const hasSupplierStock = suppliers.length > 0;
        const totalSupplierStock = suppliers.reduce((sum, s) => sum + s.quantity, 0);
        const masterStock = master?.stock || 0;
        const totalAvailable = masterStock + totalSupplierStock;
        let bestPrice = null;
        if (suppliers.length > 0) {
            const best = suppliers.reduce((min, s) => (s.price < min.price ? s : min), suppliers[0]);
            bestPrice = best.price;
        }
        
        if (!hasMasterStock && !hasSupplierStock) {
            await handleProductNotFound(from, partNumber, query);
            return;
        }
        
        let reply = `🔍 *Product Details*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
        if (master) {
            reply += `🏷️ *${master.part}*\n📝 ${master.description || 'N/A'}\n`;
            if (master.brand) reply += `🏷️ Brand: ${master.brand}\n`;
            if (master.make) reply += `🚗 Make: ${master.make}\n`;
            if (master.model) reply += `🎯 Model: ${master.model}\n`;
        } else {
            reply += `🏷️ *${partNumber}*\n`;
        }
        reply += `\n━━━━━━━━━━━━━━━━━━━━\n📦 *STOCK AVAILABILITY*\n\n`;
        
        reply += `🏢 *Company Stock:*\n`;
        if (hasMasterStock) {
            reply += `   ✅ ${master.stock} pcs available\n`;
            if (master.billing_price) reply += `   💰 Price: ₹${master.billing_price.toFixed(2)}\n`;
        } else if (master) {
            reply += `   ⚠️ Out of Stock (0 pcs)\n`;
        } else {
            reply += `   ❌ Not available in company inventory\n`;
        }
        reply += `\n`;
        
        if (hasSupplierStock) {
            reply += `🏢 *Partner Network:*\n`;
            if (isAdminUser) {
                suppliers.forEach((s, i) => {
                    reply += `   ${i + 1}. *${s.supplier_name}*\n      📦 ${s.quantity} pcs\n`;
                    if (s.price > 0) reply += `      💰 ₹${s.price.toFixed(2)}\n`;
                    reply += `      🕐 ${new Date(s.last_updated).toLocaleString()}\n\n`;
                });
            } else {
                reply += `   ✅ ${totalSupplierStock} pcs available\n`;
                if (bestPrice) reply += `   💰 Price: ₹${bestPrice.toFixed(2)}\n`;
                reply += `   🔗 Multiple partners available\n`;
                reply += `   🕐 Stock updated: ${new Date().toLocaleDateString()}\n\n`;
            }
        } else {
            reply += `🏢 *Partner Network:*\n   ❌ Not available\n\n`;
        }
        
        reply += `━━━━━━━━━━━━━━━━━━━━\n📊 *TOTAL AVAILABLE: ${totalAvailable} pcs*\n`;
        if (!isAdminUser && hasSupplierStock && bestPrice) {
            reply += `   💰 Best Price: ₹${bestPrice.toFixed(2)}\n`;
        } else if (isAdminUser) {
            reply += `   📦 Company Stock: ${masterStock} pcs\n   🏢 Partner Stock: ${totalSupplierStock} pcs\n   🔗 ${suppliers.length} partner(s)\n`;
        }
        reply += `\n━━━━━━━━━━━━━━━━━━━━\n🛒 *To Order:*\n   Send "${partNumber} 2" to add to cart\n`;
        if (hasSupplierStock && !isAdminUser) reply += `   (Will be fulfilled by our partner network)\n`;
        reply += `\n📞 Call: ${CONFIG.businessPhone}`;
        await sendWhatsAppMessage(from, reply);
        
    } catch (error) {
        console.error('❌ Search error:', error.message);
        await sendWhatsAppMessage(from, `⚠️ *Search Error*\n\nSomething went wrong. Please try again.\n📞 Call: ${CONFIG.businessPhone}`);
    }
}

async function searchByDescription(query, from) {
    try {
        const isAdminUser = isAdmin(from);
        const results = await db.db.all(`
            SELECT p.part, p.description, p.brand, p.stock as master_stock,
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
            const total = (p.master_stock || 0) + (p.supplier_stock || 0);
            reply += `${i + 1}. *${p.part}*\n   📝 ${p.description || 'N/A'}\n`;
            if (p.brand) reply += `   🏷️ ${p.brand}\n`;
            reply += `   📦 ${total} pcs available`;
            if (!isAdminUser && p.supplier_count > 0) reply += ` (Partner Network)`;
            else if (isAdminUser && p.supplier_count > 0) reply += ` (${p.supplier_count} partner${p.supplier_count > 1 ? 's' : ''})`;
            if (!isAdminUser && p.best_price) reply += `\n   💰 ₹${p.best_price.toFixed(2)}`;
            else if (isAdminUser && p.best_price) reply += `\n   💰 Best Partner Price: ₹${p.best_price.toFixed(2)}`;
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
