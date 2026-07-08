import { createUserAccount } from '../auth.js';
import { getCompanyUsersDB, toggleUserStatusDB, getAuditLogsDB, saveAuditLogDB } from '../database.js';
import { escapeHTML } from './utils.js';

export function logActivity(action, details = {}) {
    if (!window.erpSession?.companyId || !window.erpSession?.uid) return;
    const userNameStr = window.erpSession.name || window.erpSession.email || 'Authorized Member';
    saveAuditLogDB(window.erpSession.companyId, action, window.erpSession.uid, userNameStr, details).catch(err => {
        console.warn("Audit log safely suppressed:", err);
    });
}

window.scrollToUserManagement = function() {
    const sec = document.getElementById('userManagementSection');
    if (sec) { sec.classList.remove('hidden'); sec.scrollIntoView({ behavior: 'smooth' }); }
};

window.handleCreateUserSubmit = async function(e) {
    e.preventDefault();
    const name = document.getElementById('newUserName')?.value.trim(); 
    const email = document.getElementById('newUserEmail')?.value.trim(); 
    const password = document.getElementById('newUserPassword')?.value; 
    const role = document.getElementById('newUserRole')?.value; 
    const btn = document.getElementById('submitCreateUserBtn'); 
    const errMsg = document.getElementById('createUserErrorMsg');
    
    if(errMsg) errMsg.classList.add('hidden');
    try {
        if(btn) { btn.innerText = "Provisioning..."; btn.disabled = true; }
        await createUserAccount(name, email, password, role); 
        alert(`Successfully provisioned ${name} as ${role === 'admin' ? 'Owner/Admin' : 'Staff'}.`);
        if(typeof window.toggleCreateUserModal === 'function') window.toggleCreateUserModal(false); 
        if(typeof loadCompanyUsersList === 'function') loadCompanyUsersList(); 
        logActivity("user_created", { targetUserName: name, role, email }); 
    } catch (error) { 
        if(errMsg) { errMsg.innerText = `Error: ${error.message}`; errMsg.classList.remove('hidden'); } 
    } finally { 
        if(btn) { btn.innerText = "Create User Account"; btn.disabled = false; } 
    }
};

window.toggleUserStatusTrigger = async function(uid, newActiveState, targetName = 'Member') {
    const actionText = newActiveState ? "enable" : "disable";
    if (confirm(`Are you sure you want to ${actionText} access for this user?`)) {
        try { 
            await toggleUserStatusDB(uid, newActiveState); 
            if (newActiveState) { logActivity("user_enabled", { targetUserName: targetName }); }
            else { logActivity("user_disabled", { targetUserName: targetName }); }
            if(typeof loadCompanyUsersList === 'function') loadCompanyUsersList(); 
            if(typeof loadAuditLogsList === 'function') loadAuditLogsList(); 
        } catch (err) { alert(`Failed to ${actionText} user: ${err.message}`); }
    }
};

