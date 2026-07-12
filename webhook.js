// ============================================================
// 🚀 ASSIST WhatsApp Webhook v3.0 - COMPLETE FIXED
// Features: Exact match first, Multi-product, Gemini Vision, AI Order Parsing
// Uses: ID, TOKEN, VERIFY, PHONE, CHATGPT_API_KEY, DEEPSEEK_API_KEY, GEMINI_KEY
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
const { parseOrder, extractPartNumber, extractQuantity } = require('./modules/order-parser');

const app = express();
const PORT = process.env.PORT || 10000;

// ============================================================
// 🔧 CONFIGURATION - Using Your Render Variables
// ============================================================

const CONFIG = {
    phoneNumberId: process.env.ID,
    accessToken: process.env.TOKEN,
    verifyToken: process.env.VERIFY || "assist123",
    businessPhone: process.env.PHONE || "9830300193",
    chatgptKey: process.env.CHATGPT_API_KEY,
    deepseekKey: process.env.DEEPSEEK_API_KEY,
    geminiKey: process.env.GEMINI_KEY,
};

console.log('====================================');
console.log('🚀 ASSIST WhatsApp Webhook v3.0 - COMPLETE FIXED');
console.log(`📞 Business Phone: ${CONFIG.businessPhone}`);
console.log(`🆔 Phone Number ID: ${CONFIG.phoneNumberId}`);
console.log(`🔑 Token: ${CONFIG.accessToken ? '✅ Set' : '❌ Not set'}`);
console.log(`🧠 ChatGPT: ${CONFIG.chatgptKey ? '✅ Set' : '❌ Not set'}`);
console.log(`🧠 DeepSeek: ${CONFIG.deepseekKey ? '✅ Set' : '❌ Not set'}`);
console.log(`🧠 Gemini: ${CONFIG.geminiKey ? '✅ Set' : '❌ Not set'}`);
console.log('====================================');

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
// 🛡️ DUPLICATE MESSAGE DETECTION
// ============================================================

const processedMessages = new Map();
const MESSAGE_EXPIRY = 5 * 60 * 1000; // 5 minutes

function isMessageProcessed(messageId) {
    if (!messageId) return false;
    
    const now = Date.now();
    for (const [id, timestamp] of processedMessages.entries()) {
        if (now - timestamp > MESSAGE_EXPIRY) {
            processedMessages.delete(id);
        }
    }
    
    if (processedMessages.has(messageId)) {
        console.log(`⏩ Duplicate message ${messageId} - skipping`);
        return true;
    }
    
    processedMessages.set(messageId, now);
    return false;
}

// ============================================================
// 📂 STATIC FILES
// ============================================================

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/logs', express.static(path.join(__dirname, 'logs')));

// ============================================================
// 📄 ROUTES
// ============================================================

app.get('/health', async (req, res) => {
    try {
        const stats = await db.getStats();
        res.json({
            status: 'ok',
            version: '3.0.0',
            timestamp: new Date().toISOString(),
            config: {
                phoneNumberId: CONFIG.phoneNumberId ? '✅ Set' : '❌ Not set',
                accessToken: CONFIG.accessToken ? '✅ Set' : '❌ Not set',
                businessPhone: CONFIG.businessPhone,
                ai: {
                    chatgpt: CONFIG.chatgptKey ? '✅' : '❌',
                    deepseek: CONFIG.deepseekKey ? '✅' : '❌',
                    gemini: CONFIG.geminiKey ? '✅' : '❌'
                }
            },
            products: stats || { total_products: 0 }
        });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
});

app.get('/', (req, res) => {
    res.json({
        name: 'ASSIST WhatsApp Webhook v3.0',
        version: '3.0.0',
        status: 'running',
        ai: {
            chatgpt: CONFIG.chatgptKey ? '✅' : '❌',
            deepseek: CONFIG.deepseekKey ? '✅' : '❌',
            gemini: CONFIG.geminiKey ? '✅' : '❌'
        },
        endpoints: {
            health: '/health',
            webhook: '/webhook',
            search: '/api/search?q=part_number',
            product: '/api/product/part_number',
            stats: '/api/stats',
            import: '/api/import',
            testGemini: '/api/test-gemini'
        }
    });
});

// ============================================================
// 🧪 TEST GEMINI API KEY
// ============================================================

app.get('/api/test-gemini', async (req, res) => {
    const results = {
        gemini: {
            key: CONFIG.geminiKey ? '✅ Set' : '❌ Not set',
            test: 'pending',
            availableModels: []
        }
    };
    
    if (CONFIG.geminiKey) {
        try {
            // Get available models
            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models?key=${CONFIG.geminiKey}`
            );
            const data = await response.json();
            results.gemini.test = response.ok ? '✅ Working' : '❌ Failed';
            results.gemini.error = data.error?.message || null;
            
            if (response.ok && data.models) {
                // Filter models that support vision/generateContent
                const visionModels = data.models.filter(m => 
                    m.supportedGenerationMethods && 
                    m.supportedGenerationMethods.includes('generateContent') &&
                    (m.name.includes('flash') || m.name.includes('vision') || m.name.includes('pro'))
                );
                results.gemini.availableModels = visionModels.map(m => m.name);
                results.gemini.hasVision = visionModels.length > 0 ? '✅' : '❌';
                results.gemini.recommendedModel = visionModels.length > 0 ? visionModels[0].name : 'None';
            }
        } catch (error) {
            results.gemini.test = '❌ Error';
            results.gemini.error = error.message;
        }
    }
    
    res.json(results);
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

app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    
    console.log(`🔐 Webhook Verification: mode=${mode}, token=${token}`);
    console.log(`🔐 Expected Token: ${CONFIG.verifyToken}`);
    
    if (mode === 'subscribe' && token === CONFIG.verifyToken) {
        console.log('✅ Webhook Verified!');
        return res.status(200).send(challenge);
    }
    
    console.log('❌ Verification Failed!');
    res.status(403).send('Verification failed');
});

// ============================================================
// 📩 WEBHOOK RECEIVE - WITH DEDUPLICATION
// ============================================================

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
            const messageId = message.id;
            
            if (isMessageProcessed(messageId)) {
                console.log(`⏩ Duplicate message ${messageId} - ignoring`);
                return res.sendStatus(200);
            }
            
            console.log(`📩 From: ${from} | Type: ${type} | ID: ${messageId}`);
            
            setImmediate(async () => {
                try {
                    if (type === 'image') {
                        await handleWhatsAppImage(message, from);
                    } else if (type === 'text') {
                        await handleWhatsAppMessage(message, from);
                    } else {
                        await sendWhatsAppMessage(from, 
                            `📩 Received your ${type} message.\n\n` +
                            `💡 Please send text or images.\n` +
                            `📞 Call: ${CONFIG.businessPhone}`
                        );
                    }
                } catch (error) {
                    console.error(`❌ Async error: ${error.message}`);
                }
            });
            
            res.sendStatus(200);
            return;
        }
        
        if (value?.statuses) {
            console.log(`📊 Status update received - ignoring`);
            res.sendStatus(200);
            return;
        }
        
        console.log('⚠️ No message found in webhook');
        res.sendStatus(200);
        
    } catch (error) {
        console.error(`❌ Webhook error: ${error.message}`);
        res.sendStatus(200);
    }
});

// ============================================================
// 📤 SEND WHATSAPP MESSAGE
// ============================================================

async function sendWhatsAppMessage(to, message) {
    try {
        const normalizedPhone = to.replace(/\D/g, '');
        const url = `https://graph.facebook.com/v23.0/${CONFIG.phoneNumberId}/messages`;
        
        console.log(`📤 Sending to ${normalizedPhone}`);
        console.log(`📤 Message length: ${message.length}`);
        
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${CONFIG.accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                messaging_product: 'whatsapp',
                to: normalizedPhone,
                type: 'text',
                text: { body: message }
            })
        });
        
        const result = await response.json();
        if (result.messages?.[0]?.id) {
            console.log(`✅ Message sent to ${normalizedPhone}`);
            return result;
        }
        console.error(`❌ WhatsApp error:`, JSON.stringify(result, null, 2));
        return result;
    } catch (error) {
        console.error(`❌ Send error: ${error.message}`);
        throw error;
    }
}

