// ============================================================
// 🎨 AI BROCHURE GENERATOR WITH IMAGES
// ============================================================

const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage, registerFont } = require('canvas');
const QRCode = require('qrcode');
const db = require('./database');

// ============================================================
// 📋 BROCHURE TEMPLATES
// ============================================================

const TEMPLATES = {
    welcome: {
        name: 'Welcome Brochure',
        description: 'Welcome new customers to Auto Spares Solution',
        icon: '👋',
        colors: { primary: '#0072B0', secondary: '#00A3E0', accent: '#FF6B00' }
    },
    weekly: {
        name: 'Weekly Brochure',
        description: 'Weekly deals and updates',
        icon: '📰',
        colors: { primary: '#2E7D32', secondary: '#43A047', accent: '#FF6F00' }
    },
    festival: {
        name: 'Festival Brochure',
        description: 'Festival special offers',
        icon: '🎉',
        colors: { primary: '#C62828', secondary: '#E53935', accent: '#FFD700' }
    },
    birthday: {
        name: 'Birthday Brochure',
        description: 'Birthday special offers',
        icon: '🎂',
        colors: { primary: '#6A1B9A', secondary: '#8E24AA', accent: '#FF6F00' }
    },
    supplier_welcome: {
        name: 'Supplier Welcome Brochure',
        description: 'Welcome new suppliers to the network',
        icon: '🏢',
        colors: { primary: '#1A237E', secondary: '#283593', accent: '#FF6F00' }
    },
    delivery_welcome: {
        name: 'Delivery Boy Welcome Brochure',
        description: 'Welcome new delivery partners',
        icon: '🚗',
        colors: { primary: '#004D40', secondary: '#00695C', accent: '#FF6F00' }
    }
};

// ============================================================
// 🎨 BROCHURE GENERATOR CLASS
// ============================================================

class BrochureGenerator {
    constructor() {
        this.cache = new Map();
        this.brandColors = {
            primary: '#0072B0',
            secondary: '#00A3E0',
            accent: '#FF6B00',
            success: '#00B050',
            warning: '#FFA500',
            danger: '#FF0000',
            dark: '#1A1A2E',
            light: '#F5F5F5',
            white: '#FFFFFF',
            gold: '#FFD700'
        };
        
        // Logo path - you can place your logo in public folder
        this.logoPath = path.join(__dirname, '../public/logo.png');
        this.placeholderImage = null;
        
        // Brand images for products
        this.brandImages = {
            'RANE': 'https://via.placeholder.com/100x100/0072B0/FFFFFF?text=RANE',
            'TVS': 'https://via.placeholder.com/100x100/FF6B00/FFFFFF?text=TVS',
            'M&M': 'https://via.placeholder.com/100x100/1A237E/FFFFFF?text=M%26M',
            'WABCO': 'https://via.placeholder.com/100x100/C62828/FFFFFF?text=WABCO',
            'GIRLING': 'https://via.placeholder.com/100x100/2E7D32/FFFFFF?text=GIRLING',
            'LMM': 'https://via.placeholder.com/100x100/6A1B9A/FFFFFF?text=LMM',
            'default': 'https://via.placeholder.com/100x100/666666/FFFFFF?text=PART'
        };
    }

