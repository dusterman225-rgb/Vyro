// =========================================================
// VYRO AUTHENTICATION — FIREBASE
// =========================================================


// =========================================================
// CREATE ACCOUNT
// =========================================================

const continueRegistrationButton =
    document.getElementById(
        "continue-registration-btn"
    );

if (continueRegistrationButton) {

    continueRegistrationButton.addEventListener(
        "click",
        async function () {

            const username =
                document.getElementById(
                    "username"
                ).value.trim();

            const email =
                document.getElementById(
                    "email"
                ).value.trim();

            const password =
                document.getElementById(
                    "password"
                ).value;

            const verificationWord =
                document.getElementById(
                    "verification-word"
                ).value.trim();


            if (
                !username ||
                !email ||
                !password ||
                !verificationWord
            ) {

                alert(
                    "Please complete all fields."
                );

                return;
            }


            if (password.length < 8) {

                alert(
                    "Password must be at least 8 characters."
                );

                return;
            }


            try {

                // Create Firebase account

                const userCredential =
                    await firebaseAuth
                        .createUserWithEmailAndPassword(
                            email,
                            password
                        );


                const user =
                    userCredential.user;


                // Send verification email

                await user.sendEmailVerification();


// =====================================================
// SAVE VYRO PROFILE
// =====================================================

await firebaseDB
    .collection("users")
    .doc(user.uid)
    .set({

        username:
            username,

        verificationWord:
            verificationWord,

        email:
            email,

        twoFactorEnabled:
            false,

        securitySetupComplete:
            false,

        createdAt:
            firebase.firestore
                .FieldValue
                .serverTimestamp()

    });


// =====================================================
// SAVE TEMPORARY INFORMATION
// =====================================================

localStorage.setItem(
    "vyro_pending_username",
    username
);

localStorage.setItem(
    "vyro_pending_user_id",
    user.uid
);


// =====================================================
// OPEN EMAIL VERIFICATION SCREEN
// =====================================================

showScreen(
    document.getElementById(
        "email-verification-screen"
    )
);

            } catch (error) {

                console.error(
                    "VYRO REGISTRATION ERROR:",
                    error
                );


                if (
                    error.code ===
                    "auth/email-already-in-use"
                ) {

                    alert(
                        "This email is already registered. Please use LOGIN."
                    );

                } else {

                    alert(
                        "Registration error: " +
                        error.message
                    );

                }

            }

        }
    );

}



// =========================================================
// FORGOT PASSWORD
// =========================================================

const forgotPasswordButton =
    document.getElementById(
        "forgot-password-btn"
    );


if (forgotPasswordButton) {

    forgotPasswordButton.addEventListener(
        "click",
        async function () {

            const email =
                document.getElementById(
                    "login-email"
                ).value.trim();


            if (!email) {

                alert(
                    "Enter your email address first."
                );

                return;
            }


            try {

                await firebaseAuth
                    .sendPasswordResetEmail(
                        email
                    );


                alert(
                    "Password reset email sent. Check your inbox."
                );


            } catch (error) {

                console.error(
                    "VYRO PASSWORD RESET ERROR:",
                    error
                );


                alert(
                    "Unable to send password reset email."
                );

            }

        }
    );

}


// =========================================================
// AUTH — APP READY
// =========================================================

console.log(
    "VYRO Firebase authentication loaded successfully."
);

// =========================================================
// LOGIN
// =========================================================

const loginSubmitButton =
    document.getElementById(
        "login-submit-btn"
    ); 

console.log(
    "VYRO LOGIN BUTTON FOUND:",
    loginSubmitButton
);


if (loginSubmitButton) {

    loginSubmitButton.addEventListener(
        "click",
        async function () {

            const email =
                document.getElementById(
                    "login-email"
                ).value.trim();

            const password =
                document.getElementById(
                    "login-password"
                ).value;


            if (!email || !password) {

                alert(
                    "Please enter your email and password."
                );

                return;
            }


            try {

                // Sign into Firebase

                const userCredential =
                    await firebaseAuth
                        .signInWithEmailAndPassword(
                            email,
                            password
                        );


                const user =
                    userCredential.user;


                // Refresh Firebase user information

                await user.reload();


                const updatedUser =
                    firebaseAuth.currentUser;


                // Check email verification

                if (!updatedUser.emailVerified) {

                    localStorage.setItem(
                        "vyro_pending_user_id",
                        updatedUser.uid
                    );

                    showScreen(
                        document.getElementById(
                            "email-verification-screen"
                        )
                    );

                    return;
                }


                // =====================================================
                // GET VYRO PROFILE
                // =====================================================

                const userDocument =
                    await firebaseDB
                        .collection("users")
                        .doc(updatedUser.uid)
                        .get();


                let userData = {};


                if (userDocument.exists) {

                    userData =
                        userDocument.data();


                    if (
                        userData.username
                    ) {

                        localStorage.setItem(
                            "vyro_username",
                            userData.username
                        );

                    }

                }


                // =====================================================
                // SECURITY SETUP
                // =====================================================

                // New accounts must choose their
                // 2FA preference before entering Home.

                if (
                    userData.securitySetupComplete !== true
                ) {

                    showScreen(
                        document.getElementById(
                            "two-factor-screen"
                        )
                    );

                    return;
                }


                // =====================================================
                // CHECK 2FA
                // =====================================================

                if (
                    userData.twoFactorEnabled === true
                ) {

                    showScreen(
                        document.getElementById(
                            "two-factor-screen"
                        )
                    );

                } else {

                    showScreen(
                        document.getElementById(
                            "home-screen"
                        )
                    );

                }


            } catch (error) {

                console.error(
                    "VYRO LOGIN ERROR:",
                    error
                );


                if (
                    error.code ===
                    "auth/invalid-credential"
                ) {

                    alert(
                        "Incorrect email or password."
                    );

                } else if (
                    error.code ===
                    "auth/user-not-found"
                ) {

                    alert(
                        "No VYRO account was found with this email."
                    );

                } else if (
                    error.code ===
                    "auth/wrong-password"
                ) {

                    alert(
                        "Incorrect email or password."
                    );

                } else {

                    alert(
                        "Login error: " +
                        error.message
                    );

                }

            }

        }
    );

}
