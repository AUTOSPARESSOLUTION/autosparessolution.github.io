// ============================================================
// 🔒 ACCESS CONTROL - Role-Based Permissions
// ============================================================

// ===== PERMISSIONS CONFIGURATION =====
const PERMISSIONS = {
    // ===== Masters =====
    'customer-master.html': ['admin', 'manager'],
    'supplier-master.html': ['admin', 'manager'],
    'product-master.html': ['admin', 'manager'],
    'merge-products.html': ['admin', 'manager'],
    
    // ===== Sales =====
    'quotation.html': ['admin', 'manager', 'staff'],
    'proforma-invoice.html': ['admin', 'manager', 'staff'],
    'sales-order.html': ['admin', 'manager', 'staff'],
    'sales-orders-list.html': ['admin', 'manager', 'staff'],
    'invoice-stock.html': ['admin', 'manager'],  // 🔒 Admin/Manager only
    'orders.html': ['admin', 'manager', 'staff'],
    
    // ===== Purchase =====
    'purchase-invoice.html': ['admin', 'manager'],
    'purchase-invoice-stock.html': ['admin', 'manager'],
    'purchase-invoice-list.html': ['admin', 'manager'],
    'purchase-orders.html': ['admin', 'manager'],
    
    // ===== Finance =====
    'payment-receipt.html': ['admin', 'manager', 'staff'],
    'payment-receipts-list.html': ['admin', 'manager', 'staff'],
    'supplier-payment.html': ['admin', 'manager'],
    
    // ===== Reports =====
    'customer-ledger.html': ['admin', 'manager', 'staff'],
    'supplier-ledger.html': ['admin', 'manager'],
    'stock-ledger.html': ['admin', 'manager'],
    'stock-report.html': ['admin', 'manager'],
    'ageing-report.html': ['admin', 'manager'],
    
    // ===== Inventory =====
    'inventory.html': ['admin', 'manager'],
    'product-selector.html': ['admin', 'manager', 'staff'],
    
    // ===== Distributors =====
    'distributor-stock-viewer.html': ['admin', 'manager'],  // 🔒 Admin/Manager only
    
    // ===== System =====
    'delete-invoice.html': ['admin', 'manager'],
    'backup-restore.html': ['admin', 'manager'],
    'import-system.html': ['admin', 'manager'],
    'quotation-list.html': ['admin', 'manager', 'staff'],
    'proforma-list.html': ['admin', 'manager', 'staff'],
    'quotation-upload.html': ['admin', 'manager'],
    
    // ===== Reports & GST =====
    'reports/sales-ledger.html': ['admin', 'manager'],
    'reports/purchase-ledger.html': ['admin', 'manager'],
    'reports/stock-ledger.html': ['admin', 'manager'],
    'reports/gst-register.html': ['admin', 'manager'],
    'reports/payment-register.html': ['admin', 'manager'],
    'reports/expense-entry.html': ['admin', 'manager'],
    'reports/expense-report.html': ['admin', 'manager'],
    'reports/trial-balance.html': ['admin', 'manager'],
    'reports/profit-loss.html': ['admin', 'manager'],
    'reports/balance-sheet.html': ['admin', 'manager'],
    'reports/customer-outstanding.html': ['admin', 'manager'],
    
    // ===== Admin Panel (Admin only) =====
    'admin/platform-fees.html': ['admin'],
    'admin/platform-settings.html': ['admin'],
    'admin/subscriptions.html': ['admin'],
    
    // ===== AI Intelligence =====
    'dealer-offers-dashboard.html': ['admin', 'manager'],  // 🔒 Admin/Manager only
    
    // ===== Dealer Portal =====
    'dealer/index.html': ['admin', 'manager', 'dealer', 'staff'],
    
    // ===== Info & Support (Public) =====
    'index.html': ['admin', 'manager', 'staff', 'dealer', 'customer', 'guest']
};

