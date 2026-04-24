// access-control.js
const PERMISSIONS = {
    'invoice-stock.html': ['admin', 'manager', 'staff'],
    'proforma-invoice.html': ['admin', 'manager', 'staff'],
    'quotation.html': ['admin', 'manager', 'staff'],
    'payment-receipt.html': ['admin', 'manager', 'staff'],
    'sales-order.html': ['admin', 'manager', 'staff'],
    'inventory.html': ['admin', 'manager'],
    'stock-report.html': ['admin', 'manager'],
    'purchase-invoice-stock.html': ['admin', 'manager'],
    'orders.html': ['admin', 'manager', 'staff'],
    'customer-ledger.html': ['admin', 'manager', 'staff'],
    'supplier-ledger.html': ['admin', 'manager'],
    'edit-invoice.html': ['admin', 'manager']
};

function getUserRole() {
    const currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
    return currentUser ? (currentUser.role || 'customer') : null;
}

function hasAccess(page) {
    const role = getUserRole();
    if (!role) return false;
    const allowed = PERMISSIONS[page] || ['customer'];
    return allowed.includes(role);
}

function checkAccess(page) {
    if (!hasAccess(page)) {
        alert('Access denied. You do not have permission to view this page.');
        window.location.href = 'index.html';
        return false;
    }
    return true;
}

function updateNavigationByRole() {
    const role = getUserRole();
    
    // Define which links to show/hide
    const adminOnly = ['inventory.html', 'stock-report.html', 'purchase-invoice-stock.html', 'supplier-ledger.html', 'edit-invoice.html'];
    const managerOnly = ['sales-order.html'];
    const staffOnly = ['orders.html', 'customer-ledger.html'];
    
    // Hide all admin/manager/staff links first
    const allLinks = [...adminOnly, ...managerOnly, ...staffOnly];
    allLinks.forEach(link => {
        const elem = document.querySelector(`nav a[href="${link}"]`);
        if (elem) elem.style.display = 'none';
    });
    
    // Show based on role
    if (role === 'admin') {
        allLinks.forEach(link => {
            const elem = document.querySelector(`nav a[href="${link}"]`);
            if (elem) elem.style.display = 'inline-flex';
        });
    } else if (role === 'manager') {
        [...managerOnly, ...staffOnly].forEach(link => {
            const elem = document.querySelector(`nav a[href="${link}"]`);
            if (elem) elem.style.display = 'inline-flex';
        });
    } else if (role === 'staff') {
        staffOnly.forEach(link => {
            const elem = document.querySelector(`nav a[href="${link}"]`);
            if (elem) elem.style.display = 'inline-flex';
        });
    }
        }
