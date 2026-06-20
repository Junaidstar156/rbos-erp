import { loginUser, logoutUser, monitorAuthState, registerNewCompanySaaS } from './auth.js';
import { saveInvoiceDB, deleteInvoiceDB, saveProductDB, getProductsDB, deleteProductDB, fetchInvoicesAdvancedDB, savePartyDB, getPartiesDB, deletePartyDB, saveBankDB, getBanksDB, deleteBankDB, getCompanyProfileDB, saveCompanyProfileDB, runLegacyDataMigration } from './database.js';
import { calculateInvoiceData } from './invoice.js';

let currentEditingDocId = null;
let lastFetchedDocSnapshot = null; 
let activeAppliedFilters = {};      
let isAppInitialized = false; 

window.productMasterList = []; 
window.partyMasterList = []; 
window.bankMasterList = []; 
window.invoiceTotals = { taxable: 0, tax: 0, grand: 0 }; 
window.invoiceCache = {};

function formatINR(number) { return '₹' + number.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 }); }

function bindRowEventListeners(rowNode) {
    rowNode.querySelector('.qty-input').addEventListener('input', window.calculateInvoiceCoreValues);
    rowNode.querySelector('.rate-input').addEventListener('input', window.calculateInvoiceCoreValues);
    rowNode.querySelector('.disc-input').addEventListener('input', window.calculateInvoiceCoreValues);
    rowNode.querySelector('.gst-select').addEventListener('change', window.calculateInvoiceCoreValues);
    rowNode.querySelector('.delete-row-btn').addEventListener('click', () => { 
        rowNode.remove(); 
        if(document.querySelectorAll('.item-row').length === 0) createNewRow();
        window.calculateInvoiceCoreValues(); 
    });
}

function createNewRow(item = null) {
    const tableBody = document.getElementById('invoiceTableBody');
    const tr = document.createElement('tr');
    tr.className = 'border-b border-slate-300 item-row hover:bg-slate-50 transition-colors';
    tr.innerHTML = `
        <td class="py-2 px-1 border-r border-slate-300 text-center sr-num"></td>
        <td class="py-2 px-2 border-r border-slate-300 break-word-all relative">
            <input type="text" list="masterProductsList" onchange="window.handleProductSelection(this)" placeholder="Select Product..." class="item-desc w-full bg-transparent outline-none text-slate-900 font-sans py-0.5 break-word-all" data-pid="">
        </td>
        <td class="py-2 px-1 border-r border-slate-300 text-center"><input type="text" class="item-hsn w-full bg-transparent text-center outline-none"></td>
        <td class="py-2 px-1 border-r border-slate-300 text-center"><input type="number" min="0.01" step="0.01" value="1" class="qty-input w-full bg-transparent text-center outline-none font-bold"></td>
        <td class="py-2 px-1 border-r border-slate-300 text-center">
            <select class="unit-input bg-transparent outline-none text-center w-full font-sans text-slate-700">
                <option value="PCS" selected>PCS</option><option value="BOX">BOX</option><option value="KG">KG</option><option value="MTR">MTR</option><option value="LTR">LTR</option><option value="PAIR">PAIR</option><option value="NOS">NOS</option><option value="SET">SET</option><option value="ROLL">ROLL</option>
            </select>
        </td>
        <td class="py-2 px-2 border-r border-slate-300 text-right"><input type="number" min="0" placeholder="0" class="rate-input w-full bg-transparent text-right outline-none font-bold"></td>
        <td class="py-2 px-1 border-r border-slate-300 text-right"><input type="number" min="0" value="0" class="disc-input w-full bg-transparent text-right outline-none text-red-600 font-bold"></td>
        <td class="py-2 px-1 border-r border-slate-300 text-center">
            <select class="gst-select bg-transparent outline-none text-center w-full font-bold">
                <option value="0">0%</option><option value="5">5%</option><option value="12">12%</option><option value="18" selected>18%</option><option value="28">28%</option>
            </select>
        </td>
        <td class="py-2 px-1 border-r border-slate-300 text-right text-slate-600 cgst-col cgst-val">₹0.00</td>
        <td class="py-2 px-1 border-r border-slate-300 text-right text-slate-600 cgst-col sgst-val">₹0.00</td>
        <td class="py-2 px-1 border-r border-slate-300 text-right text-slate-600 igst-col igst-val">₹0.00</td>
        <td class="py-2 px-2 border-r border-slate-300 text-right font-bold text-blue-900 total-val">₹0.00</td>
        <td class="py-2 px-1 text-center no-print"><button class="delete-row-btn text-red-600 hover:text-red-800 font-bold px-1 text-xs">❌</button></td>
    `;
    tableBody.appendChild(tr);

    if(item) {
        tr.querySelector('.item-desc').value = item.desc || '';
        tr.querySelector('.item-desc').dataset.pid = item.productId || '';
        tr.querySelector('.item-hsn').value = item.hsn || '';
        tr.querySelector('.qty-input').value = item.qty || 1;
        tr.querySelector('.unit-input').value = item.unit || 'PCS';
        tr.querySelector('.rate-input').value = item.rate || 0;
        tr.querySelector('.disc-input').value = item.disc || 0;
        tr.querySelector('.gst-select').value = item.gst || 0;
    }
    bindRowEventListeners(tr);
}

