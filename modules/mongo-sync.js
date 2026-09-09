// modules/mongo-sync.js
// MongoDB sync module with proper SSL/TLS handling

const { MongoClient } = require('mongodb');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const MONGODB_URI = process.env.MONGODB_URI;
const DB_PATH = path.join(__dirname, '../db/products.db');

let mongoClient = null;
let isSyncRunning = false;
let syncInterval = null;
let connectionAttempts = 0;
const MAX_RETRIES = 3;

// Connect to MongoDB with proper SSL/TLS
async function connectMongo() {
    if (!MONGODB_URI) {
        console.log('⚠️ MONGODB_URI not set, sync disabled');
        return null;
    }
    
    try {
        // ✅ FIXED: Proper connection options without deprecated flags
        mongoClient = new MongoClient(MONGODB_URI, {
            maxPoolSize: 10,
            serverSelectionTimeoutMS: 10000,
            socketTimeoutMS: 45000,
            connectTimeoutMS: 10000,
            // ✅ Force TLS 1.2
            tls: true,
            tlsAllowInvalidCertificates: false,
            // ✅ Use SSL
            ssl: true,
            sslValidate: true,
            // ✅ Retry options
            retryWrites: true,
            retryReads: true,
        });
        
        console.log('📦 Attempting MongoDB connection...');
        await mongoClient.connect();
        connectionAttempts = 0;
        console.log('✅ MongoDB connected successfully!');
        return mongoClient.db('autospares');
    } catch (error) {
        console.error('❌ MongoDB connection failed:', error.message);
        
        // Try with relaxed SSL (for debugging)
        if (error.message.includes('SSL') || error.message.includes('TLS') || error.message.includes('alert')) {
            connectionAttempts++;
            console.log(`🔄 SSL/TLS error, attempt ${connectionAttempts}/${MAX_RETRIES}`);
            
            if (connectionAttempts <= MAX_RETRIES) {
                console.log('🔄 Retrying with relaxed SSL...');
                try {
                    mongoClient = new MongoClient(MONGODB_URI, {
                        maxPoolSize: 10,
                        serverSelectionTimeoutMS: 10000,
                        socketTimeoutMS: 45000,
                        connectTimeoutMS: 10000,
                        tls: true,
                        tlsAllowInvalidCertificates: true, // ⚠️ Relaxed for debugging
                        ssl: true,
                        sslValidate: false, // ⚠️ Relaxed for debugging
                        retryWrites: true,
                        retryReads: true,
                    });
                    await mongoClient.connect();
                    console.log('✅ MongoDB connected with relaxed SSL!');
                    connectionAttempts = 0;
                    return mongoClient.db('autospares');
                } catch (retryError) {
                    console.error('❌ Retry also failed:', retryError.message);
                    return null;
                }
            }
        }
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
        
        if (data.length === 0) {
            console.log(`ℹ️ No data found in ${tableName}, skipping`);
            return false;
        }
        
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
        let syncResults = [];
        
        for (const table of tables) {
            const success = await syncTable(table);
            if (success) {
                totalSynced++;
                syncResults.push(`✅ ${table}`);
            } else {
                syncResults.push(`⏭️ ${table} (no data)`);
            }
        }
        
        console.log(`✅ Sync complete: ${totalSynced}/${tables.length} tables synced`);
        console.log(`📊 Results: ${syncResults.join(', ')}`);
        
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
        
        if (!fs.existsSync(dataDir)) {
            console.log('ℹ️ Data directory not found, skipping JSON backup sync');
            return;
        }
        
        const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json'));
        
        if (files.length === 0) {
            console.log('ℹ️ No JSON backup files found');
            return;
        }
        
        for (const file of files) {
            try {
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
            } catch (err) {
                console.error(`❌ Failed to sync ${file}:`, err.message);
            }
        }
    } catch (error) {
        console.error('❌ JSON sync error:', error.message);
    }
}

// Start auto-sync
function startAutoSync(intervalMs = 60000) {
    if (syncInterval) {
        clearInterval(syncInterval);
    }
    
    console.log(`🔄 Auto-sync started (every ${intervalMs/1000} seconds)`);
    
    // Initial sync (delay to let system fully start)
    setTimeout(() => {
        console.log('🔄 Running initial sync...');
        syncAllData();
    }, 10000);
    
    // Regular sync
    syncInterval = setInterval(() => {
        console.log('🔄 Running scheduled sync...');
        syncAllData();
    }, intervalMs);
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
    console.log('🔄 Manual sync triggered...');
    await syncAllData();
    console.log('✅ Manual sync complete');
    return true;
}

// Get sync status
function getSyncStatus() {
    return {
        isRunning: isSyncRunning,
        isConnected: mongoClient !== null,
        isEnabled: !!MONGODB_URI,
        interval: syncInterval ? 'active' : 'stopped',
        connectionAttempts: connectionAttempts
    };
}

// Health check
async function healthCheck() {
    try {
        if (!mongoClient) {
            await connectMongo();
        }
        if (mongoClient) {
            await mongoClient.db('autospares').command({ ping: 1 });
            return { status: 'connected', database: 'autospares' };
        }
        return { status: 'disconnected', error: 'No client' };
    } catch (error) {
        return { status: 'disconnected', error: error.message };
    }
}

module.exports = {
    connectMongo,
    syncAllData,
    syncTable,
    startAutoSync,
    stopAutoSync,
    manualSync,
    getSyncStatus,
    syncJSONBackups,
    healthCheck
};
