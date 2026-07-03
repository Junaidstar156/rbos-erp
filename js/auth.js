import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, getAuth, deleteUser } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, setDoc, getDoc, deleteDoc, serverTimestamp, collection } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";

import { auth, db, firebaseConfig } from './firebase.js'; 

const secondaryApp = initializeApp(firebaseConfig, "SecondaryInstance");
const secondaryAuth = getAuth(secondaryApp);

window.erpSession = { uid: null, companyId: null, role: null, profile: null, email: null, name: '' };

window.isRegistrationInProgress = false;

export const registerNewCompanySaaS = async (companyName, ownerName, email, password) => {
    window.isRegistrationInProgress = true; 
    
    let userCredential, user, uid;
    try {
        userCredential = await createUserWithEmailAndPassword(auth, email, password);
        user = userCredential.user;
        uid = user.uid;
    } catch (authError) {
        window.isRegistrationInProgress = false; 
        throw authError;
    }
    
    const companyRef = doc(collection(db, "companies"));
    const companyId = companyRef.id;
    let companyWasCreated = false;
    
    const companyProfile = {
        companyId: companyId,
        companyName: companyName,
        ownerUid: uid,
        address: "",
        gstin: "", 
        mobile: "", 
        email: email,
        invoicePrefix: companyName.trim().substring(0, 3).toUpperCase() || "INV",
        logoUrl: "", 
        active: true, 
        createdAt: serverTimestamp()
    };

    try {
        await setDoc(companyRef, companyProfile);
        companyWasCreated = true;

        await setDoc(doc(db, "users", uid), {
            uid: uid, 
            companyId: companyId, 
            role: "admin", 
            active: true,
            name: ownerName, 
            email: email, 
            createdAt: serverTimestamp()
        });

        // 🔥 Attaching ownerName as session name
        window.erpSession = { uid, companyId, role: "admin", profile: companyProfile, email, name: ownerName };
        return { uid, companyId };
        
    } catch (error) {
        if (companyWasCreated) await deleteDoc(companyRef).catch(() => {});
        await deleteUser(user).catch(() => {});
        throw new Error("Provisioning failed. Account creation rolled back safely. Reason: " + error.message);
    } finally {
        window.isRegistrationInProgress = false; 
    }
};

export const createUserAccount = async (name, email, password, role = "staff") => {
    if (window.erpSession.role !== 'admin') throw new Error("Only admins can provision user accounts.");
    if (role !== "admin" && role !== "staff") role = "staff";
    
    const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    const newUid = userCredential.user.uid;
    await setDoc(doc(db, "users", newUid), {
        uid: newUid, companyId: window.erpSession.companyId, role: role,
        name: name, email: email, createdBy: window.erpSession.uid,
        active: true, createdAt: serverTimestamp()
    });
    await signOut(secondaryAuth);
    return newUid;
};

export const loginUser = async (email, password) => {
    return await signInWithEmailAndPassword(auth, email, password);
};

export const logoutUser = async () => {
    return await signOut(auth);
};

export const monitorAuthState = (callback) => {
    onAuthStateChanged(auth, async (user) => {
        if (window.isRegistrationInProgress) return; 
        
        if (user) {
            try {
                let userDocSnap = await getDoc(doc(db, "users", user.uid));
                
                if (!userDocSnap.exists()) {
                    await new Promise(resolve => setTimeout(resolve, 1500));
                    userDocSnap = await getDoc(doc(db, "users", user.uid));
                }

                if (userDocSnap.exists()) {
                    const userData = userDocSnap.data();
                    if (userData.active === false) {
                        alert("Access Denied: Account disabled."); await signOut(auth); return callback(null);
                    }
                    
                    let companyDocSnap = await getDoc(doc(db, "companies", userData.companyId));
                    const companyProfile = companyDocSnap.exists() ? companyDocSnap.data() : null;
                    
                    // 🔥 Attaching human 'name' directly to erpSession
                    window.erpSession = { 
                        uid: user.uid, 
                        companyId: userData.companyId, 
                        role: userData.role, 
                        profile: companyProfile, 
                        email: user.email,
                        name: userData.name || ''
                    };
                    applyDynamicUIAccessRules();
                    callback(user);
                } else {
                    console.error("Workspace reference integrity broken. Zombie account detected.");
                    await signOut(auth); callback(null);
                }
            } catch (err) { console.error("Session resolve crashed:", err); await signOut(auth); callback(null); }
        } else {
            window.erpSession = { uid: null, companyId: null, role: null, profile: null, email: null, name: '' };
            callback(null);
        }
    });
};

function applyDynamicUIAccessRules() {
    const isStaffMode = window.erpSession.role === 'staff';
    const masterControls = document.querySelectorAll('#saveProdBtn, #productMasterForm button.bg-red-100, #savePartyBtn, #partyMasterForm button.bg-red-100, #saveBankBtn, #bankMasterForm button.bg-red-100, [onclick="window.toggleSettingsModal(true)"], #userManagementSection, #navTeamMgmtBtn, #auditLogSection, #navAuditLogBtn');
    const invoiceDeleteBtns = document.querySelectorAll('[onclick^="window.deleteInvoiceFromCloud"]');
    if (isStaffMode) {
        masterControls.forEach(btn => btn?.classList.add('hidden')); invoiceDeleteBtns.forEach(btn => btn?.classList.add('hidden'));
    } else {
        masterControls.forEach(btn => btn?.classList.remove('hidden')); invoiceDeleteBtns.forEach(btn => btn?.classList.remove('hidden'));
    }
}
