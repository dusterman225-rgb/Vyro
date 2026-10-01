// =========================================================
// VYRO — FIREBASE CONNECTION TEST
// =========================================================

console.log("VYRO Firebase:", firebaseApp);
console.log("VYRO Firebase Auth:", firebaseAuth);
console.log("VYRO Firebase Firestore:", firebaseDB);


// =========================================================
// VYRO — SCREEN NAVIGATION
// =========================================================

const welcomeScreen = document.getElementById(
    "welcome-screen"
);

const createAccountScreen = document.getElementById(
    "create-account-screen"
);

const loginScreen = document.getElementById(
    "login-screen"
);

const emailVerificationScreen = document.getElementById(
    "email-verification-screen"
);

const twoFactorScreen = document.getElementById(
    "two-factor-screen"
);

const twoFactorCodeScreen = document.getElementById(
    "two-factor-code-screen"
);

const homeScreen = document.getElementById(
    "home-screen"
);

const sendScreen = document.getElementById(
    "send-screen"
);

const confirmPaymentScreen = document.getElementById(
    "confirm-payment-screen"
);

const receiveScreen = document.getElementById(
    "receive-screen"
);

// =========================================================
// VYRO — ADDITIONAL SCREEN REFERENCES
// =========================================================

const transactionHistoryScreen =
    document.getElementById(
        "transaction-history-screen"
    );

const transactionDetailsScreen =
    document.getElementById(
        "transaction-details-screen"
    );

const changeEmailScreen =
    document.getElementById(
        "change-email-screen"
    );

const changePasswordScreen =
    document.getElementById(
        "change-password-screen"
    );

const changeVerificationWordScreen =
    document.getElementById(
        "change-verification-word-screen"
    );

const deleteAccountScreen =
    document.getElementById(
        "delete-account-screen"
    );

const connectWalletScreen =
    document.getElementById(
        "connect-wallet-screen"
    );

const walletConnectedScreen =
    document.getElementById(
        "wallet-connected-screen"
    );

const paymentSuccessScreen =
    document.getElementById(
        "payment-success-screen"
    );

const paymentFailedScreen =
    document.getElementById(
        "payment-failed-screen"
    );


// =========================================================
// VYRO — ACCOUNT SCREENS
// =========================================================

const profileScreen =
    document.getElementById(
        "profile-screen"
    );

const settingsScreen =
    document.getElementById(
        "settings-screen"
    );

const securityScreen =
    document.getElementById(
        "security-screen"
    );

const walletsScreen =
    document.getElementById(
        "wallets-screen"
    );


// =========================================================
// VYRO — SHOW SCREEN
// =========================================================

function showScreen(screen) {

    if (!screen) {
        console.error("VYRO: Screen not found.");
        return;
    }

    document
        .querySelectorAll(".screen")
        .forEach(function (item) {

            item.classList.remove("active");

        });

    screen.classList.add("active");

}

// =========================================================
// VYRO STAGE 5
// WALLET SELECTORS — SEND / RECEIVE
// =========================================================

function formatWalletForSelector(wallet) {
    
    if (!wallet) {
        return "Select wallet";
    }
    
    const provider =
        wallet.provider ||
        "External Wallet";
    
    const address =
        wallet.address ||
        "";
    
    if (!address) {
        return provider;
    }
    
    return (
        provider +
        " • " +
        address.slice(0, 6) +
        "..." +
        address.slice(-4)
    );
}


// =========================================================
// POPULATE WALLET SELECTORS
// =========================================================

function populateWalletSelectors() {
    
    if (
        typeof VYROWallet ===
        "undefined"
    ) {
        return;
    }
    
    const wallets =
        VYROWallet.getWallets();
    
    const activeWallet =
        VYROWallet.getActiveWallet();
    
    
    const sendWallet =
        document.getElementById(
            "send-wallet"
        );
    
    const receiveWallet =
        document.getElementById(
            "receive-wallet"
        );
    
    
    function populateSelect(select) {
        
        if (!select) {
            return;
        }
        
        const previousValue =
            select.value;
        
        select.innerHTML = "";
        
        
        const placeholder =
            document.createElement(
                "option"
            );
        
        placeholder.value = "";
        
        placeholder.textContent =
            "Select wallet";
        
        select.appendChild(
            placeholder
        );
        
        
        wallets.forEach(
            function(wallet) {
                
                const option =
                    document.createElement(
                        "option"
                    );
                
                option.value =
                    wallet.address;
                
                option.textContent =
                    formatWalletForSelector(
                        wallet
                    );
                
                select.appendChild(
                    option
                );
            }
        );
        
        
        if (
            previousValue &&
            wallets.some(
                function(wallet) {
                    return (
                        wallet.address ===
                        previousValue
                    );
                }
            )
        ) {
            
            select.value =
                previousValue;
            
        } else if (
            activeWallet
        ) {
            
            select.value =
                activeWallet.address;
        }
    }
    
    
    populateSelect(
        sendWallet
    );
    
    populateSelect(
        receiveWallet
    );
}


// =========================================================
// UPDATE RECEIVE WALLET ADDRESS
// =========================================================

function updateReceiveWalletDisplay() {
    
    const receiveWallet =
        document.getElementById(
            "receive-wallet"
        );
    
    const receiveAddress =
        document.getElementById(
            "receive-wallet-address"
        );
    
    
    if (
        !receiveWallet ||
        !receiveAddress
    ) {
        return;
    }
    
    
    const address =
        receiveWallet.value;
    
    
    if (!address) {
        
        receiveAddress.textContent =
            "Select a wallet";
        
        return;
    }
    
    
    receiveAddress.textContent =
        address.slice(0, 8) +
        "..." +
        address.slice(-6);
}


// =========================================================
// RECEIVE WALLET SELECTION
// =========================================================

