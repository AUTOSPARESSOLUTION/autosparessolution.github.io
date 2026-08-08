// ============================================================
// 📁 DYNAMIC CSV FILE WATCHER
// ============================================================

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

class DynamicFileWatcher extends EventEmitter {
    constructor() {
        super();
        this.watchedFiles = new Map();
        this.processingFiles = new Set();
        this.isWatching = false;
        this.watcher = null;
        this.scanInterval = null;
        this.processedFiles = new Set();
        this.importHistory = [];
        this.rootDir = path.join(__dirname, '..');
        
        // Configuration
        this.config = {
            scanInterval: 5000,        // Check every 5 seconds
            supportedExtensions: ['.csv', '.xlsx', '.xls'],
            minFileSize: 1024,          // 1KB minimum
            maxFileSize: 1024 * 1024 * 1024, // 1GB maximum
            debounceDelay: 2000,        // Wait 2 seconds after file appears
            importBatchSize: 1000,
            autoStart: true
        };

        // File tracking
        this.fileHashes = new Map();
        this.fileTimestamps = new Map();
        this.pendingFiles = new Map();
    }

    // ============================================================
    // 🚀 START WATCHING
    // ============================================================
    
    startWatching(options = {}) {
        if (this.isWatching) {
            console.log('⚠️ File watcher already running');
            return;
        }

        this.config = { ...this.config, ...options };
        this.isWatching = true;
        
        console.log('🔍 Starting dynamic file watcher...');
        console.log(`📁 Watching: ${this.rootDir}`);
        console.log(`⏱️ Scan interval: ${this.config.scanInterval}ms`);
        console.log(`📄 Supported: ${this.config.supportedExtensions.join(', ')}`);

        // Initial scan
        this.scanDirectory();
        
        // Start periodic scanning
        this.scanInterval = setInterval(() => {
            this.scanDirectory();
        }, this.config.scanInterval);

        // Also watch for changes using fs.watch (if available)
        try {
            this.watcher = fs.watch(this.rootDir, (eventType, filename) => {
                if (filename && this.isSupportedFile(filename)) {
                    console.log(`📝 Detected change: ${filename} (${eventType})`);
                    // Debounce: wait a bit before processing
                    clearTimeout(this.pendingFiles.get(filename));
                    this.pendingFiles.set(filename, setTimeout(() => {
                        this.handleFileChange(filename);
                    }, this.config.debounceDelay));
                }
            });
            console.log('✅ File watcher active (fs.watch)');
        } catch (error) {
            console.log('⚠️ fs.watch not available, using polling only');
        }

        this.emit('started', { rootDir: this.rootDir, config: this.config });
    }

    // ============================================================
    // 🛑 STOP WATCHING
    // ============================================================
    
    stopWatching() {
        if (!this.isWatching) return;
        
        this.isWatching = false;
        
        if (this.scanInterval) {
            clearInterval(this.scanInterval);
            this.scanInterval = null;
        }
        
        if (this.watcher) {
            this.watcher.close();
            this.watcher = null;
        }
        
        console.log('🛑 File watcher stopped');
        this.emit('stopped');
    }

    // ============================================================
    // 🔍 SCAN DIRECTORY
    // ============================================================
    
    scanDirectory() {
        try {
            const files = fs.readdirSync(this.rootDir);
            const newFiles = [];
            
            for (const file of files) {
                if (this.isSupportedFile(file)) {
                    const filePath = path.join(this.rootDir, file);
                    const stats = fs.statSync(filePath);
                    
                    // Skip if already processed
                    if (this.processedFiles.has(filePath)) {
                        // Check if file was modified
                        const lastHash = this.fileHashes.get(filePath);
                        const currentHash = this.getFileHash(filePath);
                        
                        if (lastHash && lastHash !== currentHash) {
                            console.log(`🔄 File changed: ${file}`);
                            this.handleFileChange(file);
                        }
                        continue;
                    }
                    
                    // Check if file is valid
                    if (this.isValidFile(filePath, stats)) {
                        newFiles.push({ file, filePath, stats });
                    }
                }
            }
            
            if (newFiles.length > 0) {
                console.log(`📦 Found ${newFiles.length} new files`);
                this.emit('files-found', newFiles);
                
                // Process new files
                for (const fileInfo of newFiles) {
                    this.processFile(fileInfo);
                }
            }
            
        } catch (error) {
            console.error('❌ Scan error:', error.message);
        }
    }

    // ============================================================
    // 📄 HANDLE FILE CHANGE
    // ============================================================
    
    async handleFileChange(filename) {
        const filePath = path.join(this.rootDir, filename);
        
        // Check if file exists
        if (!fs.existsSync(filePath)) {
            console.log(`⚠️ File removed: ${filename}`);
            this.processedFiles.delete(filePath);
            this.fileHashes.delete(filePath);
            return;
        }
        
        try {
            const stats = fs.statSync(filePath);
            
            // Check if valid
            if (!this.isValidFile(filePath, stats)) {
                console.log(`⚠️ Invalid file: ${filename}`);
                return;
            }
            
            // Check if already processing
            if (this.processingFiles.has(filePath)) {
                console.log(`⏳ Already processing: ${filename}`);
                return;
            }
            
            console.log(`📥 Processing changed file: ${filename}`);
            
            // Process the file
            await this.processFile({ file: filename, filePath, stats });
            
        } catch (error) {
            console.error(`❌ Error handling file ${filename}:`, error.message);
        }
    }