function resetInvoiceForm() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('invDate').value = today;
    document.getElementById('dueDate').value = today;
    
    const prefix = window.erpSession.profile?.invoicePrefix || "INV";
    const savedInv = localStorage.getItem(`rbos_invNo_${window.erpSession.companyId}`);
    document.getElementById('invNo').value = savedInv || `${prefix}/001`;
    
    document.getElementById('partySelectMaster').value = '';
    document.getElementById('custId').value = '';
    document.getElementById('clientName').value = '';
    document.getElementById('clientAddress').value = '';
    document.getElementById('clientGstin').value = '';
    document.getElementById('clientPan').value = '';
    document.getElementById('clientMob').value = '';

    document.getElementById('billingState').value = 'intra';
    document.getElementById('invoiceTableBody').innerHTML = '';
    
    currentEditingDocId = null;
    createNewRow(); 
    window.calculateInvoiceCoreValues();

    const savedBankId = localStorage.getItem(`rbos_bankId_${window.erpSession.companyId}`);
    const defaultBank = window.bankMasterList.find(b => b.id === savedBankId) || (window.bankMasterList.length === 1 ? window.bankMasterList[0] : null);
    if(defaultBank) {
        document.getElementById('bankSelectMaster').value = defaultBank.id;
        window.handleBankSelection();
    } else {
        document.getElementById('bankSelectMaster').value = '';
        document.getElementById('lblBankName').innerText = '[SELECT BANK]'; 
        document.getElementById('lblBankAcc').innerText = '...'; 
        document.getElementById('lblBankIfsc').innerText = '...'; 
        document.getElementById('lblBankMicr').innerText = '...'; 
        document.getElementById('lblBankBranch').innerText = '...';
    }
}

function incrementInvoiceNo() {
    const invInput = document.getElementById('invNo');
    const match = invInput.value.trim().match(/^(.*?)(\d+)$/);
    if(match) {
        const prefix = match[1];
        const numStr = match[2];
        const nextNum = (parseInt(numStr, 10) + 1).toString().padStart(numStr.length, '0');
        invInput.value = prefix + nextNum;
        localStorage.setItem(`rbos_invNo_${window.erpSession.companyId}`, invInput.value);
    }
}

async function initCompanyProfile() {
    try {
        let profile = await getCompanyProfileDB(window.erpSession.companyId);
        if(!profile) {
            profile = {
                companyId: window.erpSession.companyId,
                companyName: "RBOS FITMENT COMPANY",
                address: "413/3, Pal Samaj Road, State Bank of India ATM,\nPutha Village, Meerut Uttar Pradesh - 250002",
                gstin: "09SEBPS8571F1ZM",
                mobile: "+917505959979",
                email: "realmaptech@gmail.com",
                invoicePrefix: "RFC",
                logoUrl: ""
            };
            await saveCompanyProfileDB(window.erpSession.companyId, profile);
        }
        window.erpSession.profile = profile;
        renderDynamicCompanyHeaders();
    } catch (err) { console.error("Failed to load company profile:", err); }
}

function renderDynamicCompanyHeaders() {
    const p = window.erpSession.profile;
    if(!p) return;
    document.getElementById('headerCompanyName').innerText = p.companyName;
    document.getElementById('headerAddress').innerHTML = `
        <div>ADD: ${p.address.replace(/\n/g, '<br>')}</div>
        <div>Phone: ${p.mobile} | E-mail: ${p.email}</div>
        ${p.gstin ? `<div class="font-mono font-bold text-slate-900 mt-1 bg-blue-50 px-2 py-0.5 rounded inline-block">GSTIN NO: ${p.gstin}</div>` : ''}
    `;
    document.getElementById('footerSignatoryName').innerText = p.companyName;
    
    document.getElementById('setCompName').value = p.companyName;
    document.getElementById('setCompAddress').value = p.address;
    document.getElementById('setCompGstin').value = p.gstin || '';
    document.getElementById('setCompMob').value = p.mobile || '';
    document.getElementById('setCompEmail').value = p.email || '';
    document.getElementById('setCompPrefix').value = p.invoicePrefix || '';
}

window.toggleSettingsModal = function(show) { document.getElementById('settingsModal').classList.toggle('hidden', !show); };

window.saveCompanySettings = async function(e) {
    e.preventDefault();
    const btn = document.getElementById('saveSettingsBtn');
    const gstin = document.getElementById('setCompGstin').value.trim().toUpperCase();
    if(gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gstin)) {
        alert("Company GSTIN format galat hai! Check karo."); return;
    }
    const updatedProfile = {
        companyId: window.erpSession.companyId,
        companyName: document.getElementById('setCompName').value.trim(),
        address: document.getElementById('setCompAddress').value.trim(),
        gstin: gstin,
        mobile: document.getElementById('setCompMob').value.trim(),
        email: document.getElementById('setCompEmail').value.trim(),
        invoicePrefix: document.getElementById('setCompPrefix').value.trim().toUpperCase(),
        logoUrl: "" 
    };
    try {
        btn.innerText = "Saving..."; btn.disabled = true;
        await saveCompanyProfileDB(window.erpSession.companyId, updatedProfile);
        window.erpSession.profile = updatedProfile;
        renderDynamicCompanyHeaders();
        alert("Company Settings Updated Successfully!");
        window.toggleSettingsModal(false);
    } catch (error) { alert("Failed to save settings: " + error.message); } 
    finally { btn.innerText = "Save Settings"; btn.disabled = false; }
};

