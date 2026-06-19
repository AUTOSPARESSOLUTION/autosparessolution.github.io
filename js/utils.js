// utils.js - Shared Utilities for Auto Spares Solution
// Enhanced with all required fixes

(function() {

    console.log("🔧 Utilities loaded");

    // ===================================================
    // NORMALIZATION HELPERS
    // ===================================================

    function normalizeDealerName(name) {
        return String(name || '')
            .replace(/[\u200B-\u200D\uFEFF]/g, "")
            .replace(/\n|\r|\t/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .toLowerCase(); // Use lowercase for consistent matching
    }

    function normalizePartNumber(part) {
        return String(part || '')
            .replace(/[\u200B-\u200D\uFEFF]/g, "")
            .replace(/\s+/g, " ")
            .trim()
            .toUpperCase();
    }

    function normalizeText(text) {
        return String(text || '')
            .replace(/[\u200B-\u200D\uFEFF]/g, "")
            .replace(/\n|\r|\t/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .toLowerCase();
    }

    // ===================================================
    // SAFE CONVERSION HELPERS
    // ===================================================

    function safeNumber(value, defaultValue = 0) {
        const num = Number(value);
        return isNaN(num) ? defaultValue : num;
    }

    function safeString(value, defaultValue = '') {
        return String(value || defaultValue);
    }

    function safePhone(value) {
        // Remove all non-digit characters
        let cleaned = String(value || '').replace(/\D/g, '');
        if (!cleaned) return '';
        
        // Handle Indian numbers
        if (cleaned.length === 10) return cleaned;
        if (cleaned.length === 11 && cleaned.startsWith('0')) return cleaned.substring(1);
        if (cleaned.length === 12 && cleaned.startsWith('91')) return cleaned.substring(2);
        if (cleaned.length > 10) return cleaned.slice(-10);
        return cleaned;
    }

    function formatPhoneForWhatsApp(phone) {
        let cleaned = safePhone(phone);
        if (!cleaned) return '';
        if (cleaned.length === 10) return '91' + cleaned;
        if (cleaned.length === 11 && cleaned.startsWith('0')) return '91' + cleaned.substring(1);
        if (cleaned.length === 12 && cleaned.startsWith('91')) return cleaned;
        return cleaned;
    }

    // ===================================================
    // ESCAPE HTML
    // ===================================================

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // ===================================================
    // TOAST NOTIFICATIONS
    // ===================================================

    function showToast(message, type = 'info', duration = 4000) {
        const colors = {
            success: '#16a34a',
            error: '#dc2626',
            warning: '#f59e0b',
            info: '#2563eb'
        };

        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            container.style.cssText = `
                position: fixed;
                bottom: 20px;
                right: 20px;
                z-index: 99999;
                display: flex;
                flex-direction: column;
                gap: 8px;
                max-width: 400px;
            `;
            document.body.appendChild(container);

            if (!document.getElementById('toast-styles')) {
                const style = document.createElement('style');
                style.id = 'toast-styles';
                style.textContent = `
                    @keyframes slideIn {
                        from { transform: translateX(100%); opacity: 0; }
                        to { transform: translateX(0); opacity: 1; }
                    }
                    @keyframes slideOut {
                        from { transform: translateX(0); opacity: 1; }
                        to { transform: translateX(100%); opacity: 0; }
                    }
                `;
                document.head.appendChild(style);
            }
        }

        const toast = document.createElement('div');
        toast.style.cssText = `
            background: ${colors[type] || colors.info};
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            font-family: Arial, sans-serif;
            font-size: 14px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            animation: slideIn 0.3s ease;
            word-wrap: break-word;
        `;
        toast.textContent = message;
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }

    // ===================================================
    // DATE HELPERS
    // ===================================================

    function formatDate(date, format = 'DD/MM/YYYY') {
        const d = new Date(date);
        if (isNaN(d.getTime())) return '';
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        
        return format
            .replace('DD', day)
            .replace('MM', month)
            .replace('YYYY', year);
    }

    function getExpiryDate(days = 15) {
        const date = new Date();
        date.setDate(date.getDate() + days);
        return date.toISOString();
    }

    // ===================================================
    // STORAGE HELPERS
    // ===================================================

    function getStorageItem(key, defaultValue = null) {
        try {
            const item = localStorage.getItem(key);
            if (!item) return defaultValue;
            return JSON.parse(item);
        } catch (e) {
            console.error('Storage get error:', e);
            return defaultValue;
        }
    }

    function setStorageItem(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (e) {
            console.error('Storage set error:', e);
            return false;
        }
    }

    function removeStorageItem(key) {
        localStorage.removeItem(key);
    }

    // ===================================================
    // DEALER MATCHING HELPERS
    // ===================================================

    function calculateMatchScore(str1, str2) {
        const s1 = normalizeText(str1);
        const s2 = normalizeText(str2);
        
        if (s1 === s2) return 1.0;
        if (s1.includes(s2) || s2.includes(s1)) {
            return 0.8;
        }
        
        const words1 = s1.split(' ').filter(w => w.length > 2);
        const words2 = s2.split(' ').filter(w => w.length > 2);
        
        let matches = 0;
        for (const w1 of words1) {
            for (const w2 of words2) {
                if (w1 === w2) matches++;
            }
        }
        
        const maxWords = Math.max(words1.length, words2.length);
        return maxWords > 0 ? matches / maxWords : 0;
    }

    function findBestMatch(searchText, candidates, threshold = 0.5) {
        const normalized = normalizeText(searchText);
        let bestMatch = null;
        let bestScore = 0;

        for (const candidate of candidates) {
            const score = calculateMatchScore(normalized, candidate);
            if (score > bestScore && score >= threshold) {
                bestScore = score;
                bestMatch = candidate;
            }
        }

        return bestMatch;
    }

    // ===================================================
    // PART NUMBER DETECTION HELPERS
    // ===================================================

    function detectPartColumn(row) {
        const keys = Object.keys(row);
        const patterns = ['part no', 'partno', 'part number', 'partnumber', 'item code', 'material code', 'material no'];
        for (const key of keys) {
            const lower = key.toLowerCase();
            for (const pattern of patterns) {
                if (lower.includes(pattern)) return key;
            }
        }
        return null;
    }

    function detectStockColumn(row) {
        const keys = Object.keys(row);
        const patterns = ['stock', 'available stock', 'avl stock', 'qty', 'quantity', 'current stock', 'free stock'];
        for (const key of keys) {
            const lower = key.toLowerCase();
            for (const pattern of patterns) {
                if (lower.includes(pattern)) return key;
            }
        }
        return null;
    }

    function detectPriceColumn(row) {
        const keys = Object.keys(row);
        const patterns = ['price', 'mrp', 'rate', 'cost', 'amount'];
        for (const key of keys) {
            const lower = key.toLowerCase();
            for (const pattern of patterns) {
                if (lower.includes(pattern)) return key;
            }
        }
        return null;
    }

    // ===================================================
    // COLUMN WIDTH HELPERS FOR PDF
    // ===================================================

    function getColumnWidths() {
        return {
            part: { cellWidth: 22 },
            description: { cellWidth: 50 },
            application: { cellWidth: 40 },
            mrp: { cellWidth: 15 },
            basicPrice: { cellWidth: 18 },
            discount: { cellWidth: 12 },
            netPrice: { cellWidth: 20 },
            stock: { cellWidth: 15 }
        };
    }

    // ===================================================
    // EXPORT
    // ===================================================

    window.Utils = {
        // Normalization
        normalizeDealerName,
        normalizePartNumber,
        normalizeText,
        
        // Safe conversions
        safeNumber,
        safeString,
        safePhone,
        formatPhoneForWhatsApp,
        
        // HTML
        escapeHtml,
        
        // Notifications
        showToast,
        
        // Dates
        formatDate,
        getExpiryDate,
        
        // Storage
        getStorageItem,
        setStorageItem,
        removeStorageItem,
        
        // Matching
        calculateMatchScore,
        findBestMatch,
        
        // Column detection
        detectPartColumn,
        detectStockColumn,
        detectPriceColumn,
        
        // PDF helpers
        getColumnWidths
    };

})();