export async function loadCompanyUsersList() {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="5" class="py-4 text-center text-slate-500 font-sans">⚡ Loading Team Records...</td></tr>`;
    try {
        const querySnapshot = await getCompanyUsersDB(window.erpSession.companyId); 
        tbody.innerHTML = '';
        if (querySnapshot.empty) { tbody.innerHTML = `<tr><td colspan="5" class="py-4 text-center text-slate-500 font-sans">No team members found.</td></tr>`; return; }
        
        const ownerUid = window.erpSession.profile?.ownerUid; 
        const currentSelfUid = window.erpSession.uid; 
        const usersData = [];
        querySnapshot.forEach(snap => { usersData.push(snap.data()); });
        
        usersData.sort((a, b) => { 
            if (a.uid === ownerUid) return -1; 
            if (b.uid === ownerUid) return 1; 
            const tA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0; 
            const tB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0; 
            return tB - tA; 
        });
        
        usersData.forEach(userData => {
            const isOwner = userData.uid === ownerUid; 
            const isSelf = userData.uid === currentSelfUid; 
            const displayRole = isOwner ? 'Owner' : (userData.role === 'admin' ? 'Admin' : 'Staff'); 
            const statusBadge = (userData.active !== false) ? `<span class="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 rounded font-bold text-[10px]">Active</span>` : `<span class="px-2 py-0.5 bg-red-500/20 text-red-400 rounded font-bold text-[10px]">Disabled</span>`;
            let actionControls = '';
            
            if (isOwner) { actionControls = `<span class="text-xs text-blue-400 font-bold tracking-wide font-sans">👑 Workspace Owner</span>`; } 
            else if (isSelf) { actionControls = `<span class="text-xs text-slate-400 font-sans font-medium">👉 This is you</span>`; } 
            else { 
                const safeName = escapeHTML(userData.name || userData.email || 'Member').replace(/'/g, "\\'"); 
                if (userData.active !== false) { actionControls = `<button onclick="window.toggleUserStatusTrigger('${userData.uid}', false, '${safeName}')" class="bg-amber-600/80 hover:bg-amber-600 text-white font-bold py-1 px-3 rounded-lg text-xs min-h-[44px] shadow transition-all">Disable</button>`; } 
                else { actionControls = `<button onclick="window.toggleUserStatusTrigger('${userData.uid}', true, '${safeName}')" class="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-1 px-3 rounded-lg text-xs min-h-[44px] shadow transition-all">Enable</button>`; } 
            }
            
            const tr = document.createElement('tr'); 
            tr.className = "border-b border-slate-700/60 hover:bg-slate-800/80 text-xs font-mono text-slate-300 transition-colors";
            tr.innerHTML = `<td class="py-3 px-3 font-sans font-bold text-white">${escapeHTML(userData.name || 'N/A')}</td><td class="py-3 px-3 text-slate-300">${escapeHTML(userData.email)}</td><td class="py-3 px-3 font-sans font-semibold text-blue-400">${displayRole}</td><td class="py-3 px-3 text-center">${statusBadge}</td><td class="py-3 px-3 text-center">${actionControls}</td>`; 
            tbody.appendChild(tr);
        });
    } catch (err) { 
        console.error("Failed to load users:", err); 
        tbody.innerHTML = `<tr><td colspan="5" class="py-4 text-center text-red-400 font-sans text-xs">⚠️ Failed to load team members: ${escapeHTML(err.message)}</td></tr>`; 
    }
}

window.scrollToAuditLogs = function() {
    const sec = document.getElementById('auditLogSection');
    if (sec) { sec.classList.remove('hidden'); loadAuditLogsList(); sec.scrollIntoView({ behavior: 'smooth' }); }
};

window.loadAuditLogsTrigger = function() { loadAuditLogsList(); };

export async function loadAuditLogsList() {
    const tbody = document.getElementById('auditTableBody');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="4" class="py-4 text-center text-slate-500 font-sans">⚡ Loading Activity Records...</td></tr>`;
    try {
        const querySnapshot = await getAuditLogsDB(window.erpSession.companyId); 
        tbody.innerHTML = '';
        if (querySnapshot.empty) { tbody.innerHTML = `<tr><td colspan="4" class="py-5 text-center text-slate-400 font-sans text-xs bg-slate-900/20 rounded-xl border border-dashed border-slate-700/60">No activity recorded yet.</td></tr>`; return; }
        
        const formatObj = (obj) => { if (!obj || Object.keys(obj).length === 0) return '-'; return Object.entries(obj).map(([k, v]) => `${k}: ${v}`).join(', '); };
        
        const badgeColors = { 
            'invoice_created': '<span class="px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded font-bold text-[10px]">🧾 invoice_created</span>', 
            'invoice_updated': '<span class="px-2 py-0.5 bg-cyan-500/20 text-cyan-300 rounded font-bold text-[10px]">🧾 invoice_updated</span>', 
            'invoice_deleted': '<span class="px-2 py-0.5 bg-red-500/20 text-red-300 rounded font-bold text-[10px]">🗑️ invoice_deleted</span>', 
            'product_created': '<span class="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 rounded font-bold text-[10px]">📦 product_created</span>', 
            'product_updated': '<span class="px-2 py-0.5 bg-lime-500/20 text-lime-300 rounded font-bold text-[10px]">📦 product_updated</span>', 
            'product_deleted': '<span class="px-2 py-0.5 bg-amber-500/20 text-amber-300 rounded font-bold text-[10px]">🗑️ product_deleted</span>', 
            'party_created': '<span class="px-2 py-0.5 bg-purple-500/20 text-purple-300 rounded font-bold text-[10px]">👥 party_created</span>', 
            'party_updated': '<span class="px-2 py-0.5 bg-fuchsia-500/20 text-fuchsia-300 rounded font-bold text-[10px]">👥 party_updated</span>', 
            'party_deleted': '<span class="px-2 py-0.5 bg-pink-500/20 text-pink-300 rounded font-bold text-[10px]">🗑️ party_deleted</span>', 
            'user_created': '<span class="px-2 py-0.5 bg-indigo-500/20 text-indigo-300 rounded font-bold text-[10px]">👤 user_created</span>', 
            'user_enabled': '<span class="px-2 py-0.5 bg-teal-500/20 text-teal-300 rounded font-bold text-[10px]">✅ user_enabled</span>', 
            'user_disabled': '<span class="px-2 py-0.5 bg-orange-500/20 text-orange-300 rounded font-bold text-[10px]">🚫 user_disabled</span>', 
            'settings_updated': '<span class="px-2 py-0.5 bg-slate-500/20 text-slate-300 rounded font-bold text-[10px]">⚙️ settings_updated</span>' 
        };
        
        querySnapshot.forEach(snap => {
            const log = snap.data(); 
            const timeStr = log.createdAt?.toDate ? new Date(log.createdAt.toDate()).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Just now';
            const safeAction = escapeHTML(log.action); 
            const badge = badgeColors[log.action] || `<span class="px-2 py-0.5 bg-slate-700 text-slate-300 rounded font-bold text-[10px]">${safeAction}</span>`; 
            const detailsText = escapeHTML(formatObj(log.details)); 
            const safeUserName = escapeHTML(log.userName || log.userId || 'User'); 
            const safeTimeStr = escapeHTML(timeStr);
            
            const tr = document.createElement('tr'); 
            tr.className = "border-b border-slate-700/50 hover:bg-slate-800/80 text-xs font-mono text-slate-300 transition-colors";
            tr.innerHTML = `<td class="py-2.5 px-3 text-slate-400 whitespace-nowrap text-[11px]">${safeTimeStr}</td><td class="py-2.5 px-3 font-sans font-bold text-white truncate max-w-[140px]">${safeUserName}</td><td class="py-2.5 px-3 whitespace-nowrap">${badge}</td><td class="py-2.5 px-3 text-slate-200 truncate max-w-[250px]">${detailsText}</td>`; 
            tbody.appendChild(tr);
        });
    } catch (err) { 
        console.error("Activity logs fetch failed:", err); 
        tbody.innerHTML = `<tr><td colspan="4" class="py-4 text-center text-red-400 font-sans text-xs">⚠️ Index building or load error: ${escapeHTML(err.message)}</td></tr>`; 
    }
}
