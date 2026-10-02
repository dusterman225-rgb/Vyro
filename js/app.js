
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

function showScreen(screen, options) {
    if (!screen) {
        console.error("VYRO: Screen not found.");
        return;
    }

    const dropdown = document.getElementById("profile-dropdown");
    const profileButton = document.getElementById("profile-menu-btn");

    if (dropdown) {
        dropdown.classList.remove("open");
        dropdown.setAttribute("aria-hidden", "true");
    }
    if (profileButton) {
        profileButton.setAttribute("aria-expanded", "false");
    }

    document.querySelectorAll(".screen").forEach(function (item) {
        item.classList.remove("active");
    });

    screen.classList.add("active");

    const updateHistory = !options || options.updateHistory !== false;

    if (updateHistory && screen.id) {
        const currentState = history.state && history.state.vyroScreen;
        if (currentState !== screen.id) {
            history.pushState(
                { vyroScreen: screen.id },
                "",
                window.location.href
            );
        }
    }
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

window.addEventListener(
    "popstate",
    function(event) {
        
        const screenId =
            event.state &&
            event.state.vyroScreen;
        
        if (screenId) {
            
            const previousScreen =
                document.getElementById(
                    screenId
                );
            
            if (previousScreen) {
                
                showScreen(
                    previousScreen,
                    {
                        updateHistory: false
                    }
                );
                
                return;
            }
        }
        
        /*
         * If there is no VYRO history state,
         * return to the Welcome screen.
         */
        
        showScreen(
            welcomeScreen,
            {
                updateHistory: false
            }
        );
    }
);

// =========================================================
// VYRO — INITIAL BROWSER HISTORY STATE
// =========================================================

history.replaceState(
    {
        vyroScreen:
            document.querySelector(
                ".screen.active"
            )?.id || "welcome-screen"
    },
    "",
    window.location.href
);


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
                
                    // =================================================
        // STAGE 3 — WALLET VALIDATION
        // =================================================
        
        if (
            typeof VYROWallet === "undefined" ||
            !VYROWallet.isConnected()
        ) {
            alert(
                "Please connect a wallet before sending."
            );
            return;
        }
        
        const selectedWallet =
            document.getElementById(
                "send-wallet"
            );
        
        if (
            !selectedWallet ||
            !selectedWallet.value
        ) {
            alert(
                "Please select a wallet to send from."
            );
            return;
        }
        
        const activeWallet =
            VYROWallet.getActiveWallet();
        
        if (!activeWallet) {
            alert(
                "Your selected wallet is not available."
            );
            return;
        }
        
        if (
            activeWallet.address !==
            selectedWallet.value
        ) {
            const switched =
                VYROWallet.setActiveWallet(
                    selectedWallet.
