// ============================================================
// 📦 DATABASE MODULE - Single Source of Truth
// ============================================================

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbDir = path.join(__dirname, '..', 'db');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const DB_PATH = process.env.DB_PATH || path.join(dbDir, 'products.db');
const db = new sqlite3.Database(DB_PATH);

db.run('PRAGMA journal_mode = WAL');
db.run('PRAGMA synchronous = NORMAL');
db.run('PRAGMA temp_store = MEMORY');
db.run('PRAGMA cache_size = 10000');

function cleanPartNumber(part) {
    if (!part) return '';
    return part.replace(/[\s\-\.\/]/g, '').toUpperCase().trim();
}

function initDatabase() {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            // PRODUCTS TABLE
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
            `);

            // CUSTOMERS TABLE
            db.run(`
                CREATE TABLE IF NOT EXISTS customers (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    phone TEXT UNIQUE,
                    name TEXT,
                    email TEXT,
                    address TEXT,
                    gstin TEXT,
                    state TEXT,
                    district TEXT,
                    business TEXT,
                    credit_limit REAL DEFAULT 50000,
                    customer_code TEXT UNIQUE,
                    status TEXT DEFAULT 'active',
                    total_purchases REAL DEFAULT 0,
                    outstanding REAL DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // SUPPLIERS TABLE
            db.run(`
                CREATE TABLE IF NOT EXISTS suppliers (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    email TEXT,
                    phone TEXT,
                    contact_person TEXT,
                    address TEXT,
                    lat REAL DEFAULT 0,
                    lng REAL DEFAULT 0,
                    gstin TEXT,
                    state TEXT,
                    brands TEXT,
                    part_prefixes TEXT,
                    status TEXT DEFAULT 'active',
                    outstanding REAL DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // VENDOR STATUS TABLE
            db.run(`
                CREATE TABLE IF NOT EXISTS vendor_status (
                    supplier_id TEXT PRIMARY KEY,
                    confirmed BOOLEAN DEFAULT 0,
                    active BOOLEAN DEFAULT 0,
                    confirmed_at DATETIME,
                    rejected_at DATETIME,
                    added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
                )
            `);

            // ORDERS TABLE
            db.run(`
                CREATE TABLE IF NOT EXISTS orders (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    order_id TEXT UNIQUE NOT NULL,
                    phone TEXT NOT NULL,
                    items TEXT,
                    total REAL DEFAULT 0,
                    delivery_type TEXT DEFAULT 'takeaway',
                    delivery_address TEXT,
                    delivery_charges REAL DEFAULT 0,
                    delivery_partner TEXT,
                    status TEXT DEFAULT 'pending',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // INVOICES TABLE
            db.run(`
                CREATE TABLE IF NOT EXISTS invoices (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    invoice_no TEXT UNIQUE NOT NULL,
                    order_id TEXT,
                    phone TEXT,
                    items TEXT,
                    total REAL DEFAULT 0,
                    gst REAL DEFAULT 0,
                    type TEXT DEFAULT 'cash',
                    status TEXT DEFAULT 'paid',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (order_id) REFERENCES orders(order_id)
                )
            `);

            // PURCHASE INVOICES TABLE
            db.run(`
                CREATE TABLE IF NOT EXISTS purchase_invoices (
                    id TEXT PRIMARY KEY,
                    invoice_no TEXT,
                    supplier_id TEXT,
                    supplier_name TEXT,
                    items TEXT,
                    total REAL DEFAULT 0,
                    gst REAL DEFAULT 0,
                    grand_total REAL DEFAULT 0,
                    date TEXT,
                    status TEXT DEFAULT 'completed',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
                )
            `);

            // STOCK LEDGER TABLE
            db.run(`
                CREATE TABLE IF NOT EXISTS stock_ledger (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    sku TEXT NOT NULL,
                    product_name TEXT,
                    transaction_type TEXT NOT NULL,
                    in_qty REAL DEFAULT 0,
                    out_qty REAL DEFAULT 0,
                    balance REAL DEFAULT 0,
                    reference TEXT,
                    order_id TEXT,
                    invoice_no TEXT,
                    supplier_id TEXT,
                    metadata TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
                )
            `);

            // SUPPLIER PAYMENTS TABLE
            db.run(`
                CREATE TABLE IF NOT EXISTS supplier_payments (
                    id TEXT PRIMARY KEY,
                    receipt_no TEXT UNIQUE,
                    supplier_id TEXT,
                    supplier_name TEXT,
                    date TEXT,
                    amount REAL DEFAULT 0,
                    mode TEXT,
                    reference TEXT,
                    remarks TEXT,
                    image_id TEXT,
                    status TEXT DEFAULT 'completed',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
                )
            `);

            // CUSTOMER PAYMENTS TABLE
            db.run(`
                CREATE TABLE IF NOT EXISTS customer_payments (
                    id TEXT PRIMARY KEY,
                    receipt_no TEXT UNIQUE,
                    customer_phone TEXT,
                    customer_name TEXT,
                    date TEXT,
                    amount REAL DEFAULT 0,
                    mode TEXT,
                    reference TEXT,
                    remarks TEXT,
                    image_id TEXT,
                    status TEXT DEFAULT 'completed',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (customer_phone) REFERENCES customers(phone)
                )
            `);

            // PAYMENT LEDGER TABLE
            db.run(`
                CREATE TABLE IF NOT EXISTS payment_ledger (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    party_type TEXT NOT NULL,
                    party_id TEXT NOT NULL,
                    party_name TEXT,
                    date TEXT,
                    type TEXT,
                    ref_no TEXT,
                    debit REAL DEFAULT 0,
                    credit REAL DEFAULT 0,
                    balance REAL DEFAULT 0,
                    mode TEXT,
                    remarks TEXT,
                    image_id TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // RECEIPT SEQUENCES TABLE
            db.run(`
                CREATE TABLE IF NOT EXISTS receipt_sequences (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    type TEXT UNIQUE,
                    prefix TEXT,
                    sequence INTEGER DEFAULT 0,
                    financial_year TEXT,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // SUPPLIER ENQUIRIES TABLE
            db.run(`
                CREATE TABLE IF NOT EXISTS supplier_enquiries (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    order_id TEXT NOT NULL,
                    supplier_id TEXT NOT NULL,
                    items TEXT,
                    status TEXT DEFAULT 'pending',
                    sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    replied_at DATETIME,
                    reply_status TEXT,
                    FOREIGN KEY (order_id) REFERENCES orders(order_id),
                    FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
                )
            `);

            // CUSTOMER LOG TABLE
            db.run(`
                CREATE TABLE IF NOT EXISTS customer_log (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    phone TEXT NOT NULL,
                    enquiry_type TEXT,
                    enquiry_text TEXT,
                    media_id TEXT,
                    response_text TEXT,
                    products_found TEXT,
                    status TEXT DEFAULT 'pending',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    metadata TEXT
                )
            `);

            // PICKUP POINTS TABLE
            db.run(`
                CREATE TABLE IF NOT EXISTS pickup_points (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    address TEXT,
                    lat REAL DEFAULT 0,
                    lng REAL DEFAULT 0,
                    contact TEXT,
                    is_default BOOLEAN DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // CALENDAR OFFERS TABLE
            db.run(`
                CREATE TABLE IF NOT EXISTS calendar_offers (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    event_id TEXT UNIQUE,
                    name TEXT,
                    date TEXT,
                    icon TEXT,
                    discount REAL DEFAULT 0,
                    category TEXT,
                    description TEXT,
                    message TEXT,
                    applicable_parts TEXT,
                    is_active BOOLEAN DEFAULT 1,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // NOTIFICATION LOG TABLE
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

            // OUT OF STOCK TRACKING TABLE
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

            // CART TABLE
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

            // IMPORT HISTORY TABLE
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

            // CREATE INDEXES
            const indexes = [
                'CREATE INDEX IF NOT EXISTS idx_products_part ON products(part)',
                'CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand)',
                'CREATE INDEX IF NOT EXISTS idx_products_make ON products(make)',
                'CREATE INDEX IF NOT EXISTS idx_products_description ON products(description)',
                'CREATE INDEX IF NOT EXISTS idx_products_stock ON products(stock)',
                'CREATE INDEX IF NOT EXISTS idx_products_model ON products(model)',
                'CREATE INDEX IF NOT EXISTS idx_products_type ON products(type)',
                'CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone)',
                'CREATE INDEX IF NOT EXISTS idx_orders_phone ON orders(phone)',
                'CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)',
                'CREATE INDEX IF NOT EXISTS idx_invoices_order_id ON invoices(order_id)',
                'CREATE INDEX IF NOT EXISTS idx_stock_ledger_sku ON stock_ledger(sku)',
                'CREATE INDEX IF NOT EXISTS idx_supplier_enquiries_order ON supplier_enquiries(order_id)',
                'CREATE INDEX IF NOT EXISTS idx_supplier_enquiries_status ON supplier_enquiries(status)',
                'CREATE INDEX IF NOT EXISTS idx_purchase_invoices_supplier ON purchase_invoices(supplier_id)',
                'CREATE INDEX IF NOT EXISTS idx_notifications_phone ON notification_log(phone)',
                'CREATE INDEX IF NOT EXISTS idx_tracking_phone ON out_of_stock_tracking(phone)',
                'CREATE INDEX IF NOT EXISTS idx_tracking_part ON out_of_stock_tracking(part)',
                'CREATE INDEX IF NOT EXISTS idx_customer_log_phone ON customer_log(phone)'
            ];

            for (const sql of indexes) {
                db.run(sql);
            }

            resolve();
        });
    });
}

// ============================================================
// PRODUCT FUNCTIONS
// ============================================================

function searchProducts(query, limit = 20) {
    return new Promise((resolve, reject) => {
        const clean = query.trim();
        if (clean.length < 2) { resolve([]); return; }
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
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
}

function getProductExact(part) {
    return new Promise((resolve, reject) => {
        const clean = part.trim().toUpperCase();
        if (!clean || clean.length < 2) { resolve(null); return; }
        db.get('SELECT * FROM products WHERE UPPER(part) = UPPER(?)', [clean], (err, row) => {
            if (err) reject(err);
            else resolve(row || null);
        });
    });
}

function getProduct(part) {
    return new Promise((resolve, reject) => {
        const clean = part.trim();
        if (!clean || clean.length < 2) { resolve(null); return; }
        const cleanPart = cleanPartNumber(clean);
        db.get(
            `SELECT * FROM products WHERE UPPER(part) = UPPER(?) OR UPPER(part) = UPPER(?) OR UPPER(part) LIKE UPPER(?) OR UPPER(part) LIKE UPPER(?) LIMIT 1`,
            [clean, cleanPart, `%${cleanPart}%`, `%${clean}%`],
            (err, row) => {
                if (err) reject(err);
                else resolve(row || null);
            }
        );
    });
}

function getAllProducts(limit = 500) {
    return new Promise((resolve, reject) => {
        db.all('SELECT * FROM products LIMIT ?', [limit], (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
}

function getStats() {
    return new Promise((resolve, reject) => {
        db.get(`
            SELECT COUNT(*) as total_products,
                   SUM(CASE WHEN stock > 0 THEN 1 ELSE 0 END) as in_stock,
                   SUM(CASE WHEN stock = 0 THEN 1 ELSE 0 END) as out_of_stock,
                   SUM(stock) as total_stock
            FROM products
        `, (err, row) => {
            if (err) reject(err);
            else resolve(row || { total_products: 0, in_stock: 0, out_of_stock: 0, total_stock: 0 });
        });
    });
}

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
            let imported = 0, errors = 0;
            for (const p of products) {
                try {
                    stmt.run(
                        p.part, p.description || '', p.brand || 'Unknown', p.make || '',
                        p.type || '', p.finish || '', p.list_price || 0, p.mrp || 0,
                        p.billing_price || 0, p.stock || 0, p.box_qty || 0, p.carton || 0,
                        p.model || '', p.year_start || '', p.year_end || '', p.segment || '',
                        p.hsn || '', p.gst || 18, p.most_selling ? 1 : 0
                    );
                    imported++;
                } catch (err) { errors++; }
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
// CUSTOMER FUNCTIONS
// ============================================================

function getAllCustomers() {
    return new Promise((resolve, reject) => {
        db.all(`
            SELECT id, phone, name, email, address, gstin, state,
                   district, business, credit_limit as creditLimit,
                   customer_code as customerCode, status,
                   total_purchases as totalPurchased,
                   outstanding,
                   created_at as createdAt, updated_at as updatedAt
            FROM customers ORDER BY name ASC
        `, (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
}

function getCustomerByPhone(phone) {
    return new Promise((resolve, reject) => {
        const cleanPhone = phone.replace(/\D/g, '');
        db.get(`
            SELECT id, phone, name, email, address, gstin, state,
                   district, business, credit_limit as creditLimit,
                   customer_code as customerCode, status,
                   total_purchases as totalPurchased,
                   outstanding,
                   created_at as createdAt, updated_at as updatedAt
            FROM customers WHERE phone = ?
        `, [cleanPhone], (err, row) => {
            if (err) reject(err);
            else resolve(row || null);
        });
    });
}

function upsertCustomer(customerData) {
    return new Promise((resolve, reject) => {
        const { phone, name, email, address, gstin, state, district, business, creditLimit, status, customerCode } = customerData;
        const cleanPhone = phone.replace(/\D/g, '');
        if (!cleanPhone || cleanPhone.length < 10) {
            reject(new Error('Invalid phone number'));
            return;
        }

        db.run(`
            INSERT INTO customers (
                phone, name, email, address, gstin, state,
                district, business, credit_limit, customer_code,
                status, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(phone) DO UPDATE SET
                name = COALESCE(?, name),
                email = COALESCE(?, email),
                address = COALESCE(?, address),
                gstin = COALESCE(?, gstin),
                state = COALESCE(?, state),
                district = COALESCE(?, district),
                business = COALESCE(?, business),
                credit_limit = COALESCE(?, credit_limit),
                customer_code = COALESCE(?, customer_code),
                status = COALESCE(?, status),
                updated_at = CURRENT_TIMESTAMP
        `, [
            cleanPhone, name, email, address, gstin, state,
            district, business, creditLimit || 50000,
            customerCode || `CUST${String(Date.now()).slice(-6)}`,
            status || 'active',
            name, email, address, gstin, state,
            district, business, creditLimit || null,
            customerCode || null, status || null
        ], function(err) {
            if (err) reject(err);
            else resolve({
                id: this.lastID || null,
                phone: cleanPhone,
                name: name || '',
                email: email || '',
                address: address || '',
                gstin: gstin || '',
                state: state || '',
                district: district || '',
                business: business || '',
                creditLimit: creditLimit || 50000,
                status: status || 'active',
                customerCode: customerCode || `CUST${String(Date.now()).slice(-6)}`
            });
        });
    });
}

function updateCustomerPurchase(phone, amount) {
    return new Promise((resolve, reject) => {
        const cleanPhone = phone.replace(/\D/g, '');
        db.run(`
            UPDATE customers 
            SET total_purchases = total_purchases + ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE phone = ?
        `, [amount, cleanPhone], (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

function getCustomerInvoices(phone, limit = 50) {
    return new Promise((resolve, reject) => {
        const cleanPhone = phone.replace(/\D/g, '');
        db.all(`
            SELECT order_id as orderId, items, total, status,
                   created_at as createdAt, updated_at as updatedAt
            FROM orders WHERE phone = ? ORDER BY created_at DESC LIMIT ?
        `, [cleanPhone, limit], (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
}

// ============================================================
// SUPPLIER FUNCTIONS
// ============================================================

function getAllSuppliers() {
    return new Promise((resolve, reject) => {
        db.all(`
            SELECT * FROM suppliers ORDER BY name ASC
        `, (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
}

function getSupplierById(id) {
    return new Promise((resolve, reject) => {
        db.get(`SELECT * FROM suppliers WHERE id = ?`, [id], (err, row) => {
            if (err) reject(err);
            else resolve(row || null);
        });
    });
}

function getSupplierByName(name) {
    return new Promise((resolve, reject) => {
        db.get(`SELECT * FROM suppliers WHERE name = ?`, [name], (err, row) => {
            if (err) reject(err);
            else resolve(row || null);
        });
    });
}

function upsertSupplier(supplierData) {
    return new Promise((resolve, reject) => {
        const { id, name, email, phone, contact_person, address, lat, lng, gstin, state, brands, part_prefixes, status } = supplierData;
        
        db.run(`
            INSERT INTO suppliers (
                id, name, email, phone, contact_person, address, lat, lng,
                gstin, state, brands, part_prefixes, status, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(id) DO UPDATE SET
                name = COALESCE(?, name),
                email = COALESCE(?, email),
                phone = COALESCE(?, phone),
                contact_person = COALESCE(?, contact_person),
                address = COALESCE(?, address),
                lat = COALESCE(?, lat),
                lng = COALESCE(?, lng),
                gstin = COALESCE(?, gstin),
                state = COALESCE(?, state),
                brands = COALESCE(?, brands),
                part_prefixes = COALESCE(?, part_prefixes),
                status = COALESCE(?, status),
                updated_at = CURRENT_TIMESTAMP
        `, [
            id, name, email, phone, contact_person, address, lat, lng,
            gstin, state, brands, part_prefixes, status || 'active',
            name, email, phone, contact_person, address, lat, lng,
            gstin, state, brands, part_prefixes, status || null
        ], function(err) {
            if (err) reject(err);
            else resolve({ id: id, name: name });
        });
    });
}

function createSupplier(supplierData) {
    return new Promise((resolve, reject) => {
        const { name, phone, email, address, gstin, state } = supplierData;
        const id = `SUP${String(Date.now()).slice(-6)}`;
        db.run(`
            INSERT INTO suppliers (id, name, phone, email, address, gstin, state, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `, [id, name, phone, email, address, gstin, state], function(err) {
            if (err) reject(err);
            else resolve(id);
        });
    });
}

function updateSupplierOutstanding(supplierId, amount) {
    return new Promise((resolve, reject) => {
        db.run(`
            UPDATE suppliers 
            SET outstanding = COALESCE(outstanding, 0) + ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [amount, supplierId], (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

// ============================================================
// VENDOR STATUS FUNCTIONS
// ============================================================

function getAllVendorStatus() {
    return new Promise((resolve, reject) => {
        db.all('SELECT * FROM vendor_status', (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
}

function updateVendorStatus(supplierId, confirmed, active) {
    return new Promise((resolve, reject) => {
        db.run(`
            INSERT INTO vendor_status (supplier_id, confirmed, active, confirmed_at)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(supplier_id) DO UPDATE SET
                confirmed = ?,
                active = ?,
                confirmed_at = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE confirmed_at END
        `, [supplierId, confirmed, active, confirmed, active, confirmed], (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

function getActiveVendors() {
    return new Promise((resolve, reject) => {
        db.all(`
            SELECT s.*, v.confirmed, v.active, v.confirmed_at
            FROM suppliers s
            JOIN vendor_status v ON s.id = v.supplier_id
            WHERE v.active = 1 AND v.confirmed = 1
        `, (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
}

// ============================================================
// ORDER FUNCTIONS
// ============================================================

function saveOrder(orderId, phone, items, total) {
    return new Promise((resolve, reject) => {
        db.run(`
            INSERT INTO orders (order_id, phone, items, total, status)
            VALUES (?, ?, ?, ?, 'pending')
        `, [orderId, phone, JSON.stringify(items), total], (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

function getOrder(orderId) {
    return new Promise((resolve, reject) => {
        db.get(`SELECT * FROM orders WHERE order_id = ?`, [orderId], (err, row) => {
            if (err) reject(err);
            else resolve(row || null);
        });
    });
}

function getPendingOrder() {
    return new Promise((resolve, reject) => {
        db.get(`SELECT * FROM orders WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1`, (err, row) => {
            if (err) reject(err);
            else resolve(row || null);
        });
    });
}

function getPendingOrderByPhone(phone) {
    return new Promise((resolve, reject) => {
        db.get(`SELECT * FROM orders WHERE phone = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 1`, [phone], (err, row) => {
            if (err) reject(err);
            else resolve(row || null);
        });
    });
}

function getOrdersByPhone(phone) {
    return new Promise((resolve, reject) => {
        db.all(`SELECT * FROM orders WHERE phone = ? ORDER BY created_at DESC`, [phone], (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
}

function getPendingOrders() {
    return new Promise((resolve, reject) => {
        db.all(`SELECT * FROM orders WHERE status = 'pending' ORDER BY created_at ASC`, (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
}

function updateOrderStatus(orderId, status) {
    return new Promise((resolve, reject) => {
        db.run(`UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE order_id = ?`, [status, orderId], (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

function updateOrderItems(orderId, items, total) {
    return new Promise((resolve, reject) => {
        db.run(`UPDATE orders SET items = ?, total = ?, updated_at = CURRENT_TIMESTAMP WHERE order_id = ?`, [JSON.stringify(items), total, orderId], (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

function updateOrderDeliveryType(orderId, deliveryType) {
    return new Promise((resolve, reject) => {
        db.run(`UPDATE orders SET delivery_type = ?, updated_at = CURRENT_TIMESTAMP WHERE order_id = ?`, [deliveryType, orderId], (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

function updateOrderDeliveryAddress(orderId, address) {
    return new Promise((resolve, reject) => {
        db.run(`UPDATE orders SET delivery_address = ?, updated_at = CURRENT_TIMESTAMP WHERE order_id = ?`, [address, orderId], (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

function updateOrderDeliveryCharges(orderId, charges) {
    return new Promise((resolve, reject) => {
        db.run(`UPDATE orders SET delivery_charges = ?, updated_at = CURRENT_TIMESTAMP WHERE order_id = ?`, [charges, orderId], (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

function updateOrderTotal(orderId, total) {
    return new Promise((resolve, reject) => {
        db.run(`UPDATE orders SET total = ?, updated_at = CURRENT_TIMESTAMP WHERE order_id = ?`, [total, orderId], (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

function getFinalizedOrderByPhone(phone) {
    return new Promise((resolve, reject) => {
        const sql = `SELECT * FROM orders WHERE phone = ? AND status = 'finalized' ORDER BY created_at DESC LIMIT 1`;
        db.get(sql, [phone], (err, row) => {
            if (err) reject(err);
            else resolve(row || null);
        });
    });
}

function getCompletedOrderByPhone(phone) {
    return new Promise((resolve, reject) => {
        const sql = `SELECT * FROM orders WHERE phone = ? AND status = 'completed' ORDER BY created_at DESC LIMIT 1`;
        db.get(sql, [phone], (err, row) => {
            if (err) reject(err);
            else resolve(row || null);
        });
    });
}

function getAllOrders() {
    return new Promise((resolve, reject) => {
        db.all(`SELECT * FROM orders ORDER BY created_at DESC LIMIT 200`, (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
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
// PURCHASE INVOICE FUNCTIONS
// ============================================================

function savePurchaseInvoice(purchaseInvoice) {
    return new Promise((resolve, reject) => {
        db.run(`
            INSERT INTO purchase_invoices (
                id, invoice_no, supplier_id, supplier_name, items, total, gst, grand_total, date, status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `, [
            purchaseInvoice.id,
            purchaseInvoice.invoiceNo,
            purchaseInvoice.supplierId,
            purchaseInvoice.supplier,
            JSON.stringify(purchaseInvoice.items),
            purchaseInvoice.total,
            purchaseInvoice.gst || 0,
            purchaseInvoice.grandTotal || purchaseInvoice.total,
            purchaseInvoice.date || new Date().toISOString().split('T')[0],
            purchaseInvoice.status || 'completed'
        ], (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

function getAllPurchaseInvoices() {
    return new Promise((resolve, reject) => {
        db.all('SELECT * FROM purchase_invoices ORDER BY created_at DESC', (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
}

function getPurchaseInvoicesBySupplier(supplierId) {
    return new Promise((resolve, reject) => {
        db.all('SELECT * FROM purchase_invoices WHERE supplier_id = ? ORDER BY created_at DESC', [supplierId], (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
}

// ============================================================
// STOCK LEDGER FUNCTIONS
// ============================================================

function recordStockTransaction(transactionData) {
    return new Promise((resolve, reject) => {
        const { sku, productName, transactionType, inQty, outQty, reference, orderId, invoiceNo, supplierId, metadata } = transactionData;
        
        getStockBalance(sku)
            .then(currentBalance => {
                const newBalance = currentBalance + (inQty || 0) - (outQty || 0);
                db.run(`
                    INSERT INTO stock_ledger (
                        sku, product_name, transaction_type,
                        in_qty, out_qty, balance, reference, order_id,
                        invoice_no, supplier_id, metadata, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                `, [
                    sku,
                    productName || '',
                    transactionType,
                    inQty || 0,
                    outQty || 0,
                    newBalance,
                    reference || '',
                    orderId || '',
                    invoiceNo || '',
                    supplierId || '',
                    metadata ? JSON.stringify(metadata) : null
                ], function(err) {
                    if (err) reject(err);
                    else resolve({ id: this.lastID, sku: sku, balance: newBalance });
                });
            })
            .catch(reject);
    });
}

function getStockBalance(sku) {
    return new Promise((resolve, reject) => {
        db.get(`SELECT balance FROM stock_ledger WHERE sku = ? ORDER BY created_at DESC LIMIT 1`, [sku], (err, row) => {
            if (err) reject(err);
            else resolve(row ? row.balance : 0);
        });
    });
}

function getStockLedger(sku, limit = 100) {
    return new Promise((resolve, reject) => {
        db.all(`SELECT * FROM stock_ledger WHERE sku = ? ORDER BY created_at DESC LIMIT ?`, [sku, limit], (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
}

function getAllStockLedger(limit = 200) {
    return new Promise((resolve, reject) => {
        db.all(`SELECT * FROM stock_ledger ORDER BY created_at DESC LIMIT ?`, [limit], (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
}

// ============================================================
// INVOICE FUNCTIONS
// ============================================================

function saveInvoice(invoiceData) {
    return new Promise((resolve, reject) => {
        db.run(`
            INSERT INTO invoices (
                invoice_no, order_id, phone, items, total, gst, type, status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `, [
            invoiceData.invoice_no,
            invoiceData.order_id || '',
            invoiceData.phone || '',
            JSON.stringify(invoiceData.items || []),
            invoiceData.total || 0,
            invoiceData.gst || 0,
            invoiceData.type || 'cash',
            invoiceData.status || 'paid'
        ], (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

function getInvoiceByNo(invoiceNo) {
    return new Promise((resolve, reject) => {
        db.get(`SELECT * FROM invoices WHERE invoice_no = ?`, [invoiceNo], (err, row) => {
            if (err) reject(err);
            else resolve(row || null);
        });
    });
}

function getInvoicesByPhone(phone) {
    return new Promise((resolve, reject) => {
        db.all(`SELECT * FROM invoices WHERE phone = ? ORDER BY created_at DESC`, [phone], (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
}

function getAllInvoices() {
    return new Promise((resolve, reject) => {
        db.all(`SELECT * FROM invoices ORDER BY created_at DESC LIMIT 200`, (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
}

// ============================================================
// EXPORT
// ============================================================

module.exports = {
    db,
    initDatabase,
    cleanPartNumber,
    searchProducts,
    getProductExact,
    getProduct,
    getAllProducts,
    getStats,
    clearProducts,
    importProducts,
    getAllCustomers,
    getCustomerByPhone,
    upsertCustomer,
    updateCustomerPurchase,
    getCustomerInvoices,
    getAllSuppliers,
    getSupplierById,
    getSupplierByName,
    upsertSupplier,
    createSupplier,
    updateSupplierOutstanding,
    getAllVendorStatus,
    updateVendorStatus,
    getActiveVendors,
    saveOrder,
    getOrder,
    getPendingOrder,
    getPendingOrderByPhone,
    getOrdersByPhone,
    getPendingOrders,
    updateOrderStatus,
    updateOrderItems,
    updateOrderDeliveryType,
    updateOrderDeliveryAddress,
    updateOrderDeliveryCharges,
    updateOrderTotal,
    getFinalizedOrderByPhone,
    getCompletedOrderByPhone,
    getAllOrders,
    saveCart,
    getCart,
    clearCart,
    savePurchaseInvoice,
    getAllPurchaseInvoices,
    getPurchaseInvoicesBySupplier,
    recordStockTransaction,
    getStockBalance,
    getStockLedger,
    getAllStockLedger,
    saveInvoice,
    getInvoiceByNo,
    getInvoicesByPhone,
    getAllInvoices
};
