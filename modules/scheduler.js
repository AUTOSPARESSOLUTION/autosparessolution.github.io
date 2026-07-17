// ============================================================
// ⏰ SCHEDULER - Automatic Restock Notifications
// ============================================================

const db = require('./database');
const customerLog = require('./customer-log');

const CHECK_INTERVAL = 6 * 60 * 60 * 1000; // 6 hours

// ============================================================
// 🔍 CHECK AND NOTIFY RESTOCKS
// ============================================================

async function checkAndNotifyRestocks() {
    console.log('🔍 Checking for restocked products...');
    
    try {
        const waiting = await customerLog.getWaitingNotifications();
        
        if (waiting.length === 0) {
            console.log('ℹ️ No waiting customers');
            return;
        }
        
        const parts = [...new Set(waiting.map(w => w.part))];
        let totalNotified = 0;
        
        for (const part of parts) {
            const product = await db.getProductExact(part);
            
            if (product && product.stock > 0) {
                console.log(`🔔 Product ${part} is back in stock! Notifying customers...`);
                const result = await customerLog.notifyRestock(part);
                totalNotified += result.notified;
            }
        }
        
        if (totalNotified > 0) {
            console.log(`✅ Notified ${totalNotified} customers about restocks`);
        } else {
            console.log('ℹ️ No restocks to notify');
        }
        
    } catch (error) {
        console.error('❌ Restock check error:', error.message);
    }
}

// ============================================================
// 🚀 START SCHEDULER
// ============================================================

function startScheduler() {
    console.log(`⏰ Restock notification scheduler started (check every ${CHECK_INTERVAL / 3600000} hours)`);
    
    setTimeout(checkAndNotifyRestocks, 5000);
    setInterval(checkAndNotifyRestocks, CHECK_INTERVAL);
}

module.exports = {
    startScheduler,
    checkAndNotifyRestocks
};
