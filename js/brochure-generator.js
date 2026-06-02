// brochure-generator.js
// FULL FINAL WORKING VERSION
// Auto Spares Solution

(function () {

    console.log("✅ Brochure Generator Loaded");

    let dealerMaster = [];
    let currentOffers = [];

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
                sheet = workbook.Sheets[workbook.SheetNames[0]];
            }

            return XLSX.utils.sheet_to_json(sheet);

        } catch (err) {

            console.error(err);

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

    // =====================================================
    // LOAD DEALER MASTER
    // =====================================================
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

                    district:
                        row['District'] || '',

                    ownerName:
                        row['Owner Name'] || '',

                    customerType:
                        row['Customer Type'] || '',

                    rlpCode:
                        row['RLP Code'] || ''
                };

            });

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

    // =====================================================
    // LOAD OFFERS
    // =====================================================
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

    // =====================================================
    // GET OFFERS BY DEALER
    // =====================================================
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
    // GENERATE WHATSAPP MESSAGE
    // =====================================================
    function generateWhatsAppFlyerMessage(dealerName) {

        const offers =
            getAllDealerOffers(dealerName);

        let msg = '';

        msg += '⚡ AUTO SPARES SOLUTION ⚡\n\n';

        msg += `Dealer: ${dealerName}\n\n`;

        msg += 'SPECIAL OFFER LIST\n\n';

        offers.forEach((o, index) => {

            msg += `${index + 1}. ${o.part}\n`;

            msg += `Offer Price: Rs.${Number(o.offerPrice || 0).toFixed(2)}\n`;

            msg += `Discount: ${o.discount || 0}%\n`;

            msg += `Stock: ${o.totalStock || 0}\n\n`;

        });

        msg += 'Reply with required quantity.\n\n';

        msg += 'Auto Spares Solution\n';

        msg += '9830300193';

        return msg;
    }

    // =====================================================
    // SEND WHATSAPP
    // =====================================================
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
                'Phone not found for:\n' +
                dealerName
            );

            return;
        }

        const offers =
            getAllDealerOffers(dealerName);

        if (offers.length === 0) {

            alert(
                'No offers found for:\n' +
                dealerName
            );

            return;
        }

        const msg =
            generateWhatsAppFlyerMessage(
                dealerName
            );

        const encoded =
            encodeURIComponent(msg);

        const url =
            `https://wa.me/${dealer.phone}?text=${encoded}`;

        window.open(url, '_blank');
    }

    // =====================================================
    // GET DEALERS WITH OFFERS
    // =====================================================
    async function getDealersWithOffers() {

        await loadDealerMaster();

        loadOffers();

        const result = [];

        const uniqueDealers = [
            ...new Set(
                currentOffers.map(o =>
                    normalizeText(
                        o.dealer ||
                        o.customer ||
                        o.customerName ||
                        ''
                    )
                )
            )
        ];

        uniqueDealers.forEach(normalizedDealer => {

            if (!normalizedDealer) return;

            const dealer =
                dealerMaster.find(d =>
                    d.normalizedName === normalizedDealer
                );

            const offers =
                currentOffers.filter(o => {

                    const offerDealer =
                        normalizeText(
                            o.dealer ||
                            o.customer ||
                            o.customerName ||
                            ''
                        );

                    return offerDealer === normalizedDealer;

                });

            if (offers.length > 0) {

                result.push({

                    name:
                        dealer?.name ||
                        normalizedDealer,

                    phone:
                        dealer?.phone || '',

                    district:
                        dealer?.district || '',

                    owner:
                        dealer?.ownerName || '',

                    offerCount:
                        offers.length,

                    maxDiscount:
                        Math.max(
                            ...offers.map(
                                x => Number(x.discount || 0)
                            ),
                            0
                        )
                });
            }

        });

        console.log(
            "✅ Dealers with offers:",
            result.length
        );

        return result;
    }

    // =====================================================
    // SHOW BROCHURE
    // =====================================================
    function showFlyerPreview(dealerName) {

        const offers =
            getAllDealerOffers(dealerName);

        const dealer =
            findDealerInfo(dealerName);

        if (offers.length === 0) {

            alert(
                'No offers for:\n' + dealerName
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

                <td>${o.part || ''}</td>

                <td>
                Rs.${Number(o.offerPrice || 0).toFixed(2)}
                </td>

                <td>
                ${o.discount || 0}%
                </td>

                <td>
                ${o.totalStock || 0}
                </td>

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

    // =====================================================
    // EXPORT ALL
    // =====================================================
    async function exportAllFlyers() {

        await loadDealerMaster();

        loadOffers();

        let html = `
        <html>
        <head>
        <title>All Flyers</title>
        </head>
        <body>
        `;

        const dealers =
            await getDealersWithOffers();

        dealers.forEach(d => {

            const offers =
                getAllDealerOffers(d.name);

            html += `
            <div style="page-break-after:always;">

            <h2>${d.name}</h2>

            <table border="1"
            cellpadding="5"
            cellspacing="0"
            width="100%">

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

                <td>${o.part || ''}</td>

                <td>
                Rs.${Number(o.offerPrice || 0).toFixed(2)}
                </td>

                <td>
                ${o.discount || 0}%
                </td>

                <td>
                ${o.totalStock || 0}
                </td>

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

    // =====================================================
    // BULK WHATSAPP
    // =====================================================
    async function sendBulkWhatsAppFlyers() {

        const dealers =
            await getDealersWithOffers();

        if (dealers.length === 0) {

            alert(
                'No dealers with offers found'
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

        getDealerMaster: function () {
            return dealerMaster;
        },

        getCurrentOffers: function () {
            return currentOffers;
        }
    };

})();
