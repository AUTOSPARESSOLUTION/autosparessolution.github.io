// ============================================================
// 📱 SMART ORDER ENGINE V12 - COMPLETE FIXED
// MRP + LIST Display for ALL Outputs
// ============================================================

const express = require("express");
const fetch = require("node-fetch");
const { Pool } = require('pg');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createLogger, transports, format } = require('winston');
const PQueue = require('p-queue');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const PDFDocument = require('pdfkit');
const Razorpay = require('razorpay');
const Tesseract = require('tesseract.js');
const { FormData } = require('node-fetch');
const sharp = require('sharp');

const app = express();
app.use(helmet());

// ============================================================
// 📊 LOGGING
// ============================================================

const logger = createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: format.combine(
        format.timestamp(),
        format.json(),
        format((info) => {
            if (info.message) {
                info.message = info.message.replace(/sk-[a-zA-Z0-9]{32,}/g, 'sk-****************');
                info.message = info.message.replace(/EAA[a-zA-Z0-9]{50,}/g, 'EAA-****************');
            }
            return info;
        })()
    ),
    transports: [
        new transports.Console(),
        new transports.File({ filename: 'assist-error.log', level: 'error' }),
        new transports.File({ filename: 'assist-combined.log', maxsize: 5242880, maxFiles: 5 })
    ]
});

// ============================================================
// 🔧 CONFIG
// ============================================================

const CONFIG = {
    phoneNumberId: process.env.ID,
    accessToken: process.env.TOKEN,
    verifyToken: process.env.VERIFY || "assist123",
    businessPhone: process.env.PHONE,
    chatgptKey: process.env.CHATGPT_API_KEY,
    deepseekKey: process.env.DEEPSEEK_API_KEY,
    geminiKey: process.env.GEMINI_API_KEY,
    databaseUrl: process.env.DATABASE_URL,
    razorpayKeyId: process.env.RAZORPAY_KEY_ID,
    razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET,
    razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET,
    appSecret: process.env.APP_SECRET || "your_app_secret",
    autoCorrectThreshold: parseFloat(process.env.AUTO_CORRECT_THRESHOLD) || 0.85,
    maxImageSize: parseInt(process.env.MAX_IMAGE_SIZE) || 10 * 1024 * 1024,
    aiTimeout: parseInt(process.env.AI_TIMEOUT) || 15000,
    retryAttempts: parseInt(process.env.RETRY_ATTEMPTS) || 3,
    retryDelay: parseInt(process.env.RETRY_DELAY) || 1000,
    circuitBreakerThreshold: parseInt(process.env.CIRCUIT_BREAKER_THRESHOLD) || 5,
    circuitBreakerTimeout: parseInt(process.env.CIRCUIT_BREAKER_TIMEOUT) || 60000
};

// Validate required config
const required = ['phoneNumberId', 'accessToken', 'businessPhone', 'databaseUrl'];
for (const key of required) {
    if (!CONFIG[key]) {
        logger.error(`❌ ${key} not set`);
        process.exit(1);
    }
}

logger.info('🚀 SMART ORDER ENGINE V12 Started');

// ============================================================
// ⏱️ FETCH WITH TIMEOUT & RETRY
// ============================================================

async function fetchWithTimeout(url, options, timeout = CONFIG.aiTimeout, retries = CONFIG.retryAttempts) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);
            const response = await fetch(url, { ...options, signal: controller.signal });
            clearTimeout(timeoutId);
            return response;
        } catch (error) {
            logger.warn(`⏳ Attempt ${attempt}/${retries} failed: ${error.message}`);
            if (attempt === retries) throw error;
            await new Promise(resolve => setTimeout(resolve, CONFIG.retryDelay * attempt));
        }
    }
}

// ============================================================
// 🔐 WEBHOOK SIGNATURE VERIFICATION
// ============================================================

app.use(express.json({
    verify: (req, res, buf) => {
        req.rawBody = buf;
    },
    limit: '10mb'
}));

function verifyWhatsAppSignature(req) {
    const signature = req.headers['x-hub-signature-256'];
    if (!signature) return false;
    
    const expectedSignature = crypto
        .createHmac('sha256', CONFIG.appSecret)
        .update(req.rawBody)
        .digest('hex');
    
    try {
        return crypto.timingSafeEqual(
            Buffer.from(signature.replace('sha256=', '')),
            Buffer.from(expectedSignature)
        );
    } catch {
        return false;
    }
}

// ============================================================
// 🛡️ RATE LIMITING & DUPLICATE DETECTION
// ============================================================

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Too many requests, please try again later.'
});
app.use('/webhook', limiter);

const processedMessageIds = new Map();
const MESSAGE_EXPIRY_MS = 24 * 60 * 60 * 1000;

function isMessageProcessed(messageId) {
    const now = Date.now();
    for (const [id, timestamp] of processedMessageIds.entries()) {
        if (now - timestamp > MESSAGE_EXPIRY_MS) {
            processedMessageIds.delete(id);
        }
    }
    
    if (processedMessageIds.has(messageId)) return true;
    processedMessageIds.set(messageId, now);
    return false;
}

// ============================================================
// 🗄️ DATABASE
// ============================================================

const pool = new Pool({
    connectionString: CONFIG.databaseUrl,
    ssl: { rejectUnauthorized: false },
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000
});

