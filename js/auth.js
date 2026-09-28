// =========================================================
// SUPABASE CONNECTION TEST
// =========================================================

const supabaseClient = supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
);

console.log("VYRO Supabase connection initialized.");

// =========================================================
// VYRO REGISTRATION
// =========================================================

// =========================================================
// VYRO REGISTRATION — FIREBASE
// =========================================================

const continueRegistrationButton = document.getElementById(
    "continue-registration-btn"
);

continueRegistrationButton.addEventListener("click", async function () {

    const username = document.getElementById("username").value.trim();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const verificationWord = document.getElementById(
        "verification-word"
    ).value.trim();

    if (!username || !email || !password || !verificationWord) {
        alert("Please complete all fields.");
        return;
    }

    if (password.length < 8) {
        alert("Password must be at least 8 characters.");
        return;
    }

    try {

        const userCredential =
            await firebaseAuth.createUserWithEmailAndPassword(
                email,
                password
            );

        const user = userCredential.user;

        await user.sendEmailVerification();

        await firebaseDB
            .collection("users")
            .doc(user.uid)
            .set({
                username: username,
                verificationWord: verificationWord,
                email: email,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

        localStorage.setItem(
            "vyro_pending_username",
            username
        );

        localStorage.setItem(
            "vyro_pending_user_id",
            user.uid
        );

        showScreen(
            document.getElementById(
                "email-verification-screen"
            )
        );

    } catch (error) {

        console.error(
            "VYRO FIREBASE REGISTRATION ERROR:",
            error
        );

        alert(
            "Registration error: " + error.message
        );
    }
});
