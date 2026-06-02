// brochure-generator.js
// Reads dealer data from localStorage (Customer Master)
// Auto Spares Solution

(function () {

    console.log("✅ Brochure Generator Loaded");

    let dealerMaster = [];
    let currentOffers = [];

    // =====================================================
    // LOAD DEALER MASTER FROM LOCALSTORAGE
    // =====================================================
    async function loadDealerMaster() {

        try {
            // First try to get from localStorage (Customer Master / Users)
            const users = JSON.parse(localStorage.getItem('users') || '[]');
            const dealers = JSON.parse(localStorage.getItem('dealers') || '[]');
            
            // Combine both sources
            let allCustomers = [...users, ...dealers];
            
            // Also try to load from Excel as fallback
            if (allCustomers.length === 0) {
                console.log("No data in localStorage, trying Excel fallback...");
                allCustomers = await loadExcelFallback();
            }
            
            dealerMaster = allCustomers.map(customer => {
                
                const dealerName = customer.name || 
                                  customer.business || 
                                  customer.dealer || 
                                  customer['Retailer Name'] ||
                                  customer['Dealer Name'] ||
                                  '';
                
                return {
                    name: dealerName,
                    normalizedName: normalizeText(dealerName),
                    phone: cleanPhone(customer.phone || customer['Mobile No'] || ''),
                    email: customer.email || '',
                    address: customer.address || '',
                    gstin: customer.gstin || '',
                    city: customer.city || customer['District'] || '',
                    pincode: customer.pincode || '',
                    ownerName: customer.ownerName || customer['Owner Name'] || '',
                    customerType: customer.customerType || customer['Customer Type'] || '',
                    rlpCode: customer.rlpCode || customer['RLP Code'] || ''
                };
            });
            
            // Remove duplicates by name
            const uniqueMap = new Map();
            for (const dealer of dealerMaster) {
                if (dealer.name && !uniqueMap.has(dealer.normalizedName)) {
                    uniqueMap.set(dealer.normalizedName, dealer);
                }
            }
            dealerMaster = Array.from(uniqueMap.values());
            
            console.log("✅ Dealer master loaded from localStorage:", dealerMaster.length);
            return dealerMaster;
            
        } catch (err) {
            console.error("Error loading dealer master:", err);
            dealerMaster = [];
            return [];
        }
    }
    
    // =====================================================
    // EXCEL FALLBACK (if localStorage is empty)
    // =====================================================
    async function loadExcelFile(url, sheetName = null) {
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Cannot load ${url}`);
            const buffer = await response.arrayBuffer();
            const workbook = XLSX.read(buffer, { type: 'array' });
            let sheet;
            if (sheetName && workbook.SheetNames.includes(sheetName)) {
                sheet = workbook.Sheets[sheetName];
            } else {
                sheet = workbook.Sheets[workbook.SheetNames[0]];
            }
            return XLSX.utils.sheet_to_json(sheet);
        } catch (err) {
            console.error(err);
            return [];
        }
    }
    
    async function loadExcelFallback() {
        try {
            const rows = await loadExcelFile('data/RETAILER data details.xlsx', 'SAPUI5 Export');
            return rows.map(row => ({
                name: row['Retailer Name'] || row['Customer Name'] || row['Dealer Name'] || '',
                phone: row['Mobile No'] || row['Phone'] || '',
                email: row['Email'] || '',
                address: row['Address'] || '',
                city: row['District'] || '',
                ownerName: row['Owner Name'] || '',
                customerType: row['Customer Type'] || '',
                rlpCode: row['RLP Code'] || ''
            }));
        } catch(err) {
            return [];
        }
    }

    // =====================================================
    // NORMALIZE TEXT
    // =====================================================
    function normalizeText(text) {
        return String(text || '')
            .trim()
            .toUpperCase()
            .replace(/\s+/g, ' ');
    }

    // =====================================================
    // CLEAN PHONE
    // =====================================================
    function cleanPhone(phone) {
        let p = String(phone || '').replace(/\D/g, '');
        if (!p) return '';
        if (p.startsWith('0')) p = p.substring(1);
        if (p.length === 10) p = '91' + p;
        return p;
    }

    // =====================================================
    // LOAD OFFERS FROM LOCALSTORAGE
    // =====================================================
    function loadOffers() {
        try {
            const data = JSON.parse(localStorage.getItem('dealerOffers') || '{}');
            currentOffers = data.offers || [];
            console.log("✅ Offers loaded:", currentOffers.length);
            return currentOffers;
        } catch (err) {
            console.error(err);
            currentOffers = [];
            return [];
        }
    }

    // =====================================================
    // GET OFFERS BY DEALER (CASE-INSENSITIVE)
    // =====================================================
    function getAllDealerOffers(dealerName) {
        const normalizedDealer = normalizeText(dealerName);
        return currentOffers.filter(o => {
            const offerDealer = normalizeText(o.dealer || o.customer || o.customerName || '');
            return offerDealer === normalizedDealer;
        });
    }

    // =====================================================
    // FIND DEALER INFO (CASE-INSENSITIVE)
    // =====================================================
    function findDealerInfo(dealerName) {
        const normalized = normalizeText(dealerName);
        return dealerMaster.find(d => d.normalizedName === normalized);
    }

    // =====================================================
    // GENERATE WHATSAPP MESSAGE
    // =====================================================
    function generateWhatsAppFlyerMessage(dealerName) {
        const offers = getAllDealerOffers(dealerName);
        const dealer = findDealerInfo(dealerName);
        
        let msg = '';
        msg += '*⚡ AUTO SPARES SOLUTION ⚡*\n\n';
        msg += `*Dealer:* ${dealerName}\n`;
        if (dealer?.phone) msg += `📞 ${dealer.phone}\n`;
        msg += `\n*📋 SPECIAL OFFER LIST (${offers.length} items)*\n`;
        msg += '━━━━━━━━━━━━━━━━━━━━\n\n';
        
        offers.forEach((o, index) => {
            msg += `${index + 1}. *${o.part}*\n`;
            msg += `   💰 Offer Price: ₹${Number(o.offerPrice || 0).toFixed(2)}\n`;
            if (o.discount > 0) msg += `   ✨ Discount: ${o.discount}%\n`;
            msg += `   📦 Stock: ${o.totalStock || 0}\n\n`;
        });
        
        if (offers.length === 0) msg += 'No active offers at this time.\n\n';
        
        msg += '━━━━━━━━━━━━━━━━━━━━\n';
        msg += '*📞 CONTACT US*\n';
        msg += 'Phone: 9830300193\n';
        msg += 'Email: contact@autosparessolution.com\n';
        msg += '━━━━━━━━━━━━━━━━━━━━\n\n';
        msg += '_Reply with part numbers and quantity_\n';
        msg += '_Example: YES 0606CAA16711N x5_\n\n';
        msg += '*Thank you for your business!*';
        
        return msg;
    }

    // =====================================================
    // SEND WHATSAPP TO SINGLE DEALER
    // =====================================================
    function sendFlyerWhatsApp(dealerName) {
        const dealer = findDealerInfo(dealerName);
        if (!dealer) {
            alert('Dealer not found:\n' + dealerName);
            return;
        }
        if (!dealer.phone) {
            alert('Phone not found for:\n' + dealerName);
            return;
        }
        const offers = getAllDealerOffers(dealerName);
        if (offers.length === 0) {
            alert('No offers found for:\n' + dealerName);
            return;
        }
        const msg = generateWhatsAppFlyerMessage(dealerName);
        const encoded = encodeURIComponent(msg);
        const url = `https://wa.me/${dealer.phone}?text=${encoded}`;
        window.open(url, '_blank');
    }

    // =====================================================
    // GET DEALERS WITH OFFERS (MATCH WITH LOCALSTORAGE)
    // =====================================================
    async function getDealersWithOffers() {
        await loadDealerMaster();
        loadOffers();
        
        const result = [];
        const processedNames = new Set();
        
        for (const offer of currentOffers) {
            const dealerName = offer.dealer || offer.customer || offer.customerName || '';
            if (!dealerName || processedNames.has(dealerName)) continue;
            processedNames.add(dealerName);
            
            const dealer = findDealerInfo(dealerName);
            const dealerOffers = getAllDealerOffers(dealerName);
            
            if (dealerOffers.length > 0) {
                result.push({
                    name: dealerName,
                    phone: dealer?.phone || '',
                    email: dealer?.email || '',
                    district: dealer?.city || dealer?.district || '',
                    owner: dealer?.ownerName || '',
                    offerCount: dealerOffers.length,
                    maxDiscount: Math.max(...dealerOffers.map(x => Number(x.discount || 0)), 0)
                });
            }
        }
        
        console.log("✅ Dealers with offers:", result.length);
        return result;
    }

    // =====================================================
    // SHOW BROCHURE PREVIEW
    // =====================================================
    function showFlyerPreview(dealerName) {
        const offers = getAllDealerOffers(dealerName);
        const dealer = findDealerInfo(dealerName);
        
        if (offers.length === 0) {
            alert('No offers for:\n' + dealerName);
            return;
        }
        
        let html = `<!DOCTYPE html>
        <html>
        <head>
            <title>Offer Brochure - ${escapeHtml(dealerName)}</title>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; background: #f5f5f5; }
                .container { max-width: 800px; margin: 0 auto; background: white; border-radius: 10px; padding: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                .header { text-align: center; border-bottom: 2px solid #facc15; padding-bottom: 15px; margin-bottom: 20px; }
                .header h1 { color: #0a2e3a; margin: 0; }
                .dealer-info { background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
                table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
                th { background: #facc15; color: #0f172a; }
                .footer { text-align: center; margin-top: 20px; padding-top: 15px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
                .discount-high { color: #dc2626; font-weight: bold; }
                .stock-low { color: #f97316; }
                @media print { body { background: white; padding: 0; } .container { box-shadow: none; } }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>⚡ AUTO SPARES SOLUTION ⚡</h1>
                    <p>Premium Auto Parts Wholesaler</p>
                </div>
                <div class="dealer-info">
                    <h2>${escapeHtml(dealerName)}</h2>
                    <p>📞 ${dealer?.phone || 'Not available'}</p>
                    <p>📧 ${dealer?.email || ''}</p>
                    <p>📍 ${dealer?.address || dealer?.city || ''}</p>
                </div>
                <h3>📋 Offer List (${offers.length} items)</h3>
                <table>
                    <thead><tr><th>#</th><th>Part No</th><th>Offer Price</th><th>Discount</th><th>Stock</th></tr></thead>
                    <tbody>
        `;
        
        offers.forEach((o, idx) => {
            html += `<tr>
                <td>${idx + 1}</td>
                <td><strong>${escapeHtml(o.part || '')}</strong></td>
                <td>₹${Number(o.offerPrice || 0).toFixed(2)}</td>
                <td class="${o.discount >= 5 ? 'discount-high' : ''}">${o.discount || 0}%</td>
                <td class="${o.totalStock < 10 ? 'stock-low' : ''}">${o.totalStock || 0}</td>
            </tr>`;
        });
        
        html += `
                    </tbody>
                </table>
                <div class="footer">
                    <p>Contact: 9830300193 | contact@autosparessolution.com</p>
                    <p>© Auto Spares Solution</p>
                </div>
            </div>
        </body>
        </html>`;
        
        const win = window.open('', '_blank');
        win.document.write(html);
        win.document.close();
    }
    
    function escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/[&<>]/g, function(m) {
            if (m === '&') return '&amp;';
            if (m === '<') return '&lt;';
            if (m === '>') return '&gt;';
            return m;
        });
    }

    // =====================================================
    // EXPORT ALL BROCHURES
    // =====================================================
    async function exportAllFlyers() {
        await loadDealerMaster();
        loadOffers();
        
        let html = `<!DOCTYPE html>
        <html>
        <head><title>All Dealer Brochures</title><meta charset="UTF-8">
        <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            .brochure { page-break-after: always; margin-bottom: 30px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
            th { background: #facc15; }
            .header { text-align: center; border-bottom: 2px solid #facc15; margin-bottom: 15px; }
            .footer { text-align: center; margin-top: 20px; font-size: 11px; color: #666; }
        </style></head><body>`;
        
        const dealers = await getDealersWithOffers();
        
        for (const d of dealers) {
            const offers = getAllDealerOffers(d.name);
            html += `
            <div class="brochure">
                <div class="header"><h2>AUTO SPARES SOLUTION</h2><p>Dealer Offer Brochure</p></div>
                <h3>${escapeHtml(d.name)}</h3>
                <p>📞 ${d.phone || 'No phone'}</p>
                <table><thead><tr><th>Part No</th><th>Offer Price</th><th>Discount</th><th>Stock</th></tr></thead><tbody>`;
            for (const o of offers) {
                html += `<tr><td>${escapeHtml(o.part || '')}</td><td>₹${Number(o.offerPrice || 0).toFixed(2)}</td><td>${o.discount || 0}%</td><td>${o.totalStock || 0}</td></tr>`;
            }
            html += `</tbody></table><div class="footer">Contact: 9830300193 | contact@autosparessolution.com</div></div>`;
        }
        
        html += `</body></html>`;
        
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `all_brochures_${new Date().toISOString().split('T')[0]}.html`;
        a.click();
        URL.revokeObjectURL(url);
        alert(`Exported ${dealers.length} brochures!`);
    }

    // =====================================================
    // BULK WHATSAPP
    // =====================================================
    async function sendBulkWhatsAppFlyers() {
        const dealers = await getDealersWithOffers();
        if (dealers.length === 0) {
            alert('No dealers with offers found');
            return;
        }
        
        let count = 0;
        for (const d of dealers) {
            if (!d.phone) continue;
            const msg = generateWhatsAppFlyerMessage(d.name);
            const url = `https://wa.me/${d.phone}?text=${encodeURIComponent(msg)}`;
            window.open(url, '_blank');
            count++;
            await new Promise(r => setTimeout(r, 1500));
        }
        alert(`📱 Opened WhatsApp for ${count} dealers.\nSend messages manually.`);
    }

    // =====================================================
    // GLOBAL EXPORT
    // =====================================================
    window.BrochureGenerator = {
        loadDealerMaster,
        loadOffers,
        getAllDealerOffers,
        generateWhatsAppFlyerMessage,
        sendFlyerWhatsApp,
        sendBulkWhatsAppFlyers,
        getDealersWithOffers,
        showFlyerPreview,
        exportAllFlyers,
        findDealerInfo,
        getDealerMaster: () => dealerMaster,
        getCurrentOffers: () => currentOffers
    };

})();
