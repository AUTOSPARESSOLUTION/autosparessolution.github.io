// ============================================================
// 🗄️ DATABASE MODULE - COMPLETE FIXED VERSION
// modules/database.js
// ============================================================

const sqlite3 = require('sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../db/products.db');
const db = new sqlite3.Database(dbPath);

// ============================================================
// 🔧 SQLITE PROMISE HELPERS
// ============================================================

function dbRun(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) {
                reject(err);
                return;
            }

            resolve({
                lastID: this.lastID,
                changes: this.changes
            });
        });
    });
}

function dbGet(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) {
                reject(err);
                return;
            }

            resolve(row || null);
        });
    });
}

function dbAll(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) {
                reject(err);
                return;
            }

            resolve(rows || []);
        });
    });
}

// ============================================================
// 🚀 INIT DATABASE
// ============================================================

async function initDatabase() {

    try {

        // ====================================================
        // 📦 PRODUCTS TABLE
        // ====================================================

        await dbRun(`
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
        `);

        console.log('✅ Products table ready');


        // ====================================================
        // 👤 CUSTOMERS TABLE
        // ====================================================

        await dbRun(`
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
        `);

        console.log('✅ Customers table ready');


        // ====================================================
        // 🛒 CARTS TABLE
        // ====================================================

        await dbRun(`
            CREATE TABLE IF NOT EXISTS carts (
                phone TEXT PRIMARY KEY,
                items TEXT,
                total REAL DEFAULT 0,
                original_total REAL DEFAULT 0,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `);

        console.log('✅ Carts table ready');


        // ====================================================
        // 📦 ORDERS TABLE
        // ====================================================

        await dbRun(`
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
        `);

        console.log('✅ Orders table ready');


        // ====================================================
        // 🧾 INVOICES TABLE
        // ====================================================

        await dbRun(`
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
        `);

        console.log('✅ Invoices table ready');


        // ====================================================
        // 🏭 SUPPLIERS TABLE
        // ====================================================

        await dbRun(`
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
        `);

        console.log('✅ Suppliers table ready');


        // ====================================================
        // 💰 PAYMENT TABLES + MIGRATION
        // ====================================================

        await migratePaymentTables();


        // ====================================================
        // 📊 CREATE INDEXES
        // ====================================================

        await createIndexes();


        console.log('✅ Database initialized');

    } catch (error) {

        console.error(
            '❌ Init database error:',
            error.message
        );

        throw error;
    }
}


// ============================================================
// 🔧 PAYMENT TABLE MIGRATION
// ============================================================

