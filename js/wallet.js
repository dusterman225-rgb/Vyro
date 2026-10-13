// =========================================================
// VYRO — EXTERNAL WALLET SYSTEM
// =========================================================
// Non-custodial by design: this module only ever stores PUBLIC addresses.
// Keys never leave the user's wallet. Every transfer is signed inside the
// user's own wallet app, where they see and approve it.
//
// Providers: injected Solana wallets (Trust Wallet, Phantom, Solflare, Backpack)
// and WalletConnect v2 (any wallet that supports the Solana namespace).
// Adding a wallet = add one entry to `adapters` below.
// =========================================================
(function () {
    "use strict";

    const CFG = window.VYRO_CONFIG;
    const SOLANA_CHAIN = CFG.solana.chainId;

    let uid = null;            // signed-in Firebase user (storage is scoped per user)
    let username = null;
    let wallets = [];
    let activeAddress = null;
    let receivingAddress = null;   // the address published for "send to @username"
    let wcClient = null;
    let wcSession = null;

    // ---------- provider registry ----------
    const adapters = {
        "trust-wallet": { label: "Trust Wallet", get: () => window.trustwallet && window.trustwallet.solana },
        "phantom":      { label: "Phantom",      get: () => window.phantom && window.phantom.solana },
        "solflare":     { label: "Solflare",     get: () => window.solflare },
        "backpack":     { label: "Backpack",     get: () => window.backpack && window.backpack.solana }
    };

    function providerName(type) {
        if (type === "walletconnect") return "WalletConnect";
        return (adapters[type] && adapters[type].label) || "External Wallet";
    }
    function injected(type) {
        const a = adapters[type];
        return a ? a.get() || null : null;
    }

    // ---------- per-user storage (public addresses only) ----------
    function key(name) { return "vyro:" + uid + ":" + name; }

    function load() {
        wallets = []; activeAddress = null;
        if (!uid) return;
        try {
            const data = JSON.parse(localStorage.getItem(key("wallets")) || "[]");
            wallets = Array.isArray(data) ? data.filter(function (w) { return w && VYROTransfer.isValidSolanaAddress(w.address); }) : [];
        } catch (e) { wallets = []; }
        const saved = localStorage.getItem(key("active"));
        activeAddress = (saved && wallets.some(function (w) { return w.address === saved; })) ? saved : (wallets[0] ? wallets[0].address : null);
    }
    function persist() {
        if (!uid) return;
        try {
            localStorage.setItem(key("wallets"), JSON.stringify(wallets));
            if (activeAddress) localStorage.setItem(key("active"), activeAddress); else localStorage.removeItem(key("active"));
        } catch (e) { console.warn("VYRO: could not persist wallets", e); }
    }

    // ---------- accessors ----------
    function getWallets() { return wallets.slice(); }
    function getActiveWallet() { return wallets.find(function (w) { return w.address === activeAddress; }) || null; }
    function isConnected() { return wallets.length > 0; }
    function getAddress() { const a = getActiveWallet(); return a ? a.address : null; }
    function getWalletType() { const a = getActiveWallet(); return a ? a.type : null; }
    function getProvider() { const a = getActiveWallet(); return a ? a.provider : null; }
    function getReceivingAddress() { return receivingAddress; }
        function getUsername() { return username; }

    // ---------- account lifecycle (called by auth.js) ----------
    function setUser(newUid) {
        if (newUid === uid) return;
        uid = newUid || null;
        username = null; receivingAddress = null;
        wcSession = null;
        load();
        updateUI();
        if (uid) adoptPendingSession().catch(function (e) { console.warn("VYRO: could not restore WalletConnect session", e); });
    }

    // Reads the address this user has published to the username directory.
    async function setUsername(name) {
        username = name || null;
        receivingAddress = null;
        if (!username) { updateUI(); return; }
        try {
            const snap = await firebaseDB.collection("usernames").doc(username).get();
            if (snap.exists) receivingAddress = (snap.data() || {}).walletAddress || null;
        } catch (e) { console.warn("VYRO: could not read receiving address", e); }
        updateUI();
    }

    // Publishes the PUBLIC address that other VYRO users will pay when they send to @username.
    async function setReceivingWallet(address) {
        if (!username) throw new Error("Your username is not loaded yet. Please try again.");
        if (!wallets.some(function (w) { return w.address === address; })) throw new Error("That wallet is not connected to VYRO.");
        await firebaseDB.collection("usernames").doc(username).update({ walletAddress: address });
        receivingAddress = address;
        updateUI();
        return address;
    }

    // ---------- wallet list ----------
    function addWallet(address, type, provider) {
        if (!VYROTransfer.isValidSolanaAddress(address)) return null;
        let w = wallets.find(function (x) { return x.address === address; });
        const isFirst = wallets.length === 0;
        if (!w) {
            w = { address: address, type: type || "external-wallet", provider: provider || providerName(type), network: "solana", chain: SOLANA_CHAIN };
            wallets.push(w);
        } else {
            w.type = type || w.type;
            w.provider = provider || w.provider || providerName(w.type);
        }
        activeAddress = address;
        persist(); updateUI();
        // First wallet becomes the receiving wallet automatically; the user can change it later.
        if (isFirst && !receivingAddress && username) {
            setReceivingWallet(address).catch(function (e) { console.warn("VYRO: auto-publish receiving wallet failed", e); });
        }
        return w;
    }

    async function removeWallet(address) {
        if (!address) return false;
        wallets = wallets.filter(function (w) { return w.address !== address; });
        if (activeAddress === address) activeAddress = wallets[0] ? wallets[0].address : null;
        persist(); updateUI();
        return true;
    }

    function setActiveWallet(address) {
        if (!wallets.some(function (w) { return w.address === address; })) return false;
        activeAddress = address;
        persist(); updateUI();
        return true;
    }

    // ---------- UI ----------
    function setStatus(message) {
        const el = document.getElementById("wallet-connect-status");
        if (el) el.textContent = message || "";
    }

    function updateUI() {
        const list = document.getElementById("wallet-list");
        const noWallet = document.getElementById("no-wallet-connected");
        if (list) {
            list.querySelectorAll(".wallet-card").forEach(function (x) { x.remove(); });
            if (noWallet) noWallet.style.display = wallets.length === 0 ? "block" : "none";
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
                card.querySelector(".wallet-card-provider").textContent = w.provider || providerName(w.type);
                card.querySelector(".wallet-card-address").textContent = w.address;
                const badge = card.querySelector(".wallet-active-badge");
                badge.textContent = [isActive ? "ACTIVE" : "", isReceiving ? "RECEIVING" : ""].filter(Boolean).join(" · ");
                badge.style.display = (isActive || isReceiving) ? "inline-block" : "none";
                const sel = card.querySelector(".wallet-select-button");
                sel.textContent = isActive ? "ACTIVE" : "USE THIS WALLET";
                sel.disabled = isActive;
                sel.addEventListener("click", function () { setActiveWallet(w.address); });
                const rec = card.querySelector(".wallet-receive-button");
                rec.textContent = isReceiving ? "RECEIVING" : "RECEIVE HERE";
                rec.disabled = isReceiving || !username;
                rec.addEventListener("click", async function () {
                    rec.disabled = true;
                    try { await setReceivingWallet(w.address); }
                    catch (e) { alert("Could not update your receiving wallet: " + (e.message || "please try again.")); updateUI(); }
                });
                card.querySelector(".wallet-remove-button").addEventListener("click", async function () {
                    const msg = isReceiving
                        ? "This is your receiving wallet. People who send to @" + username + " will keep paying this address until you choose another. Remove it from VYRO anyway? Your funds are not affected."
                        : "Remove this wallet from VYRO? Your wallet funds are not affected.";
                    if (confirm(msg)) await removeWallet(w.address);
                });
                list.appendChild(card);
            });
        }
        const active = getActiveWallet();
        const addr = document.getElementById("connected-wallet-address");
        if (addr) addr.textContent = active ? active.address : "Wallet address will appear here.";
        const prov = document.getElementById("connected-wallet-provider");
        if (prov) prov.textContent = active ? active.provider : "External Wallet";
        if (typeof window.populateWalletSelectors === "function") { try { window.populateWalletSelectors(); } catch (e) { /* selectors not ready yet */ } }
    }

    // ---------- connect: injected ----------
    async function connectInjected(type) {
        const provider = injected(type);
        if (!provider || typeof provider.connect !== "function") return null;
        const result = await provider.connect();
        const pk = (result && result.publicKey) || provider.publicKey;
        const address = pk && pk.toString ? pk.toString() : null;
        if (!address) throw new Error("The wallet did not return an address.");
        return addWallet(address, type, providerName(type));
    }

    // ---------- connect: WalletConnect v2 ----------
    // The WalletConnect UMD bundle registers itself as window["@walletconnect/sign-client"]
    // (NOT window.SignClient), exposing the class as `.SignClient` and/or `.default`.
    function resolveSignClient() {
        const ns = window["@walletconnect/sign-client"] || window.SignClient;
        const candidates = [ns, ns && ns.SignClient, ns && ns.default];
        for (let i = 0; i < candidates.length; i++) {
            if (candidates[i] && typeof candidates[i].init === "function") return candidates[i];
        }
        return null;
    }

    async function ensureWcClient() {
        if (wcClient) return wcClient;
        const projectId = CFG.walletConnectProjectId;
        if (!projectId) return null;
        const SC = resolveSignClient();
        if (!SC) throw new Error("WalletConnect library is unavailable.");
        wcClient = await SC.init({ projectId: projectId, metadata: CFG.walletConnectMetadata });
        return wcClient;
    }

    function wcSessionForAddress(address) {
        if (!wcClient) return null;
        const all = wcClient.session.getAll();
        for (let i = all.length - 1; i >= 0; i--) {
            const accounts = (all[i].namespaces && all[i].namespaces.solana && all[i].namespaces.solana.accounts) || [];
            if (accounts.some(function (a) { return a.split(":").pop() === address; })) return all[i];
        }
        return null;
    }

    function isMobile() { return /android|iphone|ipad|ipod/i.test(navigator.userAgent); }

    // Where to send the user so they land on their wallet's pending approval request.
    function walletAppLink(session) {
        const meta = session && session.peer && session.peer.metadata;
        const r = meta && meta.redirect;
        if (r && (r.universal || r.native)) return r.universal || r.native;
        if (meta && /trust/i.test(meta.name || "")) return "https://link.trustwallet.com";
        return null;
    }
    function openWalletApp(session) {
        if (!isMobile()) return;
        const link = walletAppLink(session);
        if (link) window.location.href = link;
    }
    
        const PENDING_WC = "vyro_wc_pending";

    // Phones often reload this page when the user returns from the wallet app, which loses the
    // in-memory approval. WalletConnect keeps the session in storage, so pick it up here.
    async function adoptPendingSession() {
        if (!uid) return null;
        let pend = null;
        try { pend = JSON.parse(localStorage.getItem(PENDING_WC) || "null"); } catch (e) { pend = null; }
        if (!pend || Date.now() - pend.t > 10 * 60 * 1000) {
            try { localStorage.removeItem(PENDING_WC); } catch (e) { /* ignore */ }
            return null;
        }
        const client = await ensureWcClient();
        if (!client) return null;
        const all = client.session.getAll();
        for (let i = all.length - 1; i >= 0; i--) {
            const accts = (all[i].namespaces && all[i].namespaces.solana && all[i].namespaces.solana.accounts) || [];
            const address = accts[0] ? accts[0].split(":").pop() : null;
            if (!address) continue;
            wcSession = all[i];
            const peer = all[i].peer && all[i].peer.metadata && all[i].peer.metadata.name;
            const w = addWallet(address, "walletconnect", pend.label || peer || "WalletConnect");
            try { localStorage.removeItem(PENDING_WC); } catch (e) { /* ignore */ }
            if (w) showConnectedWallet();
            return w;
        }
        return null;
    }

    async function connectWalletConnect(deepLinkBase, label) { 
        const client = await ensureWcClient();
        if (!client) return null;
                try { localStorage.setItem(PENDING_WC, JSON.stringify({ label: label || null, t: Date.now() })); } catch (e) { /* ignore */ }
        const res = await client.connect({
            requiredNamespaces: { solana: { methods: ["solana_signTransaction", "solana_signMessage"], chains: [SOLANA_CHAIN], events: [] } }
        });
        if (res.uri) {
            if (isMobile() && deepLinkBase) {
                setStatus("Opening your wallet…");
                window.location.href = deepLinkBase + encodeURIComponent(res.uri);
                        } else if (window.VYROWalletConnectUI) {
                setStatus("Approve the connection in your wallet app.");
                window.VYROWalletConnectUI.show(res.uri, label);
            } else {
                setStatus("Open your wallet app and approve the connection request.");
                console.info("VYRO WalletConnect URI:", res.uri);
    }
        }
        
                wcSession = await res.approval();
        const account = wcSession && wcSession.namespaces && wcSession.namespaces.solana && wcSession.namespaces.solana.accounts[0];
        const address = account ? account.split(":").pop() : null;
        if (!address) throw new Error("WalletConnect did not return a Solana address.");
        // WalletConnect is only the connection method. Show the REAL wallet's name:
        // the one the user tapped, or else the name the wallet itself reports.
        const peer = wcSession.peer && wcSession.peer.metadata && wcSession.peer.metadata.name;
                try { localStorage.removeItem(PENDING_WC); } catch (e) { /* ignore */ }
        return addWallet(address, "walletconnect", label || peer || "WalletConnect");
    }

    // ---------- connect (public entry point) ----------
    // type: "trust-wallet" | "phantom" | "solflare" | "backpack" | "walletconnect"
    async function connect(type) {
        type = type || "trust-wallet";
        setStatus("Connecting…");
        try {
            let w = null;
            if (type === "walletconnect") {
                if (!CFG.walletConnectProjectId) throw new Error("WalletConnect is not configured yet (missing project ID).");
               w = await connectWalletConnect("https://link.trustwallet.com/wc?uri=", null);
            } else if (injected(type)) {
                w = await connectInjected(type);
            } else if (CFG.walletConnectProjectId) {
                // Wallet not injected (e.g. normal mobile browser): fall back to WalletConnect.
              w = await connectWalletConnect(type === "trust-wallet" ? "https://link.trustwallet.com/wc?uri=" : null, providerName(type));
            } else {
                throw new Error(providerName(type) + " was not detected. Open VYRO inside the " + providerName(type) + " app's browser, or enable WalletConnect in js/config.js.");
            }
            if (!w) throw new Error("Wallet connection was not completed.");
            setStatus("Wallet connected.");
            showConnectedWallet();
            return w;
        } catch (error) {
            console.error("VYRO WALLET CONNECT ERROR:", error);
            const msg = isUserRejection(error) ? "Connection was declined in your wallet." : (error.message || "Wallet connection failed.");
            setStatus(msg);
            alert(msg);
            return null;
        }
    }

    async function disconnect() {
        const active = getActiveWallet();
        try {
            if (active && active.type === "walletconnect" && wcClient) {
                const s = wcSessionForAddress(active.address);
                if (s) await wcClient.disconnect({ topic: s.topic, reason: { code: 6000, message: "Disconnected by user" } });
            } else if (active) {
                const p = injected(active.type);
                if (p && typeof p.disconnect === "function") await p.disconnect();
            }
        } catch (e) { /* the wallet may already be disconnected */ }
        if (active) await removeWallet(active.address);
    }

    function isUserRejection(error) {
        const m = String((error && (error.message || error.error && error.error.message)) || "");
        return (error && (error.code === 4001 || error.code === 5000 || error.code === "ACTION_REJECTED")) || /reject|declin|denied|cancel/i.test(m);
    }

    // ---------- signing ----------
    // VYRO builds the unsigned transaction; the USER's wallet displays and signs it.
    // Returns { signature } (wallet already broadcast it) or { signedRaw } (VYRO broadcasts the signed bytes).
    async function requestSignature(tx, expectedAddress) {
        const w = wallets.find(function (x) { return x.address === expectedAddress; });
        if (!w) throw new Error("That wallet is not connected to VYRO.");

        if (w.type === "walletconnect") {
            const client = await ensureWcClient();
            const session = client && wcSessionForAddress(expectedAddress);
            if (!session) throw new Error("This WalletConnect session has expired. Remove the wallet and connect it again.");
            const raw = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
                        const pendingRequest = client.request({
                topic: session.topic,
                chainId: SOLANA_CHAIN,
                request: { method: "solana_signTransaction", params: { transaction: VYROTransfer.bytesToBase64(raw) } }
            });
            openWalletApp(session);   // send the user to the approval request waiting in their wallet
            const result = await pendingRequest;
            if (result && result.transaction) return { signedRaw: VYROTransfer.base64ToBytes(result.transaction) };
            if (result && result.signature) {
                tx.addSignature(new solanaWeb3.PublicKey(expectedAddress), solanaWeb3.Buffer ? solanaWeb3.Buffer.from(VYROTransfer.base58Decode(result.signature)) : VYROTransfer.base58Decode(result.signature));
                return { signedRaw: tx.serialize() };
            }
            throw new Error("The wallet returned no signature.");
        }

        const provider = injected(w.type);
        if (!provider) throw new Error(w.provider + " is not available in this browser. Open VYRO inside the wallet app, or reconnect.");
        // Make sure the wallet is still on the account the user chose.
        try { if (!provider.publicKey && typeof provider.connect === "function") await provider.connect(); } catch (e) { /* surfaced below */ }
        const current = provider.publicKey && provider.publicKey.toString();
        if (current && current !== expectedAddress) {
            throw new Error("Your wallet is now on a different account. Switch back to " + expectedAddress.slice(0, 6) + "…" + expectedAddress.slice(-4) + " in the wallet and try again.");
        }

        const preferSignOnly = w.type === "trust-wallet" && typeof provider.signTransaction === "function";
        if (!preferSignOnly && typeof provider.signAndSendTransaction === "function") {
            const r = await provider.signAndSendTransaction(tx);
            const sig = typeof r === "string" ? r : r && r.signature;
            if (!sig) throw new Error("The wallet returned no signature.");
            return { signature: sig };
        }
        if (typeof provider.signTransaction === "function") {
            const signed = await provider.signTransaction(tx);
            return { signedRaw: signed.serialize() };
        }
        throw new Error(w.provider + " does not support signing transactions.");
    }

    // ---------- restore ----------
    async function restoreConnection() {
        const active = getActiveWallet();
        if (active && active.type === "walletconnect") { try { await ensureWcClient(); } catch (e) { /* surfaced at sign time */ } }
        updateUI();
        return active;
    }

    function showConnectedWallet() {
        const screen = document.getElementById("wallet-connected-screen");
        if (screen && typeof window.showScreen === "function") window.showScreen(screen);
    }

    function bind() {
        document.querySelectorAll("[data-wallet-connect]").forEach(function (btn) {
            btn.addEventListener("click", function () { connect(btn.getAttribute("data-wallet-connect")); });
        });
        const disconnectBtn = document.getElementById("disconnect-wallet-btn");
        if (disconnectBtn) disconnectBtn.addEventListener("click", async function () {
            await disconnect();
            if (typeof window.showScreen === "function") window.showScreen(document.getElementById("wallets-screen"));
        });
    }

        function init() {
        bind();
        updateUI();
        // Coming back from the wallet app: check whether the connection finished.
        document.addEventListener("visibilitychange", function () {
            if (document.visibilityState === "visible") adoptPendingSession().catch(function () {});
        });
    }

    window.VYROWallet = {
        init, connect, disconnect, restoreConnection,
                setUser, setUsername, setReceivingWallet, getReceivingAddress, getUsername,
        getWallets, getActiveWallet, setActiveWallet, addWallet, removeWallet,
        getAddress, getActiveAddress: getAddress, isConnected, getWalletType, getProvider,
        requestSignature, isUserRejection, updateUI
    };

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
