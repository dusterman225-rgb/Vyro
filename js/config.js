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
        return VYROTransfer.normalizeUsername(value);
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
            return null;   // could not read it: different from "no profile yet"
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
            "auth/network-request-failed":"Network error. Check your internet connection and try again.",
            "username-taken":"That username is already taken. Please choose another."
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

        // The Firestore rules require email_verified in the ID token, so refresh it now.
        try { await current.getIdToken(true); } catch (e) { console.warn("VYRO token refresh failed:", e); }

        const data = await loadProfile(current.uid);
        if (data === null) {
            alert("Could not load your profile. Check your connection and try again.");
            return;
        }
        // Signed in with Google (or a half-finished account): pick a username first.
        if (!data.username) {
            go("profile-setup-screen");
            return;
        }
        // Keep the public directory copy of the verification word current (senders see it when they
        // look this user up). Covers accounts made before the directory held the word.
        if (data.username && data.verificationWord) {
            firebaseDB.collection("usernames").doc(data.username)
                .update({ verificationWord: data.verificationWord })
                .catch(function (e) { console.warn("VYRO: directory word sync skipped:", e); });
        }
        // Make sure this user can be found by partial-name search (accounts made before it existed).
        if (data.username) {
            const indexRef = firebaseDB.collection("usernameIndex").doc(data.username);
            indexRef.get().then(function (s) { if (!s.exists) return indexRef.set({ username: data.username }); })
                .catch(function (e) { console.warn("VYRO: search index sync skipped:", e); });
        }
        if (window.VYROWallet) { VYROWallet.setUser(current.uid); VYROWallet.setUsername(data.username || null); }
        if (data.securitySetupComplete !== true) {
            go("two-factor-screen");
            return;
        }

        // The existing VYRO security screen handles the user's 2FA preference.
        if (data.twoFactorEnabled === true) go("two-factor-screen");
        else go("home-screen");
    }

    // ---------- username claim (shared by email sign-up and Google sign-up) ----------
    // Creates the username, its search entry and the private profile in one atomic write. The security
    // rules only allow `create` on a username that does not exist yet, so two people can never share one.
    async function claimProfile(user, username, email, verificationWord) {
        const now = firebase.firestore.FieldValue.serverTimestamp();
        const batch = firebaseDB.batch();
        batch.set(firebaseDB.collection("usernames").doc(username), { uid: user.uid, verificationWord, createdAt: now });
        // Name-only entry that powers the live "type part of a username" search.
        batch.set(firebaseDB.collection("usernameIndex").doc(username), { username });
        batch.set(firebaseDB.collection("users").doc(user.uid), {
            username, email, verificationWord, twoFactorEnabled:false, securitySetupComplete:false, createdAt: now
        });
        try { await batch.commit(); }
        catch (e) {
            console.error("VYRO USERNAME CLAIM ERROR:", e);
            throw (e && e.code === "permission-denied") ? { code: "username-taken" } : e;
        }
    }

    // ---------- live username check (inline, red when taken) ----------
    function setStatus(statusEl, input, message, kind) {
        if (statusEl) { statusEl.textContent = message || ""; statusEl.className = "field-status" + (kind ? " " + kind : ""); }
        if (input) input.classList.toggle("input-bad", kind === "bad");
    }

    async function isUsernameTaken(name) {
        const snap = await firebaseDB.collection("usernameIndex").doc(name).get();
        return snap.exists;
    }

    function watchUsername(input, statusEl) {
        if (!input || !statusEl) return;
        let timer = null;
        let seq = 0;
        input.addEventListener("input", function () {
            clearTimeout(timer);
            const name = cleanUsername(input.value);
            seq++;
            if (!name) { setStatus(statusEl, input, ""); return; }
            if (!/^[a-z0-9_]*$/.test(name)) { setStatus(statusEl, input, "Use only letters, numbers and underscores.", "bad"); return; }
            if (name.length < 3) { setStatus(statusEl, input, ""); return; }
            if (name.length > 20) { setStatus(statusEl, input, "Usernames are at most 20 characters.", "bad"); return; }
            setStatus(statusEl, input, "Checking…", "pending");
            const mine = seq;
            timer = setTimeout(async function () {
                try {
                    const taken = await isUsernameTaken(name);
                    if (mine !== seq) return;
                    if (taken) setStatus(statusEl, input, "@" + name + " is already taken. Please choose another.", "bad");
                    else setStatus(statusEl, input, "@" + name + " is available.", "good");
                } catch (e) {
                    if (mine === seq) setStatus(statusEl, input, "");   // could not check: the sign-up itself still enforces it
                }
            }, 350);
        });
    }

    let registering = false;   // stops the rollback sign-out from yanking the user off the form

    async function createAccount() {
        const usernameInput = screen("username");
        const statusEl = screen("username-status");
        const username = cleanUsername(usernameInput?.value || "");
        const email = (screen("email")?.value || "").trim().toLowerCase();
        const password = screen("password")?.value || "";
        const verificationWord = (screen("verification-word")?.value || "").trim().toUpperCase();

        if (!username || !email || !password || !verificationWord) { alert("Please complete all fields."); return; }
        if (!/^[a-z0-9_]{3,20}$/.test(username)) { setStatus(statusEl, usernameInput, "Username must be 3–20 characters: letters, numbers or underscores.", "bad"); return; }
        if (password.length < 8) { alert("Password must be at least 8 characters."); return; }

        const button = screen("continue-registration-btn");
        if (button) { button.disabled = true; button.textContent = "CREATING..."; }
        registering = true;
        try {
            // Check first, so the person is told before anything is created.
            let taken = false;
            try { taken = await isUsernameTaken(username); } catch (e) { /* the claim below still enforces it */ }
            if (taken) { setStatus(statusEl, usernameInput, "@" + username + " is already taken. Please choose another.", "bad"); return; }

            const credential = await firebaseAuth.createUserWithEmailAndPassword(email, password);
            const user = credential.user;
            try {
                await claimProfile(user, username, email, verificationWord);
            } catch (claimError) {
                // Roll back the half-created account so the email can be used again.
                try { await user.delete(); } catch (e) { console.warn("VYRO rollback failed:", e); }
                throw claimError;
            }
            await user.sendEmailVerification();
            localStorage.setItem("vyro_pending_username", username);
            localStorage.setItem("vyro_pending_user_id", user.uid);
            saveProfileLocally({username});
            go("email-verification-screen");
        } catch (error) {
            console.error("VYRO REGISTRATION ERROR:", error);
            if (error && error.code === "username-taken") {
                setStatus(statusEl, usernameInput, "@" + username + " is already taken. Please choose another.", "bad");
            } else {
                alert("Registration error: " + friendlyAuthError(error));
            }
        } finally {
            if (button) { button.disabled = false; button.textContent = "CONTINUE"; }
            setTimeout(function () { registering = false; }, 1000);
        }
    }

    // ---------- Google sign-in ----------
    async function signInWithGoogle(button) {
        const label = button ? button.textContent : "";
        if (button) { button.disabled = true; button.textContent = "OPENING GOOGLE..."; }
        try {
            const provider = new firebase.auth.GoogleAuthProvider();
            provider.setCustomParameters({ prompt: "select_account" });
            const credential = await firebaseAuth.signInWithPopup(provider);
            await routeAuthenticatedUser(credential.user);   // existing member: Home; new: choose a username
        } catch (error) {
            const code = error && error.code || "";
            if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") return;
            console.error("VYRO GOOGLE SIGN-IN ERROR:", error);
            if (code === "auth/popup-blocked") alert("Your browser blocked the Google window. Allow pop-ups for this site and try again.");
            else if (code === "auth/unauthorized-domain") alert("Google sign-in is not enabled for this website address yet. Add it under Firebase → Authentication → Settings → Authorized domains.");
            else if (code === "auth/operation-not-allowed") alert("Google sign-in is not turned on yet. Enable it under Firebase → Authentication → Sign-in method.");
            else if (code === "auth/account-exists-with-different-credential") alert("An account with this email already exists. Log in with your email and password.");
            else alert("Google sign-in failed: " + friendlyAuthError(error));
        } finally {
            if (button) { button.disabled = false; button.textContent = label; }
        }
    }

    // Finishes a Google sign-up: the person picks a username and verification word.
    async function completeProfileSetup() {
        const user = firebaseAuth.currentUser;
        const input = screen("setup-username");
        const statusEl = screen("setup-username-status");
        if (!user) { alert("Please sign in again."); go("welcome-screen"); return; }
        const username = cleanUsername(input?.value || "");
        const verificationWord = (screen("setup-verification-word")?.value || "").trim().toUpperCase();
        if (!username || !verificationWord) { alert("Please complete all fields."); return; }
        if (!/^[a-z0-9_]{3,20}$/.test(username)) { setStatus(statusEl, input, "Username must be 3–20 characters: letters, numbers or underscores.", "bad"); return; }

        const button = screen("setup-continue-btn");
        if (button) { button.disabled = true; button.textContent = "SAVING..."; }
        try {
            await claimProfile(user, username, (user.email || "").toLowerCase(), verificationWord);
            saveProfileLocally({username});
            await routeAuthenticatedUser(user);
        } catch (error) {
            if (error && error.code === "username-taken") setStatus(statusEl, input, "@" + username + " is already taken. Please choose another.", "bad");
            else { console.error("VYRO SETUP ERROR:", error); alert("Could not finish setting up your account: " + friendlyAuthError(error)); }
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
            if (window.VYROPayments) VYROPayments.clearPendingPayment();
            if (window.VYROWallet) VYROWallet.setUser(null);
            ["vyro_username","vyro_pending_payment","vyro_transactions","vyro_connected_wallets","vyro_active_wallet","vyro_connected_wallet","vyro_connected_wallet_type"].forEach(function (k) { localStorage.removeItem(k); });
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
        bind("google-login-btn", function () { signInWithGoogle(screen("google-login-btn")); });
        bind("google-signup-btn", function () { signInWithGoogle(screen("google-signup-btn")); });
        bind("setup-continue-btn", completeProfileSetup);
        bind("setup-cancel-btn", logout);
        watchUsername(screen("username"), screen("username-status"));
        watchUsername(screen("setup-username"), screen("setup-username-status"));

        const verify = screen("verify-email-btn");
        if (verify) verify.addEventListener("click",async function(){
            const user=firebaseAuth.currentUser;
            if (!user) { alert("Please log in again."); return; }
            try { await user.reload(); if (!firebaseAuth.currentUser?.emailVerified) { alert("Your email has not been verified yet. Please check your inbox."); return; } await routeAuthenticatedUser(firebaseAuth.currentUser); }
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
            if (!user) {
                if (window.VYROWallet) VYROWallet.setUser(null);
                if (window.VYROPayments) VYROPayments.clearPendingPayment();
                if (!firstAuthEvent && !registering) go("welcome-screen");   // signed out elsewhere
                firstAuthEvent=false;
                return;
            }
            if (window.VYROWallet) VYROWallet.setUser(user.uid);
            if (!firstAuthEvent) return;
            firstAuthEvent=false;
            await routeAuthenticatedUser(user);
        });
    }

    window.VYROAuth = {createAccount,signInWithGoogle,completeProfileSetup,login,logout,forgotPassword,routeAuthenticatedUser,loadProfile};

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded",init);
    else init();
})();
