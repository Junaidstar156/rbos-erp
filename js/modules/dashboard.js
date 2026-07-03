import { fetchDashboardMetricsDB } from '../database.js';
import { escapeHTML } from './ui.js';

export async function renderDashboardModule(companyId) {
    if (!companyId) return;
    try {
        const metrics = await fetchDashboardMetricsDB(companyId);
        if(document.getElementById('dash-tot-inv')) document.getElementById('dash-tot-inv').innerText = metrics.totalInvoices ?? 0;
        if(document.getElementById('dash-month-inv')) document.getElementById('dash-month-inv').innerText = metrics.thisMonthInvoices ?? 0;
        if(document.getElementById('dash-tot-cust')) document.getElementById('dash-tot-cust').innerText = metrics.totalCustomers ?? 0;
        if(document.getElementById('dash-tot-prod')) document.getElementById('dash-tot-prod').innerText = metrics.totalProducts ?? 0;
        if(document.getElementById('dash-tot-banks')) document.getElementById('dash-tot-banks').innerText = metrics.totalBanks ?? 0;

        const feedContainer = document.getElementById('dash-activity-feed');
        if (!feedContainer) return;
        feedContainer.innerHTML = '';

        if (!Array.isArray(metrics.recentActivity) || metrics.recentActivity.length === 0) {
            feedContainer.innerHTML = `
                <div class="py-6 text-center text-slate-400 font-sans text-xs bg-slate-900/30 rounded-xl border border-dashed border-slate-700/80">
                    🌱 No invoices yet. Create your first invoice to get started.
                </div>
            `;
            return;
        }

        metrics.recentActivity.forEach(inv => {
            const invNo = inv.invoiceNo || 'INV';
            const partyName = inv.clientName || inv.partySnapshot?.name || 'Unknown Party';
            const amt = inv.grandTotal !== undefined ? `₹${inv.grandTotal.toLocaleString('en-IN', {minimumFractionDigits: 2})}` : '₹0.00';
            const dateStr = inv.invoiceDate || (inv.createdAt ? inv.createdAt.split('T')[0] : 'N/A');

            const row = document.createElement('div');
            row.className = "py-2.5 flex items-center justify-between text-slate-300 hover:text-white transition-colors text-xs font-mono";
            row.innerHTML = `
                <div class="flex items-center gap-2.5 truncate pr-2">
                    <span class="text-[10px] px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded font-bold">${escapeHTML(invNo)}</span>
                    <span class="truncate font-sans font-medium text-slate-200">${escapeHTML(partyName)}</span>
                </div>
                <div class="flex items-center gap-3 shrink-0">
                    <span class="text-emerald-400 font-bold">${escapeHTML(amt)}</span>
                    <span class="text-[10px] text-slate-500">${escapeHTML(dateStr)}</span>
                </div>
            `;
            feedContainer.appendChild(row);
        });

    } catch (err) { console.warn("Dashboard metrics render suppressed:", err); }
}
