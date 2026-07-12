// ============================================================
// 🚀 ASSIST WhatsApp Webhook v3.0 - COMPLETE FIXED
// Features: Exact match first, Multi-product, AI Vision, AI Order Parsing
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
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${CONFIG.geminiKey}`,
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
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${CONFIG.geminiKey}`,
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
// 🖼️ IMAGE HANDLING WITH AI VISION
// ============================================================

async function handleWhatsAppImage(message, from) {
    try {
        const mediaId = message.image.id;
        const caption = message.image.caption || "";
        const mimeType = message.image.mime_type || 'image/jpeg';
        
        console.log(`📸 Processing image from: ${from}`);
        console.log(`📸 Media ID: ${mediaId}`);
        console.log(`📸 Caption: "${caption}"`);
        
        // Download image
        const mediaUrl = await getMediaURL(mediaId);
        console.log(`📸 Downloading from: ${mediaUrl}`);
        const imageBuffer = await downloadMedia(mediaUrl);
        console.log(`📸 Image size: ${imageBuffer.length} bytes`);
        
        let extractedItems = [];
        let source = 'none';
        
        // Try GPT-4o Vision
        if (CONFIG.chatgptKey) {
            try {
                console.log('🤖 Trying GPT-4o Vision...');
                const result = await analyzeImageWithGPT4o(imageBuffer);
                if (result) {
                    const parsed = parseAIResponse(result);
                    if (parsed.items && parsed.items.length > 0) {
                        extractedItems = parsed.items;
                        source = 'gpt4o-vision';
                        console.log(`✅ GPT-4o extracted ${extractedItems.length} items`);
                    }
                }
            } catch (error) {
                console.log('❌ GPT-4o Vision failed:', error.message);
            }
        }
        
        // Try Gemini Vision
        if (extractedItems.length === 0 && CONFIG.geminiKey) {
            try {
                console.log('🤖 Trying Gemini Vision...');
                const result = await analyzeImageWithGemini(imageBuffer);
                if (result) {
                    const parsed = parseAIResponse(result);
                    if (parsed.items && parsed.items.length > 0) {
                        extractedItems = parsed.items;
                        source = 'gemini-vision';
                        console.log(`✅ Gemini extracted ${extractedItems.length} items`);
                    }
                }
            } catch (error) {
                console.log('❌ Gemini Vision failed:', error.message);
            }
        }
        
        // Try caption
        if (extractedItems.length === 0 && caption && caption.trim().length > 0) {
            const captionItems = extractItemsFromTextUltimate(caption);
            if (captionItems && captionItems.length > 0) {
                extractedItems = captionItems;
                source = 'caption';
                console.log(`✅ Caption extracted ${extractedItems.length} items`);
            }
        }
        
        // Process items
        if (extractedItems.length > 0) {
            const orderText = extractedItems.map(i => `${i.part} ${i.qty || 1}`).join('\n');
            console.log(`📝 Processing order from image: ${orderText}`);
            
            const reply = await processOrderFromText(orderText, from);
            if (reply) {
                await sendWhatsAppMessage(from, `📸 *Image Processed (via ${source})*\n\n${reply}`);
                return;
            }
        }
        
        await sendWhatsAppMessage(from, 
            `📸 *Photo Received!*\n\n` +
            `I couldn't read any part numbers from the image${caption ? ' or caption' : ''}.\n\n` +
            `💡 Please send the part number directly.\n` +
            `📝 Example: "0801BA0285N 2"\n\n` +
            `📞 Call: ${CONFIG.businessPhone}`
        );
        
    } catch (error) {
        console.error(`❌ Image error: ${error.message}`);
        await sendWhatsAppMessage(from, `📸 Sorry, I couldn't process your image.\n\n📞 Call: ${CONFIG.businessPhone}`);
    }
}

async function analyzeImageWithGPT4o(imageBuffer) {
    try {
        const base64Image = imageBuffer.toString('base64');
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${CONFIG.chatgptKey}`
            },
            body: JSON.stringify({
                model: 'gpt-4o',
                messages: [
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'text',
                                text: `Extract all part numbers and quantities from this image.
                                Return ONLY valid JSON: {"items":[{"part":"PART123","qty":2}]}
                                If no quantities, set qty to 1.`
                            },
                            {
                                type: 'image_url',
                                image_url: {
                                    url: `data:image/jpeg;base64,${base64Image}`
                                }
                            }
                        ]
                    }
                ],
                max_tokens: 500,
                temperature: 0
            })
        });
        const data = await response.json();
        if (response.ok && data.choices?.[0]?.message?.content) {
            return data.choices[0].message.content;
        }
        return null;
    } catch (error) {
        console.error('GPT-4o Vision error:', error.message);
        return null;
    }
}

async function analyzeImageWithGemini(imageBuffer) {
    try {
        const base64Image = imageBuffer.toString('base64');
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro-vision:generateContent?key=${CONFIG.geminiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [
                            {
                                text: `Extract all part numbers and quantities from this image.
                                Return ONLY valid JSON: {"items":[{"part":"PART123","qty":2}]}
                                If no quantities, set qty to 1.`
                            },
                            {
                                inline_data: {
                                    mime_type: 'image/jpeg',
                                    data: base64Image
                                }
                            }
                        ]
                    }]
                })
            }
        );
        const data = await response.json();
        if (response.ok && data.candidates?.[0]?.content?.parts?.[0]?.text) {
            return data.candidates[0].content.parts[0].text;
        }
        return null;
    } catch (error) {
        console.error('Gemini Vision error:', error.message);
        return null;
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

async function getMediaURL(mediaId) {
    const url = `https://graph.facebook.com/v23.0/${mediaId}`;
    const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${CONFIG.accessToken}` }
    });
    const data = await response.json();
    return data.url;
}

async function downloadMedia(mediaUrl) {
    const response = await fetch(mediaUrl, {
        headers: { 'Authorization': `Bearer ${CONFIG.accessToken}` }
    });
    const buffer = await response.arrayBuffer();
    return Buffer.from(buffer);
}

// ============================================================
// 📋 EXTRACT ITEMS FROM TEXT
// ============================================================

function extractItemsFromTextUltimate(text) {
    const items = [];
    const lines = text.split(/[,;\n]/).map(l => l.trim()).filter(l => l.length > 0);
    
    for (const line of lines) {
        let match = line.match(/\b([A-Z0-9]{5,20})\s*[=\-:|\/]\s*(\d+)\b/i);
        if (match) {
            items.push({ part: match[1].toUpperCase(), qty: parseInt(match[2]) || 1 });
            continue;
        }
        
        match = line.match(/(\d+)\s+([A-Z0-9]{5,20})\b/i);
        if (match) {
            items.push({ part: match[2].toUpperCase(), qty: parseInt(match[1]) || 1 });
            continue;
        }
        
        match = line.match(/\b([A-Z0-9]{5,20})\b/i);
        if (match) {
            items.push({ part: match[1].toUpperCase(), qty: 1 });
            continue;
        }
    }
    
    return items;
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