async function migratePaymentTables() {

    try {

        console.log('🔧 Checking payment table schema...');


        // ====================================================
        // 💰 CUSTOMER PAYMENTS
        // ====================================================

        await dbRun(`
            CREATE TABLE IF NOT EXISTS customer_payments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                receipt_no TEXT UNIQUE,
                customer_phone TEXT,
                customer_email TEXT,
                amount REAL DEFAULT 0,
                payment_mode TEXT DEFAULT 'Cash',
                reference TEXT,
                remarks TEXT,
                payment_date TEXT DEFAULT CURRENT_TIMESTAMP,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `);

        console.log('✅ Customer payments table ready');


        // ====================================================
        // 💰 SUPPLIER PAYMENTS
        // ====================================================

        await dbRun(`
            CREATE TABLE IF NOT EXISTS supplier_payments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                payment_id TEXT UNIQUE,
                supplier_id INTEGER,
                amount REAL DEFAULT 0,
                payment_method TEXT DEFAULT 'Cash',
                payment_reference TEXT,
                payment_date TEXT DEFAULT CURRENT_TIMESTAMP,
                invoice_no TEXT,
                notes TEXT,
                status TEXT DEFAULT 'completed',
                created_by TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `);

        console.log('✅ Supplier payments table ready');


        // ====================================================
        // 🔍 CHECK SUPPLIER PAYMENT COLUMNS
        // ====================================================

        const columns = await dbAll(
            `PRAGMA table_info(supplier_payments)`
        );

        const existingColumns = columns.map(
            column => column.name
        );

        console.log(
            '📋 Existing supplier_payments columns:',
            existingColumns.join(', ')
        );


        // ====================================================
        // ➕ ADD MISSING SUPPLIER PAYMENT COLUMNS
        // ====================================================

        const requiredColumns = {

            payment_id:
                `ALTER TABLE supplier_payments
                 ADD COLUMN payment_id TEXT`,

            supplier_id:
                `ALTER TABLE supplier_payments
                 ADD COLUMN supplier_id INTEGER`,

            amount:
                `ALTER TABLE supplier_payments
                 ADD COLUMN amount REAL DEFAULT 0`,

            payment_method:
                `ALTER TABLE supplier_payments
                 ADD COLUMN payment_method TEXT DEFAULT 'Cash'`,

            payment_reference:
                `ALTER TABLE supplier_payments
                 ADD COLUMN payment_reference TEXT`,

            payment_date:
                `ALTER TABLE supplier_payments
                 ADD COLUMN payment_date TEXT`,

            invoice_no:
                `ALTER TABLE supplier_payments
                 ADD COLUMN invoice_no TEXT`,

            notes:
                `ALTER TABLE supplier_payments
                 ADD COLUMN notes TEXT`,

            status:
                `ALTER TABLE supplier_payments
                 ADD COLUMN status TEXT DEFAULT 'completed'`,

            created_by:
                `ALTER TABLE supplier_payments
                 ADD COLUMN created_by TEXT`,

            created_at:
                `ALTER TABLE supplier_payments
                 ADD COLUMN created_at TEXT`
        };


        for (const [columnName, alterSql]
            of Object.entries(requiredColumns)) {

            if (!existingColumns.includes(columnName)) {

                try {

                    await dbRun(alterSql);

                    console.log(
                        `✅ Added supplier_payments.${columnName}`
                    );

                } catch (error) {

                    // SQLite can report duplicate-column
                    // if another process added it meanwhile.
                    if (
                        !error.message
                            .toLowerCase()
                            .includes('duplicate column')
                    ) {
                        throw error;
                    }

                }
            }
        }


        // ====================================================
        // 🔍 CHECK CUSTOMER PAYMENT COLUMNS
        // ====================================================

        const customerColumns = await dbAll(
            `PRAGMA table_info(customer_payments)`
        );

        const existingCustomerColumns =
            customerColumns.map(column => column.name);

        console.log(
            '📋 Existing customer_payments columns:',
            existingCustomerColumns.join(', ')
        );


        // ====================================================
        // ➕ ADD MISSING CUSTOMER PAYMENT COLUMNS
        // ====================================================

        const requiredCustomerColumns = {

            receipt_no:
                `ALTER TABLE customer_payments
                 ADD COLUMN receipt_no TEXT`,

            customer_phone:
                `ALTER TABLE customer_payments
                 ADD COLUMN customer_phone TEXT`,

            customer_email:
                `ALTER TABLE customer_payments
                 ADD COLUMN customer_email TEXT`,

            amount:
                `ALTER TABLE customer_payments
                 ADD COLUMN amount REAL DEFAULT 0`,

            payment_mode:
                `ALTER TABLE customer_payments
                 ADD COLUMN payment_mode TEXT DEFAULT 'Cash'`,

            reference:
                `ALTER TABLE customer_payments
                 ADD COLUMN reference TEXT`,

            remarks:
                `ALTER TABLE customer_payments
                 ADD COLUMN remarks TEXT`,

            payment_date:
                `ALTER TABLE customer_payments
                 ADD COLUMN payment_date TEXT`,

            created_at:
                `ALTER TABLE customer_payments
                 ADD COLUMN created_at TEXT`
        };


        for (
            const [columnName, alterSql]
            of Object.entries(requiredCustomerColumns)
        ) {

            if (!existingCustomerColumns.includes(columnName)) {

                try {

                    await dbRun(alterSql);

                    console.log(
                        `✅ Added customer_payments.${columnName}`
                    );

                } catch (error) {

                    if (
                        !error.message
                            .toLowerCase()
                            .includes('duplicate column')
                    ) {
                        throw error;
                    }

                }
            }
        }


        console.log(
            '✅ Payment table migration completed'
        );

    } catch (error) {

        console.error(
            '❌ Payment table migration failed:',
            error.message
        );

        throw error;
    }
}


// ============================================================
// 📊 CREATE INDEXES
// ============================================================

