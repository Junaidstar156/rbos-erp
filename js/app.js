import { loginUser, logoutUser, monitorAuthState, registerNewCompanySaaS } from './auth.js';
import { initCompanyProfile } from './modules/settings.js';
import { fetchProductMaster, fetchPartyMaster, fetchBankMaster } from './modules/masters.js';
import { loadCompanyUsersList, loadAuditLogsList } from './modules/admin.js';
import { renderDashboardModule } from './modules/dashboard.js';
import './modules/ui.js';

import { resetInvoiceForm, loadInvoiceHistoryBatch, resetInvoiceSessionState } from './modules/invoice.js';

let isAppInitialized = false; 
let workspaceInitializationPromise = null;

window.productMasterList = []; 
window.partyMasterList = []; 
window.bankMasterList = []; 
window.invoiceTotals = { taxable: 0, tax: 0, grand: 0 }; 
window.invoiceCache = {};

document.addEventListener('DOMContentLoaded', () => { resetInvoiceForm(); });

document.addEventListener('keydown', function(e) {
    if (e.key !== 'Enter') return;
    const target = e.target;
    if (!target.closest('#invoiceCoreContainer')) return;
    if (target.tagName !== 'INPUT' && target.tagName !== 'SELECT') return;
    if (target.type === 'submit' || target.type === 'button') return;

    e.preventDefault();

    const formElements = Array.from(
        document.querySelectorAll(
            '#invoiceCoreContainer input:not([type="hidden"]), ' +
            '#invoiceCoreContainer select, ' +
            '#invoiceCoreContainer textarea'
        )
    ).filter(el => !el.disabled && el.offsetParent !== null && window.getComputedStyle(el).display !== 'none');

    const currentIndex = formElements.indexOf(target);

    if (currentIndex > -1 && currentIndex < formElements.length - 1) {
        formElements[currentIndex + 1].focus();
    }
});

