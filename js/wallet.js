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
        syncReceiving();
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


    // The wallet that is connected and active here is always the one people pay. Whenever it changes, the public
    // payment address on your profile is updated to match (Solana wallet -> USDC and SOL; Ethereum wallet -> ETH).
    let lastSync = "";
    async function syncReceiving() {
        try {
            if (!username) return;
            const w = wallets.find(function (x) { return x.address === activeAddress; });
            if (!w) return;
            const key = username + ":" + w.address;
            if (lastSync === key) return;
            lastSync = key;
            const ref = firebaseDB.collection("usernames").doc(username);
            const snap = await ref.get();
            if (!snap.exists) { lastSync = ""; return; }
            const d = snap.data() || {};
            const cur = d.receive && typeof d.receive === "object" ? Object.assign({}, d.receive) : {};
            if (!d.receive && d.walletAddress) { cur.USDC = d.walletAddress; cur.SOL = d.walletAddress; }
            const next = Object.assign({}, cur);
            if (isEvm(w.address)) next.ETH = w.address; else { next.USDC = w.address; next.SOL = w.address; }
            const legacy = next.USDC || next.SOL || null;
            if (JSON.stringify(next) !== JSON.stringify(cur) || (legacy && d.walletAddress !== legacy)) {
                const upd = { receive: next };
                if (legacy) upd.walletAddress = legacy;
                await ref.update(upd);
                if (window.VYROCoins && VYROCoins.resetReceive) { try { VYROCoins.resetReceive(); } catch (e) { /* optional */ } }
            }
            receivingAddress = legacy || receivingAddress;
            updateUI();
        } catch (e) { lastSync = ""; console.warn("VYRO: could not update the payment address", e); }
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
        syncReceiving();
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
        syncReceiving();
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
        // Trust Wallet: its app link ("trust://") opens the app on the waiting request. Its web link opens a download page.
        if (meta && /trust/i.test(meta.name || "")) return "trust://";
        if (r && (r.universal || r.native)) return r.universal || r.native;
        return null;
    }

    // A phone often blocks a page from opening another app on its own. This button is a real tap, so it always works.
    function showOpenWalletButton(session) {
        if (!isMobile()) return function () { };
        const link = walletAppLink(session) || "";
        const name = (session && session.peer && session.peer.metadata && session.peer.metadata.name) || "your wallet";
        const bar = document.createElement("div");
        bar.style.cssText = "position:fixed;left:12px;right:12px;bottom:14px;z-index:99999;background:#0b1220;border:2px solid #4ba3ff;border-radius:14px;padding:12px;text-align:center;color:#fff;font:600 15px system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.6)";
        const t = document.createElement("div"); t.textContent = "Waiting for " + name + " to approve."; t.style.marginBottom = "8px";
        bar.appendChild(t);
        if (link) {
            const a = document.createElement("a"); a.href = link; a.textContent = "TAP TO OPEN " + name.toUpperCase();
            a.style.cssText = "display:block;background:#4ba3ff;color:#031018;border-radius:999px;padding:12px;text-decoration:none;font-weight:800";
            bar.appendChild(a);
        }
        const h = document.createElement("div"); h.textContent = "Approve the payment there, then come back here."; h.style.cssText = "font-weight:400;font-size:12px;opacity:.75;margin-top:8px";
        bar.appendChild(h);
        document.body.appendChild(bar);
        return function () { if (bar.parentNode) bar.parentNode.removeChild(bar); };
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
                // The wallet's own app link opens the app directly. The web link can land on a "download" page instead.
                window.location.href = deepLinkBase.replace("https://link.trustwallet.com/", "trust://") + encodeURIComponent(res.uri);
                // If the app did not take over, show the open / copy buttons so the connection can still be finished by hand.
                setTimeout(function () {
                    if (document.visibilityState === "visible" && window.VYROWalletConnectUI) {
                        setStatus("If your wallet did not open, use the buttons on screen.");
                        window.VYROWalletConnectUI.show(res.uri, label || "Trust Wallet");
                    }
                }, 3500);
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


    // If the wallet never answers, say so with facts instead of waiting forever. These facts are what to send back when asking for help.
    function withAnswerTimeout(pending, client, session) {
        let timer;
        const limit = new Promise(function (_, reject) {
            timer = setTimeout(function () {
                let relay = "unknown";
                try { const r = client.core && client.core.relayer; relay = r && r.connected ? "connected" : "disconnected"; } catch (e) { /* ignore */ }
                const meta = session && session.peer && session.peer.metadata;
                const ageMin = session && session.expiry ? Math.round((session.expiry * 1000 - Date.now()) / 60000) : "?";
                reject(new Error("Your wallet did not answer within 2 minutes. Open the wallet app, check for a waiting request, or remove the wallet in VYRO and connect it again. Tip: open VYRO inside Trust Wallet's own browser. [wallet: " + ((meta && meta.name) || "?") + "; relay: " + relay + "; connection expires in " + ageMin + " min]"));
            }, 120000);
        });
        return Promise.race([pending, limit]).finally(function () { clearTimeout(timer); });
    }

    // Sends one request to the wallet that owns `address` (used for Ethereum). The wallet app opens
    // so the user can approve it; VYRO never signs.
    async function wcRequest(address, chainId, request) {
        const client = await ensureWcClient();
        const session = client && wcSessionForAddress(address);
        if (!session) throw new Error("This WalletConnect session has expired. Remove the wallet and connect it again.");
        const pendingRequest = client.request({ topic: session.topic, chainId: chainId, request: request });
        openWalletApp(session);
        const hideBtn2 = showOpenWalletButton(session);
        return withAnswerTimeout(pendingRequest, client, session).finally(hideBtn2);
    }


    function trustChooser() {
        return new Promise(function (resolve) {
            const bg = document.createElement("div"); bg.className = "wc-overlay";
            const card = document.createElement("div"); card.className = "wc-card";
            const h = document.createElement("h2"); h.textContent = "Connect Trust Wallet";
            const p = document.createElement("p"); p.textContent = "Best way: open VYRO inside Trust Wallet's own browser. Sign in there once, then tap Trust Wallet again. Or use a WalletConnect connection from this browser.";
            function btn(label, cls, val) { const b = document.createElement("button"); b.type = "button"; b.className = cls; b.textContent = label; b.addEventListener("click", function () { bg.remove(); resolve(val); }); return b; }
            card.appendChild(h); card.appendChild(p);
            card.appendChild(btn("OPEN VYRO IN TRUST WALLET", "primary-button", "inapp"));
            card.appendChild(btn("USE WALLETCONNECT INSTEAD", "secondary-button", "wc"));
            card.appendChild(btn("CANCEL", "secondary-button", "cancel"));
            bg.appendChild(card); document.body.appendChild(bg);
        }).then(function (v) { if (v === "cancel") throw Object.assign(new Error("Connection cancelled."), { code: 4001 }); return v; });
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
            } else if (type === "trust-wallet" && isMobile() && !window.__vyroSkipTrustChooser) {
                // Trust Wallet's own browser has the wallet built in, which is far more reliable than a connection from outside.
                const choice = await trustChooser();
                if (choice === "inapp") { window.location.href = "https://link.trustwallet.com/open_url?coin_id=501&url=" + encodeURIComponent(window.location.origin + window.location.pathname); return null; }
                if (!CFG.walletConnectProjectId) throw new Error("WalletConnect is not configured yet (missing project ID).");
                w = await connectWalletConnect("https://link.trustwallet.com/wc?uri=", providerName(type));
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


    // Closes every WalletConnect connection to this account (the wallet no longer recognises them).
    async function dropSessionsFor(address) {
        try {
            const client = await ensureWcClient(), want = String(address).toLowerCase();
            const all = client ? client.session.getAll() : [];
            for (let i = 0; i < all.length; i++) {
                if (sessionAccounts(all[i]).some(function (a) { return a.split(":").pop().toLowerCase() === want; })) {
                    try { await client.disconnect({ topic: all[i].topic, reason: { code: 6000, message: "Reconnecting" } }); } catch (e) { /* already gone */ }
                }
            }
        } catch (e) { /* best effort */ }
    }

    // Opens the wallet (Trust Wallet through its own link) to approve a new connection, then returns once it is approved.
    async function reconnectWalletConnect(w) {
        if (!CFG.walletConnectProjectId) throw new Error("WalletConnect is not configured yet (missing project ID).");
        const label = w.provider || null, trust = /trust/i.test(label || "");
        setStatus("Your wallet connection expired. Opening " + (label || "your wallet") + " to reconnect…");
        let added;
        try { added = await connectWalletConnect(trust ? "https://link.trustwallet.com/wc?uri=" : null, label); }
        catch (e) {
            if (isUserRejection(e)) throw Object.assign(new Error("Reconnecting was declined in your wallet. No payment was made."), { code: 4001 });
            throw e;
        }
        if (!added || String(added.address).toLowerCase() !== String(w.address).toLowerCase()) {
            throw new Error("Your wallet reconnected on a different account. Switch to " + String(w.address).slice(0, 6) + "…" + String(w.address).slice(-4) + " in the wallet, then try again.");
        }
        setStatus("Wallet reconnected.");
    }

    // Sends a signed payment. "Blockhash not found" usually means the node was a moment behind (or the approval took too
    // long), so ask the node for its newest view first; if the payment's time window has really passed, say so plainly.
    // Nothing is lost either way: a payment that cannot land never moves funds.
    async function sendSigned(conn, raw, lastValidBlockHeight) {
        const sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
        const isBlockhash = function (e) { return /blockhash not found|blockhash.*expired|block height exceeded/i.test(String((e && (e.message || e)) || "")); };
        let last;
        for (let i = 0; i < 3; i++) {
            try { return await conn.sendRawTransaction(raw, { skipPreflight: false, preflightCommitment: "processed", maxRetries: 5 }); }
            catch (e) {
                last = e;
                if (!isBlockhash(e)) throw e;
                try { if (lastValidBlockHeight && (await conn.getBlockHeight("confirmed")) > lastValidBlockHeight) break; } catch (x) { /* keep trying */ }
                await sleep(1200);
            }
        }
        if (lastValidBlockHeight) {
            try {
                if ((await conn.getBlockHeight("confirmed")) <= lastValidBlockHeight) {
                    // Still inside its time window: send without the pre-check, which is what keeps failing on a lagging node.
                    return await conn.sendRawTransaction(raw, { skipPreflight: true, maxRetries: 5 });
                }
            } catch (e) { last = e; }
        }
        const err = new Error("The approval took too long and the payment's time window ran out. No funds were moved. Please tap Confirm again and approve it right away.");
        err.original = last; throw err;
    }

    function isUserRejection(error) {
        const m = String((error && (error.message || error.error && error.error.message)) || "");
        return (error && (error.code === 4001 || error.code === 5000 || error.code === "ACTION_REJECTED")) || /reject|declin|denied|cancel/i.test(m);
    }

    // ---------- signing ----------
    // VYRO builds the unsigned transaction; the USER's wallet displays and signs it.
    // Returns { signature } (wallet already broadcast it) or { signedRaw } (VYRO broadcasts the signed bytes).
    async function requestSignature(tx, expectedAddress, opts) {
        const w = wallets.find(function (x) { return x.address === expectedAddress; });
        if (!w) throw new Error("That wallet is not connected to VYRO.");

        if (w.type === "walletconnect") {
            // If the wallet no longer knows this connection (another phone connected to the same wallet, an old session,
            // or "Invalid Session Properties"), reconnect by ITSELF and ask again, so the person never has to go to
            // Wallets and press connect. Needs opts.rebuild (a fresh transaction) because the old one may be too old.
            let attempt = 0, curTx = tx, result;
            for (;;) {
                const client = await ensureWcClient();
                const session = client && wcSessionForAddress(expectedAddress);
                if (!session) {
                    if (opts && opts.rebuild && attempt === 0) { attempt++; await reconnectWalletConnect(w); curTx = await opts.rebuild(); continue; }
                    throw new Error("This WalletConnect session has expired. Remove the wallet and connect it again.");
                }
                const raw = curTx.serialize({ requireAllSignatures: false, verifySignatures: false });
                const pendingRequest = client.request({
                    topic: session.topic,
                    chainId: sessionSolanaChain(session),
                    request: { method: "solana_signTransaction", params: { transaction: VYROTransfer.bytesToBase64(raw) } }
                });
                openWalletApp(session);   // send the user to the approval request waiting in their wallet
                const hideBtn = showOpenWalletButton(session);
                try { result = await withAnswerTimeout(pendingRequest, client, session).finally(hideBtn); break; }
                catch (e) {
                    const m = String((e && (e.message || (e.error && e.error.message))) || "");
                    if (/session propert|invalid session|no matching|expired|session topic|not approved|unknown topic|pairing/i.test(m) && !isUserRejection(e)) {
                        if (opts && opts.rebuild && attempt === 0) {
                            attempt++;
                            await dropSessionsFor(expectedAddress);
                            await reconnectWalletConnect(w);
                            curTx = await opts.rebuild();
                            continue;
                        }
                        throw new Error("Your wallet says this connection is out of date. Open Wallets in VYRO, remove this wallet, connect it again, then retry. (Wallet message: " + m.slice(0, 80) + ")");
                    }
                    throw e;
                }
            }
            if (result && result.transaction) return { signedRaw: VYROTransfer.base64ToBytes(result.transaction) };
            if (result && result.signature) {
                curTx.addSignature(new solanaWeb3.PublicKey(expectedAddress), solanaWeb3.Buffer ? solanaWeb3.Buffer.from(VYROTransfer.base58Decode(result.signature)) : VYROTransfer.base58Decode(result.signature));
                return { signedRaw: curTx.serialize() };
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
        requestSignature, sendSigned, wcRequest, isUserRejection, updateUI
    };

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
