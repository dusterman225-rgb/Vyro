// =========================================================
// VYRO WALLET SYSTEM
// =========================================================

let initialized = false;

let connected = false;

let publicAddress = null;

let walletType = null;

let signClient = null;

let session = null;


// =========================================================
// STORAGE KEYS
// =========================================================

const ADDRESS_KEY =
    "vyro_connected_wallet";

const WALLET_TYPE_KEY =
    "vyro_connected_wallet_type";


// =========================================================
// WALLET ADDRESS FROM WALLETCONNECT SESSION
// =========================================================

function getAddressFromSession(
    currentSession
) {

    if (
        !currentSession ||
        !currentSession.namespaces
    ) {

        return null;

    }

    const solanaNamespace =
        currentSession.namespaces.solana;

    if (
        !solanaNamespace ||
        !solanaNamespace.accounts ||
        !solanaNamespace.accounts.length
    ) {

        return null;

    }

    const account =
        solanaNamespace.accounts[0];

    if (!account) {

        return null;

    }

    const parts =
        account.split(":");

    if (parts.length >= 3) {

        return parts[2];

    }

    return null;

}


// =========================================================
// SAVE CONNECTED WALLET
// =========================================================

function setConnectedWallet(
    address,
    type,
    currentSession
) {

    connected =
        true;

    publicAddress =
        address;

    walletType =
        type;

    session =
        currentSession || null;


    // =====================================================
    // SAVE WALLET STATE
    // =====================================================

    localStorage.setItem(
        ADDRESS_KEY,
        address
    );

    localStorage.setItem(
        WALLET_TYPE_KEY,
        type
    );


    // =====================================================
    // UPDATE WALLETS SCREEN
    // =====================================================

    const noWalletConnected =
        document.getElementById(
            "no-wallet-connected"
        );

    const savedWalletCard =
        document.getElementById(
            "saved-wallet-card"
        );

    const savedWalletProvider =
        document.getElementById(
            "saved-wallet-provider"
        );

    const savedWalletNetwork =
        document.getElementById(
            "saved-wallet-network"
        );

    const savedWalletAddress =
        document.getElementById(
            "saved-wallet-address"
        );


    // Hide "No wallet connected."

    if (noWalletConnected) {

        noWalletConnected.style.display =
            "none";

    }


    // Show saved wallet card.

    if (savedWalletCard) {

        savedWalletCard.style.display =
            "block";

    }


    // Show wallet provider.

    if (savedWalletProvider) {

        savedWalletProvider.textContent =
            type === "trust-wallet"
                ? "Trust Wallet"
                : "External Wallet";

    }


    // Show network.

    if (savedWalletNetwork) {

        savedWalletNetwork.textContent =
            "SOLANA";

    }


    // Show public wallet address.

    if (savedWalletAddress) {

        savedWalletAddress.textContent =
            address;

    }

}


// =========================================================
// CLEAR LOCAL WALLET STATE
// =========================================================

function clearWalletState() {

    connected =
        false;

    publicAddress =
        null;

    walletType =
        null;

    session =
        null;


    localStorage.removeItem(
        ADDRESS_KEY
    );

    localStorage.removeItem(
        WALLET_TYPE_KEY
    );


    // =====================================================
    // UPDATE WALLETS SCREEN
    // =====================================================

    const noWalletConnected =
        document.getElementById(
            "no-wallet-connected"
        );

    const savedWalletCard =
        document.getElementById(
            "saved-wallet-card"
        );


    if (noWalletConnected) {

        noWalletConnected.style.display =
            "block";

    }


    if (savedWalletCard) {

        savedWalletCard.style.display =
            "none";

    }

}


// =========================================================
// SHOW CONNECTED WALLET SCREEN
// =========================================================

function showConnectedWallet(
    address
) {

    const addressElement =
        document.getElementById(
            "connected-wallet-address"
        );

    const providerElement =
        document.getElementById(
            "connected-wallet-provider"
        );


    if (providerElement) {

        if (
            walletType ===
            "trust-wallet"
        ) {

            providerElement.textContent =
                "Trust Wallet";

        } else {

            providerElement.textContent =
                "External Wallet";

        }

    }


    if (addressElement) {

        addressElement.textContent =
            address;

    }


    const walletScreen =
        document.getElementById(
            "wallet-connected-screen"
        );


    if (
        walletScreen &&
        typeof showScreen ===
            "function"
    ) {

        showScreen(
            walletScreen
        );

    }

}


// =========================================================
// CONNECT WALLET
// =========================================================