async function initDatabase() {
    try {
        await pool.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');

        await pool.query(`
            CREATE TABLE IF NOT EXISTS customers (
                id SERIAL PRIMARY KEY,
                phone VARCHAR(20) UNIQUE NOT NULL,
                name VARCHAR(200),
                customer_code VARCHAR(50) UNIQUE,
                business_name VARCHAR(200),
                address TEXT,
                gstin VARCHAR(20),
                credit_limit DECIMAL(12,2) DEFAULT 50000,
                outstanding DECIMAL(12,2) DEFAULT 0,
                total_orders INTEGER DEFAULT 0,
                total_spent DECIMAL(12,2) DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_contact TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS products (
                id SERIAL PRIMARY KEY,
                part VARCHAR(50) UNIQUE NOT NULL,
                description TEXT,
                brand VARCHAR(50),
                list_value DECIMAL(12,2),
                mrp DECIMAL(12,2),
                stock INTEGER DEFAULT 0,
                gst DECIMAL(5,2) DEFAULT 18,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS carts (
                id SERIAL PRIMARY KEY,
                phone VARCHAR(20) UNIQUE NOT NULL,
                items JSONB NOT NULL,
                subtotal DECIMAL(12,2),
                grand_total DECIMAL(12,2),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS orders (
                id SERIAL PRIMARY KEY,
                order_id VARCHAR(50) UNIQUE NOT NULL,
                customer_phone VARCHAR(20) NOT NULL,
                items JSONB NOT NULL,
                total DECIMAL(12,2),
                payment_status VARCHAR(20) DEFAULT 'pending',
                order_status VARCHAR(20) DEFAULT 'confirmed',
                razorpay_order_id VARCHAR(50),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS quotations (
                id SERIAL PRIMARY KEY,
                quotation_no VARCHAR(50) UNIQUE NOT NULL,
                customer_phone VARCHAR(20),
                items JSONB,
                total DECIMAL(12,2),
                pdf_url VARCHAR(500),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS enquiries (
                id SERIAL PRIMARY KEY,
                customer_phone VARCHAR(20) NOT NULL,
                message TEXT NOT NULL,
                reply TEXT,
                part_number VARCHAR(50),
                intent VARCHAR(50),
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS payments (
                id SERIAL PRIMARY KEY,
                order_id VARCHAR(50) NOT NULL,
                razorpay_payment_id VARCHAR(50) UNIQUE,
                razorpay_order_id VARCHAR(50),
                amount DECIMAL(12,2),
                status VARCHAR(20) DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pool.query(`CREATE INDEX IF NOT EXISTS idx_products_part ON products(part)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_products_stock ON products(stock)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_products_part_trgm ON products USING gin (part gin_trgm_ops)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_products_mrp ON products(mrp)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_customers_lastcontact ON customers(last_contact)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_phone)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_carts_phone ON carts(phone)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id)`);

        await pool.query(`
            DELETE FROM carts
            WHERE updated_at < NOW() - INTERVAL '7 days'
        `);

        logger.info('✅ Database ready');
    } catch (error) {
        logger.error('❌ Database init error:', error);
        throw error;
    }
}

// ============================================================
// 📦 PRODUCT LOADING - MATCHES YOUR CSV STRUCTURE
// ============================================================

async function loadProductsFromCSV() {
    const csvPath = path.join(__dirname, 'prices.csv');
    if (!fs.existsSync(csvPath)) {
        logger.warn('⚠️ prices.csv not found');
        return;
    }

    const products = [];
    await new Promise((resolve, reject) => {
        fs.createReadStream(csvPath)
            .pipe(csv({ headers: false }))
            .on('data', (row) => {
                const cols = Object.values(row);
                
                const product = {
                    part: (cols[0] || '').trim(),
                    description: (cols[1] || 'Auto Spare Part').trim(),
                    list_value: parseFloat(cols[2]) || 0,
                    mrp: parseFloat(cols[3]) || 0,
                    price: parseFloat(cols[6]) || 0,
                    stock: parseInt(cols[7]) || 0,
                    brand: (cols[10] || 'Unknown').trim(),
                    gst: 18
                };
                if (product.part) products.push(product);
            })
            .on('end', resolve)
            .on('error', reject);
    });

    if (products.length === 0) {
        logger.warn('⚠️ No products found in CSV');
        return;
    }

    // Build in-memory cache
    allProducts = products;
    productMap.clear();
    products.forEach(p => {
        productMap.set(p.part.toUpperCase(), p);
    });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        const batchSize = 1000;
        for (let i = 0; i < products.length; i += batchSize) {
            const batch = products.slice(i, i + batchSize);
            const values = batch.map((_, idx) => 
                `($${idx * 7 + 1}, $${idx * 7 + 2}, $${idx * 7 + 3}, $${idx * 7 + 4}, $${idx * 7 + 5}, $${idx * 7 + 6}, $${idx * 7 + 7})`
            ).join(',');
            const params = batch.flatMap(p => [p.part, p.description, p.brand, p.list_value, p.mrp, p.stock, p.gst]);
            
            await client.query(
                `INSERT INTO products (part, description, brand, list_value, mrp, stock, gst)
                 VALUES ${values}
                 ON CONFLICT (part) DO UPDATE SET
                 description = EXCLUDED.description,
                 brand = EXCLUDED.brand,
                 list_value = EXCLUDED.list_value,
                 mrp = EXCLUDED.mrp,
                 stock = EXCLUDED.stock,
                 gst = EXCLUDED.gst,
                 updated_at = CURRENT_TIMESTAMP`,
                params
            );
        }
        
        await client.query('COMMIT');
        logger.info(`✅ Loaded ${products.length} products`);
    } catch (error) {
        await client.query('ROLLBACK');
        logger.error('❌ Product load error:', error);
        throw error;
    } finally {
        client.release();
    }
}

// ============================================================
// 📋 PRODUCT DATA (for aiSearch)
// ============================================================

let allProducts = [];
let productMap = new Map();

// ============================================================
// 🔍 AI SEARCH - WITH MRP & LIST
// ============================================================

function aiSearch(query) {
    if (!query) return [];
    const q = query.toLowerCase().trim();
    const results = allProducts.filter(p => {
        const part = (p.part || '').toLowerCase();
        const desc = (p.description || p.desc || '').toLowerCase();
        const brand = (p.brand || '').toLowerCase();
        return part.includes(q) || desc.includes(q) || brand.includes(q);
    });
    results.sort((a, b) => {
        const aExact = (a.part || '').toLowerCase() === q;
        const bExact = (b.part || '').toLowerCase() === q;
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;
        return (b.stock || 0) - (a.stock || 0);
    });
    return results.slice(0, 10);
}

// ============================================================
// 📋 FORMAT PRODUCT LINE - WITH MRP & LIST
// ============================================================

function formatProductLine(product, qty, confidence, original = null) {
    const price = product.mrp || product.price || 0;
    const listValue = product.list_value || 0;
    const priceGST = price * (1 + (product.gst || 18) / 100);
    const confidenceStr = confidence < 1 ? ` (${Math.round(confidence * 100)}%)` : '';
    
    let line = `*${product.part}*${confidenceStr}`;
    if (original && original !== product.part) {
        line += `\n   📝 OCR read: ${original}`;
    }
    line += `\n📝 ${product.description || 'N/A'}`;
    line += `\n🏷️ Brand: ${product.brand || 'N/A'}`;
    line += `\n📦 Qty: ${qty}`;
    
    // ✅ SHOW BOTH MRP AND LIST FOR ALL BRANDS
    if (listValue > 0) {
        line += `\n💰 LIST: ₹${listValue.toFixed(2)}`;
    }
    line += `\n💰 MRP: ₹${price.toFixed(2)}`;
    line += ` (incl. GST: ₹${priceGST.toFixed(2)})`;
    line += `\n📦 Stock: ${product.stock > 0 ? `✅ ${product.stock} pcs` : '❌ Out of Stock'}`;
    
    return line;
}

// ============================================================
// 🔍 SEARCH PRODUCT
// ============================================================

async function searchProduct(partNumber) {
    const clean = partNumber.toUpperCase().trim();
    if (!clean || clean.length < 3) return null;

    let result = await pool.query('SELECT * FROM products WHERE part = $1', [clean]);
    if (result.rows.length > 0) {
        return { product: result.rows[0], confidence: 1.0, method: 'exact' };
    }

    const prefix = clean.substring(0, Math.min(6, clean.length));
    result = await pool.query(
        'SELECT * FROM products WHERE part LIKE $1 LIMIT 5',
        [prefix + '%']
    );
    if (result.rows.length > 0) {
        const best = result.rows[0];
        const similarity = best.part.length >= clean.length ? 
            clean.length / best.part.length : 
            best.part.length / clean.length;
        if (similarity >= CONFIG.autoCorrectThreshold) {
            return { product: best, confidence: similarity, method: 'prefix' };
        }
    }

    result = await pool.query(
        `SELECT *, similarity(part, $1) as sim
         FROM products
         WHERE part % $1
         ORDER BY sim DESC
         LIMIT 5`,
        [clean]
    );

    if (result.rows.length > 0) {
        const best = result.rows[0];
        if (best.sim >= CONFIG.autoCorrectThreshold) {
            return { product: best, confidence: best.sim, method: 'fuzzy', original: clean };
        }
        if (best.sim >= 0.60) {
            return { product: best, confidence: best.sim, method: 'fuzzy-low', original: clean, needsConfirmation: true };
        }
    }

    return null;
}

// ============================================================
// 🧠 AI FALLBACK
// ============================================================

const circuitBreakers = {
    gemini: { failures: 0, lastFailure: 0, open: false },
    chatgpt: { failures: 0, lastFailure: 0, open: false },
    deepseek: { failures: 0, lastFailure: 0, open: false }
};

function isCircuitOpen(service) {
    const cb = circuitBreakers[service];
    if (!cb) return false;
    if (!cb.open) return false;
    if (Date.now() - cb.lastFailure > CONFIG.circuitBreakerTimeout) {
        cb.open = false;
        cb.failures = 0;
        return false;
    }
    return true;
}

function recordFailure(service) {
    const cb = circuitBreakers[service];
    if (!cb) return;
    cb.failures++;
    cb.lastFailure = Date.now();
    if (cb.failures >= CONFIG.circuitBreakerThreshold) {
        cb.open = true;
        logger.warn(`⚠️ Circuit breaker opened for ${service}`);
    }
}

function recordSuccess(service) {
    const cb = circuitBreakers[service];
    if (!cb) return;
    cb.failures = 0;
    cb.open = false;
}

function detectIntent(message) {
    const msgLower = message.toLowerCase().trim();
    const intents = {
        price: ['price', 'cost', 'rate', 'how much'],
        stock: ['stock', 'available', 'have', 'quantity'],
        help: ['help', 'support', 'how to'],
        order: ['order', 'buy', 'purchase', 'want', 'need']
    };
    
    for (const [intent, keywords] of Object.entries(intents)) {
        if (keywords.some(k => msgLower.includes(k))) return intent;
    }
    return 'general';
}

async function getAIResponse(message) {
    const intent = detectIntent(message);
    logger.info(`🎯 Intent: ${intent}`);
    
    if (intent !== 'general') return null;

    logger.info(`🧠 Getting AI response...`);
    
    if (CONFIG.geminiKey && !isCircuitOpen('gemini')) {
        try {
            const response = await fetchWithTimeout(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${CONFIG.geminiKey}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{
                            parts: [{
                                text: `You are an auto spares assistant. Reply in Hinglish. Customer asks: "${message}"`
                            }]
                        }]
                    })
                },
                8000
            );
            const data = await response.json();
            if (response.ok && data.candidates?.[0]?.content?.parts?.[0]?.text) {
                recordSuccess('gemini');
                return data.candidates[0].content.parts[0].text;
            } else {
                recordFailure('gemini');
            }
        } catch (error) {
            logger.error(`❌ Gemini failed: ${error.message}`);
            recordFailure('gemini');
        }
    }
    
    if (CONFIG.chatgptKey && !isCircuitOpen('chatgpt')) {
        try {
            const response = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${CONFIG.chatgptKey}`
                },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages: [
                        { role: 'system', content: 'You are an auto spares assistant. Reply in Hinglish.' },
                        { role: 'user', content: message }
                    ],
                    max_tokens: 150,
                    temperature: 0.7
                })
            }, 12000);
            const data = await response.json();
            if (response.ok && data.choices?.[0]?.message?.content) {
                recordSuccess('chatgpt');
                return data.choices[0].message.content;
            } else {
                recordFailure('chatgpt');
            }
        } catch (error) {
            logger.error(`❌ ChatGPT failed: ${error.message}`);
            recordFailure('chatgpt');
        }
    }
    
    if (CONFIG.deepseekKey && !isCircuitOpen('deepseek')) {
        try {
            const response = await fetchWithTimeout('https://api.deepseek.com/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${CONFIG.deepseekKey}`
                },
                body: JSON.stringify({
                    model: 'deepseek-chat',
                    messages: [
                        { role: 'system', content: 'You are an auto spares assistant. Reply in Hinglish.' },
                        { role: 'user', content: message }
                    ],
                    max_tokens: 150,
                    temperature: 0.7
                })
            }, 10000);
            const data = await response.json();
            if (response.ok && data.choices?.[0]?.message?.content) {
                recordSuccess('deepseek');
                return data.choices[0].message.content;
            } else {
                recordFailure('deepseek');
            }
        } catch (error) {
            logger.error(`❌ DeepSeek failed: ${error.message}`);
            recordFailure('deepseek');
        }
    }
    
    return null;
}

