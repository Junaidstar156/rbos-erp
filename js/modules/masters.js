import { getProductsDB, getPartiesDB, getBanksDB, saveProductDB, deleteProductDB, savePartyDB, deletePartyDB, saveBankDB, deleteBankDB } from '../database.js';
import { renderDashboardModule } from './dashboard.js';
import { logActivity } from './audit.js';

export async function fetchProductMaster() {
    try {
        const snapshot = await getProductsDB(window.erpSession.companyId);
        const datalist = document.getElementById('masterProductsList');
        if(!datalist) return;
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

export async function fetchPartyMaster() {
    try {
        const snapshot = await getPartiesDB(window.erpSession.companyId);
        const selectBox = document.getElementById('partySelectMaster');
        const filterBox = document.getElementById('clientList');
        if(selectBox) selectBox.innerHTML = '<option value="">-- Select Party --</option>'; 
        if(filterBox) filterBox.innerHTML = ''; window.partyMasterList = [];
        snapshot.forEach(docSnap => {
            const data = docSnap.data(); data.id = docSnap.id; window.partyMasterList.push(data);
            if(selectBox) { const option = document.createElement('option'); option.value = data.id; option.textContent = data.partyName; selectBox.appendChild(option); }
            if(filterBox) { const filterOption = document.createElement('option'); filterOption.value = data.partyName; filterBox.appendChild(filterOption); }
        });
    } catch (err) { console.warn("Parties failed: " + err.message); }
}

export async function fetchBankMaster() {
    try {
        const snapshot = await getBanksDB(window.erpSession.companyId);
        const selectBox = document.getElementById('bankSelectMaster');
        if(selectBox) selectBox.innerHTML = '<option value="">-- Select Bank --</option>'; window.bankMasterList = [];
        snapshot.forEach(docSnap => {
            const data = docSnap.data(); data.id = docSnap.id; window.bankMasterList.push(data);
            if(selectBox) { const option = document.createElement('option'); option.value = data.id; option.textContent = data.label; selectBox.appendChild(option); }
        });
        const savedBankId = localStorage.getItem(`rbos_bankId_${window.erpSession.companyId}`);
        const defaultId = (window.bankMasterList.find(b => b.id === savedBankId)?.id) || (window.bankMasterList.length === 1 ? window.bankMasterList[0].id : '');
        if(defaultId && selectBox) { selectBox.value = defaultId; if(typeof window.handleBankSelection === 'function') window.handleBankSelection(); }
    } catch (err) { console.warn("Banks failed: " + err.message); }
}

window.saveProductToMaster = async function(e) {
    e.preventDefault();
    const btn = document.getElementById('saveProdBtn');
    const desc = document.getElementById('prodDesc')?.value.trim();
    const quality = document.getElementById('prodQuality')?.value.trim();
    const unit = document.getElementById('prodUnit')?.value; 
    if(!desc) return;
    const docId = `${window.erpSession.companyId}-${desc}-${quality}`.toLowerCase().replace(/[^a-z0-9]/g, '-'); 
    try {
        if(btn) { btn.innerText = "Saving..."; btn.disabled = true; }
        const isUpdate = window.productMasterList.some(p => p.id === docId);
        await saveProductDB(docId, { 
            companyId: window.erpSession.companyId, desc, quality, 
            hsn: document.getElementById('prodHsn')?.value.trim(), 
            rate: parseFloat(document.getElementById('prodRate')?.value) || 0, 
            gst: parseFloat(document.getElementById('prodGst')?.value) || 0, unit: unit 
        });
        alert("Product Saved!"); 
        if(document.getElementById('productMasterForm')) document.getElementById('productMasterForm').reset(); 
        if(typeof window.toggleProductModal === 'function') window.toggleProductModal(false); 
        fetchProductMaster(); 
        renderDashboardModule(window.erpSession.companyId);
        logActivity(isUpdate ? "product_updated" : "product_created", { productName: desc }); 
    } catch (err) { alert("Failed: " + err.message); } finally { if(btn) { btn.innerText = "Save Product"; btn.disabled = false; } }
};

window.deleteProductFromMaster = async function() {
    const desc = document.getElementById('prodDesc')?.value.trim();
    const quality = document.getElementById('prodQuality')?.value.trim();
    if(!desc) return;
    const docId = `${window.erpSession.companyId}-${desc}-${quality}`.toLowerCase().replace(/[^a-z0-9]/g, '-'); 
    if(confirm(`Delete '${desc}'?`)) { 
        await deleteProductDB(docId); 
        if(document.getElementById('productMasterForm')) document.getElementById('productMasterForm').reset(); 
        if(typeof window.toggleProductModal === 'function') window.toggleProductModal(false); 
        fetchProductMaster(); 
        renderDashboardModule(window.erpSession.companyId); 
        logActivity("product_deleted", { productName: desc }); 
    }
};

window.savePartyToMaster = async function(e) {
    e.preventDefault();
    const btn = document.getElementById('savePartyBtn');
    const partyName = document.getElementById('partyNameModal')?.value.trim();
    const address = document.getElementById('partyAddrModal')?.value.trim();
    const gstin = document.getElementById('partyGstinModal')?.value.trim().toUpperCase();
    const pan = document.getElementById('partyPanModal')?.value.trim().toUpperCase();
    const mobile = document.getElementById('partyMobModal')?.value.trim();
    const email = document.getElementById('partyEmailModal')?.value.trim();

    if (!partyName || partyName.length < 2) { alert("Validation Error: Party Name is mandatory and must contain at least 2 valid characters."); return; }
    if (!address) { alert("Validation Error: Address is mandatory for Party Master."); return; }
    if (!/\b\d{6}\b/.test(address)) {
        const proceed = confirm("Address does not contain a valid 6-digit PIN code.\n\nPIN code is recommended for GST-compliant invoices and delivery records.\n\nPress OK to Save Anyway.\nPress Cancel to review the address.");
        if (!proceed) return;
    }
    const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
    if (gstin && !gstinRegex.test(gstin)) { alert("Validation Error: Invalid GSTIN format.\nExpected format: 22AAAAA0000A1Z5"); return; }
    const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
    if (pan && !panRegex.test(pan)) { alert("Validation Error: Invalid PAN format.\nExpected format: ABCDE1234F (5 letters, 4 numbers, 1 letter)"); return; }
    const mobRegex = /^\d{10}$/;
    if (mobile && !mobRegex.test(mobile)) { alert("Validation Error: Mobile number must contain exactly 10 digits."); return; }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (email && !emailRegex.test(email)) { alert("Validation Error: Please enter a valid email address."); return; }

    if(document.getElementById('partyNameModal')) document.getElementById('partyNameModal').value = partyName;
    if(document.getElementById('partyAddrModal')) document.getElementById('partyAddrModal').value = address;
    if(document.getElementById('partyGstinModal')) document.getElementById('partyGstinModal').value = gstin;
    if(document.getElementById('partyPanModal')) document.getElementById('partyPanModal').value = pan;
    if(document.getElementById('partyMobModal')) document.getElementById('partyMobModal').value = mobile;
    if(document.getElementById('partyEmailModal')) document.getElementById('partyEmailModal').value = email;

    const docId = `${window.erpSession.companyId}-${partyName}`.toLowerCase().replace(/[^a-z0-9]/g, '-'); 
    try {
        if(btn) { btn.innerText = "Saving..."; btn.disabled = true; }
        const isUpdate = window.partyMasterList.some(p => p.id === docId);
        await savePartyDB(docId, { 
            companyId: window.erpSession.companyId, partyName, address, gstin, pan, mobile, email 
        });
        alert("Party Saved!"); 
        if(document.getElementById('partyMasterForm')) document.getElementById('partyMasterForm').reset(); 
        if(typeof window.togglePartyModal === 'function') window.togglePartyModal(false); 
        await fetchPartyMaster(); 
        if(document.getElementById('partySelectMaster')) document.getElementById('partySelectMaster').value = docId; 
        if(typeof window.handlePartySelection === 'function') window.handlePartySelection(); 
        renderDashboardModule(window.erpSession.companyId); 
        logActivity(isUpdate ? "party_updated" : "party_created", { partyName }); 
    } catch (err) { alert("Failed: " + err.message); } finally { if(btn) { btn.innerText = "Save Party"; btn.disabled = false; } }
};

window.deletePartyFromMaster = async function() {
    const partyName = document.getElementById('partyNameModal')?.value.trim();
    if(!partyName) return;
    const docId = `${window.erpSession.companyId}-${partyName}`.toLowerCase().replace(/[^a-z0-9]/g, '-'); 
    if(confirm(`Delete Party '${partyName}'?`)) { 
        await deletePartyDB(docId); 
        if(document.getElementById('partyMasterForm')) document.getElementById('partyMasterForm').reset(); 
        if(typeof window.togglePartyModal === 'function') window.togglePartyModal(false); 
        fetchPartyMaster(); 
        renderDashboardModule(window.erpSession.companyId); 
        logActivity("party_deleted", { partyName }); 
    }
};

window.saveBankToMaster = async function(e) {
    e.preventDefault();
    const btn = document.getElementById('saveBankBtn');
    const label = document.getElementById('bankLabelModal')?.value.trim().toUpperCase();
    if(!label) return;
    const docId = `${window.erpSession.companyId}-${label}`.toLowerCase().replace(/[^a-z0-9]/g, '-'); 
    try {
        if(btn) { btn.innerText = "Saving..."; btn.disabled = true; }
        await saveBankDB(docId, { 
            companyId: window.erpSession.companyId, label, 
            bankName: document.getElementById('bankNameModal')?.value.trim(), 
            accountNumber: document.getElementById('bankAccModal')?.value.trim(), 
            ifsc: document.getElementById('bankIfscModal')?.value.trim().toUpperCase(), 
            micr: document.getElementById('bankMicrModal')?.value.trim(), 
            branch: document.getElementById('bankBranchModal')?.value.trim() 
        });
        alert("Bank Saved!"); 
        if(document.getElementById('bankMasterForm')) document.getElementById('bankMasterForm').reset(); 
        if(typeof window.toggleBankModal === 'function') window.toggleBankModal(false); 
        await fetchBankMaster(); 
        if(document.getElementById('bankSelectMaster')) document.getElementById('bankSelectMaster').value = docId; 
        if(typeof window.handleBankSelection === 'function') window.handleBankSelection(); 
        renderDashboardModule(window.erpSession.companyId);
    } catch (err) { alert("Failed: " + err.message); } finally { if(btn) { btn.innerText = "Save Bank"; btn.disabled = false; } }
};

window.deleteBankFromMaster = async function() {
    const label = document.getElementById('bankLabelModal')?.value.trim();
    if(!label) return;
    const docId = `${window.erpSession.companyId}-${label}`.toLowerCase().replace(/[^a-z0-9]/g, '-'); 
    if(confirm(`Delete Bank '${label}'?`)) { 
        await deleteBankDB(docId); 
        if(document.getElementById('bankMasterForm')) document.getElementById('bankMasterForm').reset(); 
        if(typeof window.toggleBankModal === 'function') window.toggleBankModal(false); 
        fetchBankMaster(); 
        renderDashboardModule(window.erpSession.companyId); 
    }
};

window.handleProductSelection = function(inputElement) {
    inputElement.dataset.pid = ''; 
    const selectedVal = inputElement.value;
    const foundProduct = window.productMasterList.find(p => `${p.desc} - ${p.quality || ''}` === selectedVal || p.desc === selectedVal);
    if(foundProduct) {
        inputElement.dataset.pid = foundProduct.id;
        const row = inputElement.closest('tr');
        if(row.querySelector('.item-hsn')) row.querySelector('.item-hsn').value = foundProduct.hsn;
        if(row.querySelector('.rate-input')) row.querySelector('.rate-input').value = foundProduct.rate;
        if(row.querySelector('.gst-select')) row.querySelector('.gst-select').value = foundProduct.gst;
        if(row.querySelector('.unit-input')) row.querySelector('.unit-input').value = foundProduct.unit || 'PCS';
        if(typeof window.calculateInvoiceCoreValues === 'function') window.calculateInvoiceCoreValues();
    }
};

window.handlePartySelection = function() {
    const pId = document.getElementById('partySelectMaster')?.value;
    const party = window.partyMasterList.find(p => p.id === pId);
    if(party) {
        if(document.getElementById('clientName')) document.getElementById('clientName').value = party.partyName; 
        if(document.getElementById('clientAddress')) document.getElementById('clientAddress').value = party.address; 
        if(document.getElementById('clientGstin')) document.getElementById('clientGstin').value = party.gstin; 
        if(document.getElementById('clientPan')) document.getElementById('clientPan').value = party.pan; 
        if(document.getElementById('clientMob')) document.getElementById('clientMob').value = party.mobile;
    } else {
        const ids = ['clientName', 'clientAddress', 'clientGstin', 'clientPan', 'clientMob'];
        ids.forEach(id => { if(document.getElementById(id)) document.getElementById(id).value = ''; });
    }
};

window.handleBankSelection = function() {
    const bId = document.getElementById('bankSelectMaster')?.value;
    if(bId) localStorage.setItem(`rbos_bankId_${window.erpSession.companyId}`, bId);
    const bank = window.bankMasterList.find(b => b.id === bId);
    if(bank) {
        if(document.getElementById('lblBankName')) document.getElementById('lblBankName').innerText = bank.bankName; 
        if(document.getElementById('lblBankAcc')) document.getElementById('lblBankAcc').innerText = bank.accountNumber; 
        if(document.getElementById('lblBankIfsc')) document.getElementById('lblBankIfsc').innerText = bank.ifsc; 
        if(document.getElementById('lblBankMicr')) document.getElementById('lblBankMicr').innerText = bank.micr || 'N/A'; 
        if(document.getElementById('lblBankBranch')) document.getElementById('lblBankBranch').innerText = bank.branch;
    } else {
        if(document.getElementById('lblBankName')) document.getElementById('lblBankName').innerText = '[SELECT BANK]'; 
        if(document.getElementById('lblBankAcc')) document.getElementById('lblBankAcc').innerText = '...'; 
        if(document.getElementById('lblBankIfsc')) document.getElementById('lblBankIfsc').innerText = '...'; 
        if(document.getElementById('lblBankMicr')) document.getElementById('lblBankMicr').innerText = '...'; 
        if(document.getElementById('lblBankBranch')) document.getElementById('lblBankBranch').innerText = '...';
    }
};
