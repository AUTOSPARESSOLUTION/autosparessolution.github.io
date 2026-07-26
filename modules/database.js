// ============================================================
// 🗄️ DATABASE MODULE - COMPLETE FIXED VERSION
// modules/database.js
// ============================================================

const sqlite3 = require('sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../db/products.db');
const db = new sqlite3.Database(dbPath);

// ============================================================
// 🚀 INIT DATABASE
// ============================================================

async function initDatabase() {
    try {
        // Products Table
        await new Promise((resolve, reject) => {
            db.run(`
                CREATE TABLE IF NOT EXISTS products (
                    part TEXT PRIMARY KEY,
                    description TEXT,
                    brand TEXT,
                    make TEXT,
                    model TEXT,
                    application TEXT,
                    category TEXT,
                    hsn TEXT,
                    stock INTEGER DEFAULT 0,
                    list_price REAL DEFAULT 0,
                    billing_price REAL DEFAULT 0,
                    mrp REAL DEFAULT 0,
                    gst REAL DEFAULT 18,
                    box_qty INTEGER DEFAULT 0,
                    carton INTEGER DEFAULT 0,
                    segment TEXT,
                    region TEXT,
                    zone TEXT,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            `, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        console.log('✅ Products table ready');

        // Customers Table
        await new Promise((resolve, reject) => {
            db.run(`
                CREATE TABLE IF NOT EXISTS customers (
                    phone TEXT PRIMARY KEY,
                    name TEXT,
                    email TEXT,
                    address TEXT,
                    gstin TEXT,
                    state TEXT,
                    district TEXT,
                    business TEXT,
                    credit_limit REAL DEFAULT 50000,
                    customer_code TEXT,
                    status TEXT DEFAULT 'active',
                    total_purchases REAL DEFAULT 0,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            `, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        console.log('✅ Customers table ready');

        // Carts Table
        await new Promise((resolve, reject) => {
            db.run(`
                CREATE TABLE IF NOT EXISTS carts (
                    phone TEXT PRIMARY KEY,
                    items TEXT,
                    total REAL DEFAULT 0,
                    original_total REAL DEFAULT 0,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            `, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        console.log('✅ Carts table ready');

        // Orders Table
        await new Promise((resolve, reject) => {
            db.run(`
                CREATE TABLE IF NOT EXISTS orders (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    order_id TEXT UNIQUE,
                    phone TEXT,
                    items TEXT,
                    total REAL,
                    status TEXT DEFAULT 'pending',
                    delivery_type TEXT,
                    delivery_address TEXT,
                    delivery_pincode TEXT,
                    delivery_charges REAL DEFAULT 0,
                    payment_status TEXT DEFAULT 'pending',
                    payment_mode TEXT,
                    payment_date TEXT,
                    invoice_no TEXT,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            `, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        console.log('✅ Orders table ready');

        // Invoices Table
        await new Promise((resolve, reject) => {
            db.run(`
                CREATE TABLE IF NOT EXISTS invoices (
                    invoice_no TEXT PRIMARY KEY,
                    customer_name TEXT,
                    customer_phone TEXT,
                    customer_email TEXT,
                    customer_address TEXT,
                    customer_gstin TEXT,
                    customer_state TEXT,
                    items TEXT,
                    total REAL,
                    type TEXT DEFAULT 'cash',
                    status TEXT DEFAULT 'paid',
                    payment_status TEXT DEFAULT 'paid',
                    payment_date TEXT,
                    payment_mode TEXT,
                    invoice_pdf TEXT,
                    void_reason TEXT,
                    voided_by TEXT,
                    voided_at TEXT,
                    credit_note_no TEXT,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            `, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        console.log('✅ Invoices table ready');

        // Suppliers Table
        await new Promise((resolve, reject) => {
            db.run(`
                CREATE TABLE IF NOT EXISTS suppliers (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT,
                    phone TEXT,
                    email TEXT,
                    address TEXT,
                    gstin TEXT,
                    state TEXT,
                    city TEXT,
                    pincode TEXT,
                    credit_limit REAL DEFAULT 0,
                    outstanding REAL DEFAULT 0,
                    status TEXT DEFAULT 'active',
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            `, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        console.log('✅ Suppliers table ready');

        // Create indexes
        await createIndexes();

        console.log('✅ Database initialized');

    } catch (error) {
        console.error('❌ Init database error:', error.message);
        throw error;
    }
}

// ============================================================
// 📊 CREATE INDEXES
// ============================================================

async function createIndexes() {
    try {
        await db.run('CREATE INDEX IF NOT EXISTS idx_products_part ON products(part)');
        await db.run('CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand)');
        await db.run('CREATE INDEX IF NOT EXISTS idx_products_make ON products(make)');
        await db.run('CREATE INDEX IF NOT EXISTS idx_products_model ON products(model)');
        await db.run('CREATE INDEX IF NOT EXISTS idx_products_stock ON products(stock)');
        await db.run('CREATE INDEX IF NOT EXISTS idx_orders_phone ON orders(phone)');
        await db.run('CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)');
        await db.run('CREATE INDEX IF NOT EXISTS idx_invoices_phone ON invoices(customer_phone)');
        await db.run('CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status)');
        console.log('✅ Indexes created');
    } catch (error) {
        console.error('❌ Index creation error:', error.message);
    }
}

// ============================================================
// 🔍 SEARCH PRODUCTS - MULTI-COLUMN
// ============================================================

async function searchProducts(query, limit = 20) {
    try {
        const searchTerm = `%${query.trim()}%`;
        const sql = `
            SELECT 
                part, 
                description, 
                brand, 
                make,
                model,
                application,
                category,
                stock, 
                list_price, 
                billing_price, 
                mrp
            FROM products 
            WHERE part LIKE ? 
               OR description LIKE ? 
               OR brand LIKE ? 
               OR make LIKE ? 
               OR model LIKE ? 
               OR application LIKE ?
            ORDER BY 
                CASE 
                    WHEN part LIKE ? THEN 1
                    WHEN description LIKE ? THEN 2
                    WHEN brand LIKE ? THEN 3
                    WHEN make LIKE ? THEN 4
                    WHEN model LIKE ? THEN 5
                    ELSE 6
                END,
                stock DESC
            LIMIT ?
        `;
        
        const params = [
            searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm,
            searchTerm, searchTerm, searchTerm, searchTerm, searchTerm,
            parseInt(limit)
        ];

        const results = await new Promise((resolve, reject) => {
            db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });

        return results;

    } catch (error) {
        console.error('❌ Search error:', error.message);
        return [];
    }
}

// ============================================================
// 🔍 SEARCH BY VEHICLE
// ============================================================

async function searchByVehicle(query, limit = 20) {
    try {
        const searchTerm = `%${query.trim()}%`;
        const sql = `
            SELECT 
                part, 
                description, 
                brand, 
                make,
                model,
                application,
                stock, 
                list_price, 
                billing_price
            FROM products 
            WHERE make LIKE ? 
               OR model LIKE ? 
               OR application LIKE ?
            ORDER BY stock DESC
            LIMIT ?
        `;
        
        const params = [searchTerm, searchTerm, searchTerm, parseInt(limit)];

        const results = await new Promise((resolve, reject) => {
            db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });

        return results;

    } catch (error) {
        console.error('❌ Vehicle search error:', error.message);
        return [];
    }
}

// ============================================================
// 🔍 SEARCH DESCRIPTION ONLY
// ============================================================

async function searchDescriptionOnly(query, limit = 20) {
    try {
        const searchTerm = `%${query.trim()}%`;
        const sql = `
            SELECT 
                part, 
                description, 
                brand, 
                make,
                model,
                stock, 
                list_price, 
                billing_price
            FROM products 
            WHERE description LIKE ? 
               OR brand LIKE ? 
               OR make LIKE ? 
               OR model LIKE ?
            ORDER BY stock DESC
            LIMIT ?
        `;
        
        const params = [searchTerm, searchTerm, searchTerm, searchTerm, parseInt(limit)];

        const results = await new Promise((resolve, reject) => {
            db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });

        return results;

    } catch (error) {
        console.error('❌ Description search error:', error.message);
        return [];
    }
}

// ============================================================
// 🔍 GET PRODUCT EXACT
// ============================================================

async function getProductExact(part) {
    try {
        const product = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM products WHERE part = ?', [part], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
        return product;

    } catch (error) {
        console.error('❌ Get product error:', error.message);
        return null;
    }
}

// ============================================================
// 🔍 GET PRODUCT BY DESCRIPTION
// ============================================================

async function getProduct(part) {
    try {
        const product = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM products WHERE part LIKE ?', [`%${part}%`], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
        return product;

    } catch (error) {
        console.error('❌ Get product error:', error.message);
        return null;
    }
}

// ============================================================
// 📊 GET STATS
// ============================================================

async function getStats() {
    try {
        const stats = await new Promise((resolve, reject) => {
            db.get('SELECT COUNT(*) as total_products FROM products', (err, row) => {
                if (err) reject(err);
                else resolve(row || { total_products: 0 });
            });
        });
        return stats;

    } catch (error) {
        console.error('❌ Get stats error:', error.message);
        return { total_products: 0 };
    }
}

// ============================================================
// 👤 CUSTOMER FUNCTIONS
// ============================================================

async function getAllCustomers() {
    try {
        const customers = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM customers ORDER BY name ASC', (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
        return customers;

    } catch (error) {
        console.error('❌ Get customers error:', error.message);
        return [];
    }
}

async function getCustomerByPhone(phone) {
    try {
        const customer = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM customers WHERE phone = ?', [phone], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
        return customer;

    } catch (error) {
        console.error('❌ Get customer error:', error.message);
        return null;
    }
}

async function upsertCustomer(customer) {
    try {
        await new Promise((resolve, reject) => {
            db.run(`
                INSERT OR REPLACE INTO customers (
                    phone, name, email, address, gstin, state,
                    district, business, credit_limit, customer_code,
                    status, total_purchases, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `, [
                customer.phone,
                customer.name || '',
                customer.email || '',
                customer.address || '',
                customer.gstin || '',
                customer.state || '',
                customer.district || '',
                customer.business || '',
                customer.credit_limit || 50000,
                customer.customer_code || '',
                customer.status || 'active',
                customer.total_purchases || 0
            ], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        return true;

    } catch (error) {
        console.error('❌ Upsert customer error:', error.message);
        return false;
    }
}

// ============================================================
// 🛒 CART FUNCTIONS
// ============================================================

async function getCart(phone) {
    try {
        const cart = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM carts WHERE phone = ?', [phone], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
        return cart;

    } catch (error) {
        console.error('❌ Get cart error:', error.message);
        return null;
    }
}

async function saveCart(phone, items, total, originalTotal) {
    try {
        await new Promise((resolve, reject) => {
            db.run(`
                INSERT OR REPLACE INTO carts (phone, items, total, original_total, updated_at)
                VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            `, [phone, JSON.stringify(items), total, originalTotal], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        return true;

    } catch (error) {
        console.error('❌ Save cart error:', error.message);
        return false;
    }
}

async function clearCart(phone) {
    try {
        await new Promise((resolve, reject) => {
            db.run('DELETE FROM carts WHERE phone = ?', [phone], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        return true;

    } catch (error) {
        console.error('❌ Clear cart error:', error.message);
        return false;
    }
}

// ============================================================
// 📦 ORDER FUNCTIONS
// ============================================================

async function saveOrder(orderId, phone, items, total) {
    try {
        await new Promise((resolve, reject) => {
            db.run(`
                INSERT INTO orders (order_id, phone, items, total, status, created_at)
                VALUES (?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP)
            `, [orderId, phone, JSON.stringify(items), total], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        return orderId;

    } catch (error) {
        console.error('❌ Save order error:', error.message);
        return null;
    }
}

async function getOrder(orderId) {
    try {
        const order = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM orders WHERE order_id = ?', [orderId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
        return order;

    } catch (error) {
        console.error('❌ Get order error:', error.message);
        return null;
    }
}

async function updateOrderStatus(orderId, status) {
    try {
        await new Promise((resolve, reject) => {
            db.run('UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE order_id = ?', [status, orderId], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        return true;

    } catch (error) {
        console.error('❌ Update order status error:', error.message);
        return false;
    }
}

async function getPendingOrder() {
    try {
        const order = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM orders WHERE status = "pending" ORDER BY created_at DESC LIMIT 1', (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
        return order;

    } catch (error) {
        console.error('❌ Get pending order error:', error.message);
        return null;
    }
}

// ============================================================
// 🏭 SUPPLIER FUNCTIONS
// ============================================================

async function getAllSuppliers() {
    try {
        const suppliers = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM suppliers ORDER BY name ASC', (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
        return suppliers;

    } catch (error) {
        console.error('❌ Get suppliers error:', error.message);
        return [];
    }
}

async function getSupplierById(id) {
    try {
        const supplier = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM suppliers WHERE id = ?', [id], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
        return supplier;

    } catch (error) {
        console.error('❌ Get supplier error:', error.message);
        return null;
    }
}

// ============================================================
// 📦 EXPORTS
// ============================================================

module.exports = {
    db,
    initDatabase,
    searchProducts,
    searchByVehicle,
    searchDescriptionOnly,
    getProductExact,
    getProduct,
    getStats,
    getAllCustomers,
    getCustomerByPhone,
    upsertCustomer,
    getCart,
    saveCart,
    clearCart,
    saveOrder,
    getOrder,
    updateOrderStatus,
    getPendingOrder,
    getAllSuppliers,
    getSupplierById
};
