// ============================================================
// 📊 PRODUCT COVERAGE - UNCOVERED PRODUCTS REPORTING
// ============================================================

const { db, dbRun, dbGet, dbAll } = require('./database');

class ProductCoverage {
    constructor() { this.cache = new Map(); this.cacheTTL = 300000; }

    async getUncoveredProducts() {
        try {
            return await dbAll(`
                SELECT p.part, p.description, p.brand, p.stock as master_stock,
                       CASE WHEN ps.part IS NULL THEN 'NO_COVERAGE' ELSE 'COVERED' END as coverage_status,
                       COUNT(DISTINCT ps.supplier_id) as supplier_count,
                       COALESCE(SUM(si.quantity), 0) as supplier_total_stock
                FROM products p
                LEFT JOIN product_supplier_mapping ps ON p.part = ps.part AND ps.is_active = 1
                LEFT JOIN supplier_inventory si ON p.part = si.part
                GROUP BY p.part HAVING coverage_status = 'NO_COVERAGE'
                ORDER BY p.part`);
        } catch (error) { console.error('❌ Get uncovered products error:', error.message); return []; }
    }

    async getCoverageSummary() {
        try {
            const summary = await dbAll(`
                SELECT COUNT(DISTINCT p.part) as total_products,
                       COUNT(DISTINCT CASE WHEN ps.part IS NOT NULL THEN p.part END) as products_with_supplier,
                       COUNT(DISTINCT CASE WHEN ps.part IS NULL THEN p.part END) as uncovered_products,
                       AVG(CASE WHEN ps.part IS NOT NULL THEN 1 ELSE 0 END) * 100 as coverage_percentage
                FROM products p
                LEFT JOIN product_supplier_mapping ps ON p.part = ps.part AND ps.is_active = 1`);
            return summary[0] || { total_products: 0, products_with_supplier: 0, uncovered_products: 0, coverage_percentage: 0 };
        } catch (error) { console.error('❌ Get coverage summary error:', error.message); return null; }
    }

    async getPendingOrdersWithUncoveredItems() {
        try {
            const orders = await dbAll(`
                SELECT o.order_id, o.phone as customer_phone, o.created_at as order_date,
                       json_extract(value, '$.part') as part,
                       json_extract(value, '$.qty') as quantity,
                       CASE WHEN ps.part IS NOT NULL THEN 'COVERED' ELSE 'UNCOVERED' END as coverage_status
                FROM orders o
                CROSS JOIN json_each(o.items)
                LEFT JOIN product_supplier_mapping ps ON json_extract(value, '$.part') = ps.part AND ps.is_active = 1
                WHERE o.status IN ('pending', 'confirmed', 'processing')
                GROUP BY o.order_id, json_extract(value, '$.part')
                HAVING coverage_status = 'UNCOVERED'
                ORDER BY o.created_at DESC`);
            
            const groupedOrders = {};
            for (const item of orders) {
                if (!groupedOrders[item.order_id]) {
                    groupedOrders[item.order_id] = { order_id: item.order_id, customer_phone: item.customer_phone, order_date: item.order_date, items: [], total_uncovered: 0 };
                }
                groupedOrders[item.order_id].items.push({ part: item.part, quantity: item.quantity });
                groupedOrders[item.order_id].total_uncovered++;
            }
            return Object.values(groupedOrders);
        } catch (error) { console.error('❌ Get pending orders with uncovered items error:', error.message); return []; }
    }
}

module.exports = new ProductCoverage();
