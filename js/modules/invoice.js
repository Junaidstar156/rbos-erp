import { saveInvoiceDB, deleteInvoiceDB, fetchInvoicesAdvancedDB } from '../database.js';
import { logActivity } from './admin.js';
import { renderDashboardModule } from './dashboard.js';
import { escapeHTML } from './ui.js';

import { createNewRow } from './invoice-table.js';
import { calculateInvoiceCoreValues } from './invoice-calculation.js';
import { printInvoice } from './invoice-print.js';

let currentEditingDocId = null;
let lastFetchedDocSnapshot = null; 
let activeAppliedFilters = {};      

// App.js ke logout flush ke liye exported
export function resetInvoiceSessionState() {
    currentEditingDocId = null;
    lastFetchedDocSnapshot = null;
    activeAppliedFilters = {};

    window.invoiceCache = {};

    [
        'filterStartDate',
        'filterEndDate',
        'filterInvNo',
        'filterClientName'
    ].forEach((id) => {
        const input = document.getElementById(id);
        if (input) input.value = '';
    });
}

export function resetInvoiceForm() {
    try {
        const today = new Date().toISOString().split('T')[0];
        if(document.getElementById('invDate')) document.getElementById('invDate').value = today;
        if(document.getElementById('dueDate')) document.getElementById('dueDate').value = today;
        
        const currentCompanyId = window.erpSession?.companyId || 'guest_session';
        const prefix = window.erpSession?.profile?.invoicePrefix || "INV";
        
        const savedInv = localStorage.getItem(`rbos_invNo_${currentCompanyId}`);
        if(document.getElementById('invNo')) document.getElementById('invNo').value = savedInv || `${prefix}/001`;
        
        ['partySelectMaster', 'custId', 'clientName', 'clientAddress', 'clientGstin', 'clientPan', 'clientMob'].forEach(id => { 
            if(document.getElementById(id)) document.getElementById(id).value = ''; 
        });

        if(document.getElementById('billingState')) document.getElementById('billingState').value = 'intra';
        if(document.getElementById('invoiceTableBody')) document.getElementById('invoiceTableBody').innerHTML = '';
        
        currentEditingDocId = null;
        createNewRow(); 
        calculateInvoiceCoreValues();

        const savedBankId = localStorage.getItem(`rbos_bankId_${currentCompanyId}`);
        const defaultBank = window.bankMasterList.find(b => b.id === savedBankId) || (window.bankMasterList.length === 1 ? window.bankMasterList[0] : null);
        
        if(defaultBank && document.getElementById('bankSelectMaster')) {
            document.getElementById('bankSelectMaster').value = defaultBank.id;
            if (typeof window.handleBankSelection === 'function') window.handleBankSelection();
        } else if (document.getElementById('bankSelectMaster')) {
            document.getElementById('bankSelectMaster').value = '';
            ['lblBankName', 'lblBankAcc', 'lblBankIfsc', 'lblBankMicr', 'lblBankBranch'].forEach(id => {
                if(document.getElementById(id)) document.getElementById(id).innerText = id === 'lblBankName' ? '[SELECT BANK]' : '...';
            });
        }
    } catch(err) { console.warn("Form reset skipped", err); }
}

export function incrementInvoiceNo() {
    const invInput = document.getElementById('invNo');
    if(!invInput) return;
    const match = invInput.value.trim().match(/^(.*?)(\d+)$/);
    if(match) {
        const nextNum = (parseInt(match[2], 10) + 1).toString().padStart(match[2].length, '0');
        invInput.value = match[1] + nextNum;
        localStorage.setItem(`rbos_invNo_${window.erpSession?.companyId || 'guest_session'}`, invInput.value);
    }
}

