// ============================================================
// 📥 CSV LOADER - FIXED VERSION (No this.pause error)
// modules/csv-loader.js
// ============================================================

const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

// ============================================================
// 🔧 SQLITE OPTIMIZATION PRAGMAS
// ============================================================

async function optimizeSQLite(db) {
    const pragmas = [
        'PRAGMA journal_mode=WAL;',
        'PRAGMA synchronous=OFF;',
        'PRAGMA temp_store=MEMORY;',
        'PRAGMA cache_size=-50000;',
        'PRAGMA page_size=4096;',
        'PRAGMA mmap_size=30000000000;'
    ];
    
    for (const pragma of pragmas) {
        await new Promise((resolve, reject) => {
            db.db.run(pragma, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }
    console.log('✅ SQLite optimized for import');
}

// ============================================================
// 📦 INSERT BATCH - WITH TRANSACTION
// ============================================================

async function insertBatch(db, batch) {
    if (!batch || batch.length === 0) return;
    
    const placeholders = batch.map(() => '(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').join(',');
    const values = [];

    for (const p of batch) {
        values.push(
            p.part,
            p.description,
            p.brand,
            p.make,
            p.model,
            p.application,
            p.category,
            p.hsn,
            p.stock,
            p.list_price,
            p.billing_price,
            p.mrp,
            p.gst,
            p.box_qty,
            p.carton,
            p.segment,
            p.region,
            p.zone,
            new Date().toISOString()
        );
    }

    const sql = `
        INSERT OR REPLACE INTO products (
            part, description, brand, make, model, application,
            category, hsn, stock, list_price, billing_price, mrp,
            gst, box_qty, carton, segment, region, zone, updated_at
        ) VALUES ${placeholders}
    `;

    // Use transaction per batch
    await new Promise((resolve, reject) => {
        db.db.run('BEGIN TRANSACTION', (err) => {
            if (err) reject(err);
            else resolve();
        });
    });

    try {
        await new Promise((resolve, reject) => {
            db.db.run(sql, values, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        await new Promise((resolve, reject) => {
            db.db.run('COMMIT', (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    } catch (err) {
        await new Promise((resolve) => {
            db.db.run('ROLLBACK', () => resolve());
        });
        throw err;
    }
}

// ============================================================
// 📥 IMPORT CSV - FIXED VERSION
// ============================================================

async function importCSV(filePath) {
    const startTime = Date.now();
    const BATCH_SIZE = 1000;
    
    return new Promise((resolve, reject) => {
        let totalRows = 0;
        let duplicates = 0;
        let errors = 0;
        let inserted = 0;
        
        const seenParts = new Set();
        const batch = [];
        let isPaused = false;
        let streamPaused = false;
        
        console.log(`📥 Starting optimized CSV import from: ${filePath}`);

        const db = require('./database');
        
        // Optimize SQLite
        optimizeSQLite(db).then(() => {
            console.log('✅ SQLite optimized');
        }).catch(err => {
            console.warn('⚠️ SQLite optimization warning:', err.message);
        });

        let lastLogTime = Date.now();
        
        // ✅ FIX: Use function declaration (not arrow) to preserve `this`
        const parser = fs.createReadStream(filePath)
            .pipe(csv())
            .on('data', function(row) {  // ✅ Regular function, not arrow
                totalRows++;
                
                try {
                    const part = String(row['Material'] || '').trim().toUpperCase();
                    if (!part) return;

                    if (seenParts.has(part)) {
                        duplicates++;
                        return;
                    }
                    seenParts.add(part);

                    const listPrice = parseFloat(row['LIST PRICE']) || 0;
                    const mrpPrice = parseFloat(row['MRP PRICE']) || 0;
                    const billingPrice = parseFloat(row['billing price']) || 0;
                    const stock = parseInt(row['STOCK']) || 0;
                    const boxQty = parseInt(row['Box Qty']) || 0;
                    const carton = parseInt(row['Carton']) || 0;

                    const product = {
                        part: part,
                        description: String(row['Material2'] || '').trim(),
                        brand: String(row['brand'] || '').trim(),
                        make: String(row['Make'] || '').trim(),
                        model: String(row['Model'] || '').trim(),
                        application: String(row['Model'] || '').trim(),
                        category: String(row['Product Sub Group'] || '').trim(),
                        hsn: String(row['hsn'] || '').trim(),
                        stock: stock,
                        list_price: listPrice,
                        billing_price: billingPrice,
                        mrp: mrpPrice,
                        gst: 18,
                        box_qty: boxQty,
                        carton: carton,
                        segment: String(row['Segment'] || '').trim(),
                        region: String(row['region'] || '').trim(),
                        zone: String(row['zone'] || '').trim()
                    };

                    batch.push(product);

                    // ✅ FIX: Use proper this reference for pause/resume
                    if (batch.length >= BATCH_SIZE && !streamPaused) {
                        streamPaused = true;
                        this.pause();  // ✅ this works now
                        
                        // Insert batch
                        insertBatch(db, [...batch])
                            .then(() => {
                                inserted += batch.length;
                                batch.length = 0;
                                
                                const now = Date.now();
                                if (now - lastLogTime > 5000) {
                                    console.log(`📦 Imported ${inserted} products`);
                                    lastLogTime = now;
                                }
                                
                                streamPaused = false;
                                this.resume();  // ✅ this works now
                            })
                            .catch((err) => {
                                console.error(`❌ Batch insert error: ${err.message}`);
                                errors++;
                                streamPaused = false;
                                this.resume();
                            });
                    }
                    
                } catch (error) {
                    errors++;
                    console.error(`❌ Error processing row: ${error.message}`);
                }
            })
            .on('end', async () => {
                // Insert remaining products
                if (batch.length > 0) {
                    try {
                        await insertBatch(db, batch);
                        inserted += batch.length;
                    } catch (err) {
                        console.error(`❌ Final batch insert error: ${err.message}`);
                        errors++;
                    }
                }
                
                console.log(`📊 CSV Import Summary:`);
                console.log(`   Total rows: ${totalRows}`);
                console.log(`   Products imported: ${inserted}`);
                console.log(`   Duplicates skipped: ${duplicates}`);
                console.log(`   Errors: ${errors}`);
                console.log(`   ⏱️ Import completed in ${(Date.now() - startTime) / 1000}s`);
                
                resolve({ imported: inserted, duplicates, errors });
            })
            .on('error', (error) => {
                console.error(`❌ CSV read error: ${error.message}`);
                reject(error);
            });
    });
}

// ============================================================
// 📥 STREAMING IMPORT - ALTERNATIVE (Even faster)
// ============================================================

async function importCSVStreaming(filePath) {
    const startTime = Date.now();
    const BATCH_SIZE = 2000;
    
    console.log(`📥 Starting streaming CSV import from: ${filePath}`);
    
    const db = require('./database');
    await optimizeSQLite(db);
    
    // Clear existing products
    await new Promise((resolve, reject) => {
        db.db.run('DELETE FROM products', (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
    console.log('🗑️ Cleared existing products');
    
    let totalRows = 0;
    let inserted = 0;
    let duplicates = 0;
    let errors = 0;
    const seenParts = new Set();
    let batch = [];
    
    const stream = fs.createReadStream(filePath)
        .pipe(csv());
    
    // Process stream in chunks
    for await (const row of stream) {
        totalRows++;
        
        try {
            const part = String(row['Material'] || '').trim().toUpperCase();
            if (!part) continue;
            
            if (seenParts.has(part)) {
                duplicates++;
                continue;
            }
            seenParts.add(part);
            
            batch.push({
                part: part,
                description: String(row['Material2'] || '').trim(),
                brand: String(row['brand'] || '').trim(),
                make: String(row['Make'] || '').trim(),
                model: String(row['Model'] || '').trim(),
                application: String(row['Model'] || '').trim(),
                category: String(row['Product Sub Group'] || '').trim(),
                hsn: String(row['hsn'] || '').trim(),
                stock: parseInt(row['STOCK']) || 0,
                list_price: parseFloat(row['LIST PRICE']) || 0,
                billing_price: parseFloat(row['billing price']) || 0,
                mrp: parseFloat(row['MRP PRICE']) || 0,
                gst: 18,
                box_qty: parseInt(row['Box Qty']) || 0,
                carton: parseInt(row['Carton']) || 0,
                segment: String(row['Segment'] || '').trim(),
                region: String(row['region'] || '').trim(),
                zone: String(row['zone'] || '').trim()
            });
            
            if (batch.length >= BATCH_SIZE) {
                await insertBatch(db, batch);
                inserted += batch.length;
                batch = [];
                console.log(`📦 Imported ${inserted} products`);
            }
            
        } catch (err) {
            errors++;
            console.error(`❌ Row error: ${err.message}`);
        }
    }
    
    // Final batch
    if (batch.length > 0) {
        await insertBatch(db, batch);
        inserted += batch.length;
    }
    
    console.log(`📊 Import Summary:`);
    console.log(`   Total rows: ${totalRows}`);
    console.log(`   Products: ${inserted}`);
    console.log(`   Duplicates: ${duplicates}`);
    console.log(`   Errors: ${errors}`);
    console.log(`   ⏱️ Time: ${(Date.now() - startTime) / 1000}s`);
    
    return { imported: inserted, duplicates, errors };
}

module.exports = { importCSV, importCSVStreaming, optimizeSQLite };
