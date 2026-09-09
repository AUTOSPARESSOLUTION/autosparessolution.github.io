// modules/mongo-sync.js
// This works alongside your existing code - NO CHANGES needed!

const { MongoClient } = require('mongodb');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const MONGODB_URI = process.env.MONGODB_URI;
const DB_PATH = path.join(__dirname, '../db/products.db');

let mongoClient = null;
let isSyncRunning = false;
let syncInterval = null;

// Connect to MongoDB
async function connectMongo() {
    if (!MONGODB_URI) {
        console.log('⚠️ MONGODB_URI not set, sync disabled');
        return null;
    }
    
    try {
        mongoClient = new MongoClient(MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            maxPoolSize: 10
        });
        
        await mongoClient.connect();
        console.log('✅ MongoDB connected for sync');
        return mongoClient.db('autospares');
    } catch (error) {
        console.error('❌ MongoDB connection failed:', error.message);
        return null;
    }
}

// Get SQLite data
function getSQLiteData(table) {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(DB_PATH);
        
        db.all(`SELECT * FROM ${table}`, (err, rows) => {
            db.close();
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
}

// Sync a single table
async function syncTable(tableName, collectionName) {
    try {
        const db = await connectMongo();
        if (!db) return false;
        
        const collection = db.collection(collectionName || tableName);
        
        // Get data from SQLite
        const data = await getSQLiteData(tableName);
        
        if (data.length === 0) return false;
        
        // Clear existing data in MongoDB
        await collection.deleteMany({});
        
        // Insert fresh data
        const result = await collection.insertMany(data);
        
        console.log(`✅ Synced ${result.insertedCount} records to ${collectionName || tableName}`);
        return true;
    } catch (error) {
        console.error(`❌ Sync failed for ${tableName}:`, error.message);
        return false;
    }
}

// Sync ALL tables
async function syncAllData() {
    if (isSyncRunning) {
        console.log('⏳ Sync already in progress');
        return;
    }
    
    isSyncRunning = true;
    
    try {
        console.log('🔄 Starting full data sync to MongoDB...');
        
        // Tables to sync
        const tables = [
            'customers',
            'suppliers', 
            'products',
            'delivery_boys',
            'orders',
            'carts',
            'sales_invoices',
            'purchase_invoices',
            'customer_payments',
            'supplier_payments',
            'supplier_access',
            'deliveries'
        ];
        
        let totalSynced = 0;
        
        for (const table of tables) {
            const success = await syncTable(table);
            if (success) totalSynced++;
        }
        
        console.log(`✅ Sync complete: ${totalSynced}/${tables.length} tables synced`);
        
        // Also sync the JSON backups
        await syncJSONBackups();
        
    } catch (error) {
        console.error('❌ Sync error:', error.message);
    } finally {
        isSyncRunning = false;
    }
}

// Sync JSON backups to MongoDB
async function syncJSONBackups() {
    try {
        const fs = require('fs');
        const dataDir = path.join(__dirname, '../data');
        
        if (!fs.existsSync(dataDir)) return;
        
        const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json'));
        
        for (const file of files) {
            const filePath = path.join(dataDir, file);
            const content = fs.readFileSync(filePath, 'utf8');
            const data = JSON.parse(content);
            
            if (Array.isArray(data) && data.length > 0) {
                const collectionName = file.replace('.json', '');
                const db = await connectMongo();
                if (!db) continue;
                
                const collection = db.collection(`backup_${collectionName}`);
                await collection.deleteMany({});
                await collection.insertMany(data);
                console.log(`✅ Synced ${data.length} records from ${file}`);
            }
        }
    } catch (error) {
        console.error('❌ JSON sync error:', error.message);
    }
}

// Start auto-sync
function startAutoSync(intervalMs = 60000) { // Every 60 seconds
    if (syncInterval) {
        clearInterval(syncInterval);
    }
    
    console.log(`🔄 Auto-sync started (every ${intervalMs/1000} seconds)`);
    
    // Initial sync
    setTimeout(syncAllData, 5000);
    
    // Regular sync
    syncInterval = setInterval(syncAllData, intervalMs);
}

// Stop auto-sync
function stopAutoSync() {
    if (syncInterval) {
        clearInterval(syncInterval);
        syncInterval = null;
        console.log('🛑 Auto-sync stopped');
    }
}

// Manual sync
async function manualSync() {
    await syncAllData();
}

// Get sync status
function getSyncStatus() {
    return {
        isRunning: isSyncRunning,
        isConnected: mongoClient !== null,
        isEnabled: !!MONGODB_URI,
        interval: syncInterval ? 'active' : 'stopped'
    };
}

module.exports = {
    connectMongo,
    syncAllData,
    syncTable,
    startAutoSync,
    stopAutoSync,
    manualSync,
    getSyncStatus,
    syncJSONBackups
};
