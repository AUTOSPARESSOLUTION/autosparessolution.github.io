// ============================================================
// 📦 DATABASE MODULE - SQLite
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

            // Create indexes
            db.run(`CREATE INDEX IF NOT EXISTS idx_products_part ON products(part)`);
            db.run(`CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand)`);
            db.run(`CREATE INDEX IF NOT EXISTS idx_products_make ON products(make)`);
            db.run(`CREATE INDEX IF NOT EXISTS idx_products_description ON products(description)`);
            db.run(`CREATE INDEX IF NOT EXISTS idx_products_stock ON products(stock)`);

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

            resolve();
        });
    });
}

// ============================================================
// 📦 DATABASE OPERATIONS
// ============================================================

function clearProducts() {
    return new Promise((resolve, reject) => {
        db.run('DELETE FROM products', (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

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
                        p.brand || '',
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
// 🔍 SEARCH PRODUCTS
// ============================================================

function searchProducts(query, limit = 10) {
    return new Promise((resolve, reject) => {
        const clean = query.trim().toUpperCase();
        
        if (clean.length < 2) {
            resolve([]);
            return;
        }

        const searchPattern = `%${clean}%`;
        const sql = `
            SELECT *,
                   CASE WHEN part = ? THEN 100 ELSE 0 END +
                   CASE WHEN part LIKE ? THEN 50 ELSE 0 END +
                   CASE WHEN description LIKE ? THEN 30 ELSE 0 END +
                   CASE WHEN brand LIKE ? THEN 20 ELSE 0 END +
                   CASE WHEN make LIKE ? THEN 20 ELSE 0 END as relevance
            FROM products
            WHERE part LIKE ?
               OR description LIKE ?
               OR brand LIKE ?
               OR make LIKE ?
               OR model LIKE ?
               OR hsn LIKE ?
            ORDER BY relevance DESC, stock DESC
            LIMIT ?
        `;
        
        db.all(sql, [
            clean, searchPattern, searchPattern, searchPattern, searchPattern,
            searchPattern, searchPattern, searchPattern, searchPattern, searchPattern,
            searchPattern, limit
        ], (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
}

// ============================================================
// 🔍 GET PRODUCT BY PART NUMBER
// ============================================================

function getProduct(part) {
    return new Promise((resolve, reject) => {
        const clean = part.trim().toUpperCase();
        db.get('SELECT * FROM products WHERE part = ?', [clean], (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

// ============================================================
// 📊 GET STATS
// ============================================================

function getStats() {
    return new Promise((resolve, reject) => {
        db.get(`
            SELECT 
                COUNT(*) as total_products,
                SUM(CASE WHEN stock > 0 THEN 1 ELSE 0 END) as in_stock,
                SUM(CASE WHEN stock = 0 THEN 1 ELSE 0 END) as out_of_stock,
                SUM(stock) as total_stock,
                AVG(stock) as avg_stock,
                SUM(list_price * stock) as total_value
            FROM products
        `, (err, row) => {
            if (err) reject(err);
            else resolve(row || { total_products: 0, in_stock: 0, out_of_stock: 0, total_stock: 0, avg_stock: 0, total_value: 0 });
        });
    });
}

// ============================================================
// 📋 GET IMPORT HISTORY
// ============================================================

function getImportHistory(limit = 10) {
    return new Promise((resolve, reject) => {
        db.all(`
            SELECT * FROM import_history 
            ORDER BY id DESC 
            LIMIT ?
        `, [limit], (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
}

// ============================================================
// 📝 LOG IMPORT
// ============================================================

function logImport(filename, total, imported, skipped, duplicates, errors) {
    return new Promise((resolve, reject) => {
        db.run(`
            INSERT INTO import_history (
                filename, total_products, imported, skipped, duplicates, errors,
                started_at, completed_at, status
            ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?)
        `, [filename, total, imported, skipped, duplicates, errors, errors > 0 ? 'completed_with_errors' : 'completed'], function(err) {
            if (err) reject(err);
            else resolve(this.lastID);
        });
    });
}

// ============================================================
// 🛒 CART OPERATIONS
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
            else resolve(row);
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
// 📋 ORDER OPERATIONS
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
// 🚪 CLOSE DATABASE
// ============================================================

function closeDatabase() {
    return new Promise((resolve, reject) => {
        db.close((err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

module.exports = {
    db,
    initDatabase,
    clearProducts,
    importProducts,
    searchProducts,
    getProduct,
    getStats,
    getImportHistory,
    logImport,
    saveCart,
    getCart,
    clearCart,
    saveOrder,
    closeDatabase
};
