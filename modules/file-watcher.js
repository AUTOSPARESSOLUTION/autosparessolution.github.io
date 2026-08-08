// ============================================================
// 📁 DYNAMIC CSV FILE WATCHER - COMPLETE FIXED
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
        this.completedFiles = new Set();
        this.importHistory = [];
        this.rootDir = path.join(__dirname, '..');
        
        // Configuration
        this.config = {
            scanInterval: 5000,
            supportedExtensions: ['.csv', '.xlsx', '.xls'],
            minFileSize: 1024,
            maxFileSize: 1024 * 1024 * 1024,
            debounceDelay: 2000,
            importBatchSize: 1000,
            autoStart: true
        };

        // File tracking
        this.fileHashes = new Map();
        this.fileTimestamps = new Map();
        this.pendingFiles = new Map();
        
        // Files to ignore (already imported or very large)
        this.ignoreFiles = new Set(['prices-leyparts-hvc.csv', 'prices.csv']);
        
        // Bind methods to ensure 'this' context
        this.scanDirectory = this.scanDirectory.bind(this);
        this.handleFileChange = this.handleFileChange.bind(this);
        this.processFile = this.processFile.bind(this);
        this.importFile = this.importFile.bind(this);
        this.isSupportedFile = this.isSupportedFile.bind(this);
        this.isValidFile = this.isValidFile.bind(this);
        this.getFileHash = this.getFileHash.bind(this);
        this.sendAdminNotification = this.sendAdminNotification.bind(this);
        this.getStatus = this.getStatus.bind(this);
        this.getProcessedFiles = this.getProcessedFiles.bind(this);
        this.reset = this.reset.bind(this);
        this.startWatching = this.startWatching.bind(this);
        this.stopWatching = this.stopWatching.bind(this);
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
                    
                    // Skip if already completed
                    if (this.completedFiles.has(filePath)) {
                        const lastHash = this.fileHashes.get(filePath);
                        const currentHash = this.getFileHash(filePath);
                        if (lastHash && lastHash !== currentHash) {
                            console.log(`🔄 File changed: ${file}`);
                            this.completedFiles.delete(filePath);
                            this.processedFiles.delete(filePath);
                            this.handleFileChange(file);
                        }
                        continue;
                    }
                    
                    // Skip if already processed
                    if (this.processedFiles.has(filePath)) {
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
            this.completedFiles.delete(filePath);
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
        
        // Skip if already completed
        if (this.completedFiles.has(filePath)) {
            return;
        }
        
        try {
            this.processingFiles.add(filePath);
            this.emit('processing-start', { file, filePath });
            
            console.log(`📥 Importing: ${file} (${(stats.size / 1024 / 1024).toFixed(2)}MB)`);
            
            // Import the file
            const result = await this.importFile(filePath);
            
            // Mark as processed and completed
            this.processedFiles.add(filePath);
            this.completedFiles.add(filePath);
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
    // 📥 IMPORT FILE - FIXED
    // ============================================================
    
    async importFile(filePath) {
        try {
            // Use the existing CSV import function directly
            const { importCSV } = require('./csv-loader');
            
            console.log(`📥 Importing file: ${path.basename(filePath)}`);
            
            // Import the file using the existing function
            const result = await importCSV(filePath);
            
            return {
                success: true,
                importedRows: result.imported || 0,
                totalRows: result.total || 0,
                failedRows: result.errors || 0,
                file: filePath
            };
        } catch (error) {
            console.error(`❌ Import error:`, error.message);
            return {
                success: false,
                error: error.message,
                importedRows: 0,
                totalRows: 0,
                failedRows: 1,
                file: filePath
            };
        }
    }

    // ============================================================
    // 📢 SEND ADMIN NOTIFICATION
    // ============================================================
    
    async sendAdminNotification(file, result) {
        try {
            const adminPhone = process.env.ADMIN_PHONE || "9830300193";
            let sendWhatsAppMessage;
            try {
                const webhook = require('../webhook');
                sendWhatsAppMessage = webhook.sendWhatsAppMessage;
            } catch (e) {
                return;
            }
            
            if (!sendWhatsAppMessage) return;
            
            const message = `📥 *File Imported!*\n━━━━━━━━━━━━━━━━━━━━\n\n` +
                `📄 File: ${file}\n` +
                `📦 Imported: ${result.importedRows || 0} rows\n` +
                `🕐 ${new Date().toLocaleString()}`;
            
            await sendWhatsAppMessage(adminPhone, message);
        } catch (error) {
            // Silently fail
        }
    }

    // ============================================================
    // 🔍 HELPER FUNCTIONS
    // ============================================================
    
    isSupportedFile(filename) {
        if (!filename) return false;
        const ext = path.extname(filename).toLowerCase();
        return this.config.supportedExtensions.includes(ext);
    }

    isValidFile(filePath, stats) {
        const filename = path.basename(filePath);
        
        // Skip if already completed
        if (this.completedFiles.has(filePath)) {
            return false;
        }
        
        // Skip specific large files that are already imported
        if (this.ignoreFiles.has(filename) && this.processedFiles.has(filePath)) {
            return false;
        }
        
        // Check size
        if (stats.size < this.config.minFileSize) {
            console.log(`⚠️ File too small: ${filename} (${stats.size} bytes)`);
            return false;
        }
        
        if (stats.size > this.config.maxFileSize) {
            console.log(`⚠️ File too large: ${filename} (${(stats.size / 1024 / 1024).toFixed(2)}MB)`);
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
            completedFiles: this.completedFiles.size,
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
        for (const filePath of this.completedFiles) {
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
        this.completedFiles.clear();
        this.fileHashes.clear();
        this.fileTimestamps.clear();
        this.importHistory = [];
        console.log('🔄 File watcher reset');
    }
}

module.exports = new DynamicFileWatcher();
