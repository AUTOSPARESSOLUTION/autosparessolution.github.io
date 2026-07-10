// ============================================================
// 📦 CSV LOADER - Robust Import
// ============================================================

const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const db = require('./database');

function readCSV(filepath) {
    return new Promise((resolve, reject) => {
        const products = [];
        const errors = [];
        let rowCount = 0;
        let duplicates = [];
        const seenParts = new Set();

        if (!fs.existsSync(filepath)) {
            reject(new Error(`CSV file not found: ${filepath}`));
            return;
        }

        console.log(`📖 Reading CSV: ${filepath}`);

        fs.createReadStream(filepath)
            .pipe(csv({
                skipLines: 0,
                strict: false,
                trim: true
            }))
            .on('headers', (headers) => {
                console.log(`📋 Headers: ${headers.join(', ')}`);
            })
            .on('data', (row) => {
                rowCount++;
                
                try {
                    const part = row['Material'] || 
                                row['material'] || 
                                row['Part No'] || 
                                row['Part'] || 
                                row['PART'] || 
                                '';
                    
                    if (!part || part.trim() === '') return;

                    const cleanPart = part.trim();
                    
                    if (seenParts.has(cleanPart.toUpperCase())) {
                        duplicates.push(cleanPart);
                        return;
                    }
                    seenParts.add(cleanPart.toUpperCase());

                    const product = {
                        part: cleanPart,
                        description: row['Material2'] || row['Description'] || 'Auto Spare Part',
                        brand: row['brand'] || row['Brand'] || 'Unknown',
                        make: row['Make'] || row['make'] || '',
                        type: row['TYPE'] || row['Type'] || '',
                        finish: row['FINISH'] || row['Finish'] || '',
                        list_price: parseFloat(row['LIST PRICE'] || row['List Price'] || 0) || 0,
                        mrp: parseFloat(row['MRP PRICE'] || row['MRP Price'] || 0) || 0,
                        billing_price: parseFloat(row['billing price'] || row['Billing Price'] || 0) || 0,
                        stock: parseInt(row['STOCK'] || row['Stock'] || 0) || 0,
                        box_qty: parseInt(row['Box Qty'] || 0) || 0,
                        carton: parseInt(row['Carton'] || 0) || 0,
                        model: row['Model'] || row['model'] || '',
                        year_start: row['Year Start'] || '',
                        year_end: row['Year End'] || '',
                        segment: row['Segment'] || '',
                        hsn: row['HSN'] || row['hsn'] || '',
                        gst: 18,
                        most_selling: row['most_selling'] === '1' || row['Most Selling'] === '1'
                    };

                    if (product.billing_price === 0) {
                        product.billing_price = product.list_price;
                    }

                    products.push(product);

                } catch (err) {
                    errors.push({ row: rowCount, error: err.message });
                }
            })
            .on('end', () => {
                console.log(`📊 CSV Import Summary:`);
                console.log(`   Total rows: ${rowCount}`);
                console.log(`   Products: ${products.length}`);
                console.log(`   Duplicates: ${duplicates.length}`);
                console.log(`   Errors: ${errors.length}`);
                
                resolve({ products, duplicates, errors, totalRows: rowCount, totalProducts: products.length });
            })
            .on('error', (error) => {
                console.error('❌ CSV read error:', error.message);
                reject(error);
            });
    });
}

async function importCSV(filepath) {
    const startTime = Date.now();
    console.log(`📥 Starting CSV import from: ${filepath}`);

    try {
        const result = await readCSV(filepath);
        
        if (result.products.length === 0) {
            console.warn('⚠️ No products to import');
            return {
                success: false,
                imported: 0,
                total: 0,
                duplicates: result.duplicates.length,
                errors: result.errors.length
            };
        }

        await db.clearProducts();
        console.log('🗑️ Cleared existing products');

        const importResult = await db.importProducts(result.products);
        console.log(`✅ Imported ${importResult.imported} products`);

        await db.logImport(
            path.basename(filepath),
            result.totalProducts,
            importResult.imported,
            result.duplicates.length,
            result.duplicates.length,
            result.errors.length
        );

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`⏱️ Import completed in ${duration}s`);

        return {
            success: true,
            imported: importResult.imported,
            total: result.totalProducts,
            duplicates: result.duplicates.length,
            errors: result.errors.length,
            duration: duration
        };

    } catch (error) {
        console.error('❌ Import failed:', error.message);
        throw error;
    }
}

module.exports = { importCSV, readCSV };
