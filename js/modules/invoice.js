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
let lastSavedInvoiceFingerprint = null;
let isSavingInvoice = false;

function getCurrentCompanyId() {
    return window.erpSession?.companyId || 'guest_session';
}

function sanitizeBankField(value) {
    const text = (value ?? '').toString().trim();
    if(!text || text === '[SELECT BANK]' || text === '...') return '';
    if(text.toUpperCase() === 'N/A') return '';
    return text;
}

function hasMeaningfulBankName(bankName) {
    return sanitizeBankField(bankName) !== '';
}

function hasMeaningfulBankSnapshot(bankSnapshot) {
    return hasMeaningfulBankName(bankSnapshot?.bankName);
}

function normalizeBankSnapshot(bankSnapshot) {
    if(!bankSnapshot || typeof bankSnapshot !== 'object') return null;
    const normalized = {
        bankName: sanitizeBankField(bankSnapshot.bankName),
        accountNumber: sanitizeBankField(bankSnapshot.accountNumber),
        ifsc: sanitizeBankField(bankSnapshot.ifsc),
        micr: sanitizeBankField(bankSnapshot.micr),
        branch: sanitizeBankField(bankSnapshot.branch)
    };
    return hasMeaningfulBankSnapshot(normalized) ? normalized : null;
}

function getSelectedBankSnapshotOrNull() {
    const selectedBankId = document.getElementById('bankSelectMaster')?.value || '';
    const bank = selectedBankId ? (window.bankMasterList || []).find(b => b.id === selectedBankId) : null;
    if(!bank) return { bankId: null, bankSnapshot: null };

    const bankSnapshot = {
        bankName: sanitizeBankField(bank.bankName),
        accountNumber: sanitizeBankField(bank.accountNumber),
        ifsc: sanitizeBankField(bank.ifsc),
        micr: sanitizeBankField(bank.micr),
        branch: sanitizeBankField(bank.branch)
    };

    if(!hasMeaningfulBankSnapshot(bankSnapshot)) return { bankId: null, bankSnapshot: null };

    return {
        bankId: selectedBankId,
        bankSnapshot
    };
}

function syncBankPrintVisibility(bankSnapshotOverride = null) {
    const bankDetailsElement = document.querySelector('[data-bank-details]');
    if(!bankDetailsElement) return;

    const selectedBankSnapshot = getSelectedBankSnapshotOrNull().bankSnapshot;
    const bankSnapshot = bankSnapshotOverride || selectedBankSnapshot;
    bankDetailsElement.dataset.hasBank = hasMeaningfulBankSnapshot(bankSnapshot) ? 'true' : 'false';
}

function getNextInvoiceNoValue(invoiceNo) {
    const match = (invoiceNo || '').trim().match(/^(.*?)(\d+)$/);
    if(!match) return null;
    const nextNum = (parseInt(match[2], 10) + 1).toString().padStart(match[2].length, '0');
    return match[1] + nextNum;
}

function prepareNextInvoiceNoForFuture(invoiceNo) {
    const nextInvoiceNo = getNextInvoiceNoValue(invoiceNo);
    if(nextInvoiceNo) localStorage.setItem(`rbos_invNo_${getCurrentCompanyId()}`, nextInvoiceNo);
    return nextInvoiceNo;
}

function buildEditableInvoiceFingerprintPayload() {
    const bankData = getSelectedBankSnapshotOrNull();
    const bankSnap = bankData.bankSnapshot || {};
    calculateInvoiceCoreValues();

    return {
        invoiceNo: document.getElementById('invNo')?.value.trim().toUpperCase() || '',
        invoiceDate: document.getElementById('invDate')?.value || '',
        dueDate: document.getElementById('dueDate')?.value || '',
        billingState: document.getElementById('billingState')?.value || '',
        party: {
            partyId: document.getElementById('partySelectMaster')?.value || '',
            customerId: document.getElementById('custId')?.value || '',
            name: document.getElementById('clientName')?.value.trim() || '',
            address: document.getElementById('clientAddress')?.value.trim() || '',
            gstin: document.getElementById('clientGstin')?.value.trim().toUpperCase() || '',
            pan: document.getElementById('clientPan')?.value.trim().toUpperCase() || '',
            mobile: document.getElementById('clientMob')?.value.trim() || ''
        },
        bank: {
            bankId: bankData.bankId,
            bankName: bankSnap.bankName || '',
            accountNumber: bankSnap.accountNumber || '',
            ifsc: bankSnap.ifsc || '',
            micr: bankSnap.micr || '',
            branch: bankSnap.branch || ''
        },
        items: Array.from(document.querySelectorAll('.item-row')).map(row => ({
            productId: row.querySelector('.item-desc')?.dataset.pid || '',
            desc: row.querySelector('.item-desc')?.value.trim() || '',
            hsn: row.querySelector('.item-hsn')?.value.trim() || '',
            qty: row.querySelector('.qty-input')?.value || '',
            unit: row.querySelector('.unit-input')?.value || '',
            rate: row.querySelector('.rate-input')?.value || '',
            disc: row.querySelector('.disc-input')?.value || '',
            gst: row.querySelector('.gst-select')?.value || ''
        })),
        totals: {
            taxable: Number(window.invoiceTotals?.taxable || 0),
            tax: Number(window.invoiceTotals?.tax || 0),
            grand: Number(window.invoiceTotals?.grand || 0)
        }
    };
}

