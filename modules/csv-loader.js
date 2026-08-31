// ============================================================
// 📥 CSV LOADER - CONCURRENCY SAFE VERSION
// modules/csv-loader.js
// ============================================================

const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { LRUCache } = require('lru-cache');

// ============================================================
// 🔒 TRANSACTION QUEUE MANAGER
// ============================================================

class TransactionQueue {
    constructor() {
        this.queue = [];
        this.isProcessing = false;
        this.currentOperation = null;
        this.transactionActive = false;
        this.savepointCounter = 0;
        this.processingLock = false;
    }

    /**
     * Add operation to queue and process sequentially
     */
    async enqueue(operation, name = 'unknown') {
        return new Promise((resolve, reject) => {
            this.queue.push({
                operation,
                name,
                resolve,
                reject
            });
            
            console.log(`📋 Queued: ${name} (Queue length: ${this.queue.length})`);
            this.processQueue();
        });
    }

    /**
     * Process queue sequentially - ONE AT A TIME
     */
    async processQueue() {
        // Prevent multiple simultaneous processing
        if (this.processingLock) {
            console.log(`⏳ Queue already processing, waiting...`);
            return;
        }

        if (this.queue.length === 0) {
            this.isProcessing = false;
            return;
        }

        this.processingLock = true;
        this.isProcessing = true;

        const task = this.queue[0];
        this.currentOperation = task.name;
        
        console.log(`🔓 Processing: ${task.name} (${this.queue.length - 1} remaining)`);

        try {
            // Begin transaction
            await this.beginTransaction(task.name);
            
            // Execute operation
            const result = await task.operation();
            
            // Commit transaction
            await this.commitTransaction(task.name);
            
            // Resolve with result
            task.resolve(result);
            
        } catch (error) {
            console.error(`❌ Operation failed: ${task.name}`, error.message);
            
            try {
                await this.rollbackTransaction(task.name);
            } catch (rollbackError) {
                console.error(`⚠️ Rollback failed:`, rollbackError.message);
            }
            
            task.reject(error);
        } finally {
            // Remove completed task
            this.queue.shift();
            this.currentOperation = null;
            this.processingLock = false;
            
            // Process next in queue
            setImmediate(() => this.processQueue());
        }
    }

    async beginTransaction(name) {
        if (this.transactionActive) {
            // Use savepoint for nested operations
            const spName = `sp_${this.savepointCounter++}`;
            await new Promise((resolve, reject) => {
                const db = require('./database');
                db.db.run(`SAVEPOINT ${spName}`, (err) => {
                    if (err) reject(err);
                    else {
                        console.log(`📌 SAVEPOINT created: ${spName} for ${name}`);
                        resolve();
                    }
                });
            });
            return spName;
        }
        
        // Start main transaction
        this.transactionActive = true;
        await new Promise((resolve, reject) => {
            const db = require('./database');
            db.db.run('BEGIN TRANSACTION', (err) => {
                if (err) reject(err);
                else {
                    console.log(`🔓 BEGIN TRANSACTION: ${name}`);
                    resolve();
                }
            });
        });
        return null;
    }

    async commitTransaction(name, savepoint = null) {
        if (savepoint) {
            await new Promise((resolve, reject) => {
                const db = require('./database');
                db.db.run(`RELEASE SAVEPOINT ${savepoint}`, (err) => {
                    if (err) reject(err);
                    else {
                        console.log(`📌 RELEASE SAVEPOINT: ${savepoint}`);
                        resolve();
                    }
                });
            });
            return;
        }

        if (this.transactionActive) {
            await new Promise((resolve, reject) => {
                const db = require('./database');
                db.db.run('COMMIT', (err) => {
                    if (err) reject(err);
                    else {
                        console.log(`✅ COMMIT: ${name}`);
                        resolve();
                    }
                });
            });
            this.transactionActive = false;
        }
    }

    async rollbackTransaction(name, savepoint = null) {
        if (savepoint) {
            await new Promise((resolve, reject) => {
                const db = require('./database');
                db.db.run(`ROLLBACK TO SAVEPOINT ${savepoint}`, (err) => {
                    if (err) reject(err);
                    else {
                        console.log(`↩️ ROLLBACK SAVEPOINT: ${savepoint}`);
                        resolve();
                    }
                });
            });
            return;
        }

        if (this.transactionActive) {
            await new Promise((resolve, reject) => {
                const db = require('./database');
                db.db.run('ROLLBACK', (err) => {
                    if (err) reject(err);
                    else {
                        console.log(`↩️ ROLLBACK: ${name}`);
                        resolve();
                    }
                });
            });
            this.transactionActive = false;
        }
    }

    getStatus() {
        return {
            queueLength: this.queue.length,
            isProcessing: this.isProcessing,
            currentOperation: this.currentOperation,
            transactionActive: this.transactionActive,
            processingLock: this.processingLock
        };
    }
}

// Create singleton
const transactionQueue = new TransactionQueue();

// ============================================================
// 🔧 SQLITE OPTIMIZATION (FIXED - No transaction issues)
// ============================================================

