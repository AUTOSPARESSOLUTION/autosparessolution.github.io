// ============================================================
// 📦 DATABASE MODULE - Complete with Description Search
// ============================================================

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Ensure db directory exists
const dbDir = path.join(__dirname, '..', 'db');
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

const DB_PATH = process.env.DB_PATH || path.join(dbDir, 'products.db');

// Create database connection
const db = new sqlite3.Database(DB_PATH);

// Enable WAL mode for better performance
db.run('PRAGMA journal_mode = WAL');
db.run('PRAGMA synchronous = NORMAL');
db.run('PRAGMA temp_store = MEMORY');
db.run('PRAGMA cache_size = 10000');

// ============================================================
// 🔧 CLEAN PART NUMBER
// ============================================================

function cleanPartNumber(part) {
    if (!part) return '';
    return part.replace(/[\s\-\.\/]/g, '').toUpperCase().trim();
}

// ============================================================
// 📋 INITIALIZE DATABASE
// ============================================================

function initDatabase() {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            // Products table
            db.run(`
                CREATE TABLE IF NOT EXISTS products (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    part TEXT UNIQUE NOT NULL,
                    description TEXT,
                    brand TEXT,
                    make TEXT,
                    type TEXT,
                    finish TEXT,
                    list_price REAL DEFAULT 0,
                    mrp REAL DEFAULT 0,
                    billing_price REAL DEFAULT 0,
                    stock INTEGER DEFAULT 0,
                    box_qty INTEGER DEFAULT 0,
                    carton INTEGER DEFAULT 0,
                    model TEXT,
                    year_start TEXT,
                    year_end TEXT,
                    segment TEXT,
                    hsn TEXT,
                    gst REAL DEFAULT 18,
                    most_selling INTEGER DEFAULT 0,
                    media TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `, (err) => {
                if (err) {
                    console.error('❌ Failed to create products table:', err.message);
                    reject(err);
                } else {
                    console.log('✅ Products table ready');
                }
            });

            // Create indexes for fast search
            const indexes = [
                'CREATE INDEX IF NOT EXISTS idx_products_part ON products(part)',
                'CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand)',
                'CREATE INDEX IF NOT EXISTS idx_products_make ON products(make)',
                'CREATE INDEX IF NOT EXISTS idx_products_description ON products(description)',
                'CREATE INDEX IF NOT EXISTS idx_products_stock ON products(stock)',
                'CREATE INDEX IF NOT EXISTS idx_products_model ON products(model)',
                'CREATE INDEX IF NOT EXISTS idx_products_type ON products(type)',
                'CREATE INDEX IF NOT EXISTS idx_products_segment ON products(segment)'
            ];

            for (const sql of indexes) {
                db.run(sql);
            }
            console.log('✅ Indexes created');

            // Customer Enquiries
            db.run(`
                CREATE TABLE IF NOT EXISTS customer_enquiries (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    phone TEXT NOT NULL,
                    enquiry_type TEXT,
                    enquiry_text TEXT,
                    media_id TEXT,
                    image_url TEXT,
                    response_text TEXT,
                    products_found TEXT,
                    products_out_of_stock TEXT,
                    status TEXT DEFAULT 'pending',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    processed_at DATETIME,
                    metadata TEXT
                )
            `);

            // Out of Stock Tracking
            db.run(`
                CREATE TABLE IF NOT EXISTS out_of_stock_tracking (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    phone TEXT NOT NULL,
                    part TEXT NOT NULL,
                    product_name TEXT,
                    quantity INTEGER DEFAULT 1,
                    status TEXT DEFAULT 'waiting',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    notified_at DATETIME,
                    UNIQUE(phone, part)
                )
            `);

            // Stock History
            db.run(`
                CREATE TABLE IF NOT EXISTS stock_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    part TEXT NOT NULL,
                    old_stock INTEGER,
                    new_stock INTEGER,
                    change_amount INTEGER,
                    source TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // Notification Log
            db.run(`
                CREATE TABLE IF NOT EXISTS notification_log (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    phone TEXT NOT NULL,
                    type TEXT,
                    title TEXT,
                    message TEXT,
                    status TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    sent_at DATETIME
                )
            `);

            // Cart table
            db.run(`
                CREATE TABLE IF NOT EXISTS carts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    phone TEXT NOT NULL,
                    items TEXT,
                    subtotal REAL DEFAULT 0,
                    total REAL DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(phone)
                )
            `);

            // Orders table
            db.run(`
                CREATE TABLE IF NOT EXISTS orders (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    order_id TEXT UNIQUE NOT NULL,
                    phone TEXT NOT NULL,
                    items TEXT,
                    total REAL DEFAULT 0,
                    status TEXT DEFAULT 'pending',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // Import history
            db.run(`
                CREATE TABLE IF NOT EXISTS import_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    filename TEXT,
                    total_products INTEGER,
                    imported INTEGER,
                    skipped INTEGER,
                    duplicates INTEGER,
                    errors INTEGER,
                    started_at DATETIME,
                    completed_at DATETIME,
                    status TEXT
                )
            `);

            // Create additional indexes for logging
            const logIndexes = [
                'CREATE INDEX IF NOT EXISTS idx_enquiries_phone ON customer_enquiries(phone)',
                'CREATE INDEX IF NOT EXISTS idx_enquiries_created ON customer_enquiries(created_at)',
                'CREATE INDEX IF NOT EXISTS idx_tracking_phone ON out_of_stock_tracking(phone)',
                'CREATE INDEX IF NOT EXISTS idx_tracking_part ON out_of_stock_tracking(part)',
                'CREATE INDEX IF NOT EXISTS idx_stock_history_part ON stock_history(part)',
                'CREATE INDEX IF NOT EXISTS idx_notifications_phone ON notification_log(phone)'
            ];

            for (const sql of logIndexes) {
                db.run(sql);
            }

            resolve();
        });
    });
}

