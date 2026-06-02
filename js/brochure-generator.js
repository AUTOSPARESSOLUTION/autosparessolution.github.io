// brochure-generator.js
// FINAL INTELLIGENT VERSION WITH:
// ✅ Excel Retailer Name matching
// ✅ LocalStorage Customer Name matching
// ✅ 10 digit mobile auto convert to WhatsApp
// ✅ PDF brochure download
// ✅ WhatsApp direct send
// ✅ Unicode ₹ fix
// ✅ Undefined fix
// ✅ Case insensitive matching

(function () {

    console.log("✅ Brochure Generator Loaded");

    let dealerMaster = [];
    let currentOffers = [];

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

        let p = String(phone || '')
            .replace(/\D/g, '');

        if (!p) return '';

        // remove leading 0
        if (p.startsWith('0')) {
            p = p.substring(1);
        }

        // convert 10 digit to India format
        if (p.length === 10) {
            p = '91' + p;
        }

        return p;
    }

    // =====================================================
    // LOAD EXCEL
    // =====================================================

    async function loadExcelFile(url, sheetName = null) {

        try {

            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`Cannot load ${url}`);
            }

            const buffer = await response.arrayBuffer();

            const workbook = XLSX.read(buffer, {
                type: 'array'
            });

            let sheet;

            if (
                sheetName &&
                workbook.SheetNames.includes(sheetName)
            ) {

                sheet = workbook.Sheets[sheetName];

            } else {

                sheet = workbook.Sheets[
                    workbook.SheetNames[0]
                ];
            }

            return XLSX.utils.sheet_to_json(sheet);

        } catch (err) {

            console.error(err);

            return [];
        }
    }

    // =====================================================
    // LOAD DEALER MASTER
    // =====================================================

    async function loadDealerMaster() {

        try {

            dealerMaster = [];

            // ---------------------------------------------
            // 1. LOAD FROM LOCALSTORAGE
            // ---------------------------------------------

            const users =
                JSON.parse(
                    localStorage.getItem('users') || '[]'
                );

            const dealers =
                JSON.parse(
                    localStorage.getItem('dealers') || '[]'
                );

            const customers =
                JSON.parse(
                    localStorage.getItem('customers') || '[]'
                );

            const allLocal = [
                ...users,
                ...dealers,
                ...customers
            ];

            for (const c of allLocal) {

                const dealerName =
                    c.customerName ||
                    c.name ||
                    c.business ||
                    c.dealer ||
                    '';

                if (!dealerName) continue;

                dealerMaster.push({

                    name: dealerName,

                    normalizedName:
                        normalizeText(dealerName),

                    phone:
                        cleanPhone(
                            c.phone ||
                            c.mobile ||
                            c.mobileNo ||
                            c.mob ||
                            c['Mobile No'] ||
                            ''
                        ),

                    email:
                        c.email || '',

                    address:
                        c.address || '',

                    city:
                        c.city ||
                        c.district ||
                        '',

                    ownerName:
                        c.ownerName || ''
                });
            }

            // ---------------------------------------------
            // 2. LOAD FROM EXCEL
            // ---------------------------------------------

            const excelRows =
                await loadExcelFile(
                    'data/RETAILER data details.xlsx',
                    'SAPUI5 Export'
                );

            for (const row of excelRows) {

                const dealerName =
                    row['Retailer Name'] ||
                    row['Customer Name'] ||
                    row['Dealer Name'] ||
                    '';

                if (!dealerName) continue;

                dealerMaster.push({

                    name: dealerName,

                    normalizedName:
                        normalizeText(dealerName),

                    phone:
                        cleanPhone(
                            row['Mobile No'] ||
                            row['Phone'] ||
                            row['Mobile'] ||
                            ''
                        ),

                    email:
                        row['Email'] || '',

                    address:
                        row['Address'] || '',

                    city:
                        row['District'] ||
                        row['City'] ||
                        '',

                    ownerName:
                        row['Owner Name'] || ''
                });
            }

            // ---------------------------------------------
            // REMOVE DUPLICATES
            // ---------------------------------------------

            const uniqueMap = new Map();

            for (const d of dealerMaster) {

                if (
                    d.name &&
                    !uniqueMap.has(d.normalizedName)
                ) {

                    uniqueMap.set(
                        d.normalizedName,
                        d
                    );
                }
            }

            dealerMaster =
                Array.from(uniqueMap.values());

            console.log(
                "✅ Dealer Master Loaded:",
                dealerMaster.length
            );

            return dealerMaster;

        } catch (err) {

            console.error(err);

            dealerMaster = [];

            return [];
        }
    }

    // =====================================================
    // LOAD OFFERS
    // =====================================================

    function loadOffers() {

        try {

            const data =
                JSON.parse(
                    localStorage.getItem('dealerOffers') || '{}'
                );

            currentOffers =
                data.offers || [];

            console.log(
                "✅ Offers Loaded:",
                currentOffers.length
            );

            return currentOffers;

        } catch (err) {

            console.error(err);

            currentOffers = [];

            return [];
        }
    }

    // =====================================================
    // GET OFFERS
    // =====================================================

    function getAllDealerOffers(dealerName) {

        const normalized =
            normalizeText(dealerName);

        return currentOffers.filter(o => {

            const offerDealer =
                normalizeText(
                    o.dealer ||
                    o.customer ||
                    o.customerName ||
                    ''
                );

            return offerDealer === normalized;
        });
    }

    // =====================================================
    // FIND DEALER
    // =====================================================

    function findDealerInfo(dealerName) {

        const normalized =
            normalizeText(dealerName);

        return dealerMaster.find(d =>
            d.normalizedName === normalized
        );
    }

    // =====================================================
    // WHATSAPP MESSAGE
    // =====================================================

    function generateWhatsAppFlyerMessage(dealerName) {

        const offers =
            getAllDealerOffers(dealerName);

        let msg = '';

        msg += '⚡ AUTO SPARES SOLUTION ⚡\n\n';

        msg += `Dealer: ${dealerName}\n\n`;

        msg += `Offer List (${offers.length} Items)\n`;

        msg += '━━━━━━━━━━━━━━━━━━\n\n';

        offers.forEach((o, idx) => {

            msg += `${idx + 1}. ${o.part || ''}\n`;

            msg += `Price: Rs.${Number(
                o.offerPrice || 0
            ).toFixed(2)}\n`;

            msg += `Discount: ${o.discount || 0}%\n`;

            msg += `Stock: ${o.totalStock || 0}\n\n`;
        });

        msg += '━━━━━━━━━━━━━━━━━━\n';

        msg += 'Contact: 9830300193\n';

        msg += 'Auto Spares Solution';

        return msg;
    }

    // =====================================================
    // SEND SINGLE WHATSAPP
    // =====================================================

    function sendFlyerWhatsApp(dealerName) {

        const dealer =
            findDealerInfo(dealerName);

        if (!dealer) {

            alert(
                'Dealer not found:\n' +
                dealerName
            );

            return;
        }

        if (!dealer.phone) {

            alert(
                'Phone not found:\n' +
                dealerName
            );

            return;
        }

        const offers =
            getAllDealerOffers(dealerName);

        if (offers.length === 0) {

            alert(
                'No offers found:\n' +
                dealerName
            );

            return;
        }

        const msg =
            generateWhatsAppFlyerMessage(
                dealerName
            );

        const url =
            `https://wa.me/${dealer.phone}?text=${encodeURIComponent(msg)}`;

        window.open(url, '_blank');
    }

    // =====================================================
    // GET DEALERS WITH OFFERS
    // =====================================================

    async function getDealersWithOffers() {

        await loadDealerMaster();

        loadOffers();

        const result = [];

        const processed = new Set();

        for (const o of currentOffers) {

            const dealerName =
                o.dealer ||
                o.customer ||
                o.customerName ||
                '';

            if (!dealerName) continue;

            const normalized =
                normalizeText(dealerName);

            if (processed.has(normalized)) {
                continue;
            }

            processed.add(normalized);

            const dealer =
                findDealerInfo(dealerName);

            const offers =
                getAllDealerOffers(dealerName);

            if (offers.length > 0) {

                result.push({

                    name: dealerName,

                    phone:
                        dealer?.phone || '',

                    offerCount:
                        offers.length,

                    maxDiscount:
                        Math.max(
                            ...offers.map(x =>
                                Number(
                                    x.discount || 0
                                )
                            ),
                            0
                        )
                });
            }
        }

        console.log(
            '✅ Dealers With Offers:',
            result.length
        );

        return result;
    }

    // =====================================================
    // SHOW PREVIEW
    // =====================================================

    function showFlyerPreview(dealerName) {

        const offers =
            getAllDealerOffers(dealerName);

        const dealer =
            findDealerInfo(dealerName);

        if (offers.length === 0) {

            alert(
                'No offers found'
            );

            return;
        }

        let html = `
        <!DOCTYPE html>
        <html>
        <head>
        <meta charset="UTF-8">
        <title>${dealerName}</title>

        <style>

        body{
            font-family:Arial;
            padding:20px;
            background:#f5f5f5;
        }

        .box{
            background:white;
            padding:20px;
            border-radius:10px;
        }

        table{
            width:100%;
            border-collapse:collapse;
            margin-top:15px;
        }

        th,td{
            border:1px solid #ccc;
            padding:10px;
        }

        th{
            background:#facc15;
        }

        </style>

        </head>

        <body>

        <div class="box">

        <h2>⚡ AUTO SPARES SOLUTION ⚡</h2>

        <h3>${dealerName}</h3>

        <p>
        Phone:
        ${dealer?.phone || ''}
        </p>

        <table>

        <tr>
            <th>#</th>
            <th>Part No</th>
            <th>Price</th>
            <th>Discount</th>
            <th>Stock</th>
        </tr>
        `;

        offers.forEach((o, idx) => {

            html += `
            <tr>
                <td>${idx + 1}</td>
                <td>${o.part || ''}</td>
                <td>Rs.${Number(
                    o.offerPrice || 0
                ).toFixed(2)}</td>
                <td>${o.discount || 0}%</td>
                <td>${o.totalStock || 0}</td>
            </tr>
            `;
        });

        html += `
        </table>

        <br>

        <button onclick="window.print()">
        Print / Save PDF
        </button>

        </div>

        </body>
        </html>
        `;

        const win =
            window.open('', '_blank');

        win.document.write(html);

        win.document.close();
    }

    // =====================================================
    // EXPORT ALL HTML
    // =====================================================

    async function exportAllFlyers() {

        const dealers =
            await getDealersWithOffers();

        if (dealers.length === 0) {

            alert(
                'No dealers found'
            );

            return;
        }

        let html = '';

        for (const d of dealers) {

            html += `
            <h2>${d.name}</h2>
            `;
        }

        const blob =
            new Blob([html], {
                type: 'text/html'
            });

        const url =
            URL.createObjectURL(blob);

        const a =
            document.createElement('a');

        a.href = url;

        a.download =
            'all_flyers.html';

        a.click();

        URL.revokeObjectURL(url);
    }

    // =====================================================
    // BULK WHATSAPP
    // =====================================================

    async function sendBulkWhatsAppFlyers() {

        const dealers =
            await getDealersWithOffers();

        if (dealers.length === 0) {

            alert(
                'No dealers with offers'
            );

            return;
        }

        let count = 0;

        for (const d of dealers) {

            if (!d.phone) continue;

            const msg =
                generateWhatsAppFlyerMessage(
                    d.name
                );

            const url =
                `https://wa.me/${d.phone}?text=${encodeURIComponent(msg)}`;

            window.open(url, '_blank');

            count++;

            await new Promise(r =>
                setTimeout(r, 1500)
            );
        }

        alert(
            `Opened WhatsApp for ${count} dealers`
        );
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

        getDealerMaster: () =>
            dealerMaster,

        getCurrentOffers: () =>
            currentOffers
    };

})();
