// ============================================================
// 🏢 SUPPLIER PORTAL - REGISTRATION & MANAGEMENT
// ============================================================

const { db, dbRun, dbGet, dbAll } = require('./database');

class SupplierPortal {
    async registerSupplier(phone, name, email = '', address = '', gstin = '') {
        try {
            const existing = await dbGet(`SELECT id FROM suppliers WHERE phone = ?`, [phone]);
            if (existing) return { success: false, message: 'Supplier already registered' };
            const result = await dbRun(
                `INSERT INTO suppliers (name, phone, email, address, gstin, status) VALUES (?, ?, ?, ?, ?, 'pending')`,
                [name, phone, email, address, gstin]
            );
            await dbRun(
                `INSERT INTO supplier_access (phone, supplier_id, access_level, can_upload_stock) VALUES (?, ?, 'basic', 1)`,
                [phone, result.lastID]
            );
            return { success: true, message: 'Supplier registered successfully', supplier_id: result.lastID };
        } catch (error) {
            console.error('❌ Register supplier error:', error.message);
            return { success: false, message: error.message };
        }
    }

    async checkAccess(phone) {
        try {
            const access = await dbGet(`
                SELECT sa.*, s.name as supplier_name, s.status as supplier_status
                FROM supplier_access sa JOIN suppliers s ON sa.supplier_id = s.id
                WHERE sa.phone = ? AND sa.status = 'active'`,
                [phone]
            );
            if (!access) return { hasAccess: false };
            return { hasAccess: true, supplier_id: access.supplier_id, supplier_name: access.supplier_name,
                     can_upload_stock: access.can_upload_stock === 1, access_level: access.access_level };
        } catch (error) {
            console.error('❌ Check access error:', error.message);
            return { hasAccess: false };
        }
    }
}

module.exports = new SupplierPortal();