function getInvoiceFingerprint() {
    return JSON.stringify(buildEditableInvoiceFingerprintPayload());
}

function getInvoiceActionState() {
    if(!currentEditingDocId) return 'new';
    if(lastSavedInvoiceFingerprint && getInvoiceFingerprint() === lastSavedInvoiceFingerprint) return 'saved-clean';
    return 'saved-dirty';
}

function getInvoiceActionButtonParts() {
    const saveBtn = document.getElementById('triggerPrintBtn');
    if(!saveBtn) return { saveBtn: null, primaryTextNode: null, desktopSuffixNode: null };

    const primaryTextNode = Array.from(saveBtn.childNodes).find(node => node.nodeType === Node.TEXT_NODE);
    const desktopSuffixSpan = Array.from(saveBtn.children).find(child =>
        child.tagName === 'SPAN' &&
        child.classList.contains('hidden') &&
        child.classList.contains('md:inline')
    );
    const desktopSuffixNode = Array.from(desktopSuffixSpan?.childNodes || []).find(node => node.nodeType === Node.TEXT_NODE);

    return { saveBtn, primaryTextNode, desktopSuffixNode };
}

function setInvoiceActionButtonLabel(primaryLabel, desktopSuffix = '') {
    const { saveBtn, primaryTextNode, desktopSuffixNode } = getInvoiceActionButtonParts();
    if(!saveBtn) return;

    if(primaryTextNode) {
        const currentLabel = primaryTextNode.nodeValue || '';
        const iconPrefix = currentLabel.match(/^\s*\S+\s+/)?.[0] || '';
        primaryTextNode.nodeValue = `${iconPrefix}${primaryLabel} `;
    }
    if(desktopSuffixNode) desktopSuffixNode.nodeValue = desktopSuffix;
}

function refreshInvoiceActionButtonState() {
    const { saveBtn } = getInvoiceActionButtonParts();
    if(!saveBtn) return;

    if(isSavingInvoice) {
        setInvoiceActionButtonLabel('Syncing...');
        saveBtn.disabled = true;
        return;
    }

    saveBtn.disabled = false;
    const state = getInvoiceActionState();
    if(state === 'saved-clean') setInvoiceActionButtonLabel('Print');
    else if(state === 'saved-dirty') setInvoiceActionButtonLabel('Update', ' / Print');
    else setInvoiceActionButtonLabel('Save', ' / Print');
}

function refreshInvoiceControllerUi(bankSnapshotOverride = null) {
    syncBankPrintVisibility(bankSnapshotOverride);
    refreshInvoiceActionButtonState();
}

// App.js ke logout flush ke liye exported
export function resetInvoiceSessionState() {
    currentEditingDocId = null;
    lastFetchedDocSnapshot = null;
    activeAppliedFilters = {};
    lastSavedInvoiceFingerprint = null;
    isSavingInvoice = false;

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
        
        const currentCompanyId = getCurrentCompanyId();
        const prefix = window.erpSession?.profile?.invoicePrefix || "INV";
        
        const savedInv = localStorage.getItem(`rbos_invNo_${currentCompanyId}`);
        if(document.getElementById('invNo')) document.getElementById('invNo').value = savedInv || `${prefix}/001`;
        
        ['partySelectMaster', 'custId', 'clientName', 'clientAddress', 'clientGstin', 'clientPan', 'clientMob'].forEach(id => { 
            if(document.getElementById(id)) document.getElementById(id).value = ''; 
        });

        if(document.getElementById('billingState')) document.getElementById('billingState').value = 'intra';
        if(document.getElementById('invoiceTableBody')) document.getElementById('invoiceTableBody').innerHTML = '';
        
        currentEditingDocId = null;
        lastSavedInvoiceFingerprint = null;
        createNewRow(); 
        calculateInvoiceCoreValues();

        const savedBankId = localStorage.getItem(`rbos_bankId_${currentCompanyId}`);
        const bankList = window.bankMasterList || [];
        const defaultBank = bankList.find(b => b.id === savedBankId) || (bankList.length === 1 ? bankList[0] : null);
        
        if(defaultBank && document.getElementById('bankSelectMaster')) {
            document.getElementById('bankSelectMaster').value = defaultBank.id;
            if (typeof window.handleBankSelection === 'function') window.handleBankSelection();
        } else if (document.getElementById('bankSelectMaster')) {
            document.getElementById('bankSelectMaster').value = '';
            ['lblBankName', 'lblBankAcc', 'lblBankIfsc', 'lblBankMicr', 'lblBankBranch'].forEach(id => {
                if(document.getElementById(id)) document.getElementById(id).innerText = id === 'lblBankName' ? '[SELECT BANK]' : '...';
            });
        }
        refreshInvoiceControllerUi();
    } catch(err) { console.warn("Form reset skipped", err); }
}

