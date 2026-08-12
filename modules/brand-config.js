// ============================================================
// 🎨 DYNAMIC BRAND CONFIGURATION - Auto-Update System
// ============================================================

const fs = require('fs');
const path = require('path');
const { LRUCache } = require('lru-cache');

const brandCache = new LRUCache({
    max: 100,
    ttl: 5 * 60 * 1000
});

class BrandManager {
    constructor() {
        this.brands = [];
        this.lastUpdate = null;
        this.updateInterval = null;
        this.isUpdating = false;
        this.loadBrandsFromFile();
    }

    loadBrandsFromFile() {
        try {
            const filePath = path.join(__dirname, '../data/brands.json');
            if (fs.existsSync(filePath)) {
                const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                this.brands = data.brands || [];
                this.lastUpdate = new Date(data.lastUpdated || Date.now());
                console.log(`✅ Loaded ${this.brands.length} brands from file`);
                return true;
            }
        } catch (error) {
            console.error('❌ Failed to load brands from file:', error.message);
        }
        
        this.brands = this.getDefaultBrands();
        console.log(`⚠️ Using ${this.brands.length} default brands`);
        return false;
    }

    saveBrandsToFile() {
        try {
            const filePath = path.join(__dirname, '../data/brands.json');
            const dirPath = path.dirname(filePath);
            
            if (!fs.existsSync(dirPath)) {
                fs.mkdirSync(dirPath, { recursive: true });
            }
            
            const data = {
                brands: this.brands,
                lastUpdated: new Date().toISOString(),
                totalBrands: this.brands.length
            };
            
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
            console.log(`✅ Saved ${this.brands.length} brands to file`);
            return true;
        } catch (error) {
            console.error('❌ Failed to save brands to file:', error.message);
            return false;
        }
    }

    // ============================================================
// 🎨 BRAND CONFIG - FIXED getDefaultBrands
// ============================================================

getDefaultBrands() {
    return [
        { id: 'rane', name: 'RANE', active: true },
        { id: 'tvs', name: 'TVS', active: true },
        { id: 'rbl', name: 'RBL', active: true },
        { id: 'rml', name: 'RML', active: true },
        { id: 'girling', name: 'GIRLING', active: true },
        { id: 'lmm', name: 'LMM', active: true },
        { id: 'mm', name: 'M&M', active: true },    // ✅ FIXED: M&M not MM
        { id: 'mtbl', name: 'MTBL', active: true },
        { id: 'stl', name: 'STL', active: true },
        { id: 'vf', name: 'VF', active: true },
        { id: 'wabco', name: 'WABCO', active: true },
        { id: 'leyparts', name: 'LEYPARTS', active: true },
        { id: 'greaves', name: 'GREAVES', active: true },
        { id: 'mgp', name: 'MGP', active: true }
    ];
}

    async fetchRemoteBrands() {
        const cacheKey = 'remote_brands';
        if (brandCache.has(cacheKey)) {
            console.log('📦 Using cached remote brands');
            return brandCache.get(cacheKey);
        }

        try {
            const githubUrl = 'https://raw.githubusercontent.com/autosparessolution/brand-config/main/brands.json';
            
            const response = await fetch(githubUrl, {
                headers: { 'Cache-Control': 'no-cache', 'User-Agent': 'ASSIST-WhatsApp-Webhook' },
                timeout: 5000
            });

            if (response.ok) {
                const data = await response.json();
                if (data.brands && data.brands.length > 0) {
                    brandCache.set(cacheKey, data.brands);
                    console.log(`✅ Fetched ${data.brands.length} brands from GitHub`);
                    return data.brands;
                }
            }

            const serverUrl = 'https://autosparessolution.com/api/brands';
            const serverResponse = await fetch(serverUrl, { timeout: 5000 });

            if (serverResponse.ok) {
                const data = await serverResponse.json();
                if (data.brands && data.brands.length > 0) {
                    brandCache.set(cacheKey, data.brands);
                    console.log(`✅ Fetched ${data.brands.length} brands from server`);
                    return data.brands;
                }
            }

            throw new Error('No remote source available');

        } catch (error) {
            console.log(`⚠️ Remote fetch failed: ${error.message}`);
            return null;
        }
    }

    async updateBrands(force = false) {
        if (this.isUpdating) {
            console.log('⏳ Brand update already in progress');
            return false;
        }

        if (!force && this.lastUpdate) {
            const age = Date.now() - this.lastUpdate.getTime();
            if (age < 5 * 60 * 1000) {
                console.log(`⏳ Brands updated ${Math.floor(age / 1000)}s ago, skipping...`);
                return true;
            }
        }

        this.isUpdating = true;
        console.log('🔄 Updating brands...');

        try {
            const remoteBrands = await this.fetchRemoteBrands();
            
            if (remoteBrands && remoteBrands.length > 0) {
                const merged = this.mergeBrands(remoteBrands);
                this.brands = merged;
                this.lastUpdate = new Date();
                this.saveBrandsToFile();
                console.log(`✅ Updated to ${this.brands.length} brands`);
                this.isUpdating = false;
                return true;
            } else {
                console.log('📦 No remote brands, keeping local');
                this.isUpdating = false;
                return true;
            }

        } catch (error) {
            console.error('❌ Brand update failed:', error.message);
            this.isUpdating = false;
            return false;
        }
    }

    mergeBrands(remoteBrands) {
        const merged = [];
        const seen = new Set();

        for (const brand of remoteBrands) {
            if (brand.id && !seen.has(brand.id)) {
                seen.add(brand.id);
                merged.push({
                    ...brand,
                    active: brand.active !== false,
                    priority: brand.priority || 999
                });
            }
        }

        for (const brand of this.brands) {
            if (brand.id && !seen.has(brand.id)) {
                seen.add(brand.id);
                merged.push(brand);
            }
        }

        merged.sort((a, b) => (a.priority || 999) - (b.priority || 999));
        return merged;
    }

    getActiveBrands(limit = null) {
        const active = this.brands.filter(b => b.active !== false);
        return limit ? active.slice(0, limit) : active;
    }

    getBrandById(id) {
        return this.brands.find(b => b.id === id);
    }

    getBrandByName(name) {
        return this.brands.find(b => 
            b.name.toLowerCase() === name.toLowerCase() ||
            b.name.toLowerCase().includes(name.toLowerCase())
        );
    }

    getBrandsForWhatsApp(maxBrands = 6) {
        const active = this.getActiveBrands();
        return active.slice(0, maxBrands).map(b => ({
            name: b.name,
            logo: b.logo || b.image || b.icon,
            id: b.id
        }));
    }

    getBrandTextList() {
        const active = this.getActiveBrands();
        return active.map(b => b.name).join(' • ');
    }

    getSummary() {
        const active = this.getActiveBrands();
        return {
            total: this.brands.length,
            active: active.length,
            inactive: this.brands.length - active.length,
            lastUpdate: this.lastUpdate,
            brands: this.brands.map(b => ({
                id: b.id,
                name: b.name,
                active: b.active !== false,
                priority: b.priority || 999
            }))
        };
    }
}

module.exports = new BrandManager();