const receiveWalletSelector =
    document.getElementById(
        "receive-wallet"
    );

if (receiveWalletSelector) {
    
    receiveWalletSelector.addEventListener(
        "change",
        function() {
            
            updateReceiveWalletDisplay();
            
        }
    );
}



// =========================================================
// VYRO — ANDROID / BROWSER BACK BUTTON
// =========================================================

window.addEventListener("popstate", function () {
    showScreen(homeScreen);
});


// =========================================================
// WELCOME → CREATE ACCOUNT
// =========================================================

const getStartedButton = document.getElementById(
    "get-started-btn"
);

const createAccountBackButton = document.getElementById(
    "create-account-back"
);


getStartedButton.addEventListener(
    "click",
    function () {

        showScreen(createAccountScreen);

    }
);


createAccountBackButton.addEventListener(
    "click",
    function () {

        showScreen(welcomeScreen);

    }
);


// =========================================================
// WELCOME → LOGIN
// =========================================================

const loginButton = document.getElementById(
    "login-btn"
);

const loginBackButton = document.getElementById(
    "login-back"
);


loginButton.addEventListener(
    "click",
    function () {

        showScreen(loginScreen);

    }
);


loginBackButton.addEventListener(
    "click",
    function () {

        showScreen(welcomeScreen);

    }
);


// =========================================================
// EMAIL VERIFICATION
// =========================================================

const verifyEmailButton = document.getElementById(
    "verify-email-btn"
);

const resendEmailButton = document.getElementById(
    "resend-email-btn"
);

const emailVerificationBackButton =
    document.getElementById(
        "email-verification-back"
    );


// =========================================================
// VERIFY EMAIL → 2FA
// =========================================================

verifyEmailButton.addEventListener(
    "click",
    async function () {

        const user = firebaseAuth.currentUser;

        if (!user) {

            alert(
                "Your account could not be found. Please log in again."
            );

            return;
        }


        try {

            // Refresh Firebase user information
            await user.reload();

            const updatedUser =
                firebaseAuth.currentUser;


            if (!updatedUser.emailVerified) {

                alert(
                    "Your email has not been verified yet. " +
                    "Please open the VYRO verification email " +
                    "and tap VERIFY EMAIL."
                );

                return;
            }


            // Email is verified
            showScreen(twoFactorScreen);

        } catch (error) {

            console.error(
                "VYRO EMAIL VERIFICATION ERROR:",
                error
            );

            alert(
                "Unable to check your email verification status. " +
                "Please try again."
            );

        }

    }
);


// =========================================================
// RESEND VERIFICATION EMAIL
// =========================================================

resendEmailButton.addEventListener(
    "click",
    async function () {

        const user = firebaseAuth.currentUser;

        if (!user) {

            alert(
                "Please start registration again."
            );

            return;
        }


        try {

            await user.sendEmailVerification();

            alert(
                "A new verification email has been sent. " +
                "Please check your inbox and your spam or junk folder."
            );

        } catch (error) {

            console.error(
                "VYRO RESEND VERIFICATION ERROR:",
                error
            );

            alert(
                "Unable to resend the verification email. " +
                "Please wait a moment and try again."
            );

        }

    }
);


// =========================================================
// EMAIL VERIFICATION → CREATE ACCOUNT
// =========================================================

emailVerificationBackButton.addEventListener(
    "click",
    function () {

        showScreen(createAccountScreen);

    }
);


// =========================================================
// HOME — PROFILE MENU
// =========================================================

// The old Home VYRO logo button was replaced
// by the profile avatar.


// =========================================================
// HOME → SEND
// =========================================================

const sendButton = document.getElementById(
    "send-btn"
);


sendButton.addEventListener(
    "click",
    function() {
        
        populateWalletSelectors();
        
        showScreen(
            sendScreen
        );
        
    }
);

// =========================================================
// 2FA NAVIGATION
// =========================================================

const twoFactorBackButton = document.getElementById("two-factor-back");

if (twoFactorBackButton) {
    twoFactorBackButton.addEventListener("click", function () {
        showScreen(emailVerificationScreen);
    });
}

// =========================================================
// 2FA — SKIP FOR NOW
// =========================================================

const skipTwoFactorButton =
    document.getElementById(
        "skip-two-factor-btn"
    );

if (skipTwoFactorButton) {

    skipTwoFactorButton.addEventListener(
        "click",
        async function () {

            console.log(
                "VYRO: SKIP FOR NOW clicked."
            );

            const user =
                firebaseAuth.currentUser;

            if (!user) {

                alert(
                    "Your account could not be found. Please log in again."
                );

                return;
            }

            try {

                console.log(
                    "VYRO: Saving 2FA preference..."
                );

                await firebaseDB
                    .collection("users")
                    .doc(user.uid)
                    .set(
                        {
                            twoFactorEnabled: false,
                            securitySetupComplete: true
                        },
                        {
                            merge: true
                        }
                    );

                console.log(
                    "VYRO: 2FA preference saved."
                );

                console.log(
                    "VYRO: Opening Home screen."
                );

                showScreen(
                    homeScreen
                );

            } catch (error) {

                console.error(
                    "VYRO 2FA SKIP ERROR:",
                    error
                );

                alert(
                    "Unable to save your security preference."
                );

            }

        }
    );

}

// =========================================================
// SEND NAVIGATION
// =========================================================

const sendBackButton = document.getElementById(
    "send-back-btn"
);

const sendHomeLogoButton = document.getElementById(
    "send-home-logo-btn"
);


sendBackButton.addEventListener(
    "click",
    function () {

        showScreen(homeScreen);

    }
);


sendHomeLogoButton.addEventListener(
    "click",
    function () {

        showScreen(homeScreen);

    }
);

// =========================================================
// 2FA — ENABLE
// =========================================================

