// =========================================================
// VYRO — FIREBASE AUTHENTICATION
// =========================================================
(function () {
    "use strict";

    function screen(id) { return document.getElementById(id); }
    function go(id) {
        const target = screen(id);
        if (target && typeof window.showScreen === "function") window.showScreen(target);
    }

    function cleanUsername(value) {
        return String(value || "").trim().replace(/^@+/, "").toLowerCase();
    }

    function saveProfileLocally(data) {
        if (data && data.username) {
            localStorage.setItem("vyro_username", data.username);
            const initial = document.getElementById("profile-avatar-initial");
            const menuName = document.getElementById("profile-menu-username");
            const name = String(data.username).replace(/^@/, "");
            if (initial) initial.textContent = (name.charAt(0) || "V").toUpperCase();
            if (menuName) menuName.textContent = "@" + name;
        }
    }

    async function loadProfile(uid) {
        try {
            const snap = await firebaseDB.collection("users").doc(uid).get();
            if (snap.exists) {
                const data = snap.data() || {};
                saveProfileLocally(data);
                return data;
            }
        } catch (error) {
            console.error("VYRO profile read error:", error);
        }
        return {};
    }

    function friendlyAuthError(error) {
        const code = error && error.code || "";
        const map = {
            "auth/email-already-in-use":"This email is already registered. Please use LOGIN.",
            "auth/invalid-email":"Please enter a valid email address.",
            "auth/weak-password":"Password must be at least 8 characters.",
            "auth/invalid-credential":"Incorrect email or password.",
            "auth/wrong-password":"Incorrect email or password.",
            "auth/user-not-found":"No VYRO account was found with this email.",
            "auth/too-many-requests":"Too many attempts. Please wait and try again.",
            "auth/network-request-failed":"Network error. Check your internet connection and try again."
        };
        return map[code] || (error && error.message) || "Something went wrong. Please try again.";
    }

    async function routeAuthenticatedUser(user) {
        if (!user) { go("welcome-screen"); return; }
        await user.reload();
        const current = firebaseAuth.currentUser;
        if (!current) return;

        if (!current.emailVerified) {
            localStorage.setItem("vyro_pending_user_id", current.uid);
            go("email-verification-screen");
            return;
        }

        const data = await loadProfile(current.uid);
        if (data.securitySetupComplete !== true) {
            go("two-factor-screen");
            return;
        }

        // The existing VYRO security screen handles the user's 2FA preference.
        if (data.twoFactorEnabled === true) go("two-factor-screen");
        else go("home-screen");
    }

    async function createAccount() {
        const usernameRaw = screen("username")?.value || "";
        const username = cleanUsername(usernameRaw);
        const email = (screen("email")?.value || "").trim().toLowerCase();
        const password = screen("password")?.value || "";
        const verificationWord = (screen("verification-word")?.value || "").trim();

        if (!username || !email || !password || !verificationWord) { alert("Please complete all fields."); return; }
        if (!/^[a-z0-9_]{3,20}$/.test(username)) { alert("Username must be 3–20 characters and use only letters, numbers, or underscores."); return; }
        if (password.length < 8) { alert("Password must be at least 8 characters."); return; }

        const button = screen("continue-registration-btn");
        if (button) { button.disabled = true; button.textContent = "CREATING..."; }
        try {
            const credential = await firebaseAuth.createUserWithEmailAndPassword(email, password);
            const user = credential.user;
            await user.sendEmailVerification();
            await firebaseDB.collection("users").doc(user.uid).set({
                username, email, verificationWord, twoFactorEnabled:false, securitySetupComplete:false, createdAt:firebase.firestore.FieldValue.serverTimestamp()
            });
            localStorage.setItem("vyro_pending_username", username);
            localStorage.setItem("vyro_pending_user_id", user.uid);
            saveProfileLocally({username});
            go("email-verification-screen");
        } catch (error) {
            console.error("VYRO REGISTRATION ERROR:", error);
            alert("Registration error: " + friendlyAuthError(error));
        } finally {
            if (button) { button.disabled = false; button.textContent = "CONTINUE"; }
        }
    }

    async function login() {
        const email = (screen("login-email")?.value || "").trim().toLowerCase();
        const password = screen("login-password")?.value || "";
        if (!email || !password) { alert("Please enter your email and password."); return; }
        const button = screen("login-submit-btn");
        if (button) { button.disabled=true; button.textContent="LOGGING IN..."; }
        try {
            const credential = await firebaseAuth.signInWithEmailAndPassword(email,password);
            await routeAuthenticatedUser(credential.user);
        } catch (error) {
            console.error("VYRO LOGIN ERROR:",error);
            alert("Login error: " + friendlyAuthError(error));
        } finally {
            if (button) { button.disabled=false; button.textContent="LOG IN"; }
        }
    }

    async function forgotPassword() {
        const email = (screen("login-email")?.value || "").trim().toLowerCase();
        if (!email) { alert("Enter your email address first."); return; }
        try { await firebaseAuth.sendPasswordResetEmail(email); alert("Password reset email sent. Check your inbox."); }
        catch (error) { alert("Unable to send password reset email: " + friendlyAuthError(error)); }
    }

    async function logout() {
        try {
            await firebaseAuth.signOut();
            localStorage.removeItem("vyro_username");
            localStorage.removeItem("vyro_pending_username");
            localStorage.removeItem("vyro_pending_user_id");
            if (typeof window.closeProfileMenu === "function") window.closeProfileMenu();
            go("welcome-screen");
        } catch (error) { console.error("VYRO LOGOUT ERROR:",error); alert("Unable to log out. Please try again."); }
    }

    function bind(id, handler) { const el=screen(id); if (el) el.addEventListener("click",handler); }

    function init() {
        bind("continue-registration-btn",createAccount);
        bind("login-submit-btn",login);
        bind("forgot-password-btn",forgotPassword);
        bind("logout-btn",logout);

        const verify = screen("verify-email-btn");
        if (verify) verify.addEventListener("click",async function(){
            const user=firebaseAuth.currentUser;
            if (!user) { alert("Please log in again."); return; }
            try { await user.reload(); if (!firebaseAuth.currentUser?.emailVerified) { alert("Your email has not been verified yet. Please check your inbox."); return; } go("two-factor-screen"); }
            catch(error){ alert("Unable to check email verification: "+friendlyAuthError(error)); }
        });

        bind("resend-email-btn",async function(){
            const user=firebaseAuth.currentUser;
            if (!user) { alert("Please start registration again."); return; }
            try { await user.sendEmailVerification(); alert("A new verification email has been sent."); }
            catch(error){ alert("Unable to resend verification email: "+friendlyAuthError(error)); }
        });

        firebaseAuth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(function(error){ console.error("VYRO persistence error:",error); });

        let firstAuthEvent=true;
        firebaseAuth.onAuthStateChanged(async function(user){
            if (!firstAuthEvent) return;
            firstAuthEvent=false;
            if (!user) return;
            await routeAuthenticatedUser(user);
        });
    }

    window.VYROAuth = {createAccount,login,logout,forgotPassword,routeAuthenticatedUser,loadProfile};

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded",init);
    else init();
})();
 
