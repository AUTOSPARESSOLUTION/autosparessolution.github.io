// access-control.js
// Role definitions
const ROLES = {
    ADMIN: 'admin',
    MANAGER: 'manager',
    STAFF: 'staff',
    CUSTOMER: 'customer'
};

// Permission mapping
const PERMISSIONS = {
    // Page permissions
    'invoice-stock.html': ['admin', 'manager', 'staff'],
    'proforma-invoice.html': ['admin', 'manager', 'staff'],
    'quotation.html': ['admin', 'manager', 'staff'],
    'payment-receipt.html': ['admin', 'manager', 'staff'],
    'sales-order.html': ['admin', 'manager', 'staff'],
    'inventory.html': ['admin', 'manager'],
    'stock-report.html': ['admin', 'manager'],
    'stock-adjustment.html': ['admin', 'manager'],
    'purchase-invoice-stock.html': ['admin', 'manager'],
    'orders.html': ['admin', 'manager', 'staff'],
    'customer-ledger.html': ['admin', 'manager', 'staff'],
    'supplier-ledger.html': ['admin', 'manager'],
    'edit-invoice.html': ['admin', 'manager'],
    'view-invoice.html': ['admin', 'manager', 'staff']
};

// Check if current user has access to a page
function hasAccess(page) {
    const currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
    if (!currentUser) return false;
    const userRole = currentUser.role || 'customer';
    const allowedRoles = PERMISSIONS[page] || ['customer'];
    return allowedRoles.includes(userRole);
}

// Redirect if no access
function checkAccess(page) {
    if (!hasAccess(page)) {
        alert('Access denied. You do not have permission to view this page.');
        window.location.href = 'index.html';
        return false;
    }
    return true;
}

// Get user role
function getUserRole() {
    const currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
    return currentUser ? (currentUser.role || 'customer') : null;
}

// Update navigation visibility based on role
function updateNavigationByRole() {
    const role = getUserRole();
    if (!role) return;
    
    // Hide/show menu items based on role
    const adminOnlyLinks = ['inventory.html', 'stock-report.html', 'stock-adjustment.html', 'purchase-invoice-stock.html', 'supplier-ledger.html', 'edit-invoice.html'];
    const managerOnlyLinks = ['sales-order.html'];
    
    adminOnlyLinks.forEach(link => {
        const elem = document.querySelector(`a[href="${link}"]`);
        if (elem) elem.style.display = role === 'admin' ? 'inline-flex' : 'none';
    });
    
    managerOnlyLinks.forEach(link => {
        const elem = document.querySelector(`a[href="${link}"]`);
        if (elem) elem.style.display = (role === 'admin' || role === 'manager') ? 'inline-flex' : 'none';
    });
}
