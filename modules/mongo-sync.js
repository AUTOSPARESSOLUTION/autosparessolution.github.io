// ============================================================
// modules/mongo-sync.js - FINAL CORRECTED VERSION
// All bugs fixed, bandwidth-optimized
// ============================================================

const { MongoClient } = require('mongodb');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const MONGODB_URI = process.env.MONGODB_URI;
const DB_PATH = path.join(__dirname, '../db/products.db');

let mongoClient = null;
let isSyncRunning = false;
let syncInterval = null;

// ============================================================
// 🔗 CONNECT TO MONGODB
// ============================================================
async function connectMongo() {
    if (!MONGODB_URI) {
        console.log('⚠️ MONGODB_URI not set, sync disabled');
        return null;
    }
    
    try {
        // Reuse if already connected
        if (mongoClient) {
            try {
                await mongoClient.db('admin').command({ ping: 1 });
                return mongoClient.db('autospares');
            } catch (e) {
                mongoClient = null;
            }
        }
        
        mongoClient = new MongoClient(MONGODB_URI, {
            maxPoolSize: 10,
            serverSelectionTimeoutMS: 15000,
            socketTimeoutMS: 60000,
            connectTimeoutMS: 15000,
            retryWrites: true,
            retryReads: true
        });
        
        await mongoClient.connect();
        await mongoClient.db('admin').command({ ping: 1 });
        
        console.log('✅ MongoDB connected for sync');
        return mongoClient.db('autospares');
        
    } catch (error) {
        console.error('❌ MongoDB connection failed:', error.message);
        mongoClient = null;
        return null;
    }
}

// ============================================================
// 📥 GET SQLITE DATA (with pagination)
// ============================================================
function getSQLiteData(table, options = {}) {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(DB_PATH);
        const { limit, offset, where } = options;
        
        let query = `SELECT * FROM ${table}`;
        if (where) query += ` WHERE ${where}`;
        if (limit) query += ` LIMIT ${limit}`;
        if (offset) query += ` OFFSET ${offset}`;
        
        db.all(query, (err, rows) => {
            db.close();
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
}

// ============================================================
// 📊 GET ROW COUNT
// ============================================================
function getRowCount(table) {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(DB_PATH);
        db.get(`SELECT COUNT(*) as count FROM ${table}`, (err, row) => {
            db.close();
            if (err) reject(err);
            else resolve(row?.count || 0);
        });
    });
}

// ============================================================
// 🔄 SYNC SINGLE TABLE (BATCH PROCESSING)
// ============================================================
async function syncTable(tableName, collectionName) {
    try {
        const db = await connectMongo();
        if (!db) return false;
        
        const collection = db.collection(collectionName || tableName);
        
        const totalRows = await getRowCount(tableName);
        if (totalRows === 0) {
            console.log(`⏭️ No data in ${tableName}`);
            return false;
        }
        
        console.log(`📤 Syncing ${totalRows} rows from ${tableName}...`);
        
        // Clear old data
        await collection.deleteMany({});
        
        // Batch processing
        const BATCH_SIZE = 500;
        let synced = 0;
        
        for (let offset = 0; offset < totalRows; offset += BATCH_SIZE) {
            const batch = await getSQLiteData(tableName, { 
                limit: BATCH_SIZE, 
                offset: offset 
            });
            
            if (batch.length > 0) {
                try {
                    await collection.insertMany(batch, { ordered: false });
                    synced += batch.length;
                } catch (err) {
                    if (err.code === 11000) {
                        const inserted = err.result?.insertedCount || 0;
                        synced += inserted;
                    } else {
                        console.log(`⚠️ Batch error: ${err.message}`);
                    }
                }
            }
            
            await new Promise(r => setTimeout(r, 50));
        }
        
        console.log(`✅ Synced ${synced}/${totalRows} records to ${collectionName || tableName}`);
        return true;
        
    } catch (error) {
        console.error(`❌ Sync failed for ${tableName}:`, error.message);
        return false;
    }
}