const enableTwoFactorButton = document.getElementById(
    "enable-two-factor-btn"
);

if (enableTwoFactorButton) {

    enableTwoFactorButton.addEventListener(
        "click",
        async function () {

            const user = firebaseAuth.currentUser;

            if (!user) {

                alert(
                    "Your account could not be found. Please log in again."
                );

                return;
            }


            // =====================================================
            // TEMPORARY 2FA SETUP
            // =====================================================
            //
            // The secure email-code system will be connected
            // to this button after the server-side system is built.
            //
            // We do NOT enable 2FA yet because there is no
            // secure email verification code being generated.
            // =====================================================

            alert(
                "VYRO will send a security code to your email during the next step."
            );


            // Open the 2FA code screen

            if (twoFactorCodeScreen) {

                showScreen(
                    twoFactorCodeScreen
                );

            }

        }
    );

}


// =========================================================
// SEND → CONFIRM PAYMENT
// =========================================================

const continueSendButton =
    document.getElementById(
        "continue-send-btn"
    );


if (continueSendButton) {

    continueSendButton.addEventListener(
        "click",
        function () {

            const recipientInput =
                document.getElementById(
                    "send-recipient"
                );

            const amountInput =
                document.getElementById(
                    "send-amount"
                );

            const networkInput =
                document.getElementById(
                    "send-network"
                );


            const recipient =
                recipientInput.value.trim();

            const amount =
                amountInput.value.trim();

            const network =
                networkInput.value;


            if (!recipient) {

                alert(
                    "Please enter a recipient."
                );

                return;
            }


            if (
                !amount ||
                Number(amount) <= 0
            ) {

                alert(
                    "Please enter a valid amount."
                );

                return;
            }


            // =================================================
            // SAVE PAYMENT INFORMATION FOR CONFIRMATION
            // =================================================

            const pendingPayment = {

                recipient:
                    "@" +
                    recipient.replace(
                        /^@/,
                        ""
                    ),

                amount:
                    amount,

                asset:
                    "USDC",

                network:
                    network === "solana"
                        ? "Solana"
                        : network,

                type:
                    "Send"

            };


            localStorage.setItem(
                "vyro_pending_payment",
                JSON.stringify(
                    pendingPayment
                )
            );


            // =================================================
            // UPDATE CONFIRMATION SCREEN
            // =================================================

            document.getElementById(
                "confirm-recipient"
            ).textContent =
                pendingPayment.recipient;


            document.getElementById(
                "confirm-amount"
            ).textContent =
                amount + " USDC";


            document.getElementById(
                "confirm-network"
            ).textContent =
                pendingPayment.network;


            showScreen(
                confirmPaymentScreen
            );

        }
    );

}


// =========================================================
// CONFIRM PAYMENT → BACK TO SEND
// =========================================================

const confirmBackButton =
    document.getElementById(
        "confirm-back-btn"
    );


if (confirmBackButton) {

    confirmBackButton.addEventListener(
        "click",
        function () {

            showScreen(
                sendScreen
            );

        }
    );

}


// =========================================================
// CONFIRM PAYMENT → HOME
// =========================================================

const confirmHomeLogoButton =
    document.getElementById(
        "confirm-home-logo-btn"
    );


if (confirmHomeLogoButton) {

    confirmHomeLogoButton.addEventListener(
        "click",
        function () {

            showScreen(
                homeScreen
            );

        }
    );

}

// =========================================================
// VYRO — RECIPIENT LOOKUP
// =========================================================

const sendRecipientInput =
    document.getElementById(
        "send-recipient"
    );

const recipientResult =
    document.getElementById(
        "recipient-result"
    );

const recipientDisplay =
    document.getElementById(
        "recipient-display"
    );


sendRecipientInput.addEventListener(
    "input",
    function () {

        const username =
            this.value
                .trim()
                .replace(/^@/, "");


        if (!username) {

            recipientResult.classList.remove(
                "visible"
            );

            return;
        }


        recipientDisplay.textContent =
            "@" + username;


        recipientResult.classList.add(
            "visible"
        );

    }
);


// =========================================================
// HOME → RECEIVE
// =========================================================

const receiveButton = document.getElementById(
    "receive-btn"
);


receiveButton.addEventListener(
    "click",
    function () {

        showScreen(receiveScreen);

    }
);


// =========================================================
// RECEIVE NAVIGATION
// =========================================================

const receiveBackButton =
    document.getElementById(
        "receive-back-btn"
    );

const receiveHomeLogoButton =
    document.getElementById(
        "receive-home-logo-btn"
    );


receiveBackButton.addEventListener(
    "click",
    function () {

        showScreen(homeScreen);

    }
);


receiveHomeLogoButton.addEventListener(
    "click",
    function () {

        showScreen(homeScreen);

    }
);


// =========================================================
// RECEIVE — COPY USERNAME
// =========================================================

const copyReceiveButton =
    document.getElementById(
        "copy-receive-btn"
    );


copyReceiveButton.addEventListener(
    "click",
    function () {

        const usernameElement =
            document.querySelector(
                ".receive-username"
            );


        if (!usernameElement) {

            alert(
                "Username could not be found."
            );

            return;
        }


        const username =
            usernameElement.textContent.trim();


        // Modern clipboard
        if (
            navigator.clipboard &&
            navigator.clipboard.writeText
        ) {

            navigator.clipboard
                .writeText(username)
                .then(function () {

                    const originalText =
                        copyReceiveButton.textContent;


                    copyReceiveButton.textContent =
                        "COPIED ✓";


                    setTimeout(
                        function () {

                            copyReceiveButton.textContent =
                                originalText;

                        },
                        1500
                    );

                })
                .catch(function () {

                    alert(
                        "Unable to copy username."
                    );

                });

            return;
        }


        // Fallback for browsers without
        // navigator.clipboard
        const temporaryInput =
            document.createElement(
                "input"
            );


        temporaryInput.value =
            username;


        document.body.appendChild(
            temporaryInput
        );


        temporaryInput.select();


        try {

            document.execCommand(
                "copy"
            );

            const originalText =
                copyReceiveButton.textContent;


            copyReceiveButton.textContent =
                "COPIED ✓";


            setTimeout(
                function () {

                    copyReceiveButton.textContent =
                        originalText;

                },
                1500
            );

        } catch (error) {

            alert(
                "Unable to copy username."
            );

        }


        document.body.removeChild(
            temporaryInput
        );

    }
);