export function mapDataToForm(data) {
    resetInvoiceForm();
    if(document.getElementById('invNo')) document.getElementById('invNo').value = data.invoiceNo || '';
    if(document.getElementById('invDate')) document.getElementById('invDate').value = data.invoiceDate || '';
    if(document.getElementById('custId')) document.getElementById('custId').value = data.customerId || '';
    if(document.getElementById('dueDate')) document.getElementById('dueDate').value = data.dueDate || '';
    if(data.billingState && document.getElementById('billingState')) document.getElementById('billingState').value = data.billingState;
    if(data.partyId && document.getElementById('partySelectMaster')) document.getElementById('partySelectMaster').value = data.partyId;
    if(data.bankId && document.getElementById('bankSelectMaster')) document.getElementById('bankSelectMaster').value = data.bankId;

    const partySnap = data.partySnapshot || {};
    if(document.getElementById('clientName')) document.getElementById('clientName').value = partySnap.name || data.clientName || '';
    if(document.getElementById('clientAddress')) document.getElementById('clientAddress').value = partySnap.address || data.clientAddress || '';
    if(document.getElementById('clientGstin')) document.getElementById('clientGstin').value = partySnap.gstin || data.clientGstin || '';
    if(document.getElementById('clientPan')) document.getElementById('clientPan').value = partySnap.pan || data.clientPan || '';
    if(document.getElementById('clientMob')) document.getElementById('clientMob').value = partySnap.mobile || data.clientMob || '';

    const bankSnap = data.bankSnapshot || {};
    if(document.getElementById('lblBankName')) document.getElementById('lblBankName').innerText = bankSnap.bankName || '[LEGACY INVOICE BANK]';
    if(document.getElementById('lblBankAcc')) document.getElementById('lblBankAcc').innerText = bankSnap.accountNumber || '';
    if(document.getElementById('lblBankIfsc')) document.getElementById('lblBankIfsc').innerText = bankSnap.ifsc || '';
    if(document.getElementById('lblBankMicr')) document.getElementById('lblBankMicr').innerText = bankSnap.micr || '';
    if(document.getElementById('lblBankBranch')) document.getElementById('lblBankBranch').innerText = bankSnap.branch || '';

    if(document.getElementById('invoiceTableBody')) document.getElementById('invoiceTableBody').innerHTML = '';
    const itemsList = Array.isArray(data.items) ? data.items : [];
    itemsList.forEach((item) => createNewRow(item));
    if(itemsList.length === 0) createNewRow();
    calculateInvoiceCoreValues();
}

export function hasUnsavedData() {
    const firstRowDesc = document.querySelector('.item-desc');
    return ((document.getElementById('clientName') && document.getElementById('clientName').value.trim() !== '') || (firstRowDesc && firstRowDesc.value.trim() !== ''));
}

export function renderInvoiceRowRecords(docSnap, append = false) {
    const historyBody = document.getElementById('historyTableBody');
    if(!historyBody) return;
    if(!append && historyBody.innerHTML.includes('No matching records')) historyBody.innerHTML = '';
    const data = docSnap.data();
    window.invoiceCache[docSnap.id] = data; 
    const displayName = (data.partySnapshot && data.partySnapshot.name) ? data.partySnapshot.name : (data.clientName || 'Unknown');
    const tr = document.createElement('tr');
    tr.className = "border-b border-slate-700 hover:bg-slate-800 text-xs font-mono text-slate-300";
    tr.id = `history-row-${docSnap.id}`;
    tr.innerHTML = `
        <td class="py-2.5 px-3">${escapeHTML(data.invoiceDate || 'N/A')}</td>
        <td class="py-2.5 px-3 text-white font-bold">${escapeHTML(data.invoiceNo)}</td>
        <td class="py-2.5 px-3 font-sans text-slate-200">${escapeHTML(displayName)}</td>
        <td class="py-2.5 px-3 text-emerald-400 font-bold">₹${escapeHTML((data.grandTotal || 0).toLocaleString('en-IN', {minimumFractionDigits: 2}))}</td>
        <td class="py-2.5 px-3 text-center flex justify-center gap-1.5">
            <button onclick="window.downloadPastInvoiceDirectly('${docSnap.id}')" class="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-1 px-2.5 rounded text-[10px] min-h-[36px]">Download</button>
            <button onclick="window.editPastInvoice('${docSnap.id}')" class="bg-blue-600 hover:bg-blue-500 text-white font-bold py-1 px-2 rounded text-[10px] min-h-[36px]">Edit</button>
            <button onclick="window.deleteInvoiceFromCloud('${docSnap.id}')" class="bg-red-600 hover:bg-red-500 text-white font-bold py-1 px-2 rounded text-[10px] min-h-[36px]">Delete</button>
        </td>
    `;
    historyBody.appendChild(tr);
}

