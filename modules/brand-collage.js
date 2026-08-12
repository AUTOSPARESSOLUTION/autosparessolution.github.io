// ============================================================
// 🎨 DYNAMIC BRAND COLLAGE GENERATOR - LARGE LOGOS
// ============================================================

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const { LRUCache } = require('lru-cache');

const collageCache = new LRUCache({
    max: 50,
    ttl: 5 * 60 * 1000
});

// ============================================================
// 🔧 XML ESCAPE FUNCTION
// ============================================================

function escapeXML(value) {
    if (!value) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

// ============================================================
// 🎨 DYNAMIC BRAND COLLAGE CLASS
// ============================================================

class DynamicBrandCollage {
    constructor() {
        this.tempDir = path.join(__dirname, '../temp');
        this.ensureTempDir();
        this.lastBrandCount = 0;
        this.brandHash = '';
        this.logoCache = new Map();
    }

    ensureTempDir() {
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }
    }

    generateBrandHash(brands) {
        return brands.map(b => `${b.id || b.name}:${b.active !== false}`).join('|');
    }

    // ============================================================
    // 📥 PRELOAD ALL LOGOS
    // ============================================================
    
    async preloadAllLogos() {
        const LOGO_BASE_URL = 'https://autosparessolution.github.io/images/';
        const brands = [
            { name: 'RANE', file: 'RANE.png' },
            { name: 'TVS', file: 'TVS.jpg' },
            { name: 'RBL', file: 'brand-rbl.png' },
            { name: 'RML', file: 'RML.png' },
            { name: 'GIRLING', file: 'brand-girling.png' },
            { name: 'LMM', file: 'brand-lmm.png' },
            { name: 'M&M', file: 'brand-m&m.png' },
            { name: 'MTBL', file: 'brand-mtbl.png' },
            { name: 'STL', file: 'brand-stl.png' },
            { name: 'VF', file: 'brand-vf.png' },
            { name: 'WABCO', file: 'brand-wabco.png' },
            { name: 'GREAVES', file: 'brand-greaves.png' },
            { name: 'MGP', file: 'brand-mgp.png' },
            { name: 'LEYPARTS', file: 'brand-leyparts.png' },
            { name: 'TATA', file: 'brand-tata.png' }
        ];
        
        console.log('📥 Preloading brand logos...');
        
        for (const brand of brands) {
            const url = `${LOGO_BASE_URL}${brand.file}`;
            try {
                const response = await fetch(url);
                if (response.ok) {
                    const buffer = await response.arrayBuffer();
                    const base64 = Buffer.from(buffer).toString('base64');
                    const mimeType = brand.file.endsWith('.jpg') ? 'image/jpeg' : 'image/png';
                    this.logoCache.set(brand.name, `data:${mimeType};base64,${base64}`);
                    console.log(`✅ Preloaded: ${brand.name}`);
                } else {
                    console.log(`⚠️ Not found: ${brand.name} (${response.status})`);
                }
            } catch (error) {
                console.log(`⚠️ Failed to preload: ${brand.name} - ${error.message}`);
            }
        }
        
        console.log(`📊 Preloaded ${this.logoCache.size} logos`);
        return this.logoCache.size;
    }

    async generateWelcomeBrochure(brands, customerPhone = null) {
        try {
            if (!brands || brands.length === 0) {
                try {
                    const brandManager = require('./brand-config');
                    brands = brandManager.getActiveBrands();
                } catch (e) {
                    brands = this.getDefaultBrands();
                }
            }

            const activeBrands = brands.filter(b => b && b.active !== false);
            
            if (activeBrands.length === 0) {
                brands = this.getDefaultBrands();
            } else {
                brands = activeBrands;
            }

            const currentHash = this.generateBrandHash(brands);
            
            if (currentHash !== this.brandHash) {
                console.log('🔄 Brand list changed, regenerating brochure...');
                this.brandHash = currentHash;
                collageCache.clear();
            }

            const cacheKey = `brochure_${currentHash}_${customerPhone || 'default'}`;
            if (collageCache.has(cacheKey)) {
                console.log(`📦 Returning cached brochure (${brands.length} brands)`);
                return collageCache.get(cacheKey);
            }

            console.log(`🎨 Generating dynamic brochure with ${brands.length} brands...`);

            const collageBuffer = await this.createDynamicBrochure(brands, customerPhone);
            
            if (collageBuffer) {
                collageCache.set(cacheKey, collageBuffer);
                this.lastBrandCount = brands.length;
                console.log(`✅ Brochure generated successfully (${brands.length} brands)`);
            }
            
            return collageBuffer;

        } catch (error) {
            console.error('❌ Brochure generation error:', error.message);
            return this.createTextBrochure(brands);
        }
    }

    async createDynamicBrochure(brands, customerPhone = null) {
        try {
            const count = brands.length;
            
            let width = 1200;
            let height = 1800;
            let cols = 4;
            
            if (count <= 4) {
                cols = 2;
                height = 1400;
            } else if (count <= 8) {
                cols = 3;
                height = 1600;
            } else if (count <= 12) {
                cols = 4;
                height = 1800;
            } else if (count <= 20) {
                cols = 5;
                height = 2200;
            } else {
                cols = 6;
                height = 2500;
            }
            
            const rows = Math.ceil(count / cols);
            const brandHeight = Math.min(140, (height - 350) / rows);
            const brandWidth = Math.min(180, (width - 60) / cols);
            
            const baseImage = await this.createDynamicBase(width, height, count);
            const titleImage = await this.createDynamicTitle(width, count, customerPhone);
            const logosImage = await this.createDynamicBrandGrid(brands, width, cols, brandWidth, brandHeight);
            const footerImage = await this.createDynamicFooter(width, count);
            
            const result = await sharp({
                create: {
                    width: width,
                    height: height,
                    channels: 4,
                    background: { r: 0, g: 0, b: 0, alpha: 0 }
                }
            })
            .composite([
                { input: baseImage, top: 0, left: 0 },
                { input: titleImage, top: 0, left: 0 },
                { input: logosImage, top: 280, left: 0 },
                { input: footerImage, top: height - 140, left: 0 }
            ])
            .jpeg({ quality: 92, progressive: true })
            .toBuffer();

            return result;

        } catch (error) {
            console.error('❌ Dynamic brochure creation error:', error.message);
            return this.createTextBrochure(brands);
        }
    }

    async createDynamicBase(width, height, brandCount) {
        const gradientColors = brandCount > 10 ? 
            ['#0072B0', '#005a8c', '#003d66'] :
            ['#1a5276', '#2e86c1', '#0072B0'];
        
        const svg = `
            <svg width="${width}" height="${height}">
                <defs>
                    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stop-color="${gradientColors[0]}" />
                        <stop offset="50%" stop-color="${gradientColors[1]}" />
                        <stop offset="100%" stop-color="${gradientColors[2]}" />
                    </linearGradient>
                </defs>
                <rect width="${width}" height="${height}" fill="url(#grad)"/>
                <circle cx="${Math.random() * width}" cy="${Math.random() * height}" r="${100 + brandCount * 5}" fill="rgba(255,255,255,0.05)"/>
                <circle cx="${Math.random() * width}" cy="${Math.random() * height}" r="${80 + brandCount * 4}" fill="rgba(255,255,255,0.05)"/>
                <circle cx="${Math.random() * width}" cy="${Math.random() * height}" r="${120 + brandCount * 3}" fill="rgba(255,255,255,0.05)"/>
                <rect x="20" y="20" width="${width-40}" height="${height-40}" 
                      rx="20" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="3"/>
                <rect x="${width-200}" y="30" width="160" height="35" rx="17" 
                      fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.2)" stroke-width="1"/>
                <text x="${width-120}" y="53" font-family="Arial, sans-serif" font-size="14" text-anchor="middle" fill="#CCE5FF" font-weight="bold">
                    🏷️ ${brandCount} Brands
                </text>
            </svg>
        `;

        return await sharp(Buffer.from(svg)).png().toBuffer();
    }

    async createDynamicTitle(width, brandCount, customerPhone) {
        const title = 'AUTO SPARES SOLUTION';
        const subtitle = `${brandCount} Premium Auto Brands - Trusted Quality`;
        const welcome = customerPhone ? `Welcome ${customerPhone}` : 'Welcome to Our Family!';
        
        const svg = `
            <svg width="${width}" height="280">
                <style>
                    .title { font-family: Arial, sans-serif; font-size: ${brandCount > 10 ? 44 : 48}px; font-weight: bold; fill: #FFFFFF; text-anchor: middle; }
                    .subtitle { font-family: Arial, sans-serif; font-size: ${brandCount > 10 ? 18 : 22}px; fill: #CCE5FF; text-anchor: middle; }
                    .welcome { font-family: Arial, sans-serif; font-size: 16px; fill: #FFD700; text-anchor: middle; }
                </style>
                <circle cx="${width/2}" cy="55" r="40" fill="rgba(255,255,255,0.15)" stroke="#FFFFFF" stroke-width="2"/>
                <text x="${width/2}" y="70" font-size="40" text-anchor="middle" fill="#FFFFFF">🚗</text>
                <text x="${width/2}" y="125" class="title">${escapeXML(title)}</text>
                <text x="${width/2}" y="165" class="subtitle">${escapeXML(subtitle)}</text>
                <text x="${width/2}" y="200" class="welcome">${escapeXML(welcome)}</text>
                <line x1="${width/2-200}" y1="225" x2="${width/2+200}" y2="225" 
                      stroke="rgba(255,255,255,0.2)" stroke-width="2"/>
                <text x="${width/2}" y="255" font-size="12" text-anchor="middle" fill="rgba(255,255,255,0.5)">
                    ${brandCount > 10 ? '🌟 Largest Collection of Premium Auto Parts' : '✨ Curated Selection of Quality Brands'}
                </text>
            </svg>
        `;

        return await sharp(Buffer.from(svg)).png().toBuffer();
    }

    // ============================================================
    // 🎨 BRAND GRID - LARGE LOGOS WITH ON-DEMAND DOWNLOAD
    // ============================================================

    async createDynamicBrandGrid(brands, width, cols, itemWidth, itemHeight) {
        const rows = Math.ceil(brands.length / cols);
        const gridWidth = cols * (itemWidth + 20) - 20;
        const offsetX = (width - gridWidth) / 2;
        const totalHeight = rows * (itemHeight + 20) + 40;

        const LOGO_BASE_URL = 'https://autosparessolution.github.io/images/';
        
        const brandLogoMap = {
            'RANE': 'RANE.png',
            'TVS': 'TVS.jpg',
            'RBL': 'brand-rbl.png',
            'RML': 'RML.png',
            'GIRLING': 'brand-girling.png',
            'LMM': 'brand-lmm.png',
            'MM': 'brand-m&m.png',
            'M M': 'brand-m&m.png',
            'M&M': 'brand-m&m.png',
            'MTBL': 'brand-mtbl.png',
            'STL': 'brand-stl.png',
            'VF': 'brand-vf.png',
            'WABCO': 'brand-wabco.png',
            'GREAVES': 'brand-greaves.png',
            'LEYPARTS': 'brand-leyparts.png',
            'MGP': 'brand-mgp.png',
            'TATA': 'brand-tata.png'
        };
        
        const DEFAULT_LOGO = 'default.png';

        const brandCategories = {
            'RANE': 'Suspension • Steering',
            'TVS': 'Bolt • Nut',
            'RBL': 'Brake Lining',
            'RML': 'Suspension • Steering',
            'GIRLING': 'Brake Systems',
            'LMM': 'Mahindra Sub One Ton',
            'MM': 'Passenger • Commercial',
            'M M': 'Passenger • Commercial',
            'M&M': 'Passenger • Commercial',
            'MTBL': 'Mahindra Truck Bus',
            'STL': 'Fasteners',
            'VF': 'Mahindra Value Fit',
            'WABCO': 'Air Brakes • ABS',
            'GREAVES': 'Engine • Transmission',
            'LEYPARTS': 'Leyland Spares',
            'MGP': 'Maruti Spares',
            'TATA': 'Telco Pcv Spares'
        };

        const colors = [
            '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
            '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
            '#F8C471', '#82E0AA', '#F1948A', '#73C6B6', '#5DADE2'
        ];

        let svg = `<svg width="${width}" height="${totalHeight}" xmlns="http://www.w3.org/2000/svg">`;
        svg += `<style>
            .brand-card { 
                fill: rgba(255,255,255,0.07); 
                rx: 14; 
                ry: 14; 
                stroke: rgba(255,255,255,0.1); 
                stroke-width: 1.5; 
            }
            .brand-name { 
                font-family: 'Arial Black', Arial, sans-serif; 
                font-size: ${itemWidth > 150 ? 18 : 15}px; 
                fill: #FFFFFF; 
                text-anchor: middle; 
                font-weight: 900; 
                letter-spacing: 0.5px; 
            }
            .brand-subtitle { 
                font-family: Arial, sans-serif; 
                font-size: 10px; 
                fill: rgba(255,255,255,0.4); 
                text-anchor: middle; 
            }
            .brand-logo { 
                width: ${Math.min(Math.max(itemWidth - 40, 60), 90)}px; 
                height: ${Math.min(Math.max(itemWidth - 40, 60), 90)}px; 
            }
            .brand-logo-bg { 
                fill: rgba(255,255,255,0.05); 
                rx: 10; 
                ry: 10; 
            }
            .active-dot { 
                fill: #4CAF50; 
                opacity: 0.8; 
            }
            .brand-accent { 
                rx: 3; 
                opacity: 0.5; 
            }
        </style>`;

        for (let i = 0; i < brands.length; i++) {
            const row = Math.floor(i / cols);
            const col = i % cols;
            const x = offsetX + col * (itemWidth + 20);
            const y = row * (itemHeight + 20) + 20;
            
            const brand = brands[i];
            let brandName = brand.name || 'Brand';
            const isActive = brand.active !== false;
            const color = colors[i % colors.length];
            
            let logoKey = brandName.toUpperCase();
            if (logoKey === 'M M' || logoKey === 'M&M' || logoKey === 'MM') {
                logoKey = 'MM';
            }
            
            let logoFile = brandLogoMap[logoKey] || DEFAULT_LOGO;
            const logoUrl = `${LOGO_BASE_URL}${logoFile}`;
            
            let category = brandCategories[logoKey] || 'Premium Auto Parts';
            const safeName = escapeXML(brandName);
            const safeCategory = escapeXML(category);
            
            const logoSize = Math.min(Math.max(itemWidth - 40, 60), 90);
            const logoX = x + (itemWidth - logoSize) / 2;
            const logoY = y + 10;
            
            svg += `<rect x="${x}" y="${y}" width="${itemWidth}" height="${itemHeight}" class="brand-card"/>`;
            svg += `<rect x="${x + 12}" y="${y + 6}" width="${itemWidth - 24}" height="3" fill="${color}" class="brand-accent"/>`;
            svg += `<rect x="${logoX}" y="${logoY}" width="${logoSize}" height="${logoSize}" class="brand-logo-bg" rx="8" ry="8"/>`;
            
            // ✅ TRY PRELOADED LOGO FIRST, THEN DOWNLOAD ON DEMAND
            let logoData = this.logoCache.get(logoKey);
            
            if (!logoData) {
                try {
                    const response = await fetch(logoUrl);
                    if (response.ok) {
                        const buffer = await response.arrayBuffer();
                        const base64 = Buffer.from(buffer).toString('base64');
                        const mimeType = logoFile.endsWith('.jpg') ? 'image/jpeg' : 'image/png';
                        logoData = `data:${mimeType};base64,${base64}`;
                        this.logoCache.set(logoKey, logoData);
                        console.log(`✅ Downloaded: ${logoKey}`);
                    }
                } catch (e) {
                    console.log(`⚠️ Failed to download: ${logoKey}`);
                }
            }
            
            if (logoData) {
                svg += `<image x="${logoX}" y="${logoY}" width="${logoSize}" height="${logoSize}" 
                            href="${logoData}" 
                            preserveAspectRatio="xMidYMid meet" 
                            opacity="0.95"/>`;
            } else {
                // Fallback: brand initial
                const initial = safeName.charAt(0);
                svg += `<circle cx="${x + itemWidth/2}" cy="${logoY + logoSize/2}" r="${logoSize/2}" fill="${color}" opacity="0.15"/>`;
                svg += `<text x="${x + itemWidth/2}" y="${logoY + logoSize/2 + 5}" 
                            font-family="Arial, sans-serif" font-size="${logoSize * 0.5}" 
                            text-anchor="middle" fill="rgba(255,255,255,0.4)" 
                            font-weight="bold">${initial}</text>`;
            }
            
            const nameY = logoY + logoSize + 12;
            svg += `<text x="${x + itemWidth/2}" y="${nameY + 14}" class="brand-name">${safeName}</text>`;
            svg += `<text x="${x + itemWidth/2}" y="${nameY + 30}" class="brand-subtitle">${safeCategory}</text>`;
            
            if (isActive) {
                svg += `<circle cx="${x + itemWidth - 12}" cy="${y + 12}" r="4" class="active-dot"/>`;
            }
        }

        svg += `</svg>`;

        return await sharp(Buffer.from(svg))
            .png()
            .toBuffer();
    }

    async createDynamicFooter(width, brandCount) {
        const phone = process.env.PHONE || '9830300193';
        const footerText = brandCount > 10 ? 
            '🌟 India\'s Largest Auto Parts Platform' :
            '🏆 Premium Auto Parts Supplier';
        
        const svg = `
            <svg width="${width}" height="140">
                <style>
                    .footer-text { font-family: Arial, sans-serif; font-size: 13px; fill: #CCE5FF; text-anchor: middle; }
                    .footer-highlight { font-family: Arial, sans-serif; font-size: 15px; fill: #FFD700; text-anchor: middle; font-weight: bold; }
                    .footer-small { font-family: Arial, sans-serif; font-size: 10px; fill: rgba(255,255,255,0.3); text-anchor: middle; }
                </style>
                <line x1="40" y1="15" x2="${width-40}" y2="15" 
                      stroke="rgba(255,255,255,0.15)" stroke-width="1"/>
                <text x="${width/2}" y="40" class="footer-text">${escapeXML(footerText)}</text>
                <text x="${width/2}" y="65" class="footer-highlight">📞 ${escapeXML(phone)}</text>
                <text x="${width/2}" y="88" class="footer-text">🛒 https://autosparessolution.com</text>
                <text x="${width/2}" y="115" class="footer-small">
                    🔄 Last Updated: ${new Date().toLocaleDateString('en-IN')} • ${brandCount} Brands
                </text>
            </svg>
        `;

        return await sharp(Buffer.from(svg)).png().toBuffer();
    }

    createTextBrochure(brands) {
        const activeBrands = brands?.filter(b => b?.active !== false) || [];
        const brandNames = activeBrands.map(b => b?.name || 'Brand').join(' • ');
        const phone = process.env.PHONE || '9830300193';
        
        const border = '═'.repeat(60);
        return Buffer.from(`
╔${border}╗
║                                                          ║
║              🚗 AUTO SPARES SOLUTION                    ║
║                                                          ║
║        ${activeBrands.length} Premium Brands            ║
║                                                          ║
║        ${brandNames.substring(0, 50)}...               ║
║                                                          ║
║        📞 ${phone}                                      ║
║        🛒 https://autosparessolution.com               ║
║                                                          ║
║        🤖 Powered by ASSIST AI v3.1                    ║
║                                                          ║
╚${border}╝
        `);
    }

    getDefaultBrands() {
        return [
            { id: 'rane', name: 'RANE', active: true },
            { id: 'tvs', name: 'TVS', active: true },
            { id: 'rbl', name: 'RBL', active: true },
            { id: 'rml', name: 'RML', active: true },
            { id: 'girling', name: 'GIRLING', active: true },
            { id: 'lmm', name: 'LMM', active: true },
            { id: 'mm', name: 'M&M', active: true },
            { id: 'mtbl', name: 'MTBL', active: true },
            { id: 'stl', name: 'STL', active: true },
            { id: 'vf', name: 'VF', active: true },
            { id: 'wabco', name: 'WABCO', active: true },
            { id: 'greaves', name: 'GREAVES', active: true },
            { id: 'mgp', name: 'MGP', active: true },
            { id: 'leyparts', name: 'LEYPARTS', active: true },
            { id: 'tata', name: 'TATA', active: true }
        ];
    }

    cleanupTempFiles() {
        try {
            const files = fs.readdirSync(this.tempDir);
            const now = Date.now();
            let count = 0;
            for (const file of files) {
                const filePath = path.join(this.tempDir, file);
                const stats = fs.statSync(filePath);
                if (now - stats.mtimeMs > 3600000) {
                    fs.unlinkSync(filePath);
                    count++;
                }
            }
            if (count > 0) {
                console.log(`🧹 Cleaned up ${count} temp files`);
            }
        } catch (error) {
            console.error('❌ Cleanup error:', error.message);
        }
    }
}

// ============================================================
// 📤 EXPORT
// ============================================================

const brandCollage = new DynamicBrandCollage();

module.exports = brandCollage;
module.exports.preloadAllLogos = brandCollage.preloadAllLogos.bind(brandCollage);