// =========================================================
// RECEIVE — DISPLAY SAVED USERNAME
// =========================================================

const receiveUsername =
    document.querySelector(
        ".receive-username"
    );


const savedUsername =
    localStorage.getItem(
        "vyro_username"
    );


const pendingUsername =
    localStorage.getItem(
        "vyro_pending_username"
    );


const usernameToDisplay =
    savedUsername ||
    pendingUsername;


if (
    usernameToDisplay &&
    receiveUsername
) {

    receiveUsername.textContent =
        "@" +
        usernameToDisplay.replace(
            /^@/,
            ""
        );

}


// =========================================================
// VYRO — APP READY
// =========================================================

console.log(
    "VYRO app navigation loaded successfully."
)

// =========================================================
// 2FA CODE SCREEN — NAVIGATION
// =========================================================

const twoFactorCodeBackButton =
    document.getElementById(
        "two-factor-code-back"
    );


if (twoFactorCodeBackButton) {

    twoFactorCodeBackButton.addEventListener(
        "click",
        function () {

            showScreen(
                twoFactorScreen
            );

        }
    );

}


// =========================================================
// 2FA CODE — VERIFY PLACEHOLDER
// =========================================================

const verifyTwoFactorCodeButton =
    document.getElementById(
        "verify-two-factor-code-btn"
    );


if (verifyTwoFactorCodeButton) {

    verifyTwoFactorCodeButton.addEventListener(
        "click",
        function () {

            const code =
                document.getElementById(
                    "two-factor-code"
                ).value.trim();


            if (!code) {

                alert(
                    "Please enter the security code."
                );

                return;

            }


            if (code.length !== 6) {

                alert(
                    "Please enter the 6-digit security code."
                );

                return;

            }


            alert(
                "Real email verification will be connected here."
            );

        }
    );

}


// =========================================================
// 2FA CODE — RESEND PLACEHOLDER
// =========================================================

const resendTwoFactorCodeButton =
    document.getElementById(
        "resend-two-factor-code-btn"
    );


if (resendTwoFactorCodeButton) {

    resendTwoFactorCodeButton.addEventListener(
        "click",
        function () {

            alert(
                "Real email code delivery will be connected here."
            );

        }
    );

}

// =========================================================
// VYRO — CUSTOM POPUP SYSTEM
// =========================================================

window.alert = function (message) {

    const existingModal =
        document.querySelector(
            ".vyro-modal-overlay"
        );

    if (existingModal) {

        existingModal.remove();

    }


    const overlay =
        document.createElement(
            "div"
        );

    overlay.className =
        "vyro-modal-overlay";


    const modal =
        document.createElement(
            "div"
        );

    modal.className =
        "vyro-modal";


    const logo =
        document.createElement(
            "div"
        );

    logo.className =
        "vyro-modal-logo";

    logo.textContent =
        "VYRO";


    const messageElement =
        document.createElement(
            "div"
        );

    messageElement.className =
        "vyro-modal-message";

    messageElement.textContent =
        message;


    const button =
        document.createElement(
            "button"
        );

    button.className =
        "vyro-modal-button";

    button.type =
        "button";

    button.textContent =
        "OK";


    button.addEventListener(
        "click",
        function () {

            overlay.remove();

        }
    );


    modal.appendChild(
        logo
    );

    modal.appendChild(
        messageElement
    );

    modal.appendChild(
        button
    );

    overlay.appendChild(
        modal
    );

    document.body.appendChild(
        overlay
    );

};

// =========================================================
// VYRO — PROFILE AVATAR
// =========================================================

const profileMenuButton =
    document.getElementById(
        "profile-menu-btn"
    );

const profileAvatarInitial =
    document.getElementById(
        "profile-avatar-initial"
    );

const profileMenuUsername =
    document.getElementById(
        "profile-menu-username"
    );


// =========================================================
// LOAD USERNAME
// =========================================================

const profileUsername =
    localStorage.getItem(
        "vyro_username"
    );


if (
    profileUsername &&
    profileAvatarInitial
) {

    const cleanUsername =
        profileUsername
            .replace(/^@/, "")
            .trim();

    if (cleanUsername) {

        profileAvatarInitial.textContent =
            cleanUsername
                .charAt(0)
                .toUpperCase();

    }
}


if (
    profileUsername &&
    profileMenuUsername
) {

    profileMenuUsername.textContent =
        "@" +
        profileUsername.replace(
            /^@/,
            ""
        );

}


// =========================================================
// PROFILE MENU — OPEN / CLOSE
// =========================================================

const profileDropdown =
    document.getElementById(
        "profile-dropdown"
    );


if (
    profileMenuButton &&
    profileDropdown
) {

    profileMenuButton.addEventListener(
        "click",
        function (event) {

            event.stopPropagation();

            const isOpen =
                profileDropdown.classList.contains(
                    "open"
                );

            profileDropdown.classList.toggle(
                "open"
            );

            profileMenuButton.setAttribute(
                "aria-expanded",
                String(!isOpen)
            );

        }
    );


    // Close menu when tapping outside

    document.addEventListener(
        "click",
        function (event) {

            if (
                !profileDropdown.contains(event.target) &&
                !profileMenuButton.contains(event.target)
            ) {

                profileDropdown.classList.remove(
                    "open"
                );

                profileMenuButton.setAttribute(
                    "aria-expanded",
                    "false"
                );

            }

        }
    );

}


