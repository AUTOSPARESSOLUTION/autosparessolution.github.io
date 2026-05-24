// ai-review-modal.js – editable review table with dropdown product selection
let lastScannedMatches = [];

function showReviewModal(matches) {
    console.log("showReviewModal called with", matches.length, "matches");
    lastScannedMatches = matches.map(m => ({
        ...m,
        selected: m.product !== null && m.confidence >= 70,
        editedPart: m.product ? m.product.part : (m.partRaw || ''),
        editedQty: m.qty,
        editedProduct: m.product || null
    }));
    renderReviewTable();
    const modal = document.getElementById('aiReviewModal');
    if (modal) {
        modal.style.display = 'block';
        if (window.AI_AUTO_SCROLL_TO_MODAL) {
            modal.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    } else {
        console.error("Modal element #aiReviewModal not found");
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
            <th>✓</th><th>Part Number<br><small>(click to edit)</small></th>
            <th>Matched Product<br><small>(click dropdown)</small></th>
            <th>Qty<br><small>(click to edit)</small></th>
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
        // Part Number (editable)
        const partCell = row.insertCell(1);
        const partInput = document.createElement('input');
        partInput.type = 'text';
        partInput.value = m.editedPart;
        partInput.style.width = '100%';
        partInput.style.background = '#0f172a';
        partInput.style.color = '#e2e8f0';
        partInput.style.border = '1px solid #facc15';
        partInput.style.borderRadius = '4px';
        partInput.style.padding = '4px';
        partInput.addEventListener('change', (e) => {
            m.editedPart = e.target.value.toUpperCase();
            // Try to find product by this part number
            const product = findProductByPart(m.editedPart);
            if (product) {
                m.editedProduct = product;
                m.confidence = 100;
                // Update dropdown and price
                updateProductDropdown(row.cells[2], m, i);
                row.cells[5].innerHTML = `₹${product.price.toFixed(2)}`;
            } else {
                m.editedProduct = null;
                m.confidence = 0;
                updateProductDropdown(row.cells[2], m, i);
                row.cells[5].innerHTML = '-';
            }
        });
        partCell.appendChild(partInput);
        // Product dropdown
        const prodCell = row.insertCell(2);
        const prodSelect = document.createElement('select');
        prodSelect.style.width = '100%';
        prodSelect.style.background = '#0f172a';
        prodSelect.style.color = '#e2e8f0';
        prodSelect.style.border = '1px solid #facc15';
        prodSelect.style.borderRadius = '4px';
        prodSelect.style.padding = '4px';
        function populateProductDropdown(select, currentProduct, searchPart) {
            select.innerHTML = '';
            let options = [];
            if (searchPart && window.allProducts) {
                options = window.allProducts.filter(p => p.part.toLowerCase().includes(searchPart.toLowerCase()));
            }
            if (options.length === 0 && window.allProducts) {
                options = window.allProducts.slice(0, 20);
            }
            for (const prod of options) {
                const opt = document.createElement('option');
                opt.value = prod.part;
                opt.textContent = `${prod.part} - ${prod.desc.substring(0,40)}`;
                if (currentProduct && prod.part === currentProduct.part) opt.selected = true;
                select.appendChild(opt);
            }
            if (options.length === 0) {
                const opt = document.createElement('option');
                opt.textContent = 'No products available';
                select.appendChild(opt);
            }
        }
        populateProductDropdown(prodSelect, m.editedProduct, m.editedPart);
        prodSelect.addEventListener('change', (e) => {
            const selectedPart = e.target.value;
            const product = window.allProducts.find(p => p.part === selectedPart);
            if (product) {
                m.editedProduct = product;
                m.confidence = 100;
                partInput.value = product.part;
                m.editedPart = product.part;
                row.cells[5].innerHTML = `₹${product.price.toFixed(2)}`;
            }
        });
        prodCell.appendChild(prodSelect);
        // Quantity (editable)
        const qtyCell = row.insertCell(3);
        const qtyInput = document.createElement('input');
        qtyInput.type = 'number';
        qtyInput.value = m.editedQty;
        qtyInput.min = 1;
        qtyInput.style.width = '80px';
        qtyInput.style.background = '#0f172a';
        qtyInput.style.color = '#e2e8f0';
        qtyInput.style.border = '1px solid #facc15';
        qtyInput.style.borderRadius = '4px';
        qtyInput.style.padding = '4px';
        qtyInput.addEventListener('change', (e) => {
            m.editedQty = parseInt(e.target.value) || 1;
        });
        qtyCell.appendChild(qtyInput);
        // Confidence
        const confCell = row.insertCell(4);
        const confSpan = document.createElement('span');
        const confClass = m.confidence >= 90 ? 'high-conf' : (m.confidence >= 70 ? 'mid-conf' : 'low-conf');
        confSpan.className = `badge ${confClass}`;
        confSpan.textContent = `${m.confidence}%`;
        confCell.appendChild(confSpan);
        // Price
        const priceCell = row.insertCell(5);
        priceCell.innerHTML = m.editedProduct ? `₹${m.editedProduct.price.toFixed(2)}` : '-';
    }
}

function findProductByPart(part) {
    if (!window.allProducts) return null;
    const norm = normalizePart(part);
    return window.allProducts.find(p => normalizePart(p.part) === norm);
}

function updateProductDropdown(cell, match, idx) {
    // Not needed if we replace the whole dropdown; handled inside populateProductDropdown
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
