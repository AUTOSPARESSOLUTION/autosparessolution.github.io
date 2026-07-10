// ============================================================
// 📱 SMART ORDER ENGINE - COMPLETE FIXED VERSION
// Works with all existing features, no PQueue errors
// ============================================================

const express = require("express");
const fetch = require("node-fetch");
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createLogger, transports, format } = require('winston');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const PDFDocument = require('pdfkit');
const Razorpay = require('razorpay');
const Tesseract = require('tesseract.js');
const { FormData } = require('node-fetch');
const sharp = require('sharp');

// ✅ FIX: PQueue - use the correct import for v6
const PQueue = require('p-queue').default || require('p-queue');

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
// 🔧 CONFIGURATION
// ============================================================

const CONFIG = {
    phoneNumberId: process.env.ID,
    accessToken: process.env.TOKEN,
    verifyToken: process.env.VERIFY || "assist123",
    businessPhone: process.env.PHONE,
    chatgptKey: process.env.CHATGPT_API_KEY,
    deepseekKey: process.env.DEEPSEEK_API_KEY,
    geminiKey: process.env.GEMINI_API_KEY,
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
    circuitBreakerTimeout: parseInt(process.env.CIRCUIT_BREAKER_TIMEOUT) || 60000,
    defaultGST: parseFloat(process.env.DEFAULT_GST) || 18
};

// Validate required config
const requiredConfig = ['phoneNumberId', 'accessToken', 'businessPhone'];
for (const key of requiredConfig) {
    if (!CONFIG[key]) {
        logger.error(`❌ ${key} not set`);
        process.exit(1);
    }
}

logger.info('🚀 SMART ORDER ENGINE - COMPLETE FIXED Started');

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
// 📦 PRODUCT DATA - IN-MEMORY CACHE
// ============================================================

let allProducts = [];
let productMap = new Map();

// ============================================================
// 📦 LOAD PRODUCTS FROM CSV - CORRECT MAPPING
// ============================================================

async function loadProductsFromCSV() {
    const csvPath = path.join(__dirname, 'prices.csv');
    
    if (!fs.existsSync(csvPath)) {
        logger.warn('⚠️ prices.csv not found');
        return false;
    }

    const products = [];

    await new Promise((resolve, reject) => {
        fs.createReadStream(csvPath)
            .pipe(csv({ headers: true }))
            .on('headers', (headerList) => {
                logger.info(`📋 CSV Headers: ${headerList.join(', ')}`);
            })
            .on('data', (row) => {
                // ✅ CORRECT CSV COLUMN MAPPING
                const part = (row['Material'] || row['material'] || row['PART'] || '').trim();
                if (!part) return;

                const description = (row['Material2'] || row['Description'] || row['DESCRIPTION'] || 'Auto Spare Part').trim();
                const listValue = parseFloat(row['LIST PRICE'] || row['List Price'] || row['LIST'] || 0);
                const mrp = parseFloat(row['MRP PRICE'] || row['MRP Price'] || row['MRP'] || 0);
                const billing = parseFloat(row['billing price'] || row['Billing Price'] || row['BILLING PRICE'] || listValue || 0);
                const stock = parseInt(row['STOCK'] || row['Stock'] || 0);
                const boxQty = parseInt(row['Box Qty'] || row['box_qty'] || 0);
                const carton = parseInt(row['Carton'] || row['carton'] || 0);
                const brand = (row['brand'] || row['Brand'] || 'Unknown').trim();
                const make = (row['Make'] || row['make'] || '').trim();
                const type = (row['TYPE'] || row['Type'] || row['type'] || '').trim();
                const finish = (row['FINISH'] || row['Finish'] || row['finish'] || '').trim();

                products.push({
                    part: part,
                    description: description,
                    brand: brand,
                    make: make,
                    type: type,
                    finish: finish,
                    list_value: listValue,
                    mrp: mrp,
                    billing_price: billing > 0 ? billing : listValue,
                    stock: stock,
                    box_qty: boxQty,
                    carton: carton,
                    gst: CONFIG.defaultGST
                });
            })
            .on('end', resolve)
            .on('error', reject);
    });

    if (products.length === 0) {
        logger.warn('⚠️ No products found in CSV');
        return false;
    }

    allProducts = products;
    productMap.clear();
    products.forEach(p => {
        productMap.set(p.part.toUpperCase(), p);
    });

    logger.info(`✅ Loaded ${products.length} products from CSV`);
    if (products.length > 0) {
        const sample = products[0];
        logger.info(`📊 Sample: ${sample.part} | LIST: ${sample.list_value} | MRP: ${sample.mrp} | Billing: ${sample.billing_price}`);
    }
    return true;
}

