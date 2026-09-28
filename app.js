// =========================================================
// VYRO — App Navigation
// =========================================================

const welcomeScreen = document.getElementById("welcome-screen");
const createAccountScreen = document.getElementById("create-account-screen");

const getStartedButton = document.getElementById("get-started-btn");
const createAccountBackButton = document.getElementById("create-account-back");
const loginScreen = document.getElementById("login-screen");

const loginButton = document.getElementById("login-btn");
const loginBackButton = document.getElementById("login-back");

// Show a specific screen
function showScreen(screen) {

    document.querySelectorAll(".screen").forEach(function (item) {
        item.classList.remove("active");
    });

    screen.classList.add("active");
}


// CREATE ACCOUNT
getStartedButton.addEventListener("click", function () {

    showScreen(createAccountScreen);

});


// BACK
createAccountBackButton.addEventListener("click", function () {

    showScreen(welcomeScreen);

});

// =========================================================
// LOGIN NAVIGATION
// =========================================================

loginButton.addEventListener("click", function () {

    showScreen(loginScreen);

});


loginBackButton.addEventListener("click", function () {

    showScreen(welcomeScreen);

});

// =========================================================
// CREATE ACCOUNT — FORM VALIDATION
// =========================================================

// =========================================================
// EMAIL VERIFICATION → 2FA
// =========================================================

const emailVerificationScreen = document.getElementById(
    "email-verification-screen"
);

const twoFactorScreen = document.getElementById(
    "two-factor-screen"
);

const verifyEmailButton = document.getElementById(
    "verify-email-btn"
);

const emailVerificationBackButton = document.getElementById(
    "email-verification-back"
);

const twoFactorBackButton = document.getElementById(
    "two-factor-back"
);


// VERIFY EMAIL



// EMAIL VERIFICATION BACK
emailVerificationBackButton.addEventListener(
    "click",
    function () {

        showScreen(createAccountScreen);

    }
);
verifyEmailButton.addEventListener("click", async function () {

    const {
        data: { user },
        error
    } = await supabaseClient.auth.getUser();

    if (error || !user) {
        alert("Your account could not be verified. Please log in again.");
        return;
    }

    if (!user.email_confirmed_at) {
        alert("Please open the verification email and confirm your email address first.");
        return;
    }

    showScreen(twoFactorScreen);
});

// 2FA BACK
twoFactorBackButton.addEventListener(
    "click",
    function () {

        showScreen(emailVerificationScreen);

    }
);

// =========================================================
// 2FA → ACCOUNT CREATED
// =========================================================

const enableTwoFactorButton = document.getElementById(
    "enable-two-factor-btn"
);

enableTwoFactorButton.addEventListener("click", function () {

    const twoFactorCode = document.getElementById(
        "two-factor-code"
    ).value.trim();

    if (!twoFactorCode) {

        alert("Please enter your authentication code.");

        return;
    }

    showScreen(document.getElementById("home-screen"));

});

// =========================================================
// VYRO LOGO → HOME
// =========================================================

const homeLogoButton = document.getElementById("home-logo-btn");

homeLogoButton.addEventListener("click", function () {

    showScreen(document.getElementById("home-screen"));

});

// =========================================================
// SEND NAVIGATION
// =========================================================

const sendScreen = document.getElementById("send-screen");

const sendButton = document.getElementById("send-btn");

const sendBackButton = document.getElementById(
    "send-back-btn"
);

const sendHomeLogoButton = document.getElementById(
    "send-home-logo-btn"
);


// HOME → SEND
sendButton.addEventListener("click", function () {

    showScreen(sendScreen);

});


// SEND → HOME
sendBackButton.addEventListener("click", function () {

    showScreen(document.getElementById("home-screen"));

});


// SEND LOGO → HOME
sendHomeLogoButton.addEventListener("click", function () {

    showScreen(document.getElementById("home-screen"));

});

// =========================================================
// SEND → CONFIRM PAYMENT
// =========================================================

const confirmPaymentScreen = document.getElementById(
    "confirm-payment-screen"
);

const continueSendButton = document.getElementById(
    "continue-send-btn"
);

const confirmBackButton = document.getElementById(
    "confirm-back-btn"
);

const confirmHomeLogoButton = document.getElementById(
    "confirm-home-logo-btn"
);


// SEND → CONFIRM
continueSendButton.addEventListener("click", function () {

    const recipient = document.getElementById(
        "send-recipient"
    ).value.trim();

    const amount = document.getElementById(
        "send-amount"
    ).value.trim();

    const network = document.getElementById(
        "send-network"
    ).value;

    if (!recipient) {

        alert("Please enter a recipient.");

        return;
    }

    if (!amount || Number(amount) <= 0) {

        alert("Please enter a valid amount.");

        return;
    }

    document.getElementById(
        "confirm-recipient"
    ).textContent = "@" + recipient.replace(/^@/, "");

    document.getElementById(
        "confirm-amount"
    ).textContent = amount + " USDC";

    document.getElementById(
        "confirm-network"
    ).textContent =
        network === "solana" ? "Solana" : network;

    showScreen(confirmPaymentScreen);

});


// CONFIRM → SEND
confirmBackButton.addEventListener("click", function () {

    showScreen(sendScreen);

});


// CONFIRM LOGO → HOME
confirmHomeLogoButton.addEventListener("click", function () {

    showScreen(document.getElementById("home-screen"));

});

// =========================================================
// VYRO — RECIPIENT LOOKUP
// =========================================================

const sendRecipientInput = document.getElementById(
    "send-recipient"
);

const recipientResult = document.getElementById(
    "recipient-result"
);

const recipientDisplay = document.getElementById(
    "recipient-display"
);

sendRecipientInput.addEventListener("input", function () {

    const username = this.value
        .trim()
        .replace(/^@/, "");

    if (!username) {

        recipientResult.classList.remove("visible");

        return;
    }

    recipientDisplay.textContent = "@" + username;

    recipientResult.classList.add("visible");

});

// =========================================================
// RECEIVE NAVIGATION
// =========================================================

const receiveScreen = document.getElementById("receive-screen");
const receiveButton = document.getElementById("receive-btn");
const receiveBackButton = document.getElementById("receive-back-btn");
const receiveHomeLogoButton = document.getElementById("receive-home-logo-btn");

receiveButton.addEventListener("click", function () {
    showScreen(receiveScreen);
});

receiveBackButton.addEventListener("click", function () {
    showScreen(document.getElementById("home-screen"));
});

receiveHomeLogoButton.addEventListener("click", function () {
    showScreen(document.getElementById("home-screen"));
});

// =========================================================
// RECEIVE - COPY USERNAME
// =========================================================

const copyReceiveButton = document.getElementById("copy-receive-btn");

copyReceiveButton.addEventListener("click", function () {
    const username = document.querySelector(".receive-username").textContent.trim();

    navigator.clipboard.writeText(username).then(function () {
        const originalText = copyReceiveButton.textContent;

        copyReceiveButton.textContent = "COPIED ✓";

        setTimeout(function () {
            copyReceiveButton.textContent = originalText;
        }, 1500);

    }).catch(function () {
        alert("Unable to copy username.");
    });
});

// =========================================================
// RECEIVE - DISPLAY USERNAME
// =========================================================

const savedUsername = localStorage.getItem("vyro_username");

if (savedUsername) {
    document.querySelector(".receive-username").textContent =
        "@" + savedUsername.replace(/^@/, "");
}