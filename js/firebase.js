import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// ✅ FIXED: Added 'export' so auth.js can import it
export const firebaseConfig = {
    apiKey: "AIzaSyCq77EUFJGgKU83HkT2sKzDw29B8FHHY2Y",
    authDomain: "rbos-invoice-system.firebaseapp.com",
    projectId: "rbos-invoice-system",
    storageBucket: "rbos-invoice-system.firebasestorage.app",
    messagingSenderId: "302699095337",
    appId: "1:302699095337:web:4de103798e992296758338"
};

// Single Firebase Instance for the whole app
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
