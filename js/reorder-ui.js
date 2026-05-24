function addReorderBadges() {
    if (!window.currentUser) return;
    const freqParts = getOrderedPartsFrequency();
    const frequentPartSet = new Set(freqParts.slice(0, 10).map(p => p.part));
    document.querySelectorAll('.card').forEach(card => {
        const part = card.getAttribute('data-part');
        if (frequentPartSet.has(part)) {
            if (card.querySelector('.reorder-badge')) return;
            const badge = document.createElement('div');
            badge.className = 'reorder-badge';
            badge.innerHTML = '<i class="fas fa-history"></i> Previously ordered';
            badge.style.cssText = 'position:absolute; bottom:10px; right:10px; background:#4CAF50; color:white; padding:4px 8px; border-radius:20px; font-size:0.7rem; z-index:5;';
            card.appendChild(badge);
        }
    });
}

function createHistoryPanel() {
    const history = loadOrderHistory();
    if (history.length === 0) return '<div class="empty-history">No past orders found.</div>';
    let html = `<div class="history-list" style="max-height:300px; overflow-y:auto;">`;
    for (const order of history.slice(0, 5)) {
        html += `<div class="history-order" style="background:rgba(0,0,0,0.3); margin-bottom:10px; padding:8px; border-radius:6px;">`;
        html += `<div><strong>${new Date(order.date).toLocaleDateString()}</strong> (${order.docType})</div>`;
        html += `<div style="font-size:0.85rem;">${order.items.map(i => `${i.part} x${i.qty}`).join(', ')}</div>`;
        html += `<button class="btn btn-sm reorder-btn" data-order-id="${order.id}" style="background:#facc15; margin-top:5px; padding:4px 8px; color:#0f172a;">↻ Reorder All</button>`;
        html += `</div>`;
    }
    html += `</div>`;
    return html;
}

function reorderSavedOrder(orderId) {
    const history = loadOrderHistory();
    const order = history.find(o => o.id == orderId);
    if (!order) return;
    const docType = (typeof getCurrentDocType === 'function') ? getCurrentDocType() : 'invoice';
    for (const item of order.items) {
        if (typeof aiAddToCart === 'function') {
            aiAddToCart(item.part, item.price, item.qty);
        } else if (typeof addToCart === 'function') {
            addToCart(item.part, item.price);
        }
    }
    if (typeof updateCartUI === 'function') updateCartUI();
    aiShowToast(`Re-added ${order.items.length} items to ${docType} cart`);
}

function injectHistoryPanel() {
    const userPanel = document.getElementById('user-panel');
    if (!userPanel) return;
    let container = document.getElementById('dealer-history-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'dealer-history-container';
        container.style.marginTop = '20px';
        container.style.borderTop = '1px solid #444';
        container.style.paddingTop = '15px';
        userPanel.appendChild(container);
    }
    if (window.currentUser) {
        container.innerHTML = `<h4><i class="fas fa-history"></i> Recent Orders</h4>${createHistoryPanel()}`;
        document.querySelectorAll('.reorder-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const orderId = btn.getAttribute('data-order-id');
                reorderSavedOrder(orderId);
            });
        });
    } else {
        container.innerHTML = '<p>Login to see order history.</p>';
    }
}

if (typeof displayProducts === 'function') {
    const originalDisplay = displayProducts;
    window.displayProducts = function() {
        originalDisplay();
        addReorderBadges();
    };
}
if (typeof showUserProfile === 'function') {
    const originalProfile = showUserProfile;
    window.showUserProfile = function() {
        originalProfile();
        injectHistoryPanel();
        addReorderBadges();
    };
}
if (typeof logout === 'function') {
    const originalLogout = logout;
    window.logout = function() {
        originalLogout();
        const container = document.getElementById('dealer-history-container');
        if (container) container.innerHTML = '<p>Login to see order history.</p>';
        addReorderBadges();
    };
}
if (window.currentUser) {
    setTimeout(() => {
        injectHistoryPanel();
        addReorderBadges();
    }, 1000);
}