// =========================================================
// VYRO — PROFILE MENU ACTIONS
// =========================================================


// =========================================================
// PROFILE
// =========================================================

const profileMenuProfile =
    document.getElementById(
        "profile-menu-profile"
    );

const profileBackButton =
    document.getElementById(
        "profile-back-btn"
    );


if (profileMenuProfile) {

    profileMenuProfile.addEventListener(
        "click",
        function () {

            if (profileDropdown) {
                profileDropdown.classList.remove(
                    "open"
                );
            }

            showScreen(
                profileScreen
            );

            loadProfileInformation();

        }
    );

}


if (profileBackButton) {

    profileBackButton.addEventListener(
        "click",
        function () {

            showScreen(
                homeScreen
            );

        }
    );

}


// =========================================================
// PROFILE INFORMATION
// =========================================================

function loadProfileInformation() {

    const usernameDisplay =
        document.getElementById(
            "profile-username-display"
        );

    const emailDisplay =
        document.getElementById(
            "profile-email-display"
        );


    const username =
        localStorage.getItem(
            "vyro_username"
        );


    if (
        username &&
        usernameDisplay
    ) {

        usernameDisplay.textContent =
            "@" +
            username.replace(
                /^@/,
                ""
            );

    }


    const user =
        firebaseAuth.currentUser;


    if (
        user &&
        emailDisplay
    ) {

        emailDisplay.textContent =
            user.email || "—";

    }

}


// =========================================================
// SETTINGS
// =========================================================

const profileMenuSettings =
    document.getElementById(
        "profile-menu-settings"
    );

const settingsBackButton =
    document.getElementById(
        "settings-back-btn"
    );


if (profileMenuSettings) {

    profileMenuSettings.addEventListener(
        "click",
        function () {

            if (profileDropdown) {
                profileDropdown.classList.remove(
                    "open"
                );
            }

            showScreen(
                settingsScreen
            );

        }
    );

}


if (settingsBackButton) {

    settingsBackButton.addEventListener(
        "click",
        function () {

            showScreen(
                homeScreen
            );

        }
    );

}


// =========================================================
// SECURITY
// =========================================================

const profileMenuSecurity =
    document.getElementById(
        "profile-menu-security"
    );

const securityBackButton =
    document.getElementById(
        "security-back-btn"
    );


if (profileMenuSecurity) {

    profileMenuSecurity.addEventListener(
        "click",
        function () {

            if (profileDropdown) {
                profileDropdown.classList.remove(
                    "open"
                );
            }

            showScreen(
                securityScreen
            );

        }
    );

}


if (securityBackButton) {

    securityBackButton.addEventListener(
        "click",
        function () {

            showScreen(
                homeScreen
            );

        }
    );

}


// =========================================================
// PROFILE MENU — WALLETS
// =========================================================

const profileMenuWallets =
    document.getElementById(
        "profile-menu-wallets"
    );

if (profileMenuWallets) {
    
    profileMenuWallets.addEventListener(
        "click",
        function() {
            
            if (profileDropdown) {
                profileDropdown.classList.remove(
                    "open"
                );
            }
            
            if (
                typeof VYROWallet !==
                "undefined"
            ) {
                
                const activeWallet =
                    VYROWallet.getActiveWallet();
                
                if (
                    typeof updateWalletScreen ===
                    "function"
                ) {
                    updateWalletScreen(
                        activeWallet
                    );
                }
            }
            
            showScreen(
                walletsScreen
            );
        }
    );
}


// =========================================================
// WALLETS — BACK BUTTON
// =========================================================

const walletsBackButton =
    document.getElementById(
        "wallets-back-btn"
    );


if (walletsBackButton) {

    walletsBackButton.addEventListener(
        "click",
        function () {

            showScreen(
                homeScreen
            );

        }
    );

}


// =========================================================
// SECURITY — MANAGE 2FA
// =========================================================

const securityTwoFactorButton =
    document.getElementById(
        "security-2fa-btn"
    );


if (securityTwoFactorButton) {

    securityTwoFactorButton.addEventListener(
        "click",
        function () {

            showScreen(
                twoFactorScreen
            );

        }
    );

}


// =========================================================
// SECURITY — VERIFICATION WORD
// =========================================================

const changeVerificationWordButton =
    document.getElementById(
        "change-verification-word-btn"
    );

if (changeVerificationWordButton) {

    changeVerificationWordButton.addEventListener(
        "click",
        function () {

            showScreen(
                changeVerificationWordScreen
            );

        }
    );

}


const changeVerificationWordBackButton =
    document.getElementById(
        "change-verification-word-back-btn"
    );

if (changeVerificationWordBackButton) {

    changeVerificationWordBackButton.addEventListener(
        "click",
        function () {

            showScreen(
                securityScreen
            );

        }
    );

}

// =========================================================
// WALLETS — CONNECT WALLET
// =========================================================

const connectWalletButton =
    document.getElementById(
        "connect-wallet-btn"
    );

if (connectWalletButton) {

    connectWalletButton.addEventListener(
        "click",
        function () {

            showScreen(
                connectWalletScreen
            );

        }
    );

}


const connectWalletBackButton =
    document.getElementById(
        "connect-wallet-back-btn"
    );

if (connectWalletBackButton) {

    connectWalletBackButton.addEventListener(
        "click",
        function () {

            showScreen(
                walletsScreen
            );

        }
    );

}



// =========================================================
// VYRO WALLET SYSTEM — INITIALIZE
// =========================================================

if (typeof VYROWallet !== "undefined") {

    VYROWallet.init();

}