// ============================================================
// 🔧 ULTIMATE QUANTITY PARSER
// ============================================================

function extractItemsFromTextUltimate(text) {
    const items = [];
    const lines = text.split(/[,;\n]/).map(l => l.trim()).filter(l => l.length > 0);
    
    for (const line of lines) {
        let match = line.match(/\b([A-Z0-9А-Я\-]{5,30})\s*[=\-:|\/]\s*(\d+)\b/i);
        if (match) {
            items.push({ part: match[1].toUpperCase(), qty: parseInt(match[2]) || 1 });
            continue;
        }
        
        match = line.match(/(\d+)\s*[@Pp]\s*([A-Z0-9\-]{5,30})/i);
        if (match) {
            items.push({ part: match[2].toUpperCase(), qty: parseInt(match[1]) || 1 });
            continue;
        }
        
        match = line.match(/\b([A-Z0-9\-]{5,30})\s*[=\-:|\/]\s*(\d+)\s*[Xx]/i);
        if (match) {
            items.push({ part: match[1].toUpperCase(), qty: parseInt(match[2]) || 1 });
            continue;
        }
        
        match = line.match(/(\d+)\s+([A-Z0-9А-Я\-]{5,30})\b/i);
        if (match) {
            items.push({ part: match[2].toUpperCase(), qty: parseInt(match[1]) || 1 });
            continue;
        }
        
        match = line.match(/\b([A-Z0-9\-]{5,30})\s*[=\-:|\/]\s*(\d+)\s*NOS/i);
        if (match) {
            items.push({ part: match[1].toUpperCase(), qty: parseInt(match[2]) || 1 });
            continue;
        }
        
        match = line.match(/(\d+)\s*(?:PCS|NOS|PC|NO)\s+([A-Z0-9\-]{5,30})\b/i);
        if (match) {
            items.push({ part: match[2].toUpperCase(), qty: parseInt(match[1]) || 1 });
            continue;
        }
        
        match = line.match(/\b([A-Z0-9А-Я\-]{5,30})\b/i);
        if (match) {
            items.push({ part: match[1].toUpperCase(), qty: 1 });
            continue;
        }
    }
    
    return items;
}

