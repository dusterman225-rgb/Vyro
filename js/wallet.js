/* =========================================================
   VYRO WALLET SYSTEM
   Stage 2 — External Wallet / Multi-Wallet Foundation
   Solana • Trust Wallet • WalletConnect
   Compatible with VYRO app.js
   ========================================================= */

(function () {
    "use strict";

    let initialized = false;
    let connecting = false;

    let signClient = null;
    let session = null;

    const ADDRESS_KEY = "vyro_connected_wallet";
    const WALLET_TYPE_KEY = "vyro_connected_wallet_type";
    const WALLETS_KEY = "vyro_connected_wallets";
    const ACTIVE_WALLET_KEY = "vyro_active_wallet";

    let wallets = [];
    let activeWalletAddress = null;

    /* =====================================================
       STORAGE
       ===================================================== */

    function loadWallets() {
        try {
            const saved =
                JSON.parse(
                    localStorage.getItem(WALLETS_KEY) || "[]"
                );

            wallets =
                Array.isArray(saved)
                    ? saved.filter(
                        wallet =>
                            wallet &&
                            wallet.address
                    )
                    : [];
        } catch (error) {
            wallets = [];
        }

        const legacyAddress =
            localStorage.getItem(ADDRESS_KEY);

        const legacyType =
            localStorage.getItem(WALLET_TYPE_KEY);

        /*
         * Migrate the original VYRO one-wallet storage
         * into the new multi-wallet structure.
         */
        if (
            legacyAddress &&
            !wallets.some(
                wallet =>
                    wallet.address === legacyAddress
            )
        ) {
            wallets.push({
                address: legacyAddress,
                type:
                    legacyType ||
                    "external-wallet",
                provider:
                    getProviderName(
                        legacyType
                    ),
                network: "solana",
                chain:
                    "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"
            });
        }

        const savedActive =
            localStorage.getItem(
                ACTIVE_WALLET_KEY
            );

        if (
            savedActive &&
            wallets.some(
                wallet =>
                    wallet.address === savedActive
            )
        ) {
            activeWalletAddress = savedActive;
        } else if (wallets.length) {
            activeWalletAddress =
                wallets[0].address;
        } else {
            activeWalletAddress = null;
        }

        saveWallets();
    }

    function saveWallets() {
        localStorage.setItem(
            WALLETS_KEY,
            JSON.stringify(wallets)
        );

        if (activeWalletAddress) {
            localStorage.setItem(
                ACTIVE_WALLET_KEY,
                activeWalletAddress
            );
        } else {
            localStorage.removeItem(
                ACTIVE_WALLET_KEY
            );
        }

        /*
         * Keep legacy keys synchronized so older VYRO
         * code still sees the active wallet.
         */
        const active =
            getActiveWallet();

        if (active) {
            localStorage.setItem(
                ADDRESS_KEY,
                active.address
            );

            localStorage.setItem(
                WALLET_TYPE_KEY,
                active.type || "external-wallet"
            );
        } else {
            localStorage.removeItem(
                ADDRESS_KEY
            );

            localStorage.removeItem(
                WALLET_TYPE_KEY
            );
        }
    }

    /* =====================================================
       PROVIDER HELPERS
       ===================================================== */

    function getProviderName(type) {
        if (type === "trust-wallet") {
            return "Trust Wallet";
        }

        if (type === "walletconnect") {
            return "WalletConnect";
        }

        return type || "External Wallet";
    }

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
            !Array.isArray(
                solanaNamespace.accounts
            ) ||
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

        return parts.length >= 3
            ? parts[2]
            : null;
    }

    /* =====================================================
       WALLET OBJECT
       ===================================================== */

    function createWallet(
        address,
        type,
        provider
    ) {
        return {
            address: address,
            type:
                type ||
                "external-wallet",
            provider:
                provider ||
                getProviderName(type),
            network: "solana",
            chain:
                "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"
        };
    }

    function addWallet(
        address,
        type,
        provider
    ) {
        if (!address) {
            return null;
        }

        let wallet =
            wallets.find(
                item =>
                    item.address === address
            );

        if (!wallet) {
            wallet =
                createWallet(
                    address,
                    type,
                    provider
                );

            wallets.push(wallet);
        } else {
            wallet.type =
                type ||
                wallet.type ||
                "external-wallet";

            wallet.provider =
                provider ||
                getProviderName(
                    wallet.type
                );

            wallet.network =
                "solana";

            wallet.chain =
                "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
        }

        activeWalletAddress =
            address;

        saveWallets();
        updateWalletUI();

        return wallet;
    }

    function removeWallet(
        address
    ) {
        wallets =
            wallets.filter(
                wallet =>
                    wallet.address !== address
            );

        if (
            activeWalletAddress ===
            address
        ) {
            activeWalletAddress =
                wallets.length
                    ? wallets[0].address
                    : null;
        }

        saveWallets();
        updateWalletUI();

        return true;
    }

    /* =====================================================
       ACTIVE WALLET API
       ===================================================== */

    function getWallets() {
        return wallets.slice();
    }

    function getActiveWallet() {
        if (!activeWalletAddress) {
            return null;
        }

        return (
            wallets.find(
                wallet =>
                    wallet.address ===
                    activeWalletAddress
            ) || null
        );
    }

    function setActiveWallet(
        address
    ) {
        const wallet =
            wallets.find(
                item =>
                    item.address ===
                    address
            );

        if (!wallet) {
            return false;
        }

        activeWalletAddress =
            address;

        saveWallets();
        updateWalletUI();

        return true;
    }

    /* =====================================================
       STATE API
       ===================================================== */

    function isConnected() {
        return wallets.length > 0;
    }

    function getAddress() {
        const active =
            getActiveWallet();

        return active
            ? active.address
            : null;
    }

    function getActiveAddress() {
        return getAddress();
    }

    function getWalletType() {
        const active =
            getActiveWallet();

        return active
            ? active.type
            : null;
    }

    function getProvider() {
        const active =
            getActiveWallet();

        return active
            ? active.provider
            : null;
    }

    function getSession() {
        return session;
    }

    /* =====================================================
       WALLET UI
       ===================================================== */

    function updateWalletUI() {
        const active =
            getActiveWallet();

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

        const connectedWalletAddress =
            document.getElementById(
                "connected-wallet-address"
            );

        const connectedWalletProvider =
            document.getElementById(
                "connected-wallet-provider"
            );

        if (active) {
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
                    active.provider ||
                    getProviderName(
                        active.type
                    );
            }

            if (savedWalletNetwork) {
                savedWalletNetwork.textContent =
                    "SOLANA";
            }

            if (savedWalletAddress) {
                savedWalletAddress.textContent =
                    active.address;
            }

            if (connectedWalletAddress) {
                connectedWalletAddress.textContent =
                    active.address;
            }

            if (connectedWalletProvider) {
                connectedWalletProvider.textContent =
                    active.provider ||
                    getProviderName(
                        active.type
                    );
            }
        } else {
            if (noWalletConnected) {
                noWalletConnected.style.display =
                    "block";
            }

            if (savedWalletCard) {
                savedWalletCard.style.display =
                    "none";
            }

            if (savedWalletAddress) {
                savedWalletAddress.textContent =
                    "";
            }
        }

        /*
         * If the newer app.js exposes its selector
         * population function, refresh it after a
         * connection or active-wallet change.
         */
        if (
            typeof window.populateWalletSelectors ===
            "function"
        ) {
            try {
                window.populateWalletSelectors();
            } catch (error) {
                console.warn(
                    "VYRO: Wallet selector refresh notice:",
                    error
                );
            }
        }
    }

    function showConnectedWallet(
        address
    ) {
        const walletScreen =
            document.getElementById(
                "wallet-connected-screen"
            );

        const addressElement =
            document.getElementById(
                "connected-wallet-address"
            );

        const providerElement =
            document.getElementById(
                "connected-wallet-provider"
            );

        if (addressElement) {
            addressElement.textContent =
                address || "";
        }

        if (providerElement) {
            providerElement.textContent =
                getProvider();
        }

        if (
            walletScreen &&
            typeof window.showScreen ===
                "function"
        ) {
            window.showScreen(
                walletScreen
            );
        }
    }

    /* =====================================================
       TRUST WALLET
       ===================================================== */

    async function connectTrustWallet() {
        if (
            !window.trustwallet ||
            !window.trustwallet.solana
        ) {
            return null;
        }

        const trustWallet =
            window.trustwallet.solana;

        const connectFeature =
            trustWallet.features &&
            trustWallet.features[
                "standard:connect"
            ];

        if (
            !connectFeature ||
            typeof connectFeature.connect !==
                "function"
        ) {
            return null;
        }

        const result =
            await connectFeature.connect();

        const accounts =
            result &&
            result.accounts;

        if (
            !accounts ||
            !accounts.length
        ) {
            return null;
        }

        const address =
            accounts[0] &&
            accounts[0].address;

        if (!address) {
            return null;
        }

        const wallet =
            addWallet(
                address,
                "trust-wallet",
                "Trust Wallet"
            );

        showConnectedWallet(
            address
        );

        return wallet;
    }

    /* =====================================================
       WALLETCONNECT
       ===================================================== */

    async function connectWalletConnect() {
        if (
            typeof window.SignClient ===
                "undefined"
        ) {
            throw new Error(
                "WalletConnect SignClient is not available."
            );
        }

        if (
            typeof window.WALLETCONNECT_PROJECT_ID ===
                "undefined" ||
            !window.WALLETCONNECT_PROJECT_ID
        ) {
            throw new Error(
                "WALLETCONNECT_PROJECT_ID is not configured."
            );
        }

        signClient =
            await window.SignClient.init({
                projectId:
                    window.WALLETCONNECT_PROJECT_ID,

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

        if (
            !connection ||
            !connection.uri
        ) {
            throw new Error(
                "WalletConnect did not return a URI."
            );
        }

        /*
         * Mobile Trust Wallet handoff.
         * The VYRO page remains the dApp endpoint;
         * Trust Wallet receives the WalletConnect URI.
         */
        const trustWalletUrl =
            "https://link.trustwallet.com/wc?uri=" +
            encodeURIComponent(
                connection.uri
            );

        window.open(
            trustWalletUrl,
            "_blank",
            "noopener,noreferrer"
        );

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

        const wallet =
            addWallet(
                address,
                "walletconnect",
                "WalletConnect"
            );

        showConnectedWallet(
            address
        );

        return wallet;
    }

    /* =====================================================
       CONNECT
       ===================================================== */

    async function connect() {
        if (connecting) {
            return getActiveWallet();
        }

        connecting = true;

        try {
            /*
             * Prefer an injected Trust Wallet provider.
             */
            const trustWallet =
                await connectTrustWallet();

            if (trustWallet) {
                return trustWallet;
            }

            /*
             * Otherwise use WalletConnect.
             */
            return await connectWalletConnect();

        } finally {
            connecting = false;
        }
    }

    /* =====================================================
       DISCONNECT ACTIVE WALLET
       ===================================================== */

    async function disconnect() {
        const active =
            getActiveWallet();

        try {
            if (
                signClient &&
                session &&
                session.topic
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
        } catch (error) {
            console.warn(
                "VYRO: WalletConnect disconnect notice:",
                error
            );
        }

        if (active) {
            removeWallet(
                active.address
            );
        } else {
            updateWalletUI();
        }

        session = null;

        return true;
    }

    /* =====================================================
       RESTORE
       ===================================================== */

    async function restoreConnection() {
        loadWallets();

        /*
         * Try to restore an injected Trust Wallet
         * connection first.
         */
        try {
            if (
                window.trustwallet &&
                window.trustwallet.solana
            ) {
                const provider =
                    window.trustwallet.solana;

                const feature =
                    provider.features &&
                    provider.features[
                        "standard:connect"
                    ];

                if (
   