document.addEventListener('focusin', function(e) {
    if (window.innerWidth < 768) {
        const target = e.target;
        if (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA') {
            setTimeout(() => { target.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 200); 
        }
    }
});

window.addEventListener('error', function(e) { console.error("Global JS Error Handled Safely:", e.message); });

window.handleFirebaseRegister = async function(e) {
    e.preventDefault();
    const compName = document.getElementById('regCompanyName')?.value.trim(); const ownerName = document.getElementById('regOwnerName')?.value.trim(); const email = document.getElementById('regEmail')?.value.trim(); const pass = document.getElementById('regPassword')?.value; const confPass = document.getElementById('regConfirmPassword')?.value; const regBtn = document.getElementById('regBtn'); const errorDiv = document.getElementById('authErrorMsg');
    if(errorDiv) errorDiv.classList.add('hidden');
    if (pass.length < 8) { if(errorDiv) { errorDiv.innerText = "Password must be at least 8 characters long."; errorDiv.classList.remove('hidden'); } return; }
    if (pass !== confPass) { if(errorDiv) { errorDiv.innerText = "Passwords do not match."; errorDiv.classList.remove('hidden'); } return; }
    try {
        if(regBtn) { regBtn.innerText = "Creating Workspace..."; regBtn.disabled = true; }
        
        const registration = await registerNewCompanySaaS(compName, ownerName, email, pass);
        sessionStorage.setItem("rbos_firstRun", "true");
        await onAuthSessionReady({ uid: registration.uid });
        
    } catch (err) { if(errorDiv) { errorDiv.innerText = "Registration Error: " + err.message; errorDiv.classList.remove('hidden'); } if(regBtn) { regBtn.innerText = "Start Using ERP"; regBtn.disabled = false; } }
};

window.handleFirebaseLogin = async function(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail')?.value; const pass = document.getElementById('loginPassword')?.value; const loginBtn = document.getElementById('loginBtn'); const errorDiv = document.getElementById('authErrorMsg');
    if(errorDiv) errorDiv.classList.add('hidden');
    try {
        if(loginBtn) { loginBtn.innerText = "Authenticating..."; loginBtn.disabled = true; } await loginUser(email, pass);
        setTimeout(() => { if (loginBtn && loginBtn.innerText === "Authenticating...") { loginBtn.innerText = "Secure Login"; loginBtn.disabled = false; } }, 5000);
    } catch (err) { if(errorDiv) { errorDiv.innerText = "Login Error: Incorrect email or password."; errorDiv.classList.remove('hidden'); } if(loginBtn) { loginBtn.innerText = "Secure Login"; loginBtn.disabled = false; } }
};

window.handleFirebaseLogout = async function() { if(confirm("Are you sure you want to logout?")) { try { await logoutUser(); } catch(err) { alert("Logout failed: " + err.message); } } };

let authResolutionFailsafe = setTimeout(() => {
    const loader = document.getElementById('globalLoader'); const authSec = document.getElementById('authSection');
    if (loader && !loader.classList.contains('opacity-0')) {
        loader.classList.remove('opacity-100'); loader.classList.add('opacity-0'); setTimeout(() => { loader.classList.add('hidden'); }, 300); if(authSec) authSec.classList.remove('hidden');
    }
}, 8000); 

async function onAuthSessionReady(user) {
    clearTimeout(authResolutionFailsafe);  
    const loader = document.getElementById('globalLoader');
    if (loader && !loader.classList.contains('hidden')) { loader.classList.remove('opacity-100'); loader.classList.add('opacity-0'); setTimeout(() => { loader.classList.add('hidden'); }, 300); }
    
    if (user) {
        const authSec = document.getElementById('authSection'); const appDash = document.getElementById('appDashboardSection');
        if(authSec) authSec.classList.add('hidden'); if(appDash) appDash.classList.remove('hidden');
        
        if (isAppInitialized) return;

        if (workspaceInitializationPromise) {
            await workspaceInitializationPromise;
            return;
        }

        workspaceInitializationPromise = (async () => {
            try {
                await initCompanyProfile();
                resetInvoiceForm();

                loadInvoiceHistoryBatch(false);
                fetchProductMaster();
                fetchPartyMaster();
                fetchBankMaster();
                renderDashboardModule(window.erpSession.companyId);

                if (window.erpSession.role === 'admin') {
                    loadCompanyUsersList();
                    loadAuditLogsList();
                }

                isAppInitialized = true;
                
                if (sessionStorage.getItem('rbos_firstRun') === 'true') {
                    const welcomeModal = document.getElementById('welcomeModal');
                    if (welcomeModal) welcomeModal.classList.remove('hidden');
                    sessionStorage.removeItem('rbos_firstRun');
                }
            } catch (error) {
                isAppInitialized = false;
                console.error('Workspace initialization failed:', error);
                
                const dashboard = document.getElementById('appDashboardSection');
                const authSection = document.getElementById('authSection');
                
                if (dashboard) dashboard.classList.add('hidden');
                if (authSection) authSection.classList.remove('hidden');
                
                alert('Workspace Initialization Error: ' + error.message);
            } finally {
                workspaceInitializationPromise = null;
            }
        })();

        await workspaceInitializationPromise;

    } else {
        isAppInitialized = false;
        workspaceInitializationPromise = null;
        resetInvoiceSessionState();
        window.productMasterList = []; window.partyMasterList = []; window.bankMasterList = []; 
        
        const appDash = document.getElementById('appDashboardSection'); const authSec = document.getElementById('authSection');
        if(appDash) appDash.classList.add('hidden'); if(authSec) authSec.classList.remove('hidden');
        if(typeof window.toggleAuthMode === 'function') window.toggleAuthMode('login'); 
        
        const loginBtn = document.getElementById('loginBtn'); if(loginBtn) { loginBtn.innerText = "Secure Login"; loginBtn.disabled = false; }
        const regBtn = document.getElementById('regBtn'); if(regBtn) { regBtn.innerText = "Start Using ERP"; regBtn.disabled = false; }
    }
}

monitorAuthState(onAuthSessionReady);