// ============================================================
// 💰 PRICE CALCULATIONS - GST on Billing Price
// ============================================================

function calculatePrices(product, qty = 1) {
    const billingPrice = product.billing_price || product.list_value || 0;
    const mrp = product.mrp || 0;
    const listValue = product.list_value || 0;
    const gstRate = product.gst || CONFIG.defaultGST || 18;
    
    const gstAmount = billingPrice * (gstRate / 100);
    const priceWithGST = billingPrice + gstAmount;
    
    return {
        billingPrice: billingPrice,
        mrp: mrp,
        listValue: listValue,
        gstRate: gstRate,
        gstAmount: gstAmount,
        priceWithGST: priceWithGST,
        totalBilling: billingPrice * qty,
        totalGST: gstAmount * qty,
        totalWithGST: priceWithGST * qty
    };
}

// ============================================================
// 🔍 SEARCH FUNCTIONS
// ============================================================

function searchProducts(query) {
    if (!query || query.trim().length < 2 || allProducts.length === 0) {
        return [];
    }
    
    const clean = query.trim().toUpperCase();
    const results = [];
    
    // 1. EXACT MATCH
    const exactMatches = allProducts.filter(p => p.part.toUpperCase() === clean);
    results.push(...exactMatches.map(p => ({ ...p, matchType: 'exact', confidence: 1.0 })));
    
    // 2. PREFIX MATCH
    if (results.length < 10) {
        const prefix = clean.substring(0, Math.min(6, clean.length));
        const prefixMatches = allProducts.filter(p => 
            p.part.toUpperCase().startsWith(prefix) && 
            p.part.toUpperCase() !== clean
        );
        results.push(...prefixMatches.slice(0, 10).map(p => ({ ...p, matchType: 'prefix', confidence: 0.85 })));
    }
    
    // 3. PARTIAL MATCH
    if (results.length < 10) {
        const partialMatches = allProducts.filter(p => 
            p.part.toUpperCase().includes(clean) && 
            !results.some(r => r.part === p.part)
        );
        results.push(...partialMatches.slice(0, 10).map(p => ({ ...p, matchType: 'partial', confidence: 0.7 })));
    }
    
    // 4. DESCRIPTION SEARCH
    if (results.length < 10) {
        const descMatches = allProducts.filter(p => 
            (p.description || '').toUpperCase().includes(clean) && 
            !results.some(r => r.part === p.part)
        );
        results.push(...descMatches.slice(0, 5).map(p => ({ ...p, matchType: 'description', confidence: 0.5 })));
    }
    
    // 5. BRAND SEARCH
    if (results.length < 10) {
        const brandMatches = allProducts.filter(p => 
            (p.brand || '').toUpperCase().includes(clean) && 
            !results.some(r => r.part === p.part)
        );
        results.push(...brandMatches.slice(0, 5).map(p => ({ ...p, matchType: 'brand', confidence: 0.4 })));
    }
    
    const uniqueResults = [];
    const seen = new Set();
    for (const r of results) {
        if (!seen.has(r.part)) {
            seen.add(r.part);
            uniqueResults.push(r);
        }
        if (uniqueResults.length >= 10) break;
    }
    return uniqueResults;
}