// ============================================================
// 🖼️ OCR & ORDER EXTRACTION
// ============================================================

async function preprocessImageForOCR(imageBuffer) {
    try {
        return await sharp(imageBuffer)
            .resize(2000, null, { withoutEnlargement: true })
            .grayscale()
            .sharpen()
            .normalize()
            .toBuffer();
    } catch (error) {
        logger.warn(`⚠️ Image preprocessing failed: ${error.message}`);
        return imageBuffer;
    }
}

async function extractOrderFromImage(imageBuffer, mimeType) {
    logger.info('🖼️ Extracting order from image...');
    
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/tiff'];
    if (!allowedTypes.includes(mimeType)) {
        throw new Error('Unsupported image format. Please use JPEG, PNG, WebP, HEIC, or TIFF.');
    }
    if (imageBuffer.length > CONFIG.maxImageSize) {
        throw new Error('Image too large. Max size: 10MB');
    }

    const processedImage = await preprocessImageForOCR(imageBuffer);

    if (CONFIG.geminiKey) {
        try {
            const base64Image = processedImage.toString('base64');
            const response = await fetchWithTimeout(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${CONFIG.geminiKey}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{
                            parts: [
                                { text: `Extract all part numbers and quantities from this image. Return JSON: {"items":[{"part":"PART123","qty":2}]}` },
                                { inline_data: { mime_type: mimeType, data: base64Image } }
                            ]
                        }]
                    })
                },
                CONFIG.aiTimeout
            );
            const data = await response.json();
            if (response.ok) {
                const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
                const result = parseOCRResponse(content);
                if (result.items && result.items.length > 0) {
                    return result;
                }
            }
        } catch (error) {
            logger.error(`❌ Gemini OCR failed: ${error.message}`);
        }
    }
    
    if (CONFIG.chatgptKey) {
        try {
            const base64Image = processedImage.toString('base64');
            const response = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${CONFIG.chatgptKey}`
                },
                body: JSON.stringify({
                    model: 'gpt-4o',
                    messages: [
                        {
                            role: 'system',
                            content: 'Extract part numbers and quantities from this image. Return JSON: {"items":[{"part":"PART123","qty":2}]}'
                        },
                        {
                            role: 'user',
                            content: [
                                { type: 'text', text: 'Extract all part numbers and quantities.' },
                                { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Image}` } }
                            ]
                        }
                    ],
                    max_tokens: 500,
                    temperature: 0
                })
            }, CONFIG.aiTimeout);
            const data = await response.json();
            if (response.ok) {
                const content = data.choices?.[0]?.message?.content || '';
                const result = parseOCRResponse(content);
                if (result.items && result.items.length > 0) {
                    return result;
                }
            }
        } catch (error) {
            logger.error(`❌ ChatGPT OCR failed: ${error.message}`);
        }
    }
    
    try {
        const result = await Tesseract.recognize(processedImage, 'eng', {
            logger: m => logger.debug(m.status)
        });
        return parseOCRText(result.data.text);
    } catch (error) {
        logger.error(`❌ Tesseract OCR failed: ${error.message}`);
        return { items: [] };
    }
}

function parseOCRResponse(content) {
    try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            return { items: parsed.items || [] };
        }
        return parseOCRText(content);
    } catch (error) {
        return parseOCRText(content);
    }
}

function parseOCRText(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const items = [];
    const patterns = [
        { regex: /^([A-Z0-9А-Я\-]{5,30})\s*[=\-:|\/]\s*(\d+)$/i, hasQty: true },
        { regex: /^(\d+)\s*[@Pp]\s*([A-Z0-9\-]{5,30})$/i, hasQty: true },
        { regex: /^([A-Z0-9\-]{5,30})\s*[=\-:|\/]\s*(\d+)\s*[Xx]$/i, hasQty: true },
        { regex: /^(\d+)\s+([A-Z0-9А-Я\-]{5,30})$/i, hasQty: true },
        { regex: /^([A-Z0-9\-]{5,30})$/i, hasQty: false }
    ];
    
    for (const line of lines) {
        for (const pattern of patterns) {
            const match = line.match(pattern.regex);
            if (match) {
                if (pattern.hasQty) {
                    const qty = parseInt(match[2]) || 1;
                    if (qty > 0 && qty < 1000000) {
                        items.push({ part: match[1].toUpperCase(), qty });
                    }
                } else {
                    items.push({ part: match[1].toUpperCase(), qty: 1 });
                }
                break;
            }
        }
    }
    return { items };
}

// ============================================================
// 👤 CUSTOMER MANAGEMENT
// ============================================================

function normalizePhone(phone) {
    let cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 10) return '91' + cleaned;
    if (cleaned.length === 11 && cleaned.startsWith('0')) return '91' + cleaned.substring(1);
    if (cleaned.length === 12 && cleaned.startsWith('91')) return cleaned;
    return cleaned;
}

