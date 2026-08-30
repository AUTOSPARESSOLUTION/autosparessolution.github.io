// ============================================================
// 🎉 CUSTOMER ENGAGEMENT - BIRTHDAY, FESTIVALS, WISHES
// ============================================================

const { db, dbRun, dbGet, dbAll } = require('./database');
const cron = require('cron');

class CustomerEngagement {
    constructor() {
        this.schedules = [];
        this.wishTemplates = new Map();
        this.isInitialized = false;
    }

    async initialize() {
        if (this.isInitialized) return;
        console.log('🎉 Initializing Customer Engagement System...');
        await this.loadTemplates();
        await this.loadFestivals();
        this.startSchedulers();
        this.isInitialized = true;
        console.log('✅ Customer Engagement System initialized!');
    }

    async loadTemplates() {
        try {
            const templates = await dbAll(`SELECT * FROM wish_templates WHERE is_active = 1`);
            for (const template of templates) {
                if (!this.wishTemplates.has(template.template_type)) this.wishTemplates.set(template.template_type, []);
                this.wishTemplates.get(template.template_type).push(template);
            }
            console.log(`📝 Loaded ${templates.length} wish templates`);
        } catch (error) { console.error('❌ Load templates error:', error.message); }
    }

    async loadFestivals() {
        try {
            const currentYear = new Date().getFullYear();
            this.festivals = await dbAll(`SELECT * FROM festivals WHERE year = ? AND is_active = 1`, [currentYear]);
            console.log(`🎉 Loaded ${this.festivals.length} festivals`);
        } catch (error) { console.error('❌ Load festivals error:', error.message); }
    }

    startSchedulers() {
        this.scheduleCron('0 8 * * *', async () => { await this.sendBirthdayWishes(); });
        this.scheduleCron('0 6 * * *', async () => { await this.sendGoodMorningWishes(); });
        this.scheduleCron('0 18 * * *', async () => { await this.sendDayEndWishes(); });
        this.scheduleCron('0 9 * * *', async () => { await this.checkUpcomingFestivals(); });
        console.log('⏰ All engagement schedulers started');
    }