// =========================================================
// WALLET CONNECTED — BACK
// =========================================================

const walletConnectedBackButton =
    document.getElementById(
        "wallet-connected-back-btn"
    );

if (walletConnectedBackButton) {

    walletConnectedBackButton.addEventListener(
        "click",
        function () {

            showScreen(
                walletsScreen
            );

        }
    );

}





// =========================================================
// SETTINGS — CHANGE EMAIL
// =========================================================

const changeEmailButton =
    document.getElementById(
        "change-email-btn"
    );

if (changeEmailButton) {

    changeEmailButton.addEventListener(
        "click",
        function () {

            showScreen(
                changeEmailScreen
            );

        }
    );

}


const changeEmailBackButton =
    document.getElementById(
        "change-email-back-btn"
    );

if (changeEmailBackButton) {

    changeEmailBackButton.addEventListener(
        "click",
        function () {

            showScreen(
                settingsScreen
            );

        }
    );

}




// =========================================================
// SETTINGS — CHANGE PASSWORD
// =========================================================

const changePasswordButton =
    document.getElementById(
        "change-password-btn"
    );

if (changePasswordButton) {

    changePasswordButton.addEventListener(
        "click",
        function () {

            showScreen(
                changePasswordScreen
            );

        }
    );

}


const changePasswordBackButton =
    document.getElementById(
        "change-password-back-btn"
    );

if (changePasswordBackButton) {

    changePasswordBackButton.addEventListener(
        "click",
        function () {

            showScreen(
                settingsScreen
            );

        }
    );

}


// =========================================================
// SETTINGS — DELETE ACCOUNT
// =========================================================

const deleteAccountButton =
    document.getElementById(
        "delete-account-btn"
    );

if (deleteAccountButton) {

    deleteAccountButton.addEventListener(
        "click",
        function () {

            showScreen(
                deleteAccountScreen
            );

        }
    );

}


const deleteAccountBackButton =
    document.getElementById(
        "delete-account-back-btn"
    );

if (deleteAccountBackButton) {

    deleteAccountBackButton.addEventListener(
        "click",
        function () {

            showScreen(
                settingsScreen
            );

        }
    );

}


// =========================================================
// LOG OUT
// =========================================================

const logoutButton =
    document.getElementById(
        "logout-btn"
    );


if (logoutButton) {

    logoutButton.addEventListener(
        "click",
        async function () {

            try {

                await firebaseAuth.signOut();

                localStorage.removeItem(
                    "vyro_username"
                );

                localStorage.removeItem(
                    "vyro_pending_username"
                );

                localStorage.removeItem(
                    "vyro_pending_user_id"
                );

                if (profileDropdown) {

                    profileDropdown.classList.remove(
                        "open"
                    );

                }

                showScreen(
                    welcomeScreen
                );

            } catch (error) {

                console.error(
                    "VYRO LOGOUT ERROR:",
                    error
                );

                alert(
                    "Unable to log out. Please try again."
                );

            }

        }
    );

}

// =========================================================
// CHANGE EMAIL — SAVE
// =========================================================

const saveEmailButton =
    document.getElementById(
        "save-email-btn"
    );


if (saveEmailButton) {

    saveEmailButton.addEventListener(
        "click",
        async function () {

            const newEmail =
                document.getElementById(
                    "new-email"
                ).value.trim();

            const currentPassword =
                document.getElementById(
                    "current-password-email"
                ).value;


            // =====================================================
            // VALIDATE NEW EMAIL
            // =====================================================

            if (!newEmail) {

                alert(
                    "Please enter your new email address."
                );

                return;

            }


            // =====================================================
            // VALIDATE CURRENT PASSWORD
            // =====================================================

            if (!currentPassword) {

                alert(
                    "Please enter your current password."
                );

                return;

            }


            // =====================================================
            // GET CURRENT FIREBASE USER
            // =====================================================

            const user =
                firebaseAuth.currentUser;


            if (!user) {

                alert(
                    "Your account could not be found. Please log in again."
                );

                return;

            }


            // =====================================================
            // MAKE SURE EMAIL IS ACTUALLY DIFFERENT
            // =====================================================

            if (
                user.email &&
                user.email.toLowerCase() ===
                newEmail.toLowerCase()
            ) {

                alert(
                    "The new email address must be different from your current email."
                );

                return;

            }


            try {

                // =================================================
                // RE-AUTHENTICATE USER
                // =================================================

                const credential =
                    firebase.auth.EmailAuthProvider.credential(
                        user.email,
                        currentPassword
                    );


                await user.reauthenticateWithCredential(
                    credential
                );


                // =================================================
// SEND VERIFICATION EMAIL FOR NEW ADDRESS
// =================================================

await user.verifyBeforeUpdateEmail(
    newEmail
);

                // =================================================
                // UPDATE VYRO USER PROFILE
                // =================================================

                await firebaseDB
                    .collection("users")
                    .doc(user.uid)
                    .set(
                        {
                            email: newEmail
                        },
                        {
                            merge: true
                        }
                    );


                // =================================================
                // CLEAR FORM
                // =================================================

                document.getElementById(
                    "new-email"
                ).value = "";

                document.getElementById(
                    "current-password-email"
                ).value = "";


                // =================================================
                // SUCCESS MESSAGE
                // =================================================

                alert(
                    "Your email has been updated. " +
                    "A verification email has been sent to your new address."
                );


                // =================================================
                // RETURN TO PROFILE
                // =================================================

                showScreen(
                    profileScreen
                );


            } catch (error) {

                console.error(
                    "VYRO CHANGE EMAIL ERROR:",
                    error
                );


                // =================================================
                // SPECIFIC FIREBASE ERRORS
                // =================================================

                if (
                    error.code ===
                    "auth/wrong-password" ||
                    error.code ===
                    "auth/invalid-credential"
                ) {

                    alert(
                        "The current password is incorrect."
                    );

                    return;

                }


                if (
                    error.code ===
                    "auth/email-already-in-use"
                ) {

                    alert(
                        "That email address is already being used by another account."
                    );

                    return;

                }


                if (
                    error.code ===
                    "auth/invalid-email"
                ) {

                    alert(
                        "Please enter a valid email address."
                    );

                    return;

                }


                if (
                    error.code ===
                    "auth/requires-recent-login"
                ) {

                    alert(
                        "For security, please log out and log back in before changing your email."
                    );

                    return;

                }


alert(
    "EMAIL CHANGE ERROR: " +
    error.code +
    " — " +
    error.message
);

            }

        }
    );

}


