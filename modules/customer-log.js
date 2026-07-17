// ============================================================
// 📊 CUSTOMER LOG & NOTIFICATION MODULE
// ============================================================

const db = require('./database');

// ============================================================
// 📝 LOG CUSTOMER ENQUIRY
// ============================================================

async function logEnquiry(phone, enquiryType, data) {
    return new Promise((resolve, reject) => {
        const sql = `
            INSERT INTO customer_enquiries (
                phone, enquiry_type, enquiry_text, media_id, image_url,
                response_text, products_found, products_out_of_stock,
                status, metadata
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const params = [
            phone,
            enquiryType,
            data.text || null,
            data.mediaId || null,
            data.imageUrl || null,
            data.response || null,
            data.productsFound ? JSON.stringify(data.productsFound) : null,
            data.productsOutOfStock ? JSON.stringify(data.productsOutOfStock) : null,
            data.status || 'pending',
            data.metadata ? JSON.stringify(data.metadata) : null
        ];

        db.db.run(sql, params, function(err) {
            if (err) {
                console.error('❌ Log enquiry error:', err.message);
                reject(err);
            } else {
                resolve(this.lastID);
            }
        });
    });
}

// ============================================================
// 📊 GET ENQUIRY HISTORY
// ============================================================

async function getEnquiryHistory(phone, limit = 20) {
    return new Promise((resolve, reject) => {
        const sql = `
            SELECT * FROM customer_enquiries 
            WHERE phone = ? 
            ORDER BY created_at DESC 
            LIMIT ?
        `;
        db.db.all(sql, [phone, limit], (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
}

// ============================================================
// 📊 GET ALL ENQUIRIES
// ============================================================

async function getAllEnquiries(dateFrom, dateTo, limit = 100) {
    return new Promise((resolve, reject) => {
        let sql = `SELECT * FROM customer_enquiries WHERE 1=1`;
        const params = [];

        if (dateFrom) {
            sql += ' AND created_at >= ?';
            params.push(dateFrom);
        }
        if (dateTo) {
            sql += ' AND created_at <= ?';
            params.push(dateTo);
        }

        sql += ' ORDER BY created_at DESC LIMIT ?';
        params.push(limit);

        db.db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
}

// ============================================================
// 📊 GET ENQUIRY STATISTICS
// ============================================================

async function getEnquiryStats(dateFrom, dateTo) {
    return new Promise((resolve, reject) => {
        let sql = `
            SELECT 
                COUNT(*) as total,
                COUNT(CASE WHEN enquiry_type = 'text' THEN 1 END) as text_queries,
                COUNT(CASE WHEN enquiry_type = 'image' THEN 1 END) as image_queries,
                COUNT(CASE WHEN enquiry_type = 'search' THEN 1 END) as searches,
                COUNT(CASE WHEN enquiry_type = 'order' THEN 1 END) as orders,
                COUNT(CASE WHEN status = 'processed' THEN 1 END) as successful,
                COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
                COUNT(DISTINCT phone) as unique_customers
            FROM customer_enquiries 
            WHERE 1=1
        `;
        const params = [];

        if (dateFrom) {
            sql += ' AND created_at >= ?';
            params.push(dateFrom);
        }
        if (dateTo) {
            sql += ' AND created_at <= ?';
            params.push(dateTo);
        }

        db.db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row || { total: 0, text_queries: 0, image_queries: 0, searches: 0, orders: 0, successful: 0, failed: 0, unique_customers: 0 });
        });
    });
}

// ============================================================
// 🔔 TRACK OUT-OF-STOCK
// ============================================================

async function trackOutOfStock(phone, part, productName = '', quantity = 1) {
    return new Promise((resolve, reject) => {
        const sql = `
            INSERT OR REPLACE INTO out_of_stock_tracking 
            (phone, part, product_name, quantity, status, created_at)
            VALUES (?, ?, ?, ?, 'waiting', CURRENT_TIMESTAMP)
        `;
        db.db.run(sql, [phone, part, productName, quantity], (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

// ============================================================
// 🔔 GET WAITING NOTIFICATIONS
// ============================================================

async function getWaitingNotifications(part = null) {
    return new Promise((resolve, reject) => {
        let sql = `SELECT * FROM out_of_stock_tracking WHERE status = 'waiting'`;
        const params = [];
        if (part) {
            sql += ' AND part = ?';
            params.push(part);
        }
        sql += ' ORDER BY created_at ASC';

        db.db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
}

// ============================================================
// 🔔 NOTIFY RESTOCK
// ============================================================

async function notifyRestock(part) {
    return new Promise((resolve, reject) => {
        getWaitingNotifications(part)
            .then(async (customers) => {
                if (customers.length === 0) {
                    resolve({ notified: 0, failed: 0, part });
                    return;
                }

                let notified = 0;
                let failed = 0;

                for (const customer of customers) {
                    try {
                        // Update status
                        await markNotified(customer.id);
                        notified++;
                    } catch (error) {
                        failed++;
                        console.error(`❌ Failed to notify ${customer.phone}:`, error.message);
                    }
                }

                resolve({ notified, failed, part });
            })
            .catch(reject);
    });
}

// ============================================================
// 🔔 MARK NOTIFIED
// ============================================================

async function markNotified(trackingId) {
    return new Promise((resolve, reject) => {
        const sql = `
            UPDATE out_of_stock_tracking 
            SET status = 'notified', notified_at = CURRENT_TIMESTAMP 
            WHERE id = ?
        `;
        db.db.run(sql, [trackingId], (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

// ============================================================
// 📝 RECORD STOCK CHANGE
// ============================================================

async function recordStockChange(part, oldStock, newStock, source = 'manual') {
    return new Promise((resolve, reject) => {
        const sql = `
            INSERT INTO stock_history (part, old_stock, new_stock, change_amount, source)
            VALUES (?, ?, ?, ?, ?)
        `;
        const change = newStock - oldStock;
        db.db.run(sql, [part, oldStock, newStock, change, source], (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

// ============================================================
// 📊 GET STOCK HISTORY
// ============================================================

async function getStockHistory(part = null, limit = 50) {
    return new Promise((resolve, reject) => {
        let sql = `SELECT * FROM stock_history`;
        const params = [];
        if (part) {
            sql += ' WHERE part = ?';
            params.push(part);
        }
        sql += ' ORDER BY created_at DESC LIMIT ?';
        params.push(limit);

        db.db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
}

// ============================================================
// 📊 GET CUSTOMER INSIGHTS
// ============================================================

async function getCustomerInsights(phone) {
    return new Promise((resolve, reject) => {
        const sql = `
            SELECT 
                phone,
                COUNT(*) as total_enquiries,
                COUNT(CASE WHEN enquiry_type = 'order' THEN 1 END) as total_orders,
                COUNT(CASE WHEN status = 'processed' THEN 1 END) as successful_queries,
                COUNT(DISTINCT DATE(created_at)) as active_days,
                MAX(created_at) as last_active
            FROM customer_enquiries 
            WHERE phone = ?
            GROUP BY phone
        `;
        db.db.get(sql, [phone], (err, row) => {
            if (err) reject(err);
            else resolve(row || { phone, total_enquiries: 0, total_orders: 0, successful_queries: 0, active_days: 0, last_active: null });
        });
    });
}

// ============================================================
// 🚀 EXPORT
// ============================================================

module.exports = {
    logEnquiry,
    getEnquiryHistory,
    getAllEnquiries,
    getEnquiryStats,
    trackOutOfStock,
    getWaitingNotifications,
    notifyRestock,
    markNotified,
    recordStockChange,
    getStockHistory,
    getCustomerInsights
};
