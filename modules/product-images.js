// ============================================================
// 🖼️ PRODUCT IMAGE MANAGER
// ============================================================

const fs = require('fs');
const path = require('path');

class ProductImageManager {
    constructor() {
        this.imageBaseUrl = 'https://autosparessolution.github.io/images/';
        this.localImagePath = path.join(__dirname, '../public/images/products/');
        this.cache = new Map();
        this.imageExtensions = ['.png', '.jpg', '.jpeg', '.webp'];
        
        if (!fs.existsSync(this.localImagePath)) {
            fs.mkdirSync(this.localImagePath, { recursive: true });
        }
    }

    async getProductImage(partNumber) {
        if (!partNumber) return null;
        const cleanPart = partNumber.toUpperCase().trim();
        
        if (this.cache.has(cleanPart)) {
            return this.cache.get(cleanPart);
        }
        
        // Check local
        for (const ext of this.imageExtensions) {
            const localPath = path.join(this.localImagePath, `${cleanPart}${ext}`);
            if (fs.existsSync(localPath)) {
                const url = `/images/products/${cleanPart}${ext}`;
                this.cache.set(cleanPart, url);
                return url;
            }
        }
        
        // Check remote
        for (const ext of this.imageExtensions) {
            const url = `${this.imageBaseUrl}${cleanPart}${ext}`;
            try {
                const response = await fetch(url, { method: 'HEAD' });
                if (response.ok) {
                    this.cache.set(cleanPart, url);
                    return url;
                }
            } catch (e) {}
        }
        
        this.cache.set(cleanPart, null);
        return null;
    }
}

module.exports = new ProductImageManager();
