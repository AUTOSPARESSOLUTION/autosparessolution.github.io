// brochure-generator.js – Generate personalised flyers, brochures, WhatsApp messages
(function() {
    console.log("Brochure Generator loaded");

    let dealerMaster = [];  // Dealer data from Excel
    let currentOffers = []; // Offers from intelligence system

    // Load dealer master from Excel
    // Load Dealer Master from Excel (contact info for flyers)
async function loadDealerMaster() {
    try {
        const response = await fetch('data/dealer-master.xlsx');
        if (!response.ok) throw new Error('Dealer master not found');
        const arrayBuffer = await response.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet);
        
        dealerMaster = rows.map(row => ({
            // Map your retailers master columns
            name: row['Retailer Name'] || row['Dealer Name'] || row['name'],
            address: row['Address'] || row['address'] || '',
            phone: row['Mobile No'] || row['Phone'] || row['phone'] || '',
            email: row['Email'] || row['email'] || '',
            city: row['District'] || row['City'] || row['city'] || '',
            ownerName: row['Owner Name'] || '',
            rlpCode: row['RLP Code'] || '',
            customerType: row['Customer Type'] || '',
            subDist: row['Sub Dist Dsc'] || ''
        }));
        console.log(`✅ Loaded ${dealerMaster.length} dealers from master file`);
        return dealerMaster;
    } catch(err) {
        console.warn("Dealer master not loaded:", err);
        return [];
    }
}

    // Load offers from intelligence system
    function loadOffers() {
        const offersData = JSON.parse(localStorage.getItem('dealerOffers') || '{}');
        currentOffers = offersData.offers || [];
        console.log(`✅ Loaded ${currentOffers.length} offers`);
        return currentOffers;
    }

    // Generate HTML flyer for a specific dealer
    function generateFlyerHTML(dealer, offers) {
        const dealerOffers = offers.filter(o => o.dealer === dealer.name);
        const topOffers = dealerOffers.slice(0, 5);
        
        let offersHtml = '';
        for (const offer of topOffers) {
            offersHtml += `
                <div style="background: rgba(241,196,15,0.1); padding: 12px; margin: 10px 0; border-radius: 8px; border-left: 4px solid #facc15;">
                    <div style="font-size: 16px; font-weight: bold;">🎯 ${offer.part}</div>
                    <div style="font-size: 14px;">Your monthly average: ${offer.avgQty.toFixed(1)} units</div>
                    <div style="font-size: 18px; color: #facc15; margin-top: 5px;">
                        ${offer.discount > 0 ? `${offer.discount}% OFF` : '⚠️ Low Stock Alert'}
                    </div>
                    <div>💰 Offer Price: ₹${offer.offerPrice.toFixed(2)} (was ₹${offer.originalPrice.toFixed(2)})</div>
                    <div>📦 Stock Available: ${offer.totalStock} units</div>
                </div>
            `;
        }
        
        if (topOffers.length === 0) {
            offersHtml = '<div style="padding: 20px; text-align: center;">No active offers at this time.</div>';
        }
        
        return `<!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Special Offer for ${dealer.name}</title>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body {
                    font-family: 'Roboto', 'Segoe UI', sans-serif;
                    background: linear-gradient(135deg, #0f2027, #203a43, #2c5364);
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    min-height: 100vh;
                    padding: 20px;
                }
                .flyer {
                    max-width: 600px;
                    width: 100%;
                    background: #ffffff;
                    border-radius: 20px;
                    overflow: hidden;
                    box-shadow: 0 20px 40px rgba(0,0,0,0.3);
                }
                .flyer-header {
                    background: linear-gradient(135deg, #0a2e3a, #0a4b5e);
                    color: white;
                    padding: 20px;
                    text-align: center;
                }
                .flyer-header h1 {
                    color: #facc15;
                    font-size: 24px;
                    margin-bottom: 5px;
                }
                .flyer-header p {
                    font-size: 12px;
                    opacity: 0.8;
                }
                .dealer-info {
                    background: #f8f9fa;
                    padding: 15px;
                    border-bottom: 1px solid #e0e0e0;
                }
                .dealer-name {
                    font-size: 20px;
                    font-weight: bold;
                    color: #0a2e3a;
                }
                .dealer-address {
                    font-size: 12px;
                    color: #666;
                    margin-top: 5px;
                }
                .offers-section {
                    padding: 20px;
                }
                .section-title {
                    font-size: 18px;
                    font-weight: bold;
                    color: #0a2e3a;
                    margin-bottom: 15px;
                    border-left: 4px solid #facc15;
                    padding-left: 10px;
                }
                .cta-section {
                    background: #facc15;
                    padding: 15px;
                    text-align: center;
                }
                .cta-section a {
                    display: inline-block;
                    background: #25D366;
                    color: white;
                    text-decoration: none;
                    padding: 12px 30px;
                    border-radius: 50px;
                    font-weight: bold;
                    margin: 5px;
                }
                .cta-section .call-btn {
                    background: #3b82f6;
                }
                .footer {
                    background: #1e293b;
                    color: #94a3b8;
                    text-align: center;
                    padding: 12px;
                    font-size: 10px;
                }
                @media print {
                    body { background: white; padding: 0; }
                    .flyer { box-shadow: none; }
                }
            </style>
        </head>
        <body>
            <div class="flyer">
                <div class="flyer-header">
                    <h1>⚡ AUTO SPARES SOLUTION ⚡</h1>
                    <p>Premium Auto Parts Wholesaler</p>
                </div>
                <div class="dealer-info">
                    <div class="dealer-name">${dealer.name}</div>
                    <div class="dealer-address">${dealer.address || ''} | ${dealer.city || ''} - ${dealer.pincode || ''}</div>
                    <div class="dealer-address">📞 ${dealer.phone || ''} | 📧 ${dealer.email || ''}</div>
                </div>
                <div class="offers-section">
                    <div class="section-title">🎁 Exclusive Offers For You</div>
                    ${offersHtml}
                </div>
                <div class="cta-section">
                    <a href="https://wa.me/${dealer.phone || '919830300193'}?text=I%20want%20to%20place%20order" target="_blank">
                        📱 Order on WhatsApp
                    </a>
                    <a href="tel:${dealer.phone || '9830300193'}" class="call-btn">
                        📞 Call Now
                    </a>
                </div>
                <div class="footer">
                    Auto Spares Solution | contact@autosparessolution.com | 9830300193
                </div>
            </div>
        </body>
        </html>`;
    }

    // Download flyer as PDF (using html2pdf)
    async function downloadFlyerAsPDF(dealer, offers) {
        const flyerHtml = generateFlyerHTML(dealer, offers);
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        document.body.appendChild(iframe);
        
        iframe.contentDocument.open();
        iframe.contentDocument.write(flyerHtml);
        iframe.contentDocument.close();
        
        // Wait for fonts to load
        setTimeout(() => {
            iframe.contentWindow.print();
            setTimeout(() => {
                document.body.removeChild(iframe);
            }, 1000);
        }, 500);
    }

    // Send flyer via WhatsApp
    function sendFlyerWhatsApp(dealer, offers) {
        const flyerHtml = generateFlyerHTML(dealer, offers);
        // Create a text version for WhatsApp
        const dealerOffers = offers.filter(o => o.dealer === dealer.name);
        let message = `*⚡ AUTO SPARES SOLUTION ⚡*\n\n`;
        message += `*Dear ${dealer.name},*\n\n`;
        message += `*Exclusive Offers for You:*\n\n`;
        
        for (const offer of dealerOffers.slice(0, 5)) {
            message += `🔹 *${offer.part}*\n`;
            message += `   Your avg: ${offer.avgQty.toFixed(1)} units/month\n`;
            if (offer.discount > 0) {
                message += `   ✨ ${offer.discount}% OFF\n`;
                message += `   Offer: ₹${offer.offerPrice.toFixed(2)} (was ₹${offer.originalPrice.toFixed(2)})\n`;
            } else {
                message += `   ⚠️ Low stock: ${offer.totalStock} units left\n`;
            }
            message += `   📦 Stock: ${offer.totalStock}\n\n`;
        }
        
        message += `\n📞 Contact: 9830300193\n`;
        message += `🌐 autosparessolution.com\n\n`;
        message += `_Reply YES to place order_`;
        
        const encodedMsg = encodeURIComponent(message);
        window.open(`https://wa.me/${dealer.phone || '919830300193'}?text=${encodedMsg}`, '_blank');
    }

    // Generate bulk flyers for all dealers
    async function generateBulkFlyers() {
        await loadDealerMaster();
        const offers = loadOffers();
        const results = [];
        
        for (const dealer of dealerMaster) {
            const dealerOffers = offers.filter(o => o.dealer === dealer.name);
            if (dealerOffers.length > 0) {
                const flyerHtml = generateFlyerHTML(dealer, offers);
                results.push({
                    dealer: dealer.name,
                    phone: dealer.phone,
                    hasOffers: true,
                    offerCount: dealerOffers.length
                });
            }
        }
        
        console.log(`Generated flyers for ${results.length} dealers`);
        return results;
    }

    // Display flyer preview in a modal
    function showFlyerPreview(dealer, offers) {
        const flyerHtml = generateFlyerHTML(dealer, offers);
        const modal = window.open('', '_blank', 'width=600,height=800');
        modal.document.write(flyerHtml);
        modal.document.close();
    }

    // Export all flyers as ZIP (using JSZip – optional)
    async function exportAllFlyers() {
        await loadDealerMaster();
        const offers = loadOffers();
        const flyers = {};
        
        for (const dealer of dealerMaster) {
            const dealerOffers = offers.filter(o => o.dealer === dealer.name);
            if (dealerOffers.length > 0) {
                flyers[`flyer_${dealer.name.replace(/[^a-z0-9]/gi, '_')}.html`] = generateFlyerHTML(dealer, offers);
            }
        }
        
        // Create download link for combined HTML (or use JSZip)
        let combinedHtml = '<html><head><title>All Flyers</title></head><body>';
        for (const [name, content] of Object.entries(flyers)) {
            combinedHtml += `<h2>${name}</h2>${content}<hr>`;
        }
        combinedHtml += '</body></html>';
        
        const blob = new Blob([combinedHtml], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `all_flyers_${new Date().toISOString().split('T')[0]}.html`;
        a.click();
        URL.revokeObjectURL(url);
        
        console.log(`Exported ${Object.keys(flyers).length} flyers`);
    }

    // Expose functions globally
    window.BrochureGenerator = {
        loadDealerMaster,
        loadOffers,
        generateFlyerHTML,
        downloadFlyerAsPDF,
        sendFlyerWhatsApp,
        generateBulkFlyers,
        showFlyerPreview,
        exportAllFlyers,
        getDealerMaster: () => dealerMaster,
        getCurrentOffers: () => currentOffers
    };
})();
