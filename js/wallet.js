// =========================================================
// VYRO — EXTERNAL WALLET SYSTEM
// =========================================================
// Non-custodial by design: this module only ever stores PUBLIC addresses.
// Keys never leave the user's wallet. Every transfer is signed inside the
// user's own wallet app, where they see and approve it.
//
// Providers: WalletConnect v2 (Trust Wallet and any wallet that supports Solana or Ethereum), app-link wallets on phones
// (Backpack, Phantom: see deeplink-wallets.js) and injected wallets inside a wallet's own browser.
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

    function isDeepLink(type) { return typeof type === "string" && type.indexOf("deeplink-") === 0; }
    function providerName(type) {
        if (type === "walletconnect") return "WalletConnect";
        if (isDeepLink(type) && window.VYRODeepLink) return VYRODeepLink.labelOf(type.slice(9));
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
        try { const rm = wallets.find(function (w) { return w.address === address; }); if (rm && isDeepLink(rm.type) && window.VYRODeepLink) VYRODeepLink.forget(rm.type.slice(9), address); } catch (e) { /* ignore */ }
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

    // ---- finishing a payment the page was no longer alive to finish ----
    // When the wallet app is on screen, a phone may pause or even close this page. The wallet's signed answer waits at the
    // WalletConnect relay for a few minutes. If VYRO finds that answer after the page comes back, it sends the payment itself,
    // so an approved payment is never lost. (A payment finished this way has no receipt in VYRO's history; the blockchain has it.)
    const SIGNREQ = "vyro:wc:signreq";
    function armRecovery(session, address) {
        try { localStorage.setItem(SIGNREQ, JSON.stringify({ topic: session.topic, address: address, at: Date.now() })); } catch (e) { /* ignore */ }
    }
    function disarmRecovery() { try { localStorage.removeItem(SIGNREQ); } catch (e) { /* ignore */ } }
    let recovering = false;
    async function recoverSignedPayment() {
        let rec = null;
        try { rec = JSON.parse(localStorage.getItem(SIGNREQ) || "null"); } catch (e) { rec = null; }
        if (!rec || recovering || !wcClient) return;
        if (Date.now() - rec.at > 10 * 60000) { disarmRecovery(); return; }
        recovering = true;
        try {
            // Wait for the wallet's answer to arrive (up to about 75 seconds), because a phone that just reopened the page
            // may take a while to reconnect. A signed payment goes stale after roughly a minute.
            let found = null;
            const until = Date.now() + 75000;
            do {
                await new Promise(function (r) { setTimeout(r, 2000); });
                try { if (!localStorage.getItem(SIGNREQ)) return; } catch (e) { /* ignore */ }   // the live page already handled it
                const recs = (wcClient.core && wcClient.core.history && wcClient.core.history.records) || [];
                recs.forEach(function (r) {
                    if (r.topic === rec.topic && r.request && r.request.method === "solana_signTransaction" && Number(r.id) > rec.at * 1000 && r.response && (!found || r.id > found.id)) found = r;
                });
                if (!found) {
                    try {
                        const r2 = wcClient.core && wcClient.core.relayer;
                        if (r2 && !r2.connected && typeof r2.restartTransport === "function") r2.restartTransport().catch(function () { /* retried */ });
                    } catch (e) { /* ignore */ }
                }
            } while (!found && Date.now() < until);
            if (!found) return;
            disarmRecovery();
            const res = found.response.result;
            if (!res || !res.transaction) return;   // declined or no result: nothing to send
            const rpc = CFG.solana && CFG.solana.rpcUrl;
            if (!rpc || !window.solanaWeb3) return;
            const raw = VYROTransfer.base64ToBytes(res.transaction);
            const conn = new solanaWeb3.Connection(rpc, "confirmed");
            let sig;
            try { sig = await sendSigned(conn, raw, null); }
            catch (e) { notice("Your wallet approved the payment, but VYRO could not send it: " + String((e && e.message) || e).split(". Logs:")[0] + ". No funds were moved.", false); return; }
            notice("Payment sent. Reference: " + sig + ". It may take a few seconds to confirm. The blockchain has the receipt.", true);
        } catch (e) { /* nothing to recover */ }
        finally { recovering = false; }
    }
    function notice(text, good) {
        const bar = document.createElement("div");
        bar.style.cssText = "position:fixed;left:14px;right:14px;top:14px;z-index:99999;max-width:460px;margin:0 auto;background:#0C1117;border:1px solid " + (good ? "#3ddc97" : "#ff6b6b") + ";border-radius:14px;padding:12px 14px;color:#F1F6FB;font:600 13px system-ui,-apple-system,Segoe UI,sans-serif;overflow-wrap:anywhere;box-shadow:0 8px 24px rgba(0,0,0,.6)";
        bar.textContent = text;
        const x = document.createElement("button"); x.type = "button"; x.textContent = "OK";
        x.style.cssText = "display:block;margin:10px 0 0 auto;padding:6px 18px;border-radius:10px;border:1px solid #62B6F5;background:rgba(98,182,245,.2);color:#fff;font-weight:700";
        x.addEventListener("click", function () { bar.remove(); }); bar.appendChild(x); document.body.appendChild(bar);
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
            setTimeout(recoverSignedPayment, 1500);
            try {
                const r = wcClient.core && wcClient.core.relayer;
                if (r && typeof r.restartTransport === "function") r.restartTransport().catch(function () { /* retried by the poller */ });
            } catch (e) { /* ignore */ }
        });
        setTimeout(recoverSignedPayment, 1500);
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
        if (meta && /trust/i.test(meta.name || "")) return trustLink();
        if (r && (r.universal || r.native)) return r.universal || r.native;
        return null;
    }

    // Android browsers (Chrome and the apps built on it) open an app reliably through an "intent" link, which names the Trust Wallet
    // app directly. A plain trust:// link is what iPhones use, and is only a fallback on Android.
    function trustLink() {
        if (/android/i.test(navigator.userAgent || ""))
            return "intent://wc#Intent;scheme=trust;package=com.wallet.crypto.trustapp;S.browser_fallback_url=" + encodeURIComponent("https://link.trustwallet.com/") + ";end";
        return "trust://";
    }
    const BUILD = "pay-7";

    // There is no box. VYRO opens the wallet itself the moment Confirm is tapped. Only if the wallet is STILL waiting after
    // 12 seconds (the phone refused to open it) does a small plain-text link appear, which disappears again on its own.
    let cancelWait = null, barCleanup = null;
    function cancelWalletWait() { if (cancelWait) { try { cancelWait(); } catch (e) { /* ignore */ } } if (barCleanup) barCleanup(); }
    function showOpenWalletButton(session) {
        if (barCleanup) barCleanup();
        if (!isMobile()) return function () { };
        const link = walletAppLink(session) || "";
        const name = (session && session.peer && session.peer.metadata && session.peer.metadata.name) || "your wallet";
        let el = null;
        const timer = setTimeout(function () {
            if (!link) return;
            el = document.createElement("a");
            el.id = "vyro-wait-bar"; el.href = link; el.textContent = "Wallet did not open? Tap to open " + name + " (" + BUILD + ")";
            el.style.cssText = "position:fixed;left:0;right:0;bottom:14px;z-index:99999;text-align:center;color:#62B6F5;font:600 13px system-ui,-apple-system,Segoe UI,sans-serif;text-decoration:underline;text-shadow:0 1px 6px #000";
            document.body.appendChild(el);
        }, 12000);
        const home = document.querySelector(".screen.active");
        let mo = null;
        try { if (home) { mo = new MutationObserver(function () { if (!home.classList.contains("active")) cancelWalletWait(); }); mo.observe(home, { attributes: true, attributeFilter: ["class"] }); } } catch (e) { /* ignore */ }
        const cleanup = function () {
            clearTimeout(timer);
            if (mo) mo.disconnect();
            if (el && el.parentNode) el.parentNode.removeChild(el);
            if (barCleanup === cleanup) barCleanup = null;
        };
        barCleanup = cleanup;
        return cleanup;
    }

    // A phone only lets a page open another app straight after the person's own tap. So VYRO opens the wallet in the very
    // same moment Confirm is tapped (before any waiting), and the payment request arrives in the wallet a second later.
    let autoOpenedAt = 0;
    function openForSigning(address) {
        try {
            if (!isMobile()) return false;
            const w = wallets.find(function (x) { return x.address === address; });
            if (!w || (w.type !== "walletconnect" && !/trust/i.test(w.provider || ""))) return false;
            let link = null;
            try { if (wcClient) link = walletAppLink(wcSessionForAddress(address)); } catch (e) { link = null; }
            if (!link && /trust/i.test(w.provider || "")) link = trustLink();   // does not depend on anything loading first
            if (!link) return false;
            autoOpenedAt = Date.now();
            window.location.href = link;
            return true;
        } catch (e) { return false; }
    }
    function openWalletApp(session) {
        if (!isMobile()) return;
        if (Date.now() - autoOpenedAt < 90000) return;   // already opened when Confirm was tapped
        const link = walletAppLink(session);
        // A moment's pause so the request has left this page before the wallet app takes over the screen.
        if (link) setTimeout(function () { window.location.href = link; }, 350);
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
        const cancelled = new Promise(function (_, reject) {
            cancelWait = function () { const e = new Error("You cancelled the wallet request. Nothing was sent."); e.vyroCancelled = true; reject(e); };
        });
        return Promise.race([pending, limit, cancelled]).finally(function () { clearTimeout(timer); cancelWait = null; });
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
            } else if (type === "trust-wallet") {
                // Trust Wallet always connects through WalletConnect from the normal browser, never through its own in-app browser.
                if (!CFG.walletConnectProjectId) throw new Error("WalletConnect is not configured yet (missing project ID).");
                w = await connectWalletConnect("https://link.trustwallet.com/wc?uri=", providerName(type));
            } else if (window.VYRODeepLink && VYRODeepLink.supported(type) && isMobile() && !injected(type)) {
                // Backpack / Phantom on a phone: connect by app link (the wallet opens, you approve, you come back).
                setStatus("Opening " + VYRODeepLink.labelOf(type) + "…");
                VYRODeepLink.connect(type);
                return null;
            } else if (injected(type)) {
                w = await connectInjected(type);
            } else if (CFG.walletConnectProjectId) {
                w = await connectWalletConnect(null, providerName(type));
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
                armRecovery(session, expectedAddress);
                openWalletApp(session);   // send the user to the approval request waiting in their wallet
                const hideBtn = showOpenWalletButton(session);
                try { result = await withAnswerTimeout(pendingRequest, client, session).finally(function () { hideBtn(); disarmRecovery(); }); break; }
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

        if (isDeepLink(w.type)) {
            const raw = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
            const signed = await VYRODeepLink.sign(w.type.slice(9), raw, expectedAddress);
            return { signedRaw: signed };
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

    // One-tap clean start for WalletConnect: ends every saved session, wipes this browser's saved WalletConnect data (a half-finished
    // connection left there can make a wallet say "connecting" forever) and removes the WalletConnect wallets from VYRO.
    async function resetConnections() {
        try {
            if (wcClient) {
                const list = wcClient.session.getAll();
                for (let i = 0; i < list.length; i++) { try { await wcClient.disconnect({ topic: list[i].topic, reason: { code: 6000, message: "Reset from VYRO" } }); } catch (e) { /* already gone */ } }
            }
        } catch (e) { /* ignore */ }
        try {
            const names = ["WALLET_CONNECT_V2_INDEXED_DB"];
            if (indexedDB.databases) { const dbs = await indexedDB.databases(); dbs.forEach(function (d) { if (d.name && /walletconnect|wc@2|WALLET_CONNECT/i.test(d.name) && names.indexOf(d.name) < 0) names.push(d.name); }); }
            await Promise.all(names.map(function (n) { return new Promise(function (res) { const r = indexedDB.deleteDatabase(n); r.onsuccess = r.onerror = r.onblocked = function () { res(); }; }); }));
        } catch (e) { /* ignore */ }
        try {
            Object.keys(localStorage).forEach(function (k) { if (/^wc@2|^WCM_|^@w3m|^walletconnect|^vyro:wc:/i.test(k)) localStorage.removeItem(k); });
        } catch (e) { /* ignore */ }
        wallets.filter(function (w) { return w.type === "walletconnect" || isDeepLink(w.type); }).forEach(function (w) { try { removeWalletSync(w.address); } catch (e) { /* ignore */ } });
        persist();
        window.location.reload();
    }
    function removeWalletSync(address) {
        wallets = wallets.filter(function (w) { return w.address !== address; });
        if (activeAddress === address) activeAddress = wallets[0] ? wallets[0].address : null;
    }

    function bind() {
        const resetBtn = document.getElementById("reset-wc-btn");
        if (resetBtn) resetBtn.addEventListener("click", function () {
            if (confirm("Reset wallet connections? This signs VYRO out of your connected wallets on this device (your money and wallets are not touched). You can reconnect straight away.")) resetConnections();
        });
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
        requestSignature, sendSigned, openForSigning, cancelWalletWait, resetConnections, wcRequest, isUserRejection, updateUI
    };

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