function searchProduct(partNumber) {
    const clean = partNumber.toUpperCase().trim();
    if (!clean || clean.length < 3) return null;

    let product = productMap.get(clean);
    if (product) {
        return { product: product, confidence: 1.0, method: 'exact' };
    }

    const prefix = clean.substring(0, Math.min(6, clean.length));
    const prefixMatches = allProducts.filter(p => 
        p.part.toUpperCase().startsWith(prefix) && 
        p.part.toUpperCase() !== clean
    );
    if (prefixMatches.length > 0) {
        const best = prefixMatches[0];
        const similarity = best.part.length >= clean.length ? 
            clean.length / best.part.length : 
            best.part.length / clean.length;
        if (similarity >= CONFIG.autoCorrectThreshold) {
            return { product: best, confidence: similarity, method: 'prefix' };
        }
    }

    const partialMatches = allProducts.filter(p => 
        p.part.toUpperCase().includes(clean) && 
        p.part.toUpperCase() !== clean
    );
    if (partialMatches.length > 0) {
        const best = partialMatches[0];
        return { product: best, confidence: 0.7, method: 'partial', original: clean };
    }

    return null;
}

// ============================================================
// 📋 FORMAT SEARCH RESULTS - FULL DETAILS
// ============================================================

function formatSearchResults(products, query) {
    if (!products || products.length === 0) {
        return `🔍 No results found for "${query}"\n\n💡 Try:\n• Check the spelling\n• Use part number\n• Search by brand\n\n📞 Call: ${CONFIG.businessPhone}`;
    }
    
    let reply = `🔍 Found ${products.length} result(s)\n\n`;
    
    let index = 1;
    for (const product of products) {
        const prices = calculatePrices(product);
        
        reply += `${index}. *${product.part}*`;
        if (product.matchType && product.matchType !== 'exact') {
            reply += ` (${product.matchType})`;
        }
        reply += `\n`;
        
        if (product.description && product.description !== 'Auto Spare Part') {
            reply += `📝 ${product.description}\n`;
        }
        
        if (product.brand && product.brand !== 'Unknown') {
            reply += `🏷️ Brand: ${product.brand}`;
            if (product.make && product.make !== 'Unknown' && product.make !== product.brand) {
                reply += ` | Make: ${product.make}`;
            }
            reply += `\n`;
        }
        
        if (product.type) {
            reply += `📊 Type: ${product.type}`;
            if (product.finish) {
                reply += ` | Finish: ${product.finish}`;
            }
            reply += `\n`;
        }
        
        // ✅ FULL PRICE BREAKDOWN
        if (prices.listValue > 0) {
            reply += `💰 LIST PRICE: ₹${prices.listValue.toFixed(2)}\n`;
        }
        if (prices.mrp > 0) {
            reply += `💰 MRP PRICE: ₹${prices.mrp.toFixed(2)}\n`;
        }
        if (prices.billingPrice > 0) {
            reply += `💳 Billing Price: ₹${prices.billingPrice.toFixed(2)}\n`;
            reply += `🧾 GST (${prices.gstRate}%): ₹${prices.gstAmount.toFixed(2)}\n`;
            reply += `💳 Price incl. GST: ₹${prices.priceWithGST.toFixed(2)}\n`;
        }
        
        let stockInfo = [];
        if (product.stock > 0) {
            stockInfo.push(`✅ ${product.stock} pcs`);
        } else {
            stockInfo.push(`❌ Out of Stock`);
        }
        if (product.box_qty > 0) {
            stockInfo.push(`Box: ${product.box_qty}`);
        }
        if (product.carton > 0) {
            stockInfo.push(`Carton: ${product.carton}`);
        }
        if (stockInfo.length > 0) {
            reply += `📦 ${stockInfo.join(' | ')}\n`;
        }
        
        reply += `\n`;
        index++;
    }
    
    reply += `━━━━━━━━━━━━━━━━━━━━\n`;
    reply += `🛒 To order: Send part number with quantity\n`;
    reply += `📝 Example: "${products[0]?.part} 2"\n`;
    reply += `━━━━━━━━━━━━━━━━━━━━\n`;
    reply += `🛒 Order: https://autosparessolution.com\n`;
    reply += `📞 Call: ${CONFIG.businessPhone}`;
    
    return reply;
}

// ============================================================
// 📋 FORMAT PRODUCT LINE - WITH FULL DETAILS
// ============================================================

