// brochure-generator.js – FINAL INTELLIGENT VERSION
(function () {

    console.log("✅ Brochure Generator Loaded");

    let dealerMaster = [];
    let currentOffers = [];

    // =========================
    // LOAD EXCEL FILE
    // =========================
    async function loadExcelFile(url, sheetName = null) {

        try {

            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`Failed to load ${url}`);
            }

            const arrayBuffer = await response.arrayBuffer();

            const workbook = XLSX.read(arrayBuffer, {
                type: 'array'
            });

            let sheet;

            if (sheetName && workbook.SheetNames.includes(sheetName)) {

                sheet = workbook.Sheets[sheetName];

            } else {

                sheet = workbook.Sheets[workbook.SheetNames[0]];
            }

            return XLSX.utils.sheet_to_json(sheet);

        } catch (err) {

            console.warn(`❌ Could not load ${url}`, err);

            return [];
        }
    }

    // =========================
    // NORMALIZE DEALER NAME
    // =========================
    function normalizeDealerName(name) {

        return String(name || '')
            .trim()
            .toUpperCase()
            .replace(/\s+/g, ' ');
    }

    // =========================
    // CLEAN PHONE NUMBER
    // =========================
    function cleanPhone(phone) {

        let p = String(phone || '')
            .replace(/\D/g, '');

        if (!p) return '';

        // remove leading zero
        if (p.startsWith('0')) {
            p = p.substring(1);
        }

        // convert 10 digit to whatsapp format
        if (p.length === 10) {
            p = '91' + p;
        }

        return p;
    }

    // =========================
    // LOAD DEALER MASTER
    // =========================
    async function loadDealerMaster() {

        try {

            const rows = await loadExcelFile(
                'data/RETAILER data details.xlsx',
                'SAPUI5 Export'
            );

            dealerMaster = rows.map(row => ({

                name:
                    row['Retailer Name'] ||
                    row['Customer Name'] ||
                    '',

                normalizedName:
                    normalizeDealerName(
                        row['Retailer Name'] ||
                        row['Customer Name'] ||
                        ''
                    ),

                phone:
                    cleanPhone(
                        row['Mobile No'] ||
                        row['Phone'] ||
                        ''
                    ),

                district:
                    row['District'] ||
                    '',

                ownerName:
                    row['Owner Name'] ||
                    '',

                customerType:
                    row['Customer Type'] ||
                    '',

                rlpCode:
                    row['RLP Code'] ||
                    ''

            }));

            console.log(
                `✅ Dealer master loaded: ${dealerMaster.length}`
            );

            return dealerMaster;

        } catch (err) {

            console.error(err);

            dealerMaster = [];

            return [];
        }
    }

    // =========================
    // LOAD OFFERS
    // =========================
    function loadOffers() {

        try {

            const data =
                JSON.parse(
                    localStorage.getItem('dealerOffers') || '{}'
                );

            currentOffers = data.offers || [];

            console.log(
                `✅ Offers loaded: ${currentOffers.length}`
            );

            return currentOffers;

        } catch (err) {

            console.error(err);

            currentOffers = [];

            return [];
        }
    }

    // =========================
    // GET DEALER OFFERS
    // =========================
    function getAllDealerOffers(dealerName) {

        const normalized =
            normalizeDealerName(dealerName);

        return currentOffers.filter(o =>

            normalizeDealerName(o.dealer)
            === normalized

        );
    }

    // =========================
    // FIND DEALER INFO
    // =========================
    function findDealerInfo(dealerName) {

        const normalized =
            normalizeDealerName(dealerName);

        return dealerMaster.find(d =>

            d.normalizedName === normalized

        );
    }

    // =========================
    // GENERATE WHATSAPP MESSAGE
    // =========================
    function generateWhatsAppFlyerMessage(dealerName) {

        const offers =
            getAllDealerOffers(dealerName);

        let message = '';

        message += '⚡ AUTO SPARES SOLUTION ⚡\n\n';

        message += `Dear ${dealerName},\n\n`;

        message += 'Special Offer List\n\n';

        offers
            .sort((a, b) => b.discount - a.discount)
            .forEach((offer, index) => {

                message +=
                    `${index + 1}. ${offer.part}\n`;

                message +=
                    `Offer Price: ₹${offer.offerPrice.toFixed(2)}\n`;

                message +=
                    `Discount: ${offer.discount}%\n`;

                message +=
                    `Available Stock: ${offer.totalStock}\n\n`;
            });

        message +=
            'Reply with required part numbers.\n\n';

        message +=
            'Auto Spares Solution\n';

        message +=
            '9830300193';

        return message;
    }

    // =========================
    // SEND TO WHATSAPP
    // =========================
    function sendFlyerToWhatsApp(dealerName) {

        const dealer =
            findDealerInfo(dealerName);

        if (!dealer) {

            alert(
                `Dealer not found:\n${dealerName}`
            );

            return;
        }

        if (!dealer.phone) {

            alert(
                `Phone missing for:\n${dealerName}`
            );

            return;
        }

        const message =
            generateWhatsAppFlyerMessage(
                dealerName
            );

        const encoded =
            encodeURIComponent(message);

        const url =
            `https://wa.me/${dealer.phone}?text=${encoded}`;

        window.open(url, '_blank');
    }

    // =========================
    // GET DEALERS WITH OFFERS
    // =========================
    async function getDealersWithOffers() {

        await loadDealerMaster();

        loadOffers();

        const result = [];

        const uniqueDealers =
            [...new Set(
                currentOffers.map(o => o.dealer)
            )];

        for (const dealerName of uniqueDealers) {

            const offers =
                getAllDealerOffers(dealerName);

            if (offers.length === 0) {
                continue;
            }

            const dealerInfo =
                findDealerInfo(dealerName);

            result.push({

                name:
                    dealerName,

                phone:
                    dealerInfo?.phone || '',

                district:
                    dealerInfo?.district || '',

                owner:
                    dealerInfo?.ownerName || '',

                offerCount:
                    offers.length,

                maxDiscount:
                    Math.max(
                        ...offers.map(o => o.discount),
                        0
                    )
            });
        }

        console.log(
            `✅ Dealers with offers: ${result.length}`
        );

        return result;
    }

    // =========================
    // SHOW BROCHURE PREVIEW
    // =========================
    function showBrochurePreview(dealerName) {

        const offers =
            getAllDealerOffers(dealerName);

        if (offers.length === 0) {

            alert(
                `No offers found for ${dealerName}`
            );

            return;
        }

        let html = `
        <html>
        <head>

        <title>${dealerName}</title>

        <style>

        body{
            font-family:Arial;
            padding:20px;
        }

        table{
            width:100%;
            border-collapse:collapse;
        }

        th,td{
            border:1px solid #ccc;
            padding:8px;
            text-align:left;
        }

        th{
            background:#f4f4f4;
        }

        h2{
            color:#0f172a;
        }

        </style>

        </head>

        <body>

        <h2>AUTO SPARES SOLUTION</h2>

        <h3>${dealerName}</h3>

        <table>

        <tr>
            <th>Part No</th>
            <th>Offer Price</th>
            <th>Discount</th>
            <th>Stock</th>
        </tr>
        `;

        offers.forEach(o => {

            html += `
            <tr>
                <td>${o.part}</td>
                <td>₹${o.offerPrice.toFixed(2)}</td>
                <td>${o.discount}%</td>
                <td>${o.totalStock}</td>
            </tr>
            `;
        });

        html += `
        </table>

        </body>
        </html>
        `;

        const win =
            window.open('', '_blank');

        win.document.write(html);

        win.document.close();
    }

    // =========================
    // EXPORT GLOBAL
    // =========================
    // Export globally
window.BrochureGenerator = {
    loadDealerMaster,
    loadOffers,
    getAllDealerOffers,
    generateWhatsAppFlyerMessage,
    generateFullBrochureHTML,
    sendFlyerToWhatsApp,
    sendBulkFlyersToWhatsApp,
    getDealersWithOffers,
    showBrochurePreview,
    exportAllBrochures,

    // IMPORTANT FIX
    getDealerMaster: function() {
        return dealerMaster;
    },

    getCurrentOffers: function() {
        return currentOffers;
    }
};

})();
