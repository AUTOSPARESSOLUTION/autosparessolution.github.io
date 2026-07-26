// ============================================================
// 📥 CSV LOADER - COMPLETE FIXED VERSION
// modules/csv-loader.js
// ============================================================

const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

// ============================================================
// 📥 IMPORT CSV
// ============================================================

async function importCSV(filePath) {
    const startTime = Date.now();
    
    return new Promise((resolve, reject) => {
        const products = [];
        let totalRows = 0;
        let duplicates = 0;
        let errors = 0;

        console.log(`📥 Starting CSV import from: ${filePath}`);

        fs.createReadStream(filePath)
            .pipe(csv())
            .on('data', (row) => {
                totalRows++;
                try {
                    // ============================================================
                    // 🔧 CORRECT COLUMN MAPPING
                    // ============================================================
                    const part = String(row['Material'] || '').trim().toUpperCase();
                    if (!part) return;

                    // Check for duplicate
                    if (products.find(p => p.part === part)) {
                        duplicates++;
                        return;
                    }

                    // ✅ FIX: Map all columns correctly
                    const listPrice = parseFloat(row['LIST PRICE']) || 0;
                    const mrpPrice = parseFloat(row['MRP PRICE']) || 0;
                    const billingPrice = parseFloat(row['billing price']) || 0;

                    const product = {
                        part: part,
                        description: String(row['Material2'] || '').trim(),
                        brand: String(row['brand'] || '').trim(),
                        make: String(row['Make'] || '').trim(),
                        model: String(row['Model'] || '').trim(),
                        application: String(row['Model'] || '').trim(),
                        category: String(row['Product Sub Group'] || '').trim(),
                        hsn: String(row['hsn'] || '').trim(),
                        stock: parseInt(row['STOCK']) || 0,
                        list_price: listPrice,
                        billing_price: billingPrice,
                        mrp: mrpPrice,
                        gst: 18,
                        box_qty: parseInt(row['Box Qty']) || 0,
                        carton: parseInt(row['Carton']) || 0,
                        segment: String(row['Segment'] || '').trim(),
                        region: String(row['region'] || '').trim(),
                        zone: String(row['zone'] || '').trim()
                    };

                    products.push(product);

                } catch (error) {
                    errors++;
                    console.error(`❌ Error processing row: ${error.message}`);
                }
            })
            .on('end', async () => {
                console.log(`📊 CSV Import Summary:`);
                console.log(`   Total rows: ${totalRows}`);
                console.log(`   Products: ${products.length}`);
                console.log(`   Duplicates: ${duplicates}`);
                console.log(`   Errors: ${errors}`);

                try {
                    // Clear existing products
                    const db = require('./database');
                    await new Promise((resolve, reject) => {
                        db.db.run('DELETE FROM products', (err) => {
                            if (err) reject(err);
                            else resolve();
                        });
                    });
                    console.log('🗑️ Cleared existing products');

                    // Insert products in batches
                    const batchSize = 500;
                    let inserted = 0;

                    for (let i = 0; i < products.length; i += batchSize) {
                        const batch = products.slice(i, i + batchSize);
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

                        await new Promise((resolve, reject) => {
                            db.db.run(sql, values, (err) => {
                                if (err) reject(err);
                                else resolve();
                            });
                        });

                        inserted += batch.length;
                        console.log(`📦 Imported ${inserted}/${products.length} products`);
                    }

                    console.log(`✅ Imported ${products.length} products`);
                    console.log(`⏱️ Import completed in ${(Date.now() - startTime) / 1000}s`);

                    resolve({ imported: products.length, duplicates, errors });

                } catch (error) {
                    console.error(`❌ Import error: ${error.message}`);
                    reject(error);
                }
            })
            .on('error', (error) => {
                console.error(`❌ CSV read error: ${error.message}`);
                reject(error);
            });
    });
}

module.exports = { importCSV };