function formatProductLine(product, qty, confidence, original = null) {
    const prices = calculatePrices(product, qty);
    const confidenceStr = confidence < 1 ? ` (${Math.round(confidence * 100)}%)` : '';
    
    let line = `*${product.part}*${confidenceStr}`;
    if (original && original !== product.part) {
        line += `\n   📝 OCR read: ${original}`;
    }
    line += `\n📝 ${product.description || 'N/A'}`;
    if (product.brand && product.brand !== 'Unknown') line += `\n🏷️ Brand: ${product.brand}`;
    if (product.make && product.make !== 'Unknown') line += `\n🏭 Make: ${product.make}`;
    if (product.type) line += `\n📊 Type: ${product.type}`;
    if (product.finish) line += `\n🎨 Finish: ${product.finish}`;
    
    if (prices.listValue > 0) {
        line += `\n💰 LIST PRICE: ₹${prices.listValue.toFixed(2)}`;
    }
    if (prices.mrp > 0) {
        line += `\n💰 MRP PRICE: ₹${prices.mrp.toFixed(2)}`;
    }
    if (prices.billingPrice > 0) {
        line += `\n💳 Billing Price: ₹${prices.billingPrice.toFixed(2)}`;
        line += `\n🧾 GST (${prices.gstRate}%): ₹${prices.gstAmount.toFixed(2)}`;
        line += `\n💳 Price incl. GST: ₹${prices.priceWithGST.toFixed(2)}`;
    }
    
    line += `\n📦 ${qty} x ₹${prices.priceWithGST.toFixed(2)} = ₹${(prices.priceWithGST * qty).toFixed(2)}`;
    
    if (product.stock > 0 && product.stock >= qty) {
        line += `\n📦 ✅ ${product.stock} pcs available`;
    } else if (product.stock > 0 && product.stock < qty) {
        line += `\n📦 ⚠️ Only ${product.stock} pcs available (requested ${qty})`;
    } else {
        line += `\n📦 ❌ OUT OF STOCK`;
    }
    if (product.box_qty > 0) {
        line += ` | Box: ${product.box_qty}`;
    }
    if (product.carton > 0) {
        line += ` | Carton: ${product.carton}`;
    }
    
    return line;
}

// ============================================================
// 🔧 QUANTITY PARSER
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
        price: ['price', 'cost', 'rate', 'how much', 'mrp', 'list'],
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
    
    return null;
}

// ============================================================
// 🖼️ OCR & ORDER EXTRACTION (Simplified)
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
        throw new Error('Unsupported image format.');
    }
    if (imageBuffer.length > CONFIG.maxImageSize) {
        throw new Error('Image too large. Max size: 10MB');
    }

    const processedImage = await preprocessImageForOCR(imageBuffer);

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
// 👤 CUSTOMER MANAGEMENT - In-Memory
// ============================================================

let customers = new Map();

function normalizePhone(phone) {
    let cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 10) return '91' + cleaned;
    if (cleaned.length === 11 && cleaned.startsWith('0')) return '91' + cleaned.substring(1);
    if (cleaned.length === 12 && cleaned.startsWith('91')) return cleaned;
    return cleaned;
}

function getOrCreateCustomer(phone, name = 'Customer') {
    const normalizedPhone = normalizePhone(phone);
    if (customers.has(normalizedPhone)) {
        return customers.get(normalizedPhone);
    }
    const customer = {
        phone: normalizedPhone,
        name: name,
        customer_code: `CUST-${new Date().getFullYear()}-${customers.size + 1}`,
        created_at: new Date().toISOString()
    };
    customers.set(normalizedPhone, customer);
    return customer;
}

// ============================================================
// 🛒 CART FUNCTIONS - In-Memory
// ============================================================

let carts = new Map();

function saveCart(phone, items, subtotal, grandTotal) {
    const normalizedPhone = normalizePhone(phone);
    carts.set(normalizedPhone, { items, subtotal, grandTotal, updated_at: new Date().toISOString() });
}

function getCart(phone) {
    const normalizedPhone = normalizePhone(phone);
    return carts.get(normalizedPhone) || null;
}

function clearCart(phone) {
    const normalizedPhone = normalizePhone(phone);
    carts.delete(normalizedPhone);
}

// ============================================================
// 📦 ORDER PROCESSING
// ============================================================