export async function loadInvoiceHistoryBatch(append = false) {
    const historyBody = document.getElementById('historyTableBody');
    const loadMoreBtn = document.getElementById('loadMoreRecordsBtn');
    if(!historyBody) return;
    if (!append) { 
        historyBody.innerHTML = `<tr><td colspan="5" class="py-4 text-center text-slate-400 font-mono text-xs">⚡ Querying Cloud Storage...</td></tr>`; 
        lastFetchedDocSnapshot = null; 
        window.invoiceCache = {}; 
    }
    try {
        const batchSize = 15;
        const querySnapshot = await fetchInvoicesAdvancedDB(activeAppliedFilters, lastFetchedDocSnapshot, batchSize, window.erpSession.companyId);
        if (!append) historyBody.innerHTML = '';
        if (querySnapshot.empty) {
            if (!append) historyBody.innerHTML = `<tr><td colspan="5" class="py-4 text-center text-slate-500">No matching records found.</td></tr>`;
            if(loadMoreBtn) loadMoreBtn.classList.add('hidden'); return;
        }
        querySnapshot.forEach(docSnap => renderInvoiceRowRecords(docSnap, true));
        lastFetchedDocSnapshot = querySnapshot.docs[querySnapshot.docs.length - 1];
        if(loadMoreBtn) querySnapshot.docs.length === batchSize ? loadMoreBtn.classList.remove('hidden') : loadMoreBtn.classList.add('hidden');
    } catch (err) { historyBody.innerHTML = `<tr><td colspan="5" class="py-4 text-center text-red-400 font-mono text-xs">⚠️ ${escapeHTML(err.message)}</td></tr>`; }
}

window.applyFiltersTrigger = function() {
    activeAppliedFilters = {
        startDate: document.getElementById('filterStartDate')?.value || null, endDate: document.getElementById('filterEndDate')?.value || null, 
        invoiceNo: document.getElementById('filterInvNo')?.value.trim().toUpperCase() || null, clientName: document.getElementById('filterClientName')?.value.trim() || null
    };
    if(!activeAppliedFilters.startDate && !activeAppliedFilters.endDate && !activeAppliedFilters.invoiceNo && !activeAppliedFilters.clientName) activeAppliedFilters = {};
    loadInvoiceHistoryBatch(false);
};

window.clearFiltersTrigger = function() {
    if(document.getElementById('filterStartDate')) document.getElementById('filterStartDate').value = ''; 
    if(document.getElementById('filterEndDate')) document.getElementById('filterEndDate').value = ''; 
    if(document.getElementById('filterInvNo')) document.getElementById('filterInvNo').value = ''; 
    if(document.getElementById('filterClientName')) document.getElementById('filterClientName').value = '';
    activeAppliedFilters = {}; loadInvoiceHistoryBatch(false);
};

window.loadNextBatchTrigger = function() { loadInvoiceHistoryBatch(true); };

