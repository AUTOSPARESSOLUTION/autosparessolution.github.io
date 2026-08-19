// ============================================================
// 7️⃣ IMPORT CUSTOMER PAYMENTS - FINAL VERSION
// ============================================================
async function importCustomerPaymentsArray(payments) {
    let imported = 0;
    let errors = 0;
    let skipped = 0;

    console.log(
        `💰 Importing ${Array.isArray(payments) ? payments.length : 0} customer payments...`
    );

    if (!Array.isArray(payments) || payments.length === 0) {
        console.log(`⚠️ No customer payments to import`);
        return 0;
    }

    // ============================================================
    // HELPER: Promise wrapper for db.db.run()
    // ============================================================
    function dbRun(sql, params = []) {
        return new Promise((resolve, reject) => {
            db.db.run(sql, params, function(err) {
                if (err) reject(err);
                else resolve({ lastID: this.lastID, changes: this.changes });
            });
        });
    }

    // ============================================================
    // HELPER: Promise wrapper for db.db.get()
    // ============================================================
    function dbGet(sql, params = []) {
        return new Promise((resolve, reject) => {
            db.db.get(sql, params, (err, row) => {
                if (err) reject(err);
                else resolve(row || null);
            });
        });
    }

    // ============================================================
    // HELPER: Promise wrapper for db.db.all()
    // ============================================================
    function dbAll(sql, params = []) {
        return new Promise((resolve, reject) => {
            db.db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
    }

    // --------------------------------------------------------
    // Ensure required table exists
    // --------------------------------------------------------
    await dbRun(`
        CREATE TABLE IF NOT EXISTS customer_payments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            receipt_no TEXT UNIQUE NOT NULL,
            customer_phone TEXT NOT NULL,
            customer_email TEXT,
            amount REAL NOT NULL,
            payment_mode TEXT NOT NULL,
            reference TEXT,
            remarks TEXT,
            payment_date TEXT DEFAULT CURRENT_TIMESTAMP,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // --------------------------------------------------------
    // Check actual table columns
    // --------------------------------------------------------
    const customerPaymentColumns = await dbAll(`PRAGMA table_info(customer_payments)`);
    const availableColumns = customerPaymentColumns.map(row => row.name);

    console.log(
        `📋 customer_payments columns: ${availableColumns.join(', ')}`
    );

    // --------------------------------------------------------
    // Get customers once
    // --------------------------------------------------------
    const allCustomers = await dbAll(`
        SELECT phone, name, email
        FROM customers
    `);

    console.log(
        `📋 Found ${allCustomers.length} customers for payment lookup`
    );

    // --------------------------------------------------------
    // Build lookup maps
    // --------------------------------------------------------
    const emailMap = new Map();
    const phoneMap = new Map();

    for (const customer of allCustomers) {
        if (customer.email) {
            emailMap.set(
                customer.email.toString().trim().toLowerCase(),
                customer.phone
            );
        }

        if (customer.phone) {
            const cleanPhone = customer.phone
                .toString()
                .replace(/\D/g, '');

            if (cleanPhone) {
                phoneMap.set(cleanPhone, customer.phone);
            }
        }
    }

    // --------------------------------------------------------
    // Process sequentially
    // --------------------------------------------------------
    for (let i = 0; i < payments.length; i++) {
        const payment = payments[i];

        try {
            if (!payment || typeof payment !== 'object') {
                skipped++;
                continue;
            }

            // ------------------------------------------------
            // Read possible JSON field names
            // ------------------------------------------------
            const customerEmail = String(
                payment.customerEmail ||
                payment.customer_email ||
                payment.email ||
                ''
            ).trim();

            const rawPhone =
                payment.customerPhone ||
                payment.customer_phone ||
                payment.phone ||
                payment.mobile ||
                '';

            const amount = Number.parseFloat(payment.amount);

            const paymentMode = String(
                payment.paymentMode ||
                payment.payment_mode ||
                payment.mode ||
                'Cash'
            ).trim();

            const reference = String(
                payment.reference ||
                payment.ref ||
                payment.paymentReference ||
                payment.payment_reference ||
                ''
            ).trim();

            const remarks = String(
                payment.remarks ||
                payment.note ||
                payment.notes ||
                ''
            ).trim();

            const receiptNo = String(
                payment.receiptNo ||
                payment.receipt_no ||
                payment.receipt ||
                `CP-${Date.now()}-${i + 1}`
            ).trim();

            const paymentDate =
                payment.paymentDate ||
                payment.payment_date ||
                payment.date ||
                new Date().toISOString();

            console.log(
                `📋 Customer Payment ${i + 1}/${payments.length}: ` +
                `receipt=${receiptNo}, email=${customerEmail}, amount=${amount}`
            );

            // ------------------------------------------------
            // Validate amount
            // ------------------------------------------------
            if (!Number.isFinite(amount) || amount <= 0) {
                console.log(
                    `⚠️ Skipping ${receiptNo}: invalid amount`
                );
                skipped++;
                continue;
            }

            // ------------------------------------------------
            // Find customer
            // Priority:
            // 1. Email
            // 2. Phone
            // ------------------------------------------------
            let customerPhone = null;

            if (customerEmail) {
                customerPhone =
                    emailMap.get(customerEmail.toLowerCase()) || null;
            }

            if (!customerPhone && rawPhone) {
                const cleanPhone = rawPhone
                    .toString()
                    .replace(/\D/g, '');

                customerPhone =
                    phoneMap.get(cleanPhone) || cleanPhone;
            }

            // ------------------------------------------------
            // If customer still not found, skip.
            // ------------------------------------------------
            if (!customerPhone) {
                console.log(
                    `⚠️ Customer not found for payment ${receiptNo}: ` +
                    `${customerEmail || rawPhone || 'NO EMAIL/PHONE'}`
                );

                skipped++;
                continue;
            }

            const cleanPhone = customerPhone
                .toString()
                .replace(/\D/g, '');

            if (!cleanPhone) {
                skipped++;
                continue;
            }

            // ------------------------------------------------
            // Check duplicate receipt
            // ------------------------------------------------
            const existing = await dbGet(
                `SELECT id
                 FROM customer_payments
                 WHERE receipt_no = ?
                 LIMIT 1`,
                [receiptNo]
            );

            if (existing) {
                console.log(
                    `ℹ️ Customer payment already exists: ${receiptNo}`
                );
                skipped++;
                continue;
            }

            // ------------------------------------------------
            // Build INSERT based on ACTUAL columns
            // ------------------------------------------------
            const fields = [
                'receipt_no',
                'customer_phone',
                'amount',
                'payment_mode'
            ];

            const values = [
                receiptNo,
                cleanPhone,
                amount,
                paymentMode
            ];

            if (availableColumns.includes('customer_email')) {
                fields.push('customer_email');
                values.push(customerEmail);
            }

            if (availableColumns.includes('reference')) {
                fields.push('reference');
                values.push(reference);
            }

            if (availableColumns.includes('remarks')) {
                fields.push('remarks');
                values.push(remarks);
            }

            if (availableColumns.includes('payment_date')) {
                fields.push('payment_date');
                values.push(paymentDate);
            }

            if (availableColumns.includes('created_at')) {
                fields.push('created_at');
                values.push(new Date().toISOString());
            }

            const placeholders = fields.map(() => '?').join(', ');

            await dbRun(
                `INSERT INTO customer_payments
                 (${fields.join(', ')})
                 VALUES (${placeholders})`,
                values
            );

            // ------------------------------------------------
            // Update customer total_spent ONLY if column exists
            // ------------------------------------------------
            const customerColumns = await dbAll(
                `PRAGMA table_info(customers)`
            );

            const customerColumnNames =
                customerColumns.map(row => row.name);

            if (customerColumnNames.includes('total_spent')) {
                await dbRun(
                    `UPDATE customers
                     SET total_spent =
                         COALESCE(total_spent, 0) + ?
                     WHERE phone = ?`,
                    [amount, cleanPhone]
                );
            }

            imported++;

            console.log(
                `✅ Imported customer payment ` +
                `${i + 1}/${payments.length}: ` +
                `${receiptNo} - ₹${amount}`
            );

        } catch (err) {
            errors++;

            console.error(
                `❌ Customer payment ${i + 1} failed:`,
                err.message
            );
        }
    }

    console.log(`\n📊 Customer Payments Summary:`);
    console.log(`   ✅ Imported: ${imported}`);
    console.log(`   ⏭️ Skipped: ${skipped}`);
    console.log(`   ❌ Errors: ${errors}`);

    return imported;
}