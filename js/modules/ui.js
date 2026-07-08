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

window.toggleProductModal = function(show) { const m = document.getElementById('productModal'); if(m) m.classList.toggle('hidden', !show); };
window.togglePartyModal = function(show) { const m = document.getElementById('partyModal'); if(m) m.classList.toggle('hidden', !show); };
window.toggleBankModal = function(show) { const m = document.getElementById('bankModal'); if(m) m.classList.toggle('hidden', !show); };

window.toggleSettingsModal = function(show) { 
    const modal = document.getElementById('settingsModal');
    if(modal) modal.classList.toggle('hidden', !show); 
};

window.toggleCreateUserModal = function(show) {
    const modal = document.getElementById('createUserModal');
    const err = document.getElementById('createUserErrorMsg');
    const form = document.getElementById('createUserForm');
    if (err) err.classList.add('hidden');
    if (form && show) form.reset();
    if (modal) modal.classList.toggle('hidden', !show);
};

// ❌ The dangerous Universal Loader Destroyer setTimeout has been completely removed from here.