// ============================================================
// 🖼️ IMAGE HANDLING - UPDATED WITH FIXED GEMINI MODELS
// ============================================================

async function handleWhatsAppImage(message, from) {
    try {
        const mediaId = message.image.id;
        const caption = message.image.caption || "";
        const mimeType = message.image.mime_type || 'image/jpeg';
        
        console.log(`📸 ===== PROCESSING IMAGE =====`);
        console.log(`📸 From: ${from}`);
        console.log(`📸 Media ID: ${mediaId}`);
        console.log(`📸 MIME Type: ${mimeType}`);
        console.log(`📸 Caption: "${caption}"`);
        
        // ============================================================
        // STEP 1: Download the image
        // ============================================================
        let imageBuffer;
        try {
            const mediaUrl = await getMediaURL(mediaId);
            console.log(`📸 Downloading from: ${mediaUrl}`);
            imageBuffer = await downloadMedia(mediaUrl);
            console.log(`📸 Image size: ${imageBuffer.length} bytes`);
        } catch (downloadError) {
            console.error(`❌ Image download failed: ${downloadError.message}`);
            await sendWhatsAppMessage(from, 
                `📸 *Image Download Failed!*\n\n` +
                `I couldn't download your image. Please try again.\n\n` +
                `💡 Or send the part number directly.\n` +
                `📝 Example: "0801BA0285N 2"\n\n` +
                `📞 Call: ${CONFIG.businessPhone}`
            );
            return;
        }
        
        let extractedItems = [];
        let source = 'none';
        let errors = [];
        
        // ============================================================
        // STEP 2: Try Gemini Vision FIRST (Primary)
        // ============================================================
        if (CONFIG.geminiKey) {
            try {
                console.log('🤖 Trying Gemini Vision (Primary)...');
                const result = await analyzeImageWithGemini(imageBuffer);
                if (result) {
                    const parsed = parseAIResponse(result);
                    if (parsed.items && parsed.items.length > 0) {
                        extractedItems = parsed.items;
                        source = 'gemini-vision';
                        console.log(`✅ Gemini extracted ${extractedItems.length} items:`, extractedItems);
                    } else {
                        console.log(`⚠️ Gemini returned no items`);
                        errors.push('Gemini: No items found');
                    }
                } else {
                    console.log(`⚠️ Gemini returned null`);
                    errors.push('Gemini: No response');
                }
            } catch (error) {
                console.log(`❌ Gemini Vision failed:`, error.message);
                errors.push(`Gemini: ${error.message}`);
            }
        } else {
            console.log(`⚠️ Gemini key not set, skipping Gemini Vision`);
            errors.push('Gemini: Key not set');
        }
        
        // ============================================================
        // STEP 3: Try OCR (Tesseract) with preprocessing - Fallback
        // ============================================================
        if (extractedItems.length === 0) {
            try {
                console.log('🔍 Trying OCR (Tesseract) with preprocessing...');
                
                // Preprocess image for better OCR
                let processedBuffer = imageBuffer;
                try {
                    const sharp = require('sharp');
                    processedBuffer = await sharp(imageBuffer)
                        .resize(1200, null, { withoutEnlargement: true })
                        .grayscale()
                        .sharpen()
                        .normalize()
                        .toBuffer();
                    console.log(`📸 Image preprocessed: ${processedBuffer.length} bytes`);
                } catch (sharpError) {
                    console.log(`⚠️ Sharp preprocessing failed, using original image`);
                    processedBuffer = imageBuffer;
                }
                
                // Run OCR with Tesseract
                const Tesseract = require('tesseract.js');
                const result = await Tesseract.recognize(
                    processedBuffer,
                    'eng',
                    {
                        logger: m => {
                            if (m.status === 'recognizing text') {
                                console.log(`📸 OCR progress: ${Math.round(m.progress * 100)}%`);
                            }
                        }
                    }
                );
                
                const ocrText = result.data.text;
                console.log(`📸 OCR Text:`, ocrText.substring(0, 300));
                
                // Extract items from OCR text
                const items = extractItemsFromTextUltimate(ocrText);
                if (items && items.length > 0) {
                    extractedItems = items;
                    source = 'ocr';
                    console.log(`✅ OCR extracted ${extractedItems.length} items:`, extractedItems);
                } else {
                    console.log(`⚠️ OCR returned no items`);
                    errors.push('OCR: No items found');
                }
            } catch (error) {
                console.log(`❌ OCR failed:`, error.message);
                errors.push(`OCR: ${error.message}`);
            }
        }
        
        // ============================================================
        // STEP 4: Try caption if available
        // ============================================================
        if (extractedItems.length === 0 && caption && caption.trim().length > 0) {
            console.log(`🔍 Trying caption: "${caption}"`);
            const captionItems = extractItemsFromTextUltimate(caption);
            if (captionItems && captionItems.length > 0) {
                extractedItems = captionItems;
                source = 'caption';
                console.log(`✅ Caption extracted ${extractedItems.length} items:`, extractedItems);
            } else {
                console.log(`⚠️ Caption returned no items`);
                errors.push('Caption: No items found');
            }
        }
        
        // ============================================================
        // STEP 5: Process extracted items
        // ============================================================
        if (extractedItems.length > 0) {
            console.log(`📝 Processing ${extractedItems.length} items from ${source}`);
            const orderText = extractedItems.map(i => `${i.part} ${i.qty || 1}`).join('\n');
            
            const reply = await processOrderFromText(orderText, from);
            if (reply) {
                await sendWhatsAppMessage(from, `📸 *Image Processed (via ${source})*\n\n${reply}`);
                return;
            }
        }
        
        // ============================================================
        // STEP 6: No items found - send helpful message
        // ============================================================
        console.log(`❌ No items extracted. Errors:`, errors);
        
        let errorMessage = `📸 *Photo Received!*\n\n` +
            `I couldn't read any part numbers from the image.\n\n`;
        
        // Show what we tried
        errorMessage += `🔍 *Tried:*\n`;
        if (CONFIG.geminiKey) errorMessage += `• Gemini Vision ${errors.some(e => e.includes('Gemini')) ? '❌' : '✅'}\n`;
        errorMessage += `• OCR (Tesseract) ${errors.some(e => e.includes('OCR')) ? '❌' : '✅'}\n`;
        if (caption) errorMessage += `• Caption text ${errors.some(e => e.includes('Caption')) ? '❌' : '✅'}\n`;
        
        errorMessage += `\n💡 *Tips for better results:*\n` +
            `• Take a clear photo with good lighting\n` +
            `• Make sure part numbers are visible\n` +
            `• Write part numbers clearly\n` +
            `• Or send the part number directly:\n` +
            `  📝 Example: "0801BA0285N 2"\n\n` +
            `📞 Call: ${CONFIG.businessPhone}`;
        
        await sendWhatsAppMessage(from, errorMessage);
        
    } catch (error) {
        console.error(`❌ Image handler error:`, error.message);
        console.error(error.stack);
        await sendWhatsAppMessage(from, 
            `📸 *Sorry, I couldn't process your image.*\n\n` +
            `💡 Please send the part number directly.\n` +
            `📝 Example: "0801BA0285N 2"\n\n` +
            `📞 Call: ${CONFIG.businessPhone}`
        );
    }
}

