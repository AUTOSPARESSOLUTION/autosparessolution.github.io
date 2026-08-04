```javascript
// ============================================================
// 🎨 DYNAMIC BRAND COLLAGE GENERATOR v4.0
// ============================================================
// SAFE SVG VERSION
//
// Fixes:
// ✅ XML EntityRef / "&" parsing errors
// ✅ Escapes ALL SVG text and attributes
// ✅ Safe handling of M&M / special characters
// ✅ Safe logo URLs
// ✅ Avoids problematic CSS/SVG constructs
// ✅ Keeps dynamic brand count
// ✅ Keeps brand logos
// ✅ Keeps brand categories
// ✅ Keeps caching
// ✅ Keeps fallback brochure
// ✅ Diagnostic SVG logging
// ============================================================

'use strict';

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const { LRUCache } = require('lru-cache');

// ============================================================
// CACHE
// ============================================================

const collageCache = new LRUCache({
    max: 50,
    ttl: 5 * 60 * 1000
});

// ============================================================
// XML / SVG SAFETY HELPERS
// ============================================================

/**
 * Escape XML text content.
 *
 * Example:
 * M&M
 * becomes
 * M&amp;M
 */
function escapeXML(value) {
    if (value === null || value === undefined) {
        return '';
    }

    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/**
 * Escape SVG attribute values.
 */
function escapeAttr(value) {
    if (value === null || value === undefined) {
        return '';
    }

    return escapeXML(String(value));
}

/**
 * Convert arbitrary value to a safe number.
 */
function safeNumber(value, fallback = 0) {
    const n = Number(value);

    if (!Number.isFinite(n)) {
        return fallback;
    }

    return n;
}

/**
 * Keep brand names clean and predictable.
 */
function normalizeBrandName(value) {
    if (value === null || value === undefined) {
        return 'Brand';
    }

    const name = String(value)
        .replace(/\r?\n/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    return name || 'Brand';
}

/**
 * Safe first character for fallback logo.
 */
function getFallbackCharacter(name) {
    const clean = normalizeBrandName(name);

    // Remove common punctuation for fallback character.
    const cleaned = clean.replace(/[^A-Za-z0-9]/g, '');

    return cleaned.charAt(0).toUpperCase() || 'B';
}

/**
 * Convert text into a safe URL path.
 */
function safeUrl(value) {
    return String(value || '')
        .replace(/\\/g, '/')
        .split('/')
        .map(part => encodeURIComponent(part))
        .join('/');
}

// ============================================================
// DYNAMIC BRAND COLLAGE
// ============================================================

class DynamicBrandCollage {

    constructor() {
        this.tempDir = path.join(__dirname, '../temp');

        this.ensureTempDir();

        this.lastBrandCount = 0;
        this.brandHash = '';
    }

    // ========================================================
    // TEMP DIRECTORY
    // ========================================================

    ensureTempDir() {
        try {
            if (!fs.existsSync(this.tempDir)) {
                fs.mkdirSync(this.tempDir, {
                    recursive: true
                });

                console.log(`📁 Created directory: ${this.tempDir}`);
            }
        } catch (error) {
            console.error(
                '❌ Failed to create temp directory:',
                error.message
            );
        }
    }

    // ========================================================
    // BRAND HASH
    // ========================================================

    generateBrandHash(brands) {
        return brands
            .map(brand => {
                const id = normalizeBrandName(
                    brand?.id || brand?.name || 'brand'
                );

                const name = normalizeBrandName(
                    brand?.name || 'Brand'
                );

                const active = brand?.active !== false;

                return `${id}:${name}:${active}`;
            })
            .join('|');
    }

    // ========================================================
    // MAIN BROCHURE FUNCTION
    // ========================================================

    async generateWelcomeBrochure(
        brands,
        customerPhone = null
    ) {

        try {

            // ------------------------------------------------
            // Load brands if not supplied
            // ------------------------------------------------

            if (!Array.isArray(brands) || brands.length === 0) {

                try {

                    const brandManager =
                        require('./brand-config');

                    brands =
                        brandManager.getActiveBrands();

                } catch (error) {

                    console.log(
                        '⚠️ Could not load brand-config:',
                        error.message
                    );

                    brands = this.getDefaultBrands();
                }
            }

            // ------------------------------------------------
            // Ensure array
            // ------------------------------------------------

            if (!Array.isArray(brands)) {
                brands = this.getDefaultBrands();
            }

            // ------------------------------------------------
            // Active brands
            // ------------------------------------------------

            const activeBrands = brands.filter(
                brand => brand && brand.active !== false
            );

            if (activeBrands.length === 0) {

                console.log(
                    '⚠️ No active brands found. Using defaults.'
                );

                brands = this.getDefaultBrands();

            } else {

                brands = activeBrands;
            }

            // ------------------------------------------------
            // Brand hash
            // ------------------------------------------------

            const currentHash =
                this.generateBrandHash(brands);

            if (currentHash !== this.brandHash) {

                console.log(
                    '🔄 Brand list changed, clearing brochure cache...'
                );

                this.brandHash = currentHash;

                collageCache.clear();
            }

            // ------------------------------------------------
            // Cache
            // ------------------------------------------------

            const safePhone =
                customerPhone
                    ? String(customerPhone)
                    : 'default';

            const cacheKey =
                `brochure_${currentHash}_${safePhone}`;

            if (collageCache.has(cacheKey)) {

                console.log(
                    `📦 Returning cached brochure (${brands.length} brands)`
                );

                return collageCache.get(cacheKey);
            }

            // ------------------------------------------------
            // Generate
            // ------------------------------------------------

            console.log(
                `🎨 Generating dynamic brochure with ${brands.length} brands...`
            );

            const brochure =
                await this.createDynamicBrochure(
                    brands,
                    customerPhone
                );

            // ------------------------------------------------
            // Cache
            // ------------------------------------------------

            collageCache.set(
                cacheKey,
                brochure
            );

            this.lastBrandCount =
                brands.length;

            return brochure;

        } catch (error) {

            console.error(
                '❌ Brochure generation error:',
                error.message
            );

            try {
                return this.createTextBrochure(
                    Array.isArray(brands)
                        ? brands
                        : this.getDefaultBrands()
                );
            } catch (fallbackError) {

                console.error(
                    '❌ Text fallback failed:',
                    fallbackError.message
                );

                return Buffer.from(
                    'AUTO SPARES SOLUTION'
                );
            }
        }
    }

    // ========================================================
    // COMPLETE BROCHURE
    // ========================================================

    async createDynamicBrochure(
        brands,
        customerPhone = null
    ) {

        try {

            const count =
                Array.isArray(brands)
                    ? brands.length
                    : 0;

            // ------------------------------------------------
            // Canvas dimensions
            // ------------------------------------------------

            const width = 1200;

            let height;
            let cols;

            if (count <= 4) {

                cols = 2;
                height = 1400;

            } else if (count <= 8) {

                cols = 3;
                height = 1600;

            } else if (count <= 12) {

                cols = 4;
                height = 1800;

            } else if (count <= 20) {

                cols = 5;
                height = 2200;

            } else {

                cols = 6;
                height = 2500;
            }

            const rows =
                Math.max(
                    1,
                    Math.ceil(count / cols)
                );

            const brandHeight =
                Math.min(
                    140,
                    Math.max(
                        105,
                        (height - 350) / rows
                    )
                );

            const brandWidth =
                Math.min(
                    180,
                    Math.max(
                        150,
                        (width - 60) / cols
                    )
                );

            // ------------------------------------------------
            // Generate sections
            // ------------------------------------------------

            const baseImage =
                await this.createDynamicBase(
                    width,
                    height,
                    count
                );

            const titleImage =
                await this.createDynamicTitle(
                    width,
                    count,
                    customerPhone
                );

            const logosImage =
                await this.createDynamicBrandGrid(
                    brands,
                    width,
                    cols,
                    brandWidth,
                    brandHeight
                );

            const footerImage =
                await this.createDynamicFooter(
                    width,
                    count
                );

            // ------------------------------------------------
            // Composite
            // ------------------------------------------------

            const result =
                await sharp({
                    create: {
                        width,
                        height,
                        channels: 4,
                        background: {
                            r: 0,
                            g: 0,
                            b: 0,
                            alpha: 0
                        }
                    }
                })
                .composite([
                    {
                        input: baseImage,
                        top: 0,
                        left: 0
                    },
                    {
                        input: titleImage,
                        top: 0,
                        left: 0
                    },
                    {
                        input: logosImage,
                        top: 280,
                        left: 0
                    },
                    {
                        input: footerImage,
                        top: height - 140,
                        left: 0
                    }
                ])
                .jpeg({
                    quality: 92,
                    progressive: true
                })
                .toBuffer();

            console.log(
                `✅ Dynamic brochure generated successfully (${count} brands)`
            );

            return result;

        } catch (error) {

            console.error(
                '❌ Dynamic brochure creation error:',
                error.message
            );

            // ------------------------------------------------
            // IMPORTANT:
            // If Sharp/librsvg fails, create fallback.
            // ------------------------------------------------

            try {

                return await this.createFallbackImage(
                    brands
                );

            } catch (fallbackError) {

                console.error(
                    '❌ Image fallback failed:',
                    fallbackError.message
                );

                return this.createTextBrochure(
                    brands
                );
            }
        }
    }

    // ========================================================
    // BACKGROUND
    // ========================================================

    async createDynamicBase(
        width,
        height,
        brandCount
    ) {

        const gradientColors =
            brandCount > 10
                ? ['#0072B0', '#005A8C', '#003D66']
                : ['#1A5276', '#2E86C1', '#0072B0'];

        const safeWidth =
            safeNumber(width, 1200);

        const safeHeight =
            safeNumber(height, 1800);

        const circles = [
            {
                cx: safeWidth * 0.20,
                cy: safeHeight * 0.25,
                r: 180
            },
            {
                cx: safeWidth * 0.80,
                cy: safeHeight * 0.50,
                r: 220
            },
            {
                cx: safeWidth * 0.40,
                cy: safeHeight * 0.80,
                r: 160
            }
        ];

        let svg = '';

        svg += `<svg xmlns="http://www.w3.org/2000/svg" width="${safeWidth}" height="${safeHeight}" viewBox="0 0 ${safeWidth} ${safeHeight}">`;

        // Background
        svg += `<defs>`;

        svg += `
            <linearGradient
                id="backgroundGradient"
                x1="0"
                y1="0"
                x2="1"
                y2="1"
            >
                <stop
                    offset="0%"
                    stop-color="${escapeAttr(gradientColors[0])}"
                />
                <stop
                    offset="50%"
                    stop-color="${escapeAttr(gradientColors[1])}"
                />
                <stop
                    offset="100%"
                    stop-color="${escapeAttr(gradientColors[2])}"
                />
            </linearGradient>
        `;

        svg += `</defs>`;

        svg += `
            <rect
                x="0"
                y="0"
                width="${safeWidth}"
                height="${safeHeight}"
                fill="url(#backgroundGradient)"
            />
        `;

        // Decorative circles
        circles.forEach(circle => {

            svg += `
                <circle
                    cx="${circle.cx}"
                    cy="${circle.cy}"
                    r="${circle.r}"
                    fill="#FFFFFF"
                    opacity="0.05"
                />
            `;

        });

        // Outer border
        svg += `
            <rect
                x="20"
                y="20"
                width="${safeWidth - 40}"
                height="${safeHeight - 40}"
                rx="20"
                fill="none"
                stroke="#FFFFFF"
                stroke-opacity="0.20"
                stroke-width="3"
            />
        `;

        // Brand count badge
        svg += `
            <rect
                x="${safeWidth - 205}"
                y="30"
                width="165"
                height="38"
                rx="19"
                fill="#FFFFFF"
                fill-opacity="0.12"
                stroke="#FFFFFF"
                stroke-opacity="0.20"
                stroke-width="1"
            />
        `;

        svg += `
            <text
                x="${safeWidth - 122}"
                y="55"
                font-family="Arial, Helvetica, sans-serif"
                font-size="14"
                font-weight="bold"
                text-anchor="middle"
                fill="#CCE5FF"
            >
                ${escapeXML(`${brandCount} Brands`)}
            </text>
        `;

        svg += `</svg>`;

        return sharp(
            Buffer.from(svg, 'utf8')
        )
            .png()
            .toBuffer();
    }

    // ========================================================
    // TITLE
    // ========================================================

    async createDynamicTitle(
        width,
        brandCount,
        customerPhone
    ) {

        const title =
            'AUTO SPARES SOLUTION';

        const subtitle =
            `${brandCount} Premium Auto Brands - Trusted Quality`;

        const welcome =
            customerPhone
                ? `Welcome ${customerPhone}`
                : 'Welcome to Our Family!';

        const tagline =
            brandCount > 10
                ? 'Largest Collection of Premium Auto Parts'
                : 'Curated Selection of Quality Brands';

        const centerX =
            safeNumber(width, 1200) / 2;

        let svg = '';

        svg += `
            <svg
                xmlns="http://www.w3.org/2000/svg"
                width="${safeNumber(width, 1200)}"
                height="280"
                viewBox="0 0 ${safeNumber(width, 1200)} 280"
            >
        `;

        // Logo circle
        svg += `
            <circle
                cx="${centerX}"
                cy="55"
                r="40"
                fill="#FFFFFF"
                fill-opacity="0.15"
                stroke="#FFFFFF"
                stroke-width="2"
            />
        `;

        // Car icon as simple text
        svg += `
            <text
                x="${centerX}"
                y="69"
                font-family="Arial, Helvetica, sans-serif"
                font-size="32"
                text-anchor="middle"
                fill="#FFFFFF"
            >
                🚗
            </text>
        `;

        // Title
        svg += `
            <text
                x="${centerX}"
                y="125"
                font-family="Arial, Helvetica, sans-serif"
                font-size="${brandCount > 10 ? 44 : 48}"
                font-weight="bold"
                text-anchor="middle"
                fill="#FFFFFF"
            >
                ${escapeXML(title)}
            </text>
        `;

        // Subtitle
        svg += `
            <text
                x="${centerX}"
                y="165"
                font-family="Arial, Helvetica, sans-serif"
                font-size="${brandCount > 10 ? 18 : 22}"
                text-anchor="middle"
                fill="#CCE5FF"
            >
                ${escapeXML(subtitle)}
            </text>
        `;

        // Welcome
        svg += `
            <text
                x="${centerX}"
                y="200"
                font-family="Arial, Helvetica, sans-serif"
                font-size="16"
                text-anchor="middle"
                fill="#FFD700"
            >
                ${escapeXML(welcome)}
            </text>
        `;

        // Separator
        svg += `
            <line
                x1="${centerX - 200}"
                y1="225"
                x2="${centerX + 200}"
                y2="225"
                stroke="#FFFFFF"
                stroke-opacity="0.20"
                stroke-width="2"
            />
        `;

        // Tagline
        svg += `
            <text
                x="${centerX}"
                y="255"
                font-family="Arial, Helvetica, sans-serif"
                font-size="12"
                text-anchor="middle"
                fill="#FFFFFF"
                fill-opacity="0.50"
            >
                ${escapeXML(tagline)}
            </text>
        `;

        svg += `</svg>`;

        return sharp(
            Buffer.from(svg, 'utf8')
        )
            .png()
            .toBuffer();
    }

    // ========================================================
    // BRAND GRID
    // ========================================================

    async createDynamicBrandGrid(
        brands,
        width,
        cols,
        itemWidth,
        itemHeight
    ) {

        const safeBrands =
            Array.isArray(brands)
                ? brands
                : [];

        const rows =
            Math.max(
                1,
                Math.ceil(
                    safeBrands.length / cols
                )
            );

        const gridWidth =
            cols * (itemWidth + 20) - 20;

        const offsetX =
            (width - gridWidth) / 2;

        const totalHeight =
            rows * (itemHeight + 20) + 40;

        // ----------------------------------------------------
        // Logo location
        // ----------------------------------------------------

        const LOGO_BASE_URL =
            'https://autosparessolution.github.io/images/';

        // ----------------------------------------------------
        // Logo map
        // ----------------------------------------------------

        const brandLogoMap = {

            'RANE':
                'RANE.png',

            'TVS':
                'TVS.jpg',

            'RBL':
                'brand-rbl.png',

            'RML':
                'RML.png',

            'GIRLING':
                'brand-girling.png',

            'LMM':
                'brand-lmm.png',

            'MM':
                'brand-m-m.png',

            'M M':
                'brand-m-m.png',

            'M&M':
                'brand-m-m.png',

            'MTBL':
                'brand-mtbl.png',

            'STL':
                'brand-stl.png',

            'VF':
                'brand-vf.png',

            'WABCO':
                'brand-wabco.png',

            'GREAVES':
                'brand-greaves.png',

            'LEYPARTS':
                'brand-leyparts.png',

            'BOSCH':
                'brand-bosch.png'
        };

        const DEFAULT_LOGO =
            'default.png';

        // ----------------------------------------------------
        // Categories
        // ----------------------------------------------------

        const brandCategories = {

            'RANE':
                'Suspension - Steering',

            'TVS':
                'Bolt - Nut',

            'RBL':
                'Brake Lining',

            'RML':
                'Suspension - Steering',

            'GIRLING':
                'Brake Systems',

            'LMM':
                'Mahindra Sub One Ton',

            'MM':
                'Passenger - Commercial',

            'M M':
                'Passenger - Commercial',

            'M&M':
                'Passenger - Commercial',

            'MTBL':
                'Mahindra Truck Bus',

            'STL':
                'Fasteners',

            'VF':
                'Mahindra Value Fit',

            'WABCO':
                'Air Brakes - ABS',

            'GREAVES':
                'Engine - Transmission',

            'LEYPARTS':
                'Leyland Spares',

            'BOSCH':
                'Electrical - Fuel'
        };

        // ----------------------------------------------------
        // Safe colors
        // ----------------------------------------------------

        const colors = [
            '#FF6B6B',
            '#4ECDC4',
            '#45B7D1',
            '#96CEB4',
            '#FFEAA7',
            '#DDA0DD',
            '#98D8C8',
            '#F7DC6F',
            '#BB8FCE',
            '#85C1E9',
            '#F8C471',
            '#82E0AA',
            '#F1948A',
            '#73C6B6',
            '#5DADE2'
        ];

        // ----------------------------------------------------
        // Start SVG
        // ----------------------------------------------------

        let svg = '';

        svg += `
            <svg
                xmlns="http://www.w3.org/2000/svg"
                width="${safeNumber(width, 1200)}"
                height="${safeNumber(totalHeight, 500)}"
                viewBox="0 0 ${safeNumber(width, 1200)} ${safeNumber(totalHeight, 500)}"
            >
        `;

        // ====================================================
        // BRAND CARDS
        // ====================================================

        for (
            let i = 0;
            i < safeBrands.length;
            i++
        ) {

            const brand =
                safeBrands[i] || {};

            const row =
                Math.floor(i / cols);

            const col =
                i % cols;

            const x =
                offsetX +
                col * (itemWidth + 20);

            const y =
                row * (itemHeight + 20) +
                20;

            // ------------------------------------------------
            // Brand data
            // ------------------------------------------------

            const brandName =
                normalizeBrandName(
                    brand.name
                );

            const upperName =
                brandName.toUpperCase();

            const isActive =
                brand.active !== false;

            const color =
                colors[i % colors.length];

            // ------------------------------------------------
            // Logo lookup
            // ------------------------------------------------

            let logoKey =
                upperName;

            if (
                upperName === 'M M' ||
                upperName === 'M&M' ||
                upperName === 'MM'
            ) {
                logoKey = 'MM';
            }

            const logoFile =
                brandLogoMap[logoKey] ||
                DEFAULT_LOGO;

            // ------------------------------------------------
            // SAFE LOGO URL
            // ------------------------------------------------

            const logoUrl =
                `${LOGO_BASE_URL}${safeUrl(logoFile)}`;

            // ------------------------------------------------
            // Category
            // ------------------------------------------------

            let category =
                brandCategories[logoKey] ||
                brandCategories[upperName] ||
                'Premium Auto Parts';

            category =
                normalizeBrandName(category);

            // ------------------------------------------------
            // Escape text
            // ------------------------------------------------

            const safeName =
                escapeXML(brandName);

            const safeCategory =
                escapeXML(category);

            const safeLogoUrl =
                escapeAttr(logoUrl);

            // ------------------------------------------------
            // Dimensions
            // ------------------------------------------------

            const logoSize =
                itemWidth > 150
                    ? 60
                    : 50;

            const logoX =
                x +
                (itemWidth - logoSize) / 2;

            const logoY =
                y + 15;

            const cardWidth =
                Math.max(
                    1,
                    itemWidth
                );

            const cardHeight =
                Math.max(
                    1,
                    itemHeight
                );

            // =================================================
            // CARD
            // =================================================

            svg += `
                <rect
                    x="${x}"
                    y="${y}"
                    width="${cardWidth}"
                    height="${cardHeight}"
                    rx="14"
                    fill="#FFFFFF"
                    fill-opacity="0.07"
                    stroke="#FFFFFF"
                    stroke-opacity="0.10"
                    stroke-width="1.5"
                />
            `;

            // =================================================
            // ACCENT
            // =================================================

            svg += `
                <rect
                    x="${x + 12}"
                    y="${y + 8}"
                    width="${Math.max(1, itemWidth - 24)}"
                    height="3"
                    rx="2"
                    fill="${escapeAttr(color)}"
                    fill-opacity="0.70"
                />
            `;

            // =================================================
            // LOGO CIRCLE
            // =================================================

            svg += `
                <circle
                    cx="${x + itemWidth / 2}"
                    cy="${logoY + logoSize / 2}"
                    r="${logoSize / 2 + 5}"
                    fill="#FFFFFF"
                    fill-opacity="0.05"
                    stroke="#FFFFFF"
                    stroke-opacity="0.08"
                    stroke-width="1"
                />
            `;

            // =================================================
            // LOGO IMAGE
            // =================================================

            svg += `
                <image
                    x="${logoX}"
                    y="${logoY}"
                    width="${logoSize}"
                    height="${logoSize}"
                    href="${safeLogoUrl}"
                    preserveAspectRatio="xMidYMid meet"
                    opacity="0.95"
                />
            `;

            // =================================================
            // FALLBACK LETTER
            // =================================================

            const fallbackChar =
                escapeXML(
                    getFallbackCharacter(
                        brandName
                    )
                );

            svg += `
                <text
                    x="${x + itemWidth / 2}"
                    y="${logoY + logoSize / 2 + 7}"
                    font-family="Arial, Helvetica, sans-serif"
                    font-size="${itemWidth > 150 ? 28 : 22}"
                    font-weight="bold"
                    text-anchor="middle"
                    fill="#FFFFFF"
                    fill-opacity="0.40"
                >
                    ${fallbackChar}
                </text>
            `;

            // =================================================
            // BRAND NAME
            // =================================================

            const nameY =
                logoY +
                logoSize +
                15;

            svg += `
                <text
                    x="${x + itemWidth / 2}"
                    y="${nameY + 15}"
                    font-family="Arial, Helvetica, sans-serif"
                    font-size="${itemWidth > 150 ? 18 : 14}"
                    font-weight="bold"
                    text-anchor="middle"
                    letter-spacing="1"
                    fill="#FFFFFF"
                >
                    ${safeName}
                </text>
            `;

            // =================================================
            // CATEGORY
            // =================================================

            svg += `
                <text
                    x="${x + itemWidth / 2}"
                    y="${nameY + 35}"
                    font-family="Arial, Helvetica, sans-serif"
                    font-size="10"
                    text-anchor="middle"
                    fill="#FFFFFF"
                    fill-opacity="0.40"
                >
                    ${safeCategory}
                </text>
            `;

            // =================================================
            // NUMBER
            // =================================================

            svg += `
                <text
                    x="${x + 15}"
                    y="${y + itemHeight - 10}"
                    font-family="Arial, Helvetica, sans-serif"
                    font-size="10"
                    fill="#FFFFFF"
                    fill-opacity="0.15"
                >
                    ${escapeXML(`#${i + 1}`)}
                </text>
            `;

            // =================================================
            // ACTIVE DOT
            // =================================================

            if (isActive) {

                svg += `
                    <circle
                        cx="${x + itemWidth - 15}"
                        cy="${y + 15}"
                        r="4"
                        fill="#4CAF50"
                        fill-opacity="0.80"
                    />
                `;
            }
        }

        // ----------------------------------------------------
        // Close SVG
        // ----------------------------------------------------

        svg += `</svg>`;

        // ====================================================
        // SHARP
        // ====================================================

        try {

            return await sharp(
                Buffer.from(svg, 'utf8')
            )
                .png()
                .toBuffer();

        } catch (error) {

            console.error(
                '❌ Brand grid SVG rendering failed:',
                error.message
            );

            // ------------------------------------------------
            // Diagnostic file
            // ------------------------------------------------

            try {

                const diagnosticPath =
                    path.join(
                        this.tempDir,
                        'brand-grid-error.svg'
                    );

                fs.writeFileSync(
                    diagnosticPath,
                    svg,
                    'utf8'
                );

                console.error(
                    `🧪 Diagnostic SVG saved: ${diagnosticPath}`
                );

            } catch (writeError) {

                console.error(
                    '⚠️ Could not save diagnostic SVG:',
                    writeError.message
                );
            }

            throw error;
        }
    }

    // ========================================================
    // FOOTER
    // ========================================================

    async createDynamicFooter(
        width,
        brandCount
    ) {

        const phone =
            process.env.PHONE ||
            '9830300193';

        const footerText =
            brandCount > 10
                ? "India's Largest Auto Parts Platform"
                : 'Premium Auto Parts Supplier';

        const safeWidth =
            safeNumber(width, 1200);

        const centerX =
            safeWidth / 2;

        const website =
            'https://autosparessolution.com';

        const date =
            new Date()
                .toLocaleDateString('en-IN');

        let svg = '';

        svg += `
            <svg
                xmlns="http://www.w3.org/2000/svg"
                width="${safeWidth}"
                height="140"
                viewBox="0 0 ${safeWidth} 140"
            >
        `;

        // Separator
        svg += `
            <line
                x1="40"
                y1="15"
                x2="${safeWidth - 40}"
                y2="15"
                stroke="#FFFFFF"
                stroke-opacity="0.15"
                stroke-width="1"
            />
        `;

        // Footer text
        svg += `
            <text
                x="${centerX}"
                y="40"
                font-family="Arial, Helvetica, sans-serif"
                font-size="13"
                text-anchor="middle"
                fill="#CCE5FF"
            >
                ${escapeXML(footerText)}
            </text>
        `;

        // Phone
        svg += `
            <text
                x="${centerX}"
                y="65"
                font-family="Arial, Helvetica, sans-serif"
                font-size="15"
                font-weight="bold"
                text-anchor="middle"
                fill="#FFD700"
            >
                ${escapeXML(`Phone: ${phone}`)}
            </text>
        `;

        // Website
        svg += `
            <text
                x="${centerX}"
                y="88"
                font-family="Arial, Helvetica, sans-serif"
                font-size="12"
                text-anchor="middle"
                fill="#CCE5FF"
            >
                ${escapeXML(website)}
            </text>
        `;

        // Updated
        svg += `
            <text
                x="${centerX}"
                y="115"
                font-family="Arial, Helvetica, sans-serif"
                font-size="10"
                text-anchor="middle"
                fill="#FFFFFF"
                fill-opacity="0.30"
            >
                ${escapeXML(`Last Updated: ${date} - ${brandCount} Brands`)}
            </text>
        `;

        svg += `</svg>`;

        return sharp(
            Buffer.from(svg, 'utf8')
        )
            .png()
            .toBuffer();
    }

    // ========================================================
    // FALLBACK IMAGE
    // ========================================================

    async createFallbackImage(brands) {

        const activeBrands =
            Array.isArray(brands)
                ? brands.filter(
                    b => b && b.active !== false
                )
                : [];

        const names =
            activeBrands
                .map(
                    b => normalizeBrandName(b.name)
                )
                .join(' • ');

        const phone =
            process.env.PHONE ||
            '9830300193';

        const width = 1200;
        const height = 1000;

        let svg = `
            <svg
                xmlns="http://www.w3.org/2000/svg"
                width="${width}"
                height="${height}"
                viewBox="0 0 ${width} ${height}"
            >

                <rect
                    width="${width}"
                    height="${height}"
                    fill="#005A8C"
                />

                <rect
                    x="20"
                    y="20"
                    width="${width - 40}"
                    height="${height - 40}"
                    rx="25"
                    fill="none"
                    stroke="#FFFFFF"
                    stroke-opacity="0.25"
                    stroke-width="3"
                />

                <text
                    x="${width / 2}"
                    y="180"
                    font-family="Arial, Helvetica, sans-serif"
                    font-size="50"
                    font-weight="bold"
                    text-anchor="middle"
                    fill="#FFFFFF"
                >
                    AUTO SPARES SOLUTION
                </text>

                <text
                    x="${width / 2}"
                    y="250"
                    font-family="Arial, Helvetica, sans-serif"
                    font-size="25"
                    text-anchor="middle"
                    fill="#CCE5FF"
                >
                    ${escapeXML(`${activeBrands.length} Premium Brands`)}
                </text>

                <text
                    x="${width / 2}"
                    y="380"
                    font-family="Arial, Helvetica, sans-serif"
                    font-size="24"
                    text-anchor="middle"
                    fill="#FFFFFF"
                >
                    ${escapeXML(names.substring(0, 100))}
                </text>

                <text
                    x="${width / 2}"
                    y="600"
                    font-family="Arial, Helvetica, sans-serif"
                    font-size="28"
                    text-anchor="middle"
                    fill="#FFD700"
                >
                    ${escapeXML(`Phone: ${phone}`)}
                </text>

                <text
                    x="${width / 2}"
                    y="660"
                    font-family="Arial, Helvetica, sans-serif"
                    font-size="22"
                    text-anchor="middle"
                    fill="#CCE5FF"
                >
                    https://autosparessolution.com
                </text>

                <text
                    x="${width / 2}"
                    y="800"
                    font-family="Arial, Helvetica, sans-serif"
                    font-size="20"
                    text-anchor="middle"
                    fill="#FFFFFF"
                    fill-opacity="0.60"
                >
                    Powered by ASSIST AI
                </text>

            </svg>
        `;

        return sharp(
            Buffer.from(svg, 'utf8')
        )
            .jpeg({
                quality: 90
            })
            .toBuffer();
    }

    // ========================================================
    // TEXT FALLBACK
    // ========================================================

    createTextBrochure(brands) {

        const activeBrands =
            Array.isArray(brands)
                ? brands.filter(
                    b => b && b.active !== false
                )
                : [];

        const brandNames =
            activeBrands
                .map(
                    b => normalizeBrandName(b.name)
                )
                .join(' • ');

        const phone =
            process.env.PHONE ||
            '9830300193';

        const border =
            '═'.repeat(60);

        return Buffer.from(`

