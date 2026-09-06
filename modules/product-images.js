// ============================================================
// 🖼️ DYNAMIC PRODUCT IMAGE SYSTEM
// ============================================================

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

class ProductImageManager {
    constructor() {
        // Base URL for product images
        this.imageBaseUrl = 'https://autosparessolution.github.io/images/';
        this.localImagePath = path.join(__dirname, '../public/images/products/');
        this.cache = new Map();
        this.imageExtensions = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
        
        // Ensure directory exists
        if (!fs.existsSync(this.localImagePath)) {
            fs.mkdirSync(this.localImagePath, { recursive: true });
            console.log('📁 Created product images directory');
        }
    }

    /**
     * Get image URL for a product part number
     * @param {string} partNumber - Product part number
     * @param {boolean} checkLocal - Check local cache first
     * @returns {Promise<string|null>} Image URL or null
     */
    async getProductImage(partNumber, checkLocal = true) {
        if (!partNumber) return null;
        
        const cleanPart = partNumber.toUpperCase().trim();
        
        // Check cache
        if (this.cache.has(cleanPart)) {
            return this.cache.get(cleanPart);
        }
        
        // Check local cache
        if (checkLocal) {
            const localPath = await this.checkLocalImage(cleanPart);
            if (localPath) {
                this.cache.set(cleanPart, localPath);
                return localPath;
            }
        }
        
        // Check remote URL
        const remoteUrl = await this.checkRemoteImage(cleanPart);
        if (remoteUrl) {
            this.cache.set(cleanPart, remoteUrl);
            return remoteUrl;
        }
        
        // Return null if no image found
        this.cache.set(cleanPart, null);
        return null;
    }

    /**
     * Check if product has local image
     */
    async checkLocalImage(partNumber) {
        for (const ext of this.imageExtensions) {
            const imagePath = path.join(this.localImagePath, `${partNumber}${ext}`);
            if (fs.existsSync(imagePath)) {
                return `/images/products/${partNumber}${ext}`;
            }
        }
        return null;
    }

    /**
     * Check if product has remote image
     */
    async checkRemoteImage(partNumber) {
        for (const ext of this.imageExtensions) {
            const url = `${this.imageBaseUrl}${partNumber}${ext}`;
            const exists = await this.urlExists(url);
            if (exists) {
                return url;
            }
        }
        return null;
    }

    /**
     * Check if URL exists
     */
    async urlExists(url) {
        try {
            const response = await fetch(url, { method: 'HEAD' });
            return response.ok;
        } catch (error) {
            return false;
        }
    }

    /**
     * Download product image locally
     */
    async downloadImage(partNumber, url) {
        try {
            const cleanPart = partNumber.toUpperCase().trim();
            const ext = path.extname(url) || '.png';
            const localPath = path.join(this.localImagePath, `${cleanPart}${ext}`);
            
            const response = await fetch(url);
            if (!response.ok) throw new Error('Download failed');
            
            const buffer = await response.arrayBuffer();
            fs.writeFileSync(localPath, Buffer.from(buffer));
            
            console.log(`📸 Downloaded image for ${cleanPart}`);
            return `/images/products/${cleanPart}${ext}`;
        } catch (error) {
            console.error(`❌ Failed to download image for ${partNumber}:`, error.message);
            return null;
        }
    }

    /**
     * Get multiple product images
     */
    async getProductImages(partNumbers) {
        const results = {};
        for (const part of partNumbers) {
            results[part] = await this.getProductImage(part);
        }
        return results;
    }

    /**
     * Get image HTML for product
     */
    async getProductImageHTML(partNumber, options = {}) {
        const {
            width = 100,
            height = 100,
            className = 'product-image',
            fallbackText = '🛞',
            alt = partNumber
        } = options;

        const imageUrl = await this.getProductImage(partNumber);
        
        if (imageUrl) {
            return `<img src="${imageUrl}" alt="${alt}" width="${width}" height="${height}" class="${className}" loading="lazy" />`;
        }
        
        return `<div class="${className}" style="width:${width}px;height:${height}px;display:flex;align-items:center;justify-content:center;background:#f0f0f0;border-radius:8px;font-size:40px;">${fallbackText}</div>`;
    }

    /**
     * Get product image for WhatsApp
     */
    async getProductImageWhatsApp(partNumber) {
        const imageUrl = await this.getProductImage(partNumber);
        if (imageUrl) {
            return imageUrl;
        }
        return null;
    }

    /**
     * Check image availability for multiple parts
     */
    async checkImageAvailability(parts) {
        const results = [];
        for (const part of parts) {
            const hasImage = !!(await this.getProductImage(part));
            results.push({ part, hasImage });
        }
        return results;
    }

    /**
     * Get image stats
     */
    async getImageStats() {
        try {
            const files = fs.readdirSync(this.localImagePath);
            const images = files.filter(f => {
                const ext = path.extname(f).toLowerCase();
                return this.imageExtensions.includes(ext);
            });
            
            return {
                totalImages: images.length,
                images: images.map(f => ({
                    filename: f,
                    part: path.basename(f, path.extname(f)),
                    url: `/images/products/${f}`
                }))
            };
        } catch (error) {
            console.error('❌ Failed to get image stats:', error.message);
            return { totalImages: 0, images: [] };
        }
    }
}

// ============================================================
// 📤 EXPORTS
// ============================================================

module.exports = new ProductImageManager();