// ============================================================
// 🤖 GEMINI VISION - UPDATED WITH LATEST AVAILABLE MODELS
// ============================================================

async function analyzeImageWithGemini(imageBuffer) {
    try {
        console.log(`📸 Gemini Vision: Starting...`);
        
        // Check if image is valid
        if (!imageBuffer || imageBuffer.length < 100) {
            console.log(`❌ Gemini Vision: Image too small or empty`);
            return null;
        }
        
        console.log(`📸 Gemini Vision: Image size: ${imageBuffer.length} bytes`);
        
        // Resize if too large (Gemini has 4MB limit for free tier)
        let buffer = imageBuffer;
        if (buffer.length > 3 * 1024 * 1024) {
            console.log(`📸 Gemini Vision: Resizing image (${buffer.length} bytes)...`);
            try {
                const sharp = require('sharp');
                buffer = await sharp(buffer)
                    .resize(800, 800, { fit: 'inside' })
                    .jpeg({ quality: 80 })
                    .toBuffer();
                console.log(`📸 Gemini Vision: Resized to ${buffer.length} bytes`);
            } catch (sharpError) {
                console.log(`⚠️ Sharp resize failed, using original image`);
                buffer = imageBuffer;
            }
        }
        
        const base64Image = buffer.toString('base64');
        console.log(`📸 Gemini Vision: Base64 length: ${base64Image.length}`);
        
        // ✅ Use gemini-3.5-flash (available from your model list)
        // This model supports generateContent with images
        const model = 'gemini-3.5-flash';
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${CONFIG.geminiKey}`;
        console.log(`📸 Gemini Vision: Using model: ${model}`);
        
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        {
                            text: `Extract all part numbers and quantities from this image.

INSTRUCTIONS:
1. Look for part numbers (alphanumeric, 5-20 characters like 0801BA0285N)
2. Look for quantities (numbers after part numbers)
3. Return ONLY valid JSON format
4. If no quantities found, set qty to 1
5. If multiple parts, list all of them

Example: {"items":[{"part":"0801BA0285N","qty":2},{"part":"0303BC0071N","qty":1}]}

Return ONLY the JSON, no other text.`
                        },
                        {
                            inline_data: {
                                mime_type: 'image/jpeg',
                                data: base64Image
                            }
                        }
                    ]
                }],
                generationConfig: {
                    temperature: 0.1,
                    topK: 1,
                    topP: 0.1,
                    maxOutputTokens: 1024
                }
            })
        });
        
        console.log(`📸 Gemini Vision: Response status: ${response.status}`);
        
        const data = await response.json();
        
        // Log response for debugging
        if (data.error) {
            console.log(`❌ Gemini Vision Error:`, data.error.message);
            if (data.error.message && data.error.message.includes('quota')) {
                console.log(`💡 Gemini quota exceeded. You may need to wait or upgrade.`);
            }
            if (data.error.message && data.error.message.includes('no longer available')) {
                console.log(`💡 Model no longer available. Trying fallback models...`);
                return await analyzeImageWithGeminiFallback(imageBuffer);
            }
            if (data.error.message && data.error.message.includes('not found')) {
                console.log(`💡 Model not found. Trying fallback models...`);
                return await analyzeImageWithGeminiFallback(imageBuffer);
            }
            return null;
        }
        
        if (response.ok && data.candidates?.[0]?.content?.parts?.[0]?.text) {
            const content = data.candidates[0].content.parts[0].text;
            console.log(`✅ Gemini Vision: Success! Response length: ${content.length}`);
            console.log(`📸 Gemini Vision: Response preview:`, content.substring(0, 200));
            return content;
        }
        
        console.log(`⚠️ Gemini Vision: No content in response`);
        return null;
        
    } catch (error) {
        console.error(`❌ Gemini Vision Exception:`, error.message);
        return null;
    }
}

// ============================================================
// 🤖 GEMINI VISION FALLBACK - Try all available models
// ============================================================

async function analyzeImageWithGeminiFallback(imageBuffer) {
    // Try all available models from your list that support vision
    const fallbackModels = [
        'gemini-3.5-flash',
        'gemini-3.1-flash-lite',
        'gemini-3.0-flash',
        'gemini-2.0-flash-001',
        'gemini-flash-latest',
        'gemini-flash-lite-latest',
        'gemini-2.0-flash-lite-001',
        'gemini-3.1-flash-image'
    ];
    
    for (const model of fallbackModels) {
        try {
            console.log(`📸 Gemini Vision: Trying fallback model: ${model}`);
            
            // Resize if too large
            let buffer = imageBuffer;
            if (buffer.length > 3 * 1024 * 1024) {
                try {
                    const sharp = require('sharp');
                    buffer = await sharp(buffer)
                        .resize(800, 800, { fit: 'inside' })
                        .jpeg({ quality: 80 })
                        .toBuffer();
                } catch (e) {
                    buffer = imageBuffer;
                }
            }
            
            const base64Image = buffer.toString('base64');
            
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${CONFIG.geminiKey}`;
            
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [
                            {
                                text: `Extract all part numbers and quantities from this image. Return ONLY valid JSON format: {"items":[{"part":"PART123","qty":2}]} If no quantities found, set qty to 1.`
                            },
                            {
                                inline_data: {
                                    mime_type: 'image/jpeg',
                                    data: base64Image
                                }
                            }
                        ]
                    }],
                    generationConfig: {
                        temperature: 0.1,
                        maxOutputTokens: 1024
                    }
                })
            });
            
            console.log(`📸 Gemini Vision Fallback: Response status: ${response.status} for model ${model}`);
            
            const data = await response.json();
            
            if (response.ok && data.candidates?.[0]?.content?.parts?.[0]?.text) {
                const content = data.candidates[0].content.parts[0].text;
                console.log(`✅ Gemini Vision Fallback: Success with ${model}!`);
                return content;
            }
            
            if (data.error) {
                console.log(`❌ Gemini Vision Fallback Error for ${model}:`, data.error.message);
                // If model no longer available, continue to next
                if (data.error.message && data.error.message.includes('no longer available')) {
                    console.log(`⏭️ Model ${model} no longer available, trying next...`);
                    continue;
                }
                if (data.error.message && data.error.message.includes('not found')) {
                    console.log(`⏭️ Model ${model} not found, trying next...`);
                    continue;
                }
            }
            
        } catch (error) {
            console.error(`❌ Gemini Vision Fallback Exception for ${model}:`, error.message);
        }
    }
    
    console.log(`❌ All Gemini Vision models failed`);
    return null;
}

