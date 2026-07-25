// ============================================================
// 📄 INVOICE MODULE - Complete with GitHub Images
// ============================================================

const fs = require('fs');
const path = require('path');

const INVOICE_CONFIG = {
    companyName: process.env.COMPANY_NAME || 'Auto Spares Solution',
    gstin: process.env.GSTIN || '19ANOPD3300R1ZO',
    address: process.env.COMPANY_ADDRESS || '101, 1st floor, 57/5, Q Road, Howrah, WB 711108',
    phone: process.env.COMPANY_PHONE || '9830300193',
    email: process.env.COMPANY_EMAIL || 'ass08@uboi',
    bankName: process.env.BANK_NAME || 'Union Bank of India',
    accountNumber: process.env.ACCOUNT_NUMBER || '021111100007383',
    ifsc: process.env.IFSC || 'UBINO802115',
    upiId: process.env.UPI_ID || 'ass08@uboi',
    invoiceDir: path.join(__dirname, '../invoices'),
    dataFile: path.join(__dirname, '../invoices/invoice-data.json'),
    logoPath: 'https://raw.githubusercontent.com/AUTOSPARESSOLUTION/autosparessolution.github.io/main/images/ASS.jpg',
    qrPath: 'https://raw.githubusercontent.com/AUTOSPARESSOLUTION/autosparessolution.github.io/main/images/ASS.QR.jpg'
};

if (!fs.existsSync(INVOICE_CONFIG.invoiceDir)) {
    fs.mkdirSync(INVOICE_CONFIG.invoiceDir, { recursive: true });
}

function getFinancialYear() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    if (month >= 4) return `${year}-${(year+1).toString().slice(-2)}`;
    else return `${year-1}-${year.toString().slice(-2)}`;
}

function getCashBillPrefix() {
    return `ASS/${getFinancialYear()}/CH/`;
}

function getCreditBillPrefix() {
    return `ASS/${getFinancialYear()}/`;
}

function loadInvoiceData() {
    try {
        if (fs.existsSync(INVOICE_CONFIG.dataFile)) {
            return JSON.parse(fs.readFileSync(INVOICE_CONFIG.dataFile, 'utf8'));
        }
    } catch (error) {}
    return {
        allInvoices: [],
        salesInvoices: [],
        customers: [],
        lastCashNumber: 3,
        lastCreditNumber: 0,
        lastUpdated: new Date().toISOString()
    };
}

function saveInvoiceData(data) {
    data.lastUpdated = new Date().toISOString();
    fs.writeFileSync(INVOICE_CONFIG.dataFile, JSON.stringify(data, null, 2));
    return data;
}

function getMaxCashBillNumber() {
    const data = loadInvoiceData();
    const prefix = getCashBillPrefix();
    let maxNumber = data.lastCashNumber || 0;
    if (data.allInvoices) {
        for (const inv of data.allInvoices) {
            if (inv.invoiceType === 'cash' && inv.invoiceNo && inv.invoiceNo.startsWith(prefix)) {
                const match = inv.invoiceNo.match(/(\d+)$/);
                if (match) { const num = parseInt(match[1]); if (num > maxNumber) maxNumber = num; }
            }
        }
    }
    return maxNumber;
}

function getMaxCreditBillNumber() {
    const data = loadInvoiceData();
    const prefix = getCreditBillPrefix();
    let maxNumber = data.lastCreditNumber || 0;
    if (data.allInvoices) {
        for (const inv of data.allInvoices) {
            if (inv.invoiceType === 'credit' && inv.invoiceNo && inv.invoiceNo.startsWith(prefix)) {
                const match = inv.invoiceNo.match(/(\d+)$/);
                if (match) { const num = parseInt(match[1]); if (num > maxNumber) maxNumber = num; }
            }
        }
    }
    return maxNumber;
}

function getNextCashBillNumber() {
    const maxNum = getMaxCashBillNumber();
    let nextNumber = maxNum + 1;
    if (nextNumber < 4) nextNumber = 4;
    return getCashBillPrefix() + nextNumber.toString().padStart(3, '0');
}

