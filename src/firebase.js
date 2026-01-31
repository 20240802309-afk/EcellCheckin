// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
    apiKey: "AIzaSyAeRS2vu_GTpOHBbZFMFEvbwUuGrBaj-Ss",
    authDomain: "ecell-86bee.firebaseapp.com",
    projectId: "ecell-86bee",
    storageBucket: "ecell-86bee.firebasestorage.app",
    messagingSenderId: "488931917899",
    appId: "1:488931917899:web:c0563224a39c7448d74dce",
    measurementId: "G-ZGHDG3SRCQ"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
