// ============================================================
// 🎨 DYNAMIC BRAND COLLAGE GENERATOR
// ============================================================

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const { LRUCache } = require('lru-cache');

const collageCache = new LRUCache({
    max: 50,
    ttl: 5 * 60 * 1000
});

class DynamicBrandCollage {
    constructor() {
        this.tempDir = path.join(__dirname, '../temp');
        this.ensureTempDir();
        this.lastBrandCount = 0;
        this.brandHash = '';
    }

    ensureTempDir() {
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }
    }

    generateBrandHash(brands) {
        return brands.map(b => `${b.id || b.name}:${b.active !== false}`).join('|');
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

            const activeBrands = brands.filter(b => b.active !== false);
            
            if (activeBrands.length === 0) {
                console.log('⚠️ No active brands found, using defaults');
                return this.getDefaultBrands();
            }

            const currentHash = this.generateBrandHash(activeBrands);
            
            if (currentHash !== this.brandHash) {
                console.log('🔄 Brand list changed, regenerating brochure...');
                this.brandHash = currentHash;
                collageCache.clear();
            }

            const cacheKey = `brochure_${currentHash}_${customerPhone || 'default'}`;
            if (collageCache.has(cacheKey)) {
                console.log(`📦 Returning cached brochure (${activeBrands.length} brands)`);
                return collageCache.get(cacheKey);
            }

            console.log(`🎨 Generating dynamic brochure with ${activeBrands.length} brands...`);

            const collageBuffer = await this.createDynamicBrochure(activeBrands, customerPhone);
            
            collageCache.set(cacheKey, collageBuffer);
            this.lastBrandCount = activeBrands.length;
            
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
            
            const composite = [
                { input: baseImage, top: 0, left: 0 },
                { input: titleImage, top: 0, left: 0 },
                { input: logosImage, top: 280, left: 0 },
                { input: footerImage, top: height - 140, left: 0 }
            ];

            const result = await sharp({
                create: {
                    width: width,
                    height: height,
                    channels: 4,
                    background: { r: 0, g: 0, b: 0, alpha: 0 }
                }
            })
            .composite(composite)
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
                        <stop offset="0%" style="stop-color:${gradientColors[0]};stop-opacity:1" />
                        <stop offset="50%" style="stop-color:${gradientColors[1]};stop-opacity:1" />
                        <stop offset="100%" style="stop-color:${gradientColors[2]};stop-opacity:1" />
                    </linearGradient>
                    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" style="stop-color:rgba(255,255,255,0.08)" />
                        <stop offset="100%" style="stop-color:rgba(255,255,255,0)" />
                    </radialGradient>
                </defs>
                <rect width="${width}" height="${height}" fill="url(#grad)"/>
                <circle cx="${Math.random() * width}" cy="${Math.random() * height}" r="${100 + brandCount * 5}" fill="url(#glow)"/>
                <circle cx="${Math.random() * width}" cy="${Math.random() * height}" r="${80 + brandCount * 4}" fill="url(#glow)"/>
                <circle cx="${Math.random() * width}" cy="${Math.random() * height}" r="${120 + brandCount * 3}" fill="url(#glow)"/>
                <rect x="20" y="20" width="${width-40}" height="${height-40}" 
                      rx="20" ry="20" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="3"/>
                <rect x="${width-200}" y="30" width="160" height="35" rx="17" 
                      fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.2)" stroke-width="1"/>
                <text x="${width-120}" y="53" font-size="14" text-anchor="middle" fill="#CCE5FF" font-weight="bold">
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
                <text x="${width/2}" y="125" class="title">${title}</text>
                <text x="${width/2}" y="165" class="subtitle">${subtitle}</text>
                <text x="${width/2}" y="200" class="welcome">${welcome}</text>
                <line x1="${width/2-200}" y1="225" x2="${width/2+200}" y2="225" 
                      stroke="rgba(255,255,255,0.2)" stroke-width="2"/>
                <text x="${width/2}" y="255" font-size="12" text-anchor="middle" fill="rgba(255,255,255,0.5)">
                    ${brandCount > 10 ? '🌟 Largest Collection of Premium Auto Parts' : '✨ Curated Selection of Quality Brands'}
                </text>
            </svg>
        `;

        return await sharp(Buffer.from(svg)).png().toBuffer();
    }

    async createDynamicBrandGrid(brands, width, cols, itemWidth, itemHeight) {
        const rows = Math.ceil(brands.length / cols);
        const gridWidth = cols * (itemWidth + 20) - 20;
        const offsetX = (width - gridWidth) / 2;
        const totalHeight = rows * (itemHeight + 20) + 40;
        
        let svg = `<svg width="${width}" height="${totalHeight}">`;
        svg += `<style>
            .brand-name { font-family: Arial, sans-serif; font-size: ${itemWidth > 150 ? 14 : 12}px; fill: #FFFFFF; text-anchor: middle; font-weight: bold; }
            .brand-bg { fill: rgba(255,255,255,0.08); rx: 12; ry: 12; stroke: rgba(255,255,255,0.12); stroke-width: 1; }
            .brand-initial { font-family: Arial, sans-serif; font-size: ${itemWidth > 150 ? 28 : 22}px; fill: #FFFFFF; text-anchor: middle; font-weight: bold; }
        </style>`;

        for (let i = 0; i < brands.length; i++) {
            const row = Math.floor(i / cols);
            const col = i % cols;
            const x = offsetX + col * (itemWidth + 20);
            const y = row * (itemHeight + 20) + 20;
            
            const brand = brands[i];
            const isActive = brand.active !== false;
            const initial = brand.name.charAt(0);
            const bgOpacity = isActive ? '0.08' : '0.03';
            const strokeColor = isActive ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)';
            
            svg += `<rect x="${x}" y="${y}" width="${itemWidth}" height="${itemHeight}" 
                        fill="rgba(255,255,255,${bgOpacity})" rx="12" ry="12" 
                        stroke="${strokeColor}" stroke-width="${isActive ? 1 : 0.5}"/>`;
            svg += `<circle cx="${x + itemWidth/2}" cy="${y + 45}" r="${itemWidth > 150 ? 30 : 25}" 
                        fill="rgba(255,255,255,${isActive ? '0.12' : '0.05'})" 
                        stroke="rgba(255,255,255,${isActive ? '0.2' : '0.08'})" 
                        stroke-width="${isActive ? 2 : 1}"/>`;
            svg += `<text x="${x + itemWidth/2}" y="${y + 55}" class="brand-initial">${initial}</text>`;
            
            const nameColor = isActive ? '#FFFFFF' : 'rgba(255,255,255,0.4)';
            svg += `<text x="${x + itemWidth/2}" y="${y + 95}" class="brand-name" fill="${nameColor}">${brand.name}</text>`;
            
            if (isActive) {
                svg += `<circle cx="${x + itemWidth - 15}" cy="${y + 15}" r="4" fill="#4CAF50"/>`;
            } else {
                svg += `<circle cx="${x + itemWidth - 15}" cy="${y + 15}" r="4" fill="#f44336"/>`;
            }
        }

        svg += `</svg>`;

        return await sharp(Buffer.from(svg)).png().toBuffer();
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
                <text x="${width/2}" y="40" class="footer-text">${footerText}</text>
                <text x="${width/2}" y="65" class="footer-highlight">📞 ${phone}</text>
                <text x="${width/2}" y="88" class="footer-text">🛒 https://autosparessolution.com</text>
                <text x="${width/2}" y="115" class="footer-small">
                    🔄 Last Updated: ${new Date().toLocaleDateString('en-IN')} • ${brandCount} Brands
                </text>
            </svg>
        `;

        return await sharp(Buffer.from(svg)).png().toBuffer();
    }

    createTextBrochure(brands) {
        const activeBrands = brands.filter(b => b.active !== false);
        const brandNames = activeBrands.map(b => b.name).join(' • ');
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
            { id: 'mm', name: 'MM', active: true },
            { id: 'mtbl', name: 'MTBL', active: true },
            { id: 'stl', name: 'STL', active: true },
            { id: 'vf', name: 'VF', active: true },
            { id: 'wabco', name: 'WABCO', active: true }
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

module.exports = new DynamicBrandCollage();
