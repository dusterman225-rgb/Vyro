/* =========================================================
   VYRO WALLET SYSTEM
   Stage 2 — External Wallet / Multi-Wallet Foundation
   Current baseline
   ========================================================= */

(function () {
    "use strict";

    let initialized = false;
    let connected = false;
    let connecting = false;
    let publicAddress = null;
    let walletType = null;
    let signClient = null;
    let session = null;

    const CONNECTED_WALLET_KEY = "vyro_connected_wallet";
    const CONNECTED_WALLET_TYPE_KEY = "vyro_connected_wallet_type";
    const WALLET_LIST_KEY = "vyro_wallet_list";
    const ACTIVE_WALLET_KEY = "vyro_active_wallet";

    const SOLANA_CHAIN_ID =
        "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";

    /* Compatibility with older wallet code */
    const SOLANA_CHAIN = SOLANA_CHAIN_ID;

    /* ---------------------------------------------------------
       Utility
       --------------------------------------------------------- */

    function showWalletError(message) {
        console.error("VYRO Wallet:", message);

        if (typeof window.alert === "function") {
            window.alert(message);
        }
    }

    function formatWalletAddress(address) {
        if (!address) {
            return "";
        }

        if (address.length <= 14) {
            return address;
        }

        return (
            address.substring(0, 6) +
            "..." +
            address.substring(address.length - 6)
        );
    }

    function normalizeWallet(wallet) {
        if (!wallet || !wallet.address) {
            return null;
        }

        return {
            address: String(wallet.address),
            provider: wallet.provider || "External Wallet",
            network: wallet.network || "solana",
            type: wallet.type || wallet.provider || "external",
            connected: wallet.connected === true
        };
    }

    /* ---------------------------------------------------------
       Wallet List Storage
       --------------------------------------------------------- */

    function getWalletList() {
        try {
            const stored = localStorage.getItem(WALLET_LIST_KEY);

            if (!stored) {
                return [];
            }

            const parsed = JSON.parse(stored);

            if (!Array.isArray(parsed)) {
                return [];
            }

            return parsed
                .map(normalizeWallet)
                .filter(function (wallet) {
                    return wallet !== null;
                });
        } catch (error) {
            console.error(
                "VYRO: Unable to read wallet list:",
                error
            );

            return [];
        }
    }

    function saveWalletList(wallets) {
        const cleanWallets = (wallets || [])
            .map(normalizeWallet)
            .filter(function (wallet) {
                return wallet !== null;
            });

        localStorage.setItem(
            WALLET_LIST_KEY,
            JSON.stringify(cleanWallets)
        );

        return cleanWallets;
    }

    function findWallet(address) {
        if (!address) {
            return null;
        }

        const wallets = getWalletList();

        return (
            wallets.find(function (wallet) {
                return wallet.address === address;
            }) || null
        );
    }

    function saveWalletToList(wallet) {
        const normalized = normalizeWallet(wallet);

        if (!normalized) {
            return null;
        }

        let wallets = getWalletList();

        const existingIndex = wallets.findIndex(function (item) {
            return item.address === normalized.address;
        });

        if (existingIndex >= 0) {
            wallets[existingIndex] = {
                ...wallets[existingIndex],
                ...normalized
            };
        } else {
            wallets.push(normalized);
        }

        saveWalletList(wallets);

        return normalized;
    }

    /* ---------------------------------------------------------
       Active Wallet
       --------------------------------------------------------- */

    function getActiveWallet() {
        const activeAddress =
            localStorage.getItem(ACTIVE_WALLET_KEY);

        if (!activeAddress) {
            return null;
        }

        return findWallet(activeAddress);
    }

    function setActiveWallet(address) {
        if (!address) {
            return false;
        }

        const wallet = findWallet(address);

        if (!wallet) {
            console.warn(
                "VYRO: Cannot activate wallet that is not saved:",
                address
            );

            return false;
        }

        if (wallet.network && wallet.network !== "solana") {
            console.warn(
                "VYRO: Unsupported wallet network:",
                wallet.network
            );

            return false;
        }

        localStorage.setItem(
            ACTIVE_WALLET_KEY,
            wallet.address
        );

        publicAddress = wallet.address;
        walletType = wallet.type || wallet.provider;
        connected = true;

        updateWalletScreen(wallet);

        return true;
    }

    function removeWalletFromList(address) {
        if (!address) {
            return false;
        }

        let wallets = getWalletList();

        const originalLength = wallets.length;

        wallets = wallets.filter(function (wallet) {
            return wallet.address !== address;
        });

        if (wallets.length === originalLength) {
            return false;
        }

        saveWalletList(wallets);

        const activeAddress =
            localStorage.getItem(ACTIVE_WALLET_KEY);

        if (activeAddress === address) {
            if (wallets.length > 0) {
                const nextWallet = wallets[0];

                localStorage.setItem(
                    ACTIVE_WALLET_KEY,
                    nextWallet.address
                );

                publicAddress = nextWallet.address;
                walletType =
                    nextWallet.type || nextWallet.provider;
                connected = true;
            } else {
                localStorage.removeItem(ACTIVE_WALLET_KEY);

                publicAddress = null;
                walletType = null;
                connected = false;
            }
        }

        updateWalletScreen(getActiveWallet());

        return true;
    }

    /* ---------------------------------------------------------
       Wallet Screen
       --------------------------------------------------------- */

    function updateWalletScreen(wallet) {
        const walletList =
            document.getElementById("wallet-list");

        const savedWalletCard =
            document.getElementById("saved-wallet-card");

        const savedWalletProvider =
            document.getElementById("saved-wallet-provider");

        const savedWalletSelected =
            document.getElementById("saved-wallet-selected");

        const savedWalletNetwork =
            document.getElementById("saved-wallet-network");

        const savedWalletAddress =
            document.getElementById("saved-wallet-address");

        const additionalWallets =
            document.getElementById("additional-wallets");

        const noWalletCard =
            document.getElementById("no-wallet-card");

        const noWalletConnected =
            document.getElementById("no-wallet-connected");

        const wallets = getWalletList();

        if (walletList) {
            walletList.innerHTML = "";
        }

        if (!wallet) {
            if (savedWalletCard) {
                savedWalletCard.style.display = "none";
            }

            if (additionalWallets) {
                additionalWallets.innerHTML = "";
                additionalWallets.style.display = "none";
            }

            if (noWalletCard) {
                noWalletCard.style.display = "";
            }

            if (noWalletConnected) {
                noWalletConnected.style.display = "";
            }

            return;
        }

        if (noWalletCard) {
            noWalletCard.style.display = "none";
        }

        if (noWalletConnected) {
            noWalletConnected.style.display = "none";
        }

        if (savedWalletCard) {
            savedWalletCard.style.display = "";
        }

        if (savedWalletProvider) {
            savedWalletProvider.textContent =
                wallet.provider || "External Wallet";
        }

        if (savedWalletNetwork) {
            savedWalletNetwork.textContent = "Solana";
        }

        if (savedWalletAddress) {
            savedWalletAddress.textContent =
                formatWalletAddress(wallet.address);
            savedWalletAddress.setAttribute(
                "title",
                wallet.address
            );
        }

        const activeWallet = getActiveWallet();

        if (savedWalletSelected) {
            savedWalletSelected.style.display =
                activeWallet &&
                activeWallet.address === wallet.address
                    ? ""
                    : "none";
        }

        if (
            additionalWallets &&
            wallets.length > 1
        ) {
            additionalWallets.innerHTML = "";
            additionalWallets.style.display = "";

            wallets.forEach(function (item) {
                if (
                    item.address === wallet.address
                ) {
                    return;
                }

                const card =
                    document.createElement("div");

                card.className = "wallet-card";

                const provider =
                    document.createElement("div");

                provider.textContent =
                    item.provider ||
                    "External Wallet";

                const network =
                    document.createElement("div");

                network.textContent = "Solana";

                const address =
                    document.createElement("div");

                address.textContent =
                    formatWalletAddress(
                        item.address
                    );

                const selectButton =
                    document.createElement("button");

                selectButton.type = "button";
                selectButton.className =
                    "secondary-button";
                selectButton.textContent =
                    "SELECT WALLET";

                selectButton.addEventListener(
                    "click",
                    function () {
                        setActiveWallet(
                            item.address
                        );
                    }
                );

                card.appendChild(provider);
                card.appendChild(network);
                card.appendChild(address);
                card.appendChild(selectButton);

                additionalWallets.appendChild(card);
            });
        } else if (additionalWallets) {
            additionalWallets.innerHTML = "";
            additionalWallets.style.display = "none";
        }
    }

    /* ---------------------------------------------------------
       Connected Wallet Screen
       --------------------------------------------------------- */

    function showConnectedWallet(wallet) {
        if (!wallet) {
            return;
        }

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
                formatWalletAddress(wallet.address);

            addressElement.setAttribute(
                "title",
                wallet.address
            );
        }

        if (providerElement) {
            providerElement.textContent =
                wallet.provider ||
                "External Wallet";
        }
    }

    /* ---------------------------------------------------------
       Connection State
       --------------------------------------------------------- */

    function setConnectedWallet(
        address,
        provider,
        providerObject
    ) {
        if (!address) {
            return null;
        }

        const wallet = {
            address: address,
            provider:
                provider || "External Wallet",
            network: "solana",
            type:
                provider || "external",
            connected: true
        };

        publicAddress = address;
        walletType = wallet.type;
        connected = true;

        if (providerObject) {
            try {
                window.__VYRO_WALLET_PROVIDER__ =
                    providerObject;
            } catch (error) {
                console.warn(
                    "VYRO: Could not store wallet provider.",
                    error
                );
            }
        }

        localStorage.setItem(
            CONNECTED_WALLET_KEY,
            address
        );

        localStorage.setItem(
            CONNECTED_WALLET_TYPE_KEY,
            wallet.type
        );

        saveWalletToList(wallet);

        localStorage.setItem(
            ACTIVE_WALLET_KEY,
            address
        );

        updateWalletScreen(wallet);
        showConnectedWallet(wallet);

        return wallet;
    }

    function clearWalletState() {
        connected = false;
        publicAddress = null;
        walletType = null;
        session = null;

        localStorage.removeItem(
            CONNECTED_WALLET_KEY
        );

        localStorage.removeItem(
            CONNECTED_WALLET_TYPE_KEY
        );

        try {
            delete window.__VYRO_WALLET_PROVIDER__;
        } catch (error) {
            window.__VYRO_WALLET_PROVIDER__ = null;
        }
    }

    /* ---------------------------------------------------------
       Trust Wallet
       --------------------------------------------------------- */

    function getTrustWalletProvider() {
        if (
            window.trustwallet &&
            window.trustwallet.solana
        ) {
            return window.trustwallet.solana;
        }

        return null;
    }

    function extractAddressFromAccounts(accounts) {
        if (!accounts || !accounts.length) {
            return null;
        }

        const account = accounts[0];

        if (typeof account === "string") {
            return account;
        }

        if (account.address) {
            return account.address;
        }

        if (account.publicKey) {
            return account.publicKey;
        }

        return null;
    }

    async function connectTrustWallet() {
        const provider =
            getTrustWalletProvider();

        if (!provider) {
            return null;
        }

        try {
            let accounts = null;

            if (
                provider.features &&
                provider.features["standard:connect"] &&
                typeof provider.features[
                    "standard:connect"
                ].connect === "function"
            ) {
                const result =
                    await provider.features[
                        "standard:connect"
                    ].connect();

                accounts =
                    result &&
                    result.accounts
                        ? result.accounts
                        : null;
            } else if (
                typeof provider.connect ===
                "function"
            ) {
                const result =
                    await provider.connect();

                accounts =
                    result &&
                    result.publicKey
                        ? [
                              {
                                  address:
                                      result.publicKey
                              }
                          ]
                        : result &&
                          result.accounts
                        ? result.accounts
                        : null;
            }

            const address =
                extractAddressFromAccounts(
                    accounts
                );

            if (!address) {
                throw new Error(
                    "Trust Wallet did not return a Solana wallet address."
                );
            }

            return setConnectedWallet(
                address,
                "trust-wallet",
                provider
            );
        } catch (error) {
            console.error(
                "VYRO: Trust Wallet connection failed:",
                error
            );

            throw error;
        }
    }

    /* ---------------------------------------------------------
       WalletConnect
       --------------------------------------------------------- */

    async function initializeWalletConnect() {
        if (signClient) {
            return signClient;
        }

        if (
            !window.SignClient ||
            typeof window.SignClient.init !==
                "function"
        ) {
            console.warn(
                "VYRO: WalletConnect SignClient is not loaded."
            );

            return null;
        }

        if (
            typeof WALLETCONNECT_PROJECT_ID ===
            "undefined" ||
            !WALLETCONNECT_PROJECT_ID
        ) {
            console.warn(
                "VYRO: WalletConnect project ID is missing."
            );

            return null;
        }

        signClient =
            await window.SignClient.init({
                projectId:
                    WALLETCONNECT_PROJECT_ID,

                metadata: {
                    name: "VYRO",
                    description:
                        "VYRO crypto payment application",
                    url:
                        window.location.origin,
                    icons: []
                }
            });

        return signClient;
    }

    function getWalletConnectSessionAddress(
        currentSession
    ) {
        if (
            !currentSession ||
            !currentSession.namespaces ||
            !currentSession.namespaces.solana
        ) {
            return null;
        }

        const accounts =
            currentSession.namespaces.solana
                .accounts;

        if (
            !Array.isArray(accounts) ||
            accounts.length === 0
        ) {
            return null;
        }

        const account = accounts[0];

        const parts = account.split(":");

        if (parts.length >= 3) {
            return parts[2];
        }

        return null;
    }

    async function connectWalletConnect() {
        const client =
            await initializeWalletConnect();

        if (!client) {
            throw new Error(
                "WalletConnect is not available in this VYRO build."
            );
        }

        const requiredNamespaces = {
            solana: {
                methods: [
                    "solana_signTransaction",
                    "solana_signMessage"
                ],
                chains: [
                    SOLANA_CHAIN_ID
                ],
                events: []
            }
        };

        const result =
            await client.connect({
                requiredNamespaces:
                    requiredNamespaces
            });

        if (!result || !result.uri) {
            throw new Error(
                "WalletConnect did not provide a connection URI."
            );
        }

        const uri = result.uri;

        try {
            window.open(
                "https://link.trustwallet.com/wc?uri=" +
                    encodeURIComponent(uri),
                "_blank"
            );
        } catch (error) {
            console.warn(
                "VYRO: Could not open Trust Wallet link.",
                error
            );
        }

        session =
            await result.approval();

        const address =
            getWalletConnectSessionAddress(
                session
            );

        if (!address) {
            throw new Error(
                "WalletConnect connected, but no Solana wallet address was returned."
            );
        }

        return setConnectedWallet(
            address,
            "trust-wallet",
            null
        );
    }

    /* ---------------------------------------------------------
       Main Connection
       --------------------------------------------------------- */

    async function connect() {
        if (connecting) {
            return null;
        }

        connecting = true;

        try {
            /*
             * Trust Wallet is attempted first.
             */
            const trustWallet =
                await connectTrustWallet();

            if (trustWallet) {
                if (
                    typeof window.showScreen ===
                    "function"
                ) {
                    const walletsScreen =
                        document.getElementById(
                            "wallets-screen"
                        );

                    if (walletsScreen) {
                        window.showScreen(
                            walletsScreen
                        );
                    }
                }

                return trustWallet;
            }

            /*
             * WalletConnect is the fallback.
             */
            const walletConnectWallet =
                await connectWalletConnect();

            if (walletConnectWallet) {
                if (
                    typeof window.showScreen ===
                    "function"
                ) {
                    const walletsScreen =
                        document.getElementById(
                            "wallets-screen"
                        );

                    if (walletsScreen) {
                        window.showScreen(
                            walletsScreen
                        );
                    }
                }

                return walletConnectWallet;
            }

            throw new Error(
                "No supported external Solana wallet was detected."
            );
        } catch (error) {
            console.error(
                "VYRO: External wallet connection failed:",
                error
            );

            showWalletError(
                error && error.message
                    ? error.message
                    : "Unable to connect an external wallet."
            );

            return null;
        } finally {
            connecting = false;
        }
    }

    /* ---------------------------------------------------------
       Restore Saved Wallet
       --------------------------------------------------------- */

    async function restoreConnection() {
        try {
            let wallets = getWalletList();

            /*
             * Remove malformed wallet records.
             */
            wallets = wallets.filter(function (
                wallet
            ) {
                return (
                    wallet &&
                    wallet.address &&
                    (!wallet.network ||
                        wallet.network ===
                            "solana")
                );
            });

            saveWalletList(wallets);

            let activeAddress =
                localStorage.getItem(
                    ACTIVE_WALLET_KEY
                );

            let activeWallet =
                activeAddress
                    ? findWallet(activeAddress)
                    : null;

            /*
             * If there is no valid active wallet,
             * use the first saved wallet.
             */
            if (!activeWallet && wallets.length) {
                activeWallet = wallets[0];

                localStorage.setItem(
                    ACTIVE_WALLET_KEY,
                    activeWallet.address
                );
            }

            /*
             * Migrate older single-wallet storage
             * if the multi-wallet list is empty.
             */
            if (
                !activeWallet &&
                wallets.length === 0
            ) {
                const oldAddress =
                    localStorage.getItem(
                        CONNECTED_WALLET_KEY
                    );

                const oldType =
                    localStorage.getItem(
                        CONNECTED_WALLET_TYPE_KEY
                    );

                if (oldAddress) {
                    activeWallet =
                        saveWalletToList({
                            address: oldAddress,
                            provider:
                                oldType ||
                                "External Wallet",
                            type:
                                oldType ||
                                "external",
                            network: "solana",
                            connected: true
                        });

                    if (activeWallet) {
                        localStorage.setItem(
                            ACTIVE_WALLET_KEY,
                            activeWallet.address
                        );
                    }
                }
            }

            if (activeWallet) {
                publicAddress =
                    activeWallet.address;

                walletType =
                    activeWallet.type ||
                    activeWallet.provider;

                connected = true;

                localStorage.setItem(
                    CONNECTED_WALLET_KEY,
                    activeWallet.address
                );

                localStorage.setItem(
                    CONNECTED_WALLET_TYPE_KEY,
                    walletType
                );

                updateWalletScreen(
                    activeWallet
                );

                showConnectedWallet(
                    activeWallet
                );

                return activeWallet;
            }

            clearWalletState();
            updateWalletScreen(null);

            return null;
        } catch (error) {
            console.error(
                "VYRO: Wallet restore failed:",
                error
            );

            clearWalletState();
            updateWalletScreen(null);

            return null;
        }
    }

    /* ---------------------------------------------------------
       Disconnect
       --------------------------------------------------------- */

    async function disconnect() {
        const activeWallet =
            getActiveWallet();

        try {
            const provider =
                window.__VYRO_WALLET_PROVIDER__;

            if (
                provider &&
                typeof provider.disconnect ===
                    "function"
            ) {
                await provider.disconnect();
            }
        } catch (error) {
            console.warn(
                "VYRO: External wallet disconnect failed:",
                error
            );
        }

        if (session && signClient) {
            try {
                await signClient.disconnect({
                    topic: session.topic,
                    reason: {
                        code: 6000,
                        message:
                            "Disconnected by user"
                    }
                });
            } catch (error) {
                console.warn(
                    "VYRO: WalletConnect disconnect failed:",
                    error
                );
            }
        }

        session = null;

        if (activeWallet) {
            removeWalletFromList(
                activeWallet.address
            );
        } else {
            clearWalletState();
            updateWalletScreen(null);
        }

        return true;
    }

    /* ---------------------------------------------------------
       Sign Solana Transaction
       --------------------------------------------------------- */

    async function signSolanaTransaction(
        transaction
    ) {
        if (!transaction) {
            throw new Error(
                "No Solana transaction was provided."
            );
        }

        const activeWallet =
            getActiveWallet();

        if (!activeWallet) {
            throw new Error(
                "No active external wallet is connected."
            );
        }

        /*
         * Trust Wallet / injected provider.
         */
        const provider =
            window.__VYRO_WALLET_PROVIDER__ ||
            getTrustWalletProvider();

        if (provider) {
            if (
                provider.features &&
                provider.features[
                    "solana:signTransaction"
                ] &&
                typeof provider.features[
                    "solana:signTransaction"
                ].signTransaction ===
                    "function"
            ) {
                return await provider.features[
                    "solana:signTransaction"
                ].signTransaction(
                    transaction
                );
            }

            if (
                provider.features &&
                provider.features[
                    "standard:signTransaction"
                ] &&
                typeof provider.features[
                    "standard:signTransaction"
                ].signTransaction ===
                    "function"
            ) {
                return await provider.features[
                    "standard:signTransaction"
                ].signTransaction(
                    transaction
                );
            }

            if (
                typeof provider.signTransaction ===
                "function"
            ) {
                return await provider.signTransaction(
                    transaction
                );
            }
        }

        /*
         * WalletConnect.
         */
        if (
            signClient &&
            session &&
            session.topic
        ) {
            return await signClient.request({
                topic: session.topic,

                chainId:
                    SOLANA_CHAIN_ID,

                request: {
                    method:
                        "solana_signTransaction",

                    params: {
                        transaction:
                            transaction
                    }
                }
            });
        }

        throw new Error(
            "The connected wallet does not currently expose a supported Solana transaction-signing method."
        );
    }

    /* ---------------------------------------------------------
       Copy Wallet Address
       --------------------------------------------------------- */

    async function copyWalletAddress() {
        const wallet =
            getActiveWallet();

        if (!wallet || !wallet.address) {
            return false;
        }

        try {
            if (
                navigator.clipboard &&
                typeof navigator.clipboard.writeText ===
                    "function"
            ) {
                await navigator.clipboard.writeText(
                    wallet.address
                );
            } else {
                const textarea =
                    document.createElement(
                        "textarea"
                    );

                textarea.value =
                    wallet.address;

                textarea.style.position =
                    "fixed";

                textarea.style.opacity = "0";

                document.body.appendChild(
                    textarea
                );

                textarea.focus();
                textarea.select();

                document.execCommand(
                    "copy"
                );

                textarea.remove();
            }

            const button =
                document.getElementById(
                    "copy-wallet-address-btn"
                );

            if (button) {
                const originalText =
                    button.textContent;

                button.textContent =
                    "COPIED";

                setTimeout(function () {
                    button.textContent =
                        originalText;
                }, 1500);
            }

            return true;
        } catch (error) {
            console.error(
                "VYRO: Unable to copy wallet address:",
                error
            );

            showWalletError(
                "Unable to copy the wallet address."
            );

            return false;
        }
    }

    /* ---------------------------------------------------------
       DOM Initialization
       --------------------------------------------------------- */

    async function init() {
        if (initialized) {
            return;
        }

        initialized = true;

        console.log(
            "VYRO: Wallet system initializing..."
        );

        /*
         * Restore saved wallet state first.
         * This does NOT automatically open an
         * external wallet.
         */
        await restoreConnection();

        const connectWalletButton =
            document.getElementById(
                "phantom-wallet-btn"
            );

        if (connectWalletButton) {
            connectWalletButton.addEventListener(
                "click",
                async function (event) {
                    event.preventDefault();

                    await connect();
                }
            );
        }

        const disconnectWalletButton =
            document.getElementById(
                "disconnect-wallet-btn"
            );

        if (disconnectWalletButton) {
            disconnectWalletButton.addEventListener(
                "click",
                async function (event) {
                    event.preventDefault();

                    await disconnect();
                }
            );
        }

        const copyWalletButton =
            document.getElementById(
                "copy-wallet-address-btn"
            );

        if (copyWalletButton) {
            copyWalletButton.addEventListener(
                "click",
                async function (event) {
                    event.preventDefault();

                    await copyWalletAddress();
                }
            );
        }

        const selectWalletButton =
            document.getElementById(
                "select-wallet-btn"
            );

        if (selectWalletButton) {
            selectWalletButton.addEventListener(
                "click",
                function (event) {
                    event.preventDefault();

                    const wallet =
                        getActiveWallet();

                    if (wallet) {
                        setActiveWallet(
                            wallet.address
                        );
                    }
                }
            );
        }

        console.log(
            "VYRO: Wallet system initialized."
        );
    }

    /* ---------------------------------------------------------
       Public API
       --------------------------------------------------------- */

    window.VYROWallet = {
        init: init,

        connect: connect,

        disconnect: disconnect,

        restoreConnection:
            restoreConnection,

        getAddress: function () {
            return publicAddress;
        },

        isConnected: function () {
            return connected;
        },

        getConnectionState:
            function () {
                const activeWallet =
                    getActiveWallet();

                return {
                    connected:
                        connected,

                    hasWallet:
                        getWalletList()
                            .length > 0,

                    address:
                        activeWallet
                            ? activeWallet.address
                            : null,

                    provider:
                        activeWallet
                            ? activeWallet.provider
                            : null,

                    network:
                        activeWallet
                            ? activeWallet.network
                            : null
                };
            },

        getWalletType: function () {
            return walletType;
        },

        getProvider: function () {
            const activeWallet =
                getActiveWallet();

            if (!activeWallet) {
                return null;
            }

            return (
                activeWallet.provider ||
                "External Wallet"
            );
        },

        getNetwork: function () {
            const activeWallet =
                getActiveWallet();

            if (!activeWallet) {
                return null;
            }

            return (
                activeWallet.network ||
                "solana"
            );
        },

        getActiveAddress: function () {
            const activeWallet =
                getActiveWallet();

            if (!activeWallet) {
                return null;
            }

            return activeWallet.address;
        },

        hasWallet: function () {
            return (
                getWalletList().length > 0
            );
        },

        getWalletCount: function () {
            return getWalletList().length;
        },

        isActiveWallet: function (
            address
        ) {
            if (!address) {
                return false;
            }

            const activeWallet =
                getActiveWallet();

            return !!(
                activeWallet &&
                activeWallet.address ===
                    address
            );
        },

        getWallets: function () {
            return getWalletList();
        },

        getActiveWallet:
            function () {
                return getActiveWallet();
            },

        setActiveWallet:
            function (address) {
                return setActiveWallet(
                    address
                );
            },

        removeWallet:
            function (address) {
                return removeWalletFromList(
                    address
                );
            },

        signSolanaTransaction:
            signSolanaTransaction
    };

    /* ---------------------------------------------------------
       Startup
       --------------------------------------------------------- */

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
})();