// ============================================================
// 🔍 SEARCH PRODUCTS - With description support
// ============================================================

function searchProducts(query, limit = 20) {
    return new Promise((resolve, reject) => {
        const clean = query.trim();
        if (clean.length < 2) {
            resolve([]);
            return;
        }

        const cleanQuery = cleanPartNumber(clean);
        const searchPattern = `%${cleanQuery}%`;
        const originalPattern = `%${clean.toUpperCase()}%`;
        const descPattern = `%${clean}%`;

        const sql = `
            SELECT *,
                   CASE 
                       WHEN UPPER(part) = UPPER(?) THEN 100 
                       WHEN UPPER(part) = UPPER(?) THEN 100 
                       WHEN UPPER(part) LIKE UPPER(?) THEN 50 
                       WHEN UPPER(part) LIKE UPPER(?) THEN 30 
                       WHEN UPPER(description) LIKE UPPER(?) THEN 25 
                       WHEN UPPER(description) LIKE UPPER(?) THEN 20 
                       WHEN UPPER(brand) LIKE UPPER(?) THEN 15 
                       WHEN UPPER(make) LIKE UPPER(?) THEN 15 
                       WHEN UPPER(model) LIKE UPPER(?) THEN 15 
                       WHEN UPPER(type) LIKE UPPER(?) THEN 10 
                       ELSE 0 
                   END as relevance
            FROM products
            WHERE UPPER(part) = UPPER(?)
               OR UPPER(part) = UPPER(?)
               OR UPPER(part) LIKE UPPER(?)
               OR UPPER(part) LIKE UPPER(?)
               OR UPPER(description) LIKE UPPER(?)
               OR UPPER(description) LIKE UPPER(?)
               OR UPPER(brand) LIKE UPPER(?)
               OR UPPER(make) LIKE UPPER(?)
               OR UPPER(model) LIKE UPPER(?)
               OR UPPER(type) LIKE UPPER(?)
            ORDER BY relevance DESC, stock DESC
            LIMIT ?
        `;

        db.all(sql, [
            clean, cleanQuery, searchPattern, originalPattern,
            descPattern, searchPattern, originalPattern,
            originalPattern, originalPattern, originalPattern,
            clean, cleanQuery, searchPattern, originalPattern,
            descPattern, searchPattern, originalPattern,
            originalPattern, originalPattern, originalPattern,
            limit
        ], (err, rows) => {
            if (err) {
                console.error('Search error:', err.message);
                reject(err);
            } else {
                resolve(rows || []);
            }
        });
    });
}

// ============================================================
// GET PRODUCT EXACT
// ============================================================

function getProductExact(part) {
    return new Promise((resolve, reject) => {
        const clean = part.trim().toUpperCase();
        if (!clean || clean.length < 2) {
            resolve(null);
            return;
        }
        db.get('SELECT * FROM products WHERE UPPER(part) = UPPER(?)', [clean], (err, row) => {
            if (err) {
                console.error('Get product exact error:', err.message);
                reject(err);
            } else {
                resolve(row || null);
            }
        });
    });
}

