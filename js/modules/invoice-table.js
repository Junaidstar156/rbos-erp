import { calculateInvoiceCoreValues } from './invoice-calculation.js';

export function bindRowEventListeners(rowNode) {
    rowNode.querySelector('.qty-input')?.addEventListener('input', calculateInvoiceCoreValues);
    rowNode.querySelector('.rate-input')?.addEventListener('input', calculateInvoiceCoreValues);
    rowNode.querySelector('.disc-input')?.addEventListener('input', calculateInvoiceCoreValues);
    rowNode.querySelector('.gst-select')?.addEventListener('change', calculateInvoiceCoreValues);
    rowNode.querySelector('.delete-row-btn')?.addEventListener('click', () => { 
        rowNode.remove(); 
        if(document.querySelectorAll('.item-row').length === 0) createNewRow();
        calculateInvoiceCoreValues(); 
    });
}

export function createNewRow(item = null) {
    const tableBody = document.getElementById('invoiceTableBody');
    if(!tableBody) return;
    const tr = document.createElement('tr');
    tr.className = 'item-row bg-slate-50 md:bg-transparent border border-slate-200 md:border-none md:border-b md:border-slate-300 rounded-xl md:rounded-none mb-4 md:mb-0 shadow-sm md:shadow-none p-3 md:p-0 grid grid-cols-3 gap-x-2 gap-y-3 md:table-row md:transition-colors md:hover:bg-slate-50 relative duration-150 ease-in-out';
    tr.innerHTML = `
        <td class="hidden md:table-cell py-2 px-1 border-r border-slate-300 text-center sr-num"></td>
        <td class="col-span-3 md:table-cell md:py-2 md:px-2 md:border-r border-slate-300 break-word-all relative">
            <span class="md:hidden text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Product Description</span>
            <input type="text" list="masterProductsList" onchange="window.handleProductSelection(this)" enterkeyhint="next" autocapitalize="words" placeholder="Select Product..." class="item-desc w-full bg-white md:bg-transparent border border-slate-200 md:border-transparent rounded-lg md:rounded-none px-3 outline-none text-slate-900 font-sans min-h-[44px] md:min-h-0 text-sm md:text-base break-word-all transition-colors duration-150 focus:border-blue-400 focus:bg-blue-50/50" data-pid="">
        </td>
        <td class="col-span-1 md:table-cell md:py-2 md:px-1 md:border-r border-slate-300 text-center">
            <span class="md:hidden text-[10px] font-bold text-slate-400 uppercase block mb-1">HSN</span>
            <input type="text" inputmode="numeric" enterkeyhint="next" class="item-hsn w-full bg-white md:bg-transparent border border-slate-200 md:border-none rounded-lg md:rounded-none text-center outline-none px-2 min-h-[44px] md:min-h-0 text-sm transition-colors duration-150 focus:border-blue-400 focus:bg-blue-50/50">
        </td>
        <td class="col-span-1 md:table-cell md:py-2 md:px-1 md:border-r border-slate-300 text-center">
            <span class="md:hidden text-[10px] font-bold text-slate-400 uppercase block mb-1">QTY</span>
            <input type="number" min="0.01" step="0.01" value="1" inputmode="decimal" enterkeyhint="next" class="qty-input w-full bg-white md:bg-transparent border border-slate-200 md:border-none rounded-lg md:rounded-none text-center outline-none font-bold px-2 min-h-[44px] md:min-h-0 text-sm transition-colors duration-150 focus:border-blue-400 focus:bg-blue-50/50">
        </td>
        <td class="col-span-1 md:table-cell md:py-2 md:px-1 md:border-r border-slate-300 text-center">
            <span class="md:hidden text-[10px] font-bold text-slate-400 uppercase block mb-1">UNIT</span>
            <select enterkeyhint="next" class="unit-input w-full bg-white md:bg-transparent border border-slate-200 md:border-none rounded-lg md:rounded-none text-center outline-none font-sans text-slate-700 px-1 min-h-[44px] md:min-h-0 text-sm transition-colors duration-150 focus:border-blue-400 focus:bg-blue-50/50">
                <option value="PCS" selected>PCS</option><option value="BOX">BOX</option><option value="KG">KG</option><option value="MTR">MTR</option><option value="LTR">LTR</option><option value="PAIR">PAIR</option><option value="NOS">NOS</option><option value="SET">SET</option><option value="ROLL">ROLL</option>
            </select>
        </td>
        <td class="col-span-1 md:table-cell md:py-2 md:px-2 md:border-r border-slate-300 text-right">
            <span class="md:hidden text-[10px] font-bold text-slate-400 uppercase block mb-1">RATE (₹)</span>
            <input type="number" min="0" placeholder="0" inputmode="decimal" enterkeyhint="next" class="rate-input w-full bg-white md:bg-transparent border border-slate-200 md:border-none rounded-lg md:rounded-none text-right outline-none font-bold px-2 min-h-[44px] md:min-h-0 text-sm transition-colors duration-150 focus:border-blue-400 focus:bg-blue-50/50">
        </td>
        <td class="col-span-1 md:table-cell md:py-2 md:px-1 md:border-r border-slate-300 text-right">
            <span class="md:hidden text-[10px] font-bold text-slate-400 uppercase block mb-1">DISC(₹)</span>
            <input type="number" min="0" value="0" inputmode="decimal" enterkeyhint="next" class="disc-input w-full bg-white md:bg-transparent border border-slate-200 md:border-none rounded-lg md:rounded-none text-right outline-none text-red-600 font-bold px-2 min-h-[44px] md:min-h-0 text-sm transition-colors duration-150 focus:border-blue-400 focus:bg-red-50/50">
        </td>
        <td class="col-span-1 md:table-cell md:py-2 md:px-1 md:border-r border-slate-300 text-center">
            <span class="md:hidden text-[10px] font-bold text-slate-400 uppercase block mb-1">GST</span>
            <select enterkeyhint="next" class="gst-select w-full bg-white md:bg-transparent border border-slate-200 md:border-none rounded-lg md:rounded-none text-center outline-none font-bold px-1 min-h-[44px] md:min-h-0 text-sm transition-colors duration-150 focus:border-blue-400 focus:bg-blue-50/50">
                <option value="0">0%</option><option value="5">5%</option><option value="12">12%</option><option value="18" selected>18%</option><option value="28">28%</option>
            </select>
        </td>
        <td class="hidden md:table-cell py-2 px-1 border-r border-slate-300 text-right text-slate-600 cgst-col cgst-val">₹0.00</td>
        <td class="hidden md:table-cell py-2 px-1 border-r border-slate-300 text-right text-slate-600 cgst-col sgst-val">₹0.00</td>
        <td class="hidden md:table-cell py-2 px-1 border-r border-slate-300 text-right text-slate-600 igst-col igst-val">₹0.00</td>
        <td class="col-span-2 md:col-span-1 flex items-center justify-between md:table-cell md:py-2 md:px-2 md:border-r border-slate-300 text-right mt-1 md:mt-0 pt-3 border-t border-slate-200 md:border-t-0 md:pt-0">
            <span class="md:hidden text-xs font-black text-slate-500 uppercase tracking-wide">Total Amount</span>
            <div class="font-black text-blue-900 text-lg md:text-base total-val transition-all duration-150">₹0.00</div>
        </td>
        <td class="col-span-1 flex justify-end md:table-cell py-2 px-1 text-center no-print mt-1 md:mt-0 pt-2 border-t border-slate-200 md:border-t-0">
            <button class="delete-row-btn bg-red-50 md:bg-transparent text-red-600 hover:bg-red-100 font-bold px-4 rounded-lg md:rounded-none text-xs min-h-[44px] md:min-h-0 transition-all duration-150 active:scale-95 flex items-center justify-center">❌ Delete</button>
        </td>
    `;
    tableBody.appendChild(tr);

    if(item) {
        if(tr.querySelector('.item-desc')) { tr.querySelector('.item-desc').value = item.desc || ''; tr.querySelector('.item-desc').dataset.pid = item.productId || ''; }
        if(tr.querySelector('.item-hsn')) tr.querySelector('.item-hsn').value = item.hsn || '';
        if(tr.querySelector('.qty-input')) tr.querySelector('.qty-input').value = item.qty || 1;
        if(tr.querySelector('.unit-input')) tr.querySelector('.unit-input').value = item.unit || 'PCS';
        if(tr.querySelector('.rate-input')) tr.querySelector('.rate-input').value = item.rate || 0;
        if(tr.querySelector('.disc-input')) tr.querySelector('.disc-input').value = item.disc || 0;
        if(tr.querySelector('.gst-select')) tr.querySelector('.gst-select').value = item.gst || 0;
    }
    bindRowEventListeners(tr);
}

// Bind to window for HTML inline calls
window.addManualRow = function() { 
    createNewRow(); 
    calculateInvoiceCoreValues(); 
};
