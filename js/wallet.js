// =========================================================
// VYRO WALLET SYSTEM
// MULTI-WALLET READY ARCHITECTURE
// V1: SOLANA
// =========================================================

(function () {

    "use strict";


    // =====================================================
    // CURRENT WALLET STATE
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

    const WALLET_LIST_KEY =
        "vyro_wallet_list";

    const ACTIVE_WALLET_KEY =
        "vyro_active_wallet";


    // =====================================================
    // SOLANA
    // =====================================================

    const SOLANA_CHAIN =
        "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";


    // =====================================================
    // GET WALLET LIST
    // =====================================================

    function getWalletList() {

        try {

            const saved =
                localStorage.getItem(
                    WALLET_LIST_KEY
                );


            if (!saved) {

                return [];

            }


            const wallets =
                JSON.parse(saved);


            if (!Array.isArray(wallets)) {

                return [];

            }


            return wallets;

        }

        catch (error) {

            console.error(
                "VYRO: Could not read wallet list:",
                error
            );

            return [];

        }

    }


    // =====================================================
    // SAVE WALLET LIST
    // =====================================================

    function saveWalletList(wallets) {

        try {

            localStorage.setItem(
                WALLET_LIST_KEY,
                JSON.stringify(wallets)
            );

            return true;

        }

        catch (error) {

            console.error(
                "VYRO: Could not save wallet list:",
                error
            );

            return false;

        }

    }


    // =====================================================
    // FIND SAVED WALLET
    // =====================================================

    function findSavedWallet(address) {

        if (!address) {

            return null;

        }


        const wallets =
            getWalletList();


        return (
            wallets.find(
                function (wallet) {

                    return (
                        wallet &&
                        wallet.address === address
                    );

                }
            ) || null
        );

    }


    // =====================================================
    // SAVE OR UPDATE WALLET
    // =====================================================

    function saveWalletToList(
        address,
        type,
        currentSession
    ) {

        if (!address) {

            return null;

        }


        const wallets =
            getWalletList();


        const existingIndex =
            wallets.findIndex(
                function (wallet) {

                    return (
                        wallet &&
                        wallet.address === address
                    );

                }
            );


        const existingWallet =
            existingIndex >= 0
                ? wallets[existingIndex]
                : null;


        const sessionTopic =
            currentSession &&
            currentSession.topic
                ? currentSession.topic
                : existingWallet &&
                  existingWallet.sessionTopic
                    ? existingWallet.sessionTopic
                    : null;


        const walletRecord = {

            id:
                address,

            address:
                address,

            type:
                type || "external",

            provider:
                type === "trust-wallet"
                    ? "Trust Wallet"
                    : type === "walletconnect"
                        ? "WalletConnect"
                        : "External Wallet",

            network:
                "solana",

            connectedAt:
                existingWallet &&
                existingWallet.connectedAt
                    ? existingWallet.connectedAt
                    : Date.now(),

            lastUsedAt:
                Date.now(),

            sessionTopic:
                sessionTopic

        };


        if (existingIndex >= 0) {

            wallets[existingIndex] =
                Object.assign(
                    {},
                    wallets[existingIndex],
                    walletRecord
                );

        }

        else {

            wallets.push(
                walletRecord
            );

        }


        saveWalletList(
            wallets
        );


        localStorage.setItem(
            ACTIVE_WALLET_KEY,
            address
        );


        return walletRecord;

    }


    // =====================================================
    // GET ACTIVE WALLET
    // =====================================================

    function getActiveWallet() {

        const activeAddress =
            localStorage.getItem(
                ACTIVE_WALLET_KEY
            );


        if (!activeAddress) {

            return null;

        }


        return findSavedWallet(
            activeAddress
        );

    }


    // =====================================================
    // FORMAT WALLET ADDRESS
    // =====================================================

    function formatWalletAddress(address) {

        if (!address) {

            return "Wallet address";

        }


        if (address.length <= 12) {

            return address;

        }


        return (
            address.substring(0, 6) +
            "..." +
            address.substring(
                address.length - 6
            )
        );

    }


    // =====================================================
    // UPDATE WALLETS SCREEN
    // =====================================================

    function updateWalletScreen(
        wallet
    ) {

        const noWalletCard =
            document.getElementById(
                "no-wallet-card"
            );

        const noWalletConnected =
            document.getElementById(
                "no-wallet-connected"
            );

        const savedWalletCard =
            document.getElementById(
                "saved-wallet-card"
            );

        const savedWalletSelected =
            document.getElementById(
                "saved-wallet-selected"
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

        const selectWalletButton =
            document.getElementById(
                "select-wallet-btn"
            );

        const additionalWallets =
            document.getElementById(
                "additional-wallets"
            );


        const wallets =
            getWalletList();


        // =================================================
        // NO SAVED WALLETS
        // =================================================

        if (!wallets.length) {

            if (noWalletCard) {

                noWalletCard.style.display =
                    "block";

            }

            if (noWalletConnected) {

                noWalletConnected.style.display =
                    "block";

            }

            if (savedWalletCard) {

                savedWalletCard.style.display =
                    "none";

            }

            if (savedWalletSelected) {

                savedWalletSelected.style.display =
                    "none";

            }

            if (selectWalletButton) {

                selectWalletButton.style.display =
                    "block";

            }

            if (additionalWallets) {

                additionalWallets.innerHTML =
                    "";

            }

            return;

        }


        // =================================================
        // WALLETS EXIST
        // =================================================

        if (noWalletCard) {

            noWalletCard.style.display =
                "block";

        }


        if (noWalletConnected) {

            noWalletConnected.style.display =
                "none";

        }


        const activeWallet =
            wallet ||
            getActiveWallet();


        // =================================================
        // DISPLAY ACTIVE WALLET
        // =================================================

        if (
            activeWallet &&
            savedWalletCard
        ) {

            savedWalletCard.style.display =
                "block";


            if (savedWalletProvider) {

                savedWalletProvider.textContent =
                    activeWallet.provider ||
                    "External Wallet";

            }


            if (savedWalletNetwork) {

                savedWalletNetwork.textContent =
                    String(
                        activeWallet.network ||
                        "solana"
                    ).toUpperCase();

            }


            if (savedWalletAddress) {

                savedWalletAddress.textContent =
                    formatWalletAddress(
                        activeWallet.address
                    );

                savedWalletAddress.dataset.fullAddress =
                    activeWallet.address;

            }


            if (savedWalletSelected) {

                savedWalletSelected.style.display =
                    "inline-block";

            }


            if (selectWalletButton) {

                selectWalletButton.style.display =
                    "none";

            }

        }


        // =================================================
        // RENDER OTHER SAVED WALLETS
        // =================================================

        if (additionalWallets) {

            additionalWallets.innerHTML =
                "";


            wallets.forEach(
                function (savedWallet) {

                    if (!savedWallet) {

                        return;

                    }


                    if (
                        activeWallet &&
                        savedWallet.address ===
                            activeWallet.address
                    ) {

                        return;

                    }


                    const walletCard =
                        document.createElement(
                            "div"
                        );


                    walletCard.className =
                        "auth-card wallet-card";


                    const provider =
                        savedWallet.provider ||
                        "External Wallet";


                    const network =
                        String(
                            savedWallet.network ||
                            "solana"
                        ).toUpperCase();


                    walletCard.innerHTML =

                        '<div class="wallet-card-header">' +

                            '<div>' +

                                '<div class="auth-card-title">' +
                                    'SAVED WALLET' +
                                '</div>' +

                                '<p class="auth-card-text">' +
                                    provider +
                                '</p>' +

                            '</div>' +

                        '</div>' +

                        '<p class="auth-card-text">' +
                            network +
                        '</p>' +

                        '<p class="auth-card-text wallet-address-display">' +
                            formatWalletAddress(
                                savedWallet.address
                            ) +
                        '</p>' +

                        '<button ' +
                            'class="primary-button wallet-select-dynamic" ' +
                            'type="button" ' +
                            'data-wallet-address="' +
                                savedWallet.address +
                            '">' +
                            'USE THIS WALLET' +
                        '</button>';


                    additionalWallets.appendChild(
                        walletCard
                    );

                }
            );


            const walletButtons =
                additionalWallets.querySelectorAll(
                    ".wallet-select-dynamic"
                );


            walletButtons.forEach(
                function (button) {

                    button.addEventListener(
                        "click",
                        function () {

                            const address =
                                button.dataset.walletAddress;


                            if (
                                address &&
                                setActiveWallet(
                                    address
                                )
                            {

                                const selected =
                                    getActiveWallet();


                                updateWalletScreen(
                                    selected
                                );

                            }

                        }
                    );

                }
            );

        }

    }


    // =====================================================
    // SET ACTIVE WALLET
    // =====================================================

    function setActiveWallet(
        address
    ) {

        if (!address) {

            return false;

        }


        const wallet =
            findSavedWallet(
                address
            );


        if (!wallet) {

            return false;

        }


        if (!wallet.address) {

            return false;

        }


        if (
            wallet.network &&
            wallet.network !== "solana"
        ) {

            console.warn(
                "VYRO: Unsupported wallet network:",
                wallet.network
            );

            return false;

        }


        wallet.lastUsedAt =
            Date.now();


        const wallets =
            getWalletList();


        const index =
            wallets.findIndex(
                function (item) {

                    return (
                        item &&
                        item.address === address
                    );

                }
            );


        if (index >= 0) {

            wallets[index] =
                wallet;

            saveWalletList(
                wallets
            );

        }


        localStorage.setItem(
            ACTIVE_WALLET_KEY,
            address
        );


        // =================================================
        // UPDATE CURRENT STATE
        // =================================================

        publicAddress =
            wallet.address;

        walletType =
            wallet.type;

        connected =
            true;


        // =================================================
        // RESTORE WALLETCONNECT SESSION
        // =================================================

        if (
            signClient &&
            wallet.sessionTopic
        ) {

            try {

                const savedSession =
                    signClient.session.get(
                        wallet.sessionTopic
                    );


                if (savedSession) {

                    session =
                        savedSession;

                }

            }

            catch (error) {

                console.log(
                    "VYRO: Could not restore WalletConnect session:",
                    error
                );

            }

        }


        updateWalletScreen(
            wallet
        );


        return true;

    }


    // =====================================================
    // REMOVE WALLET
    // =====================================================

    function removeWalletFromList(
        address
    ) {

        if (!address) {

            return false;

        }


        const wallets =
            getWalletList();


        const removedWallet =
            findSavedWallet(
                address
            );


        const updatedWallets =
            wallets.filter(
                function (wallet) {

                    return (
                        wallet &&
                        wallet.address !== address
                    );

                }
            );


        saveWalletList(
            updatedWallets
        );


        const activeAddress =
            localStorage.getItem(
                ACTIVE_WALLET_KEY
            );


        if (
            activeAddress !== address
        ) {

            return true;

        }


        session =
            null;


        // =================================================
        // SELECT NEXT SAVED WALLET
        // =================================================

        if (updatedWallets.length) {

            const nextWallet =
                updatedWallets[0];


            if (
                nextWallet &&
                nextWallet.address
            ) {

                nextWallet.lastUsedAt =
                    Date.now();


                const nextWallets =
                    updatedWallets.map(
                        function (wallet) {

                            if (
                                wallet.address ===
                                nextWallet.address
                            ) {

                                return nextWallet;

                            }

                            return wallet;

                        }
                    );


                saveWalletList(
                    nextWallets
                );


                localStorage.setItem(
                    ACTIVE_WALLET_KEY,
                    nextWallet.address
                );


                publicAddress =
                    nextWallet.address;

                walletType =
                    nextWallet.type;

                connected =
                    true;


                updateWalletScreen(
                    nextWallet
                );


                return true;

            }

        }


        // =================================================
        // NO WALLETS REMAIN
        // =================================================

        localStorage.removeItem(
            ACTIVE_WALLET_KEY
        );


        connected =
            false;

        publicAddress =
            null;

        walletType =
            null;


        clearLegacyWalletState();


        updateWalletScreen(
            null
        );


        return true;

    }


    // =====================================================
    // LEGACY WALLET STATE
    // =====================================================

    function clearLegacyWalletState() {

        localStorage.removeItem(
            ADDRESS_KEY
        );

        localStorage.removeItem(
            WALLET_TYPE_KEY
        );

    }


    // =====================================================
    // GET ADDRESS FROM WALLETCONNECT SESSION
    // =====================================================

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


        if (parts.length >= 3) {

            return parts[2];

        }


        return null;

    }


    // =====================================================
    // INITIALIZE WALLETCONNECT CLIENT
    // =====================================================

    async function initializeWalletConnect() {

        if (signClient) {

            return signClient;

        }


        if (
            typeof SignClient ===
            "undefined"
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
                "VYRO: WalletConnect project ID is not configured."
            );

            return null;

        }


        try {

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

                        icons:
                            []

                    }

                });


            return signClient;

        }

        catch (error) {

            console.error(
                "VYRO: WalletConnect initialization error:",
                error
            );

            signClient =
                null;

            return null;

        }

    }


    // =====================================================
    // SAVE CONNECTED WALLET
    // =====================================================

    function setConnectedWallet(
        address,
        type,
        currentSession
    ) {

        if (!address) {

            return false;

        }


        connected =
            true;

        publicAddress =
            address;

        walletType =
            type || "external";

        session =
            currentSession || null;


        saveWalletToList(
            address,
            walletType,
            currentSession
        );


        setActiveWallet(
            address
        );


        localStorage.setItem(
            ADDRESS_KEY,
            address
        );

        localStorage.setItem(
            WALLET_TYPE_KEY,
            walletType
        );


        const wallet =
            findSavedWallet(
                address
            );


        updateWalletScreen(
            wallet
        );


        return true;

    }


    // =====================================================
    // CLEAR CURRENT WALLET STATE
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


        clearLegacyWalletState();


        updateWalletScreen(
            null
        );

    }


    // =====================================================
    // SHOW CONNECTED WALLET SCREEN
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

            providerElement.textContent =
                walletType === "trust-wallet"
                    ? "Trust Wallet"
                    : walletType === "walletconnect"
                        ? "WalletConnect"
                        : "External Wallet";

        }


        if (addressElement) {

            addressElement.textContent =
                address || "";

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


    // =====================================================
    // CONNECT WALLET
    // =====================================================

    async function connect() {

        console.log(
            "VYRO: Starting wallet connection..."
        );


        // =================================================
        // TRUST WALLET INJECTED PROVIDER
        // =================================================

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


        // =================================================
        // WALLETCONNECT FALLBACK
        // =================================================

        try {

            console.log(
                "VYRO: Starting WalletConnect..."
            );


            const client =
                await initializeWalletConnect();


            if (!client) {

                throw new Error(
                    "WalletConnect SignClient is not available."
                );

            }


            const connection =
                await client.connect({

                    requiredNamespaces: {

                        solana: {

                            chains: [
                                SOLANA_CHAIN
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


            const trustWalletUrl =
                "https://link.trustwallet.com/wc?uri=" +
                encodeURIComponent(
                    uri
                );


            window.open(
                trustWalletUrl,
                "_blank",
                "noreferrer noopener"
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


    // =====================================================
    // DISCONNECT ACTIVE WALLET
    // =====================================================

    async function disconnect() {

        const activeWallet =
            getActiveWallet();


        // =================================================
        // DISCONNECT WALLETCONNECT SESSION
        // =================================================

        if (
            signClient &&
            session &&
            session.topic
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


        // =================================================
        // REMOVE ACTIVE WALLET
        // =================================================

        if (
            activeWallet &&
            activeWallet.address
        ) {

            removeWalletFromList(
                activeWallet.address
            );

        }

        else {

            clearWalletState();

        }


        return true;

    }


    // =====================================================
    // RESTORE TRUST WALLET
    // =====================================================

    async function restoreTrustWallet() {

        if (
            !window.trustwallet ||
            !window.trustwallet.solana
        ) {

            return null;

        }


        try {

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

        catch (error) {

            console.log(
                "VYRO: No silent Trust Wallet connection available."
            );

        }


        return null;

    }


    // =====================================================
    // RESTORE WALLETCONNECT SESSION
    // =====================================================

    async function restoreWalletConnectSession(
        wallet
    ) {

        if (!wallet) {

            return null;

        }


        const client =
            await initializeWalletConnect();


        if (!client) {

            return null;

        }


        try {

            const sessions =
                client.session.getAll();


            for (
                let i = 0;
                i < sessions.length;
                i++
            ) {

                const savedSession =
                    sessions[i];


                const address =
                    getAddressFromSession(
                        savedSession
                    );


                if (
                    address &&
                    address === wallet.address
                ) {

                    session =
                        savedSession;


                    if (
                        !wallet.sessionTopic ||
                        wallet.sessionTopic !==
                            savedSession.topic
                    ) {

                        wallet.sessionTopic =
                            savedSession.topic;


                        const wallets =
                            getWalletList();


                        const index =
                            wallets.findIndex(
                                function (item) {

                                    return (
                                        item &&
                                        item.address ===
                                            wallet.address
                                    );

                                }
                            );


                        if (index >= 0) {

                            wallets[index] =
                                wallet;

                            saveWalletList(
                                wallets
                            );

                        }

                    }


                    return savedSession;

                }

            }

        }

        catch (error) {

            console.log(
                "VYRO: Could not restore WalletConnect session:",
                error
            );

        }


        return null;

    }


    // =====================================================
    // RESTORE WALLET CONNECTION
    // =====================================================

    async function restoreConnection() {

        // =================================================
        // FIRST: TRUST WALLET SILENT RESTORE
        // =================================================

        const trustAddress =
            await restoreTrustWallet();


        if (trustAddress) {

            return trustAddress;

        }


        // =================================================
        // READ SAVED WALLET LIST
        // =================================================

        const savedWallets =
            getWalletList();


        let activeWallet =
            getActiveWallet();


        // =================================================
        // LEGACY SINGLE-WALLET MIGRATION
        // =================================================

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
            savedWalletType &&
            !findSavedWallet(
                savedAddress
            )
        ) {

            saveWalletToList(
                savedAddress,
                savedWalletType,
                null
            );


            console.log(
                "VYRO: Existing wallet migrated to wallet list."
            );


            activeWallet =
                getActiveWallet();

        }


        // =================================================
        // RESTORE ACTIVE WALLET
        // =================================================

        if (
            activeWallet &&
            activeWallet.address
        ) {

            publicAddress =
                activeWallet.address;

            walletType =
                activeWallet.type;

            connected =
                true;


            localStorage.setItem(
                ACTIVE_WALLET_KEY,
                activeWallet.address
            );


            if (
                activeWallet.type ===
                "walletconnect"
            ) {

                await restoreWalletConnectSession(
                    activeWallet
                );

            }


            updateWalletScreen(
                activeWallet
            );


            console.log(
                "VYRO: Active wallet restored from wallet list."
            );


            return activeWallet.address;

        }


        // =================================================
        // FALLBACK TO LEGACY STORAGE
        // =================================================

        if (
            savedAddress &&
            savedWalletType
        ) {

            const migratedWallet =
                findSavedWallet(
                    savedAddress
                );


            if (migratedWallet) {

                publicAddress =
                    migratedWallet.address;

                walletType =
                    migratedWallet.type;

                connected =
                    true;


                localStorage.setItem(
                    ACTIVE_WALLET_KEY,
                    migratedWallet.address
                );


                updateWalletScreen(
                    migratedWallet
                );


                return migratedWallet.address;

            }


            const legacyWallet = {

                id:
                    savedAddress,

                address:
                    savedAddress,

                type:
                    savedWalletType,

                provider:
                    savedWalletType ===
                        "trust-wallet"
                        ? "Trust Wallet"
                        : savedWalletType ===
                            "walletconnect"
                            ? "WalletConnect"
                            : "External Wallet",

                network:
                    "solana",

                connectedAt:
                    Date.now(),

                lastUsedAt:
                    Date.now(),

                sessionTopic:
                    null

            };


            saveWalletToList(
                savedAddress,
                savedWalletType,
                null
            );


            localStorage.setItem(
                ACTIVE_WALLET_KEY,
                savedAddress
            );


            publicAddress =
                legacyWallet.address;

            walletType =
                legacyWallet.type;

            connected =
                true;


            updateWalletScreen(
                legacyWallet
            );


            console.log(
                "VYRO: Legacy saved wallet migrated."
            );


            return savedAddress;

        }


        // =================================================
        // NO WALLET
        // =================================================

        if (!savedWallets.length) {

            clearWalletState();

        }


        return null;

    }


    // =====================================================
    // COPY WALLET ADDRESS
    // =====================================================

    function copyWalletAddress() {

        const addressElement =
            document.getElementById(
                "saved-wallet-address"
            );


        if (
            !addressElement ||
            !addressElement.dataset.fullAddress
        ) {

            return;

        }


        const fullAddress =
            addressElement.dataset.fullAddress;


        if (
            navigator.clipboard &&
            navigator.clipboard.writeText
        ) {

            navigator.clipboard.writeText(
                fullAddress
            ).then(
                function () {

                    const button =
                        document.getElementById(
                            "copy-wallet-address-btn"
                        );


                    if (button) {

                        button.textContent =
                            "COPIED";


                        setTimeout(
                            function () {

                                button.textContent =
                                    "COPY ADDRESS";

                            },
                            1500
                        );

                    }

                }
            ).catch(
                function (error) {

                    console.error(
                        "VYRO: Could not copy wallet address:",
                        error
                    );

                }
            );

        }

    }


    // =====================================================
    // EXTERNAL WALLET SIGNING BRIDGE
    // STAGE 4
    // =====================================================
    //
    // IMPORTANT:
    // VYRO NEVER SIGNS TRANSACTIONS ITSELF.
    //
    // The connected external wallet owns the private key
    // and performs the actual signing.
    // =====================================================

    async function signSolanaTransaction(
        transaction
    ) {

        if (!transaction) {

            throw new Error(
                "No Solana transaction was provided."
            );

        }


        if (!connected) {

            throw new Error(
                "No wallet is connected."
            );

        }


        // =================================================
        // TRUST WALLET
        // =================================================

        if (
            walletType === "trust-wallet" &&
            window.trustwallet &&
            window.trustwallet.solana
        ) {

            const trustWallet =
                window.trustwallet.solana;


            const signFeature =
                trustWallet.features &&
                (
                    trustWallet.features[
                        "solana:signTransaction"
                    ] ||
                    trustWallet.features[
                        "standard:signTransaction"
                    ]
                );


            if (
                signFeature &&
                typeof signFeature.signTransaction ===
                    "function"
            ) {

                return await signFeature.signTransaction(
                    transaction
                );

            }


            throw new Error(
                "The connected Trust Wallet does not currently expose Solana transaction signing."
            );

        }


        // =================================================
        // WALLETCONNECT
        // =================================================

        if (
            walletType === "walletconnect"
        ) {

            if (!signClient) {

                await initializeWalletConnect();

            }


            if (!signClient) {

                throw new Error(
                    "WalletConnect is not available."
                );

            }


            if (!session) {

                throw new Error(
                    "The WalletConnect wallet session is unavailable."
                );

            }


            return await signClient.request({

                topic:
                    session.topic,

                chainId:
                    SOLANA_CHAIN,

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


        // =================================================
        // UNSUPPORTED WALLET
        // =================================================

        throw new Error(
            "This wallet does not currently support Solana transaction signing through VYRO."
        );

    }


    // =====================================================
    // INITIALIZE VYRO WALLET SYSTEM
    // =====================================================

    async function init() {

        if (initialized) {

            return;

        }


        initialized =
            true;


        console.log(
            "VYRO: Wallet system initializing..."
        );


        // =================================================
        // RESTORE SAVED WALLET
        // =================================================

        try {

            await restoreConnection();

        }

        catch (error) {

            console.error(
                "VYRO: Wallet restore error:",
                error
            );

        }


        // =================================================
        // CONNECT WALLET BUTTON
        // =================================================

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


        // =================================================
        // DISCONNECT WALLET BUTTON
        // =================================================

        const disconnectWalletButton =
            document.getElementById(
                "disconnect-wallet-btn"
            );


        if (disconnectWalletButton) {

            disconnectWalletButton.addEventListener(
                "click",
                async function () {

                    try {

                        await disconnect();

                    }

                    catch (error) {

                        console.error(
                            "VYRO: Wallet disconnect failed:",
                            error
                        );

                    }


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


        // =================================================
        // COPY ADDRESS BUTTON
        // =================================================

        const copyWalletAddressButton =
            document.getElementById(
                "copy-wallet-address-btn"
            );


        if (copyWalletAddressButton) {

            copyWalletAddressButton.addEventListener(
                "click",
                copyWalletAddress
            );

        }


        console.log(
            "VYRO: Wallet system initialized."
        );

    }


    // =====================================================
    // PUBLIC VYRO WALLET API
    // =====================================================

    window.VYROWallet = {

        init:
            init,


        connect:
            connect,


        signSolanaTransaction:
            signSolanaTransaction,


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


        getConnectionState:
            function () {

                const activeWallet =
                    getActiveWallet();


                return {

                    connected:
                        connected,

                    hasWallet:
                        getWalletList().length > 0,

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


        getWalletType:
            function () {

                return walletType;

            },


        getProvider:
            function () {

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


        getNetwork:
            function () {

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


        getActiveAddress:
            function () {

                const activeWallet =
                    getActiveWallet();


                if (!activeWallet) {

                    return null;

                }


                return (
                    activeWallet.address ||
                    null
                );

            },


        hasWallet:
            function () {

                return (
                    getWalletList().length > 0
                );

            },


        getWalletCount:
            function () {

                return (
                    getWalletList().length
                );

            },


        isActiveWallet:
            function (address) {

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


        getWallets:
            function () {

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

            }

    };


    // =====================================================
    // START WALLET SYSTEM
    // =====================================================

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

    }

    else {

        VYROWallet.init();

    }


})();
