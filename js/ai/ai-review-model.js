let lastScannedMatches = [];

function showReviewModal(matches) {
    lastScannedMatches = matches.map(m => ({
        ...m,
        selected: m.product !== null && m.confidence >= 70
    }));
    renderReviewTable();
    const modal = document.getElementById('aiReviewModal');
    if (modal) {
        modal.style.display = 'block';
        if (window.AI_AUTO_SCROLL_TO_MODAL) {
            modal.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }
}

function renderReviewTable() {
    const container = document.getElementById('reviewTableContainer');
    if (!container) return;
    let html = `<table style="width:100%; border-collapse:collapse; background:#1e293b; color:#e2e8f0;">
        <thead><tr style="background:#0f172a;">
            <th>✓</th><th>Raw Part</th><th>Matched Product</th><th>Qty</th><th>Confidence</th><th>Price</th>
        </tr></thead><tbody>`;
    for (let i = 0; i < lastScannedMatches.length; i++) {
        const m = lastScannedMatches[i];
        if (!m.product) {
            html += `<tr>
                <td><input type="checkbox" disabled></td>
                <td>${escapeHtml(m.partRaw)}</td>
                <td colspan="4" style="color:#f87171;">❌ Not found</td>
            </tr>`;
        } else {
            const checked = m.selected ? 'checked' : '';
            const confClass = m.confidence >= 90 ? 'high-conf' : (m.confidence >= 70 ? 'mid-conf' : 'low-conf');
            html += `<tr>
                <td><input type="checkbox" data-index="${i}" ${checked}></td>
                <td>${escapeHtml(m.partRaw)}</td>
                <td><strong>${escapeHtml(m.product.part)}</strong><br><small>${escapeHtml(m.product.desc.substring(0,50))}</small></td>
                <td>${m.qty}</td>
                <td><span class="badge ${confClass}">${m.confidence}%</span></td>
                <td>₹${(m.product.price || 0).toFixed(2)}</td>
            </tr>`;
        }
    }
    html += `</tbody></table>`;
    container.innerHTML = html;
    // attach checkbox events
    document.querySelectorAll('#reviewTableContainer input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', (e) => {
            const idx = parseInt(e.target.dataset.index);
            if (!isNaN(idx)) lastScannedMatches[idx].selected = e.target.checked;
        });
    });
}

function confirmAddScannedItems() {
    let added = 0;
    for (const m of lastScannedMatches) {
        if (m.selected && m.product) {
            aiAddToCart(m.product.part, m.product.price, m.qty);
            added++;
        }
    }
    if (added > 0) {
        aiShowToast(`✅ ${added} item(s) added to ${getCurrentDocType ? getCurrentDocType() : 'invoice'} cart`);
        if (typeof updateCartUI === 'function') updateCartUI();
    } else {
        aiShowToast('No items selected', true);
    }
    document.getElementById('aiReviewModal').style.display = 'none';
}

// Modal close handlers (to be bound after DOM ready)
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
                if (lastScannedMatches[i].product) lastScannedMatches[i].selected = true;
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
