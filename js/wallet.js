// =========================================================
// VYRO WALLET PROVIDER LAYER
// =========================================================
//
// V1:
// Solana
// USDC
//
// First wallet provider:
// Trust Wallet via WalletConnect
//
// IMPORTANT:
// VYRO NEVER receives or stores private keys or seed phrases.
// The external wallet remains responsible for signing.
//
// Future providers can be added without rebuilding the
// payment system:
//
// Trust Wallet
// Zengo
// Phantom
// Solflare
// Coinbase Wallet
// etc.
//
// =========================================================


const VYROWallet = (function () {

    // =====================================================
    // STATE
    // =====================================================

    let initialized = false;

    let connected = false;

    let publicAddress = null;

    let walletType = null;

    let signClient = null;

    let session = null;


    // =====================================================
    // STORAGE KEYS
    // =====================================================

    const ADDRESS_KEY =
        "vyro_connected_wallet";

    const WALLET_TYPE_KEY =
        "vyro_connected_wallet_type";


    // =====================================================
    // WALLETCONNECT METADATA
    // =====================================================

    const walletMetadata = {

        name:
            "VYRO",

        description:
            "Simple non-custodial crypto payments.",

        url:
            window.location.origin,

        icons:
            []

    };


    // =====================================================
    // LOAD WALLETCONNECT CLIENT
    // =====================================================

    async function loadSignClient() {

        if (signClient) {

            return signClient;

        }


        if (
            typeof WALLETCONNECT_PROJECT_ID === "undefined" ||
            !WALLETCONNECT_PROJECT_ID ||
            WALLETCONNECT_PROJECT_ID ===
                "YOUR_PROJECT_ID_HERE"
        ) {

            throw new Error(
                "VYRO WalletConnect Project ID is missing."
            );

        }


        const module = await import(
            "https://esm.sh/@walletconnect/sign-client@2.23.5"
        );


        const SignClient =
            module.default || module.SignClient;


        if (!SignClient) {

            throw new Error(
                "WalletConnect SignClient could not be loaded."
            );

        }


        signClient =
            await SignClient.init({

                projectId:
                    WALLETCONNECT_PROJECT_ID,

                metadata:
                    walletMetadata

            });


        return signClient;

    }


    // =====================================================
    // UPDATE LOCAL WALLET STATE
    // =====================================================

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


        localStorage.setItem(
            ADDRESS_KEY,
            address
        );

        localStorage.setItem(
            WALLET_TYPE_KEY,
            type
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


if (savedWalletCard) {

    savedWalletCard.style.display =
        "block";

}


if (savedWalletProvider) {

    savedWalletProvider.textContent =
        type === "trust-wallet"
            ? "Trust Wallet"
            : "External Wallet";

}


if (savedWalletNetwork) {

    savedWalletNetwork.textContent =
        "SOLANA";

}


if (savedWalletAddress) {

    savedWalletAddress.textContent =
        address;

}

    }


    // =====================================================
    // CLEAR LOCAL WALLET STATE
    // =====================================================

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

    }


    // =====================================================
    // GET SOLANA ADDRESS FROM SESSION
    // =====================================================

    function getAddressFromSession(
        currentSession
    ) {

        if (!currentSession) {

            return null;

        }


        const accounts =
            currentSession.namespaces &&
            currentSession.namespaces.solana &&
            currentSession.namespaces.solana.accounts;


        if (
            !accounts ||
            !accounts.length
        ) {

            return null;

        }


        // WalletConnect Solana accounts use:
        //
        // solana:chain-reference:public-key
        //
        // We only need the public key.

        const account =
            accounts[0];

        const parts =
            account.split(":");


        if (
            parts.length < 3
        ) {

            return null;

        }


        return parts.slice(2).join(":");

    }


    // =====================================================
    // CONNECT TO EXTERNAL WALLET
    // =====================================================

    async function connect() {

    // =====================================================
    // TRUST WALLET DAPP BROWSER
    // =====================================================

    if (
        window.trustwallet &&
        window.trustwallet.solana
    ) {

        console.log(
            "VYRO: Trust Wallet DApp browser detected."
        );

        try {

            const trustWallet =
                window.trustwallet.solana;


            // Trust Wallet's Solana provider
            // follows the Wallet Standard.

            const connectFeature =
                trustWallet.features &&
                trustWallet.features[
                    "standard:connect"
                ];


            if (
                !connectFeature ||
                typeof connectFeature.connect !== "function"
            ) {

                throw new Error(
                    "Trust Wallet Solana connect feature was not found."
                );

            }


            console.log(
                "VYRO: Requesting Trust Wallet Solana account..."
            );


            const result =
                await connectFeature.connect();


            const accounts =
                result &&
                result.accounts;


            if (
                !accounts ||
                !accounts.length
            ) {

                throw new Error(
                    "Trust Wallet did not return a Solana account."
                );

            }


            const address =
                accounts[0].address;


            if (!address) {

                throw new Error(
                    "Trust Wallet returned an invalid Solana address."
                );

            }


            console.log(
                "VYRO: Trust Wallet Solana account connected."
            );


            setConnectedWallet(
                address,
                "trust-wallet",
                null
            );


            showConnectedWallet(
                address
            );


            return address;

        }

        catch (error) {

            console.error(
                "VYRO Trust Wallet connection error:",
                error
            );


            alert(
                "Unable to connect Trust Wallet."
            );


            return null;

        }

    }


    // =====================================================
    // NORMAL MOBILE BROWSER
    // USE WALLETCONNECT
    // =====================================================

    try {

        console.log(
            "VYRO WALLET STEP 1: Loading WalletConnect..."
        );


        const client =
            await loadSignClient();


        console.log(
            "VYRO WALLET STEP 2: WalletConnect loaded."
        );


        // -------------------------------------------------
        // If a session already exists, use it.
        // -------------------------------------------------

        if (client.session.length > 0) {

            console.log(
                "VYRO WALLET STEP 2A: Existing session found."
            );


            const existingSession =
                client.session.values[0];


            const existingAddress =
                getAddressFromSession(
                    existingSession
                );


            if (existingAddress) {

                console.log(
                    "VYRO WALLET STEP 2B: Existing wallet found."
                );


                setConnectedWallet(
                    existingAddress,
                    "walletconnect",
                    existingSession
                );


                showConnectedWallet(
                    existingAddress
                );


                return existingAddress;

            }

        }


        console.log(
            "VYRO WALLET STEP 3: Requesting Solana connection..."
        );


        // -------------------------------------------------
        // Request Solana permissions.
        // -------------------------------------------------

        const connection =
            await client.connect({

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


        console.log(
            "VYRO WALLET STEP 4: WalletConnect connection created."
        );


        // -------------------------------------------------
        // WalletConnect gives us a URI.
        // -------------------------------------------------

        const uri =
            connection.uri;


        if (!uri) {

            throw new Error(
                "WalletConnect did not return a connection URI."
            );

        }


        console.log(
            "VYRO WALLET STEP 5: Connection URI received."
        );


        // -------------------------------------------------
        // Open Trust Wallet.
        // -------------------------------------------------

        const trustWalletUrl =
            "https://link.trustwallet.com/wc?uri=" +
            encodeURIComponent(uri);


        console.log(
            "VYRO WALLET STEP 6: Opening Trust Wallet..."
        );


        window.open(
            trustWalletUrl,
            "_blank",
            "noreferrer noopener"
        );


        console.log(
            "VYRO WALLET STEP 7: Waiting for Trust Wallet approval..."
        );


        // -------------------------------------------------
        // Wait for wallet approval.
        // -------------------------------------------------

        const approvedSession =
            await connection.approval();


        console.log(
            "VYRO WALLET STEP 8: Trust Wallet approved connection."
        );


        if (!approvedSession) {

            throw new Error(
                "Wallet connection was not approved."
            );

        }


        const address =
            getAddressFromSession(
                approvedSession
            );


        if (!address) {

            throw new Error(
                "No Solana wallet address was returned."
            );

        }


        console.log(
            "VYRO WALLET STEP 9: Solana wallet address received."
        );


        setConnectedWallet(
            address,
            "walletconnect",
            approvedSession
        );


        showConnectedWallet(
            address
        );


        console.log(
            "VYRO WALLET STEP 10: Wallet connection complete."
        );


        return address;

    }

    catch (error) {

        console.error(
            "VYRO wallet connection error:",
            error
        );


        alert(
            "Unable to connect the external wallet."
        );


        return null;

    }

}


    // =====================================================
    // SHOW CONNECTED WALLET
    // =====================================================

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

    if (walletType === "trust-wallet") {

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
            typeof showScreen === "function"
        ) {

            showScreen(
                walletScreen
            );

        }

    }


    // =====================================================
    // DISCONNECT
    // =====================================================

    async function disconnect() {

        try {

            if (
                signClient &&
                session
            ) {

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

        }

        catch (error) {

            console.warn(
                "VYRO wallet disconnect warning:",
                error
            );

        }


        clearWalletState();


        return true;

    }


    // =====================================================
    // RESTORE CONNECTION
    // =====================================================

    async function restoreConnection() {

// =====================================================
// RESTORE TRUST WALLET CONNECTION
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
            typeof connectFeature.connect === "function"
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


    if (savedWalletCard) {

        savedWalletCard.style.display =
            "block";

    }


    if (savedWalletProvider) {

        savedWalletProvider.textContent =
            savedWalletType === "trust-wallet"
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


    return savedAddress;

}


        return null;

    }


    // =====================================================
    // INITIALIZE
    // =====================================================

    async function init() {

        if (initialized) {

            return;

        }


        initialized =
            true;


        await restoreConnection();


        // -------------------------------------------------
        // CONNECT BUTTON
        //
        // We are temporarily keeping the existing
        // phantom-wallet-btn ID so we don't have to
        // redesign the HTML yet.
        // -------------------------------------------------

        const connectButton =
            document.getElementById(
                "phantom-wallet-btn"
            );


        if (connectButton) {

            connectButton.addEventListener(
                "click",
                async function () {

                    connectButton.disabled =
                        true;

                    connectButton.textContent =
                        "CONNECTING...";


                    await connect();


                    connectButton.disabled =
                        false;

                    connectButton.textContent =
                        "CONNECT EXTERNAL WALLET";

                }
            );

        }


        // -------------------------------------------------
        // DISCONNECT BUTTON
        // -------------------------------------------------

        const disconnectButton =
            document.getElementById(
                "disconnect-wallet-btn"
            );


        if (disconnectButton) {

            disconnectButton.addEventListener(
                "click",
                async function () {

                    await disconnect();


                    const walletsScreen =
                        document.getElementById(
                            "wallets-screen"
                        );


                    if (
                        walletsScreen &&
                        typeof showScreen === "function"
                    ) {

                        showScreen(
                            walletsScreen
                        );

                    }

                }
            );

        }


        console.log(
            "VYRO Wallet Provider Layer initialized."
        );

    }


    // =====================================================
    // PUBLIC API
    // =====================================================

    return {

        init:
            init,

        connect:
            connect,

        disconnect:
            disconnect,

        getAddress:
            function () {

                return publicAddress;

            },

        getSession:
            function () {

                return session;

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

})();


// =========================================================
// INITIALIZE VYRO WALLET LAYER
// =========================================================

VYROWallet.init();