// =========================================================
// CHANGE PASSWORD — SAVE
// =========================================================

const savePasswordButton =
    document.getElementById(
        "save-password-btn"
    );


if (savePasswordButton) {

    savePasswordButton.addEventListener(
        "click",
        async function () {

            const currentPassword =
                document.getElementById(
                    "current-password"
                ).value;

            const newPassword =
                document.getElementById(
                    "new-password"
                ).value;

            const confirmPassword =
                document.getElementById(
                    "confirm-new-password"
                ).value;


            // =====================================================
            // VALIDATE CURRENT PASSWORD
            // =====================================================

            if (!currentPassword) {

                alert(
                    "Please enter your current password."
                );

                return;

            }


            // =====================================================
            // VALIDATE NEW PASSWORD
            // =====================================================

            if (!newPassword) {

                alert(
                    "Please enter a new password."
                );

                return;

            }


            // =====================================================
            // CONFIRM NEW PASSWORD
            // =====================================================

            if (newPassword !== confirmPassword) {

                alert(
                    "The new passwords do not match."
                );

                return;

            }


            // =====================================================
            // GET CURRENT USER
            // =====================================================

            const user =
                firebaseAuth.currentUser;


            if (!user) {

                alert(
                    "Your account could not be found. Please log in again."
                );

                return;

            }


            try {

                // =================================================
                // RE-AUTHENTICATE USER
                // =================================================

                const credential =
                    firebase.auth.EmailAuthProvider.credential(
                        user.email,
                        currentPassword
                    );


                await user.reauthenticateWithCredential(
                    credential
                );


                // =================================================
                // UPDATE PASSWORD
                // =================================================

                await user.updatePassword(
                    newPassword
                );


                // =================================================
                // CLEAR FORM
                // =================================================

                document.getElementById(
                    "current-password"
                ).value = "";

                document.getElementById(
                    "new-password"
                ).value = "";

                document.getElementById(
                    "confirm-new-password"
                ).value = "";


                // =================================================
                // SUCCESS
                // =================================================

                alert(
                    "Your password has been updated."
                );


                showScreen(
                    settingsScreen
                );


            } catch (error) {

                console.error(
                    "VYRO CHANGE PASSWORD ERROR:",
                    error
                );


                if (
                    error.code ===
                    "auth/wrong-password" ||
                    error.code ===
                    "auth/invalid-credential"
                ) {

                    alert(
                        "The current password is incorrect."
                    );

                    return;

                }


                if (
                    error.code ===
                    "auth/weak-password"
                ) {

                    alert(
                        "Your new password is too weak. Please choose a stronger password."
                    );

                    return;

                }


                if (
                    error.code ===
                    "auth/requires-recent-login"
                ) {

                    alert(
                        "For security, please log out and log back in before changing your password."
                    );

                    return;

                }


                alert(
                    "Unable to change your password right now. Please try again."
                );

            }

        }
    );

}


// =========================================================
// CHANGE VERIFICATION WORD — SAVE
// =========================================================

const saveVerificationWordButton =
    document.getElementById(
        "save-verification-word-btn"
    );

if (saveVerificationWordButton) {

    saveVerificationWordButton.addEventListener(
        "click",
        async function () {

            const newWord =
                document.getElementById(
                    "new-verification-word"
                ).value
                    .trim()
                    .toUpperCase();


            if (!newWord) {

                alert(
                    "Please enter a verification word."
                );

                return;

            }


            const user =
                firebaseAuth.currentUser;


            if (!user) {

                alert(
                    "Your account could not be found. Please log in again."
                );

                return;

            }


            try {

                await firebaseDB
                    .collection("users")
                    .doc(user.uid)
                    .set(
                        {
                            verificationWord:
                                newWord
                        },
                        {
                            merge: true
                        }
                    );


                alert(
                    "Your verification word has been updated."
                );


                document.getElementById(
                    "new-verification-word"
                ).value = "";


                showScreen(
                    securityScreen
                );


            } catch (error) {

                console.error(
                    "VYRO VERIFICATION WORD ERROR:",
                    error
                );


                alert(
                    "Unable to update your verification word."
                );

            }

        }
    );

}

// =========================================================
// TRANSACTION HISTORY
// =========================================================

const transactionHistoryBackButton =
    document.getElementById(
        "transaction-history-back-btn"
    );


if (transactionHistoryBackButton) {

    transactionHistoryBackButton.addEventListener(
        "click",
        function () {

            showScreen(
                homeScreen
            );

        }
    );

}


// =========================================================
// HOME ACTIVITY — VIEW ALL
// =========================================================

const activityHeader =
    document.querySelector(
        ".activity-header"
    );


if (activityHeader) {

    activityHeader.addEventListener(
        "click",
        function () {

            showScreen(
                transactionHistoryScreen
            );

        }
    );

}

// =========================================================
// TRANSACTION DETAILS
// =========================================================

const transactionDetailsBackButton =
    document.getElementById(
        "transaction-details-back-btn"
    );