async function createIndexes() {

    try {

        const indexes = [

            `
            CREATE INDEX IF NOT EXISTS idx_products_part
            ON products(part)
            `,

            `
            CREATE INDEX IF NOT EXISTS idx_products_brand
            ON products(brand)
            `,

            `
            CREATE INDEX IF NOT EXISTS idx_products_make
            ON products(make)
            `,

            `
            CREATE INDEX IF NOT EXISTS idx_products_model
            ON products(model)
            `,

            `
            CREATE INDEX IF NOT EXISTS idx_products_stock
            ON products(stock)
            `,

            `
            CREATE INDEX IF NOT EXISTS idx_orders_phone
            ON orders(phone)
            `,

            `
            CREATE INDEX IF NOT EXISTS idx_orders_status
            ON orders(status)
            `,

            `
            CREATE INDEX IF NOT EXISTS idx_invoices_phone
            ON invoices(customer_phone)
            `,

            `
            CREATE INDEX IF NOT EXISTS idx_invoices_status
            ON invoices(status)
            `,

            `
            CREATE INDEX IF NOT EXISTS idx_supplier_payments_supplier
            ON supplier_payments(supplier_id)
            `,

            `
            CREATE INDEX IF NOT EXISTS idx_supplier_payments_payment_id
            ON supplier_payments(payment_id)
            `,

            `
            CREATE INDEX IF NOT EXISTS idx_customer_payments_phone
            ON customer_payments(customer_phone)
            `,

            `
            CREATE INDEX IF NOT EXISTS idx_customer_payments_receipt
            ON customer_payments(receipt_no)
            `
        ];


        for (const sql of indexes) {
            await dbRun(sql);
        }

        console.log('✅ Indexes created');

    } catch (error) {

        console.error(
            '❌ Index creation error:',
            error.message
        );
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
            searchTerm,
            searchTerm,
            searchTerm,
            searchTerm,
            searchTerm,
            searchTerm,
            searchTerm,
            searchTerm,
            searchTerm,
            searchTerm,
            searchTerm,
            parseInt(limit)
        ];

        return await dbAll(sql, params);

    } catch (error) {

        console.error(
            '❌ Search error:',
            error.message
        );

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

        return await dbAll(
            sql,
            [
                searchTerm,
                searchTerm,
                searchTerm,
                parseInt(limit)
            ]
        );

    } catch (error) {

        console.error(
            '❌ Vehicle search error:',
            error.message
        );

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

        return await dbAll(
            sql,
            [
                searchTerm,
                searchTerm,
                searchTerm,
                searchTerm,
                parseInt(limit)
            ]
        );

    } catch (error) {

        console.error(
            '❌ Description search error:',
            error.message
        );

        return [];
    }
}


// ============================================================
// 🔍 GET PRODUCT EXACT
// ============================================================

async function getProductExact(part) {

    try {

        return await dbGet(
            'SELECT * FROM products WHERE part = ?',
            [part]
        );

    } catch (error) {

        console.error(
            '❌ Get product error:',
            error.message
        );

        return null;
    }
}


// ============================================================
// 🔍 GET PRODUCT
// ============================================================

async function getProduct(part) {

    try {

        return await dbGet(
            'SELECT * FROM products WHERE part LIKE ?',
            [`%${part}%`]
        );

    } catch (error) {

        console.error(
            '❌ Get product error:',
            error.message
        );

        return null;
    }
}


// ============================================================
// 📊 GET STATS
// ============================================================

async function getStats() {

    try {

        return await dbGet(
            'SELECT COUNT(*) as total_products FROM products'
        );

    } catch (error) {

        console.error(
            '❌ Get stats error:',
            error.message
        );

        return {
            total_products: 0
        };
    }
}


// ============================================================
// 👤 CUSTOMER FUNCTIONS
// ============================================================

async function getAllCustomers() {

    try {

        return await dbAll(
            'SELECT * FROM customers ORDER BY name ASC'
        );

    } catch (error) {

        console.error(
            '❌ Get customers error:',
            error.message
        );

        return [];
    }
}


async function getCustomerByPhone(phone) {

    try {

        return await dbGet(
            'SELECT * FROM customers WHERE phone = ?',
            [phone]
        );

    } catch (error) {

        console.error(
            '❌ Get customer error:',
            error.message
        );

        return null;
    }
}


async function upsertCustomer(customer) {

    try {

        await dbRun(
            `
            INSERT OR REPLACE INTO customers (
                phone,
                name,
                email,
                address,
                gstin,
                state,
                district,
                business,
                credit_limit,
                customer_code,
                status,
                total_purchases,
                updated_at
            )
            VALUES (
                ?, ?, ?, ?, ?, ?, ?, ?, ?,
                ?, ?, ?, CURRENT_TIMESTAMP
            )
            `,
            [
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
            ]
        );

        return true;

    } catch (error) {

        console.error(
            '❌ Upsert customer error:',
            error.message
        );

        return false;
    }
}


// ============================================================
// 🛒 CART FUNCTIONS
// ============================================================

