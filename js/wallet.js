// =========================================================
// VYRO — EXTERNAL WALLET SYSTEM
// =========================================================
// Non-custodial by design: this module only ever stores PUBLIC addresses.
// Keys never leave the user's wallet. Every transfer is signed inside the
// user's own wallet app, where they see and approve it.
//
// Vyro stays open in Chrome or another external browser.
// WalletConnect handles the handoff to the standalone wallet app.
// =========================================================
(function () {
    "use strict";

    const CFG = window.VYRO_CONFIG;
    const SOLANA_CHAIN = CFG.solana.chainId;

    let uid = null;
    let username = null;
    let wallets = [];
    let activeAddress = null;
    let receivingAddress = null;
    let wcClient = null;
    let wcSession = null;

    function isEvm(a) {
        return typeof a === "string" && /^0x[0-9a-fA-F]{40}$/.test(a);
    }

    function validAddress(a) {
        return VYROTransfer.isValidSolanaAddress(a) || isEvm(a);
    }

    const SOLANA_MAINNET_ID = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
    const SOLANA_LEGACY_ID = "solana:4sGjMW1sUnHzSxGspuhpqLDx6wiyjNtZ";

    function solanaChains() {
        return SOLANA_CHAIN === SOLANA_MAINNET_ID
            ? [SOLANA_MAINNET_ID, SOLANA_LEGACY_ID]
            : [SOLANA_CHAIN];
    }

    // ---------- provider registry ----------

    const adapters = {
        "trust-wallet": {
            label: "Trust Wallet",
            get: () => window.trustwallet && window.trustwallet.solana
        },
        "phantom": {
            label: "Phantom",
            get: () => window.phantom && window.phantom.solana
        },
        "backpack": {
            label: "Backpack",
            get: () => window.backpack && window.backpack.solana
        }
    };

    function providerName(type) {
        if (type === "walletconnect") return "WalletConnect";
        return (adapters[type] && adapters[type].label) || "External Wallet";
    }

    function injected(type) {
        const a = adapters[type];
        return a ? a.get() || null : null;
    }

    // ---------- per-user storage ----------

    function key(name) {
        return "vyro:" + uid + ":" + name;
    }

    function load() {
        wallets = [];
        activeAddress = null;

        if (!uid) return;

        try {
            const data = JSON.parse(localStorage.getItem(key("wallets")) || "[]");

            wallets = Array.isArray(data)
                ? data.filter(function (w) {
                    return w && validAddress(w.address);
                })
                : [];
        } catch (e) {
            wallets = [];
        }

        const saved = localStorage.getItem(key("active"));

        activeAddress =
            saved && wallets.some(function (w) {
                return w.address === saved;
            })
                ? saved
                : wallets[0]
                    ? wallets[0].address
                    : null;
    }

    function persist() {
        if (!uid) return;

        try {
            localStorage.setItem(key("wallets"), JSON.stringify(wallets));

            if (activeAddress) {
                localStorage.setItem(key("active"), activeAddress);
            } else {
                localStorage.removeItem(key("active"));
            }
        } catch (e) {
            console.warn("VYRO: could not persist wallets", e);
        }
    }

    // ---------- accessors ----------

    function getWallets() {
        return wallets.slice();
    }

    function getActiveWallet() {
        return wallets.find(function (w) {
            return w.address === activeAddress;
        }) || null;
    }

    function isConnected() {
        return wallets.length > 0;
    }

    function getAddress() {
        const a = getActiveWallet();
        return a ? a.address : null;
    }

    function getWalletType() {
        const a = getActiveWallet();
        return a ? a.type : null;
    }

    function getProvider() {
        const a = getActiveWallet();
        return a ? a.provider : null;
    }

    function getReceivingAddress() {
        return receivingAddress;
    }

    function getUsername() {
        return username;
    }

    // ---------- account lifecycle ----------

    function setUser(newUid) {
        if (newUid === uid) return;

        uid = newUid || null;
        username = null;
        receivingAddress = null;
        wcSession = null;

        load();
        updateUI();
        adoptPending();
    }

    async function setUsername(name) {
        username = name || null;
        receivingAddress = null;

        if (!username) {
            updateUI();
            return;
        }

        try {
            const snap = await firebaseDB.collection("usernames").doc(username).get();

            if (snap.exists) {
                receivingAddress = (snap.data() || {}).walletAddress || null;
            }
        } catch (e) {
            console.warn("VYRO: could not read receiving address", e);
        }

        updateUI();
        syncReceiving();
    }

    async function setReceivingWallet(address) {
        if (!username) {
            throw new Error("Your username is not loaded yet. Please try again.");
        }

        if (!wallets.some(function (w) {
            return w.address === address;
        })) {
            throw new Error("That wallet is not connected to VYRO.");
        }

        await firebaseDB.collection("usernames").doc(username).update({
            walletAddress: address
        });

        receivingAddress = address;
        updateUI();

        return address;
    }

    // ---------- receiving wallet synchronization ----------

    let lastSync = "";

    async function syncReceiving() {
        try {
            if (!username) return;

            const w = wallets.find(function (x) {
                return x.address === activeAddress;
            });

            if (!w) return;

            const syncKey = username + ":" + w.address;

            if (lastSync === syncKey) return;

            lastSync = syncKey;

            const ref = firebaseDB.collection("usernames").doc(username);
            const snap = await ref.get();

            if (!snap.exists) {
                lastSync = "";
                return;
            }

            const d = snap.data() || {};

            const cur = d.receive && typeof d.receive === "object"
                ? Object.assign({}, d.receive)
                : {};

            if (!d.receive && d.walletAddress) {
                cur.USDC = d.walletAddress;
                cur.SOL = d.walletAddress;
            }

            const next = Object.assign({}, cur);

            if (isEvm(w.address)) {
                next.ETH = w.address;
            } else {
                next.USDC = w.address;
                next.SOL = w.address;
            }

            const legacy = next.USDC || next.SOL || null;

            if (
                JSON.stringify(next) !== JSON.stringify(cur) ||
                (legacy && d.walletAddress !== legacy)
            ) {
                const upd = { receive: next };

                if (legacy) upd.walletAddress = legacy;

                await ref.update(upd);

                if (window.VYROCoins && VYROCoins.resetReceive) {
                    try {
                        VYROCoins.resetReceive();
                    } catch (e) {
                        // Optional.
                    }
                }
            }

            receivingAddress = legacy || receivingAddress;
            updateUI();

        } catch (e) {
            lastSync = "";
            console.warn("VYRO: could not update the payment address", e);
        }
    }

    // ---------- wallet list ----------

    function addWallet(address, type, provider) {
        if (!validAddress(address)) return null;

        let w = wallets.find(function (x) {
            return x.address === address;
        });

        if (!w) {
            w = {
                address: address,
                type: type || "external-wallet",
                provider: provider || providerName(type),
                network: isEvm(address) ? "ethereum" : "solana",
                chain: isEvm(address)
                    ? (CFG.ethereum && CFG.ethereum.chainId)
                    : SOLANA_CHAIN
            };

            wallets.push(w);

        } else {
            w.type = type || w.type;
            w.provider = provider || w.provider || providerName(w.type);
        }

        activeAddress = address;

        persist();
        updateUI();
        syncReceiving();

        return w;
    }

    async function removeWallet(address) {
        if (!address) return false;

        wallets = wallets.filter(function (w) {
            return w.address !== address;
        });

        if (activeAddress === address) {
            activeAddress = wallets[0] ? wallets[0].address : null;
        }

        persist();
        updateUI();

        return true;
    }

    function setActiveWallet(address) {
        if (!wallets.some(function (w) {
            return w.address === address;
        })) {
            return false;
        }

        activeAddress = address;

        persist();
        updateUI();
        syncReceiving();

        return true;
    }

    // ---------- UI ----------

    function setStatus(message) {
        const el = document.getElementById("wallet-connect-status");

        if (el) {
            el.textContent = message || "";
        }
    }

    function updateUI() {
        const list = document.getElementById("wallet-list");
        const noWallet = document.getElementById("no-wallet-connected");

        const rolesDraws = typeof window.renderWalletRoles === "function";

        if (noWallet) {
            noWallet.style.display = wallets.length === 0 ? "block" : "none";
        }

        if (list && !rolesDraws) {
            list.querySelectorAll(".wallet-card").forEach(function (x) {
                x.remove();
            });

            wallets.forEach(function (w) {
                const isActive = w.address === activeAddress;
                const isReceiving = w.address === receivingAddress;

                const card = document.createElement("div");

                card.className = "wallet-card" + (isActive ? " active" : "");

                card.innerHTML =
                    '<div class="wallet-card-top"><div><div class="wallet-card-provider"></div><div class="wallet-card-network">SOLANA</div></div>' +
                    '<span class="wallet-active-badge"></span></div>' +
                    '<div class="wallet-card-address"></div>' +
                    '<div class="wallet-card-actions">' +
                    '<button type="button" class="secondary-button wallet-select-button"></button>' +
                    '<button type="button" class="secondary-button wallet-receive-button"></button>' +
                    '<button type="button" class="secondary-button wallet-remove-button">REMOVE</button></div>';

                card.querySelector(".wallet-card-provider").textContent =
                    w.provider || providerName(w.type);

                card.querySelector(".wallet-card-address").textContent =
                    w.address;

                const badge = card.querySelector(".wallet-active-badge");

                badge.textContent = [
                    isActive ? "ACTIVE" : "",
                    isReceiving ? "RECEIVING" : ""
                ].filter(Boolean).join(" · ");

                badge.style.display = (isActive || isReceiving)
                    ? "inline-block"
                    : "none";

                const sel = card.querySelector(".wallet-select-button");

                sel.textContent = isActive ? "ACTIVE" : "USE THIS WALLET";
                sel.disabled = isActive;

                sel.addEventListener("click", function () {
                    setActiveWallet(w.address);
                });

                const rec = card.querySelector(".wallet-receive-button");

                rec.textContent = isReceiving ? "RECEIVING" : "RECEIVE HERE";
                rec.disabled = isReceiving || !username;

                rec.addEventListener("click", async function () {
                    rec.disabled = true;

                    try {
                        await setReceivingWallet(w.address);
                    } catch (e) {
                        alert(
                            "Could not update your receiving wallet: " +
                            (e.message || "please try again.")
                        );

                        updateUI();
                    }
                });

                card.querySelector(".wallet-remove-button").addEventListener(
                    "click",
                    async function () {
                        const msg = isReceiving
                            ? "This is your receiving wallet. People who send to @" +
                                username +
                                " will keep paying this address until you choose another. Remove it from VYRO anyway? Your funds are not affected."
                            : "Remove this wallet from VYRO? Your wallet funds are not affected.";

                        if (confirm(msg)) {
                            await removeWallet(w.address);
                        }
                    }
                );

                list.appendChild(card);
            });
        }

        if (rolesDraws) {
            try {
                window.renderWalletRoles();
            } catch (e) {
                console.warn(e);
            }
        }

        const active = getActiveWallet();

        const addr = document.getElementById("connected-wallet-address");

        if (addr) {
            addr.textContent = active
                ? active.address
                : "Wallet address will appear here.";
        }

        const prov = document.getElementById("connected-wallet-provider");

        if (prov) {
            prov.textContent = active
                ? active.provider
                : "External Wallet";
        }

        if (typeof window.populateWalletSelectors === "function") {
            try {
                window.populateWalletSelectors();
            } catch (e) {
                // Selectors may not be ready yet.
            }
        }
    }

    // ---------- connect: injected wallets ----------

    async function connectInjected(type) {
        const provider = injected(type);

        if (!provider || typeof provider.connect !== "function") {
            return null;
        }

        const result = await provider.connect();

        const pk = (result && result.publicKey) || provider.publicKey;

        const address = pk && pk.toString
            ? pk.toString()
            : null;

        if (!address) {
            throw new Error("The wallet did not return an address.");
        }

        return addWallet(address, type, providerName(type));
    }

    // ---------- connect: WalletConnect v2 ----------

    function resolveSignClient() {
        const ns =
            window["@walletconnect/sign-client"] ||
            window.SignClient;

        const candidates = [
            ns,
            ns && ns.SignClient,
            ns && ns.default
        ];

        for (let i = 0; i < candidates.length; i++) {
            if (
                candidates[i] &&
                typeof candidates[i].init === "function"
            ) {
                return candidates[i];
            }
        }

        return null;
    }

    async function ensureWcClient() {
        if (wcClient) return wcClient;

        const projectId = CFG.walletConnectProjectId;

        if (!projectId) return null;

        const SC = resolveSignClient();

        if (!SC) {
            throw new Error("WalletConnect library is unavailable.");
        }

        const backTo =
            window.location.origin +
            window.location.pathname;

        const metadata = Object.assign(
            {},
            CFG.walletConnectMetadata,
            {
                redirect: {
                    universal: backTo
                }
            }
        );

        wcClient = await SC.init({
            projectId: projectId,
            metadata: metadata
        });

        // When the customer returns from the wallet app, resume the
        // existing browser session and check for pending connections.

        document.addEventListener("visibilitychange", function () {
            if (
                document.visibilityState !== "visible" ||
                !wcClient
            ) {
                return;
            }

            adoptPending();

            try {
                const r = wcClient.core && wcClient.core.relayer;

                if (
                    r &&
                    typeof r.restartTransport === "function"
                ) {
                    r.restartTransport().catch(function () {
                        // Retried by the request flow.
                    });
                }
            } catch (e) {
                // Ignore.
            }
        });

        return wcClient;
    }

    function sessionAccounts(session) {
        const ns = (session && session.namespaces) || {};

        return [].concat(
            (ns.solana && ns.solana.accounts) || [],
            (ns.eip155 && ns.eip155.accounts) || []
        );
    }

    function wcSessionForAddress(address) {
        if (!wcClient) return null;

        const want = String(address).toLowerCase();

        const all = wcClient.session.getAll()
            .slice()
            .sort(function (a, b) {
                return (b.expiry || 0) - (a.expiry || 0);
            });

        for (let i = 0; i < all.length; i++) {
            if (
                sessionAccounts(all[i]).some(function (a) {
                    return a.split(":").pop().toLowerCase() === want;
                })
            ) {
                return all[i];
            }
        }

        return null;
    }

    function sessionSolanaChain(session) {
        const acc =
            session &&
            session.namespaces &&
            session.namespaces.solana &&
            session.namespaces.solana.accounts &&
            session.namespaces.solana.accounts[0];

        return acc
            ? acc.split(":").slice(0, 2).join(":")
            : SOLANA_CHAIN;
    }

    function isMobile() {
        return /android|iphone|ipad|ipod/i.test(navigator.userAgent);
    }

    // ---------- external wallet handoff ----------

    // This function only supplies an optional wallet-app link.
    // It never redirects the Vyro browser automatically.

    function walletAppLink(session) {
        const meta =
            session &&
            session.peer &&
            session.peer.metadata;

        if (!meta) return null;

        if (/trust/i.test(meta.name || "")) {
            return "trust://";
        }

        const redirect = meta.redirect;

        if (redirect && typeof redirect === "object") {
            const link = redirect.native || redirect.universal;

            if (
                typeof link === "string" &&
                link.trim()
            ) {
                return link;
            }
        }

        return null;
    }

    // A visible button lets the customer deliberately switch to
    // the standalone wallet app while keeping Vyro open in Chrome.

    function showOpenWalletButton(session) {
        if (!isMobile()) {
            return function () {};
        }

        const link = walletAppLink(session);

        const name =
            (
                session &&
                session.peer &&
                session.peer.metadata &&
                session.peer.metadata.name
            ) || "your wallet";

        const bar = document.createElement("div");

        bar.style.cssText =
            "position:fixed;left:12px;right:12px;bottom:14px;" +
            "z-index:99999;background:#0b1220;" +
            "border:2px solid #4ba3ff;border-radius:14px;" +
            "padding:12px;text-align:center;color:#fff;" +
            "font:600 15px system-ui,sans-serif;" +
            "box-shadow:0 6px 24px rgba(0,0,0,.6)";

        const heading = document.createElement("div");

        heading.textContent =
            "Payment request sent to " + name + ".";

        heading.style.marginBottom = "8px";

        bar.appendChild(heading);

        if (link) {
            const button = document.createElement("a");

            button.href = link;
            button.textContent =
                "OPEN " + name.toUpperCase();

            button.style.cssText =
                "display:block;background:#4ba3ff;" +
                "color:#031018;border-radius:999px;" +
                "padding:12px;text-decoration:none;" +
                "font-weight:800";

            bar.appendChild(button);

        } else {
            const instruction = document.createElement("div");

            instruction.textContent =
                "Open " + name +
                " manually and check for the pending WalletConnect request.";

            instruction.style.cssText =
                "font-size:13px;font-weight:400;";

            bar.appendChild(instruction);
        }

        const footer = document.createElement("div");

        footer.textContent =
            "Approve in your wallet app, then return to this browser tab. " +
            "Vyro will continue automatically.";

        footer.style.cssText =
            "font-weight:400;font-size:12px;" +
            "opacity:.75;margin-top:8px";

        bar.appendChild(footer);

        document.body.appendChild(bar);

        return function () {
            if (bar.parentNode) {
                bar.parentNode.removeChild(bar);
            }
        };
    }

    // ---------- WalletConnect connection ----------

    async function connectWalletConnect(deepLinkBase, label) {
        const client = await ensureWcClient();

        if (!client) return null;

        const solNs = {
            methods: [
                "solana_signTransaction",
                "solana_signMessage"
            ],
            chains: solanaChains(),
            events: []
        };

        const ethNs =
            CFG.ethereum && CFG.ethereum.chainId
                ? {
                    methods: ["eth_sendTransaction"],
                    chains: [CFG.ethereum.chainId],
                    events: []
                }
                : null;

        const connectParams = !deepLinkBase
            ? {
                optionalNamespaces: Object.assign(
                    { solana: solNs },
                    ethNs ? { eip155: ethNs } : {}
                )
            }
            : {
                requiredNamespaces: {
                    solana: {
                        methods: solNs.methods,
                        chains: [SOLANA_CHAIN],
                        events: []
                    }
                },
                optionalNamespaces: ethNs
                    ? { eip155: ethNs }
                    : {}
            };

        const res = await client.connect(connectParams);

        if (res.uri) {
            if (window.VYROWalletConnectUI) {
                setStatus(
                    "Use the WalletConnect panel to connect your wallet."
                );

                window.VYROWalletConnectUI.show(
                    res.uri,
                    label || "External Wallet"
                );

            } else {
                setStatus(
                    "Open your wallet app and approve the connection request."
                );

                console.info("VYRO WalletConnect URI:", res.uri);
            }
        }

        const knownTopics = client.session.getAll().map(function (s) {
            return s.topic;
        });

        savePending(label, knownTopics);

        let poller = null;

        const watcher = new Promise(function (resolve) {
            poller = setInterval(function () {
                const fresh = client.session.getAll().find(function (s) {
                    return (
                        knownTopics.indexOf(s.topic) === -1 &&
                        sessionAccounts(s).length
                    );
                });

                if (fresh) {
                    resolve(fresh);
                }
            }, 1500);
        });

        try {
            wcSession = await Promise.race([
                res.approval(),
                watcher
            ]);
        } finally {
            if (poller) {
                clearInterval(poller);
            }
        }

        const added = registerSession(wcSession, label);

        clearPending();

        return added;
    }

    // ---------- register approved session ----------

    function registerSession(session, label) {
        const nsAll = (session && session.namespaces) || {};

        const solAccount =
            nsAll.solana &&
            nsAll.solana.accounts &&
            nsAll.solana.accounts[0];

        const evmAccount =
            nsAll.eip155 &&
            nsAll.eip155.accounts &&
            nsAll.eip155.accounts[0];

        const solAddress = solAccount
            ? solAccount.split(":").pop()
            : null;

        const evmAddress = evmAccount
            ? evmAccount.split(":").pop()
            : null;

        const address = solAddress || evmAddress;

        if (!address) {
            throw new Error(
                "This wallet did not share a Solana or Ethereum account."
            );
        }

        const peer =
            session.peer &&
            session.peer.metadata &&
            session.peer.metadata.name;

        try {
            if (wcClient) {
                wcClient.session.getAll().forEach(function (s) {
                    if (
                        s.topic !== session.topic &&
                        sessionAccounts(s).some(function (a) {
                            return (
                                a.split(":").pop().toLowerCase() ===
                                address.toLowerCase()
                            );
                        })
                    ) {
                        wcClient.disconnect({
                            topic: s.topic,
                            reason: {
                                code: 6000,
                                message: "Replaced by a newer connection"
                            }
                        }).catch(function () {
                            // Already gone.
                        });
                    }
                });
            }
        } catch (e) {
            // Best effort.
        }

        const added = addWallet(
            address,
            "walletconnect",
            label || peer || "WalletConnect"
        );

        if (added && solAddress && evmAddress) {
            added.evmAddress = evmAddress;
            persist();
            updateUI();
        }

        return added;
    }

    // ---------- resume a connection after returning from wallet ----------

    const PENDING_KEY = "vyro:wc:pending";

    function savePending(label, known) {
        try {
            localStorage.setItem(
                PENDING_KEY,
                JSON.stringify({
                    uid: uid,
                    label: label || null,
                    t: Date.now(),
                    known: known
                })
            );
        } catch (e) {
            // Storage blocked.
        }
    }

    function clearPending() {
        try {
            localStorage.removeItem(PENDING_KEY);
        } catch (e) {
            // Ignore.
        }
    }

    function readPending() {
        try {
            const p = JSON.parse(
                localStorage.getItem(PENDING_KEY) || "null"
            );

            if (
                !p ||
                p.uid !== uid ||
                !p.t ||
                Date.now() - p.t > 15 * 60 * 1000
            ) {
                return null;
            }

            return p;

        } catch (e) {
            return null;
        }
    }

    let adopting = false;

    async function adoptPending() {
        if (
            adopting ||
            !uid ||
            !CFG.walletConnectProjectId
        ) {
            return;
        }

        let p = readPending();

        if (!p) return;

        adopting = true;

        try {
            const client = await ensureWcClient();

            if (!client) return;

            for (let i = 0; i < 12; i++) {
                p = readPending();

                if (!p) return;

                const fresh = client.session.getAll().filter(function (s) {
                    return (
                        (p.known || []).indexOf(s.topic) === -1 &&
                        sessionAccounts(s).length
                    );
                });

                if (fresh.length) {
                    wcSession = fresh[fresh.length - 1];

                    registerSession(wcSession, p.label);

                    clearPending();

                    setStatus("Wallet connected.");

                    showConnectedWallet();

                    return;
                }

                await new Promise(function (resolve) {
                    setTimeout(resolve, 1500);
                });
            }

        } catch (e) {
            console.warn(
                "VYRO: could not finish the wallet connection",
                e
            );

        } finally {
            adopting = false;
        }
    }

    // ---------- request timeout ----------

    function withAnswerTimeout(pending, client, session) {
        let timer;

        const limit = new Promise(function (_, reject) {
            timer = setTimeout(function () {
                let relay = "unknown";

                try {
                    const r = client.core && client.core.relayer;

                    relay = r && r.connected
                        ? "connected"
                        : "disconnected";

                } catch (e) {
                    // Ignore.
                }

                const meta =
                    session &&
                    session.peer &&
                    session.peer.metadata;

                const ageMin =
                    session && session.expiry
                        ? Math.round(
                            (session.expiry * 1000 - Date.now()) / 60000
                        )
                        : "?";

                reject(
                    new Error(
                        "Your wallet did not answer within 2 minutes. " +
                        "Open your external wallet app and check for the pending WalletConnect request. " +
                        "Then return to this browser. If no request appears, reconnect your wallet in Vyro. " +
                        "[wallet: " +
                        ((meta && meta.name) || "?") +
                        "; relay: " +
                        relay +
                        "; connection expires in " +
                        ageMin +
                        " min]"
                    )
                );
            }, 120000);
        });

        return Promise.race([
            pending,
            limit
        ]).finally(function () {
            clearTimeout(timer);
        });
    }

    // ---------- Ethereum signing request ----------

    async function wcRequest(address, chainId, request) {
        const client = await ensureWcClient();

        const session = client && wcSessionForAddress(address);

        if (!session) {
            throw new Error(
                "This WalletConnect session has expired. Remove the wallet and connect it again."
            );
        }

        const pendingRequest = client.request({
            topic: session.topic,
            chainId: chainId,
            request: request
        });

        // Do not redirect the browser.
        // Keep Vyro open and let the customer open their wallet manually.

        const hideButton = showOpenWalletButton(session);

        return withAnswerTimeout(
            pendingRequest,
            client,
            session
        ).finally(hideButton);
    }

    // ---------- connect ----------

    // type:
    // "trust-wallet" | "phantom" | "backpack" | "walletconnect"

    async function connect(type, label) {
        type = type || "trust-wallet";

        setStatus("Connecting…");

        try {
            let w = null;

            if (type === "walletconnect") {
                if (!CFG.walletConnectProjectId) {
                    throw new Error(
                        "WalletConnect is not configured yet (missing project ID)."
                    );
                }

                w = await connectWalletConnect(
                    null,
                    label || "External Wallet"
                );

            } else if (injected(type)) {
                w = await connectInjected(type);

            } else if (
                type === "trust-wallet" ||
                type === "phantom" ||
                type === "backpack"
            ) {
                if (!CFG.walletConnectProjectId) {
                    throw new Error(
                        "WalletConnect is not configured. " +
                        "Please enable WalletConnect in js/config.js."
                    );
                }

                // Connect from the external browser.
                // The WalletConnect panel provides the connection request.
                w = await connectWalletConnect(
                    null,
                    providerName(type)
                );

            } else if (CFG.walletConnectProjectId) {
                w = await connectWalletConnect(
                    null,
                    providerName(type)
                );

            } else {
                throw new Error(
                    providerName(type) +
                    " was not detected. Enable WalletConnect to connect from an external browser."
                );
            }

            if (!w) {
                throw new Error(
                    "Wallet connection was not completed."
                );
            }

            setStatus("Wallet connected.");

            showConnectedWallet();

            return w;

        } catch (error) {
            console.error(
                "VYRO WALLET CONNECT ERROR:",
                error
            );

            clearPending();

            const msg = isUserRejection(error)
                ? "Connection was declined in your wallet."
                : (error.message || "Wallet connection failed.");

            setStatus(msg);

            alert(msg);

            return null;
        }
    }

    // ---------- disconnect ----------

    async function disconnect() {
        const active = getActiveWallet();

        try {
            if (
                active &&
                active.type === "walletconnect" &&
                wcClient
            ) {
                const s = wcSessionForAddress(active.address);

                if (s) {
                    await wcClient.disconnect({
                        topic: s.topic,
                        reason: {
                            code: 6000,
                            message: "Disconnected by user"
                        }
                    });
                }

            } else if (active) {
                const p = injected(active.type);

                if (
                    p &&
                    typeof p.disconnect === "function"
                ) {
                    await p.disconnect();
                }
            }

        } catch (e) {
            // The wallet may already be disconnected.
        }

        if (active) {
            await removeWallet(active.address);
        }
    }

    // ---------- rejection detection ----------

    function isUserRejection(error) {
        const m = String(
            (
                error &&
                (
                    error.message ||
                    error.error && error.error.message
                )
            ) || ""
        );

        return (
            error &&
            (
                error.code === 4001 ||
                error.code === 5000 ||
                error.code === "ACTION_REJECTED"
            )
        ) || /reject|declin|denied|cancel/i.test(m);
    }

    // ---------- signing ----------

    // Vyro builds the unsigned transaction.
    // The USER'S wallet displays and signs it.
    //
    // Returns:
    // { signature }  wallet already broadcast it
    // { signedRaw }  Vyro broadcasts the signed bytes

    async function requestSignature(tx, expectedAddress) {
        const w = wallets.find(function (x) {
            return x.address === expectedAddress;
        });

        if (!w) {
            throw new Error(
                "That wallet is not connected to Vyro."
            );
        }

        if (w.type === "walletconnect") {
            const client = await ensureWcClient();

            const session =
                client &&
                wcSessionForAddress(expectedAddress);

            if (!session) {
                throw new Error(
                    "This WalletConnect session has expired. Remove the wallet and connect it again."
                );
            }

            const raw = tx.serialize({
                requireAllSignatures: false,
                verifySignatures: false
            });

            const pendingRequest = client.request({
                topic: session.topic,
                chainId: sessionSolanaChain(session),
                request: {
                    method: "solana_signTransaction",
                    params: {
                        transaction: VYROTransfer.bytesToBase64(raw)
                    }
                }
            });

            // IMPORTANT:
            // Do not redirect Chrome or navigate away from Vyro.
            // The customer opens the wallet using the visible button.
            // The pending request remains active while the customer approves.

            const hideButton = showOpenWalletButton(session);

            let result;

            try {
                result = await withAnswerTimeout(
                    pendingRequest,
                    client,
                    session
                ).finally(hideButton);

            } catch (e) {
                const m = String(
                    (
                        e &&
                        (
                            e.message ||
                            (e.error && e.error.message)
                        )
                    ) || ""
                );

                if (
                    /session propert|no matching|expired|session topic|not approved/i.test(m) &&
                    !isUserRejection(e)
                ) {
                    throw new Error(
                        "Your wallet says this connection is out of date. " +
                        "Open Wallets in Vyro, remove this wallet, connect it again, then retry. " +
                        "(Wallet message: " +
                        m.slice(0, 80) +
                        ")"
                    );
                }

                throw e;
            }

            if (result && result.transaction) {
                return {
                    signedRaw: VYROTransfer.base64ToBytes(
                        result.transaction
                    )
                };
            }

            if (result && result.signature) {
                tx.addSignature(
                    new solanaWeb3.PublicKey(expectedAddress),
                    solanaWeb3.Buffer
                        ? solanaWeb3.Buffer.from(
                            VYROTransfer.base58Decode(result.signature)
                        )
                        : VYROTransfer.base58Decode(result.signature)
                );

                return {
                    signedRaw: tx.serialize()
                };
            }

            throw new Error(
                "The wallet returned no signature."
            );
        }

        // ---------- injected wallet signing ----------

        const provider = injected(w.type);

        if (!provider) {
            throw new Error(
                w.provider +
                " is not available in this browser. " +
                "Reconnect using WalletConnect from your external browser."
            );
        }

        // Make sure the wallet is still on the account the user chose.

        try {
            if (
                !provider.publicKey &&
                typeof provider.connect === "function"
            ) {
                await provider.connect();
            }
        } catch (e) {
            // Surfaced below.
        }

        const current =
            provider.publicKey &&
            provider.publicKey.toString();

        if (
            current &&
            current !== expectedAddress
        ) {
            throw new Error(
                "Your wallet is now on a different account. Switch back to " +
                expectedAddress.slice(0, 6) +
                "…" +
                expectedAddress.slice(-4) +
                " in the wallet and try again."
            );
        }

        const preferSignOnly =
            w.type === "trust-wallet" &&
            typeof provider.signTransaction === "function";

        if (
            !preferSignOnly &&
            typeof provider.signAndSendTransaction === "function"
        ) {
            const r = await provider.signAndSendTransaction(tx);

            const sig =
                typeof r === "string"
                    ? r
                    : r && r.signature;

            if (!sig) {
                throw new Error(
                    "The wallet returned no signature."
                );
            }

            return {
                signature: sig
            };
        }

        if (typeof provider.signTransaction === "function") {
            const signed = await provider.signTransaction(tx);

            return {
                signedRaw: signed.serialize()
            };
        }

        throw new Error(
            w.provider + " does not support signing transactions."
        );
    }

    // ---------- restore ----------

    async function restoreConnection() {
        const active = getActiveWallet();

        if (
            active &&
            active.type === "walletconnect"
        ) {
            try {
                await ensureWcClient();
            } catch (e) {
                // Surfaced at sign time.
            }
        }

        updateUI();

        return active;
    }

    // ---------- connected wallet screen ----------

    function showConnectedWallet() {
        const screen = document.getElementById(
            "wallet-connected-screen"
        );

        if (
            screen &&
            typeof window.showScreen === "function"
        ) {
            window.showScreen(screen);
        }
    }

    // ---------- event binding ----------

    function bind() {
        document.querySelectorAll("[data-wallet-connect]").forEach(
            function (btn) {
                btn.addEventListener("click", function () {
                    connect(
                        btn.getAttribute("data-wallet-connect"),
                        btn.getAttribute("data-wallet-label")
                    );
                });
            }
        );

        const disconnectBtn = document.getElementById(
            "disconnect-wallet-btn"
        );

        if (disconnectBtn) {
            disconnectBtn.addEventListener(
                "click",
                async function () {
                    await disconnect();

                    if (typeof window.showScreen === "function") {
                        window.showScreen(
                            document.getElementById("wallets-screen")
                        );
                    }
                }
            );
        }
    }

    // ---------- initialization ----------

    function init() {
        bind();
        updateUI();
    }

    // ---------- public API ----------

    window.VYROWallet = {
        init,
        connect,
        disconnect,
        restoreConnection,

        setUser,
        setUsername,
        setReceivingWallet,
        getReceivingAddress,
        getUsername,

        getWallets,
        getActiveWallet,
        setActiveWallet,
        addWallet,
        removeWallet,

        getAddress,
        getActiveAddress: getAddress,
        isConnected,
        getWalletType,
        getProvider,

        requestSignature,
        wcRequest,
        isUserRejection,
        updateUI
    };

    if (document.readyState === "loading") {
        document.addEventListener(
            "DOMContentLoaded",
            init
        );
    } else {
        init();
    }

})();
