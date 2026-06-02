// js/brochure-generator.js
// FINAL STABLE VERSION

(function () {

    console.log("✅ Brochure Generator Loaded");

    let dealerMaster = [];
    let currentOffers = [];

    // =========================
    // NORMALIZE TEXT
    // =========================
    function normalizeText(txt) {

        return String(txt || '')
            .trim()
            .toUpperCase()
            .replace(/\s+/g, ' ')
            .replace(/[^A-Z0-9 ]/g, '');
    }

    // =========================
    // CLEAN PHONE
    // =========================
    function cleanPhone(phone) {

        let p = String(phone || '')
            .replace(/\D/g, '');

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
                throw new Error(url);
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

            console.error("Excel load error:", err);

            return [];
        }
    }

    // =========================
    // LOAD DEALER MASTER
    // =========================
    async function loadDealerMaster() {

        const rows = await loadExcelFile(
            'data/RETAILER data details.xlsx',
            'SAPUI5 Export'
        );

        dealerMaster = rows.map(r => ({

            name:
                r['Retailer Name'] ||
                r['Customer Name'] ||
                '',

            normalizedName:
                normalizeText(
                    r['Retailer Name'] ||
                    r['Customer Name'] ||
                    ''
                ),

            phone:
                cleanPhone(
                    r['Mobile No'] ||
                    ''
                ),

            district:
                r['District'] || '',

            owner:
                r['Owner Name'] || '',

            customerType:
                r['Customer Type'] || '',

            rlpCode:
                r['RLP Code'] || ''

        }));

        console.log(
            `✅ Dealer master loaded: ${dealerMaster.length}`
        );

        return dealerMaster;
    }

    // =========================
    // LOAD OFFERS
    // =========================
    function loadOffers() {

        try {

            const stored =
                JSON.parse(
                    localStorage.getItem('dealerOffers') || '{}'
                );

            currentOffers = stored.offers || [];

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
    // FIND DEALER
    // =========================
    function findDealer(dealerName) {

        const normalized =
            normalizeText(dealerName);

        return dealerMaster.find(d => {

            return (
                d.normalizedName === normalized ||
                normalized.includes(d.normalizedName) ||
                d.normalizedName.includes(normalized)
            );
        });
    }

    // =========================
    // GET DEALER OFFERS
    // =========================
    function getDealerOffers(dealerName) {

        const normalized =
            normalizeText(dealerName);

        return currentOffers.filter(o => {

            const offerDealer =
                normalizeText(o.dealer);

            return (
                offerDealer === normalized ||
                offerDealer.includes(normalized) ||
                normalized.includes(offerDealer)
            );
        });
    }

    // =========================
    // GENERATE MESSAGE
    // =========================
    function generateWhatsAppFlyerMessage(dealerName) {

        const offers =
            getDealerOffers(dealerName);

        let msg = '';

        msg += '⚡ AUTO SPARES SOLUTION ⚡\n\n';

        msg += `Dear ${dealerName},\n\n`;

        msg += 'Special Offer List\n\n';

        offers.forEach((o, i) => {

            msg += `${i + 1}. ${o.part}\n`;

            msg += `Offer Price: Rs.${Number(o.offerPrice || 0).toFixed(2)}\n`;

            msg += `Discount: ${o.discount || 0}%\n`;

            msg += `Stock: ${o.totalStock || 0}\n\n`;
        });

        msg += 'Reply with required part numbers.\n\n';

        msg += 'Auto Spares Solution\n9830300193';

        return msg;
    }

    // =========================
    // SEND WHATSAPP
    // =========================
    function sendFlyerWhatsApp(dealerName) {

        const dealer =
            findDealer(dealerName);

        if (!dealer) {

            alert(
                'Dealer not found:\n' +
                dealerName
            );

            return;
        }

        if (!dealer.phone) {

            alert(
                'Phone missing for:\n' +
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

    // =========================
    // PREVIEW
    // =========================
    function showFlyerPreview(dealerName) {

        const offers =
            getDealerOffers(dealerName);

        const dealer =
            findDealer(dealerName);

        let html = `
        <html>
        <head>
        <meta charset="UTF-8">

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
        }

        th{
            background:#f4f4f4;
        }

        h1{
            color:#0f172a;
        }

        </style>

        </head>

        <body>

        <h1>AUTO SPARES SOLUTION</h1>

        <h2>${dealerName}</h2>

        <p>
        Phone:
        ${dealer?.phone || ''}
        </p>

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
                <td>Rs.${Number(o.offerPrice || 0).toFixed(2)}</td>
                <td>${o.discount || 0}%</td>
                <td>${o.totalStock || 0}</td>
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

        const uniqueDealers =
            [...new Set(
                currentOffers.map(o => o.dealer)
            )];

        let html = `
        <html>
        <head>
        <meta charset="UTF-8">
        <title>All Flyers</title>
        </head>
        <body>
        `;

        uniqueDealers.forEach(name => {

            const offers =
                getDealerOffers(name);

            if (offers.length === 0) return;

            html += `
            <div style="page-break-after:always;padding:20px;">
            `;

            html += `
            <h1>AUTO SPARES SOLUTION</h1>
            `;

            html += `
            <h2>${name}</h2>
            `;

            html += `
            <table border="1" cellpadding="5" cellspacing="0" width="100%">
            `;

            html += `
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
                    <td>Rs.${Number(o.offerPrice || 0).toFixed(2)}</td>
                    <td>${o.discount || 0}%</td>
                    <td>${o.totalStock || 0}</td>
                </tr>
                `;
            });

            html += `
            </table>
            </div>
            `;
        });

        html += `
        </body>
        </html>
        `;

        const blob =
            new Blob(
                [html],
                {
                    type: 'text/html;charset=utf-8'
                }
            );

        const url =
            URL.createObjectURL(blob);

        const a =
            document.createElement('a');

        a.href = url;

        a.download =
            'dealer_flyers.html';

        document.body.appendChild(a);

        a.click();

        document.body.removeChild(a);

        URL.revokeObjectURL(url);

        alert('✅ Flyers exported');
    }

    // =========================
    // GET DEALERS WITH OFFERS
    // =========================
    async function getDealersWithOffers() {

        await loadDealerMaster();

        loadOffers();

        const uniqueDealers =
            [...new Set(
                currentOffers.map(o => o.dealer)
            )];

        const result = [];

        uniqueDealers.forEach(name => {

            const offers =
                getDealerOffers(name);

            if (offers.length === 0) return;

            const dealer =
                findDealer(name);

            result.push({

                name: name,

                phone:
                    dealer?.phone || '',

                district:
                    dealer?.district || '',

                offerCount:
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

        getDealerOffers,

        generateWhatsAppFlyerMessage,

        sendFlyerWhatsApp,

        showFlyerPreview,

        exportAllFlyers,

        getDealersWithOffers,

        getDealerMaster() {
            return dealerMaster;
        },

        getCurrentOffers() {
            return currentOffers;
        }
    };

})();
