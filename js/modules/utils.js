export function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/[&<>'"]/g, match => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[match]));
}

export function formatINR(number) { 
    return '₹' + number.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 }); 
}