async function getOrCreateCustomer(phone, name = 'Customer') {
    const normalizedPhone = normalizePhone(phone);
    
    let result = await pool.query('SELECT * FROM customers WHERE phone = $1', [normalizedPhone]);
    if (result.rows.length > 0) {
        await pool.query('UPDATE customers SET last_contact = CURRENT_TIMESTAMP WHERE phone = $1', [normalizedPhone]);
        return result.rows[0];
    }
    
    const codeResult = await pool.query("SELECT customer_code FROM customers WHERE customer_code LIKE 'CUST-%' ORDER BY customer_code DESC LIMIT 1");
    let nextNum = 1;
    if (codeResult.rows.length > 0) {
        const parts = codeResult.rows[0].customer_code.split('-');
        if (parts.length === 3) nextNum = parseInt(parts[2]) + 1;
    }
    const customerCode = `CUST-${new Date().getFullYear()}-${nextNum.toString().padStart(4, '0')}`;
    
    try {
        const insertResult = await pool.query(
            `INSERT INTO customers (phone, name, customer_code, created_at, last_contact)
             VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
             ON CONFLICT (phone) DO NOTHING
             RETURNING *`,
            [normalizedPhone, name, customerCode]
        );
        
        if (insertResult.rows.length > 0) {
            logger.info(`👤 New customer: ${name} (${customerCode})`);
            return insertResult.rows[0];
        }
        
        result = await pool.query('SELECT * FROM customers WHERE phone = $1', [normalizedPhone]);
        return result.rows[0];
    } catch (error) {
        logger.error(`❌ Customer creation error: ${error.message}`);
        result = await pool.query('SELECT * FROM customers WHERE phone = $1', [normalizedPhone]);
        return result.rows[0];
    }
}

// ============================================================
// 🛒 CART FUNCTIONS
// ============================================================

async function saveCartDB(phone, items, subtotal, grandTotal) {
    const normalizedPhone = normalizePhone(phone);
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(
            `INSERT INTO carts (phone, items, subtotal, grand_total, updated_at)
             VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
             ON CONFLICT (phone) DO UPDATE 
             SET items = $2, subtotal = $3, grand_total = $4, updated_at = CURRENT_TIMESTAMP`,
            [normalizedPhone, JSON.stringify(items), subtotal, grandTotal]
        );
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        logger.error(`❌ Cart save error: ${error.message}`);
        throw error;
    } finally {
        client.release();
    }
}

async function getCartDB(phone) {
    const normalizedPhone = normalizePhone(phone);
    const result = await pool.query('SELECT * FROM carts WHERE phone = $1', [normalizedPhone]);
    if (result.rows.length > 0) {
        return {
            items: result.rows[0].items,
            subtotal: result.rows[0].subtotal,
            grandTotal: result.rows[0].grand_total
        };
    }
    return null;
}

async function clearCartDB(phone) {
    const normalizedPhone = normalizePhone(phone);
    await pool.query('DELETE FROM carts WHERE phone = $1', [normalizedPhone]);
}

// ============================================================
// 📦 ORDER PROCESSING - WITH MRP & LIST
// ============================================================

async function processOrder(text, from) {
    logger.info(`📝 Processing order from ${from}: "${text.substring(0, 50)}..."`);
    
    const items = extractItemsFromTextUltimate(text);
    if (items.length === 0) {
        return null;
    }
    
    const results = [];
    for (const item of items) {
        const searchResult = await searchProduct(item.part);
        if (searchResult) {
            results.push({
                ...searchResult,
                qty: item.qty,
                requestedPart: item.part
            });
        }
    }
    
    if (results.length === 0) {
        const notFound = items.map(i => i.part).join(', ');
        return `❌ Parts not found: ${notFound}\n\n💡 Please check the part numbers.\n📞 Call: ${CONFIG.businessPhone}`;
    }
    
    const cartItems = results.map(r => ({
        part: r.product.part,
        description: r.product.description,
        brand: r.product.brand,
        qty: r.qty,
        mrp: r.product.mrp,
        list_value: r.product.list_value,
        confidence: r.confidence
    }));
    
    const subtotal = cartItems.reduce((sum, i) => sum + i.mrp * i.qty, 0);
    const gstAmount = subtotal * 0.18;
    const grandTotal = subtotal + gstAmount;
    
    await saveCartDB(from, cartItems, subtotal, grandTotal);
    
    let reply = `📋 *ORDER EXTRACTED*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
    for (const r of results) {
        const p = r.product;
        const priceGST = p.mrp * 1.18;
        const listValue = p.list_value || 0;
        
        reply += `*${p.part}*`;
        if (r.confidence < 0.95) reply += ` (${Math.round(r.confidence * 100)}%)`;
        if (r.original) reply += `\n   📝 OCR read: ${r.original}`;
        reply += `\n📝 ${p.description}\n🏷️ Brand: ${p.brand}\n📦 Qty: ${r.qty}`;
        
        // ✅ SHOW BOTH MRP AND LIST
        if (listValue > 0) {
            reply += `\n💰 LIST: ₹${listValue.toFixed(2)}`;
        }
        reply += `\n💰 MRP: ₹${p.mrp.toFixed(2)}`;
        reply += ` (incl. GST: ₹${priceGST.toFixed(2)})`;
        reply += `\n📦 Stock: ${p.stock > 0 ? `✅ ${p.stock} pcs` : '❌ Out of Stock'}\n\n`;
    }
    
    reply += `━━━━━━━━━━━━━━━━━━━━\n📊 *Summary*\n`;
    reply += `📦 Items: ${cartItems.length}\n`;
    reply += `📦 Qty: ${cartItems.reduce((s, i) => s + i.qty, 0)}\n`;
    reply += `💰 Subtotal: ₹${subtotal.toFixed(2)}\n`;
    reply += `🧾 GST (18%): ₹${gstAmount.toFixed(2)}\n`;
    reply += `💳 *Grand Total: ₹${grandTotal.toFixed(2)}*\n`;
    reply += `━━━━━━━━━━━━━━━━━━━━\n\n`;
    reply += `🛒 "Confirm Order" - Place order\n`;
    reply += `📄 "Get Quote" - Generate quotation\n`;
    reply += `🗑️ "Clear Cart" - Start fresh\n\n`;
    reply += `📞 Call: ${CONFIG.businessPhone}`;
    
    return reply;
}

// ============================================================
// 📦 ORDER CONFIRMATION
// ============================================================

async function confirmOrder(phone) {
    const normalizedPhone = normalizePhone(phone);
    const cart = await getCartDB(normalizedPhone);
    if (!cart || cart.items.length === 0) {
        return { success: false, message: '🛒 Your cart is empty.' };
    }
    
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        const customerResult = await client.query(
            'SELECT * FROM customers WHERE phone = $1 FOR UPDATE',
            [normalizedPhone]
        );
        
        let customer = customerResult.rows[0];
        if (!customer) {
            customer = await getOrCreateCustomer(normalizedPhone);
            await client.query('SELECT * FROM customers WHERE phone = $1 FOR UPDATE', [normalizedPhone]);
        }
        
        const total = cart.grandTotal;
        if (customer.outstanding + total > customer.credit_limit) {
            await client.query('ROLLBACK');
            return {
                success: false,
                message: `⚠️ *Credit Limit Exceeded*\n\nOutstanding: ₹${customer.outstanding.toFixed(2)}\nOrder: ₹${total.toFixed(2)}\nLimit: ₹${customer.credit_limit.toFixed(2)}\n\n📞 Call: ${CONFIG.businessPhone}`
            };
        }
        
        for (const item of cart.items) {
            const result = await client.query(
                `UPDATE products 
                 SET stock = stock - $1 
                 WHERE part = $2 AND stock >= $1
                 RETURNING *`,
                [item.qty, item.part]
            );
            if (result.rows.length === 0) {
                const currentStock = await client.query(
                    'SELECT stock FROM products WHERE part = $1',
                    [item.part]
                );
                const available = currentStock.rows.length > 0 ? currentStock.rows[0].stock : 0;
                throw new Error(`Insufficient stock for ${item.part}. Available: ${available}`);
            }
        }
        
        const orderId = `ORD-${Date.now().toString().slice(-6)}`;
        await client.query(
            `INSERT INTO orders (order_id, customer_phone, items, total, order_status)
             VALUES ($1, $2, $3, $4, 'confirmed')`,
            [orderId, normalizedPhone, JSON.stringify(cart.items), cart.grandTotal]
        );
        
        await client.query(
            'UPDATE customers SET total_orders = total_orders + 1, total_spent = total_spent + $1, outstanding = outstanding + $1 WHERE phone = $2',
            [cart.grandTotal, normalizedPhone]
        );
        
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        logger.error(`❌ Order error: ${error.message}`);
        return {
            success: false,
            message: `⚠️ ${error.message}\n\n📞 Call: ${CONFIG.businessPhone}`
        };
    } finally {
        client.release();
    }
    
    await clearCartDB(normalizedPhone);
    
    let paymentLink = 'https://razorpay.me/@autosparessolution';
    if (CONFIG.razorpayKeyId && CONFIG.razorpayKeySecret) {
        try {
            const razorpay = new Razorpay({
                key_id: CONFIG.razorpayKeyId,
                key_secret: CONFIG.razorpayKeySecret
            });
            const order = await razorpay.orders.create({
                amount: Math.round(cart.grandTotal * 100),
                currency: 'INR',
                receipt: orderId,
                notes: { customer_phone: normalizedPhone }
            });
            paymentLink = `https://rzp.io/l/${order.id}`;
            await pool.query(
                'UPDATE orders SET razorpay_order_id = $1 WHERE order_id = $2',
                [order.id, orderId]
            );
        } catch (error) {
            logger.error(`❌ Razorpay error: ${error.message}`);
        }
    }
    
    let reply = `✅ *ORDER CONFIRMED*\n\n━━━━━━━━━━━━━━━━━━━━\n`;
    for (const item of cart.items) {
        reply += `📦 ${item.part} x${item.qty}\n`;
    }
    reply += `━━━━━━━━━━━━━━━━━━━━\n💰 Total: ₹${cart.grandTotal.toFixed(2)}\n━━━━━━━━━━━━━━━━━━━━\n\n📦 Order ID: ${orderId}\n🚚 Delivery: 2-3 days\n💳 Pay: ${paymentLink}\n\n📞 Call: ${CONFIG.businessPhone}`;
    
    return { success: true, message: reply };
}