function processOrder(text, from) {
    logger.info(`📝 Processing order from ${from}`);
    
    const items = extractItemsFromTextUltimate(text);
    if (items.length === 0) {
        return null;
    }
    
    const results = [];
    for (const item of items) {
        const searchResult = searchProduct(item.part);
        if (searchResult) {
            results.push({ ...searchResult, qty: item.qty, requestedPart: item.part });
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
        make: r.product.make,
        type: r.product.type,
        finish: r.product.finish,
        qty: r.qty,
        mrp: r.product.mrp,
        list_value: r.product.list_value,
        billing_price: r.product.billing_price,
        box_qty: r.product.box_qty,
        carton: r.product.carton,
        gst: r.product.gst || CONFIG.defaultGST,
        confidence: r.confidence,
        stock: r.product.stock
    }));
    
    let subtotal = 0;
    let totalGST = 0;
    let grandTotal = 0;
    let outOfStockItems = [];
    
    for (const item of cartItems) {
        const prices = calculatePrices(item, item.qty);
        subtotal += prices.totalBilling;
        totalGST += prices.totalGST;
        grandTotal += prices.totalWithGST;
        if (item.stock === 0 || item.stock < item.qty) {
            outOfStockItems.push(item.part);
        }
    }
    
    saveCart(from, cartItems, subtotal, grandTotal);
    
    let reply = `📋 *MULTI-PRODUCT ENQUIRY*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
    
    for (const r of results) {
        const p = r.product;
        const prices = calculatePrices(p, r.qty);
        
        reply += `*${p.part}*`;
        if (r.confidence < 0.95) reply += ` (${Math.round(r.confidence * 100)}%)`;
        if (r.original) reply += `\n   📝 OCR read: ${r.original}`;
        reply += `\n📝 ${p.description}`;
        if (p.brand && p.brand !== 'Unknown') reply += `\n🏷️ Brand: ${p.brand}`;
        if (p.make && p.make !== 'Unknown') reply += `\n🏭 Make: ${p.make}`;
        if (p.type) reply += `\n📊 Type: ${p.type}`;
        if (p.finish) reply += `\n🎨 Finish: ${p.finish}`;
        
        if (prices.listValue > 0) {
            reply += `\n💰 LIST PRICE: ₹${prices.listValue.toFixed(2)}`;
        }
        if (prices.mrp > 0) {
            reply += `\n💰 MRP PRICE: ₹${prices.mrp.toFixed(2)}`;
        }
        if (prices.billingPrice > 0) {
            reply += `\n💳 Billing Price: ₹${prices.billingPrice.toFixed(2)}`;
            reply += `\n🧾 GST (${prices.gstRate}%): ₹${prices.gstAmount.toFixed(2)}`;
            reply += `\n💳 Price incl. GST: ₹${prices.priceWithGST.toFixed(2)}`;
        }
        
        reply += `\n📦 ${r.qty} x ₹${prices.priceWithGST.toFixed(2)} = ₹${(prices.priceWithGST * r.qty).toFixed(2)}`;
        
        if (p.stock > 0 && p.stock >= r.qty) {
            reply += `\n📦 ✅ ${p.stock} pcs available`;
        } else if (p.stock > 0 && p.stock < r.qty) {
            reply += `\n📦 ⚠️ Only ${p.stock} pcs available (requested ${r.qty})`;
        } else {
            reply += `\n📦 ❌ OUT OF STOCK`;
        }
        
        if (p.box_qty > 0) {
            reply += ` | Box: ${p.box_qty}`;
        }
        if (p.carton > 0) {
            reply += ` | Carton: ${p.carton}`;
        }
        reply += `\n\n`;
    }
    
    reply += `━━━━━━━━━━━━━━━━━━━━\n`;
    reply += `📊 *Summary*\n`;
    reply += `📦 Items: ${cartItems.length}\n`;
    reply += `📦 Qty: ${cartItems.reduce((s, i) => s + i.qty, 0)}\n`;
    reply += `💰 Subtotal (Billing): ₹${subtotal.toFixed(2)}\n`;
    reply += `🧾 GST (${CONFIG.defaultGST}%): ₹${totalGST.toFixed(2)}\n`;
    reply += `💳 *Grand Total: ₹${grandTotal.toFixed(2)}*\n`;
    reply += `━━━━━━━━━━━━━━━━━━━━\n`;
    
    if (outOfStockItems.length > 0) {
        reply += `⚠️ Out of Stock: ${outOfStockItems.join(', ')}\n`;
        reply += `🔔 We'll notify you when available.\n\n`;
    }
    
    reply += `*What would you like to do?*\n`;
    reply += `🛒 "Confirm Order" - Place order\n`;
    reply += `📄 "Get Quote" - Generate quotation\n`;
    reply += `🗑️ "Clear Cart" - Start fresh\n\n`;
    reply += `📞 Call: ${CONFIG.businessPhone}`;
    
    return reply;
}