    /**
     * Generate brochure with images
     */
    async generateBrochure(type, data = {}) {
        console.log(`🎨 Generating ${type} brochure with images...`);
        
        const template = TEMPLATES[type];
        if (!template) {
            throw new Error(`Unknown brochure type: ${type}`);
        }

        // Get data
        const products = await this.getFeaturedProducts(type, data.limit || 4);
        const stats = await this.getSystemStats();
        const offers = await this.getActiveOffers(type);
        const qrCode = await this.generateQRCode({ type });

        // Generate HTML with images
        const html = this.generateHTMLWithImages({
            type,
            title: data.title || template.name,
            subtitle: data.subtitle || template.description,
            icon: template.icon,
            colors: template.colors,
            products,
            stats,
            offers,
            qrCode,
            customer: data.customer || null,
            supplier: data.supplier || null,
            deliveryBoy: data.deliveryBoy || null,
            order: data.order || null
        });

        // Generate Image brochure
        let imageBuffer = null;
        try {
            imageBuffer = await this.generateImageBrochure({
                type,
                title: data.title || template.name,
                subtitle: data.subtitle || template.description,
                icon: template.icon,
                colors: template.colors,
                products,
                stats,
                offers,
                qrCode,
                customer: data.customer || null
            });
        } catch (error) {
            console.log('⚠️ Image generation failed:', error.message);
        }

        return {
            type,
            html,
            image: imageBuffer,
            data: { products, stats, offers, qrCode },
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Generate HTML with images
     */
    generateHTMLWithImages(data) {
        const products = data.products || [];
        const stats = data.stats || {};
        const offers = data.offers || [];
        const colors = data.colors || TEMPLATES.welcome.colors;
        
        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${data.title}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', Arial, sans-serif;
            background: #f0f2f5;
            display: flex;
            justify-content: center;
            padding: 20px;
        }
        .brochure {
            max-width: 600px;
            width: 100%;
            background: white;
            border-radius: 20px;
            overflow: hidden;
            box-shadow: 0 20px 60px rgba(0,0,0,0.15);
        }
        .header {
            background: linear-gradient(135deg, ${colors.primary}, ${colors.secondary});
            color: white;
            padding: 30px 20px;
            text-align: center;
            position: relative;
        }
        .header .icon { font-size: 48px; }
        .header h1 { font-size: 28px; margin: 5px 0; }
        .header .subtitle { font-size: 14px; opacity: 0.9; }
        
        .content { padding: 25px; }
        .greeting { font-size: 18px; font-weight: bold; color: ${colors.primary}; }
        .message { margin: 15px 0; color: #333; line-height: 1.6; }
        
        .features {
            background: #f8f9fa;
            border-radius: 10px;
            padding: 15px;
            margin: 15px 0;
        }
        .features li {
            list-style: none;
            padding: 5px 0;
            font-size: 14px;
        }
        
        .offers {
            background: linear-gradient(135deg, #FFF3E0, #FFE0B2);
            border-radius: 10px;
            padding: 15px;
            margin: 15px 0;
        }
        .offer-item {
            display: flex;
            justify-content: space-between;
            padding: 8px 0;
            border-bottom: 1px solid rgba(255,107,0,0.2);
        }
        .offer-item:last-child { border-bottom: none; }
        .offer-code {
            background: ${colors.accent};
            color: white;
            padding: 2px 10px;
            border-radius: 12px;
            font-size: 12px;
        }
        
        .products-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 15px;
            margin: 15px 0;
        }
        .product-card {
            background: #f8f9fa;
            border-radius: 10px;
            padding: 15px;
            text-align: center;
            border: 1px solid #e0e0e0;
            transition: transform 0.2s;
        }
        .product-card:hover { transform: translateY(-3px); }
        .product-card .product-image {
            width: 80px;
            height: 80px;
            margin: 0 auto 10px;
            border-radius: 10px;
            background: #e0e0e0;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 30px;
        }
        .product-card .part { font-weight: bold; color: ${colors.primary}; font-size: 14px; }
        .product-card .desc { font-size: 12px; color: #666; margin: 5px 0; }
        .product-card .price { color: ${colors.accent}; font-weight: bold; font-size: 16px; }
        .product-card .brand { font-size: 11px; color: #888; }
        .product-card .stock { font-size: 11px; color: ${data.type === 'clearance' ? '#FF0000' : '#00B050'}; }
        
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 10px;
            margin: 15px 0;
        }
        .stat-card {
            background: linear-gradient(135deg, #f8f9fa, #e9ecef);
            border-radius: 10px;
            padding: 15px;
            text-align: center;
        }
        .stat-card .number { font-size: 24px; font-weight: bold; color: ${colors.primary}; }
        .stat-card .label { font-size: 12px; color: #666; }
        
        .qr-section {
            text-align: center;
            padding: 15px;
            background: #f8f9fa;
            border-radius: 10px;
            margin: 15px 0;
        }
        .qr-section img { width: 100px; height: 100px; }
        
        .footer {
            background: ${colors.dark || '#1A1A2E'};
            color: white;
            padding: 15px 20px;
            text-align: center;
            font-size: 12px;
        }
        .footer .contact { margin-top: 5px; opacity: 0.8; }
        .footer .brand-logos {
            display: flex;
            justify-content: center;
            gap: 10px;
            flex-wrap: wrap;
            margin: 10px 0;
        }
        .footer .brand-logos span {
            background: rgba(255,255,255,0.1);
            padding: 3px 10px;
            border-radius: 15px;
            font-size: 11px;
        }
        
        @media (max-width: 500px) {
            .products-grid { grid-template-columns: 1fr; }
            .stats-grid { grid-template-columns: 1fr 1fr; }
        }
    </style>
</head>
<body>
    <div class="brochure">
        <div class="header">
            <div class="icon">${data.icon || '📢'}</div>
            <h1>${data.title}</h1>
            <div class="subtitle">${data.subtitle || ''}</div>
        </div>
        
        <div class="content">
            ${data.customer ? `<div class="greeting">Dear ${data.customer.name || 'Customer'},</div>` : ''}
            ${data.supplier ? `<div class="greeting">Dear ${data.supplier.name || 'Supplier'},</div>` : ''}
            ${data.deliveryBoy ? `<div class="greeting">Dear ${data.deliveryBoy.name || 'Delivery Partner'},</div>` : ''}
            
            <div class="message">
                ${this.getDynamicMessage(data)}
            </div>
            
            ${data.order ? `
            <div class="features" style="border-left: 4px solid ${colors.accent};">
                <strong>📦 Order Details</strong>
                <ul>
                    <li>🆔 Order ID: ${data.order.orderId}</li>
                    <li>👤 Customer: ${data.order.customer}</li>
                    <li>💰 Total: ₹${data.order.total}</li>
                    <li>📦 Items: ${data.order.items}</li>
                </ul>
            </div>
            ` : ''}
            
            ${offers.length > 0 ? `
            <div class="offers">
                <strong>🎁 Special Offers</strong>
                ${offers.map(o => `
                    <div class="offer-item">
                        <div>
                            <div style="font-weight:bold;">${o.title}</div>
                            <div style="font-size:12px;color:#666;">${o.description}</div>
                        </div>
                        <div class="offer-code">${o.code}</div>
                    </div>
                `).join('')}
            </div>
            ` : ''}
            
            ${products.length > 0 ? `
            <strong>🛒 Featured Products</strong>
            <div class="products-grid">
                ${products.map(p => `
                    <div class="product-card">
                        <div class="product-image">${this.getProductEmoji(p.part)}</div>
                        <div class="part">${p.part}</div>
                        <div class="desc">${p.description || 'N/A'}</div>
                        <div class="price">₹${(p.billing_price || p.list_price || 0).toFixed(2)}</div>
                        <div class="brand">🏷️ ${p.brand || 'Generic'}</div>
                        <div class="stock">${p.stock > 0 ? `✅ ${p.stock} pcs` : '❌ Out of Stock'}</div>
                    </div>
                `).join('')}
            </div>
            ` : ''}
            
            ${stats.products > 0 ? `
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="number">${stats.products}</div>
                    <div class="label">Products</div>
                </div>
                <div class="stat-card">
                    <div class="number">${stats.customers}</div>
                    <div class="label">Customers</div>
                </div>
                <div class="stat-card">
                    <div class="number">${stats.orders}</div>
                    <div class="label">Orders</div>
                </div>
            </div>
            ` : ''}
            
            ${data.qrCode ? `
            <div class="qr-section">
                <strong>📱 Scan to Shop</strong>
                <br>
                <img src="${data.qrCode}" alt="QR Code">
            </div>
            ` : ''}
            
            <div style="text-align:center;padding:10px;font-size:12px;color:#666;">
                📞 ${CONFIG?.businessPhone || '9830300193'} | 🛒 autosparessolution.com
            </div>
        </div>
        
        <div class="footer">
            <div class="brand-logos">
                <span>🚗 RANE</span>
                <span>🔧 TVS</span>
                <span>⚙️ WABCO</span>
                <span>🛞 M&M</span>
                <span>🔩 GIRLING</span>
            </div>
            <div class="contact">
                📞 ${CONFIG?.businessPhone || '9830300193'} | 📧 info@autosparessolution.com
            </div>
            <div style="margin-top:5px;opacity:0.6;font-size:11px;">
                © ${new Date().getFullYear()} Auto Spares Solution | All Rights Reserved
            </div>
        </div>
    </div>
</body>
</html>`;
    }

    /**
     * Get dynamic message based on brochure type
     */
    getDynamicMessage(data) {
        const type = data.type || 'welcome';
        const messages = {
            welcome: 'Thank you for choosing Auto Spares Solution! We are delighted to have you as part of our family. We are committed to providing you with the best quality auto parts and exceptional service.',
            weekly: 'Check out our amazing weekly deals! Limited time offers on premium auto parts. Don\'t miss out on these incredible savings!',
            festival: 'This festive season, we bring you exclusive offers on premium auto parts. Celebrate with us and save big on your vehicle maintenance!',
            birthday: '🎉 Happy Birthday! On your special day, we want to make it even more special with exclusive discounts on auto parts. Treat your vehicle with the best!',
            supplier_welcome: 'Welcome to our supplier network! Together, we will revolutionize the auto parts industry. We look forward to a successful partnership!',
            delivery_welcome: 'Welcome to the Auto Spares Solution delivery family! Together, we deliver excellence to thousands of customers every day.'
        };
        return messages[type] || messages.welcome;
    }

    /**
     * Get product emoji
     */
    getProductEmoji(part) {
        const emojis = {
            '0801': '🔧',
            '0802': '⚙️',
            '0803': '🛞',
            '0804': '🔩',
            '0805': '🚗',
            '0806': '🔨',
            '0807': '📦',
            '0808': '🔌',
            '0809': '🧰',
            '0810': '💡'
        };
        const prefix = part.substring(0, 4);
        return emojis[prefix] || '🔧';
    }

    /**
     * Get featured products
     */
    async getFeaturedProducts(type, limit = 4) {
        try {
            let query = `
                SELECT part, description, brand, make, model, stock, 
                       list_price, billing_price, mrp, updated_at
                FROM products 
                WHERE stock > 0
            `;
            
            switch(type) {
                case 'new_arrivals':
                    query += ` ORDER BY updated_at DESC LIMIT ${limit}`;
                    break;
                case 'clearance':
                    query += ` AND stock < 10 ORDER BY stock ASC LIMIT ${limit}`;
                    break;
                case 'premium':
                    query += ` AND billing_price > 1000 ORDER BY billing_price DESC LIMIT ${limit}`;
                    break;
                default:
                    query += ` ORDER BY RANDOM() LIMIT ${limit}`;
            }
            
            return await db.db.all(query);
        } catch (error) {
            console.error('❌ Failed to get featured products:', error.message);
            return [];
        }
    }

    /**
     * Get system stats
     */
    async getSystemStats() {
        try {
            const stats = await db.getStats();
            const customers = await db.db.get(
                `SELECT COUNT(*) as count FROM customers WHERE status = 'active'`
            );
            const orders = await db.db.get(
                `SELECT COUNT(*) as count FROM orders WHERE status IN ('confirmed', 'shipped', 'delivered')`
            );
            
            return {
                products: stats?.total_products || 0,
                customers: customers?.count || 0,
                orders: orders?.count || 0
            };
        } catch (error) {
            console.error('❌ Failed to get stats:', error.message);
            return { products: 0, customers: 0, orders: 0 };
        }
    }

    /**
     * Get active offers
     */
    getActiveOffers(type) {
        const offers = {
            welcome: [
                { title: '🎁 Welcome Discount', description: '10% off on first order', code: 'WELCOME10' },
                { title: '🚚 Free Delivery', description: 'Free delivery on first order', code: 'FREEDEL' }
            ],
            weekly: [
                { title: '📰 Weekly Special', description: '15% off on all orders', code: 'WEEKLY15' },
                { title: '💰 Bulk Discount', description: 'Extra 5% on orders above ₹5000', code: 'BULK5' }
            ],
            festival: [
                { title: '🎉 Festival Special', description: '25% off on all orders', code: 'FESTIVAL25' },
                { title: '🎁 Gift with Purchase', description: 'Free accessory on orders above ₹3000', code: 'FESTGIFT' }
            ],
            birthday: [
                { title: '🎂 Birthday Special', description: '20% off on your birthday', code: 'BDAY20' },
                { title: '🎁 Free Gift', description: 'Free gift on birthday orders', code: 'BDAYGIFT' }
            ],
            supplier_welcome: [
                { title: '🏢 Welcome Bonus', description: '₹5000 bonus on first 10 orders', code: 'SUPPLIER5000' },
                { title: '📊 Performance Bonus', description: 'Extra 2% on monthly sales', code: 'PERF2' }
            ],
            delivery_welcome: [
                { title: '🚗 Welcome Bonus', description: '₹1000 on first 50 deliveries', code: 'DELIVERY1000' },
                { title: '⭐ Performance Bonus', description: '₹500 extra on 5-star ratings', code: 'STAR5' }
            ]
        };
        return offers[type] || offers.welcome;
    }

    /**
     * Generate QR Code
     */
    async generateQRCode(data) {
        try {
            const url = `https://autosparessolution.com/brochure/${data.type}`;
            return await QRCode.toDataURL(url);
        } catch (error) {
            console.error('❌ QR Code generation failed:', error.message);
            return null;
        }
    }

    /**
     * Generate Image Brochure with visual elements
     */
    async generateImageBrochure(data) {
        try {
            const Canvas = require('canvas');
            const canvas = createCanvas(600, 900);
            const ctx = canvas.getContext('2d');

            // Background gradient
            const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
            gradient.addColorStop(0, data.colors.primary || '#0072B0');
            gradient.addColorStop(0.4, data.colors.secondary || '#00A3E0');
            gradient.addColorStop(1, '#1A1A2E');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Decorative circles
            ctx.globalAlpha = 0.1;
            ctx.beginPath();
            ctx.arc(500, -50, 200, 0, Math.PI * 2);
            ctx.fillStyle = 'white';
            ctx.fill();
            ctx.beginPath();
            ctx.arc(-50, 500, 150, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;

            // Header
            ctx.textAlign = 'center';
            ctx.fillStyle = 'white';
            ctx.font = '48px Arial';
            ctx.fillText(data.icon || '📢', 300, 70);
            ctx.font = 'bold 28px Arial';
            ctx.fillText(data.title, 300, 120);
            ctx.font = '16px Arial';
            ctx.fillStyle = 'rgba(255,255,255,0.8)';
            ctx.fillText(data.subtitle || '', 300, 150);

            // Products Section
            const products = data.products || [];
            if (products.length > 0) {
                ctx.fillStyle = 'rgba(255,255,255,0.9)';
                ctx.font = 'bold 16px Arial';
                ctx.fillText('🛒 Featured Products', 300, 200);

                products.slice(0, 4).forEach((p, i) => {
                    const x = 30 + (i % 2) * 280;
                    const y = 230 + Math.floor(i / 2) * 170;
                    
                    // Card background
                    ctx.fillStyle = 'rgba(255,255,255,0.95)';
                    this.roundRect(ctx, x, y, 250, 150, 10);
                    ctx.fill();
                    
                    // Product image placeholder
                    ctx.fillStyle = '#e0e0e0';
                    this.roundRect(ctx, x + 75, y + 10, 100, 70, 8);
                    ctx.fill();
                    ctx.fillStyle = '#666';
                    ctx.font = '30px Arial';
                    ctx.fillText(this.getProductEmoji(p.part), x + 125, y + 55);
                    
                    // Product details
                    ctx.fillStyle = '#0072B0';
                    ctx.font = 'bold 14px Arial';
                    ctx.textAlign = 'center';
                    ctx.fillText(p.part, x + 125, y + 100);
                    ctx.fillStyle = '#666';
                    ctx.font = '11px Arial';
                    const desc = (p.description || 'N/A').substring(0, 20);
                    ctx.fillText(desc + (desc.length >= 20 ? '...' : ''), x + 125, y + 120);
                    ctx.fillStyle = '#FF6B00';
                    ctx.font = 'bold 14px Arial';
                    ctx.fillText(`₹${(p.billing_price || p.list_price || 0).toFixed(2)}`, x + 125, y + 140);
                });
            }

            // Stats
            const stats = data.stats || {};
            if (stats.products > 0) {
                const statY = products.length > 0 ? 510 : 350;
                ctx.fillStyle = 'rgba(255,255,255,0.15)';
                this.roundRect(ctx, 30, statY, 540, 60, 10);
                ctx.fill();
                
                ctx.fillStyle = 'white';
                ctx.textAlign = 'center';
                ctx.font = 'bold 18px Arial';
                ctx.fillText(stats.products, 120, statY + 38);
                ctx.fillText(stats.customers, 300, statY + 38);
                ctx.fillText(stats.orders, 480, statY + 38);
                ctx.font = '11px Arial';
                ctx.fillStyle = 'rgba(255,255,255,0.7)';
                ctx.fillText('Products', 120, statY + 55);
                ctx.fillText('Customers', 300, statY + 55);
                ctx.fillText('Orders', 480, statY + 55);
            }

            // QR Code
            if (data.qrCode) {
                try {
                    const qrImage = await loadImage(data.qrCode);
                    ctx.drawImage(qrImage, 430, 620, 100, 100);
                    ctx.fillStyle = 'rgba(255,255,255,0.7)';
                    ctx.font = '11px Arial';
                    ctx.textAlign = 'center';
                    ctx.fillText('Scan to Shop', 480, 740);
                } catch (err) {
                    console.log('⚠️ QR Code render failed:', err.message);
                }
            }

            // Contact
            ctx.fillStyle = 'rgba(255,255,255,0.6)';
            ctx.textAlign = 'center';
            ctx.font = '13px Arial';
            ctx.fillText(`📞 ${CONFIG?.businessPhone || '9830300193'}`, 300, 700);
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            ctx.font = '12px Arial';
            ctx.fillText('🛒 autosparessolution.com', 300, 725);

            // Footer
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            this.roundRect(ctx, 0, canvas.height - 40, canvas.width, 40, 0);
            ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.font = '10px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(`© ${new Date().getFullYear()} Auto Spares Solution | All Rights Reserved`, 300, canvas.height - 15);

            // Brand logos at bottom
            const brands = ['RANE', 'TVS', 'WABCO', 'M&M', 'GIRLING'];
            ctx.fillStyle = 'rgba(255,255,255,0.2)';
            ctx.font = '9px Arial';
            brands.forEach((b, i) => {
                const x = 60 + i * 100;
                ctx.fillText(`● ${b}`, x, canvas.height - 60);
            });

            return canvas.toBuffer('image/jpeg', { quality: 0.9 });

        } catch (error) {
            console.error('❌ Image brochure generation failed:', error.message);
            console.error(error.stack);
            return null;
        }
    }

    /**
     * Round rectangle helper
     */
    roundRect(ctx, x, y, w, h, r) {
        if (r > w / 2) r = w / 2;
        if (r > h / 2) r = h / 2;
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }

    /**
     * Send brochure via WhatsApp
     */
    async sendBrochure(to, type, data = {}) {
        try {
            const brochure = await this.generateBrochure(type, data);
            
            // Send image if available
            if (brochure.image) {
                await sendImageBuffer(to, brochure.image, `📢 ${data.title || type}`);
            }
            
            // Send text summary
            const summary = `${data.icon || '📢'} *${data.title || type}*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
            const text = summary + 
                `${data.subtitle || ''}\n\n` +
                `📦 ${brochure.data.products?.length || 0} featured products\n` +
                `📊 ${brochure.data.stats?.products || 0}+ products available\n` +
                `👥 ${brochure.data.stats?.customers || 0}+ happy customers\n\n` +
                `💡 *Scan QR Code* to shop now!\n\n` +
                `📞 Call: ${CONFIG?.businessPhone || '9830300193'}`;
            
            await sendWhatsAppMessage(to, text);
            return brochure;
        } catch (error) {
            console.error('❌ Failed to send brochure:', error.message);
            return null;
        }
    }

    /**
     * Send bulk brochure
     */
    async sendBulkBrochure(type, data = {}) {
        try {
            const customers = await db.db.all(
                `SELECT phone, name FROM customers WHERE status = 'active'`
            );
            
            if (!customers || customers.length === 0) {
                console.log('📋 No active customers found');
                return { sent: 0, failed: 0 };
            }

            let sent = 0;
            let failed = 0;

            const brochure = await this.generateBrochure(type, data);

            for (const customer of customers) {
                try {
                    if (brochure.image) {
                        await sendImageBuffer(customer.phone, brochure.image, `📢 ${data.title || type}`);
                    }
                    
                    const text = `${data.icon || '📢'} *${data.title || type}*\n━━━━━━━━━━━━━━━━━━━━\n\n` +
                        `${data.subtitle || ''}\n\n` +
                        `📦 ${brochure.data.products?.length || 0} featured products\n` +
                        `💡 Scan QR Code to shop!\n\n` +
                        `📞 Call: ${CONFIG?.businessPhone || '9830300193'}`;
                    
                    await sendWhatsAppMessage(customer.phone, text);
                    sent++;
                } catch (err) {
                    failed++;
                    console.error(`❌ Failed to send to ${customer.phone}:`, err.message);
                }
                
                if (sent % 10 === 0) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }

            await sendEngagementNotification('brochure', {
                type: type,
                count: sent,
                delivered: sent,
                replies: 0,
                engagement: 0
            });

            return { sent, failed, total: customers.length };
        } catch (error) {
            console.error('❌ Bulk brochure sending failed:', error.message);
            return { sent: 0, failed: 0 };
        }
    }

    /**
     * Send Good Morning Wishes
     */
    async sendGoodMorningWishes() {
        try {
            console.log('🌅 Sending Good Morning wishes...');
            
            const customers = await db.db.all(
                `SELECT phone, name FROM customers WHERE status = 'active'`
            );
            
            if (!customers || customers.length === 0) {
                console.log('🌅 No active customers found');
                return { sent: 0, failed: 0 };
            }

            const brochure = await this.generateBrochure('weekly', {
                title: '🌅 Good Morning! ☀️',
                subtitle: `Start your day with the best auto parts!`,
                icon: '🌅',
                includeProducts: true,
                includeStats: true
            });

            let sent = 0;
            let failed = 0;

            for (const customer of customers) {
                try {
                    if (brochure.image) {
                        await sendImageBuffer(customer.phone, brochure.image, '🌅 Good Morning! ☀️');
                    }
                    
                    const greeting = customer.name ? `👤 Good morning ${customer.name}! 👋\n\n` : '';
                    await sendWhatsAppMessage(customer.phone,
                        `🌅 *Good Morning!* ☀️\n━━━━━━━━━━━━━━━━━━━━\n\n` +
                        greeting +
                        `Start your day with quality auto parts!\n\n` +
                        `📦 ${brochure.data.products?.length || 0} featured products\n` +
                        `📞 Call: ${CONFIG?.businessPhone || '9830300193'}`
                    );
                    sent++;
                } catch (err) {
                    failed++;
                    console.error(`❌ Failed to send to ${customer.phone}:`, err.message);
                }
                
                if (sent % 10 === 0) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }

            await sendEngagementNotification('engagement', {
                action: 'Good Morning Wishes',
                count: sent,
                delivered: sent,
                status: 'Sent'
            });

            console.log(`🌅 Good Morning wishes sent to ${sent} customers`);
            return { sent, failed, total: customers.length };

        } catch (error) {
            console.error('❌ Failed to send Good Morning wishes:', error.message);
            return { sent: 0, failed: 0 };
        }
    }

    /**
     * Send Good Evening Wishes
     */
    async sendGoodEveningWishes() {
        try {
            console.log('🌅 Sending Good Evening wishes...');
            
            const customers = await db.db.all(
                `SELECT phone, name FROM customers WHERE status = 'active'`
            );
            
            if (!customers || customers.length === 0) {
                console.log('🌅 No active customers found');
                return { sent: 0, failed: 0 };
            }

            const brochure = await this.generateBrochure('weekly', {
                title: '🌅 Good Evening! 🌇',
                subtitle: `End your day with quality auto parts!`,
                icon: '🌅',
                includeProducts: true,
                includeStats: true
            });

            let sent = 0;
            let failed = 0;

            for (const customer of customers) {
                try {
                    if (brochure.image) {
                        await sendImageBuffer(customer.phone, brochure.image, '🌅 Good Evening! 🌇');
                    }
                    
                    const greeting = customer.name ? `👤 Good evening ${customer.name}! 🌙\n\n` : '';
                    await sendWhatsAppMessage(customer.phone,
                        `🌅 *Good Evening!* 🌇\n━━━━━━━━━━━━━━━━━━━━\n\n` +
                        greeting +
                        `End your day with quality auto parts!\n\n` +
                        `📦 ${brochure.data.products?.length || 0} featured products\n` +
                        `📞 Call: ${CONFIG?.businessPhone || '9830300193'}`
                    );
                    sent++;
                } catch (err) {
                    failed++;
                    console.error(`❌ Failed to send to ${customer.phone}:`, err.message);
                }
                
                if (sent % 10 === 0) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }

            await sendEngagementNotification('engagement', {
                action: 'Good Evening Wishes',
                count: sent,
                delivered: sent,
                status: 'Sent'
            });

            console.log(`🌅 Good Evening wishes sent to ${sent} customers`);
            return { sent, failed, total: customers.length };

        } catch (error) {
            console.error('❌ Failed to send Good Evening wishes:', error.message);
            return { sent: 0, failed: 0 };
        }
    }
}

// ============================================================
// 📤 EXPORTS
// ============================================================

module.exports = new BrochureGenerator();
