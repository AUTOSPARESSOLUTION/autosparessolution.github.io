// ============================================================
// 🚀 ASSIST WhatsApp Webhook v3.0
// ============================================================

const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const compression = require('compression');

// Ensure directories exist
const dirs = ['db', 'logs', 'uploads'];
dirs.forEach(dir => {
    const dirPath = path.join(__dirname, dir);
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        console.log(`📁 Created directory: ${dir}`);
    }
});

// Import modules
const db = require('./modules/database');
const { importCSV } = require('./modules/csv-loader');
const { handleWhatsAppMessage } = require('./modules/whatsapp');

const app = express();
const PORT = process.env.PORT || 10000;

// ============================================================
// 🛡️ MIDDLEWARE
// ============================================================

app.use(cors());
app.use(compression());
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.set('trust proxy', 1);

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Too many requests, please try again later.'
});
app.use('/webhook', limiter);

// ============================================================
// 📂 STATIC FILES
// ============================================================

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/logs', express.static(path.join(__dirname, 'logs')));

// ============================================================
// 📄 ROUTES
// ============================================================

// Health check
app.get('/health', async (req, res) => {
    try {
        const stats = await db.getStats();
        res.json({
            status: 'ok',
            version: '3.0.0',
            timestamp: new Date().toISOString(),
            products: stats || { total_products: 0 }
        });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
});

app.get('/', (req, res) => {
    res.json({
        name: 'ASSIST WhatsApp Webhook',
        version: '3.0.0',
        status: 'running',
        endpoints: {
            health: '/health',
            webhook: '/webhook',
            search: '/api/search?q=part_number',
            product: '/api/product/part_number',
            stats: '/api/stats',
            import: '/api/import'
        }
    });
});

// Import CSV
app.post('/api/import', async (req, res) => {
    try {
        const csvPath = path.join(__dirname, 'prices.csv');
        if (!fs.existsSync(csvPath)) {
            return res.status(404).json({ 
                success: false, 
                error: 'prices.csv not found' 
            });
        }
        const result = await importCSV(csvPath);
        res.json(result);
    } catch (error) {
        console.error('Import error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Search products
app.get('/api/search', async (req, res) => {
    try {
        const { q, limit = 10 } = req.query;
        if (!q) {
            return res.status(400).json({ error: 'Query parameter "q" is required' });
        }
        const results = await db.searchProducts(q, parseInt(limit));
        res.json({ query: q, count: results.length, results });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get product by part number
app.get('/api/product/:part', async (req, res) => {
    try {
        const product = await db.getProduct(req.params.part);
        if (product) {
            res.json(product);
        } else {
            res.status(404).json({ error: 'Product not found' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get stats
app.get('/api/stats', async (req, res) => {
    try {
        const stats = await db.getStats();
        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get import history
app.get('/api/history', async (req, res) => {
    try {
        const history = await db.getImportHistory();
        res.json(history);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================================
// 📩 WEBHOOK
// ============================================================

// Webhook verification (GET)
app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    
    console.log(`🔐 Webhook Verification: mode=${mode}, token=${token}`);
    console.log(`🔐 Expected Token: ${process.env.WHATSAPP_VERIFY_TOKEN}`);
    
    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
        console.log('✅ Webhook Verified!');
        return res.status(200).send(challenge);
    }
    
    console.log('❌ Verification Failed!');
    res.status(403).send('Verification failed');
});

// Webhook receive (POST)
app.post('/webhook', async (req, res) => {
    console.log('📨 Webhook POST received');
    
    try {
        const entry = req.body.entry?.[0];
        const change = entry?.changes?.[0];
        const value = change?.value;
        const message = value?.messages?.[0];
        
        if (message) {
            const from = message.from;
            const type = message.type || 'text';
            
            console.log(`📩 From: ${from} | Type: ${type}`);
            
            // Process message asynchronously
            setImmediate(async () => {
                try {
                    await handleWhatsAppMessage(message, from, type);
                } catch (error) {
                    console.error(`❌ Async error: ${error.message}`);
                }
            });
        }
        
        res.sendStatus(200);
    } catch (error) {
        console.error(`❌ Webhook error: ${error.message}`);
        res.sendStatus(200);
    }
});

// ============================================================
// 🚀 START SERVER
// ============================================================

async function startServer() {
    console.log('====================================');
    console.log('🚀 ASSIST WhatsApp Webhook v3.0');
    console.log(`📞 Business Phone: ${process.env.BUSINESS_PHONE || '9830300193'}`);
    console.log(`🗄️ Database: ${process.env.DB_PATH || './db/products.db'}`);
    console.log('====================================');
    
    try {
        // Initialize database
        await db.initDatabase();
        console.log('✅ Database initialized');
        
        // Import CSV on startup
        const csvPath = path.join(__dirname, 'prices.csv');
        if (fs.existsSync(csvPath)) {
            console.log('📥 Importing CSV...');
            const result = await importCSV(csvPath);
            console.log(`✅ Imported ${result.imported} products`);
        } else {
            console.log('⚠️ prices.csv not found - using sample data');
            // Add sample products
            await db.importProducts([
                { part: '0801BA0285N', description: 'CLUTCH DISC ASSEMBLY DIA 240 mm', brand: 'M&M', make: 'MARUTI', list_price: 2103.53, mrp: 2482.17, billing_price: 2103.53, stock: 19, box_qty: 1, carton: 12, gst: 18 },
                { part: '0303BC0071N', description: 'ELEMENT OIL FILTER', brand: 'M&M', make: 'MARUTI', list_price: 182.86, mrp: 215.77, billing_price: 182.86, stock: 462, box_qty: 10, carton: 100, gst: 18 }
            ]);
            console.log('✅ Added sample products');
        }
        
        // Get stats
        const stats = await db.getStats();
        console.log(`📦 ${stats.total_products || 0} products in database`);
        console.log(`📦 ${stats.in_stock || 0} in stock`);
        console.log('====================================');
        
        // Start server
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`🚀 Server Running On Port ${PORT}`);
            console.log(`🔗 Health Check: /health`);
            console.log(`📱 Webhook: /webhook`);
            console.log('====================================');
        });
    } catch (error) {
        console.error('❌ Startup error:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

startServer();

module.exports = { app };
