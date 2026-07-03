import { db } from './firebase.js';
import { collection, addDoc, setDoc, doc, getDoc, deleteDoc, query, orderBy, getDocs, limit, where, startAfter, writeBatch, updateDoc, getCountFromServer, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// --- COMPANY PROFILE (SPRINT 6A) ---
export const getCompanyProfileDB = async (companyId) => {
    const docSnap = await getDoc(doc(db, "companies", companyId));
    return docSnap.exists() ? docSnap.data() : null;
};
export const saveCompanyProfileDB = async (companyId, data) => setDoc(doc(db, "companies", companyId), data, { merge: true });

// --- PRODUCT MASTER ---
export const saveProductDB = async (docId, data) => setDoc(doc(db, "products", docId), data, { merge: true });
export const getProductsDB = async (companyId) => getDocs(query(collection(db, "products"), where("companyId", "==", companyId), orderBy("desc")));
export const deleteProductDB = async (docId) => deleteDoc(doc(db, "products", docId));

// --- PARTY MASTER ---
export const savePartyDB = async (docId, data) => setDoc(doc(db, "parties", docId), data, { merge: true });
export const getPartiesDB = async (companyId) => getDocs(query(collection(db, "parties"), where("companyId", "==", companyId), orderBy("partyName")));
export const deletePartyDB = async (docId) => deleteDoc(doc(db, "parties", docId));

// --- BANK MASTER ---
export const saveBankDB = async (docId, data) => setDoc(doc(db, "bankAccounts", docId), data, { merge: true });
export const getBanksDB = async (companyId) => getDocs(query(collection(db, "bankAccounts"), where("companyId", "==", companyId), orderBy("label")));
export const deleteBankDB = async (docId) => deleteDoc(doc(db, "bankAccounts", docId));

// --- INVOICE ENGINE ---
export const saveInvoiceDB = async (data, docId = null) => {
    if (docId) return await setDoc(doc(db, "invoices", docId), data, { merge: true });
    else return await addDoc(collection(db, "invoices"), data);
};

export const deleteInvoiceDB = async (id) => deleteDoc(doc(db, "invoices", id));

export const fetchInvoicesAdvancedDB = async (filters = {}, lastDoc = null, batchSize = 15, companyId) => {
    let constraints = [where("companyId", "==", companyId)];
    
    if (filters.startDate) constraints.push(where("invoiceDate", ">=", filters.startDate));
    if (filters.endDate) constraints.push(where("invoiceDate", "<=", filters.endDate));
    if (filters.invoiceNo) constraints.push(where("invoiceNo", "==", filters.invoiceNo.trim()));
    if (filters.clientName) constraints.push(where("clientName", "==", filters.clientName.trim()));
    
    if (filters.startDate || filters.endDate) {
        constraints.push(orderBy("invoiceDate", "desc"));
    } else {
        constraints.push(orderBy("updatedAt", "desc"));
    }
    
    if (lastDoc) constraints.push(startAfter(lastDoc));
    
    constraints.push(limit(batchSize));
    // 🔥 TYPO FIXED: Changed .constraints to ...constraints
    return await getDocs(query(collection(db, "invoices"), ...constraints));
};

// --- LEGACY MIGRATION ENGINE ---
export const runLegacyDataMigration = async (companyId) => {
    const collectionsToMigrate = ['invoices', 'products', 'parties', 'bankAccounts'];
    let totalMigrated = 0;
    for (const colName of collectionsToMigrate) {
        const snap = await getDocs(collection(db, colName));
        const batch = writeBatch(db);
        let count = 0;
        snap.forEach(d => {
            if (!d.data().companyId) {
                batch.update(doc(db, colName, d.id), { companyId: companyId });
                count++;
            }
        });
        if (count > 0) {
            await batch.commit();
            totalMigrated += count;
        }
    }
    return totalMigrated;
};

// --- USER MANAGEMENT ENGINE (SPRINT 7.1) ---
export const getCompanyUsersDB = async (companyId) => {
    return await getDocs(query(collection(db, "users"), where("companyId", "==", companyId)));
};

export const toggleUserStatusDB = async (uid, newActiveState) => {
    return await updateDoc(doc(db, "users", uid), { active: newActiveState });
};

// --- DASHBOARD METRICS ENGINE (SPRINT 7.2) ---
export const fetchDashboardMetricsDB = async (companyId) => {
    if (!companyId) return { totalInvoices: 0, thisMonthInvoices: 0, totalCustomers: 0, totalProducts: 0, totalBanks: 0, recentActivity: [] };

    const now = new Date();
    const startOfMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

    const getSafeCount = async (q) => {
        try {
            const snap = await getCountFromServer(q);
            return snap.data().count;
        } catch (err) {
            console.warn("Dashboard count fallback:", err);
            return 0;
        }
    };

    const p1 = getSafeCount(query(collection(db, "invoices"), where("companyId", "==", companyId)));
    const p2 = getSafeCount(query(collection(db, "invoices"), where("companyId", "==", companyId), where("invoiceDate", ">=", startOfMonthStr)));
    const p3 = getSafeCount(query(collection(db, "parties"), where("companyId", "==", companyId)));
    const p4 = getSafeCount(query(collection(db, "products"), where("companyId", "==", companyId)));
    const p5 = getSafeCount(query(collection(db, "bankAccounts"), where("companyId", "==", companyId)));
    
    const p6 = getDocs(query(collection(db, "invoices"), where("companyId", "==", companyId), orderBy("updatedAt", "desc"), limit(5)))
        .then(snap => {
            const list = [];
            snap.forEach(d => list.push({ id: d.id, ...d.data() }));
            return list;
        })
        .catch(err => {
            console.warn("Recent feed fallback:", err);
            return [];
        });

    const [totalInvoices, thisMonthInvoices, totalCustomers, totalProducts, totalBanks, recentActivity] = await Promise.all([
        p1, p2, p3, p4, p5, p6
    ]);

    return { totalInvoices, thisMonthInvoices, totalCustomers, totalProducts, totalBanks, recentActivity };
};

// --- 📜 AUDIT LOG SYSTEM (SPRINT 7.3) ---
export const saveAuditLogDB = async (companyId, action, userId, userName, details) => {
    if (!companyId) return;
    return await addDoc(collection(db, "auditLogs"), {
        companyId,
        action,
        userId,
        userName,
        details,
        createdAt: serverTimestamp()
    });
};

export const getAuditLogsDB = async (companyId) => {
    return await getDocs(query(collection(db, "auditLogs"), where("companyId", "==", companyId), orderBy("createdAt", "desc"), limit(50)));
};