// ============================================================
// 🔧 HELPER FUNCTIONS
// ============================================================

async function getMediaURL(mediaId) {
    try {
        const url = `https://graph.facebook.com/v23.0/${mediaId}`;
        console.log(`📸 Fetching media URL: ${url}`);
        
        const response = await fetch(url, {
            headers: { 
                'Authorization': `Bearer ${CONFIG.accessToken}`
            }
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`❌ Media URL fetch failed: ${response.status} - ${errorText}`);
            throw new Error(`Failed to get media URL: ${response.status}`);
        }
        
        const data = await response.json();
        console.log(`📸 Media URL response:`, JSON.stringify(data, null, 2));
        
        if (!data.url) {
            throw new Error('No URL in media response');
        }
        
        return data.url;
    } catch (error) {
        console.error(`❌ getMediaURL error:`, error.message);
        throw error;
    }
}

async function downloadMedia(mediaUrl) {
    try {
        console.log(`📸 Downloading from: ${mediaUrl}`);
        
        const response = await fetch(mediaUrl, {
            headers: { 
                'Authorization': `Bearer ${CONFIG.accessToken}`
            }
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`❌ Media download failed: ${response.status} - ${errorText}`);
            throw new Error(`Failed to download media: ${response.status}`);
        }
        
        const buffer = await response.arrayBuffer();
        console.log(`📸 Downloaded ${buffer.byteLength} bytes`);
        return Buffer.from(buffer);
    } catch (error) {
        console.error(`❌ downloadMedia error:`, error.message);
        throw error;
    }
}

function parseAIResponse(content) {
    try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed.items && Array.isArray(parsed.items)) {
                return { items: parsed.items };
            }
        }
        return { items: [] };
    } catch (error) {
        console.error('Parse AI response error:', error.message);
        return { items: [] };
    }
}

function extractItemsFromTextUltimate(text) {
    if (!text) return [];
    
    const items = [];
    const lines = text.split(/[,;\n\r]/).map(l => l.trim()).filter(l => l.length > 0);
    
    for (const line of lines) {
        // Pattern: PART123 2 or PART123:2 or PART123=2
        let match = line.match(/\b([A-Z0-9]{5,20})\s*[=\-:|\/]\s*(\d+)\b/i);
        if (match) {
            items.push({ part: match[1].toUpperCase(), qty: parseInt(match[2]) || 1 });
            continue;
        }
        
        // Pattern: 2 PART123
        match = line.match(/(\d+)\s+([A-Z0-9]{5,20})\b/i);
        if (match) {
            items.push({ part: match[2].toUpperCase(), qty: parseInt(match[1]) || 1 });
            continue;
        }
        
        // Pattern: PART123 (no quantity)
        match = line.match(/\b([A-Z0-9]{5,20})\b/i);
        if (match) {
            items.push({ part: match[1].toUpperCase(), qty: 1 });
            continue;
        }
    }
    
    return items;
}

// ============================================================
// 🤖 AI FUNCTIONS
// ============================================================

async function getAIResponse(message, context = '') {
    console.log(`🧠 Getting AI response...`);
    
    // Try ChatGPT first
    if (CONFIG.chatgptKey) {
        try {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${CONFIG.chatgptKey}`
                },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages: [
                        { 
                            role: 'system', 
                            content: `You are an auto spares assistant for "Auto Spares Solution" in India.
                            Reply in Hinglish (Hindi + English mix).
                            Keep responses short (2-3 sentences).
                            Be helpful and friendly.
                            Include our phone number: ${CONFIG.businessPhone}
                            Include our website: https://autosparessolution.com`
                        },
                        { 
                            role: 'user', 
                            content: `Customer asks: "${message}"\n\nContext: ${context}`
                        }
                    ],
                    max_tokens: 150,
                    temperature: 0.7
                })
            });
            const data = await response.json();
            if (response.ok && data.choices?.[0]?.message?.content) {
                console.log('✅ ChatGPT response received');
                return data.choices[0].message.content;
            }
        } catch (error) {
            console.log(`❌ ChatGPT failed: ${error.message}`);
        }
    }
    
    // Try DeepSeek second
    if (CONFIG.deepseekKey) {
        try {
            const response = await fetch('https://api.deepseek.com/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${CONFIG.deepseekKey}`
                },
                body: JSON.stringify({
                    model: 'deepseek-chat',
                    messages: [
                        { 
                            role: 'system', 
                            content: `You are an auto spares assistant for "Auto Spares Solution" in India.
                            Reply in Hinglish.
                            Keep responses short (2-3 sentences).
                            Include our phone number: ${CONFIG.businessPhone}`
                        },
                        { 
                            role: 'user', 
                            content: `Customer asks: "${message}"\n\nContext: ${context}`
                        }
                    ],
                    max_tokens: 150,
                    temperature: 0.7
                })
            });
            const data = await response.json();
            if (response.ok && data.choices?.[0]?.message?.content) {
                console.log('✅ DeepSeek response received');
                return data.choices[0].message.content;
            }
        } catch (error) {
            console.log(`❌ DeepSeek failed: ${error.message}`);
        }
    }
    
    // Try Gemini third
    if (CONFIG.geminiKey) {
        try {
            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${CONFIG.geminiKey}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{
                            parts: [{
                                text: `You are an auto spares assistant for "Auto Spares Solution" in India.
                                Reply in Hinglish.
                                Keep responses short (2-3 sentences).
                                Include our phone number: ${CONFIG.businessPhone}
                                Include our website: https://autosparessolution.com
                                Customer asks: "${message}"
                                Context: ${context}`
                            }]
                        }]
                    })
                }
            );
            const data = await response.json();
            if (response.ok && data.candidates?.[0]?.content?.parts?.[0]?.text) {
                console.log('✅ Gemini response received');
                return data.candidates[0].content.parts[0].text;
            }
        } catch (error) {
            console.log(`❌ Gemini failed: ${error.message}`);
        }
    }
    
    console.log('⚠️ All AI providers failed');
    return null;
}

// ============================================================
// 🤖 AI ORDER PARSER - Helps parse complex order formats
// ============================================================

