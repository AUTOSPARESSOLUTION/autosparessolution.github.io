const ORDER_HISTORY_KEY = 'dealer_order_history';

function saveCurrentOrderToHistory(docType) {
    if (!window.currentUser || !window.currentUser.email) return;
    const activeCart = window.carts[docType];
    if (!activeCart || activeCart.length === 0) return;
    const history = loadOrderHistory();
    const newOrder = {
        id: Date.now(),
        date: new Date().toISOString(),
        docType: docType,
        items: activeCart.map(item => ({
            part: item.part,
            qty: item.qty,
            price: item.price,
            desc: item.desc
        }))
    };
    history.unshift(newOrder);
    if (history.length > 50) history.pop();
    saveOrderHistory(history);
}

function loadOrderHistory() {
    if (!window.currentUser) return [];
    const key = `${ORDER_HISTORY_KEY}_${window.currentUser.email}`;
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : [];
}

function saveOrderHistory(history) {
    if (!window.currentUser) return;
    const key = `${ORDER_HISTORY_KEY}_${window.currentUser.email}`;
    localStorage.setItem(key, JSON.stringify(history));
}

function getOrderedPartsFrequency() {
    const history = loadOrderHistory();
    const freq = new Map();
    for (const order of history) {
        for (const item of order.items) {
            const product = window.allProducts ? window.allProducts.find(p => p.part === item.part) : null;
            if (!product) continue;
            if (!freq.has(item.part)) {
                freq.set(item.part, {
                    part: item.part,
                    totalQty: 0,
                    lastOrderDate: order.date,
                    product: product
                });
            }
            const entry = freq.get(item.part);
            entry.totalQty += item.qty;
            if (new Date(order.date) > new Date(entry.lastOrderDate)) {
                entry.lastOrderDate = order.date;
            }
        }
    }
    return Array.from(freq.values()).sort((a,b) => new Date(b.lastOrderDate) - new Date(a.lastOrderDate));
}

if (typeof window.generateDocument === 'function') {
    const originalGenerateDocument = window.generateDocument;
    window.generateDocument = function() {
        const docType = (typeof getCurrentDocType === 'function') ? getCurrentDocType() : 'invoice';
        const activeCart = window.carts[docType];
        if (activeCart && activeCart.length > 0 && window.currentUser) {
            saveCurrentOrderToHistory(docType);
        }
        originalGenerateDocument();
    };
}
