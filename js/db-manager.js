// js/db-manager.js - IndexedDB Database Manager
// Handles ALL offer storage (beyond 5,000 limit)

(function() {

    console.log("🗄️ Database Manager loading...");

    // ===================================================
    // DATABASE CONFIGURATION
    // ===================================================

    const DB_NAME = 'DealerIntelligenceDB';
    const DB_VERSION = 1;

    // ===================================================
    // OPEN DATABASE
    // ===================================================

    function openDatabase() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = function(event) {
                console.error('❌ Database error:', event.target.error);
                reject(event.target.error);
            };

            request.onsuccess = function(event) {
                const db = event.target.result;
                console.log('✅ Database opened successfully');
                resolve(db);
            };

            request.onupgradeneeded = function(event) {
                const db = event.target.result;
                console.log('🔄 Database upgrade needed, creating stores...');

                // === Store 1: offers ===
                if (!db.objectStoreNames.contains('offers')) {
                    const offerStore = db.createObjectStore('offers', { 
                        keyPath: 'id', 
                        autoIncrement: true 
                    });
                    
                    offerStore.createIndex('dealer', 'dealer', { unique: false });
                    offerStore.createIndex('part', 'part', { unique: false });
                    offerStore.createIndex('dealer_part', ['dealer', 'part'], { unique: false });
                    offerStore.createIndex('discount', 'discount', { unique: false });
                    offerStore.createIndex('stockType', 'stockType', { unique: false });
                    
                    console.log('✅ Offers store created with indexes');
                }

                // === Store 2: dealers ===
                if (!db.objectStoreNames.contains('dealers')) {
                    const dealerStore = db.createObjectStore('dealers', { 
                        keyPath: 'normalized' 
                    });
                    
                    dealerStore.createIndex('hasPhone', 'hasPhone', { unique: false });
                    dealerStore.createIndex('offerCount', 'offerCount', { unique: false });
                    
                    console.log('✅ Dealers store created');
                }

                // === Store 3: metadata ===
                if (!db.objectStoreNames.contains('metadata')) {
                    const metaStore = db.createObjectStore('metadata', { 
                        keyPath: 'key' 
                    });
                    console.log('✅ Metadata store created');
                }
            };
        });
    }

    // ===================================================
    // GENERATE UNIQUE ID
    // ===================================================

    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    }

    // ===================================================
    // NORMALIZE DEALER NAME
    // ===================================================

    function normalizeDealerName(name) {
        return String(name || '')
            .replace(/\s+/g, ' ')
            .trim()
            .toUpperCase();
    }

    // ===================================================
    // SAVE OFFERS TO INDEXEDDB
    // ===================================================

    async function saveOffersToDB(offers) {
        console.log(`💾 Saving ${offers.length} offers to IndexedDB...`);
        
        try {
            const db = await openDatabase();
            const transaction = db.transaction(['offers', 'dealers', 'metadata'], 'readwrite');
            
            const offerStore = transaction.objectStore('offers');
            const dealerStore = transaction.objectStore('dealers');
            const metaStore = transaction.objectStore('metadata');

            // Clear existing offers
            offerStore.clear();

            // Save each offer
            let savedCount = 0;
            const dealerMap = new Map();

            for (const offer of offers) {
                if (!offer.id) {
                    offer.id = generateId();
                }
                
                offerStore.add(offer);
                savedCount++;
                
                const dealerName = offer.dealer || 'Unknown';
                if (!dealerMap.has(dealerName)) {
                    dealerMap.set(dealerName, {
                        normalized: normalizeDealerName(dealerName),
                        name: dealerName,
                        offerCount: 0,
                        hasPhone: false,
                        phone: '',
                        district: '',
                        myStockCount: 0,
                        distStockCount: 0
                    });
                }
                const dealer = dealerMap.get(dealerName);
                dealer.offerCount++;
                if (offer.stockType === 'my-stock') {
                    dealer.myStockCount++;
                } else if (offer.stockType === 'distributor-stock') {
                    dealer.distStockCount++;
                }
            }

            console.log(`✅ Saved ${savedCount} offers to IndexedDB`);

            // Save dealers
            dealerStore.clear();
            for (const [name, dealer] of dealerMap) {
                dealerStore.add(dealer);
            }
            console.log(`✅ Saved ${dealerMap.size} dealers to IndexedDB`);

            // Save metadata
            const metadata = {
                key: 'analysis',
                totalOffers: offers.length,
                totalDealers: dealerMap.size,
                lastUpdated: new Date().toISOString(),
                version: '2.0'
            };
            metaStore.put(metadata);

            // Also save dealer list in localStorage for quick access
            localStorage.setItem('dealerList', JSON.stringify(Array.from(dealerMap.keys())));
            localStorage.setItem('dealerCount', String(dealerMap.size));

            console.log(`✅ Metadata saved: ${metadata.totalOffers} offers, ${metadata.totalDealers} dealers`);

            return {
                success: true,
                offersSaved: savedCount,
                dealersSaved: dealerMap.size
            };

        } catch (error) {
            console.error('❌ Error saving to IndexedDB:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // ===================================================
    // LOAD ALL OFFERS FROM INDEXEDDB
    // ===================================================

    async function loadAllOffersFromDB() {
        console.log('📊 Loading all offers from IndexedDB...');
        
        try {
            const db = await openDatabase();
            const transaction = db.transaction(['offers'], 'readonly');
            const store = transaction.objectStore('offers');
            
            return new Promise((resolve, reject) => {
                const request = store.getAll();
                
                request.onsuccess = function() {
                    const offers = request.result || [];
                    console.log(`✅ Loaded ${offers.length} offers from IndexedDB`);
                    resolve(offers);
                };
                
                request.onerror = function() {
                    reject(request.error);
                };
            });
            
        } catch (error) {
            console.error('❌ Error loading offers from IndexedDB:', error);
            return [];
        }
    }

    // ===================================================
    // LOAD OFFERS BY DEALER (Paginated)
    // ===================================================

    async function loadOffersByDealer(dealerName, page = 1, pageSize = 20) {
        console.log(`🔍 Loading offers for dealer: ${dealerName}, page ${page}`);
        
        try {
            const db = await openDatabase();
            const transaction = db.transaction(['offers'], 'readonly');
            const store = transaction.objectStore('offers');
            const index = store.index('dealer');
            
            const normalizedDealer = normalizeDealerName(dealerName);
            
            return new Promise((resolve, reject) => {
                const request = index.getAll(normalizedDealer);
                
                request.onsuccess = function() {
                    const allOffers = request.result || [];
                    const start = (page - 1) * pageSize;
                    const end = start + pageSize;
                    const pageOffers = allOffers.slice(start, end);
                    
                    console.log(`✅ Found ${allOffers.length} offers for ${dealerName}`);
                    
                    resolve({
                        offers: pageOffers,
                        total: allOffers.length,
                        page: page,
                        pageSize: pageSize,
                        totalPages: Math.ceil(allOffers.length / pageSize)
                    });
                };
                
                request.onerror = function() {
                    reject(request.error);
                };
            });
            
        } catch (error) {
            console.error(`❌ Error loading offers for ${dealerName}:`, error);
            return {
                offers: [],
                total: 0,
                page: 1,
                pageSize: pageSize,
                totalPages: 0
            };
        }
    }

    // ===================================================
    // GET ALL DEALERS FROM INDEXEDDB
    // ===================================================

    async function getAllDealersFromDB() {
        console.log('📊 Loading all dealers from IndexedDB...');
        
        try {
            const db = await openDatabase();
            const transaction = db.transaction(['dealers'], 'readonly');
            const store = transaction.objectStore('dealers');
            
            return new Promise((resolve, reject) => {
                const request = store.getAll();
                
                request.onsuccess = function() {
                    const dealers = request.result || [];
                    dealers.sort((a, b) => b.offerCount - a.offerCount);
                    console.log(`✅ Loaded ${dealers.length} dealers from IndexedDB`);
                    resolve(dealers);
                };
                
                request.onerror = function() {
                    reject(request.error);
                };
            });
            
        } catch (error) {
            console.error('❌ Error loading dealers from IndexedDB:', error);
            return [];
        }
    }

    // ===================================================
    // GET DEALER COUNT
    // ===================================================

    async function getDealerCountFromDB() {
        try {
            const dealers = await getAllDealersFromDB();
            return dealers.length;
        } catch (error) {
            return 0;
        }
    }

    // ===================================================
    // GET OFFER COUNT
    // ===================================================

    async function getOfferCountFromDB() {
        try {
            const offers = await loadAllOffersFromDB();
            return offers.length;
        } catch (error) {
            return 0;
        }
    }

    // ===================================================
    // SEARCH OFFERS
    // ===================================================

    async function searchOffers(searchTerm, page = 1, pageSize = 20) {
        console.log(`🔍 Searching offers for: "${searchTerm}"`);
        
        try {
            const allOffers = await loadAllOffersFromDB();
            
            const term = searchTerm.toLowerCase().trim();
            const results = allOffers.filter(o => {
                const dealer = (o.dealer || '').toLowerCase();
                const part = (o.part || '').toLowerCase();
                const description = (o.description || '').toLowerCase();
                
                return dealer.includes(term) || 
                       part.includes(term) || 
                       description.includes(term);
            });
            
            const start = (page - 1) * pageSize;
            const end = start + pageSize;
            const pageResults = results.slice(start, end);
            
            return {
                offers: pageResults,
                total: results.length,
                page: page,
                pageSize: pageSize,
                totalPages: Math.ceil(results.length / pageSize),
                searchTerm: searchTerm
            };
            
        } catch (error) {
            console.error('❌ Error searching offers:', error);
            return {
                offers: [],
                total: 0,
                page: 1,
                pageSize: pageSize,
                totalPages: 0,
                searchTerm: searchTerm
            };
        }
    }

    // ===================================================
    // GET STORAGE STATUS
    // ===================================================

    async function getStorageStatus() {
        try {
            const offers = await loadAllOffersFromDB();
            const dealers = await getAllDealersFromDB();
            
            return {
                offerCount: offers.length,
                dealerCount: dealers.length,
                hasData: offers.length > 0,
                dbName: DB_NAME,
                version: DB_VERSION
            };
        } catch (error) {
            return {
                offerCount: 0,
                dealerCount: 0,
                hasData: false,
                error: error.message
            };
        }
    }

    // ===================================================
    // CLEAR DATABASE
    // ===================================================

    async function clearDatabase() {
        console.log('🧹 Clearing entire database...');
        
        try {
            const db = await openDatabase();
            
            const stores = ['offers', 'dealers', 'metadata'];
            for (const storeName of stores) {
                const transaction = db.transaction([storeName], 'readwrite');
                const store = transaction.objectStore(storeName);
                store.clear();
                
                await new Promise((resolve, reject) => {
                    transaction.oncomplete = resolve;
                    transaction.onerror = reject;
                });
                
                console.log(`✅ Cleared store: ${storeName}`);
            }
            
            localStorage.removeItem('dealerList');
            localStorage.removeItem('dealerCount');
            
            console.log('✅ Database completely cleared');
            return { success: true };
            
        } catch (error) {
            console.error('❌ Error clearing database:', error);
            return { success: false, error: error.message };
        }
    }

    // ===================================================
    // CHECK IF DATA EXISTS
    // ===================================================

    async function hasData() {
        try {
            const status = await getStorageStatus();
            return status.hasData;
        } catch (error) {
            return false;
        }
    }

    // ===================================================
    // CHECK IF INDEXEDDB IS AVAILABLE
    // ===================================================

    function isIndexedDBAvailable() {
        return typeof indexedDB !== 'undefined';
    }

    // ===================================================
    // EXPORT FUNCTIONS
    // ===================================================

    window.DealerDB = {
        saveOffersToDB,
        loadAllOffersFromDB,
        loadOffersByDealer,
        getAllDealersFromDB,
        getDealerCountFromDB,
        getOfferCountFromDB,
        searchOffers,
        getStorageStatus,
        clearDatabase,
        hasData,
        isIndexedDBAvailable,
        openDatabase,
        normalizeDealerName
    };

    console.log('✅ Database Manager loaded');

})();
