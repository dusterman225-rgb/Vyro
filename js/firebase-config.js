// =========================================================
// VYRO — FIREBASE CONFIGURATION
// =========================================================

const firebaseConfig = {
    apiKey: "AIzaSyAt_KQ3RqV6JJOk6rS_7wDIQV2V7yg7bhg",
    authDomain: "vyro-104df.firebaseapp.com",
    projectId: "vyro-104df",
    storageBucket: "vyro-104df.firebasestorage.app",
    messagingSenderId: "842493262222",
    appId: "1:842493262222:web:115d699a41f09cb7c74cdf"
};

// =========================================================
// INITIALIZE FIREBASE
// =========================================================

const firebaseApp = firebase.initializeApp(firebaseConfig);

// Firebase services
const firebaseAuth = firebase.auth();
const firebaseDB = firebase.firestore();
