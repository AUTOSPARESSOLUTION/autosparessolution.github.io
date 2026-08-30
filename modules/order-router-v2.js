// ============================================================
// 📦 ORDER ROUTER V2 - AUTO FETCH & NOTIFY SUPPLIERS
// ============================================================

const { db, dbRun, dbGet, dbAll } = require('./database');

class OrderRouter {
    constructor() {
        this.cache = new Map();
        this.cacheTTL = 300000;
    }

    async findSuppliersForProduct(part, pincode = null) {
        try {
            const cacheKey = `${part}_${pincode || 'all'}`;
            if (this.cache.has(cacheKey)) {
                const cached = this.cache.get(cacheKey);
                if (Date.now() - cached.timestamp < this.cacheTTL) return cached.data;
            }
            
            let query = `
                SELECT s.id as supplier_id, s.name as supplier_name, s.phone as contact_phone,
                       ps.mapping_type, ps.priority, si.quantity as stock_quantity, si.price as unit_price,
                       ssa.delivery_time_hours, ssa.delivery_charge
                FROM product_supplier_mapping ps
                JOIN suppliers s ON ps.supplier_id = s.id
                LEFT JOIN supplier_inventory si ON s.id = si.supplier_id AND si.part = ps.part
                LEFT JOIN supplier_service_areas ssa ON s.id = ssa.supplier_id
                WHERE ps.part = ? AND ps.is_active = 1 AND s.status = 'active'
            `;
            const params = [part];
            if (pincode) {
                query += ` AND (ssa.pincode = ? OR ssa.pincode IS NULL)`;
                params.push(pincode);
            }
            query += ` ORDER BY CASE mapping_type WHEN 'primary' THEN 1 WHEN 'secondary' THEN 2 ELSE 3 END, priority ASC, stock_quantity DESC`;
            
            const results = await dbAll(query, params);
            this.cache.set(cacheKey, { data: results, timestamp: Date.now() });
            return results;
        } catch (error) {
            console.error('❌ Find suppliers error:', error.message);
            return [];
        }
    }

    async processOrder(orderId) {
        console.log(`🔄 Processing order: ${orderId}`);
        try {
            const order = await dbGet(`SELECT * FROM orders WHERE order_id = ?`, [orderId]);
            if (!order) return { success: false, message: 'Order not found' };
            
            const items = JSON.parse(order.items);
            const customerPincode = order.delivery_pincode || null;
            let matchedItems = 0, unmatchedItems = 0, notificationsCreated = 0;
            
            for (const item of items) {
                const part = item.part;
                const quantity = item.qty || 1;
                const suppliers = await this.findSuppliersForProduct(part, customerPincode);
                if (suppliers.length === 0) { unmatchedItems++; continue; }
                matchedItems++;
                for (const supplier of suppliers) {
                    await dbRun(
                        `INSERT INTO supplier_order_notifications (order_id, supplier_id, product_part, quantity, customer_phone, status)
                         VALUES (?, ?, ?, ?, ?, 'pending')`,
                        [orderId, supplier.supplier_id, part, quantity, order.phone]
                    );
                    notificationsCreated++;
                }
            }
            return { success: true, order_id: orderId, total_items: items.length, matched_items: matchedItems, unmatched_items: unmatchedItems, notifications_created: notificationsCreated };
        } catch (error) {
            console.error('❌ Process order error:', error.message);
            return { success: false, message: error.message };
        }
    }

    async getOrderStatus(orderId) {
        try {
            const notifications = await dbAll(`SELECT * FROM supplier_order_notifications WHERE order_id = ?`, [orderId]);
            const stats = {
                total: notifications.length,
                pending: notifications.filter(n => n.status === 'pending').length,
                sent: notifications.filter(n => n.status === 'sent').length,
                accepted: notifications.filter(n => n.status === 'accepted').length,
                rejected: notifications.filter(n => n.status === 'rejected').length,
                fulfilled: notifications.filter(n => n.status === 'fulfilled').length
            };
            const order = await dbGet(`SELECT * FROM orders WHERE order_id = ?`, [orderId]);
            return { order_id: orderId, order_status: order?.status || 'unknown', stats, notifications };
        } catch (error) {
            console.error('❌ Get order status error:', error.message);
            return null;
        }
    }
}

module.exports = new OrderRouter();
