// =========================================================
// VYRO — EXTERNAL WALLET SYSTEM
// =========================================================
// Non-custodial by design: this module only ever stores PUBLIC addresses.
// Keys never leave the user's wallet. Every transfer is signed inside the
// user's own wallet app, where they see and approve it.
//
// Providers: injected Solana wallets (Trust Wallet, Backpack)
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

    // A wallet can share a Solana account, an Ethereum account (0x...), or both.
    function isEvm(a) { return typeof a === "string" && /^0x[0-9a-fA-F]{40}$/.test(a); }
    function validAddress(a) { return VYROTransfer.isValidSolanaAddress(a) || isEvm(a); }

    // Solana's WalletConnect chain id has two spellings in the wild; ask for both on mainnet.
    const SOLANA_MAINNET_ID = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
    const SOLANA_LEGACY_ID = "solana:4sGjMW1sUnHzSxGspuhpqLDx6wiyjNtZ";
    function solanaChains() { return SOLANA_CHAIN === SOLANA_MAINNET_ID ? [SOLANA_MAINNET_ID, SOLANA_LEGACY_ID] : [SOLANA_CHAIN]; }

    // ---------- provider registry ----------
    const adapters = {
        "trust-wallet": { label: "Trust Wallet", get: () => window.trustwallet && window.trustwallet.solana },
        "phantom":      { label: "Phantom",      get: () => window.phantom && window.phantom.solana },
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
            wallets = Array.isArray(data) ? data.filter(function (w) { return w && validAddress(w.address); }) : [];
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
        adoptPending();
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
        if (!validAddress(address)) return null;
        let w = wallets.find(function (x) { return x.address === address; });
        const isFirst = wallets.length === 0;
        if (!w) {
            w = { address: address, type: type || "external-wallet", provider: provider || providerName(type), network: isEvm(address) ? "ethereum" : "solana", chain: isEvm(address) ? (CFG.ethereum && CFG.ethereum.chainId) : SOLANA_CHAIN };
            wallets.push(w);
        } else {
            w.type = type || w.type;
            w.provider = provider || w.provider || providerName(w.type);
        }
        activeAddress = address;
        persist(); updateUI();
        // First wallet becomes the receiving wallet automatically; the user can change it later.
        if (isFirst && !receivingAddress && username) {
            if (isEvm(address)) {
                // An Ethereum-only wallet can only receive ETH.
                if (window.VYROCoins) VYROCoins.setReceive("ETH", address).catch(function (e) { console.warn("VYRO: auto-publish receiving wallet failed", e); });
            } else {
                setReceivingWallet(address).catch(function (e) { console.warn("VYRO: auto-publish receiving wallet failed", e); });
            }
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
        // The wallet cards (with the coin pickers) are drawn by wallet-roles.js; this plain version is only a fallback.
        const rolesDraws = typeof window.renderWalletRoles === "function";
        if (noWallet) noWallet.style.display = wallets.length === 0 ? "block" : "none";
        if (list && !rolesDraws) {
            list.querySelectorAll(".wallet-card").forEach(function (x) { x.remove(); });
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
        if (rolesDraws) { try { window.renderWalletRoles(); } catch (e) { console.warn(e); } }
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
        // "redirect" tells the wallet where to send the user back to after they approve.
        const backTo = window.location.origin + window.location.pathname;
        const metadata = Object.assign({}, CFG.walletConnectMetadata, { redirect: { universal: backTo } });
        wcClient = await SC.init({ projectId: projectId, metadata: metadata });
        // A phone can pause this page while the wallet app is open. When the user comes back, wake the
        // WalletConnect connection up again so the wallet's approval reaches VYRO.
        document.addEventListener("visibilitychange", function () {
            if (document.visibilityState !== "visible" || !wcClient) return;
            adoptPending();
            try {
                const r = wcClient.core && wcClient.core.relayer;
                if (r && typeof r.restartTransport === "function") r.restartTransport().catch(function () { /* retried by the poller */ });
            } catch (e) { /* ignore */ }
        });
        return wcClient;
    }

    function sessionAccounts(session) {
        const ns = (session && session.namespaces) || {};
        return [].concat((ns.solana && ns.solana.accounts) || [], (ns.eip155 && ns.eip155.accounts) || []);
    }

    function wcSessionForAddress(address) {
        if (!wcClient) return null;
        const want = String(address).toLowerCase();
        // Newest connection first: an old, dead connection to the same account must never be picked.
        const all = wcClient.session.getAll().slice().sort(function (a, b) { return (b.expiry || 0) - (a.expiry || 0); });
        for (let i = 0; i < all.length; i++) {
            if (sessionAccounts(all[i]).some(function (a) { return a.split(":").pop().toLowerCase() === want; })) return all[i];
        }
        return null;
    }

    // The Solana chain id THIS wallet approved (it may use the other spelling).
    function sessionSolanaChain(session) {
        const acc = session && session.namespaces && session.namespaces.solana && session.namespaces.solana.accounts && session.namespaces.solana.accounts[0];
        return acc ? acc.split(":").slice(0, 2).join(":") : SOLANA_CHAIN;
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

    async function connectWalletConnect(deepLinkBase, label) {
        const client = await ensureWcClient();
        if (!client) return null;
        const solNs = { methods: ["solana_signTransaction", "solana_signMessage"], chains: solanaChains(), events: [] };
        const ethNs = (CFG.ethereum && CFG.ethereum.chainId)
            ? { methods: ["eth_sendTransaction"], chains: [CFG.ethereum.chainId], events: [] } : null;
        // Trust Wallet keeps its original request: Solana required, Ethereum optional.
        // Every other wallet is asked for Solana AND Ethereum as optional, so a wallet that shares only
        // one of them (for example Ethereum only) can still connect.
        // Only Trust Wallet is opened through its own deep link (deepLinkBase), so that is how it is told apart.
        const connectParams = !deepLinkBase
            ? { optionalNamespaces: Object.assign({ solana: solNs }, ethNs ? { eip155: ethNs } : {}) }
            : { requiredNamespaces: { solana: { methods: solNs.methods, chains: [SOLANA_CHAIN], events: [] } },
                optionalNamespaces: ethNs ? { eip155: ethNs } : {} };
        const res = await client.connect(connectParams);
        if (res.uri) {
            if (isMobile() && deepLinkBase) {
                setStatus("Opening your wallet…");
                window.location.href = deepLinkBase + encodeURIComponent(res.uri);
            } else if (window.VYROWalletConnectUI) {
                setStatus("Approve the connection in your wallet app.");
                window.VYROWalletConnectUI.show(res.uri, label);   // open-wallet / copy-link panel (js/wc-ui.js)
            } else {
                setStatus("Open your wallet app and approve the connection request.");
                console.info("VYRO WalletConnect URI:", res.uri);
            }
        }
        // Wait for the wallet's approval. Also watch for a new session appearing, because a phone can pause
        // this page while the wallet is open and the approval message can be missed.
        const knownTopics = client.session.getAll().map(function (s) { return s.topic; });
        savePending(label, knownTopics);
        let poller = null;
        const watcher = new Promise(function (resolve) {
            poller = setInterval(function () {
                const fresh = client.session.getAll().find(function (s) { return knownTopics.indexOf(s.topic) === -1 && sessionAccounts(s).length; });
                if (fresh) resolve(fresh);
            }, 1500);
        });
        try { wcSession = await Promise.race([res.approval(), watcher]); }
        finally { if (poller) clearInterval(poller); }
        const added = registerSession(wcSession, label);
        clearPending();
        return added;
    }

    // Turns an approved WalletConnect session into a wallet in VYRO.
    function registerSession(session, label) {
        const nsAll = (session && session.namespaces) || {};
        const solAccount = nsAll.solana && nsAll.solana.accounts && nsAll.solana.accounts[0];
        const evmAccount = nsAll.eip155 && nsAll.eip155.accounts && nsAll.eip155.accounts[0];
        const solAddress = solAccount ? solAccount.split(":").pop() : null;
        const evmAddress = evmAccount ? evmAccount.split(":").pop() : null;
        const address = solAddress || evmAddress;
        if (!address) throw new Error("This wallet did not share a Solana or Ethereum account.");
        // WalletConnect is only the connection method. Show the REAL wallet's name:
        // the one the user tapped, or else the name the wallet itself reports.
        const peer = session.peer && session.peer.metadata && session.peer.metadata.name;
        // Close older connections to this same account so a stale one can never be used for signing.
        try {
            if (wcClient) wcClient.session.getAll().forEach(function (s) {
                if (s.topic !== session.topic && sessionAccounts(s).some(function (a) { return a.split(":").pop().toLowerCase() === address.toLowerCase(); })) {
                    wcClient.disconnect({ topic: s.topic, reason: { code: 6000, message: "Replaced by a newer connection" } }).catch(function () { /* already gone */ });
                }
            });
        } catch (e) { /* best effort */ }
        const added = addWallet(address, "walletconnect", label || peer || "WalletConnect");
        if (added && solAddress && evmAddress) { added.evmAddress = evmAddress; persist(); updateUI(); }
        return added;
    }

    // ---------- finishing a connection after the wallet sent the user back ----------
    // Many phones reload VYRO (or open it in a new tab) when the wallet redirects back, so the page that
    // started the connection is gone. We remember that a connection was started, and when VYRO loads
    // again we pick up the session the wallet approved.
    const PENDING_KEY = "vyro:wc:pending";
    function savePending(label, known) {
        try { localStorage.setItem(PENDING_KEY, JSON.stringify({ uid: uid, label: label || null, t: Date.now(), known: known })); } catch (e) { /* storage blocked */ }
    }
    function clearPending() { try { localStorage.removeItem(PENDING_KEY); } catch (e) { /* storage blocked */ } }
    function readPending() {
        try {
            const p = JSON.parse(localStorage.getItem(PENDING_KEY) || "null");
            if (!p || p.uid !== uid || !p.t || Date.now() - p.t > 15 * 60 * 1000) return null;
            return p;
        } catch (e) { return null; }
    }

    let adopting = false;
    async function adoptPending() {
        if (adopting || !uid || !CFG.walletConnectProjectId) return;
        let p = readPending();
        if (!p) return;
        adopting = true;
        try {
            const client = await ensureWcClient();
            if (!client) return;
            for (let i = 0; i < 12; i++) {
                p = readPending();
                if (!p) return;
                const fresh = client.session.getAll().filter(function (s) { return (p.known || []).indexOf(s.topic) === -1 && sessionAccounts(s).length; });
                if (fresh.length) {
                    wcSession = fresh[fresh.length - 1];
                    registerSession(wcSession, p.label);
                    clearPending();
                    setStatus("Wallet connected.");
                    showConnectedWallet();
                    return;
                }
                await new Promise(function (r) { setTimeout(r, 1500); });
            }
        } catch (e) { console.warn("VYRO: could not finish the wallet connection", e); }
        finally { adopting = false; }
    }

    // Sends one request to the wallet that owns `address` (used for Ethereum). The wallet app opens
    // so the user can approve it; VYRO never signs.
    async function wcRequest(address, chainId, request) {
        const client = await ensureWcClient();
        const session = client && wcSessionForAddress(address);
        if (!session) throw new Error("This WalletConnect session has expired. Remove the wallet and connect it again.");
        const pendingRequest = client.request({ topic: session.topic, chainId: chainId, request: request });
        openWalletApp(session);
        return pendingRequest;
    }

    // ---------- connect (public entry point) ----------
    // type: "trust-wallet" | "phantom" | "backpack" | "walletconnect"
    async function connect(type, label) {
        type = type || "trust-wallet";
        setStatus("Connecting…");
        try {
            let w = null;
            if (type === "walletconnect") {
                if (!CFG.walletConnectProjectId) throw new Error("WalletConnect is not configured yet (missing project ID).");
                w = await connectWalletConnect(label ? null : "https://link.trustwallet.com/wc?uri=", label || null);
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
            clearPending();
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
                chainId: sessionSolanaChain(session),
                request: { method: "solana_signTransaction", params: { transaction: VYROTransfer.bytesToBase64(raw) } }
            });
            openWalletApp(session);   // send the user to the approval request waiting in their wallet
            let result;
            try { result = await pendingRequest; }
            catch (e) {
                const m = String((e && (e.message || (e.error && e.error.message))) || "");
                if (/session propert|no matching|expired|session topic|not approved/i.test(m) && !isUserRejection(e)) {
                    throw new Error("Your wallet says this connection is out of date. Open Wallets in VYRO, remove this wallet, connect it again, then retry. (Wallet message: " + m.slice(0, 80) + ")");
                }
                throw e;
            }
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
            btn.addEventListener("click", function () { connect(btn.getAttribute("data-wallet-connect"), btn.getAttribute("data-wallet-label")); });
        });
        const disconnectBtn = document.getElementById("disconnect-wallet-btn");
        if (disconnectBtn) disconnectBtn.addEventListener("click", async function () {
            await disconnect();
            if (typeof window.showScreen === "function") window.showScreen(document.getElementById("wallets-screen"));
        });
    }

    function init() { bind(); updateUI(); }

    window.VYROWallet = {
        init, connect, disconnect, restoreConnection,
        setUser, setUsername, setReceivingWallet, getReceivingAddress, getUsername,
        getWallets, getActiveWallet, setActiveWallet, addWallet, removeWallet,
        getAddress, getActiveAddress: getAddress, isConnected, getWalletType, getProvider,
        requestSignature, wcRequest, isUserRejection, updateUI
    };

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