async function getCart(phone) {

    try {

        return await dbGet(
            'SELECT * FROM carts WHERE phone = ?',
            [phone]
        );

    } catch (error) {

        console.error(
            '❌ Get cart error:',
            error.message
        );

        return null;
    }
}


async function saveCart(
    phone,
    items,
    total,
    originalTotal
) {

    try {

        await dbRun(
            `
            INSERT OR REPLACE INTO carts
            (
                phone,
                items,
                total,
                original_total,
                updated_at
            )
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            `,
            [
                phone,
                JSON.stringify(items),
                total,
                originalTotal
            ]
        );

        return true;

    } catch (error) {

        console.error(
            '❌ Save cart error:',
            error.message
        );

        return false;
    }
}


async function clearCart(phone) {

    try {

        await dbRun(
            'DELETE FROM carts WHERE phone = ?',
            [phone]
        );

        return true;

    } catch (error) {

        console.error(
            '❌ Clear cart error:',
            error.message
        );

        return false;
    }
}


// ============================================================
// 📦 ORDER FUNCTIONS
// ============================================================

async function saveOrder(
    orderId,
    phone,
    items,
    total
) {

    try {

        await dbRun(
            `
            INSERT INTO orders
            (
                order_id,
                phone,
                items,
                total,
                status,
                created_at
            )
            VALUES (?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP)
            `,
            [
                orderId,
                phone,
                JSON.stringify(items),
                total
            ]
        );

        return orderId;

    } catch (error) {

        console.error(
            '❌ Save order error:',
            error.message
        );

        return null;
    }
}


async function getOrder(orderId) {

    try {

        return await dbGet(
            'SELECT * FROM orders WHERE order_id = ?',
            [orderId]
        );

    } catch (error) {

        console.error(
            '❌ Get order error:',
            error.message
        );

        return null;
    }
}


async function updateOrderStatus(
    orderId,
    status
) {

    try {

        await dbRun(
            `
            UPDATE orders
            SET status = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE order_id = ?
            `,
            [
                status,
                orderId
            ]
        );

        return true;

    } catch (error) {

        console.error(
            '❌ Update order status error:',
            error.message
        );

        return false;
    }
}


async function getPendingOrder() {

    try {

        return await dbGet(
            `
            SELECT *
            FROM orders
            WHERE status = 'pending'
            ORDER BY created_at DESC
            LIMIT 1
            `
        );

    } catch (error) {

        console.error(
            '❌ Get pending order error:',
            error.message
        );

        return null;
    }
}


// ============================================================
// 🏭 SUPPLIER FUNCTIONS
// ============================================================

async function getAllSuppliers() {

    try {

        return await dbAll(
            'SELECT * FROM suppliers ORDER BY name ASC'
        );

    } catch (error) {

        console.error(
            '❌ Get suppliers error:',
            error.message
        );

        return [];
    }
}


async function getSupplierById(id) {

    try {

        return await dbGet(
            'SELECT * FROM suppliers WHERE id = ?',
            [id]
        );

    } catch (error) {

        console.error(
            '❌ Get supplier error:',
            error.message
        );

        return null;
    }
}


// ============================================================
// 💰 PAYMENT FUNCTIONS
// ============================================================

async function getCustomerPayments() {

    try {

        return await dbAll(
            `
            SELECT *
            FROM customer_payments
            ORDER BY payment_date DESC, id DESC
            `
        );

    } catch (error) {

        console.error(
            '❌ Get customer payments error:',
            error.message
        );

        return [];
    }
}


async function getSupplierPayments() {

    try {

        return await dbAll(
            `
            SELECT *
            FROM supplier_payments
            ORDER BY payment_date DESC, id DESC
            `
        );

    } catch (error) {

        console.error(
            '❌ Get supplier payments error:',
            error.message
        );

        return [];
    }
}


// ============================================================
// 📤 EXPORTS
// ============================================================

module.exports = {

    // Database
    db,
    dbRun,
    dbGet,
    dbAll,

    // Initialization
    initDatabase,
    migratePaymentTables,
    createIndexes,

    // Products
    searchProducts,
    searchByVehicle,
    searchDescriptionOnly,
    getProductExact,
    getProduct,
    getStats,

    // Customers
    getAllCustomers,
    getCustomerByPhone,
    upsertCustomer,

    // Cart
    getCart,
    saveCart,
    clearCart,

    // Orders
    saveOrder,
    getOrder,
    updateOrderStatus,
    getPendingOrder,

    // Suppliers
    getAllSuppliers,
    getSupplierById,

    // Payments
    getCustomerPayments,
    getSupplierPayments
};
