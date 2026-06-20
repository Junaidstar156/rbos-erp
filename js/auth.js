import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, getAuth, deleteUser } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, setDoc, getDoc, deleteDoc, serverTimestamp, collection } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";

import { auth, db, firebaseConfig } from './firebase.js'; 

const secondaryApp = initializeApp(firebaseConfig, "SecondaryInstance");
const secondaryAuth = getAuth(secondaryApp);

window.erpSession = { uid: null, companyId: null, role: null, profile: null, email: null };

// ✅ NAYA: Guard flag to prevent race conditions during registration
window.isRegistrationInProgress = false;

export const registerNewCompanySaaS = async (companyName, ownerName, email, password) => {
    window.isRegistrationInProgress = true; // 🔒 Lock onAuthStateChanged
    
    let userCredential, user, uid;
    try {
        userCredential = await createUserWithEmailAndPassword(auth, email, password);
        user = userCredential.user;
        uid = user.uid;
    } catch (authError) {
        window.isRegistrationInProgress = false; // Release lock if auth fails immediately
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

        // ✅ Session directly yahan banao (No guesswork)
        window.erpSession = { uid, companyId, role: "admin", profile: companyProfile, email };
        return { uid, companyId };
        
    } catch (error) {
        if (companyWasCreated) await deleteDoc(companyRef).catch(() => {});
        await deleteUser(user).catch(() => {});
        throw new Error("Provisioning failed. Account creation rolled back safely. Reason: " + error.message);
    } finally {
        window.isRegistrationInProgress = false; // 🔓 Always release the lock
    }
};

export const createStaffAccount = async (staffName, staffEmail, staffPassword) => {
    if (window.erpSession.role !== 'admin') throw new Error("Only admins can provision staff accounts.");
    const staffCredential = await createUserWithEmailAndPassword(secondaryAuth, staffEmail, staffPassword);
    const staffUid = staffCredential.user.uid;
    await setDoc(doc(db, "users", staffUid), {
        uid: staffUid, companyId: window.erpSession.companyId, role: "staff",
        name: staffName, email: staffEmail, createdBy: window.erpSession.uid,
        active: true, createdAt: serverTimestamp()
    });
    await signOut(secondaryAuth);
    return staffUid;
};

export const loginUser = async (email, password) => {
    return await signInWithEmailAndPassword(auth, email, password);
};

export const logoutUser = async () => {
    return await signOut(auth);
};

export const monitorAuthState = (callback) => {
    onAuthStateChanged(auth, async (user) => {
        // ✅ NAYA: Agar registration chal raha hai, toh beech mein taang mat adao
        if (window.isRegistrationInProgress) return; 
        
        if (user) {
            try {
                let userDocSnap = await getDoc(doc(db, "users", user.uid));
                
                // Defensive fallback for normal logins just in case
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
                    window.erpSession = { uid: user.uid, companyId: userData.companyId, role: userData.role, profile: companyProfile, email: user.email };
                    applyDynamicUIAccessRules();
                    callback(user);
                } else {
                    console.error("Workspace reference integrity broken. Zombie account detected.");
                    await signOut(auth); callback(null);
                }
            } catch (err) { console.error("Session resolve crashed:", err); await signOut(auth); callback(null); }
        } else {
            window.erpSession = { uid: null, companyId: null, role: null, profile: null, email: null };
            callback(null);
        }
    });
};

function applyDynamicUIAccessRules() {
    const isStaffMode = window.erpSession.role === 'staff';
    const masterControls = document.querySelectorAll('#saveProdBtn, #productMasterForm button.bg-red-100, #savePartyBtn, #partyMasterForm button.bg-red-100, #saveBankBtn, #bankMasterForm button.bg-red-100, [onclick="window.toggleSettingsModal(true)"]');
    const invoiceDeleteBtns = document.querySelectorAll('[onclick^="window.deleteInvoiceFromCloud"]');
    if (isStaffMode) {
        masterControls.forEach(btn => btn?.classList.add('hidden')); invoiceDeleteBtns.forEach(btn => btn?.classList.add('hidden'));
    } else {
        masterControls.forEach(btn => btn?.classList.remove('hidden')); invoiceDeleteBtns.forEach(btn => btn?.classList.remove('hidden'));
    }
}