async function aiParseOrder(text, detectedParts) {
    console.log(`🤖 AI Parsing order: "${text}"`);
    
    const context = `Customer sent: "${text}"
Detected part numbers: ${detectedParts.join(', ')}

Please parse this order and return JSON format:
{"items":[{"part":"PART123","qty":2},{"part":"PART456","qty":1}]}

Rules:
1. Each item must have a part number and quantity
2. If quantity is not specified, use 1
3. Only include valid part numbers from the detected list
4. Return ONLY valid JSON, no other text`;

    // Try ChatGPT first
    if (CONFIG.chatgptKey) {
        try {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${CONFIG.chatgptKey}`
                },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages: [
                        { 
                            role: 'system', 
                            content: 'You are an order parser. Extract part numbers and quantities from customer messages. Return ONLY valid JSON.'
                        },
                        { 
                            role: 'user', 
                            content: context
                        }
                    ],
                    max_tokens: 200,
                    temperature: 0
                })
            });
            const data = await response.json();
            if (response.ok && data.choices?.[0]?.message?.content) {
                const content = data.choices[0].message.content;
                const parsed = parseAIOrderResponse(content);
                if (parsed && parsed.length > 0) {
                    console.log('✅ ChatGPT parsed order:', parsed);
                    return parsed;
                }
            }
        } catch (error) {
            console.log('❌ ChatGPT order parsing failed:', error.message);
        }
    }
    
    // Try Gemini if ChatGPT fails
    if (CONFIG.geminiKey) {
        try {
            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${CONFIG.geminiKey}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{
                            parts: [{
                                text: `You are an order parser. Extract part numbers and quantities from this customer message:
                                
"${text}"

Detected part numbers: ${detectedParts.join(', ')}

Return ONLY valid JSON: {"items":[{"part":"PART123","qty":2}]}
If quantity not specified, use 1.`
                            }]
                        }]
                    })
                }
            );
            const data = await response.json();
            if (response.ok && data.candidates?.[0]?.content?.parts?.[0]?.text) {
                const content = data.candidates[0].content.parts[0].text;
                const parsed = parseAIOrderResponse(content);
                if (parsed && parsed.length > 0) {
                    console.log('✅ Gemini parsed order:', parsed);
                    return parsed;
                }
            }
        } catch (error) {
            console.log('❌ Gemini order parsing failed:', error.message);
        }
    }
    
    return null;
}

function parseAIOrderResponse(content) {
    try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed.items && Array.isArray(parsed.items)) {
                return parsed.items;
            }
        }
        return null;
    } catch (error) {
        console.error('Parse AI order response error:', error.message);
        return null;
    }
}

// ============================================================
// 🔍 CALCULATE SIMILARITY BETWEEN TWO STRINGS
// ============================================================

function calculateSimilarity(str1, str2) {
    if (!str1 || !str2) return 0;
    
    const s1 = str1.toUpperCase();
    const s2 = str2.toUpperCase();
    
    // Exact match
    if (s1 === s2) return 1.0;
    
    // Check if one contains the other
    if (s1.includes(s2) || s2.includes(s1)) {
        return 0.8;
    }
    
    // Calculate Levenshtein distance
    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;
    
    if (longer.length === 0) return 1.0;
    
    const distance = levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
}

function levenshteinDistance(str1, str2) {
    const m = str1.length;
    const n = str2.length;
    const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
    
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (str1[i - 1] === str2[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1];
            } else {
                dp[i][j] = Math.min(
                    dp[i - 1][j] + 1,
                    dp[i][j - 1] + 1,
                    dp[i - 1][j - 1] + 1
                );
            }
        }
    }
    return dp[m][n];
}

// ============================================================
// 📋 PROCESS ORDER FROM TEXT
// ============================================================

async function processOrderFromText(text, from) {
    const items = extractItemsFromTextUltimate(text);
    if (items.length === 0) return null;
    
    let cartItems = [];
    let total = 0;
    let notFound = [];
    let outOfStock = [];
    
    for (const item of items) {
        // ✅ Try EXACT match first
        let product = await db.getProductExact(item.part);
        
        // If no exact match, try fuzzy
        if (!product) {
            console.log(`🔍 No exact match for ${item.part}, trying fuzzy...`);
            const results = await db.searchProducts(item.part, 1);
            if (results && results.length > 0) {
                const firstResult = results[0];
                const similarity = calculateSimilarity(item.part, firstResult.part);
                if (similarity >= 0.7) {
                    product = firstResult;
                    console.log(`📦 Using fuzzy match: ${firstResult.part} (similarity: ${similarity})`);
                }
            }
        }
        
        if (product) {
            const billingPrice = product.billing_price || product.list_price || 0;
            const priceWithGST = billingPrice * 1.18;
            const itemTotal = priceWithGST * item.qty;
            
            cartItems.push({
                part: product.part,
                requestedPart: item.part,
                description: product.description,
                qty: item.qty,
                price: priceWithGST,
                list_price: product.list_price,
                mrp: product.mrp,
                billing_price: billingPrice
            });
            
            total += itemTotal;
            
            if (product.stock === 0) {
                outOfStock.push(product.part);
            }
        } else {
            notFound.push(item.part);
        }
    }
    
    if (notFound.length > 0 && cartItems.length === 0) {
        return `❌ Products not found: ${notFound.join(', ')}\n\n💡 Please check the part numbers.`;
    }
    
    await db.saveCart(from, cartItems, total, total);
    
    let reply = `🛒 *ORDER SUMMARY*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
    
    for (const item of cartItems) {
        const itemTotal = item.price * item.qty;
        reply += `*${item.part}*`;
        if (item.requestedPart && item.requestedPart !== item.part) {
            reply += ` (matched: ${item.requestedPart})`;
        }
        reply += ` x${item.qty}\n`;
        reply += `📝 ${item.description}\n`;
        if (item.list_price > 0) reply += `💰 LIST: ₹${item.list_price.toFixed(2)}\n`;
        if (item.mrp > 0) reply += `💰 MRP: ₹${item.mrp.toFixed(2)}\n`;
        reply += `💳 ₹${item.price.toFixed(2)} × ${item.qty} = ₹${itemTotal.toFixed(2)}\n\n`;
    }
    
    reply += `━━━━━━━━━━━━━━━━━━━━\n`;
    reply += `💰 *Total: ₹${total.toFixed(2)}* (incl. GST)\n`;
    reply += `━━━━━━━━━━━━━━━━━━━━\n\n`;
    
    if (outOfStock.length > 0) {
        reply += `⚠️ Out of Stock: ${outOfStock.join(', ')}\n`;
        reply += `🔔 We'll notify you when available.\n\n`;
    }
    
    if (notFound.length > 0) {
        reply += `❌ Not found: ${notFound.join(', ')}\n\n`;
    }
    
    reply += `✅ *Confirm order?* Reply "Confirm Order"\n`;
    reply += `🗑️ *Clear Cart* - Start fresh\n\n`;
    reply += `📞 Call: ${CONFIG.businessPhone}`;
    
    return reply;
}

// ============================================================
// 🔍 FORMAT PRODUCT FOR WHATSAPP
// ============================================================

function formatProductForWhatsApp(product, index = 0) {
    const billingPrice = product.billing_price || product.list_price || 0;
    const priceWithGST = billingPrice * 1.18;
    const gstAmount = billingPrice * 0.18;
    
    let reply = `${index + 1}. *${product.part}*\n`;
    reply += `📝 ${product.description || 'N/A'}\n`;
    
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
    
    if (product.model) {
        reply += `🚗 Model: ${product.model}`;
        if (product.segment) {
            reply += ` | Segment: ${product.segment}`;
        }
        reply += `\n`;
    }
    
    if (product.list_price > 0) {
        reply += `💰 LIST PRICE: ₹${product.list_price.toFixed(2)}\n`;
    }
    if (product.mrp > 0) {
        reply += `💰 MRP PRICE: ₹${product.mrp.toFixed(2)}\n`;
    }
    if (billingPrice > 0) {
        reply += `💳 Billing Price: ₹${billingPrice.toFixed(2)}\n`;
        reply += `🧾 GST (18%): ₹${gstAmount.toFixed(2)}\n`;
        reply += `💳 Price incl. GST: ₹${priceWithGST.toFixed(2)}\n`;
    }
    
    let stockInfo = [];
    if (product.stock > 0) {
        stockInfo.push(`✅ ${product.stock} pcs`);
        if (product.most_selling) {
            stockInfo.push(`⭐ Best Seller`);
        }
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
    
    if (product.hsn) {
        reply += `📋 HSN: ${product.hsn}\n`;
    }
    
    return reply;
}

// ============================================================
// 📩 HANDLE WHATSAPP MESSAGE - COMPLETE FIXED
// ============================================================

async function handleWhatsAppMessage(message, from) {
    try {
        const text = message.text?.body || '';
        console.log(`💬 Message: "${text}"`);
        
        const cleaned = text
            .replace(/^["']|["']$/g, '')
            .replace(/["']/g, '')
            .replace(/\s+/g, ' ')
            .trim();
        console.log(`📝 Cleaned: "${cleaned}"`);
        
        const msgLower = cleaned.toLowerCase().trim();
        
        // ============================================================
        // STEP 1: WELCOME / HELP
        // ============================================================
        if (msgLower === 'hi' || msgLower === 'hello' || msgLower === 'help' || msgLower === 'start' || msgLower === 'menu') {
            const welcome = 
                `👋 *Welcome to Auto Spares Solution!*\n\n` +
                `🤖 I'm your AI Sales Assistant\n\n` +
                `🔍 *Search Parts:*\n` +
                `Send part number like "0801BA0285N"\n` +
                `Send description like "clutch plate"\n` +
                `Send brand like "M&M"\n\n` +
                `📦 *Multiple Products:*\n` +
                `"0802CAA08871N 2\n0801BA0285N 2"\n` +
                `"0801BA0285N 2, 0303BC0071N 3"\n` +
                `"0703EAH00670N\n0703EAH00680N"\n\n` +
                `📸 *Send Photo:*\n` +
                `Take a photo of your order list\n\n` +
                `💰 *Check Price:*\n` +
                `"Price 0801BA0285N"\n\n` +
                `📦 *Check Stock:*\n` +
                `"Stock 0303BC0071N"\n\n` +
                `🛒 *Place Order:*\n` +
                `"Order 0801BA0285N 2"\n\n` +
                `📞 *Call:* ${CONFIG.businessPhone}\n` +
                `🛒 *Shop:* https://autosparessolution.com\n\n` +
                `*How can I help you today?* 🚗`;
            
            await sendWhatsAppMessage(from, welcome);
            return;
        }
        
        // ============================================================
        // STEP 2: PRICE CHECK
        // ============================================================
        if (msgLower.includes('price') || msgLower.includes('cost') || msgLower.includes('rate')) {
            const partNumber = extractPartNumber(cleaned);
            if (partNumber) {
                // ✅ Try EXACT match first
                let product = await db.getProductExact(partNumber);
                if (!product) {
                    product = await db.getProduct(partNumber);
                }
                
                if (product) {
                    const billingPrice = product.billing_price || product.list_price || 0;
                    const priceWithGST = billingPrice * 1.18;
                    const gstAmount = billingPrice * 0.18;
                    
                    let reply = `💰 *Price: ${product.part}*\n\n`;
                    reply += `📝 ${product.description}\n`;
                    if (product.brand) reply += `🏷️ Brand: ${product.brand}\n`;
                    if (product.list_price > 0) reply += `💰 LIST PRICE: ₹${product.list_price.toFixed(2)}\n`;
                    if (product.mrp > 0) reply += `💰 MRP PRICE: ₹${product.mrp.toFixed(2)}\n`;
                    reply += `💳 Billing Price: ₹${billingPrice.toFixed(2)}\n`;
                    reply += `🧾 GST (18%): ₹${gstAmount.toFixed(2)}\n`;
                    reply += `💳 *Total: ₹${priceWithGST.toFixed(2)} (incl. GST)*\n\n`;
                    reply += `📦 Stock: ${product.stock > 0 ? `✅ ${product.stock} pcs` : '❌ Out of Stock'}`;
                    if (product.box_qty > 0) reply += ` | Box: ${product.box_qty}`;
                    if (product.carton > 0) reply += ` | Carton: ${product.carton}`;
                    
                    await sendWhatsAppMessage(from, reply);
                    return;
                } else {
                    await sendWhatsAppMessage(from, `❌ Product "${partNumber}" not found. Please check the part number.`);
                    return;
                }
            }
        }
        
        // ============================================================
        // STEP 3: STOCK CHECK
        // ============================================================
        if (msgLower.includes('stock') || msgLower.includes('available')) {
            const partNumber = extractPartNumber(cleaned);
            if (partNumber) {
                // ✅ Try EXACT match first
                let product = await db.getProductExact(partNumber);
                if (!product) {
                    product = await db.getProduct(partNumber);
                }
                
                if (product) {
                    let reply = `📦 *Stock: ${product.part}*\n\n`;
                    reply += `📝 ${product.description}\n`;
                    reply += `📦 ${product.stock > 0 ? `✅ ${product.stock} pcs available` : '❌ Out of Stock'}`;
                    if (product.box_qty > 0) reply += ` | Box: ${product.box_qty}`;
                    if (product.carton > 0) reply += ` | Carton: ${product.carton}`;
                    await sendWhatsAppMessage(from, reply);
                    return;
                } else {
                    await sendWhatsAppMessage(from, `❌ Product "${partNumber}" not found. Please check the part number.`);
                    return;
                }
            }
        }
        
        // ============================================================
        // STEP 4: CONFIRM ORDER
        // ============================================================
        if (msgLower === 'confirm order' || msgLower === 'confirm') {
            const cart = await db.getCart(from);
            if (cart && cart.items) {
                const items = JSON.parse(cart.items);
                const orderId = `ORD-${Date.now().toString().slice(-6)}`;
                await db.saveOrder(orderId, from, items, cart.total);
                await db.clearCart(from);
                
                let reply = `✅ *ORDER CONFIRMED!*\n\n`;
                reply += `📦 Order ID: ${orderId}\n`;
                reply += `📝 Items:\n`;
                items.forEach((item, index) => {
                    reply += `   ${index + 1}. ${item.part} x${item.qty} = ₹${(item.price * item.qty).toFixed(2)}\n`;
                });
                reply += `💰 Total: ₹${cart.total.toFixed(2)}\n`;
                reply += `📞 *Call:* ${CONFIG.businessPhone}\n`;
                reply += `🛒 *Shop:* https://autosparessolution.com`;
                await sendWhatsAppMessage(from, reply);
                return;
            }
            await sendWhatsAppMessage(from, '🛒 Your cart is empty. Add items first!');
            return;
        }
        
        // ============================================================
        // STEP 5: CLEAR CART
        // ============================================================
        if (msgLower === 'clear cart' || msgLower === 'clear') {
            await db.clearCart(from);
            await sendWhatsAppMessage(from, '🗑️ Cart cleared!');
            return;
        }
        
        // ============================================================
        // ✅ STEP 6: MULTI-PRODUCT DETECTION - FIRST PRIORITY
        // ============================================================
        
        // Extract all potential part numbers
        const allParts = text.match(/\b[A-Z0-9]{5,20}\b/gi);
        const uniqueParts = allParts ? [...new Set(allParts.map(p => p.toUpperCase()))] : [];
        const hasMultipleParts = uniqueParts.length > 1;
        const hasNewLines = text.includes('\n');
        const hasCommas = text.includes(',');
        const hasSemicolons = text.includes(';');
        
        const isMultiProduct = hasMultipleParts || hasNewLines || hasCommas || hasSemicolons;
        
        console.log(`🔍 Multi-product detection:`);
        console.log(`   Parts found: ${uniqueParts.join(', ')}`);
        console.log(`   Multiple parts: ${hasMultipleParts}`);
        console.log(`   Has new lines: ${hasNewLines}`);
        console.log(`   Has commas: ${hasCommas}`);
        console.log(`   Is multi-product: ${isMultiProduct}`);
        
        // ============================================================
        // ✅ MULTI-PRODUCT PROCESSING - WITH EXACT MATCH FIRST
        // ============================================================
        if (isMultiProduct) {
            console.log(`📋 Processing multi-product enquiry...`);
            
            // Try to parse with order parser first
            let { items, unparsed } = parseOrder(text);
            
            // If parser found nothing, use AI to help parse
            if (items.length === 0 && uniqueParts.length > 0) {
                console.log(`🤖 Parser failed. Using AI to parse order...`);
                
                const aiParsed = await aiParseOrder(text, uniqueParts);
                if (aiParsed && aiParsed.length > 0) {
                    items = aiParsed;
                    console.log(`✅ AI parsed ${items.length} items:`, items);
                } else {
                    items = uniqueParts.map(part => ({ part, qty: 1 }));
                    console.log(`📦 Created ${items.length} items from part numbers`);
                }
            }
            
            if (items.length > 0) {
                let foundItems = [];
                let notFound = [];
                let outOfStock = [];
                
                for (const item of items) {
                    // ✅ Try EXACT match FIRST
                    let product = await db.getProductExact(item.part);
                    
                    // If no exact match, try fuzzy search
                    if (!product) {
                        console.log(`🔍 No exact match for ${item.part}, trying fuzzy...`);
                        const results = await db.searchProducts(item.part, 1);
                        if (results && results.length > 0) {
                            const firstResult = results[0];
                            const similarity = calculateSimilarity(item.part, firstResult.part);
                            if (similarity >= 0.7) {
                                product = firstResult;
                                console.log(`📦 Using fuzzy match: ${firstResult.part} (similarity: ${similarity})`);
                            }
                        }
                    }
                    
                    if (product) {
                        const billingPrice = product.billing_price || product.list_price || 0;
                        const priceWithGST = billingPrice * 1.18;
                        
                        foundItems.push({
                            part: product.part,
                            requestedPart: item.part,
                            description: product.description,
                            qty: item.qty || 1,
                            price: priceWithGST,
                            list_price: product.list_price,
                            mrp: product.mrp,
                            billing_price: billingPrice,
                            stock: product.stock,
                            brand: product.brand,
                            make: product.make,
                            model: product.model,
                            box_qty: product.box_qty,
                            carton: product.carton,
                            hsn: product.hsn,
                            most_selling: product.most_selling
                        });
                        
                        if (product.stock === 0) {
                            outOfStock.push(product.part);
                        }
                    } else {
                        notFound.push(item.part);
                    }
                }
                
                // If all products not found, show not found
                if (notFound.length > 0 && foundItems.length === 0) {
                    await sendWhatsAppMessage(from, 
                        `❌ Products not found: ${notFound.join(', ')}\n\n` +
                        `💡 Please check the part numbers and try again.\n` +
                        `💡 Or send "Help" for options\n\n` +
                        `📞 Call: ${CONFIG.businessPhone}`
                    );
                    return;
                }
                
                if (foundItems.length > 0) {
                    // Save to cart
                    const cartItems = foundItems.map(item => ({
                        part: item.part,
                        description: item.description,
                        qty: item.qty,
                        price: item.price,
                        list_price: item.list_price,
                        mrp: item.mrp,
                        billing_price: item.billing_price
                    }));
                    
                    const total = foundItems.reduce((sum, item) => sum + (item.price * item.qty), 0);
                    await db.saveCart(from, cartItems, total, total);
                    
                    let reply = `📋 *MULTI-PRODUCT ENQUIRY*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
                    
                    let index = 1;
                    for (const item of foundItems) {
                        const itemTotal = item.price * item.qty;
                        
                        reply += `${index}. *${item.part}*`;
                        if (item.requestedPart && item.requestedPart !== item.part) {
                            reply += ` (matched: ${item.requestedPart})`;
                        }
                        if (item.qty > 1) reply += ` x${item.qty}`;
                        reply += `\n`;
                        reply += `📝 ${item.description}\n`;
                        if (item.brand && item.brand !== 'Unknown') {
                            reply += `🏷️ Brand: ${item.brand}`;
                            if (item.make && item.make !== 'Unknown') {
                                reply += ` | Make: ${item.make}`;
                            }
                            reply += `\n`;
                        }
                        if (item.model) {
                            reply += `🚗 Model: ${item.model}\n`;
                        }
                        if (item.list_price > 0) {
                            reply += `💰 LIST PRICE: ₹${item.list_price.toFixed(2)}\n`;
                        }
                        if (item.mrp > 0) {
                            reply += `💰 MRP PRICE: ₹${item.mrp.toFixed(2)}\n`;
                        }
                        reply += `💳 Price: ₹${item.price.toFixed(2)} (incl. GST)\n`;
                        reply += `📦 ${item.stock > 0 ? `✅ ${item.stock} pcs` : '❌ Out of Stock'}`;
                        if (item.box_qty > 0) reply += ` | Box: ${item.box_qty}`;
                        if (item.carton > 0) reply += ` | Carton: ${item.carton}`;
                        if (item.hsn) reply += `\n📋 HSN: ${item.hsn}`;
                        reply += `\n\n`;
                        index++;
                    }
                    
                    reply += `━━━━━━━━━━━━━━━━━━━━\n`;
                    reply += `💰 *Total: ₹${total.toFixed(2)}* (incl. GST)\n`;
                    reply += `━━━━━━━━━━━━━━━━━━━━\n\n`;
                    
                    if (outOfStock.length > 0) {
                        reply += `⚠️ Out of Stock: ${outOfStock.join(', ')}\n`;
                        reply += `🔔 We'll notify you when available.\n\n`;
                    }
                    
                    if (notFound.length > 0) {
                        reply += `❌ Not found: ${notFound.join(', ')}\n\n`;
                    }
                    
                    reply += `✅ *Confirm order?* Reply "Confirm Order"\n`;
                    reply += `🗑️ *Clear Cart* - Start fresh\n\n`;
                    reply += `📞 Call: ${CONFIG.businessPhone}`;
                    
                    await sendWhatsAppMessage(from, reply);
                    return;
                }
            }
        }
        
        // ============================================================
        // STEP 7: SINGLE PRODUCT ORDER
        // ============================================================
        const partNumber = extractPartNumber(cleaned);
        const quantity = extractQuantity(cleaned);
        
        if (partNumber && quantity && quantity > 0) {
            // ✅ Try EXACT match first
            let product = await db.getProductExact(partNumber);
            if (!product) {
                product = await db.getProduct(partNumber);
            }
            
            if (product) {
                const billingPrice = product.billing_price || product.list_price || 0;
                const priceWithGST = billingPrice * 1.18;
                const total = priceWithGST * quantity;
                
                const cartItems = [{
                    part: product.part,
                    description: product.description,
                    qty: quantity,
                    price: priceWithGST,
                    list_price: product.list_price,
                    mrp: product.mrp,
                    billing_price: billingPrice
                }];
                
                await db.saveCart(from, cartItems, total, total);
                
                let reply = `🛒 *ORDER SUMMARY*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
                reply += `*${product.part}* x${quantity}\n`;
                reply += `📝 ${product.description}\n`;
                if (product.list_price > 0) reply += `💰 LIST: ₹${product.list_price.toFixed(2)}\n`;
                if (product.mrp > 0) reply += `💰 MRP: ₹${product.mrp.toFixed(2)}\n`;
                reply += `💳 ₹${priceWithGST.toFixed(2)} × ${quantity} = ₹${total.toFixed(2)}\n\n`;
                reply += `━━━━━━━━━━━━━━━━━━━━\n`;
                reply += `💰 *Total: ₹${total.toFixed(2)}* (incl. GST)\n`;
                reply += `━━━━━━━━━━━━━━━━━━━━\n\n`;
                
                if (product.stock === 0) {
                    reply += `⚠️ Out of Stock\n🔔 We'll notify you when available.\n\n`;
                } else if (product.stock < quantity) {
                    reply += `⚠️ Only ${product.stock} available (requested ${quantity})\n\n`;
                }
                
                reply += `✅ *Confirm order?* Reply "Confirm Order"\n`;
                reply += `🗑️ *Clear Cart* - Start fresh\n\n`;
                reply += `📞 Call: ${CONFIG.businessPhone}`;
                
                await sendWhatsAppMessage(from, reply);
                return;
            } else {
                await sendWhatsAppMessage(from, `❌ Product "${partNumber}" not found. Please check the part number.`);
                return;
            }
        }
        
        // ============================================================
        // STEP 8: SEARCH PRODUCTS (Single part number, no quantity)
        // ============================================================
        if (partNumber) {
            // ✅ Try EXACT match first
            let exactProduct = await db.getProductExact(partNumber);
            
            if (exactProduct) {
                // Found exact match - show single product
                let reply = `🔍 Found 1 result(s)\n\n`;
                reply += formatProductForWhatsApp(exactProduct, 0);
                reply += `\n`;
                reply += `━━━━━━━━━━━━━━━━━━━━\n`;
                reply += `🛒 To order: Send part number with quantity\n`;
                reply += `📝 Example: "${exactProduct.part} 2"\n`;
                reply += `━━━━━━━━━━━━━━━━━━━━\n`;
                reply += `🛒 Order: https://autosparessolution.com\n`;
                reply += `📞 Call: ${CONFIG.businessPhone}`;
                
                await sendWhatsAppMessage(from, reply);
                return;
            }
            
            // No exact match - try fuzzy search
            const results = await db.searchProducts(partNumber, 5);
            if (results.length > 0) {
                let reply = `🔍 Found ${results.length} result(s)\n\n`;
                results.forEach((p, i) => {
                    reply += formatProductForWhatsApp(p, i);
                    reply += `\n`;
                });
                reply += `━━━━━━━━━━━━━━━━━━━━\n`;
                reply += `🛒 To order: Send part number with quantity\n`;
                reply += `📝 Example: "${results[0]?.part} 2"\n`;
                reply += `━━━━━━━━━━━━━━━━━━━━\n`;
                reply += `🛒 Order: https://autosparessolution.com\n`;
                reply += `📞 Call: ${CONFIG.businessPhone}`;
                
                await sendWhatsAppMessage(from, reply);
                return;
            }
        }
        
        // ============================================================
        // STEP 9: AI FALLBACK (Natural Language)
        // ============================================================
        console.log(`🔄 No product found. Trying AI...`);
        const aiReply = await getAIResponse(text);
        if (aiReply) {
            await sendWhatsAppMessage(from, `🤖 ${aiReply}`);
            return;
        }
        
        // ============================================================
        // STEP 10: NO RESULTS
        // ============================================================
        await sendWhatsAppMessage(from, 
            `🔍 No results found for "${text}"\n\n` +
            `💡 Try sending a part number like "0801BA0285N"\n` +
            `💡 Or send "Help" for options\n\n` +
            `📞 Call: ${CONFIG.businessPhone}`
        );
        
    } catch (error) {
        console.error(`❌ Message handler error: ${error.message}`);
        console.error(error.stack);
        await sendWhatsAppMessage(from, '⚠️ Sorry, something went wrong. Please try again.');
    }
}

// ============================================================
// 🚀 START SERVER
// ============================================================

async function startServer() {
    console.log('====================================');
    console.log('🚀 ASSIST WhatsApp Webhook v3.0 - COMPLETE FIXED');
    console.log(`📞 Business Phone: ${CONFIG.businessPhone}`);
    console.log(`🆔 Phone Number ID: ${CONFIG.phoneNumberId}`);
    console.log(`🗄️ Database: ${process.env.DB_PATH || './db/products.db'}`);
    console.log('====================================');
    
    try {
        await db.initDatabase();
        console.log('✅ Database initialized');
        
        const csvPath = path.join(__dirname, 'prices.csv');
        if (fs.existsSync(csvPath)) {
            console.log('📥 Importing CSV...');
            const result = await importCSV(csvPath);
            console.log(`✅ Imported ${result.imported} products`);
        } else {
            console.log('⚠️ prices.csv not found - using sample data');
            await db.importProducts([
                { part: '0801BA0285N', description: 'CLUTCH DISC ASSEMBLY DIA 240 mm', brand: 'M&M', make: 'MARUTI', list_price: 2103.53, mrp: 2482.17, billing_price: 2103.53, stock: 19, box_qty: 1, carton: 12, gst: 18 },
                { part: '0303BC0071N', description: 'ELEMENT OIL FILTER', brand: 'M&M', make: 'MARUTI', list_price: 182.86, mrp: 215.77, billing_price: 182.86, stock: 462, box_qty: 10, carton: 100, gst: 18 }
            ]);
            console.log('✅ Added sample products');
        }
        
        const stats = await db.getStats();
        console.log(`📦 ${stats.total_products || 0} products in database`);
        console.log(`📦 ${stats.in_stock || 0} in stock`);
        console.log('====================================');
        
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`🚀 Server Running On Port ${PORT}`);
            console.log(`🔗 Health Check: /health`);
            console.log(`📱 Webhook: /webhook`);
            console.log(`🔑 Test Gemini: /api/test-gemini`);
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