    async sendBirthdayWishes() {
        console.log('🎂 Checking birthdays...');
        const today = new Date().toISOString().split('T')[0];
        const month = today.slice(5, 7);
        const day = today.slice(8, 10);
        const customers = await dbAll(`
            SELECT c.*, co.occasion_type, co.occasion_date, co.last_wished
            FROM customers c JOIN customer_occasions co ON c.phone = co.phone
            WHERE co.occasion_type = 'birthday' AND substr(co.occasion_date, 6, 5) = ? AND co.is_active = 1
            AND (co.last_wished IS NULL OR co.last_wished != ?)`,
            [`${month}-${day}`, today]
        );
        if (customers.length === 0) { console.log('🎂 No birthdays today'); return; }
        console.log(`🎂 Found ${customers.length} birthdays today!`);
        for (const customer of customers) {
            await this.sendBirthdayWish(customer);
            await dbRun(
                `UPDATE customer_occasions SET last_wished = ?, wish_count = wish_count + 1
                 WHERE phone = ? AND occasion_type = 'birthday'`,
                [today, customer.phone]
            );
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        await this.updateAnalytics('birthday', customers.length);
    }

    async sendBirthdayWish(customer) {
        const templates = this.wishTemplates.get('birthday') || [];
        const template = templates.length > 0 ? templates[Math.floor(Math.random() * templates.length)] : null;
        let message = template ? template.template_text : 
            `🎂 *Happy Birthday!* 🎂\n\nDear ${customer.name || 'Customer'},\n\n🎉 On your special day, we wish you all the happiness and success!\n\n🎁 *Special Birthday Offer:*\n   • 10% OFF on your next purchase\n   • Free delivery on all orders today\n\n📞 Call: ${process.env.PHONE || '9830300193'}`;
        await this.sendWhatsAppMessage(customer.phone, message);
        await dbRun(`INSERT INTO automated_wishes (phone, wish_type, message) VALUES (?, 'birthday', ?)`, [customer.phone, message]);
    }

    async sendGoodMorningWishes() {
        console.log('🌅 Sending Good Morning wishes...');
        const customers = await dbAll(`
            SELECT DISTINCT phone, name FROM customers 
            WHERE phone IN (SELECT DISTINCT phone FROM orders WHERE created_at > datetime('now', '-30 days'))
            LIMIT 100`);
        if (customers.length === 0) { console.log('🌅 No active customers found'); return; }
        console.log(`🌅 Sending good morning to ${customers.length} customers`);
        const templates = this.wishTemplates.get('good_morning') || [];
        const template = templates.length > 0 ? templates[Math.floor(Math.random() * templates.length)] : null;
        const baseMessage = template ? template.template_text : 
            `🌅 *Good Morning!* ☀️\n\nStart your day with a smile! 😊\n\n💫 *Today's Special:*\n   • 10% OFF on all orders above ₹500\n\n🛒 Shop: https://autosparessolution.com\n📞 Call: ${process.env.PHONE || '9830300193'}`;
        for (const customer of customers) {
            let message = baseMessage.replace(/{name}/g, customer.name || 'Customer');
            await this.sendWhatsAppMessage(customer.phone, message);
            await dbRun(`INSERT INTO automated_wishes (phone, wish_type, message) VALUES (?, 'good_morning', ?)`, [customer.phone, message]);
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        await this.updateAnalytics('good_morning', customers.length);
    }

    async sendDayEndWishes() {
        console.log('🌅 Sending Day End wishes...');
        const customers = await dbAll(`
            SELECT DISTINCT phone, name FROM customers 
            WHERE phone IN (SELECT DISTINCT phone FROM orders WHERE created_at > datetime('now', '-7 days'))
            LIMIT 100`);
        if (customers.length === 0) { console.log('🌅 No recent customers found'); return; }
        const templates = this.wishTemplates.get('good_evening') || [];
        const template = templates.length > 0 ? templates[Math.floor(Math.random() * templates.length)] : null;
        const baseMessage = template ? template.template_text : 
            `🌅 *Good Evening!* 🌇\n\nHope you had a wonderful day!\n\n⭐ *End of Day Offer:*\n   • Free delivery on all orders\n   • 5% OFF on all items\n\n📞 Call: ${process.env.PHONE || '9830300193'}`;
        for (const customer of customers) {
            let message = baseMessage.replace(/{name}/g, customer.name || 'Customer');
            await this.sendWhatsAppMessage(customer.phone, message);
            await dbRun(`INSERT INTO automated_wishes (phone, wish_type, message) VALUES (?, 'good_evening', ?)`, [customer.phone, message]);
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        await this.updateAnalytics('good_evening', customers.length);
    }

    async checkUpcomingFestivals() {
        console.log('🎉 Checking upcoming festivals...');
        const today = new Date();
        const sevenDaysLater = new Date();
        sevenDaysLater.setDate(today.getDate() + 7);
        const upcomingFestivals = await dbAll(`
            SELECT * FROM festivals WHERE date BETWEEN ? AND ? AND is_active = 1 ORDER BY date ASC`,
            [today.toISOString().split('T')[0], sevenDaysLater.toISOString().split('T')[0]]
        );
        if (upcomingFestivals.length === 0) { console.log('🎉 No upcoming festivals in next 7 days'); return; }
        console.log(`🎉 Found ${upcomingFestivals.length} upcoming festivals`);
        for (const festival of upcomingFestivals) {
            await this.sendFestivalNotifications(festival);
            this.scheduleFestivalWish(festival);
        }
    }

    async sendFestivalNotifications(festival) {
        const customers = await dbAll(`
            SELECT DISTINCT phone, name FROM customers 
            WHERE phone IN (SELECT DISTINCT phone FROM orders WHERE created_at > datetime('now', '-60 days'))
            LIMIT 200`);
        if (customers.length === 0) return;
        const message = `🎉 *${festival.name} is Coming!*\n\nDear Customer,\n\nCelebrate ${festival.name} with us!\n\n🎁 *Special Festival Offer:*\n   • 15% OFF on all products\n   • FREE delivery on orders above ₹500\n\n📅 ${festival.date}\n\n🛒 Shop: https://autosparessolution.com\n📞 Call: ${process.env.PHONE || '9830300193'}`;
        for (const customer of customers) {
            await this.sendWhatsAppMessage(customer.phone, message);
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    scheduleFestivalWish(festival) {
        const date = new Date(festival.date);
        this.scheduleCron(`${date.getMinutes()} ${date.getHours()} ${date.getDate()} ${date.getMonth() + 1} *`, async () => {
            console.log(`🎉 Sending ${festival.name} wishes...`);
            const customers = await dbAll(`
                SELECT DISTINCT phone, name FROM customers 
                WHERE phone IN (SELECT DISTINCT phone FROM orders WHERE created_at > datetime('now', '-60 days'))
                LIMIT 200`);
            const message = `🎉 *Happy ${festival.name}!* 🎉\n\nWishing you and your family a very Happy ${festival.name}! 🎊\n\n🎁 *Festival Special Offer:*\n   • 20% OFF on all orders\n   • FREE gift with every purchase\n\n🛒 Shop: https://autosparessolution.com\n📞 Call: ${process.env.PHONE || '9830300193'}`;
            for (const customer of customers) {
                await this.sendWhatsAppMessage(customer.phone, message);
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            await this.updateAnalytics('festival', customers.length);
        });
    }

    async addCustomerOccasion(phone, type, date, name = null) {
        try {
            const customer = await dbGet(`SELECT name FROM customers WHERE phone = ?`, [phone]);
            const customerName = name || customer?.name || `Customer-${phone.slice(-4)}`;
            await dbRun(
                `INSERT OR REPLACE INTO customer_occasions (phone, name, occasion_type, occasion_date, is_active)
                 VALUES (?, ?, ?, ?, 1)`,
                [phone, customerName, type, date]
            );
            return { success: true, message: `${type} added successfully` };
        } catch (error) { return { success: false, message: error.message }; }
    }

    async getCustomerOccasions(phone) {
        try { return await dbAll(`SELECT * FROM customer_occasions WHERE phone = ?`, [phone]); }
        catch (error) { console.error('❌ Get occasions error:', error.message); return []; }
    }

    async getEngagementStats() {
        try {
            return await dbAll(`
                SELECT wish_type, COUNT(*) as total_sent,
                       SUM(CASE WHEN delivered = 1 THEN 1 ELSE 0 END) as delivered,
                       SUM(CASE WHEN read = 1 THEN 1 ELSE 0 END) as read,
                       SUM(CASE WHEN reply_received IS NOT NULL THEN 1 ELSE 0 END) as replies,
                       AVG(engagement_score) as avg_engagement
                FROM automated_wishes GROUP BY wish_type`);
        } catch (error) { console.error('❌ Get engagement stats error:', error.message); return []; }
    }

    async sendWhatsAppMessage(to, message) {
        try {
            await dbRun(`INSERT INTO queued_messages (phone, message, status) VALUES (?, ?, 'pending')`, [to, message]);
            return { success: true };
        } catch (error) { console.error('❌ Queue message error:', error.message); return { success: false }; }
    }

    async updateAnalytics(campaignType, count) {
        try {
            const today = new Date().toISOString().split('T')[0];
            const existing = await dbGet(`SELECT * FROM campaign_analytics WHERE campaign_type = ? AND campaign_date = ?`, [campaignType, today]);
            if (existing) {
                await dbRun(`UPDATE campaign_analytics SET total_sent = total_sent + ?, total_delivered = total_delivered + ? WHERE campaign_type = ? AND campaign_date = ?`, [count, count, campaignType, today]);
            } else {
                await dbRun(`INSERT INTO campaign_analytics (campaign_type, total_sent, total_delivered, campaign_date) VALUES (?, ?, ?, ?)`, [campaignType, count, count, today]);
            }
        } catch (error) { console.error('❌ Update analytics error:', error.message); }
    }

    scheduleCron(time, callback) {
        try { const job = new cron.CronJob(time, callback, null, true); this.schedules.push(job); return job; }
        catch (error) { console.error('❌ Schedule cron error:', error.message); return null; }
    }

    async sendWeeklyBrochure() {
        console.log('📤 Sending weekly brochure...');
        const customers = await dbAll(`
            SELECT DISTINCT phone, name FROM customers 
            WHERE phone IN (SELECT DISTINCT phone FROM orders WHERE created_at > datetime('now', '-90 days'))
            LIMIT 500`);
        if (customers.length === 0) return;
        const message = `📊 *Weekly Specials!* 📊\n\n🛒 *Hot Deals of the Week:*\n\n1. *Clutch Plate* - Maruti 800\n   📉 20% OFF\n   💰 Only ₹1,200\n\n2. *Brake Pads* - All Models\n   📉 15% OFF\n   💰 Only ₹800\n\n3. *Engine Oil* - Premium Grade\n   📉 10% OFF\n   💰 Only ₹1,500\n\n🛍️ Shop: https://autosparessolution.com\n📞 Call: ${process.env.PHONE || '9830300193'}`;
        for (const customer of customers) {
            await this.sendWhatsAppMessage(customer.phone, message);
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        await this.updateAnalytics('weekly_brochure', customers.length);
    }
}

module.exports = new CustomerEngagement();