window.migrateLegacyData = async function() {
    const btn = document.getElementById('migrateDataBtn');
    if(!btn) return;
    if(!confirm("Warning: This will link all legacy data to the new Cloud Engine. Continue?")) return;
    try {
        btn.innerText = "Migrating... Please Wait"; btn.disabled = true;
        const totalMigrated = await runLegacyDataMigration(window.erpSession.companyId);
        alert(`Migration Successful! ${totalMigrated} legacy records successfully linked.`);
        window.location.reload(); 
    } catch(err) { alert("Migration failed: " + err.message); } 
    finally { btn.innerHTML = "<span>⚠️ Run Legacy Data Migration</span>"; btn.disabled = false; }
};

async function fetchProductMaster() {
    try {
        const snapshot = await getProductsDB(window.erpSession.companyId);
        const datalist = document.getElementById('masterProductsList');
        datalist.innerHTML = ''; window.productMasterList = [];
        snapshot.forEach(docSnap => {
            const data = docSnap.data(); data.id = docSnap.id;
            window.productMasterList.push(data);
            const option = document.createElement('option');
            option.value = data.quality ? `${data.desc} - ${data.quality}` : data.desc;
            datalist.appendChild(option);
        });
    } catch (err) { console.warn("Products failed: " + err.message); }
}

async function fetchPartyMaster() {
    try {
        const snapshot = await getPartiesDB(window.erpSession.companyId);
        const selectBox = document.getElementById('partySelectMaster');
        const filterBox = document.getElementById('clientList');
        selectBox.innerHTML = '<option value="">-- Select Party --</option>'; filterBox.innerHTML = ''; window.partyMasterList = [];
        snapshot.forEach(docSnap => {
            const data = docSnap.data(); data.id = docSnap.id; window.partyMasterList.push(data);
            const option = document.createElement('option'); option.value = data.id; option.textContent = data.partyName; selectBox.appendChild(option);
            const filterOption = document.createElement('option'); filterOption.value = data.partyName; filterBox.appendChild(filterOption);
        });
    } catch (err) { console.warn("Parties failed: " + err.message); }
}

async function fetchBankMaster() {
    try {
        const snapshot = await getBanksDB(window.erpSession.companyId);
        const selectBox = document.getElementById('bankSelectMaster');
        selectBox.innerHTML = '<option value="">-- Select Bank --</option>'; window.bankMasterList = [];
        snapshot.forEach(docSnap => {
            const data = docSnap.data(); data.id = docSnap.id; window.bankMasterList.push(data);
            const option = document.createElement('option'); option.value = data.id; option.textContent = data.label; selectBox.appendChild(option);
        });
        const savedBankId = localStorage.getItem(`rbos_bankId_${window.erpSession.companyId}`);
        const defaultId = (window.bankMasterList.find(b => b.id === savedBankId)?.id) || (window.bankMasterList.length === 1 ? window.bankMasterList[0].id : '');
        if(defaultId) { selectBox.value = defaultId; window.handleBankSelection(); }
    } catch (err) { console.warn("Banks failed: " + err.message); }
}

function mapDataToForm(data) {
    resetInvoiceForm();
    document.getElementById('invNo').value = data.invoiceNo || '';
    document.getElementById('invDate').value = data.invoiceDate || '';
    document.getElementById('custId').value = data.customerId || '';
    document.getElementById('dueDate').value = data.dueDate || '';
    if(data.billingState) document.getElementById('billingState').value = data.billingState;
    if(data.partyId) document.getElementById('partySelectMaster').value = data.partyId;
    if(data.bankId) document.getElementById('bankSelectMaster').value = data.bankId;

    const partySnap = data.partySnapshot || {};
    document.getElementById('clientName').value = partySnap.name || data.clientName || '';
    document.getElementById('clientAddress').value = partySnap.address || data.clientAddress || '';
    document.getElementById('clientGstin').value = partySnap.gstin || data.clientGstin || '';
    document.getElementById('clientPan').value = partySnap.pan || data.clientPan || '';
    document.getElementById('clientMob').value = partySnap.mobile || data.clientMob || '';

    const bankSnap = data.bankSnapshot || {};
    document.getElementById('lblBankName').innerText = bankSnap.bankName || '[LEGACY INVOICE BANK]';
    document.getElementById('lblBankAcc').innerText = bankSnap.accountNumber || '';
    document.getElementById('lblBankIfsc').innerText = bankSnap.ifsc || '';
    document.getElementById('lblBankMicr').innerText = bankSnap.micr || '';
    document.getElementById('lblBankBranch').innerText = bankSnap.branch || '';

    document.getElementById('invoiceTableBody').innerHTML = '';
    const itemsList = Array.isArray(data.items) ? data.items : [];
    itemsList.forEach((item) => createNewRow(item));
    if(itemsList.length === 0) createNewRow();
    window.calculateInvoiceCoreValues();
}

