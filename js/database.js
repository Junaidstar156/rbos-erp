import { db } from './firebase.js';
import { collection, addDoc, setDoc, doc, getDoc, deleteDoc, query, orderBy, getDocs, limit, where, startAfter, writeBatch } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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
    
    // 🔥 FIX: Firestore needs orderBy to match inequality fields
    if (filters.startDate || filters.endDate) {
        constraints.push(orderBy("invoiceDate", "desc"));
    } else {
        constraints.push(orderBy("updatedAt", "desc"));
    }
    
    if (lastDoc) constraints.push(startAfter(lastDoc));
    
    constraints.push(limit(batchSize));
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