// ============================================================
// GET PRODUCT (Fuzzy)
// ============================================================

function getProduct(part) {
    return new Promise((resolve, reject) => {
        const clean = part.trim();
        if (!clean || clean.length < 2) {
            resolve(null);
            return;
        }

        const cleanPart = cleanPartNumber(clean);
        db.get(
            `SELECT * FROM products
             WHERE UPPER(part) = UPPER(?)
                OR UPPER(part) = UPPER(?)
                OR UPPER(part) LIKE UPPER(?)
                OR UPPER(part) LIKE UPPER(?)
             LIMIT 1`,
            [clean, cleanPart, `%${cleanPart}%`, `%${clean}%`],
            (err, row) => {
                if (err) {
                    console.error('Get product error:', err.message);
                    reject(err);
                } else {
                    resolve(row || null);
                }
            }
        );
    });
}

// ============================================================
// GET STATS
// ============================================================

function getStats() {
    return new Promise((resolve, reject) => {
        db.get(`
            SELECT 
                COUNT(*) as total_products,
                SUM(CASE WHEN stock > 0 THEN 1 ELSE 0 END) as in_stock,
                SUM(CASE WHEN stock = 0 THEN 1 ELSE 0 END) as out_of_stock,
                SUM(stock) as total_stock
            FROM products
        `, (err, row) => {
            if (err) {
                console.error('Stats error:', err.message);
                reject(err);
            } else {
                resolve(row || { total_products: 0, in_stock: 0, out_of_stock: 0, total_stock: 0 });
            }
        });
    });
}

// ============================================================
// CLEAR PRODUCTS
// ============================================================

function clearProducts() {
    return new Promise((resolve, reject) => {
        db.run('DELETE FROM products', (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

// ============================================================
// IMPORT PRODUCTS
// ============================================================

function importProducts(products) {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            db.run('BEGIN TRANSACTION');

            const stmt = db.prepare(`
                INSERT OR REPLACE INTO products (
                    part, description, brand, make, type, finish,
                    list_price, mrp, billing_price, stock, box_qty, carton,
                    model, year_start, year_end, segment, hsn, gst, most_selling,
                    updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `);

            let imported = 0;
            let errors = 0;

            for (const p of products) {
                try {
                    stmt.run(
                        p.part,
                        p.description || '',
                        p.brand || 'Unknown',
                        p.make || '',
                        p.type || '',
                        p.finish || '',
                        p.list_price || 0,
                        p.mrp || 0,
                        p.billing_price || 0,
                        p.stock || 0,
                        p.box_qty || 0,
                        p.carton || 0,
                        p.model || '',
                        p.year_start || '',
                        p.year_end || '',
                        p.segment || '',
                        p.hsn || '',
                        p.gst || 18,
                        p.most_selling ? 1 : 0
                    );
                    imported++;
                } catch (err) {
                    errors++;
                    console.error(`Error importing ${p.part}:`, err.message);
                }
            }

            stmt.finalize();
            db.run('COMMIT', (err) => {
                if (err) reject(err);
                else resolve({ imported, errors });
            });
        });
    });
}

// ============================================================
// CART FUNCTIONS
// ============================================================

function saveCart(phone, items, subtotal, total) {
    return new Promise((resolve, reject) => {
        db.run(`
            INSERT OR REPLACE INTO carts (phone, items, subtotal, total, updated_at)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        `, [phone, JSON.stringify(items), subtotal, total], (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

function getCart(phone) {
    return new Promise((resolve, reject) => {
        db.get('SELECT * FROM carts WHERE phone = ?', [phone], (err, row) => {
            if (err) reject(err);
            else resolve(row || null);
        });
    });
}

function clearCart(phone) {
    return new Promise((resolve, reject) => {
        db.run('DELETE FROM carts WHERE phone = ?', [phone], (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

// ============================================================
// ORDER FUNCTIONS
// ============================================================

function saveOrder(orderId, phone, items, total) {
    return new Promise((resolve, reject) => {
        db.run(`
            INSERT INTO orders (order_id, phone, items, total)
            VALUES (?, ?, ?, ?)
        `, [orderId, phone, JSON.stringify(items), total], (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

// ============================================================
// EXPORT
// ============================================================

module.exports = {
    db,
    initDatabase,
    clearProducts,
    importProducts,
    searchProducts,
    getProductExact,
    getProduct,
    getStats,
    saveCart,
    getCart,
    clearCart,
    saveOrder,
    cleanPartNumber
};