    // ============================================================
    // 📊 PROCESS FILE
    // ============================================================
    
    async processFile(fileInfo) {
        const { file, filePath, stats } = fileInfo;
        
        // Skip if already processing
        if (this.processingFiles.has(filePath)) {
            console.log(`⏳ Already processing: ${file}`);
            return;
        }
        
        // Skip if already processed (and not modified)
        if (this.processedFiles.has(filePath)) {
            const lastHash = this.fileHashes.get(filePath);
            const currentHash = this.getFileHash(filePath);
            if (lastHash === currentHash) {
                return;
            }
        }
        
        try {
            this.processingFiles.add(filePath);
            this.emit('processing-start', { file, filePath });
            
            console.log(`📥 Importing: ${file} (${(stats.size / 1024 / 1024).toFixed(2)}MB)`);
            
            // Import the file
            const result = await this.importFile(filePath);
            
            // Mark as processed
            this.processedFiles.add(filePath);
            this.fileHashes.set(filePath, this.getFileHash(filePath));
            this.fileTimestamps.set(filePath, stats.mtime.getTime());
            
            // Store import history
            this.importHistory.push({
                file,
                timestamp: new Date(),
                rows: result.importedRows || 0,
                success: result.success
            });
            
            // Keep only last 100 entries
            if (this.importHistory.length > 100) {
                this.importHistory = this.importHistory.slice(-100);
            }
            
            this.emit('processing-complete', { file, filePath, result });
            
            console.log(`✅ Imported: ${file} - ${result.importedRows || 0} rows`);
            
            // Send admin notification
            await this.sendAdminNotification(file, result);
            
        } catch (error) {
            console.error(`❌ Import failed: ${file}`, error.message);
            this.emit('processing-error', { file, filePath, error: error.message });
            
            // Store error in history
            this.importHistory.push({
                file,
                timestamp: new Date(),
                error: error.message,
                success: false
            });
            
        } finally {
            this.processingFiles.delete(filePath);
        }
    }

    // ============================================================
    // 📥 IMPORT FILE
    // ============================================================
    
    async importFile(filePath) {
        const enhancedLoader = require('./csv-loader');
        return await enhancedLoader.importSingleFile(filePath, {
            batchSize: this.config.importBatchSize
        });
    }

    // ============================================================
    // 📢 SEND ADMIN NOTIFICATION
    // ============================================================
    
    async sendAdminNotification(file, result) {
        try {
            const adminPhone = process.env.ADMIN_PHONE || "9830300193";
            const sendWhatsAppMessage = require('../webhook').sendWhatsAppMessage;
            
            const message = `📥 *New File Imported!*\n━━━━━━━━━━━━━━━━━━━━\n\n` +
                `📄 File: ${file}\n` +
                `📦 Rows: ${result.totalRows || 0}\n` +
                `✅ Imported: ${result.importedRows || 0}\n` +
                `❌ Failed: ${result.failedRows || 0}\n` +
                `🕐 ${new Date().toLocaleString()}\n\n` +
                `📊 System updated automatically!`;
            
            await sendWhatsAppMessage(adminPhone, message);
        } catch (error) {
            console.error('❌ Admin notification failed:', error.message);
        }
    }

    // ============================================================
    // 🔍 HELPER FUNCTIONS
    // ============================================================
    
    isSupportedFile(filename) {
        const ext = path.extname(filename).toLowerCase();
        return this.config.supportedExtensions.includes(ext);
    }

    isValidFile(filePath, stats) {
        // Check size
        if (stats.size < this.config.minFileSize) {
            console.log(`⚠️ File too small: ${path.basename(filePath)} (${stats.size} bytes)`);
            return false;
        }
        
        if (stats.size > this.config.maxFileSize) {
            console.log(`⚠️ File too large: ${path.basename(filePath)} (${(stats.size / 1024 / 1024).toFixed(2)}MB)`);
            return false;
        }
        
        // Check if it's a directory
        if (stats.isDirectory()) {
            return false;
        }
        
        return true;
    }

    getFileHash(filePath) {
        try {
            const stats = fs.statSync(filePath);
            return `${stats.size}_${stats.mtime.getTime()}`;
        } catch (error) {
            return null;
        }
    }

    // ============================================================
    // 📊 GET STATUS
    // ============================================================
    
    getStatus() {
        return {
            isWatching: this.isWatching,
            processedFiles: this.processedFiles.size,
            processingFiles: this.processingFiles.size,
            pendingFiles: this.pendingFiles.size,
            importHistory: this.importHistory.slice(-10),
            config: this.config,
            rootDir: this.rootDir
        };
    }

    // ============================================================
    // 📄 GET PROCESSED FILES
    // ============================================================
    
    getProcessedFiles() {
        const files = [];
        for (const filePath of this.processedFiles) {
            const filename = path.basename(filePath);
            const hash = this.fileHashes.get(filePath);
            const timestamp = this.fileTimestamps.get(filePath);
            files.push({
                filename,
                filePath,
                hash,
                timestamp: timestamp ? new Date(timestamp) : null
            });
        }
        return files;
    }

    // ============================================================
    // 🔄 RESET
    // ============================================================
    
    reset() {
        this.processedFiles.clear();
        this.fileHashes.clear();
        this.fileTimestamps.clear();
        this.importHistory = [];
        console.log('🔄 File watcher reset');
    }
}

module.exports = new DynamicFileWatcher();
