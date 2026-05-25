// ai-review-modal.js – works with your existing modal IDs
let lastScannedMatches = [];

function showReviewModal(matches) {
    console.log("showReviewModal called", matches);
    lastScannedMatches = matches.map(m => ({
        ...m,
        selected: m.product !== null && m.confidence >= 70,
        editedQty: m.qty,
        editedProduct: m.product
    }));
    renderReviewTable();
    const modal = document.getElementById('aiReviewModal');
    if (modal) {
        modal.style.display = 'block';
        if (window.AI_AUTO_SCROLL_TO_MODAL) {
            modal.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    } else {
        console.error("Modal not found");
    }
}

function renderReviewTable() {
    const container = document.getElementById('reviewTableContainer');
    if (!container) {
        console.error("reviewTableContainer not found");
        return;
    }
    let html = `<table style="width:100%; border-collapse:collapse; background:#1e293b; color:#e2e8f0;">
        <thead><tr style="background:#0f172a;">
            <th>✓</th><th>Part Number</th>
            <th>Matched Product</th>
            <th>Qty</th>
            <th>Confidence</th><th>Price</th>
          </tr></thead><tbody id="reviewTbody"></tbody>
     </table>`;
    container.innerHTML = html;
    const tbody = document.getElementById('reviewTbody');
    for (let i = 0; i < lastScannedMatches.length; i++) {
        const m = lastScannedMatches[i];
        const row = tbody.insertRow();
        // Checkbox
        const chkCell = row.insertCell(0);
        const chk = document.createElement('input');
        chk.type = 'checkbox';
        chk.checked = m.selected;
        chk.addEventListener('change', (e) => { m.selected = e.target.checked; });
        chkCell.appendChild(chk);
        // Part Number
        const partCell = row.insertCell(1);
        partCell.textContent = m.product ? m.product.part : (m.partRaw || '?');
        // Matched Product description
        const prodCell = row.insertCell(2);
        prodCell.textContent = m.product ? `${m.product.part} - ${m.product.desc.substring(0,40)}` : 'Not found';
        // Quantity input
        const qtyCell = row.insertCell(3);
        const qtyInput = document.createElement('input');
        qtyInput.type = 'number';
        qtyInput.value = m.editedQty;
        qtyInput.min = 1;
        qtyInput.style.width = '70px';
        qtyInput.style.padding = '4px';
        qtyInput.addEventListener('change', (e) => {
            m.editedQty = parseInt(e.target.value) || 1;
        });
        qtyCell.appendChild(qtyInput);
        // Confidence
        const confCell = row.insertCell(4);
        confCell.textContent = `${m.confidence}%`;
        // Price
        const priceCell = row.insertCell(5);
        priceCell.textContent = m.product ? `₹${m.product.price.toFixed(2)}` : '-';
    }
}

function confirmAddScannedItems() {
    let added = 0;
    for (const m of lastScannedMatches) {
        if (m.selected && m.editedProduct && m.editedQty > 0) {
            if (typeof window.aiAddToCart === 'function') {
                window.aiAddToCart(m.editedProduct.part, m.editedProduct.price, m.editedQty);
            } else if (typeof addToCart === 'function') {
                addToCart(m.editedProduct.part, m.editedProduct.price);
            }
            added++;
        }
    }
    if (added > 0) {
        if (typeof updateCartUI === 'function') updateCartUI();
        aiShowToast(`✅ ${added} item(s) added to cart`);
    } else {
        aiShowToast('No valid items selected', true);
    }
    document.getElementById('aiReviewModal').style.display = 'none';
}

function bindModalEvents() {
    const closeBtn = document.getElementById('closeReviewModal');
    const cancelBtn = document.getElementById('cancelScanBtn');
    const selectAllBtn = document.getElementById('selectAllScanBtn');
    const confirmBtn = document.getElementById('confirmScanAddBtn');
    if (closeBtn) closeBtn.onclick = () => document.getElementById('aiReviewModal').style.display = 'none';
    if (cancelBtn) cancelBtn.onclick = () => document.getElementById('aiReviewModal').style.display = 'none';
    if (selectAllBtn) {
        selectAllBtn.onclick = () => {
            for (let i = 0; i < lastScannedMatches.length; i++) {
                if (lastScannedMatches[i].editedProduct) lastScannedMatches[i].selected = true;
            }
            renderReviewTable();
        };
    }
    if (confirmBtn) confirmBtn.onclick = confirmAddScannedItems;
    window.onclick = (e) => {
        const modal = document.getElementById('aiReviewModal');
        if (e.target === modal) modal.style.display = 'none';
    };
}

// Global exposure
window.showReviewModal = showReviewModal;
window.confirmAddScannedItems = confirmAddScannedItems;
window.bindModalEvents = bindModalEvents;