// ============================================================
// 📦 ORDER CONFIRMATION
// ============================================================

function confirmOrder(phone) {
    const normalizedPhone = normalizePhone(phone);
    const cart = getCart(normalizedPhone);
    if (!cart || cart.items.length === 0) {
        return { success: false, message: '🛒 Your cart is empty.' };
    }
    
    const orderId = `ORD-${Date.now().toString().slice(-6)}`;
    let paymentLink = 'https://razorpay.me/@autosparessolution';
    
    let reply = `✅ *ORDER CONFIRMED*\n\n━━━━━━━━━━━━━━━━━━━━\n`;
    for (const item of cart.items) {
        const prices = calculatePrices(item, item.qty);
        reply += `📦 ${item.part} x${item.qty}`;
        if (prices.mrp > 0) {
            reply += ` @ MRP ₹${prices.mrp.toFixed(2)}`;
        }
        if (prices.billingPrice > 0) {
            reply += `\n   💳 Billing: ₹${prices.billingPrice.toFixed(2)} + GST ₹${prices.gstAmount.toFixed(2)} = ₹${prices.priceWithGST.toFixed(2)}`;
        }
        reply += `\n`;
    }
    reply += `━━━━━━━━━━━━━━━━━━━━\n`;
    reply += `💰 Subtotal (Billing): ₹${cart.subtotal.toFixed(2)}\n`;
    reply += `🧾 Total GST: ₹${(cart.grandTotal - cart.subtotal).toFixed(2)}\n`;
    reply += `💳 *Grand Total: ₹${cart.grandTotal.toFixed(2)}*\n`;
    reply += `━━━━━━━━━━━━━━━━━━━━\n\n`;
    reply += `📦 Order ID: ${orderId}\n🚚 Delivery: 2-3 days\n💳 Pay: ${paymentLink}\n\n📞 Call: ${CONFIG.businessPhone}`;
    
    clearCart(normalizedPhone);
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
    doc.moveDown();
    
    let y = doc.y;
    doc.fontSize(8);
    const col1 = 30, col2 = 90, col3 = 200, col4 = 280, col5 = 340, col6 = 400, col7 = 460, col8 = 520;
    
    doc.text('S.No', col1, y);
    doc.text('Part No', col2, y);
    doc.text('Description', col3, y);
    doc.text('Qty', col4, y);
    doc.text('Billing', col5, y);
    doc.text('GST%', col6, y);
    doc.text('GST Amt', col7, y);
    doc.text('Total', col8, y);
    
    y += 20;
    doc.moveTo(30, y - 5).lineTo(550, y - 5).stroke();
    
    let index = 1;
    let subtotal = 0;
    let totalGST = 0;
    
    for (const item of items) {
        const prices = calculatePrices(item, item.qty);
        subtotal += prices.totalBilling;
        totalGST += prices.totalGST;
        
        doc.text(index.toString(), col1, y);
        doc.text(item.part, col2, y);
        doc.text((item.description || '').substring(0, 20), col3, y);
        doc.text(item.qty.toString(), col4, y);
        doc.text(`₹${prices.billingPrice.toFixed(2)}`, col5, y);
        doc.text(`${prices.gstRate}%`, col6, y);
        doc.text(`₹${prices.gstAmount.toFixed(2)}`, col7, y);
        doc.text(`₹${prices.priceWithGST.toFixed(2)}`, col8, y);
        y += 16;
        index++;
    }
    
    doc.moveTo(30, y + 5).lineTo(550, y + 5).stroke();
    y += 20;
    
    const grandTotal = subtotal + totalGST;
    
    doc.fontSize(9);
    doc.text(`Subtotal: ₹${subtotal.toFixed(2)}`, 400, y);
    y += 15;
    doc.text(`Total GST: ₹${totalGST.toFixed(2)}`, 400, y);
    y += 15;
    doc.fontSize(11).text(`Grand Total: ₹${grandTotal.toFixed(2)}`, 400, y);
    y += 30;
    
    doc.fontSize(9);
    doc.text('Terms:');
    doc.text('1. Valid for 15 days');
    doc.text('2. Subject to Howrah jurisdiction');
    doc.text('3. Payment: 50% advance, 50% on delivery');
    doc.text(`4. GST @ ${CONFIG.defaultGST}% on Billing Price`);
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
        }
    } catch (error) {
        logger.error(`❌ PDF cleanup error: ${error.message}`);
    }
}

