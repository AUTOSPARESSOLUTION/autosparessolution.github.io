// brochure-generator.js – FINAL COMPLETE INTELLIGENT VERSION
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
    // GET DEAL