if (transactionDetailsBackButton) {

    transactionDetailsBackButton.addEventListener(
        "click",
        function () {

            showScreen(
                transactionHistoryScreen
            );

        }
    );

}

// =========================================================
// PAYMENT SUCCESS
// =========================================================

const paymentSuccessHomeButton =
    document.getElementById(
        "payment-success-home-btn"
    );


if (paymentSuccessHomeButton) {

    paymentSuccessHomeButton.addEventListener(
        "click",
        function () {

            showScreen(
                homeScreen
            );

        }
    );

}


// =========================================================
// PAYMENT FAILED — SEND
// =========================================================

const paymentFailedBackButton =
    document.getElementById(
        "payment-failed-back-btn"
    );


if (paymentFailedBackButton) {

    paymentFailedBackButton.addEventListener(
        "click",
        function () {

            showScreen(
                sendScreen
            );

        }
    );

}


// =========================================================
// PAYMENT FAILED — HOME
// =========================================================

const paymentFailedHomeButton =
    document.getElementById(
        "payment-failed-home-btn"
    );


if (paymentFailedHomeButton) {

    paymentFailedHomeButton.addEventListener(
        "click",
        function () {

            showScreen(
                homeScreen
            );

        }
    );

}

// =========================================================
// HOME — VIEW ALL ACTIVITY
// =========================================================

const viewAllActivityButton =
    document.getElementById(
        "view-all-activity-btn"
    );

if (viewAllActivityButton) {

    viewAllActivityButton.addEventListener(
        "click",
        function () {

            console.log(
                "VYRO: Opening transaction history."
            );

            showScreen(
                transactionHistoryScreen
            );

        }
    );

}

// =========================================================
// VYRO — TRANSACTION HISTORY
// =========================================================

const transactionList =
    document.getElementById(
        "transaction-list"
    );

const transactionEmpty =
    document.getElementById(
        "transaction-empty"
    );


// =========================================================
// LOAD TRANSACTION HISTORY
// =========================================================

function loadTransactionHistory() {

    if (!transactionList) {
        return;
    }

    const transactions =
        JSON.parse(
            localStorage.getItem(
                "vyro_transactions"
            ) || "[]"
        );


    // Remove old transaction rows
    const existingRows =
        transactionList.querySelectorAll(
            ".transaction-row"
        );

    existingRows.forEach(
        function (row) {
            row.remove();
        }
    );


    // No transactions yet
    if (transactions.length === 0) {

        if (transactionEmpty) {
            transactionEmpty.style.display =
                "block";
        }

        return;
    }


    // Hide empty message
    if (transactionEmpty) {
        transactionEmpty.style.display =
            "none";
    }


    // Display newest transactions first
    transactions
        .slice()
        .reverse()
        .forEach(
            function (transaction) {

                const row =
                    document.createElement(
                        "button"
                    );

                row.type = "button";

                row.className =
                    "transaction-row";


                const recipient =
                    transaction.recipient ||
                    "Unknown";


                const amount =
                    transaction.amount ||
                    "0";


                const asset =
                    transaction.asset ||
                    "USDC";


                const status =
                    transaction.status ||
                    "Pending";


                row.innerHTML = `
                    <div class="transaction-row-main">

                        <div class="transaction-row-title">
                            ${recipient}
                        </div>

                        <div class="transaction-row-subtitle">
                            ${status}
                        </div>

                    </div>

                    <div class="transaction-row-amount">
                        ${amount} ${asset}
                    </div>
                `;


                row.addEventListener(
                    "click",
                    function () {

                        openTransactionDetails(
                            transaction
                        );

                    }
                );


                transactionList.appendChild(
                    row
                );

            }
        );

}

// =========================================================
// VYRO — TRANSACTION DETAILS
// =========================================================


function openTransactionDetails(
    transaction
) {

    if (!transactionDetailsScreen) {
        return;
    }


    const statusElement =
        document.getElementById(
            "transaction-detail-status"
        );

    const typeElement =
        document.getElementById(
            "transaction-detail-type"
        );

    const recipientElement =
        document.getElementById(
            "transaction-detail-recipient"
        );

    const amountElement =
        document.getElementById(
            "transaction-detail-amount"
        );

    const assetElement =
        document.getElementById(
            "transaction-detail-asset"
        );

    const networkElement =
        document.getElementById(
            "transaction-detail-network"
        );

    const idElement =
        document.getElementById(
            "transaction-detail-id"
        );


    if (statusElement) {
        statusElement.textContent =
            transaction.status ||
            "Pending";
    }

    if (typeElement) {
        typeElement.textContent =
            transaction.type ||
            "Send";
    }

    if (recipientElement) {
        recipientElement.textContent =
            transaction.recipient ||
            "Unknown";
    }

    if (amountElement) {
        amountElement.textContent =
            transaction.amount ||
            "0";
    }

    if (assetElement) {
        assetElement.textContent =
            transaction.asset ||
            "USDC";
    }

    if (networkElement) {
        networkElement.textContent =
            transaction.network ||
            "Solana";
    }

    if (idElement) {
        idElement.textContent =
            transaction.id ||
            "Pending";
    }


    showScreen(
        transactionDetailsScreen
    );

}

// =========================================================
// REFRESH ACTIVITY WHEN VIEWING HISTORY
// =========================================================

if (transactionHistoryBackButton) {

    transactionHistoryBackButton.addEventListener(
        "click",
        function () {

            showScreen(
                homeScreen
            );

        }
    );

}


if (transactionDetailsBackButton) {

    transactionDetailsBackButton.addEventListener(
        "click",
        function () {

            showScreen(
                transactionHistoryScreen
            );

        }
    );

}

// Refresh whenever Activity is opened
if (viewAllActivityButton) {

    viewAllActivityButton.addEventListener(
        "click",
        function () {

            loadTransactionHistory();

        }
    );

}
