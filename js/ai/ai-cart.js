function aiAddToCart(part, price, qty) {
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