function hasUnsavedData() {
    const firstRowDesc = document.querySelector('.item-desc');
    return (document.getElementById('clientName').value.trim() !== '' || (firstRowDesc && firstRowDesc.value.trim() !== ''));
}

function renderInvoiceRowRecords(docSnap, append = false) {
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
        <td class="py-2.5 px-3">${data.invoiceDate || 'N/A'}</td>
        <td class="py-2.5 px-3 text-white font-bold">${data.invoiceNo}</td>
        <td class="py-2.5 px-3 font-sans text-slate-200">${displayName}</td>
        <td class="py-2.5 px-3 text-emerald-400 font-bold">₹${(data.grandTotal || 0).toLocaleString('en-IN', {minimumFractionDigits: 2})}</td>
        <td class="py-2.5 px-3 text-center flex justify-center gap-1.5">
            <button onclick="window.downloadPastInvoiceDirectly('${docSnap.id}')" class="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-1 px-2.5 rounded text-[10px]">Download</button>
            <button onclick="window.editPastInvoice('${docSnap.id}')" class="bg-blue-600 hover:bg-blue-500 text-white font-bold py-1 px-2 rounded text-[10px]">Edit</button>
            <button onclick="window.deleteInvoiceFromCloud('${docSnap.id}')" class="bg-red-600 hover:bg-red-500 text-white font-bold py-1 px-2 rounded text-[10px]">Delete</button>
        </td>
    `;
    historyBody.appendChild(tr);
}

async function loadInvoiceHistoryBatch(append = false) {
    const historyBody = document.getElementById('historyTableBody');
    const loadMoreBtn = document.getElementById('loadMoreRecordsBtn');
    if(!historyBody) return;
    if (!append) {
        historyBody.innerHTML = `<tr><td colspan="5" class="py-4 text-center text-slate-400 font-mono text-xs">⚡ Querying Cloud Storage...</td></tr>`;
        lastFetchedDocSnapshot = null; window.invoiceCache = {}; 
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
    } catch (err) {
        let msg = err.message;
        if(msg.includes('requires an index')) msg = "Firestore Index Required! Check console for creation link.";
        historyBody.innerHTML = `<tr><td colspan="5" class="py-4 text-center text-red-400 font-mono text-xs">⚠️ ${msg}</td></tr>`;
    }
}

window.calculateInvoiceCoreValues = function() {
    const rows = document.querySelectorAll('.item-row');
    const billingState = document.getElementById('billingState').value;
    const container = document.getElementById('invoiceCoreContainer');
    if(container) {
        container.classList.remove('state-intra', 'state-inter');
        container.classList.add(billingState === 'inter' ? 'state-inter' : 'state-intra');
    }
    const rowNodes = Array.from(rows); 
    const itemsData = rowNodes.map((row, index) => {
        row.querySelector('.sr-num').innerText = index + 1;
        return {
            rate: parseFloat(row.querySelector('.rate-input').value) || 0,
            qty: parseFloat(row.querySelector('.qty-input').value) || 1,
            disc: parseFloat(row.querySelector('.disc-input').value) || 0,
            gst: parseFloat(row.querySelector('.gst-select').value) || 0
        };
    });
    const engineResult = calculateInvoiceData(itemsData, billingState);
    engineResult.itemsMath.forEach((mathData, index) => {
        const rowNode = rowNodes[index];
        rowNode.querySelector('.cgst-val').innerText = formatINR(mathData.rowCgst); 
        rowNode.querySelector('.sgst-val').innerText = formatINR(mathData.rowSgst); 
        rowNode.querySelector('.igst-val').innerText = formatINR(mathData.rowIgst);
        rowNode.querySelector('.total-val').innerText = formatINR(mathData.finalRowValue);
    });
    window.invoiceTotals.taxable = engineResult.totals.taxable;
    window.invoiceTotals.tax = engineResult.totals.tax;
    window.invoiceTotals.grand = engineResult.totals.grand;

    document.getElementById('totalRateSum').innerText = formatINR(engineResult.totals.taxable);
    document.getElementById('totalDiscountSum').innerText = formatINR(engineResult.totals.discount); 
    document.getElementById('totalCgstSum').innerText = formatINR(engineResult.totals.cgstSum);
    document.getElementById('totalSgstSum').innerText = formatINR(engineResult.totals.sgstSum);
    document.getElementById('totalIgstSum').innerText = formatINR(engineResult.totals.igstSum);
    document.getElementById('totalGrandSum').innerText = formatINR(engineResult.totals.grand);
    
    if(document.getElementById('blockTaxable')) {
        document.getElementById('blockTaxable').innerText = formatINR(engineResult.totals.taxable);
        document.getElementById('blockTaxRate').innerText = engineResult.totals.displayRate;
        document.getElementById('blockTaxDue').innerText = formatINR(engineResult.totals.tax);
        document.getElementById('blockGrandTotal').innerText = formatINR(engineResult.totals.grand);
    }
};

window.addManualRow = function() { createNewRow(); window.calculateInvoiceCoreValues(); };
document.addEventListener('DOMContentLoaded', () => { resetInvoiceForm(); });

// ==========================================
// 🚀 MULTI-TENANT SAAS ONBOARDING & AUTH (Final)
// ==========================================

window.toggleAuthMode = function(mode) {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const errorDiv = document.getElementById('authErrorMsg');
    if(errorDiv) errorDiv.classList.add('hidden'); 
    
    if(mode === 'register') {
        if(loginForm) loginForm.classList.add('hidden');
        if(registerForm) registerForm.classList.remove('hidden');
    } else {
        if(registerForm) registerForm.classList.add('hidden');
        if(loginForm) loginForm.classList.remove('hidden');
    }
};

window.closeWelcomeModal = function() {
    const modal = document.getElementById('welcomeModal');
    if(modal) modal.classList.add('hidden');
};

window.handleFirebaseRegister = async function(e) {
    e.preventDefault();
    const compName = document.getElementById('regCompanyName').value.trim();
    const ownerName = document.getElementById('regOwnerName').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const pass = document.getElementById('regPassword').value;
    const confPass = document.getElementById('regConfirmPassword').value;
    const regBtn = document.getElementById('regBtn');
    const errorDiv = document.getElementById('authErrorMsg');

    if(errorDiv) errorDiv.classList.add('hidden');

    if (pass.length < 8) {
        if(errorDiv) { errorDiv.innerText = "Password must be at least 8 characters long."; errorDiv.classList.remove('hidden'); } return;
    }
    if (pass !== confPass) {
        if(errorDiv) { errorDiv.innerText = "Passwords do not match."; errorDiv.classList.remove('hidden'); } return;
    }

    try {
        regBtn.innerText = "Creating Workspace..."; regBtn.disabled = true;
        await registerNewCompanySaaS(compName, ownerName, email, pass);
        sessionStorage.setItem("rbos_firstRun", "true"); 
        await onAuthSessionReady(true); 
    } catch (err) { 
        if(errorDiv) { errorDiv.innerText = "Registration Error: " + err.message; errorDiv.classList.remove('hidden'); }
        regBtn.innerText = "Start Using ERP"; regBtn.disabled = false; 
    }
};

window.handleFirebaseLogin = async function(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const pass = document.getElementById('loginPassword').value;
    const loginBtn = document.getElementById('loginBtn');
    const errorDiv = document.getElementById('authErrorMsg');
    if(errorDiv) errorDiv.classList.add('hidden');

    try {
        loginBtn.innerText = "Authenticating..."; loginBtn.disabled = true;
        await loginUser(email, pass);
        setTimeout(() => {
            if (loginBtn.innerText === "Authenticating...") {
                loginBtn.innerText = "Secure Login"; loginBtn.disabled = false;
            }
        }, 5000);
    } catch (err) { 
        if(errorDiv) { errorDiv.innerText = "Login Error: Incorrect email or password."; errorDiv.classList.remove('hidden'); }
        loginBtn.innerText = "Secure Login"; loginBtn.disabled = false; 
    }
};

window.handleFirebaseLogout = async function() { 
    if(confirm("Are you sure you want to logout?")) {
        try { await logoutUser(); } catch(err) { alert("Logout failed: " + err.message); }
    }
};

// ==========================================
// 🛡️ TIMEOUT-BASED FAILSAFE ENGINE
// ==========================================
let authResolutionFailsafe = setTimeout(() => {
    const loader = document.getElementById('globalLoader');
    const authSec = document.getElementById('authSection');
    if (loader && !loader.classList.contains('opacity-0')) {
        console.warn('Auth state resolution timed out — revealing login form fallback.');
        loader.classList.remove('opacity-100');
        loader.classList.add('opacity-0');
        setTimeout(() => { loader.classList.add('hidden'); }, 300);
        if(authSec) authSec.classList.remove('hidden');
    }
}, 8000); 

// ==========================================
// 🚀 STATE RESOLVER CORE ENGINE
// ==========================================
async function onAuthSessionReady(user) {
    clearTimeout(authResolutionFailsafe);  
    const loader = document.getElementById('globalLoader');
    if (loader && !loader.classList.contains('hidden')) {
        loader.classList.remove('opacity-100');
        loader.classList.add('opacity-0');
        setTimeout(() => { loader.classList.add('hidden'); }, 300);
    }

    if (user) {
        document.getElementById('authSection').classList.add('hidden');
        document.getElementById('appDashboardSection').classList.remove('hidden');
        if(!isAppInitialized) {
            isAppInitialized = true;
            await initCompanyProfile(); resetInvoiceForm(); loadInvoiceHistoryBatch(false); 
            fetchProductMaster(); fetchPartyMaster(); fetchBankMaster();
            if (sessionStorage.getItem("rbos_firstRun") === "true") {
                const welcomeModal = document.getElementById('welcomeModal');
                if (welcomeModal) welcomeModal.classList.remove('hidden');
                sessionStorage.removeItem("rbos_firstRun");
            }
        }
    } else {
        isAppInitialized = false;
        window.invoiceCache = {}; window.productMasterList = []; window.partyMasterList = []; window.bankMasterList = [];
        lastFetchedDocSnapshot = null; activeAppliedFilters = {};
        const appDash = document.getElementById('appDashboardSection');
        const authSec = document.getElementById('authSection');
        if(appDash) appDash.classList.add('hidden');
        if(authSec) authSec.classList.remove('hidden');
        if(typeof window.toggleAuthMode === 'function') window.toggleAuthMode('login'); 
        
        const loginBtn = document.getElementById('loginBtn');
        if(loginBtn) { loginBtn.innerText = "Secure Login"; loginBtn.disabled = false; }
        const regBtn = document.getElementById('regBtn');
        if(regBtn) { regBtn.innerText = "Start Using ERP"; regBtn.disabled = false; }
    }
}

monitorAuthState(onAuthSessionReady);

// ==========================================
// MASTERS & INVOICE CLOUD SYNC CONTROLLERS
// ==========================================

window.toggleProductModal = function(show) { document.getElementById('productModal').classList.toggle('hidden', !show); };
window.togglePartyModal = function(show) { document.getElementById('partyModal').classList.toggle('hidden', !show); };
window.toggleBankModal = function(show) { document.getElementById('bankModal').classList.toggle('hidden', !show); };

window.saveProductToMaster = async function(e) {
    e.preventDefault();
    const btn = document.getElementById('saveProdBtn');
    const desc = document.getElementById('prodDesc').value.trim();
    const quality = document.getElementById('prodQuality').value.trim();
    const unit = document.getElementById('prodUnit').value; 
    const docId = `${window.erpSession.companyId}-${desc}-${quality}`.toLowerCase().replace(/[^a-z0-9]/g, '-'); 
    try {
        btn.innerText = "Saving..."; btn.disabled = true;
        await saveProductDB(docId, { 
            companyId: window.erpSession.companyId, desc, quality, 
            hsn: document.getElementById('prodHsn').value.trim(), 
            rate: parseFloat(document.getElementById('prodRate').value) || 0, 
            gst: parseFloat(document.getElementById('prodGst').value) || 0, unit: unit 
        });
        alert("Product Saved!"); document.getElementById('productMasterForm').reset(); window.toggleProductModal(false); fetchProductMaster(); 
    } catch (err) { alert("Failed: " + err.message); } finally { btn.innerText = "Save Product"; btn.disabled = false; }
};

window.deleteProductFromMaster = async function() {
    const desc = document.getElementById('prodDesc').value.trim();
    const quality = document.getElementById('prodQuality').value.trim();
    if(!desc) return;
    const docId = `${window.erpSession.companyId}-${desc}-${quality}`.toLowerCase().replace(/[^a-z0-9]/g, '-'); 
    if(confirm(`Delete '${desc}'?`)) { await deleteProductDB(docId); document.getElementById('productMasterForm').reset(); window.toggleProductModal(false); fetchProductMaster(); }
};

window.savePartyToMaster = async function(e) {
    e.preventDefault();
    const btn = document.getElementById('savePartyBtn');
    const partyName = document.getElementById('partyNameModal').value.trim();
    const docId = `${window.erpSession.companyId}-${partyName}`.toLowerCase().replace(/[^a-z0-9]/g, '-'); 
    try {
        btn.innerText = "Saving..."; btn.disabled = true;
        await savePartyDB(docId, { 
            companyId: window.erpSession.companyId, partyName, 
            address: document.getElementById('partyAddrModal').value.trim(), 
            gstin: document.getElementById('partyGstinModal').value.trim().toUpperCase(), 
            pan: document.getElementById('partyPanModal').value.trim().toUpperCase(), 
            mobile: document.getElementById('partyMobModal').value.trim(), 
            email: document.getElementById('partyEmailModal').value.trim() 
        });
        alert("Party Saved!"); document.getElementById('partyMasterForm').reset(); window.togglePartyModal(false); await fetchPartyMaster(); 
        document.getElementById('partySelectMaster').value = docId; window.handlePartySelection();
    } catch (err) { alert("Failed: " + err.message); } finally { btn.innerText = "Save Party"; btn.disabled = false; }
};

window.deletePartyFromMaster = async function() {
    const partyName = document.getElementById('partyNameModal').value.trim();
    if(!partyName) return;
    const docId = `${window.erpSession.companyId}-${partyName}`.toLowerCase().replace(/[^a-z0-9]/g, '-'); 
    if(confirm(`Delete Party '${partyName}'?`)) { await deletePartyDB(docId); document.getElementById('partyMasterForm').reset(); window.togglePartyModal(false); fetchPartyMaster(); }
};

window.saveBankToMaster = async function(e) {
    e.preventDefault();
    const btn = document.getElementById('saveBankBtn');
    const label = document.getElementById('bankLabelModal').value.trim().toUpperCase();
    const docId = `${window.erpSession.companyId}-${label}`.toLowerCase().replace(/[^a-z0-9]/g, '-'); 
    try {
        btn.innerText = "Saving..."; btn.disabled = true;
        await saveBankDB(docId, { 
            companyId: window.erpSession.companyId, label, 
            bankName: document.getElementById('bankNameModal').value.trim(), 
            accountNumber: document.getElementById('bankAccModal').value.trim(), 
            ifsc: document.getElementById('bankIfscModal').value.trim().toUpperCase(), 
            micr: document.getElementById('bankMicrModal').value.trim(), 
            branch: document.getElementById('bankBranchModal').value.trim() 
        });
        alert("Bank Saved!"); document.getElementById('bankMasterForm').reset(); window.toggleBankModal(false); await fetchBankMaster(); 
        document.getElementById('bankSelectMaster').value = docId; window.handleBankSelection();
    } catch (err) { alert("Failed: " + err.message); } finally { btn.innerText = "Save Bank"; btn.disabled = false; }
};

window.deleteBankFromMaster = async function() {
    const label = document.getElementById('bankLabelModal').value.trim();
    if(!label) return;
    const docId = `${window.erpSession.companyId}-${label}`.toLowerCase().replace(/[^a-z0-9]/g, '-'); 
    if(confirm(`Delete Bank '${label}'?`)) { await deleteBankDB(docId); document.getElementById('bankMasterForm').reset(); window.toggleBankModal(false); fetchBankMaster(); }
};

window.handleProductSelection = function(inputElement) {
    inputElement.dataset.pid = ''; 
    const selectedVal = inputElement.value;
    const foundProduct = window.productMasterList.find(p => `${p.desc} - ${p.quality || ''}` === selectedVal || p.desc === selectedVal);
    if(foundProduct) {
        inputElement.dataset.pid = foundProduct.id;
        const row = inputElement.closest('tr');
        row.querySelector('.item-hsn').value = foundProduct.hsn;
        row.querySelector('.rate-input').value = foundProduct.rate;
        row.querySelector('.gst-select').value = foundProduct.gst;
        row.querySelector('.unit-input').value = foundProduct.unit || 'PCS';
        window.calculateInvoiceCoreValues();
    }
};

window.handlePartySelection = function() {
    const pId = document.getElementById('partySelectMaster').value;
    const party = window.partyMasterList.find(p => p.id === pId);
    if(party) {
        document.getElementById('clientName').value = party.partyName;
        document.getElementById('clientAddress').value = party.address;
        document.getElementById('clientGstin').value = party.gstin;
        document.getElementById('clientPan').value = party.pan;
        document.getElementById('clientMob').value = party.mobile;
    } else {
        document.getElementById('clientName').value = ''; document.getElementById('clientAddress').value = ''; document.getElementById('clientGstin').value = ''; document.getElementById('clientPan').value = ''; document.getElementById('clientMob').value = '';
    }
};

window.handleBankSelection = function() {
    const bId = document.getElementById('bankSelectMaster').value;
    if(bId) localStorage.setItem(`rbos_bankId_${window.erpSession.companyId}`, bId);
    const bank = window.bankMasterList.find(b => b.id === bId);
    if(bank) {
        document.getElementById('lblBankName').innerText = bank.bankName;
        document.getElementById('lblBankAcc').innerText = bank.accountNumber;
        document.getElementById('lblBankIfsc').innerText = bank.ifsc;
        document.getElementById('lblBankMicr').innerText = bank.micr || 'N/A';
        document.getElementById('lblBankBranch').innerText = bank.branch;
    } else {
        document.getElementById('lblBankName').innerText = '[SELECT BANK]'; document.getElementById('lblBankAcc').innerText = '...'; document.getElementById('lblBankIfsc').innerText = '...'; document.getElementById('lblBankMicr').innerText = '...'; document.getElementById('lblBankBranch').innerText = '...';
    }
};

window.applyFiltersTrigger = function() {
    activeAppliedFilters = {
        startDate: document.getElementById('filterStartDate').value || null,
        endDate: document.getElementById('filterEndDate').value || null,
        invoiceNo: document.getElementById('filterInvNo').value.trim().toUpperCase() || null,
        clientName: document.getElementById('filterClientName').value.trim() || null
    };
    if(!activeAppliedFilters.startDate && !activeAppliedFilters.endDate && !activeAppliedFilters.invoiceNo && !activeAppliedFilters.clientName) activeAppliedFilters = {};
    loadInvoiceHistoryBatch(false);
};

window.clearFiltersTrigger = function() {
    document.getElementById('filterStartDate').value = ''; document.getElementById('filterEndDate').value = ''; document.getElementById('filterInvNo').value = ''; document.getElementById('filterClientName').value = '';
    activeAppliedFilters = {}; loadInvoiceHistoryBatch(false);
};

window.loadNextBatchTrigger = function() { loadInvoiceHistoryBatch(true); };

window.saveInvoiceToFirebase = async function() {
    window.calculateInvoiceCoreValues();
    const invNo = document.getElementById('invNo').value.trim().toUpperCase();
    const invDate = document.getElementById('invDate').value;
    const billingState = document.getElementById('billingState').value;
    const partyId = document.getElementById('partySelectMaster').value;
    const bankId = document.getElementById('bankSelectMaster').value;
    const clientName = document.getElementById('clientName').value.trim();

    if(!invNo || !clientName || !invDate) return alert("Invoice Number, Date, and Client Name are required!");
    const items = Array.from(document.querySelectorAll('.item-row')).map(row => ({
        productId: row.querySelector('.item-desc').dataset.pid || null,
        desc: row.querySelector('.item-desc').value.trim(),
        hsn: row.querySelector('.item-hsn').value.trim(),
        qty: parseFloat(row.querySelector('.qty-input').value) || 1,
        unit: row.querySelector('.unit-input').value,
        rate: parseFloat(row.querySelector('.rate-input').value) || 0,
        disc: parseFloat(row.querySelector('.disc-input').value) || 0,
        gst: parseFloat(row.querySelector('.gst-select').value) || 0
    })).filter(item => item.desc !== '');

    if(items.length === 0) return alert("Please add at least one valid product.");
    const partySnapshot = { name: clientName, address: document.getElementById('clientAddress').value.trim(), gstin: document.getElementById('clientGstin').value.trim().toUpperCase(), pan: document.getElementById('clientPan').value.trim().toUpperCase(), mobile: document.getElementById('clientMob').value.trim() };
    const bankSnapshot = { bankName: document.getElementById('lblBankName').innerText, accountNumber: document.getElementById('lblBankAcc').innerText, ifsc: document.getElementById('lblBankIfsc').innerText, micr: document.getElementById('lblBankMicr').innerText, branch: document.getElementById('lblBankBranch').innerText };

    const invoiceData = {
        companyId: window.erpSession.companyId, invoiceNo: invNo, invoiceDate: invDate, customerId: document.getElementById('custId').value,
        dueDate: document.getElementById('dueDate').value, billingState: billingState,
        partyId, bankId, partySnapshot, bankSnapshot, clientName, items: items, 
        totalTaxable: window.invoiceTotals.taxable, totalTax: window.invoiceTotals.tax, grandTotal: window.invoiceTotals.grand, updatedAt: new Date().toISOString()
    };
    const saveBtn = document.getElementById('triggerPrintBtn');
    try {
        saveBtn.innerText = "Syncing Cloud..."; saveBtn.disabled = true;
        const wasEditing = !!currentEditingDocId; 
        if (wasEditing) invoiceData.createdAt = window.invoiceCache[currentEditingDocId]?.createdAt || new Date().toISOString();
        else invoiceData.createdAt = new Date().toISOString();
        await saveInvoiceDB(invoiceData, currentEditingDocId);
        currentEditingDocId = null; 
        if(!wasEditing) incrementInvoiceNo();
        saveBtn.innerText = "🖨️ Print / Save Document Invoice"; saveBtn.disabled = false;
        window.clearFiltersTrigger();
        setTimeout(() => { window.print(); }, 300);
    } catch (err) {
        saveBtn.innerText = "🖨️ Print / Save Document Invoice"; saveBtn.disabled = false;
        if(confirm(`Cloud save failed (${err.message}). Print offline copy?`)) setTimeout(() => window.print(), 300);
    }
};

window.editPastInvoice = function(id) { const data = window.invoiceCache[id]; if(data) { currentEditingDocId = id; mapDataToForm(data); window.scrollTo({ top: 0, behavior: 'smooth' }); } };

window.downloadPastInvoiceDirectly = function(id) { 
    const data = window.invoiceCache[id]; if(!data) return alert("Pichla invoice cache mein nahi mila.");
    if((currentEditingDocId && currentEditingDocId !== id) || (!currentEditingDocId && hasUnsavedData())) { if(!confirm("Warning: Form mein data hai jo kho jaayega. Continue?")) return; }
    currentEditingDocId = null; mapDataToForm(data); 
    const btn = document.getElementById('triggerPrintBtn');
    if(btn) btn.innerText = "📥 Downloaded — New/Clear to start fresh";
    setTimeout(() => { window.print(); if(btn) setTimeout(() => { btn.innerText = "🖨️ Print / Save Document Invoice"; }, 3000); }, 300);
};

window.deleteInvoiceFromCloud = async function(id) { 
    if (confirm("🚨 Warning: Delete this invoice permanently?")) {
        try {
            await deleteInvoiceDB(id); const targetRow = document.getElementById(`history-row-${id}`); if(targetRow) targetRow.remove();
            if(currentEditingDocId === id) { currentEditingDocId = null; resetInvoiceForm(); alert("Editing wali invoice delete ho gayi."); }
        } catch(err) { alert("Failed to delete! " + err.message); }
    }
};

window.confirmFreshInvoice = function() {
    if(currentEditingDocId || hasUnsavedData()) { if(confirm("Form mein data hai jo kho jaayega. Clear karein?")) resetInvoiceForm(); } else resetInvoiceForm();
};