// ============================================================
// ROLE MANAGEMENT
// ============================================================

function getUserRole() {
    const currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
    if (!currentUser) return 'guest';
    
    // Check if user is admin (by email)
    if (currentUser.email === 'dipankar@autosparessolution.com') {
        return 'admin';
    }
    
    return currentUser.role || 'customer';
}

function getCurrentUser() {
    return JSON.parse(localStorage.getItem('currentUser') || 'null');
}

function isAdmin() {
    const user = getCurrentUser();
    return user && user.email === 'dipankar@autosparessolution.com';
}

// ============================================================
// PERMISSION CHECKS
// ============================================================

function hasAccess(page) {
    const role = getUserRole();
    const allowed = PERMISSIONS[page] || ['guest'];
    return allowed.includes(role);
}

function checkAccess(page) {
    if (!hasAccess(page)) {
        alert('🔒 Access denied. You do not have permission to view this page.');
        window.location.href = 'index.html';
        return false;
    }
    return true;
}

// ============================================================
// NAVIGATION UPDATER (For sidebar menus)
// ============================================================

function updateNavigationByRole() {
    const role = getUserRole();
    const isAdminUser = isAdmin();
    
    console.log('🔒 Updating navigation for role:', role);
    
    // ===== Admin-Only Menu Items (Hidden from non-admin) =====
    const adminOnlyItems = [
        'invoice-stock.html',           // Invoice (Stock)
        'distributor-stock-viewer.html', // Distributor Stock List
        'dealer-offers-dashboard.html'   // Dealer Offers & Intelligence
    ];
    
    // ===== Get all navigation links =====
    const allNavLinks = document.querySelectorAll('.nav-link');
    
    allNavLinks.forEach(link => {
        const href = link.getAttribute('href');
        if (!href) return;
        
        // Check if this is an admin-only link
        const isAdminOnly = adminOnlyItems.some(item => href.includes(item));
        
        if (isAdminOnly) {
            // 🔒 Admin only - only show for admin
            if (role === 'admin' || isAdminUser) {
                link.style.display = 'flex';
            } else {
                link.style.display = 'none';
            }
        } else {
            // All other links: Always visible (including ERP)
            link.style.display = 'flex';
        }
    });
    
    // ===== Hide empty groups =====
    document.querySelectorAll('.nav-group').forEach(group => {
        const visibleLinks = group.querySelectorAll('.nav-link[style*="display: flex"]');
        const groupTitle = group.querySelector('.group-title');
        if (visibleLinks.length === 0 && groupTitle) {
            groupTitle.style.display = 'none';
        } else if (groupTitle) {
            groupTitle.style.display = 'block';
        }
    });
    
    // ===== Admin Panel visibility =====
    const adminNavGroup = document.getElementById('adminNavGroup');
    if (adminNavGroup) {
        if (role === 'admin' || isAdminUser) {
            adminNavGroup.style.display = 'block';
        } else {
            adminNavGroup.style.display = 'none';
        }
    }
    
    console.log('🔒 Navigation updated for role:', role);
}

// ============================================================
// INITIALIZATION
// ============================================================

// Run on page load
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(updateNavigationByRole, 200);
});

// Run after login
function refreshNavigation() {
    setTimeout(updateNavigationByRole, 300);
}

// ============================================================
// EXPOSE FUNCTIONS GLOBALLY
// ============================================================

window.updateNavigationByRole = updateNavigationByRole;
window.hasAccess = hasAccess;
window.checkAccess = checkAccess;
window.getUserRole = getUserRole;
window.getCurrentUser = getCurrentUser;
window.isAdmin = isAdmin;
window.refreshNavigation = refreshNavigation;

console.log('🔒 Access Control loaded');
console.log('📋 Admin-Only Menus: Invoice(Stock), Distributor Stock, Dealer Intelligence');
console.log('👤 Current role:', getUserRole());
