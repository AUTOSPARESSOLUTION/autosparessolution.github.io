function aiShowToast(message, isError = false) {
    // If your existing showToast is global, use it; otherwise this fallback
    if (typeof showToast === 'function') {
        showToast(message, isError);
    } else {
        alert(message);
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

function normalizePart(part = '') {
    const normalized = part.toString()
        .trim()
        .replace(/[\s\-_./:;|\\,]/g, '')
        .replace(/[^\w]/g, '')
        .toUpperCase();
    return normalized.length >= 4 ? normalized : '';
}

async function resizeImage(file, maxDimension = 1600) {
    return new Promise((resolve) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            let width = img.width;
            let height = img.height;
            if (width > maxDimension || height > maxDimension) {
                if (width > height) {
                    height = (height * maxDimension) / width;
                    width = maxDimension;
                } else {
                    width = (width * maxDimension) / height;
                    height = maxDimension;
                }
            }
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            canvas.toBlob(blob => {
                URL.revokeObjectURL(url);
                resolve(blob);
            }, file.type);
        };
        img.src = url;
    });
}