export function incrementInvoiceNo() {
    const invInput = document.getElementById('invNo');
    if(!invInput) return;
    prepareNextInvoiceNoForFuture(invInput.value);
}

export function mapDataToForm(data, options = {}) {
    const preserveDocId = options.docId || null;
    resetInvoiceForm();
    if(preserveDocId) currentEditingDocId = preserveDocId;

    if(document.getElementById('invNo')) document.getElementById('invNo').value = data.invoiceNo || '';
    if(document.getElementById('invDate')) document.getElementById('invDate').value = data.invoiceDate || '';
    if(document.getElementById('custId')) document.getElementById('custId').value = data.customerId || '';
    if(document.getElementById('dueDate')) document.getElementById('dueDate').value = data.dueDate || '';
    if(data.billingState && document.getElementById('billingState')) document.getElementById('billingState').value = data.billingState;
    if(data.partyId && document.getElementById('partySelectMaster')) document.getElementById('partySelectMaster').value = data.partyId;

    const bankSelect = document.getElementById('bankSelectMaster');
    const matchingBank = data.bankId ? (window.bankMasterList || []).find(b => b.id === data.bankId) : null;
    const selectedBankSnapshot = matchingBank ? normalizeBankSnapshot(matchingBank) : null;
    if(bankSelect) bankSelect.value = selectedBankSnapshot ? data.bankId : '';

    const partySnap = data.partySnapshot || {};
    if(document.getElementById('clientName')) document.getElementById('clientName').value = partySnap.name || data.clientName || '';
    if(document.getElementById('clientAddress')) document.getElementById('clientAddress').value = partySnap.address || data.clientAddress || '';
    if(document.getElementById('clientGstin')) document.getElementById('clientGstin').value = partySnap.gstin || data.clientGstin || '';
    if(document.getElementById('clientPan')) document.getElementById('clientPan').value = partySnap.pan || data.clientPan || '';
    if(document.getElementById('clientMob')) document.getElementById('clientMob').value = partySnap.mobile || data.clientMob || '';

    const storedBankSnap = normalizeBankSnapshot(data.bankSnapshot);
    const displayBankSnap = storedBankSnap || selectedBankSnapshot;
    if(displayBankSnap) {
        if(document.getElementById('lblBankName')) document.getElementById('lblBankName').innerText = displayBankSnap.bankName || '';
        if(document.getElementById('lblBankAcc')) document.getElementById('lblBankAcc').innerText = displayBankSnap.accountNumber || '';
        if(document.getElementById('lblBankIfsc')) document.getElementById('lblBankIfsc').innerText = displayBankSnap.ifsc || '';
        if(document.getElementById('lblBankMicr')) document.getElementById('lblBankMicr').innerText = displayBankSnap.micr || '';
        if(document.getElementById('lblBankBranch')) document.getElementById('lblBankBranch').innerText = displayBankSnap.branch || '';
    } else {
        if(document.getElementById('lblBankName')) document.getElementById('lblBankName').innerText = '[SELECT BANK]';
        if(document.getElementById('lblBankAcc')) document.getElementById('lblBankAcc').innerText = '...';
        if(document.getElementById('lblBankIfsc')) document.getElementById('lblBankIfsc').innerText = '...';
        if(document.getElementById('lblBankMicr')) document.getElementById('lblBankMicr').innerText = '...';
        if(document.getElementById('lblBankBranch')) document.getElementById('lblBankBranch').innerText = '...';
    }

    if(document.getElementById('invoiceTableBody')) document.getElementById('invoiceTableBody').innerHTML = '';
    const itemsList = Array.isArray(data.items) ? data.items : [];
    itemsList.forEach((item) => createNewRow(item));
    if(itemsList.length === 0) createNewRow();
    calculateInvoiceCoreValues();
    lastSavedInvoiceFingerprint = preserveDocId ? getInvoiceFingerprint() : null;
    refreshInvoiceControllerUi(displayBankSnap);
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
    if(isSavingInvoice) return;

    calculateInvoiceCoreValues();
    refreshInvoiceControllerUi();

    const currentFingerprint = getInvoiceFingerprint();
    if(currentEditingDocId && lastSavedInvoiceFingerprint && currentFingerprint === lastSavedInvoiceFingerprint) {
        printInvoice();
        return;
    }

    const invNo = document.getElementById('invNo')?.value.trim().toUpperCase(); 
    const invDate = document.getElementById('invDate')?.value; 
    const billingState = document.getElementById('billingState')?.value; 
    const partyId = document.getElementById('partySelectMaster')?.value; 
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
    const bankData = getSelectedBankSnapshotOrNull();

    const invoiceData = {
        companyId: window.erpSession.companyId, invoiceNo: invNo, invoiceDate: invDate, customerId: document.getElementById('custId')?.value, dueDate: document.getElementById('dueDate')?.value, billingState: billingState,
        partyId, bankId: bankData.bankId, partySnapshot, bankSnapshot: bankData.bankSnapshot, clientName, items: items, totalTaxable: window.invoiceTotals.taxable, totalTax: window.invoiceTotals.tax, grandTotal: window.invoiceTotals.grand, updatedAt: new Date().toISOString()
    };
    
    const saveBtn = document.getElementById('triggerPrintBtn');
    const targetDocId = currentEditingDocId;
    const wasNewInvoice = !targetDocId;
    try {
        isSavingInvoice = true;
        refreshInvoiceActionButtonState();
        if (targetDocId) invoiceData.createdAt = window.invoiceCache[targetDocId]?.createdAt || new Date().toISOString();
        else invoiceData.createdAt = new Date().toISOString();
        
        const savedRef = await saveInvoiceDB(invoiceData, targetDocId);
        
        if(wasNewInvoice) {
            if(!savedRef?.id) throw new Error("Cloud save did not return an invoice document ID.");
            currentEditingDocId = savedRef.id;
            prepareNextInvoiceNoForFuture(invNo);
            logActivity("invoice_created", { invoiceNo: invNo });
        } else {
            currentEditingDocId = targetDocId;
            logActivity("invoice_updated", { invoiceNo: invNo });
        }

        if(currentEditingDocId) window.invoiceCache[currentEditingDocId] = { ...(window.invoiceCache[currentEditingDocId] || {}), ...invoiceData };
        lastSavedInvoiceFingerprint = getInvoiceFingerprint();
        
        window.clearFiltersTrigger(); 
        renderDashboardModule(window.erpSession.companyId); 
        setTimeout(() => { printInvoice(); }, 300);
    } catch (err) {
        if(confirm(`Cloud save failed (${err.message}). Print offline copy?`)) setTimeout(() => printInvoice(), 300);
    } finally {
        isSavingInvoice = false;
        if(saveBtn) saveBtn.disabled = false;
        refreshInvoiceControllerUi();
    }
};

