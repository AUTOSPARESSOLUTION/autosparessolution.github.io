// brochure-generator.js – FINAL WORKING VERSION
(function () {

    console.log("✅ BrochureGenerator Loaded");

    let dealerMaster = [];
    let currentOffers = [];

    // =========================
    // NORMALIZE NAME
    // =========================
    function normalizeName(name) {

        return String(name || '')
            .trim()
            .toUpperCase()
            .replace(/\s+/g, ' ');
    }

    // =========================
    // CLEAN PHONE
    // =========================
    function cleanPhone(phone) {

        let p = String(phone || '')
            .replace(/\D/g, '');

        if (!p) return '';

        if (p.startsWith('0')) {
            p = p.substring(1);
        }

        if (p.length === 10) {
            p = '91' + p;
        }

        return p;
    }

    // =========================
    // LOAD EXCEL
    // =========================
    async function loadExcelFile(url, sheetName = null) {

        try {

            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`Cannot load ${url}`);
            }

            const arrayBuffer =
                await response.arrayBuffer();

            const workbook =
                XLSX.read(arrayBuffer, {
                    type: 'array'
                });

            let sheet;

            if (
                sheetName &&
                workbook.SheetNames.includes(sheetName)
            ) {

                sheet =
                    workbook.Sheets[sheetName];

            } else {

                sheet =
                    workbook.Sheets[
                        workbook.SheetNames[0]
                    ];
            }

            return XLSX.utils.sheet_to_json(sheet);

        } catch (err) {

            console.error(err);

            return [];
        }
    }

    // =========================
    // LOAD DEALERS
    // =========================
    async function loadDealerMaster() {

        const rows =
            await loadExcelFile(
                'data/RETAILER data details.xlsx',
                'SAPUI5 Export'
            );

        dealerMaster = rows.map(row => ({

            name:
                row['Retailer Name'] ||
                row['Customer Name'] ||
                '',

            normalized:
                normalizeName(
                    row['Retailer Name'] ||
                    row['Customer Name'] ||
                    ''
                ),

            phone:
                cleanPhone(
                    row['Mobile No'] ||
                    ''
                ),

            district:
                row['District'] || '',

            owner:
                row['Owner Name'] || '',

            customerType:
                row['Customer Type'] || ''

        }));

        console.log(
            "✅ Dealer Master:",
            dealerMaster.length
        );

        return dealerMaster;
    }

    // =========================
    // LOAD OFFERS
    // =========================
    function loadOffers() {

        try {

            const saved =
                JSON.parse(
                    localStorage.getItem(
                        'dealerOffers'
                    ) || '{}'
                );

            currentOffers =
                saved.offers || [];

        } catch (err) {

            console.error(err);

            currentOffers = [];
        }

        console.log(
            "✅ Offers Loaded:",
            currentOffers.length
        );

        return currentOffers;
    }

    // =========================
    // GET DEALER OFFERS
    // =========================
    function getDealerOffers(dealerName) {

        const normalized =
            normalizeName(dealerName);

        return currentOffers.filter(o =>

            normalizeName(o.dealer)
            === normalized

        );
    }

    // =========================
    // FIND DEALER
    // =========================
    function findDealer(dealerName) {

        const normalized =
            normalizeName(dealerName);

        return dealerMaster.find(d =>

            d.normalized === normalized

        );
    }

    // =========================
    // WHATSAPP MESSAGE
    // =========================
    function generateWhatsAppMessage(dealerName) {

        const offers =
            getDealerOffers(dealerName);

        let msg = '';

        msg += '⚡ AUTO SPARES SOLUTION ⚡\n\n';

        msg += `Dear ${dealerName},\n\n`;

        msg += 'Special Offer List\n\n';

        offers.forEach((o, i) => {

            msg += `${i + 1}. ${o.part}\n`;

            msg += `Offer Price: ₹${o.offerPrice.toFixed(2)}\n`;

            msg += `Discount: ${o.discount}%\n`;

            msg += `Stock: ${o.totalStock}\n\n`;

        });

        msg += 'Reply with required part numbers.\n\n';

        msg += '9830300193';

        return msg;
    }

    // =========================
    // SEND WHATSAPP
    // =========================
    function sendFlyerWhatsApp(dealer, offers) {

        const dealerInfo =
            typeof dealer === 'string'
                ? findDealer(dealer)
                : dealer;

        if (!dealerInfo) {

            alert('Dealer not found');

            return;
        }

        if (!dealerInfo.phone) {

            alert(
                'Phone missing for dealer'
            );

            return;
        }

        const msg =
            generateWhatsAppMessage(
                dealerInfo.name
            );

        const url =
            `https://wa.me/${dealerInfo.phone}?text=${encodeURIComponent(msg)}`;

        window.open(url, '_blank');
    }

    // =========================
    // PREVIEW
    // =========================
    function showFlyerPreview(dealer) {

        const dealerInfo =
            typeof dealer === 'string'
                ? findDealer(dealer)
                : dealer;

        if (!dealerInfo) {

            alert('Dealer not found');

            return;
        }

        const offers =
            getDealerOffers(
                dealerInfo.name
            );

        let html = `
        <html>
        <head>
        <title>${dealerInfo.name}</title>

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
        }

        th{
            background:#f4f4f4;
        }

        </style>

        </head>

        <body>

        <h2>AUTO SPARES SOLUTION</h2>

        <h3>${dealerInfo.name}</h3>

        <p>
        District:
        ${dealerInfo.district}
        </p>

        <table>

        <tr>
            <th>Part</th>
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
    // EXPORT ALL
    // =========================
    async function exportAllFlyers() {

        await loadDealerMaster();

        loadOffers();

        let html = `
        <html>
        <body>
        `;

        for (const dealer of dealerMaster) {

            const offers =
                getDealerOffers(
                    dealer.name
                );

            if (offers.length === 0) {
                continue;
            }

            html += `
            <div style="page-break-after:always;">
            `;

            html += `
            <h2>${dealer.name}</h2>
            `;

            html += `
            <table border="1" cellpadding="5" cellspacing="0" width="100%">
            `;

            html += `
            <tr>
                <th>Part</th>
                <th>Price</th>
                <th>Discount</th>
                <th>Stock</th>
            </tr>
            `;

            offers.forEach(o => {

                html += `
                <tr>
                    <td>${o.part}</td>
                    <td>${o.offerPrice}</td>
                    <td>${o.discount}%</td>
                    <td>${o.totalStock}</td>
                </tr>
                `;
            });

            html += `
            </table>
            </div>
            `;
        }

        html += `
        </body>
        </html>
        `;

        const blob =
            new Blob(
                [html],
                { type: 'text/html' }
            );

        const url =
            URL.createObjectURL(blob);

        const a =
            document.createElement('a');

        a.href = url;

        a.download =
            'all_brochures.html';

        a.click();

        URL.revokeObjectURL(url);
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
                currentOffers.map(
                    o => o.dealer
                )
            )];

        uniqueDealers.forEach(name => {

            const offers =
                getDealerOffers(name);

            if (offers.length === 0) {
                return;
            }

            const d =
                findDealer(name);

            result.push({

                name,

                phone:
                    d?.phone || '',

                district:
                    d?.district || '',

                offers:
                    offers.length
            });

        });

        return result;
    }

    // =========================
    // GLOBAL EXPORT
    // =========================
    window.BrochureGenerator = {

        loadDealerMaster,

        loadOffers,

        getDealerMaster: () =>
            dealerMaster,

        getCurrentOffers: () =>
            currentOffers,

        getDealersWithOffers,

        showFlyerPreview,

        exportAllFlyers,

        sendFlyerWhatsApp
    };

})();