// ============================================================
// 📄 PDF QUOTATION GENERATION
// ============================================================

async function generateQuotationPDF(quotationNo, customer, items, total) {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const filename = `quotation-${quotationNo}.pdf`;
    const filepath = path.join(__dirname, 'uploads', filename);
    
    if (!fs.existsSync(path.join(__dirname, 'uploads'))) {
        fs.mkdirSync(path.join(__dirname, 'uploads'));
    }
    
    const stream = fs.createWriteStream(filepath);
    doc.pipe(stream);
    
    doc.fontSize(20).text('AUTO SPARES SOLUTION', { align: 'center' });
    doc.fontSize(10).text('101, 1st floor, 57/5, Q Road, Howrah, WB 711108', { align: 'center' });
    doc.text('GST: 19ANOPD3300R1ZO', { align: 'center' });
    doc.moveDown();
    
    doc.fontSize(14).text(`QUOTATION ${quotationNo}`, { align: 'center' });
    doc.moveDown();
    
    doc.fontSize(10).text(`Customer: ${customer.name}`);
    doc.text(`Phone: ${customer.phone}`);
    if (customer.gstin) doc.text(`GSTIN: ${customer.gstin}`);
    doc.moveDown();
    
    doc.text('Items:', { underline: true });
    doc.moveDown();
    
    let y = doc.y;
    doc.fontSize(9);
    const col1 = 30, col2 = 100, col3 = 250, col4 = 350, col5 = 450;
    
    doc.text('S.No', col1, y);
    doc.text('Part No', col2, y);
    doc.text('Description', col3, y);
    doc.text('Qty', col4, y);
    doc.text('Amount', col5, y);
    
    y += 20;
    doc.moveTo(30, y - 5).lineTo(550, y - 5).stroke();
    
    let index = 1;
    for (const item of items) {
        doc.text(index.toString(), col1, y);
        doc.text(item.part, col2, y);
        doc.text(item.description.substring(0, 30), col3, y);
        doc.text(item.qty.toString(), col4, y);
        doc.text(`₹${(item.mrp * item.qty).toFixed(2)}`, col5, y);
        y += 20;
        index++;
    }
    
    doc.moveTo(30, y + 5).lineTo(550, y + 5).stroke();
    y += 20;
    
    doc.fontSize(12).text(`Total: ₹${total.toFixed(2)}`, 450, y);
    y += 30;
    
    doc.fontSize(10);
    doc.text('Terms:');
    doc.text('1. Valid for 15 days');
    doc.text('2. Subject to Howrah jurisdiction');
    doc.text('3. Payment: 50% advance, 50% on delivery');
    doc.moveDown();
    
    doc.text('Customer Signature: _________________', 50, doc.y + 20);
    doc.text('Authorized Signatory: _________________', 350, doc.y + 20);
    
    doc.end();
    
    return new Promise((resolve) => {
        stream.on('finish', () => {
            resolve(filepath);
        });
    });
}

async function cleanupPDF(filepath) {
    try {
        if (fs.existsSync(filepath)) {
            fs.unlinkSync(filepath);
            logger.info(`🗑️ Cleaned up PDF: ${filepath}`);
        }
    } catch (error) {
        logger.error(`❌ PDF cleanup error: ${error.message}`);
    }
}

// ============================================================
// 📤 WHATSAPP SEND WITH RATE LIMITING
// ============================================================

const messageQueue = new PQueue({ concurrency: 5, interval: 1000, intervalCap: 10 });

