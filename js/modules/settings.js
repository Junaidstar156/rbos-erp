import { getCompanyProfileDB, saveCompanyProfileDB, runLegacyDataMigration } from '../database.js';
import { escapeHTML } from './utils.js';
import { logActivity } from './audit.js';

export async function initCompanyProfile() {
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
    } catch (err) { 
        console.error("Failed to load company profile:", err); 
        throw err; 
    }
}

export function renderDynamicCompanyHeaders() {
    const p = window.erpSession.profile;
    if(!p) return;
    
    if(document.getElementById('headerCompanyName')) document.getElementById('headerCompanyName').innerText = p.companyName;
    if(document.getElementById('headerAddress')) {
        document.getElementById('headerAddress').innerHTML = `
            <div>ADD: ${escapeHTML(p.address).replace(/\n/g, '<br>')}</div>
            <div>Phone: ${escapeHTML(p.mobile)} | E-mail: ${escapeHTML(p.email)}</div>
            ${p.gstin ? `<div class="font-mono font-bold text-slate-900 mt-1 bg-blue-50 px-2 py-0.5 rounded inline-block">GSTIN NO: ${escapeHTML(p.gstin)}</div>` : ''}
        `;
    }
    if(document.getElementById('footerSignatoryName')) document.getElementById('footerSignatoryName').innerText = p.companyName;
    
    if(document.getElementById('setCompName')) document.getElementById('setCompName').value = p.companyName;
    if(document.getElementById('setCompAddress')) document.getElementById('setCompAddress').value = p.address;
    if(document.getElementById('setCompGstin')) document.getElementById('setCompGstin').value = p.gstin || '';
    if(document.getElementById('setCompMob')) document.getElementById('setCompMob').value = p.mobile || '';
    if(document.getElementById('setCompEmail')) document.getElementById('setCompEmail').value = p.email || '';
    if(document.getElementById('setCompPrefix')) document.getElementById('setCompPrefix').value = p.invoicePrefix || '';
}

window.saveCompanySettings = async function(e) {
    e.preventDefault();
    const btn = document.getElementById('saveSettingsBtn');
    
    const rawCompName = document.getElementById('setCompName').value.trim();
    const rawAddress = document.getElementById('setCompAddress').value.trim();
    const rawGstin = document.getElementById('setCompGstin').value.trim().toUpperCase();
    const rawMob = document.getElementById('setCompMob').value.trim();
    const rawEmail = document.getElementById('setCompEmail').value.trim();
    const rawPrefix = document.getElementById('setCompPrefix').value.trim().toUpperCase();

    if (!rawCompName || rawCompName.length < 2) { alert("Validation Error: Company Name is mandatory and must contain at least 2 valid characters."); return; }
    if (!rawAddress) { alert("Validation Error: Company Address is mandatory."); return; }
    if (!/\b\d{6}\b/.test(rawAddress)) { alert("Validation Error: Company Address must contain a valid 6-digit Indian PIN code (e.g., 250002)."); return; }
    const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
    if (rawGstin && !gstinRegex.test(rawGstin)) { alert("Validation Error: Invalid GSTIN format.\nExpected format: 22AAAAA0000A1Z5"); return; }
    const mobRegex = /^\d{10}$/;
    if (rawMob && !mobRegex.test(rawMob)) { alert("Validation Error: Mobile number must contain exactly 10 digits."); return; }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (rawEmail && !emailRegex.test(rawEmail)) { alert("Validation Error: Please enter a valid email address."); return; }
    const prefixRegex = /^[A-Z0-9-]{2,8}$/;
    if (!rawPrefix || !prefixRegex.test(rawPrefix)) { alert("Validation Error: Invoice Prefix is mandatory and must be 2 to 8 characters long, containing only uppercase letters, numbers, or hyphens (e.g., RFC, FY26)."); return; }

    document.getElementById('setCompName').value = rawCompName;
    document.getElementById('setCompAddress').value = rawAddress;
    document.getElementById('setCompGstin').value = rawGstin;
    document.getElementById('setCompMob').value = rawMob;
    document.getElementById('setCompEmail').value = rawEmail;
    document.getElementById('setCompPrefix').value = rawPrefix;

    const updatedProfile = {
        companyId: window.erpSession.companyId,
        companyName: rawCompName, address: rawAddress, gstin: rawGstin,
        mobile: rawMob, email: rawEmail, invoicePrefix: rawPrefix, 
        logoUrl: window.erpSession.profile?.logoUrl || "" 
    };

    try {
        if(btn) { btn.innerText = "Saving..."; btn.disabled = true; }
        await saveCompanyProfileDB(window.erpSession.companyId, updatedProfile);
        window.erpSession.profile = updatedProfile;
        renderDynamicCompanyHeaders();
        alert("Company Settings Updated Successfully!");
        if(typeof window.toggleSettingsModal === 'function') window.toggleSettingsModal(false);
        logActivity("settings_updated", { companyName: rawCompName }); 
    } catch (error) { alert("Failed to save settings: " + error.message); } 
    finally { if(btn) { btn.innerText = "Save Settings"; btn.disabled = false; } }
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