window.saveInvoiceToFirebase = async function() {
    calculateInvoiceCoreValues();
    const invNo = document.getElementById('invNo')?.value.trim().toUpperCase(); 
    const invDate = document.getElementById('invDate')?.value; 
    const billingState = document.getElementById('billingState')?.value; 
    const partyId = document.getElementById('partySelectMaster')?.value; 
    const bankId = document.getElementById('bankSelectMaster')?.value; 
    const clientName = document.getElementById('clientName')?.value.trim();
    
    if(!invNo || !clientName || !invDate) return alert("Invoice Number, Date, and Client Name are required!");
    
    const items = Array.from(document.querySelectorAll('.item-row')).map(row => ({
        productId: row.querySelector('.item-desc')?.dataset.pid || null, 
        desc: row.querySelector('.item-desc')?.value.trim(), 
        hsn: row.querySelector('.item-hsn')?.value.trim(), 
        qty: parseFloat(row.querySelector('.qty-input')?.value) || 1, 
        unit: row.querySelector('.unit-input')?.value, 
        rate: parseFloat(row.querySelector('.rate-input')?.value) || 0, 
        disc: parseFloat(row.querySelector('.disc-input')?.value) || 0, 
        gst: parseFloat(row.querySelector('.gst-select')?.value) || 0
    })).filter(item => item.desc !== '');

    if(items.length === 0) return alert("Please add at least one valid product.");
    
    const partySnapshot = { name: clientName, address: document.getElementById('clientAddress')?.value.trim(), gstin: document.getElementById('clientGstin')?.value.trim().toUpperCase(), pan: document.getElementById('clientPan')?.value.trim().toUpperCase(), mobile: document.getElementById('clientMob')?.value.trim() };
    const bankSnapshot = { bankName: document.getElementById('lblBankName')?.innerText, accountNumber: document.getElementById('lblBankAcc')?.innerText, ifsc: document.getElementById('lblBankIfsc')?.innerText, micr: document.getElementById('lblBankMicr')?.innerText, branch: document.getElementById('lblBankBranch')?.innerText };

    const invoiceData = {
        companyId: window.erpSession.companyId, invoiceNo: invNo, invoiceDate: invDate, customerId: document.getElementById('custId')?.value, dueDate: document.getElementById('dueDate')?.value, billingState: billingState,
        partyId, bankId, partySnapshot, bankSnapshot, clientName, items: items, totalTaxable: window.invoiceTotals.taxable, totalTax: window.invoiceTotals.tax, grandTotal: window.invoiceTotals.grand, updatedAt: new Date().toISOString()
    };
    
    const saveBtn = document.getElementById('triggerPrintBtn');
    try {
        if(saveBtn) { saveBtn.innerText = "Syncing Cloud..."; saveBtn.disabled = true; }
        const wasEditing = !!currentEditingDocId; 
        if (wasEditing) invoiceData.createdAt = window.invoiceCache[currentEditingDocId]?.createdAt || new Date().toISOString(); 
        else invoiceData.createdAt = new Date().toISOString();
        
        await saveInvoiceDB(invoiceData, currentEditingDocId);
        currentEditingDocId = null; 
        
        if(!wasEditing) { incrementInvoiceNo(); logActivity("invoice_created", { invoiceNo: invNo }); } 
        else { logActivity("invoice_updated", { invoiceNo: invNo }); }
        
        if(saveBtn) { saveBtn.innerText = "🖨️ Print / Save Document Invoice"; saveBtn.disabled = false; }
        window.clearFiltersTrigger(); 
        renderDashboardModule(window.erpSession.companyId); 
        setTimeout(() => { printInvoice(); }, 300);
    } catch (err) {
        if(saveBtn) { saveBtn.innerText = "🖨️ Print / Save Document Invoice"; saveBtn.disabled = false; }
        if(confirm(`Cloud save failed (${err.message}). Print offline copy?`)) setTimeout(() => printInvoice(), 300);
    }
};

window.editPastInvoice = function(id) { 
    const data = window.invoiceCache[id]; 
    if(data) { currentEditingDocId = id; mapDataToForm(data); window.scrollTo({ top: 0, behavior: 'smooth' }); } 
};

window.downloadPastInvoiceDirectly = function(id) { 
    const data = window.invoiceCache[id]; 
    if(!data) return alert("Pichla invoice cache mein nahi mila.");
    if((currentEditingDocId && currentEditingDocId !== id) || (!currentEditingDocId && hasUnsavedData())) { 
        if(!confirm("Warning: Form mein data hai jo kho jaayega. Continue?")) return; 
    }
    currentEditingDocId = null; 
    mapDataToForm(data); 
    const btn = document.getElementById('triggerPrintBtn');
    if(btn) btn.innerText = "📥 Downloaded — New/Clear to start fresh"; 
    setTimeout(() => { printInvoice(); if(btn) setTimeout(() => { btn.innerText = "🖨️ Print / Save Document Invoice"; }, 3000); }, 300);
};

window.deleteInvoiceFromCloud = async function(id) { 
    if (confirm("🚨 Warning: Delete this invoice permanently?")) {
        try {
            const delInvNo = window.invoiceCache[id]?.invoiceNo || id; 
            await deleteInvoiceDB(id); 
            const targetRow = document.getElementById(`history-row-${id}`); 
            if(targetRow) targetRow.remove();
            if(currentEditingDocId === id) { currentEditingDocId = null; resetInvoiceForm(); alert("Editing wali invoice delete ho gayi."); }
            renderDashboardModule(window.erpSession.companyId); 
            logActivity("invoice_deleted", { invoiceNo: delInvNo }); 
        } catch(err) { alert("Failed to delete! " + err.message); }
    }
};

window.confirmFreshInvoice = function() {
    if(currentEditingDocId || hasUnsavedData()) { if(confirm("Form mein data hai jo kho jaayega. Clear karein?")) resetInvoiceForm(); } 
    else { resetInvoiceForm(); }
};
