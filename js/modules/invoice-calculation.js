import { formatINR } from './utils.js';
import { calculateInvoiceData } from '../invoice.js'; // Imports from root invoice.js

export function calculateInvoiceCoreValues() {
    const rows = document.querySelectorAll('.item-row');
    const billingStateEl = document.getElementById('billingState');
    const billingState = billingStateEl ? billingStateEl.value : 'intra';
    
    const container = document.getElementById('invoiceCoreContainer');
    if(container) { 
        container.classList.remove('state-intra', 'state-inter'); 
        container.classList.add(billingState === 'inter' ? 'state-inter' : 'state-intra'); 
    }
    
    const rowNodes = Array.from(rows); 
    const itemsData = rowNodes.map((row, index) => {
        if(row.querySelector('.sr-num')) row.querySelector('.sr-num').innerText = index + 1;
        return {
            rate: parseFloat(row.querySelector('.rate-input')?.value) || 0,
            qty: parseFloat(row.querySelector('.qty-input')?.value) || 1,
            disc: parseFloat(row.querySelector('.disc-input')?.value) || 0,
            gst: parseFloat(row.querySelector('.gst-select')?.value) || 0
        };
    });
    
    if(typeof calculateInvoiceData !== 'function') return;
    const engineResult = calculateInvoiceData(itemsData, billingState);
    
    engineResult.itemsMath.forEach((mathData, index) => {
        const rowNode = rowNodes[index];
        if(rowNode.querySelector('.cgst-val')) rowNode.querySelector('.cgst-val').innerText = formatINR(mathData.rowCgst); 
        if(rowNode.querySelector('.sgst-val')) rowNode.querySelector('.sgst-val').innerText = formatINR(mathData.rowSgst); 
        if(rowNode.querySelector('.igst-val')) rowNode.querySelector('.igst-val').innerText = formatINR(mathData.rowIgst);
        if(rowNode.querySelector('.total-val')) rowNode.querySelector('.total-val').innerText = formatINR(mathData.finalRowValue);
    });
    
    window.invoiceTotals.taxable = engineResult.totals.taxable; 
    window.invoiceTotals.tax = engineResult.totals.tax; 
    window.invoiceTotals.grand = engineResult.totals.grand;

    if(document.getElementById('totalRateSum')) document.getElementById('totalRateSum').innerText = formatINR(engineResult.totals.taxable);
    if(document.getElementById('totalDiscountSum')) document.getElementById('totalDiscountSum').innerText = formatINR(engineResult.totals.discount); 
    if(document.getElementById('totalCgstSum')) document.getElementById('totalCgstSum').innerText = formatINR(engineResult.totals.cgstSum);
    if(document.getElementById('totalSgstSum')) document.getElementById('totalSgstSum').innerText = formatINR(engineResult.totals.sgstSum);
    if(document.getElementById('totalIgstSum')) document.getElementById('totalIgstSum').innerText = formatINR(engineResult.totals.igstSum);
    if(document.getElementById('totalGrandSum')) document.getElementById('totalGrandSum').innerText = formatINR(engineResult.totals.grand);
    
    if(document.getElementById('blockTaxable')) {
        document.getElementById('blockTaxable').innerText = formatINR(engineResult.totals.taxable);
        document.getElementById('blockTaxRate').innerText = engineResult.totals.displayRate;
        document.getElementById('blockTaxDue').innerText = formatINR(engineResult.totals.tax);
        document.getElementById('blockGrandTotal').innerText = formatINR(engineResult.totals.grand);
    }
    
    if(document.getElementById('stickyMobileTotal')) {
        document.getElementById('stickyMobileTotal').innerText = formatINR(engineResult.totals.grand);
    }
}

// Bind to window for inline HTML events
window.calculateInvoiceCoreValues = calculateInvoiceCoreValues;