async function sendWhatsAppMessage(to, message) {
    return messageQueue.add(async () => {
        const normalizedPhone = normalizePhone(to);
        if (message.length > 4000) {
            message = message.substring(0, 3950) + "\n\n... (truncated)";
        }
        const url = `https://graph.facebook.com/v23.0/${CONFIG.phoneNumberId}/messages`;
        try {
            const response = await fetchWithTimeout(url, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${CONFIG.accessToken}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    messaging_product: "whatsapp",
                    to: normalizedPhone,
                    type: "text",
                    text: { body: message }
                })
            }, 10000);
            const result = await response.json();
            if (result.messages?.[0]?.id) {
                logger.info(`✅ Message sent to ${normalizedPhone}`);
                return result;
            }
            logger.error(`❌ WhatsApp error: ${JSON.stringify(result)}`);
            return result;
        } catch (error) {
            logger.error(`❌ Send error: ${error.message}`);
            throw error;
        }
    });
}

async function sendWhatsAppPDF(to, filepath, caption) {
    const normalizedPhone = normalizePhone(to);
    const url = `https://graph.facebook.com/v23.0/${CONFIG.phoneNumberId}/media`;
    
    try {
        const formData = new FormData();
        formData.append('messaging_product', 'whatsapp');
        formData.append('file', fs.createReadStream(filepath));
        formData.append('type', 'application/pdf');
        
        const uploadResponse = await fetchWithTimeout(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${CONFIG.accessToken}`
            },
            body: formData
        }, 30000);
        
        const uploadResult = await uploadResponse.json();
        if (!uploadResult.id) {
            logger.error(`❌ WhatsApp upload error: ${JSON.stringify(uploadResult)}`);
            return null;
        }
        
        const messageUrl = `https://graph.facebook.com/v23.0/${CONFIG.phoneNumberId}/messages`;
        const response = await fetchWithTimeout(messageUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${CONFIG.accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                messaging_product: 'whatsapp',
                to: normalizedPhone,
                type: 'document',
                document: {
                    id: uploadResult.id,
                    caption: caption || 'Your Quotation'
                }
            })
        }, 30000);
        
        const result = await response.json();
        if (result.messages?.[0]?.id) {
            logger.info(`✅ PDF sent to ${normalizedPhone}`);
            await cleanupPDF(filepath);
            return result;
        }
        logger.error(`❌ PDF send error: ${JSON.stringify(result)}`);
        return result;
    } catch (error) {
        logger.error(`❌ PDF send error: ${error.message}`);
        return null;
    }
}

// ============================================================
// 💳 RAZORPAY WEBHOOK
// ============================================================

app.post('/razorpay/webhook', async (req, res) => {
    const signature = req.headers['x-razorpay-signature'];
    const body = JSON.stringify(req.body);
    
    const expectedSignature = crypto
        .createHmac('sha256', CONFIG.razorpayWebhookSecret)
        .update(body)
        .digest('hex');
    
    if (signature !== expectedSignature) {
        logger.warn('⚠️ Invalid Razorpay signature');
        return res.status(403).send('Invalid signature');
    }
    
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        const event = req.body;
        if (event.event === 'payment.captured') {
            const payment = event.payload.payment.entity;
            const orderId = payment.order_id;
            const paymentId = payment.id;
            
            const existingPayment = await client.query(
                'SELECT id FROM payments WHERE razorpay_payment_id = $1',
                [paymentId]
            );
            
            if (existingPayment.rows.length > 0) {
                logger.info(`⏩ Payment ${paymentId} already processed, skipping`);
                await client.query('COMMIT');
                return res.sendStatus(200);
            }
            
            await client.query(
                `UPDATE orders SET payment_status = 'paid' WHERE razorpay_order_id = $1`,
                [orderId]
            );
            
            const orderResult = await client.query(
                'SELECT customer_phone, total FROM orders WHERE razorpay_order_id = $1',
                [orderId]
            );
            
            if (orderResult.rows.length > 0) {
                const order = orderResult.rows[0];
                await client.query(
                    'UPDATE customers SET outstanding = outstanding - $1 WHERE phone = $2',
                    [order.total, order.customer_phone]
                );
            }
            
            await client.query(
                `INSERT INTO payments (order_id, razorpay_payment_id, razorpay_order_id, amount, status)
                 VALUES ($1, $2, $3, $4, 'completed')`,
                [orderId, paymentId, orderId, payment.amount / 100]
            );
        }
        
        await client.query('COMMIT');
        logger.info(`✅ Payment processed`);
    } catch (error) {
        await client.query('ROLLBACK');
        logger.error(`❌ Razorpay webhook error: ${error.message}`);
        return res.status(500).send('Error');
    } finally {
        client.release();
    }
    
    res.sendStatus(200);
});

// ============================================================
// 📂 MEDIA FUNCTIONS
// ============================================================

async function getMediaURL(mediaId) {
    const url = `https://graph.facebook.com/v23.0/${mediaId}`;
    const response = await fetchWithTimeout(url, {
        headers: { 'Authorization': `Bearer ${CONFIG.accessToken}` }
    }, 10000);
    const data = await response.json();
    return data.url;
}

async function downloadMedia(mediaUrl) {
    const response = await fetchWithTimeout(mediaUrl, {
        headers: { 'Authorization': `Bearer ${CONFIG.accessToken}` }
    }, 30000);
    const buffer = await response.arrayBuffer();
    return Buffer.from(buffer);
}

// ============================================================
// 📄 ROUTES
// ============================================================

app.get("/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.get("/", (req, res) => {
    res.json({ status: "ok", version: "V12" });
});

app.get("/webhook", (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    if (mode === "subscribe" && token === CONFIG.verifyToken) {
        logger.info("✅ Webhook Verified");
        return res.status(200).send(challenge);
    }
    res.status(200).send("Webhook Active");
});

// ============================================================
// 📩 RECEIVE MESSAGE
// ============================================================

app.post("/webhook", async (req, res) => {
    if (!verifyWhatsAppSignature(req)) {
        return res.status(403).send('Invalid signature');
    }
    
    const message = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (message) {
        const from = message.from;
        const type = message.type || 'text';
        const messageId = message.id;
        
        if (isMessageProcessed(messageId)) {
            logger.info(`⏩ Duplicate message ${messageId} ignored`);
            res.sendStatus(200);
            return;
        }
        
        setImmediate(async () => {
            try {
                await handleMessage(message, from, type);
            } catch (error) {
                logger.error(`❌ Async message error: ${error.message}`);
            }
        });
        
        res.sendStatus(200);
        return;
    }
    
    res.sendStatus(200);
});

// ============================================================
// 📩 MESSAGE HANDLER
// ============================================================