// ============================================================
// 📤 WHATSAPP SEND - WITH PQUEUE FIX
// ============================================================

// ✅ FIX: Try to create PQueue with fallback
let messageQueue;
try {
    // For p-queue v7+
    const { default: PQueueDefault } = require('p-queue');
    messageQueue = new PQueueDefault({ concurrency: 5, interval: 1000, intervalCap: 10 });
} catch (e) {
    // For p-queue v6
    const PQueueV6 = require('p-queue');
    messageQueue = new PQueueV6({ concurrency: 5, interval: 1000, intervalCap: 10 });
}

// If PQueue still fails, use simple queue
if (!messageQueue || typeof messageQueue.add !== 'function') {
    logger.warn('⚠️ PQueue failed, using simple queue fallback');
    messageQueue = {
        add: async (fn) => {
            await new Promise(resolve => setTimeout(resolve, 100));
            return fn();
        }
    };
}

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
    res.json({ status: "ok", timestamp: new Date().toISOString(), productsLoaded: allProducts.length });
});

app.get("/", (req, res) => {
    res.json({ status: "ok", version: "FIXED", message: "Smart Order Engine is running" });
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

async function handleMessage(message, from, type) {
    try {
        getOrCreateCustomer(from);
        
        if (type === 'image') {
            const mediaId = message.image.id;
            const caption = message.image.caption || "";
            const mimeType = message.image.mime_type || 'image/jpeg';
            
            logger.info(`🖼️ Image from: ${from}`);
            
            try {
                const mediaUrl = await getMediaURL(mediaId);
                const imageBuffer = await downloadMedia(mediaUrl);
                
                let extractedItems = [];
                
                try {
                    const ocrResult = await extractOrderFromImage(imageBuffer, mimeType);
                    if (ocrResult.items && ocrResult.items.length > 0) {
                        extractedItems = ocrResult.items;
                        logger.info(`✅ OCR extracted ${extractedItems.length} items`);
                    }
                } catch (ocrError) {
                    logger.error(`❌ OCR error: ${ocrError.message}`);
                }
                
                if (extractedItems.length === 0 && caption && caption.trim().length > 0) {
                    const captionItems = extractItemsFromTextUltimate(caption);
                    if (captionItems && captionItems.length > 0) {
                        extractedItems = captionItems;
                        logger.info(`✅ Caption extracted ${extractedItems.length} items`);
                    }
                }
                
                if (extractedItems.length > 0) {
                    const orderText = extractedItems.map(i => `${i.part} ${i.qty || 1}`).join('\n');
                    const reply = processOrder(orderText, from);
                    if (reply) {
                        await sendWhatsAppMessage(from, reply);
                        return;
                    }
                }
                
                await sendWhatsAppMessage(from, 
                    `📸 *Photo Received!*\n\n` +
                    `I couldn't read any part numbers from the image${caption ? ' or caption' : ''}.\n\n` +
                    `💡 Please send the part number directly.\n📝 Example: "0801BA0285N 2"\n\n` +
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
        
        // SEARCH MODE
        const isSearch = !/\d/.test(text) && text.length >= 2 && text.length <= 20;
        
        if (isSearch && !msgLower.includes('order') && !msgLower.includes('confirm') && !msgLower.includes('clear')) {
            const searchResults = searchProducts(text);
            if (searchResults && searchResults.length > 0) {
                const reply = formatSearchResults(searchResults, text);
                await sendWhatsAppMessage(from, reply);
                return;
            }
        }
        
        // COMMANDS
        if (msgLower === "confirm order" || msgLower === "place order") {
            const result = confirmOrder(from);
            await sendWhatsAppMessage(from, result.message);
            return;
        }
        
        if (msgLower === "clear cart" || msgLower === "clear") {
            clearCart(from);
            await sendWhatsAppMessage(from, "🗑️ Cart cleared!");
            return;
        }
        
        if (msgLower === "get quote" || msgLower === "quotation") {
            const cart = getCart(from);
            if (!cart || cart.items.length === 0) {
                await sendWhatsAppMessage(from, "📄 Your cart is empty.\n\nSend part numbers like: \"0801BA0285N 2\"");
                return;
            }
            const quotationNo = `Q-${Date.now().toString().slice(-6)}`;
            const customer = getOrCreateCustomer(from);
            const filepath = await generateQuotationPDF(quotationNo, customer, cart.items, cart.grandTotal);
            await sendWhatsAppPDF(from, filepath, `Quotation ${quotationNo}`);
            await sendWhatsAppMessage(from, `📄 *Quotation ${quotationNo} sent*\n\n📞 Call: ${CONFIG.businessPhone} to confirm`);
            return;
        }
        
        if (msgLower === "hi" || msgLower === "hello" || msgLower === "help" || msgLower === "start") {
            await sendWhatsAppMessage(from, 
                `👋 *Smart Order Engine - FIXED*\n\n` +
                `🔍 Search: Send part number or brand\n` +
                `📸 Send photo of order\n` +
                `📝 Send text with part numbers\n` +
                `📞 Call: ${CONFIG.businessPhone}\n\n` +
                `*Commands:*\n` +
                `"Confirm Order" - Place order\n` +
                `"Get Quote" - Generate quotation PDF\n` +
                `"Clear Cart" - Start fresh\n\n` +
                `*Example:*\n` +
                `"0801BA0285N 2" - Add to cart`
            );
            return;
        }
        
        // ORDER MODE
        const hasPartNumber = /\b([A-Z0-9А-Я\-]{5,30})\b/i.test(text);
        
        if (hasPartNumber) {
            const reply = processOrder(text, from);
            if (reply) {
                await sendWhatsAppMessage(from, reply);
                return;
            }
        }
        
        // AI FALLBACK
        const aiReply = await getAIResponse(text);
        if (aiReply) {
            await sendWhatsAppMessage(from, `🤖 *AI Assistant*\n\n${aiReply}\n\n📞 Call: ${CONFIG.businessPhone}`);
        } else {
            await sendWhatsAppMessage(from, `🔍 I couldn't find "${text}" in our inventory.\n\n💡 Try: "0801BA0285N 2"\n📞 Call: ${CONFIG.businessPhone}`);
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
        console.log("====================================");
        console.log("🚀 SMART ORDER ENGINE - FIXED VERSION");
        console.log(`📞 Business Phone: ${CONFIG.businessPhone}`);
        console.log(`🧠 ChatGPT Key: ${CONFIG.chatgptKey ? '✅ Set' : '❌ Not set'}`);
        console.log(`🧠 DeepSeek Key: ${CONFIG.deepseekKey ? '✅ Set' : '❌ Not set'}`);
        console.log(`🧠 Gemini Key: ${CONFIG.geminiKey ? '✅ Set' : '❌ Not set'}`);
        console.log("====================================");
        
        await loadProductsFromCSV();
        
        console.log(`✅ All features loaded successfully!`);
        console.log(`📦 Product Map: ${allProducts.length} products loaded`);
        console.log("====================================");
        
        const PORT = process.env.PORT || 10000;
        app.listen(PORT, () => {
            console.log(`Server Running On Port ${PORT}`);
            console.log("====================================");
        });
    } catch (error) {
        logger.error(`❌ Startup error: ${error.message}`);
        process.exit(1);
    }
}

startServer();
