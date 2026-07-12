import { saveAuditLogDB } from '../database.js';

export function logActivity(action, details = {}) {
    if (!window.erpSession?.companyId || !window.erpSession?.uid) return;
    const userNameStr = window.erpSession.name || window.erpSession.email || 'Authorized Member';
    saveAuditLogDB(window.erpSession.companyId, action, window.erpSession.uid, userNameStr, details).catch(err => {
        console.warn("Audit log safely suppressed:", err);
    });
}
