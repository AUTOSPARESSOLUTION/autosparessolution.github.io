// This function works alongside your existing addToCart (no conflict)
function aiAddToCart(part, price, qty) {
    // Use the global carts object and getCurrentDocType if available
    const docType = (typeof getCurrentDocType === 'function') ? getCurrentDocType() : 'invoice';
    const product = window.allProducts ? window.allProducts.find(p => p.part === part) : null;
    if (!product) {
        aiShowToast(`Product ${part} not found`, true);
        return;
    }
    const existing = window.carts[docType].find(i => i.part === part);
    if (existing) {
        existing.qty += qty;
    } else {
        window.carts[docType].push({
            part: part,
            desc: product.desc || part,
            price: price || product.price || 0,
            qty: qty,
            hsn: product.hsn || '',
            discount: 0
        });
    }
    if (typeof updateCartUI === 'function') updateCartUI();
}
