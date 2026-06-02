// brochure-generator.js
// AUTO SPARES SOLUTION
// FINAL PDF + WHATSAPP VERSION

(function () {

    console.log("✅ Brochure Generator Loaded");

    let dealerMaster = [];
    let currentOffers = [];

    // =========================================
    // LOAD EXCEL FILE
    // =========================================
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

    // =========================================
    // NORMALIZE TEXT
    // =========================================
    function normalizeText(text) {

        return String(text || '')
            .trim()
            .toUpperCase()
            .replace(/\s+/g, ' ');
    }

    // =========================================
    // CLEAN PHONE
    // =========================================
    function cleanPhone(phone) {

        let p = String(phone || '')
            .replace(/\D/g, '');

        if (!p) return '';

        if (p.startsWith('0')) {
            p = p.substring(1);
        }

        // convert 10 digit to whatsapp format
        if (p.length === 10) {
            p = '91' + p;
        }

        return p;
    }

    // =========================================
    // LOAD DEALER MASTER FROM EXCEL
    // =========================================
    async function loadDealerMaster() {

        try {

            const rows = await loadExcelFile(
                'data/RETAILER data details.xlsx',
                'SAPUI5 Export'
            );

            dealerMaster = rows.map(row => {

                const dealerName =
                    row['Retailer Name'] ||
                    row['Customer Name'] ||
                    row['Dealer Name'] ||
                    '';

                return {

                    name: dealerName,

                    normalizedName:
                        normalizeText(dealerName),

                    phone:
                        cleanPhone(
                            row['Mobile No'] ||
                            row['Phone'] ||
                            ''
                        ),

                    email:
                        row['Email'] || '',

                    address:
                        row['Address'] || '',

                    district:
                        row['District'] || '',

                    ownerName:
                        row['Owner Name'] || ''
                };
            });

            // remove duplicates
            const map = new Map();

            dealerMaster.forEach(d => {

                if (
                    d.name &&
                    !map.has(d.normalizedName)
                ) {
                    map.set(d.normalizedName, d);
                }
            });

            dealerMaster = Array.from(map.values());

            console.log(
                "✅ Dealer master loaded:",
                dealerMaster.length
            );

            return dealerMaster;

        } catch (err) {

            console.error(err);

            dealerMaster = [];

            return [];
        }
    }

    // =========================================
    // LOAD OFFERS
    // =========================================
    function loadOffers() {

        try {

            const data = JSON.parse(
                localStorage.getItem('dealerOffers') || '{}'
            );

            currentOffers = data.offers || [];

            console.log(
                "✅ Offers loaded:",
                currentOffers.length
            );

            return currentOffers;

        } catch (err) {

            console.error(err);

            currentOffers = [];

            return [];
        }
    }

    // =========================================
    // FIND DEALER
    // =========================================
    function findDealerInfo(dealerName) {

        const normalized =
            normalizeText(dealerName);

        return dealerMaster.find(d =>

            d.normalizedName === normalized
        );
    }

    // =========================================
    // GET DEALER OFFERS
    // =========================================
    function getAllDealerOffers(dealerName) {

        const normalizedDealer =
            normalizeText(dealerName);

        return currentOffers.filter(o => {

            const offerDealer =
                normalizeText(
                    o.dealer ||
                    o.customer ||
                    o.customerName ||
                    ''
                );

            return offerDealer === normalizedDealer;
        });
    }

    // =========================================
    // GENERATE WHATSAPP MESSAGE
    // =========================================
    function generateWhatsAppFlyerMessage(dealerName) {

        const offers =
            getAllDealerOffers(dealerName);

        let msg = '';

        msg += '⚡ AUTO SPARES SOLUTION ⚡\n\n';

        msg += `Dealer: ${dealerName}\n\n`;

        msg += 'SPECIAL OFFER LIST\n';
        msg += '━━━━━━━━━━━━━━━━━━\n\n';

        offers.forEach((o, i) => {

            msg += `${i + 1}. ${o.part}\n`;

            msg += `Offer Price: Rs.${Number(
                o.offerPrice || 0
            ).toFixed(2)}\n`;

            msg += `Discount: ${o.discount || 0}%\n`;

            msg += `Stock: ${o.totalStock || 0}\n\n`;
        });

        msg += '━━━━━━━━━━━━━━━━━━\n';
        msg += 'AUTO SPARES SOLUTION\n';
        msg += '9830300193';

        return msg;
    }

    // =========================================
    // SEND SINGLE WHATSAPP
    // =========================================
    function sendFlyerWhatsApp(dealerName) {

        const dealer =
            findDealerInfo(dealerName);

        if (!dealer) {

            alert(
                'Dealer not found:\n' + dealerName
            );

            return;
        }

        if (!dealer.phone) {

            alert(
                'Phone not found:\n' + dealerName
            );

            return;
        }

        const offers =
            getAllDealerOffers(dealerName);

        if (offers.length === 0) {

            alert(
                'No offers found:\n' + dealerName
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

    // =========================================
    // GET DEALERS WITH OFFERS
    // =========================================
    async function getDealersWithOffers() {

        await loadDealerMaster();

        loadOffers();

        const result = [];

        const processed = new Set();

        for (const offer of currentOffers) {

            const dealerName =
                offer.dealer ||
                offer.customer ||
                offer.customerName ||
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

                    district:
                        dealer?.district || '',

                    offerCount:
                        offers.length
                });
            }
        }

        console.log(
            "✅ Dealers with offers:",
            result.length
        );

        return result;
    }

    // =========================================
    // PREVIEW FLYER
    // =========================================
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
        <html>
        <head>
        <title>${dealerName}</title>

        <style>

        body{
            font-family:Arial;
            padding:20px;
            background:#f5f5f5;
        }

        .box{
            background:#fff;
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
            padding:8px;
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

        <p>Phone: ${dealer?.phone || ''}</p>

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

        </div>

        </body>
        </html>
        `;

        const win =
            window.open('', '_blank');

        win.document.write(html);

        win.document.close();
    }

    // =========================================
    // EXPORT ALL HTML FLYERS
    // =========================================
    async function exportAllFlyers() {

        const dealers =
            await getDealersWithOffers();

        if (dealers.length === 0) {

            alert(
                'No dealers with offers'
            );

            return;
        }

        let html = `
        <html>
        <head>
        <title>All Flyers</title>

        <style>

        body{
            font-family:Arial;
        }

        .page{
            page-break-after:always;
            margin-bottom:40px;
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
            background:#facc15;
        }

        </style>

        </head>

        <body>
        `;

        for (const d of dealers) {

            const offers =
                getAllDealerOffers(d.name);

            html += `
            <div class="page">

            <h2>AUTO SPARES SOLUTION</h2>

            <h3>${d.name}</h3>

            <p>${d.phone}</p>

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

            </div>
            `;
        }

        html += `
        </body>
        </html>
        `;

        const blob = new Blob(
            [html],
            { type: 'text/html' }
        );

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

    // =========================================
    // EXPORT PDF
    // =========================================
    async function exportAllFlyersPDF() {

        const dealers =
            await getDealersWithOffers();

        if (dealers.length === 0) {

            alert('No dealers found');

            return;
        }

        let printWindow =
            window.open('', '_blank');

        let html = `
        <html>
        <head>

        <title>PDF Flyers</title>

        <style>

        body{
            font-family:Arial;
            padding:20px;
        }

        .page{
            page-break-after:always;
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
            background:#facc15;
        }

        </style>

        </head>

        <body>
        `;

        for (const d of dealers) {

            const offers =
                getAllDealerOffers(d.name);

            html += `
            <div class="page">

            <h2>AUTO SPARES SOLUTION</h2>

            <h3>${d.name}</h3>

            <p>${d.phone}</p>

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

            </div>
            `;
        }

        html += `
        </body>
        </html>
        `;

        printWindow.document.write(html);

        printWindow.document.close();

        printWindow.focus();

        setTimeout(() => {

            printWindow.print();

        }, 1000);
    }

    // =========================================
    // BULK WHATSAPP
    // =========================================
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
                setTimeout(r, 1200)
            );
        }

        alert(
            `Opened WhatsApp for ${count} dealers`
        );
    }

    // =========================================
    // EXPORT GLOBAL
    // =========================================
    window.BrochureGenerator = {

    // LOADERS
    loadDealerMaster,
    loadOffers,

    // DATA
    getAllDealerOffers,
    getDealersWithOffers,
    findDealerInfo,

    // WHATSAPP
    generateWhatsAppFlyerMessage,

    // OLD NAME SUPPORT
    sendFlyerToWhatsApp: sendFlyerWhatsApp,
    sendFlyerWhatsApp,

    // PREVIEW SUPPORT
    showBrochurePreview: showFlyerPreview,
    showFlyerPreview,

    // EXPORT SUPPORT
    exportAllBrochures: exportAllFlyers,
    exportAllFlyers,

    // HTML GENERATOR
    generateFullBrochureHTML: function(dealerName){

        const offers =
            getAllDealerOffers(dealerName);

        const dealer =
            findDealerInfo(dealerName);

        let html = `
        <div style="
            font-family:Arial;
            padding:20px;
            background:white;
            color:black;
            width:800px;
        ">

        <h1 style="color:#0f172a;">
            AUTO SPARES SOLUTION
        </h1>

        <h2>
            ${dealerName}
        </h2>

        <p>
            Phone:
            ${dealer?.phone || ''}
        </p>

        <table style="
            width:100%;
            border-collapse:collapse;
        ">

        <tr>
            <th style="border:1px solid #ccc;padding:8px;">
                Part No
            </th>

            <th style="border:1px solid #ccc;padding:8px;">
                Offer Price
            </th>

            <th style="border:1px solid #ccc;padding:8px;">
                Discount
            </th>

            <th style="border:1px solid #ccc;padding:8px;">
                Stock
            </th>
        </tr>
        `;

        offers.forEach(o => {

            html += `
            <tr>

                <td style="border:1px solid #ccc;padding:8px;">
                    ${o.part || ''}
                </td>

                <td style="border:1px solid #ccc;padding:8px;">
                    ₹${Number(o.offerPrice || 0).toFixed(2)}
                </td>

                <td style="border:1px solid #ccc;padding:8px;">
                    ${o.discount || 0}%
                </td>

                <td style="border:1px solid #ccc;padding:8px;">
                    ${o.totalStock || 0}
                </td>

            </tr>
            `;
        });

        html += `
        </table>

        </div>
        `;

        return html;
    },

    // MEMORY
    getDealerMaster: () => dealerMaster,
    getCurrentOffers: () => currentOffers
};

})();