async function connect() {

    console.log(
        "VYRO: Starting wallet connection..."
    );


    // =====================================================
    // TRUST WALLET INJECTED PROVIDER
    // =====================================================

    if (
        window.trustwallet &&
        window.trustwallet.solana
    ) {

        try {

            console.log(
                "VYRO: Trust Wallet provider detected."
            );


            const trustWallet =
                window.trustwallet.solana;


            const connectFeature =
                trustWallet.features &&
                trustWallet.features[
                    "standard:connect"
                ];


            if (
                connectFeature &&
                typeof connectFeature.connect ===
                    "function"
            ) {

                const result =
                    await connectFeature.connect();


                const accounts =
                    result &&
                    result.accounts;


                if (
                    accounts &&
                    accounts.length
                ) {

                    const address =
                        accounts[0].address;


                    if (address) {

                        setConnectedWallet(
                            address,
                            "trust-wallet",
                            null
                        );


                        showConnectedWallet(
                            address
                        );


                        console.log(
                            "VYRO: Trust Wallet connected."
                        );


                        return address;

                    }

                }

            }

        }

        catch (error) {

            console.error(
                "VYRO: Trust Wallet connection error:",
                error
            );

        }

    }


    // =====================================================
    // WALLETCONNECT FALLBACK
    // =====================================================

    try {

        console.log(
            "VYRO: Starting WalletConnect..."
        );


        if (
            typeof SignClient ===
                "undefined"
        ) {

            throw new Error(
                "WalletConnect SignClient is not available."
            );

        }


        signClient =
            await SignClient.init({

                projectId:
                    WALLETCONNECT_PROJECT_ID,

                metadata: {

                    name:
                        "VYRO",

                    description:
                        "VYRO crypto payments",

                    url:
                        window.location.origin,

                    icons: [
                        window.location.origin +
                        "/assets/icon.png"
                    ]

                }

            });


        const connection =
            await signClient.connect({

                requiredNamespaces: {

                    solana: {

                        chains: [

                            "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"

                        ],

                        methods: [

                            "solana_signTransaction",

                            "solana_signMessage"

                        ],

                        events: []

                    }

                }

            });


        const uri =
            connection &&
            connection.uri;


        if (!uri) {

            throw new Error(
                "WalletConnect did not return a URI."
            );

        }


        console.log(
            "VYRO: WalletConnect URI created."
        );


        // =================================================
        // OPEN TRUST WALLET
        // =================================================

        const trustWalletUrl =
            "https://link.trustwallet.com/wc?uri=" +
            encodeURIComponent(uri);


        window.open(
            trustWalletUrl,
            "_blank",
            "noreferrer noopener"
        );


        // =================================================
        // WAIT FOR WALLET APPROVAL
        // =================================================

        const approvedSession =
            await connection.approval();


        if (!approvedSession) {

            throw new Error(
                "Wallet connection was not approved."
            );

        }


        session =
            approvedSession;


        const address =
            getAddressFromSession(
                approvedSession
            );


        if (!address) {

            throw new Error(
                "Could not find Solana wallet address."
            );

        }


        setConnectedWallet(
            address,
            "walletconnect",
            approvedSession
        );


        showConnectedWallet(
            address
        );


        console.log(
            "VYRO: WalletConnect wallet connected."
        );


        return address;

    }

    catch (error) {

        console.error(
            "VYRO: WalletConnect connection error:",
            error
        );


        throw error;

    }

}


// =========================================================
// DISCONNECT WALLET
// =========================================================

async function disconnect() {

    try {

        if (
            signClient &&
            session
        ) {

            try {

                await signClient.disconnect({

                    topic:
                        session.topic,

                    reason: {

                        code:
                            6000,

                        message:
                            "User disconnected wallet."

                    }

                });

            }

            catch (error) {

                console.log(
                    "VYRO: WalletConnect disconnect notice:",
                    error
                );

            }

        }

    }

    catch (error) {

        console.error(
            "VYRO: Disconnect error:",
            error
        );

    }


    clearWalletState();


    return true;

}


// =========================================================
// RESTORE WALLET CONNECTION
// =========================================================