// ============================================================
// 🔄 SYNC ALL TABLES
// ============================================================
async function syncAllData() {
    if (isSyncRunning) {
        console.log('⏳ Sync already in progress');
        return;
    }
    
    isSyncRunning = true;
    const startTime = Date.now();
    
    try {
        console.log('🔄 Starting full data sync to MongoDB...');
        
        // Small tables - sync every time
        const smallTables = [
            'customers',
            'suppliers',
            'supplier_access',
            'delivery_boys',
            'delivery_boys_access',
            'carts',
            'orders',
            'sales_invoices',
            'purchase_invoices',
            'customer_payments',
            'supplier_payments',
            'deliveries'
        ];
        
        let totalSynced = 0;
        
        for (const table of smallTables) {
            const success = await syncTable(table);
            if (success) totalSynced++;
        }
        
        // Products - sync once per day at 3 AM
        const now = new Date();
        const hourOfDay = now.getHours();
        const minuteOfHour = now.getMinutes();
        
        if (hourOfDay === 3 && minuteOfHour < 15) {
            console.log('📦 Syncing large products table (once daily at 3 AM)...');
            const success = await syncTable('products');
            if (success) totalSynced++;
        } else {
            console.log(`⏭️ Skipping products sync (only runs at 3 AM, now ${hourOfDay}:${minuteOfHour})`);
        }
        
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`✅ Sync complete: ${totalSynced} tables in ${duration}s`);
        
    } catch (error) {
        console.error('❌ Sync error:', error.message);
    } finally {
        isSyncRunning = false;
    }
}

// ============================================================
// 📦 FORCE SYNC PRODUCTS NOW (one-time manual trigger)
// ============================================================
async function forceSyncProductsNow() {
    console.log('📦 FORCE syncing products table now...');
    const startTime = Date.now();
    const success = await syncTable('products');
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    
    if (success) {
        console.log(`✅ Products force sync complete in ${duration}s`);
    } else {
        console.log(`❌ Products force sync failed`);
    }
    return success;
}

// ============================================================
// ⏰ START AUTO-SYNC
// ============================================================
function startAutoSync(intervalMs = 600000) {
    if (syncInterval) {
        clearInterval(syncInterval);
    }
    
    console.log(`🔄 Auto-sync started (every ${intervalMs / 1000 / 60} minutes)`);
    
    setTimeout(syncAllData, 30000);
    syncInterval = setInterval(syncAllData, intervalMs);
}

// ============================================================
// 🛑 STOP AUTO-SYNC
// ============================================================
function stopAutoSync() {
    if (syncInterval) {
        clearInterval(syncInterval);
        syncInterval = null;
        console.log('🛑 Auto-sync stopped');
    }
}

// ============================================================
// 🔄 MANUAL SYNC
// ============================================================
async function manualSync() {
    await syncAllData();
    return true;
}

// ============================================================
// 📊 GET SYNC STATUS
// ============================================================
function getSyncStatus() {
    return {
        isRunning: isSyncRunning,
        isConnected: mongoClient !== null,
        isEnabled: !!MONGODB_URI,
        interval: syncInterval ? 'active' : 'stopped'
    };
}

// ============================================================
// 🔍 SEARCH PRODUCTS IN MONGODB
// ============================================================
async function searchProductsInMongo(query, limit = 10) {
    try {
        const db = await connectMongo();
        if (!db) return [];
        
        const collection = db.collection('products');
        const upperQuery = query.toUpperCase();
        
        const results = await collection.find({
            $or: [
                { part: { $regex: upperQuery, $options: 'i' } },
                { description: { $regex: query, $options: 'i' } },
                { brand: { $regex: query, $options: 'i' } },
                { make: { $regex: query, $options: 'i' } },
                { model: { $regex: query, $options: 'i' } }
            ]
        })
        .limit(limit)
        .toArray();
        
        console.log(`✅ MongoDB found ${results.length} products for "${query}"`);
        return results;
    } catch (error) {
        console.error('❌ MongoDB search error:', error.message);
        return [];
    }
}

// ============================================================
// 📤 EXPORTS (SINGLE - FIXED)
// ============================================================
module.exports = {
    connectMongo,
    syncAllData,
    syncTable,
    startAutoSync,
    stopAutoSync,
    manualSync,
    getSyncStatus,
    searchProductsInMongo,
    forceSyncProductsNow
};