function getNextCreditBillNumber() {
    const maxNum = getMaxCreditBillNumber();
    let nextNumber = maxNum + 1;
    if (nextNumber < 1) nextNumber = 1;
    return getCreditBillPrefix() + nextNumber.toString().padStart(4, '0');
}

function getNextNumbers() {
    return { cash: getNextCashBillNumber(), credit: getNextCreditBillNumber() };
}

function generateInvoiceHTML(invoiceData) {
    const { orderId, items, total, customer, orderDate, invoiceNo } = invoiceData;
    const subtotal = total / 1.18;
    const cgst = subtotal * 0.09;
    const sgst = subtotal * 0.09;
    const roundOff = Math.round(total) - total;
    const grandTotal = Math.round(total);
    const invoiceDate = new Date(orderDate || Date.now()).toLocaleDateString('en-IN');
    const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('en-IN');

    let itemsHtml = '';
    items.forEach((item, index) => {
        const price = item.price || 0;
        const qty = item.qty || 1;
        const taxable = price * qty;
        const itemCgst = taxable * 0.09;
        const itemSgst = taxable * 0.09;
        const itemTotal = taxable + itemCgst + itemSgst;
        itemsHtml += `<tr><td style="text-align:center;">${index+1}</td><td>${item.part||''}</td><td>${item.description||''}</td><td>${item.hsn||'N/A'}</td><td style="text-align:center;">pc</td><td style="text-align:center;">${qty}</td><td style="text-align:right;">₹${price.toFixed(2)}</td><td style="text-align:center;">0%</td><td style="text-align:right;">₹${taxable.toFixed(2)}</td><td style="text-align:center;">18%</td><td style="text-align:right;">₹${itemCgst.toFixed(2)}</td><td style="text-align:right;">₹${itemSgst.toFixed(2)}</td><td style="text-align:right;">₹${itemTotal.toFixed(2)}</td></tr>`;
    });

    return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Invoice ${invoiceNo}</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;background:#e9ecef;padding:20px}.invoice-container{max-width:1100px;margin:0 auto;background:#fff;border-radius:12px;box-shadow:0 10px 25px rgba(0,0,0,0.1);padding:20px;border:1px solid #dee2e6}
@media print{body{background:#fff;padding:0;margin:0}.invoice-container{box-shadow:none;border-radius:0;padding:15px;border:none}.actions{display:none!important}}
.company-header{background:#0a7c71;color:#fff;padding:15px 20px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;margin:-20px -20px 15px -20px;border-radius:12px 12px 0 0}
.company-details{display:flex;flex-direction:column;align-items:flex-start}.company-details img{height:50px;margin-bottom:5px}.company-details h1{margin:0;font-size:20px}.company-details p{margin:1px 0;font-size:11px;opacity:.9}
.invoice-title{text-align:right}.invoice-title h2{margin:0;font-size:18px}.invoice-title p{margin:3px 0;font-size:12px}
.info-box{background:#f8f9fa;border-radius:6px;padding:10px;margin-bottom:10px}.info-box h3{margin:0 0 6px 0;font-size:13px;color:#0a7c71;border-bottom:1px solid #dee2e6;padding-bottom:4px}
.info-row{display:flex;margin-bottom:3px;font-size:12px}.info-label{width:100px;font-weight:600;color:#555}.info-value{flex:1;color:#333}
.items-table{width:100%;border-collapse:collapse;margin:10px 0;font-size:11px}.items-table th,.items-table td{border:1px solid #dee2e6;padding:4px 3px;text-align:left;word-wrap:break-word}.items-table th{background:#f8f9fa;font-weight:600}
.totals{text-align:right;margin-top:10px;font-size:12px}.totals table{width:280px;margin-left:auto}.totals td{border:none;padding:2px}
.qr-box{background:#f8f9fa;border-radius:6px;padding:10px;margin:10px 0;border:1px solid #dee2e6;display:flex;flex-wrap:wrap;gap:20px;align-items:center}.qr-box img{max-width:100px;height:auto}
.signature-row{display:flex;justify-content:space-between;margin-top:15px;gap:15px}.signature-box{text-align:center;width:45%;border-top:1px solid #333;padding-top:8px}
.footer-legal{font-size:9px;text-align:center;margin-top:10px;color:#555;border-top:1px solid #dee2e6;padding-top:8px}
.actions{margin-top:20px;display:flex;gap:10px;justify-content:flex-end}.actions button{background:#0a7c71;color:#fff;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-size:13px}.actions button:hover{background:#09645a}
.bank-details{font-size:11px;line-height:1.6}.bank-details strong{color:#0a7c71}.status-badge{display:inline-block;padding:2px 10px;border-radius:12px;font-size:11px;font-weight:600}.status-paid{background:#d4edda;color:#155724}
</style></head>
<body>
<div class="invoice-container">
<div class="company-header">
<div class="company-details">
<img src="${INVOICE_CONFIG.logoPath}" alt="Logo" onerror="this.style.display='none'">
<h1>${INVOICE_CONFIG.companyName}</h1>
<p>GSTIN: ${INVOICE_CONFIG.gstin}</p>
<p>${INVOICE_CONFIG.address}</p>
<p>📞 ${INVOICE_CONFIG.phone} | 📧 ${INVOICE_CONFIG.email}</p>
</div>
<div class="invoice-title">
<h2>TAX INVOICE</h2>
<p><strong>Invoice No:</strong> ${invoiceNo}</p>
<p><strong>Date:</strong> ${invoiceDate}</p>
<p><strong>Due Date:</strong> ${dueDate}</p>
<p><span class="status-badge status-paid">PAID</span></p>
</div>
</div>

<div style="display:flex;gap:15px;flex-wrap:wrap;">
<div style="flex:1;">
<div class="info-box"><h3>Buyer (Bill to)</h3>
<div class="info-row"><div class="info-label">Name:</div><div class="info-value">${customer.name||'N/A'}</div></div>
<div class="info-row"><div class="info-label">Address:</div><div class="info-value">${customer.address||'N/A'}</div></div>
<div class="info-row"><div class="info-label">Phone:</div><div class="info-value">${customer.phone||'N/A'}</div></div>
<div class="info-row"><div class="info-label">Email:</div><div class="info-value">${customer.email||'N/A'}</div></div>
<div class="info-row"><div class="info-label">GSTIN/PAN:</div><div class="info-value">${customer.gstin||'N/A'}</div></div>
</div>
</div>
<div style="flex:1;">
<div class="info-box"><h3>Order Details</h3>
<div class="info-row"><div class="info-label">Order ID:</div><div class="info-value">${orderId}</div></div>
<div class="info-row"><div class="info-label">Payment Method:</div><div class="info-value">UPI / Bank Transfer</div></div>
<div class="info-row"><div class="info-label">Order Date:</div><div class="info-value">${new Date(orderDate||Date.now()).toLocaleDateString('en-IN')}</div></div>
</div>
</div>
</div>

<table class="items-table"><thead><tr><th>#</th><th>Part No</th><th>Description</th><th>HSN/SAC</th><th>UOM</th><th>Qty</th><th>Unit Price (₹)</th><th>Disc %</th><th>Taxable (₹)</th><th>GST%</th><th>CGST (₹)</th><th>SGST (₹)</th><th>Total (₹)</th></tr></thead><tbody>${itemsHtml}</tbody></table>

<div class="totals">
<table>
<tr><td style="text-align:right;">Subtotal:</td><td style="text-align:right;">₹${subtotal.toFixed(2)}</td></tr>
<tr><td style="text-align:right;">CGST (9%):</td><td style="text-align:right;">₹${cgst.toFixed(2)}</td></tr>
<tr><td style="text-align:right;">SGST (9%):</td><td style="text-align:right;">₹${sgst.toFixed(2)}</td></tr>
<tr><td style="text-align:right;">Round Off:</td><td style="text-align:right;">₹${roundOff.toFixed(2)}</td></tr>
<tr style="font-weight:bold;font-size:14px;"><td style="text-align:right;">Grand Total:</td><td style="text-align:right;">₹${grandTotal.toFixed(2)}</td></tr>
</table>
</div>

<div class="qr-box">
<div><img src="${INVOICE_CONFIG.qrPath}" alt="Payment QR" onerror="this.style.display='none'"></div>
<div class="bank-details">
<strong>Bank Details:</strong><br>
Account Name: ${INVOICE_CONFIG.companyName}<br>
Bank: ${INVOICE_CONFIG.bankName}<br>
Account No: ${INVOICE_CONFIG.accountNumber}<br>
IFSC: ${INVOICE_CONFIG.ifsc}<br>
UPI: ${INVOICE_CONFIG.upiId}
</div>
</div>

<div class="signature-row">
<div class="signature-box">Customer's Stamp & Signature<br><span style="font-size:10px;">(Receiver's acknowledgment)</span></div>
<div class="signature-box">For ${INVOICE_CONFIG.companyName}<br>(Authorised Signatory)<br><span style="font-size:10px;">(Stamp & Signature)</span></div>
</div>
<div class="footer-legal">This is a computer generated invoice. All disputes are subject to Howrah jurisdiction only.</div>
</div>
</body></html>`;
}

function saveInvoice(invoiceData) {
    const invoiceNo = invoiceData.invoiceNo;
    const html = generateInvoiceHTML({ ...invoiceData, invoiceNo });
    const filename = invoiceNo.replace(/\//g, '-') + '.html';
    const filePath = path.join(INVOICE_CONFIG.invoiceDir, filename);
    fs.writeFileSync(filePath, html);

    const data = loadInvoiceData();
    const invoiceType = invoiceNo.includes('/CH/') ? 'cash' : 'credit';
    const invoiceObject = {
        id: invoiceNo,
        invoiceNo: invoiceNo,
        date: new Date().toISOString().split('T')[0],
        customerEmail: invoiceData.customer?.email || '',
        invoiceType: invoiceType,
        status: 'Paid',
        grandTotal: invoiceData.total,
        buyer: {
            name: invoiceData.customer?.name || '',
            email: invoiceData.customer?.email || '',
            address: invoiceData.customer?.address || '',
            phone: invoiceData.customer?.phone || '',
            gstin: invoiceData.customer?.gstin || '',
            state: invoiceData.customer?.state || ''
        },
        items: invoiceData.items.map(item => ({
            part: item.part || '',
            desc: item.description || '',
            hsn: item.hsn || '',
            qty: item.qty || 1,
            price: item.price || 0
        })),
        finYear: getFinancialYear()
    };
    data.allInvoices.push(invoiceObject);
    data.salesInvoices.push(invoiceObject);
    if (invoiceType === 'cash') {
        const match = invoiceNo.match(/(\d+)$/);
        if (match) data.lastCashNumber = parseInt(match[1]);
    } else {
        const match = invoiceNo.match(/(\d+)$/);
        if (match) data.lastCreditNumber = parseInt(match[1]);
    }
    saveInvoiceData(data);
    return {
        invoiceNo,
        filePath,
        filename,
        invoiceUrl: `/invoices/${filename}`,
        fullUrl: `${process.env.BASE_URL || 'https://your-app.onrender.com'}/invoices/${filename}`
    };
}

async function generateInvoicePDF(invoiceData) {
    try {
        const invoiceNo = invoiceData.invoiceNo;
        const result = saveInvoice({ ...invoiceData, invoiceNo });
        return { ...result, success: true };
    } catch (error) {
        console.error('❌ Invoice generation error:', error.message);
        throw error;
    }
}

module.exports = {
    getNextCashBillNumber,
    getNextCreditBillNumber,
    getNextNumbers,
    generateInvoicePDF,
    loadInvoiceData,
    saveInvoiceData,
    INVOICE_CONFIG,
    getFinancialYear,
    getCashBillPrefix,
    getCreditBillPrefix
};
