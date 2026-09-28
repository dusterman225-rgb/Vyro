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

const continueRegistrationButton = document.getElementById("continue-registration-btn");

continueRegistrationButton.addEventListener("click", async function () {

    const username = document.getElementById("username").value.trim();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const verificationWord = document.getElementById("verification-word").value.trim();

    if (!username || !email || !password || !verificationWord) {
        alert("Please complete all fields.");
        return;
    }

    if (password.length < 8) {
        alert("Password must be at least 8 characters.");
        return;
    }

    try {

        const { data, error } = await supabaseClient.auth.signUp({
            email: email,
            password: password
        });

        if (error) {
            alert(error.message);
            return;
        }

        if (!data.user) {
            alert("Unable to create your account.");
            return;
        }

// Save registration details temporarily until email is confirmed.
localStorage.setItem("vyro_pending_username", username);
localStorage.setItem("vyro_pending_verification_word", verificationWord);
localStorage.setItem("vyro_pending_user_id", data.user.id);

        showScreen(document.getElementById("email-verification-screen"));

} catch (error) {

    console.error("VYRO REGISTRATION ERROR:", error);
    console.error("ERROR NAME:", error.name);
    console.error("ERROR MESSAGE:", error.message);
    console.error("ERROR STACK:", error.stack);

    alert("Registration error: " + error.message);

}
});