// This function is called asynchronously
async function handleMessage(message, from, type) {
    try {
        await getOrCreateCustomer(from);
        
        if (type === 'image') {
            const mediaId = message.image.id;
            const caption = message.image.caption || "";
            const mimeType = message.image.mime_type || 'image/jpeg';
            
            logger.info(`🖼️ Image from: ${from} | Caption: "${caption}"`);
            
            try {
                const mediaUrl = await getMediaURL(mediaId);
                const imageBuffer = await downloadMedia(mediaUrl);
                
                let extractedItems = [];
                let source = 'none';
                
                try {
                    const ocrResult = await extractOrderFromImage(imageBuffer, mimeType);
                    if (ocrResult.items && ocrResult.items.length > 0) {
                        extractedItems = ocrResult.items;
                        source = 'ocr';
                        logger.info(`✅ OCR extracted ${extractedItems.length} items`);
                    }
                } catch (ocrError) {
                    logger.error(`❌ OCR error: ${ocrError.message}`);
                }
                
                if (extractedItems.length === 0 && caption && caption.trim().length > 0) {
                    const captionItems = extractItemsFromTextUltimate(caption);
                    if (captionItems && captionItems.length > 0) {
                        extractedItems = captionItems;
                        source = 'caption';
                        logger.info(`✅ Caption extracted ${extractedItems.length} items`);
                    }
                }
                
                if (extractedItems.length > 0) {
                    const orderText = extractedItems.map(i => `${i.part} ${i.qty || 1}`).join('\n');
                    const reply = await processOrder(orderText, from);
                    if (reply) {
                        await sendWhatsAppMessage(from, reply);
                        return;
                    }
                }
                
                await sendWhatsAppMessage(from, 
                    `📸 *Photo Received!*\n\n` +
                    `I couldn't read any part numbers from the image${caption ? ' or caption' : ''}.\n\n` +
                    `💡 Please send the part number directly.\n📝 Example: "0108FAW00360N"\n\n` +
                    `📞 Call: ${CONFIG.businessPhone}`
                );
            } catch (error) {
                logger.error(`❌ Image error: ${error.message}`);
                await sendWhatsAppMessage(from, `📸 Sorry, I couldn't process your image. Please try again.\n\n📞 Call: ${CONFIG.businessPhone}`);
            }
            return;
        }
        
        if (type === 'audio') {
            await sendWhatsAppMessage(from, `🎤 *Voice Received!*\n\nPlease send text or images.\n\n📞 Call: ${CONFIG.businessPhone}`);
            return;
        }
        
        const text = message.text?.body || "";
        logger.info(`💬 From: ${from} | Text: ${text.substring(0, 50)}...`);
        
        const msgLower = text.toLowerCase().trim();
        
        if (msgLower === "confirm order" || msgLower === "place order") {
            const result = await confirmOrder(from);
            await sendWhatsAppMessage(from, result.message);
            return;
        }
        
        if (msgLower === "clear cart" || msgLower === "clear") {
            await clearCartDB(from);
            await sendWhatsAppMessage(from, "🗑️ Cart cleared!");
            return;
        }
        
        if (msgLower === "get quote" || msgLower === "quotation") {
            const cart = await getCartDB(from);
            if (!cart || cart.items.length === 0) {
                await sendWhatsAppMessage(from, "📄 Your cart is empty.\n\nSend part numbers like: \"0108FAW00360N 2\"");
                return;
            }
            const quotationNo = `Q-${Date.now().toString().slice(-6)}`;
            const customer = await getOrCreateCustomer(from);
            const filepath = await generateQuotationPDF(quotationNo, customer, cart.items, cart.grandTotal);
            await sendWhatsAppPDF(from, filepath, `Quotation ${quotationNo}`);
            await sendWhatsAppMessage(from, `📄 *Quotation ${quotationNo} sent*\n\n📞 Call: ${CONFIG.businessPhone} to confirm`);
            return;
        }
        
        if (msgLower === "hi" || msgLower === "hello" || msgLower === "help" || msgLower === "start") {
            await sendWhatsAppMessage(from, `👋 *Smart Order Engine V12*\n\n📸 Send photo of order\n📝 Send text with part numbers\n📞 Call: ${CONFIG.businessPhone}\n\n*Commands:*\n"Confirm Order" - Place order\n"Get Quote" - Generate quotation PDF\n"Clear Cart" - Start fresh`);
            return;
        }
        
        const hasPartNumber = /\b([A-Z0-9А-Я\-]{5,30})\b/i.test(text);
        
        if (hasPartNumber) {
            const reply = await processOrder(text, from);
            if (reply) {
                await sendWhatsAppMessage(from, reply);
                return;
            }
        }
        
        const aiReply = await getAIResponse(text);
        if (aiReply) {
            await sendWhatsAppMessage(from, `🤖 *AI Assistant*\n\n${aiReply}\n\n📞 Call: ${CONFIG.businessPhone}`);
        } else {
            await sendWhatsAppMessage(from, `🔍 I couldn't find "${text}" in our inventory.\n\n💡 Try: "0108FAW00360N 2"\n📞 Call: ${CONFIG.businessPhone}`);
        }
    } catch (error) {
        logger.error(`❌ Message handler error: ${error.message}`);
        await sendWhatsAppMessage(from, "⚠️ Sorry, something went wrong. Please try again.");
    }
}

// ============================================================
// 🚀 START SERVER
// ============================================================

async function startServer() {
    try {
        await initDatabase();
        await loadProductsFromCSV();
        
        // Build in-memory cache from database
        const dbProducts = await pool.query('SELECT * FROM products');
        allProducts = dbProducts.rows;
        productMap.clear();
        allProducts.forEach(p => {
            productMap.set(p.part.toUpperCase(), p);
        });
        
        const PORT = process.env.PORT || 10000;
        app.listen(PORT, () => {
            logger.info(`🚀 Server Running On Port ${PORT}`);
            logger.info(`📞 Business Phone: ${CONFIG.businessPhone}`);
            logger.info(`🧠 Gemini: ${CONFIG.geminiKey ? '✅' : '❌'}`);
            logger.info(`🧠 ChatGPT: ${CONFIG.chatgptKey ? '✅' : '❌'}`);
            logger.info(`🧠 DeepSeek: ${CONFIG.deepseekKey ? '✅' : '❌'}`);
            logger.info(`💳 Razorpay: ${CONFIG.razorpayKeyId ? '✅' : '❌'}`);
            logger.info(`🗄️ Database: ${CONFIG.databaseUrl ? '✅' : '❌'}`);
            logger.info(`📦 Products loaded: ${allProducts.length}`);
        });
    } catch (error) {
        logger.error(`❌ Startup error: ${error.message}`);
        process.exit(1);
    }
}

startServer();
