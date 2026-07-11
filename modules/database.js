// ============================================================
// 📦 DATABASE MODULE - SQLite (COMPLETE FIXED)
// Handles part numbers with spaces, hyphens, dots, slashes
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
// 🔧 CLEAN PART NUMBER (Remove spaces, hyphens, dots, slashes)
// ============================================================

function cleanPartNumber(part) {
    if (!part) return '';
    // Remove spaces, hyphens, dots, slashes
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
            db.run(`CREATE INDEX IF NOT EXISTS idx_products_part ON products(part)`);
            db.run(`CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand)`);
            db.run(`CREATE INDEX IF NOT EXISTS idx_products_make ON products(make)`);
            db.run(`CREATE INDEX IF NOT EXISTS idx_products_description ON products(description)`);
            db.run(`CREATE INDEX IF NOT EXISTS idx_products_stock ON products(stock)`);
            db.run(`CREATE INDEX IF NOT EXISTS idx_products_model ON products(model)`);
            db.run(`CREATE INDEX IF NOT EXISTS idx_products_hsn ON products(hsn)`);

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
// 🔍 FIXED: SEARCH PRODUCTS - Handles spaces, hyphens, dots, slashes
// ============================================================

function searchProducts(query, limit = 10) {
    return new Promise((resolve, reject) => {
        const clean = query.trim();
        
        if (clean.length < 2) {
            resolve([]);
            return;
        }

        // Clean the query (remove spaces, hyphens, dots, slashes)
        const cleanQuery = cleanPartNumber(clean);
        const searchPattern = `%${cleanQuery}%`;
        const originalPattern = `%${clean.toUpperCase()}%`;
        
        console.log(`🔍 Search: Original="${clean}", Cleaned="${cleanQuery}"`);
        
        const sql = `
            SELECT *,
                   CASE WHEN UPPER(part) = UPPER(?) THEN 100 ELSE 0 END +
                   CASE WHEN UPPER(part) = UPPER(?) THEN 100 ELSE 0 END +
                   CASE WHEN UPPER(part) LIKE UPPER(?) THEN 50 ELSE 0 END +
                   CASE WHEN UPPER(part) LIKE UPPER(?) THEN 30 ELSE 0 END +
                   CASE WHEN UPPER(description) LIKE UPPER(?) THEN 20 ELSE 0 END +
                   CASE WHEN UPPER(brand) LIKE UPPER(?) THEN 15 ELSE 0 END +
                   CASE WHEN UPPER(make) LIKE UPPER(?) THEN 15 ELSE 0 END as relevance
            FROM products
            WHERE UPPER(part) = UPPER(?)
               OR UPPER(part) = UPPER(?)
               OR UPPER(part) LIKE UPPER(?)
               OR UPPER(part) LIKE UPPER(?)
               OR UPPER(description) LIKE UPPER(?)
               OR UPPER(brand) LIKE UPPER(?)
               OR UPPER(make) LIKE UPPER(?)
               OR UPPER(model) LIKE UPPER(?)
               OR UPPER(hsn) LIKE UPPER(?)
            ORDER BY relevance DESC, stock DESC
            LIMIT ?
        `;
        
        db.all(sql, [
            clean,              // exact match (original)
            cleanQuery,         // exact match (cleaned)
            searchPattern,      // part contains (cleaned)
            originalPattern,    // part contains (original)
            originalPattern,    // description contains
            originalPattern,    // brand contains
            originalPattern,    // make contains
            clean,              // WHERE: original
            cleanQuery,         // WHERE: cleaned
            searchPattern,      // WHERE: part LIKE (cleaned)
            originalPattern,    // WHERE: part LIKE (original)
            originalPattern,    // WHERE: description LIKE
            originalPattern,    // WHERE: brand LIKE
            originalPattern,    // WHERE: make LIKE
            originalPattern,    // WHERE: model LIKE
            originalPattern,    // WHERE: hsn LIKE
            limit
        ], (err, rows) => {
            if (err) {
                console.error('Search error:', err.message);
                reject(err);
            } else {
                console.log(`📊 Found ${rows?.length || 0} results for "${clean}"`);
                resolve(rows || []);
            }
        });
    });
}

// ============================================================
// 🔍 FIXED: GET PRODUCT - Handles spaces, hyphens, dots, slashes
// ============================================================

function getProduct(part) {
    return new Promise((resolve, reject) => {
        const clean = part.trim();
        
        if (!clean || clean.length < 2) {
            resolve(null);
            return;
        }

        // Clean the part number
        const cleanPart = cleanPartNumber(clean);
        console.log(`🔍 GetProduct: Original="${clean}", Cleaned="${cleanPart}"`);
        
        // Try multiple patterns
        db.get(
            `SELECT *
             FROM products
             WHERE UPPER(part) = UPPER(?)
                OR UPPER(part) = UPPER(?)
                OR UPPER(part) LIKE UPPER(?)
                OR UPPER(part) LIKE UPPER(?)
             LIMIT 1`,
            [
                clean,          // Original with spaces/hyphens
                cleanPart,      // Cleaned version
                `%${cleanPart}%`, // Partial match (cleaned)
                `%${clean}%`     // Partial match (original)
            ],
            (err, row) => {
                if (err) {
                    console.error('Get product error:', err.message);
                    reject(err);
                } else {
                    if (row) {
                        console.log(`✅ Found product: ${row.part}`);
                    } else {
                        console.log(`❌ No product found for: ${clean}`);
                    }
                    resolve(row);
                }
            }
        );
    });
}

// ============================================================
// 🔍 GET PRODUCTS BY MULTIPLE PART NUMBERS
// ============================================================

function getProducts(parts) {
    return new Promise((resolve, reject) => {
        if (!parts || parts.length === 0) {
            resolve([]);
            return;
        }

        // Clean all part numbers
        const cleanedParts = parts.map(p => cleanPartNumber(p));
        
        // Build query with placeholders
        const placeholders = cleanedParts.map(() => '?').join(',');
        const sql = `
            SELECT * FROM products 
            WHERE UPPER(part) IN (${placeholders})
               OR UPPER(part) IN (${placeholders.map(() => '?').join(',')})
        `;
        
        // Combine both original and cleaned for matching
        const params = [...cleanedParts, ...parts.map(p => p.toUpperCase())];
        
        db.all(sql, params, (err, rows) => {
            if (err) {
                console.error('Get products error:', err.message);
                reject(err);
            } else {
                console.log(`✅ Found ${rows?.length || 0} products`);
                resolve(rows || []);
            }
        });
    });
}

// ============================================================
// 📊 GET STATS - WITH LOGGING
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
                SUM(list_price * stock) as total_value,
                SUM(CASE WHEN most_selling = 1 THEN 1 ELSE 0 END) as best_sellers
            FROM products
        `, (err, row) => {
            if (err) {
                console.error('Stats error:', err.message);
                reject(err);
            } else {
                console.log(`📊 Database Stats: ${row?.total_products || 0} products, ${row?.in_stock || 0} in stock`);
                resolve(row || { total_products: 0, in_stock: 0, out_of_stock: 0, total_stock: 0, avg_stock: 0, total_value: 0, best_sellers: 0 });
            }
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
            if (err) {
                console.error('Save cart error:', err.message);
                reject(err);
            } else {
                console.log(`✅ Cart saved for ${phone}: ${items.length} items, total: ₹${total.toFixed(2)}`);
                resolve();
            }
        });
    });
}

function getCart(phone) {
    return new Promise((resolve, reject) => {
        db.get('SELECT * FROM carts WHERE phone = ?', [phone], (err, row) => {
            if (err) {
                console.error('Get cart error:', err.message);
                reject(err);
            } else {
                resolve(row);
            }
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

function getOrders(phone, limit = 10) {
    return new Promise((resolve, reject) => {
        db.all(`
            SELECT * FROM orders 
            WHERE phone = ? 
            ORDER BY created_at DESC 
            LIMIT ?
        `, [phone, limit], (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
}

// ============================================================
// 🔍 SUGGEST PRODUCTS (for "Did you mean?")
// ============================================================

function suggestProducts(query, limit = 5) {
    return new Promise((resolve, reject) => {
        const clean = query.trim();
        if (clean.length < 2) {
            resolve([]);
            return;
        }

        const cleanQuery = cleanPartNumber(clean);
        const searchPattern = `%${cleanQuery}%`;
        
        const sql = `
            SELECT part, description, brand, stock
            FROM products
            WHERE UPPER(part) LIKE UPPER(?)
               OR UPPER(description) LIKE UPPER(?)
            ORDER BY 
                CASE WHEN UPPER(part) = UPPER(?) THEN 1 ELSE 0 END,
                stock DESC,
                part ASC
            LIMIT ?
        `;
        
        db.all(sql, [searchPattern, searchPattern, cleanQuery, limit], (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
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

// ============================================================
// 🚀 EXPORT
// ============================================================

module.exports = {
    db,
    initDatabase,
    clearProducts,
    importProducts,
    searchProducts,
    getProduct,
    getProducts,
    getStats,
    getImportHistory,
    logImport,
    saveCart,
    getCart,
    clearCart,
    saveOrder,
    getOrders,
    suggestProducts,
    cleanPartNumber,
    closeDatabase
};