╔${border}╗
║                                                          ║
║              🚗 AUTO SPARES SOLUTION                    ║
║                                                          ║
║        ${activeBrands.length} Premium Brands            ║
║                                                          ║
║        ${brandNames.substring(0, 50)}...               ║
║                                                          ║
║        📞 ${phone}                                      ║
║        🛒 https://autosparessolution.com               ║
║                                                          ║
║        🤖 Powered by ASSIST AI                           ║
║                                                          ║
╚${border}╝

        `);
    }

    // ========================================================
    // DEFAULT BRANDS
    // ========================================================

    getDefaultBrands() {

        return [

            {
                id: 'rane',
                name: 'RANE',
                active: true
            },

            {
                id: 'tvs',
                name: 'TVS',
                active: true
            },

            {
                id: 'rbl',
                name: 'RBL',
                active: true
            },

            {
                id: 'rml',
                name: 'RML',
                active: true
            },

            {
                id: 'girling',
                name: 'GIRLING',
                active: true
            },

            {
                id: 'lmm',
                name: 'LMM',
                active: true
            },

            {
                id: 'mm',
                name: 'M&M',
                active: true
            },

            {
                id: 'mtbl',
                name: 'MTBL',
                active: true
            },

            {
                id: 'stl',
                name: 'STL',
                active: true
            },

            {
                id: 'vf',
                name: 'VF',
                active: true
            },

            {
                id: 'wabco',
                name: 'WABCO',
                active: true
            }
        ];
    }

    // ========================================================
    // CLEANUP
    // ========================================================

    cleanupTempFiles() {

        try {

            if (!fs.existsSync(this.tempDir)) {
                return;
            }

            const files =
                fs.readdirSync(
                    this.tempDir
                );

            const now =
                Date.now();

            let count = 0;

            for (const file of files) {

                const filePath =
                    path.join(
                        this.tempDir,
                        file
                    );

                let stats;

                try {

                    stats =
                        fs.statSync(
                            filePath
                        );

                } catch (error) {

                    continue;
                }

                if (
                    now - stats.mtimeMs >
                    3600000
                ) {

                    try {

                        fs.unlinkSync(
                            filePath
                        );

                        count++;

                    } catch (error) {

                        console.error(
                            '⚠️ Could not delete:',
                            file,
                            error.message
                        );
                    }
                }
            }

            if (count > 0) {

                console.log(
                    `🧹 Cleaned up ${count} temp files`
                );
            }

        } catch (error) {

            console.error(
                '❌ Cleanup error:',
                error.message
            );
        }
    }
}

// ============================================================
// EXPORT SINGLETON
// ============================================================

module.exports =
    new DynamicBrandCollage();
```