async function optimizeSQLite(db) {
    // Run PRAGMAs outside any transaction
    const pragmas = [
        'PRAGMA journal_mode=WAL;',
        'PRAGMA synchronous=OFF;',
        'PRAGMA temp_store=MEMORY;',
        'PRAGMA cache_size=-50000;',
        'PRAGMA page_size=4096;',
        'PRAGMA mmap_size=30000000000;'
    ];
    
    for (const pragma of pragmas) {
        try {
            await new Promise((resolve, reject) => {
                db.db.run(pragma, (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
        } catch (err) {
            // Only log if it's not a transaction error
            if (!err.message.includes('inside a transaction')) {
                console.warn(`⚠️ PRAGMA warning: ${err.message}`);
            }
        }
    }
    console.log('✅ SQLite optimized for import');
}

// ============================================================
// 📦 INSERT BATCH - CONCURRENCY SAFE
// ============================================================

async function insertBatch(db, batch, useQueue = true) {
    if (!batch || batch.length === 0) return 0;

    // If useQueue is true, run through queue to prevent concurrency issues
    if (useQueue) {
        return transactionQueue.enqueue(async () => {
            return await insertBatchInternal(db, batch);
        }, `Batch-${Date.now()}`);
    }

    return await insertBatchInternal(db, batch);
}

async function insertBatchInternal(db, batch) {
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

    // Use the transaction queue's current transaction
    // The queue manager handles BEGIN/COMMIT
    await new Promise((resolve, reject) => {
        db.db.run(sql, values, (err) => {
            if (err) reject(err);
            else resolve();
        });
    });

    return batch.length;
}

// ============================================================
// 📥 IMPORT CSV - QUEUE MANAGED
// ============================================================

async function importCSV(filePath) {
    return transactionQueue.enqueue(async () => {
        return await importCSVInternal(filePath);
    }, `import-${path.basename(filePath)}`);
}

async function importCSVInternal(filePath) {
    const startTime = Date.now();
    const BATCH_SIZE = 1000;
    
    return new Promise((resolve, reject) => {
        let totalRows = 0;
        let duplicates = 0;
        let errors = 0;
        let inserted = 0;
        
        const seenParts = new Set();
        const batch = [];
        let streamPaused = false;
        
        console.log(`📥 Starting CSV import: ${path.basename(filePath)}`);

        const db = require('./database');
        
        // Optimize SQLite (outside transaction)
        optimizeSQLite(db).catch(err => {
            console.warn('⚠️ SQLite optimization warning:', err.message);
        });

        let lastLogTime = Date.now();
        
        const stream = fs.createReadStream(filePath)
            .pipe(csv())
            .on('data', function(row) {
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

                    if (batch.length >= BATCH_SIZE && !streamPaused) {
                        streamPaused = true;
                        this.pause();

                        const currentBatch = [...batch];
                        batch.length = 0;

                        // Insert batch using the current transaction
                        insertBatchInternal(db, currentBatch)
                            .then(count => {
                                inserted += count;
                                
                                const now = Date.now();
                                if (now - lastLogTime > 5000) {
                                    console.log(`📦 Imported ${inserted} products`);
                                    lastLogTime = now;
                                }
                                
                                streamPaused = false;
                                this.resume();
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
                if (batch.length > 0) {
                    try {
                        const count = await insertBatchInternal(db, batch);
                        inserted += count;
                        console.log(`📦 Final batch: ${count} products`);
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
// 📥 STREAMING IMPORT - QUEUE MANAGED
// ============================================================

async function importCSVStreaming(filePath) {
    return transactionQueue.enqueue(async () => {
        return await importCSVStreamingInternal(filePath);
    }, `stream-${path.basename(filePath)}`);
}

async function importCSVStreamingInternal(filePath) {
    const startTime = Date.now();
    const BATCH_SIZE = 2000;
    
    console.log(`📥 Starting streaming import: ${path.basename(filePath)}`);
    
    const db = require('./database');
    await optimizeSQLite(db);
    
    // Clear existing products (within transaction)
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
                const count = await insertBatchInternal(db, batch);
                inserted += count;
                batch = [];
                console.log(`📦 Imported ${inserted} products`);
            }
            
        } catch (err) {
            errors++;
            console.error(`❌ Row error: ${err.message}`);
        }
    }
    
    if (batch.length > 0) {
        const count = await insertBatchInternal(db, batch);
        inserted += count;
    }
    
    console.log(`📊 Import Summary:`);
    console.log(`   Total rows: ${totalRows}`);
    console.log(`   Products: ${inserted}`);
    console.log(`   Duplicates: ${duplicates}`);
    console.log(`   Errors: ${errors}`);
    console.log(`   ⏱️ Time: ${(Date.now() - startTime) / 1000}s`);
    
    return { imported: inserted, duplicates, errors };
}

// ============================================================
// 📊 QUEUE STATUS
// ============================================================

function getQueueStatus() {
    return transactionQueue.getStatus();
}

function resetQueue() {
    // Clear queue
    transactionQueue.queue = [];
    transactionQueue.isProcessing = false;
    transactionQueue.processingLock = false;
    console.log('🔄 Transaction queue reset');
}

// ============================================================
// 📤 EXPORTS
// ============================================================

module.exports = { 
    importCSV, 
    importCSVStreaming, 
    optimizeSQLite,
    getQueueStatus,
    resetQueue,
    transactionQueue
};