window.editPastInvoice = function(id) { 
    const data = window.invoiceCache[id]; 
    if(data) { mapDataToForm(data, { docId: id }); window.scrollTo({ top: 0, behavior: 'smooth' }); }
};

window.downloadPastInvoiceDirectly = function(id) { 
    const data = window.invoiceCache[id]; 
    if(!data) return alert("Pichla invoice cache mein nahi mila.");
    if((currentEditingDocId && currentEditingDocId !== id) || (!currentEditingDocId && hasUnsavedData())) { 
        if(!confirm("Warning: Form mein data hai jo kho jaayega. Continue?")) return; 
    }
    mapDataToForm(data, { docId: id });
    const btn = document.getElementById('triggerPrintBtn');
    if(btn) refreshInvoiceActionButtonState();
    setTimeout(() => { printInvoice(); if(btn) setTimeout(() => { refreshInvoiceActionButtonState(); }, 3000); }, 300);
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

function handleInvoiceControllerFormEvent(event) {
    if(!event.target?.closest?.('#invoiceCoreContainer')) return;
    setTimeout(() => { refreshInvoiceControllerUi(); }, 0);
}

document.addEventListener('input', handleInvoiceControllerFormEvent);
document.addEventListener('change', handleInvoiceControllerFormEvent);
document.addEventListener('click', handleInvoiceControllerFormEvent);