async function restoreConnection() {

    // =====================================================
    // TRY TRUST WALLET SILENT RESTORE
    // =====================================================

    if (
        window.trustwallet &&
        window.trustwallet.solana
    ) {

        try {

            const trustWallet =
                window.trustwallet.solana;


            const connectFeature =
                trustWallet.features &&
                trustWallet.features[
                    "standard:connect"
                ];


            if (
                connectFeature &&
                typeof connectFeature.connect ===
                    "function"
            ) {

                const result =
                    await connectFeature.connect({
                        silent: true
                    });


                const accounts =
                    result &&
                    result.accounts;


                if (
                    accounts &&
                    accounts.length
                ) {

                    const address =
                        accounts[0].address;


                    if (address) {

                        setConnectedWallet(
                            address,
                            "trust-wallet",
                            null
                        );


                        console.log(
                            "VYRO: Saved Trust Wallet restored."
                        );


                        return address;

                    }

                }

            }

        }

        catch (error) {

            console.log(
                "VYRO: No silent Trust Wallet connection available."
            );

        }

    }


    // =====================================================
    // RESTORE FROM LOCAL STORAGE
    // =====================================================

    const savedAddress =
        localStorage.getItem(
            ADDRESS_KEY
        );


    const savedWalletType =
        localStorage.getItem(
            WALLET_TYPE_KEY
        );


    if (
        savedAddress &&
        savedWalletType
    ) {

        publicAddress =
            savedAddress;

        walletType =
            savedWalletType;

        connected =
            true;


        // =================================================
        // UPDATE WALLETS SCREEN
        // =================================================

        const noWalletConnected =
            document.getElementById(
                "no-wallet-connected"
            );


        const savedWalletCard =
            document.getElementById(
                "saved-wallet-card"
            );


        const savedWalletProvider =
            document.getElementById(
                "saved-wallet-provider"
            );


        const savedWalletNetwork =
            document.getElementById(
                "saved-wallet-network"
            );


        const savedWalletAddress =
            document.getElementById(
                "saved-wallet-address"
            );


        if (noWalletConnected) {

            noWalletConnected.style.display =
                "none";

        }


        if (savedWalletCard) {

            savedWalletCard.style.display =
                "block";

        }


        if (savedWalletProvider) {

            savedWalletProvider.textContent =
                savedWalletType ===
                    "trust-wallet"
                    ? "Trust Wallet"
                    : "External Wallet";

        }


        if (savedWalletNetwork) {

            savedWalletNetwork.textContent =
                "SOLANA";

        }


        if (savedWalletAddress) {

            savedWalletAddress.textContent =
                savedAddress;

        }


        console.log(
            "VYRO: Saved wallet restored."
        );


        return savedAddress;

    }


    return null;

}


// =========================================================
// INITIALIZE VYRO WALLET SYSTEM
// =========================================================

async function init() {

    if (initialized) {

        return;

    }


    initialized =
        true;


    console.log(
        "VYRO: Wallet system initializing..."
    );


    // =====================================================
    // RESTORE SAVED WALLET
    // =====================================================

    await restoreConnection();


    // =====================================================
    // CONNECT WALLET BUTTON
    // =====================================================

    const connectWalletButton =
        document.getElementById(
            "phantom-wallet-btn"
        );


    if (connectWalletButton) {

        connectWalletButton.addEventListener(
            "click",
            async function () {

                try {

                    await connect();

                }

                catch (error) {

                    console.error(
                        "VYRO: Wallet connection failed:",
                        error
                    );

                }

            }
        );

    }


    // =====================================================
    // DISCONNECT WALLET BUTTON
    // =====================================================

    const disconnectWalletButton =
        document.getElementById(
            "disconnect-wallet-btn"
        );


    if (disconnectWalletButton) {

        disconnectWalletButton.addEventListener(
            "click",
            async function () {

                await disconnect();


                const walletsScreen =
                    document.getElementById(
                        "wallets-screen"
                    );


                if (
                    walletsScreen &&
                    typeof showScreen ===
                        "function"
                ) {

                    showScreen(
                        walletsScreen
                    );

                }

            }
        );

    }


    console.log(
        "VYRO: Wallet system initialized."
    );

}


// =========================================================
// PUBLIC VYRO WALLET API
// =========================================================

window.VYROWallet = {

    init:
        init,

    connect:
        connect,

    disconnect:
        disconnect,

    restoreConnection:
        restoreConnection,

    getAddress:
        function () {

            return publicAddress;

        },

    isConnected:
        function () {

            return connected;

        },

    getWalletType:
        function () {

            return walletType;

        }

};


// =========================================================
// START WALLET SYSTEM
// =========================================================

if (
    document.readyState ===
    "loading"
) {

    document.addEventListener(
        "DOMContentLoaded",
        function () {

            VYROWallet.init();

        }
    );

} else {

    VYROWallet.init();

        }
