// ============================================================
// 7️⃣ IMPORT CUSTOMER PAYMENTS - FINAL VERSION (IMPROVED)
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
    // Small helpers: normalize phone and parse amounts
    // --------------------------------------------------------
    function normalizePhoneForKey(phone) {
        const digits = String(phone || '').replace(/\D/g, '');
        if (!digits) return '';
        // Use last 10 digits (handles +91 and other prefixes)
        return digits.length > 10 ? digits.slice(-10) : digits;
    }

    function parseAmount(raw) {
        if (raw === null || raw === undefined) return NaN;
        // Remove common grouping/currency characters but keep digits, minus and dot
        const cleaned = String(raw).replace(/[^\d.\-]/g, '');
        return cleaned === '' ? NaN : Number.parseFloat(cleaned);
    }

    function safeString(val) {
        return val === null || val === undefined ? '' : String(val).trim();
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
    // Build lookup maps (email -> storedPhone, normalizedPhoneKey -> storedPhone)
    // --------------------------------------------------------
    const emailMap = new Map();
    const phoneMap = new Map();

    for (const customer of allCustomers) {
        const storedPhone = safeString(customer.phone);
        if (customer.email) {
            emailMap.set(
                safeString(customer.email).toLowerCase(),
                storedPhone
            );
        }

        if (storedPhone) {
            const key = normalizePhoneForKey(storedPhone);
            if (key) {
                // store the original stored phone string as the value
                phoneMap.set(key, storedPhone);
            }
        }
    }

    // --------------------------------------------------------
    // Precompute whether customers table supports total_spent
    // --------------------------------------------------------
    const customerColumns = await dbAll(`PRAGMA table_info(customers)`);
    const customerColumnNames = customerColumns.map(row => row.name);
    const supportsTotalSpent = customerColumnNames.includes('total_spent');

    // --------------------------------------------------------
    // Transaction: BEGIN
    // --------------------------------------------------------
    await dbRun('BEGIN TRANSACTION');

    let fatalError = false;
    try {
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
                // Read possible JSON field names (safe)
                // ------------------------------------------------
                const customerEmail = safeString(
                    payment.customerEmail ||
                    payment.customer_email ||
                    payment.email ||
                    ''
                ).toLowerCase();

                const rawPhone =
                    payment.customerPhone ||
                    payment.customer_phone ||
                    payment.phone ||
                    payment.mobile ||
                    '';

                const amount = parseAmount(payment.amount);

                const paymentMode = safeString(
                    payment.paymentMode ||
                    payment.payment_mode ||
                    payment.mode ||
                    'Cash'
                );

                const reference = safeString(
                    payment.reference ||
                    payment.ref ||
                    payment.paymentReference ||
                    payment.payment_reference ||
                    ''
                );

                const remarks = safeString(
                    payment.remarks ||
                    payment.note ||
                    payment.notes ||
                    ''
                );

                const receiptNo = safeString(
                    payment.receiptNo ||
                    payment.receipt_no ||
                    payment.receipt ||
                    `CP-${Date.now()}-${i + 1}`
                );

                const paymentDate =
                    payment.paymentDate ||
                    payment.payment_date ||
                    payment.date ||
                    new Date().toISOString();

                console.log(
                    `📋 Customer Payment ${i + 1}/${payments.length}: ` +
                    `receipt=${receiptNo}, email=${customerEmail || 'N/A'}, amount=${amount}`
                );

                // ------------------------------------------------
                // Validate amount
                // ------------------------------------------------
                if (!Number.isFinite(amount) || amount <= 0) {
                    console.log(
                        `⚠️ Skipping ${receiptNo}: invalid amount (${String(payment.amount)})`
                    );
                    console.log('   Payment payload:', JSON.stringify(payment));
                    skipped++;
                    continue;
                }

                // ------------------------------------------------
                // Find customer
                // Priority:
                // 1. Email
                // 2. Phone
                // ------------------------------------------------
                let storedCustomerPhone = null;

                if (customerEmail) {
                    storedCustomerPhone = emailMap.get(customerEmail) || null;
                }

                if (!storedCustomerPhone && rawPhone) {
                    const searchKey = normalizePhoneForKey(rawPhone);
                    const mapped = phoneMap.get(searchKey);
                    storedCustomerPhone = mapped || (searchKey ? rawPhone : null);
                }

                // ------------------------------------------------
                // If customer still not found, skip.
                // ------------------------------------------------
                if (!storedCustomerPhone) {
                    console.log(
                        `⚠️ Customer not found for payment ${receiptNo}: ` +
                        `${customerEmail || rawPhone || 'NO EMAIL/PHONE'}. Payment payload: ${JSON.stringify(payment)}`
                    );
                    skipped++;
                    continue;
                }

                const cleanPhone = normalizePhoneForKey(storedCustomerPhone);
                if (!cleanPhone) {
                    console.log(
                        `⚠️ Invalid customer phone after normalization for ${receiptNo}. Payment payload: ${JSON.stringify(payment)}`
                    );
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

                // Do the insert with per-row error handling so one bad row doesn't abort the batch
                try {
                    await dbRun(
                        `INSERT INTO customer_payments
                         (${fields.join(', ')})
                         VALUES (${placeholders})`,
                        values
                    );
                } catch (sqlErr) {
                    errors++;
                    console.error(`❌ Insert failed for receipt ${receiptNo}:`, sqlErr && sqlErr.stack ? sqlErr.stack : sqlErr);
                    console.error('   SQL:', `INSERT INTO customer_payments (${fields.join(', ')}) VALUES (${placeholders})`);
                    console.error('   Values:', values);
                    // continue to next payment (do not abort whole batch)
                    continue;
                }

                // ------------------------------------------------
                // Update customer total_spent ONLY if column exists
                // Use storedCustomerPhone (the original phone string from DB) to match the row
                // ------------------------------------------------
                if (supportsTotalSpent) {
                    try {
                        await dbRun(
                            `UPDATE customers
                             SET total_spent =
                                 COALESCE(total_spent, 0) + ?
                             WHERE phone = ?`,
                            [amount, storedCustomerPhone]
                        );
                    } catch (uErr) {
                        // Log but continue — do not abort entire batch
                        errors++;
                        console.error(`❌ Failed to update total_spent for ${storedCustomerPhone}:`, uErr && uErr.stack ? uErr.stack : uErr);
                        console.error('   Values:', [amount, storedCustomerPhone]);
                    }
                }

                imported++;

                if ((imported + skipped + errors) % 50 === 0) {
                    console.log(`📈 Progress: imported=${imported}, skipped=${skipped}, errors=${errors}`);
                }

                console.log(
                    `✅ Imported customer payment ` +
                    `${i + 1}/${payments.length}: ` +
                    `${receiptNo} - ₹${amount}`
                );

            } catch (err) {
                // Row-level unexpected error — log and continue
                errors++;
                console.error(`❌ Customer payment ${i + 1} processing failed:`, err && err.stack ? err.stack : err);
                console.error('   Payment payload:', JSON.stringify(payment));
            }
        }
    } catch (outerErr) {
        // Fatal error during processing (outside per-row handling)
        fatalError = true;
        console.error('💥 Fatal error while importing payments batch:', outerErr && outerErr.stack ? outerErr.stack : outerErr);
    } finally {
        // Commit or rollback depending on fatalError
        try {
            if (!fatalError) {
                await dbRun('COMMIT');
            } else {
                await dbRun('ROLLBACK');
            }
        } catch (txErr) {
            console.error('❌ Transaction finalization failed:', txErr && txErr.stack ? txErr.stack : txErr);
        }
    }

    console.log(`\n📊 Customer Payments Summary:`);
    console.log(`   ✅ Imported: ${imported}`);
    console.log(`   ⏭️ Skipped: ${skipped}`);
    console.log(`   ❌ Errors: ${errors}`);

    return imported;
}
