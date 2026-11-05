// =========================================================
// VYQIL — WALLETS THAT CONNECT BY APP LINK (Backpack, Phantom, Solflare)
// =========================================================
// These wallets do not need WalletConnect on a phone. VYQIL sends you to the wallet app with an encrypted request,
// the wallet asks you to approve, then sends you back to VYQIL with an encrypted answer. The keys that protect the
// conversation are made fresh for each connection and stay in this browser; they never hold money.
// Your wallet's own private key never leaves your wallet. VYQIL only ever receives your public address and a signed payment.
// Protocol: Backpack and Phantom "universal links" v1 (x25519 key exchange + NaCl box). Backpack's published steps are
// followed exactly; Phantom and Solflare use the same design.
// =========================================================
(function () {
    "use strict";
    const REG = {
        "backpack": { label: "Backpack", base: "https://backpack.app/ul/v1/" },
        "phantom":  { label: "Phantom",  base: "https://phantom.app/ul/v1/" },
        "solflare": { label: "Solflare", base: "https://solflare.com/ul/v1/" }
    };
    const T = function () { return window.VYROTransfer; };
    const KEY = "vyro:dl:";
    const MAX_AGE = 15 * 60 * 1000;
    const tabId = Math.random().toString(36).slice(2);
    const waiters = {};     // sign requests this page is waiting on

    function store(k, v) { try { if (v == null) localStorage.removeItem(KEY + k); else localStorage.setItem(KEY + k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } }
    function load(k) { try { return JSON.parse(localStorage.getItem(KEY + k) || "null"); } catch (e) { return null; } }
    function b58(u8) { return T().base58Encode(u8); }
    function unb58(s) { return T().base58Decode(s); }
    function b64(u8) { let s = ""; for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]); return btoa(s); }
    function unb64(s) { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
    function need() { if (!window.nacl || !window.nacl.box) throw new Error("The secure-message library did not load. Reload the page and try again."); }
    function here() { return window.location.origin + window.location.pathname; }
    function isMobile() { return /android|iphone|ipad|ipod/i.test(navigator.userAgent); }
    function supported(key) { return !!REG[key]; }
    function labelOf(key) { return REG[key].label; }

    function go(url) { window.location.href = url; }

    // ---------- connect ----------
    function connect(key) {
        need();
        const w = REG[key]; if (!w) throw new Error("Unknown wallet.");
        const kp = window.nacl.box.keyPair();
        store("pending", { kind: "connect", wallet: key, sk: b64(kp.secretKey), pk: b64(kp.publicKey), at: Date.now() });
        const redirect = here() + "?vyro_dl=connect&w=" + key;
        go(w.base + "connect?app_url=" + encodeURIComponent(window.location.origin) +
            "&dapp_encryption_public_key=" + encodeURIComponent(b58(kp.publicKey)) +
            "&redirect_link=" + encodeURIComponent(redirect) + "&cluster=mainnet-beta");
    }

    // ---------- sign ----------
    // Resolves with the signed transaction bytes. The wallet does NOT send it; VYQIL sends it afterwards.
    function sign(key, txBytes, address) {
        need();
        const w = REG[key], conn = load("conn:" + key + ":" + address);
        if (!conn || !conn.session) return Promise.reject(new Error("This wallet connection is out of date. Open Wallets in VYQIL, remove it, and connect it again."));
        const sk = unb64(conn.sk), theirPk = unb64(conn.walletPk), shared = window.nacl.box.before(theirPk, sk);
        const nonce = window.nacl.randomBytes(24);
        const payload = window.nacl.box.after(new TextEncoder().encode(JSON.stringify({ transaction: b58(txBytes), session: conn.session })), nonce, shared);
        const id = Math.random().toString(36).slice(2);
        store("pending", { kind: "sign", wallet: key, address: address, id: id, tab: tabId, at: Date.now() });
        const redirect = here() + "?vyro_dl=sign&w=" + key;
        const url = w.base + "signTransaction?dapp_encryption_public_key=" + encodeURIComponent(conn.pk) +
            "&nonce=" + encodeURIComponent(b58(nonce)) + "&redirect_link=" + encodeURIComponent(redirect) + "&payload=" + encodeURIComponent(b58(payload));
        return new Promise(function (resolve, reject) {
            const timer = setInterval(function () { store("alive", { tab: tabId, at: Date.now() }); }, 2000);
            store("alive", { tab: tabId, at: Date.now() });
            const limit = setTimeout(function () { done(); reject(new Error("The wallet did not answer in time. Open the wallet, check for a pending request, then try again.")); }, 5 * 60 * 1000);
            function done() { clearInterval(timer); clearTimeout(limit); delete waiters[id]; store("alive", null); }
            waiters[id] = { resolve: function (u8) { done(); resolve(u8); }, reject: function (e) { done(); reject(e); } };
            // Opens the wallet (this must run straight after the person's tap, which it does for a payment).
            go(url);
        });
    }

    function readResult(key, params, pend, conn) {
        // Decrypts the wallet's answer. Returns the decrypted object, or throws with the wallet's own message.
        if (params.get("errorCode") || params.get("errorMessage")) {
            const code = params.get("errorCode") || "", msg = params.get("errorMessage") || "The wallet refused the request.";
            const err = new Error(code === "4001" || /reject|declin|denied|cancel/i.test(msg) ? "You declined the request in your wallet." : msg);
            err.code = /reject|declin|denied|cancel/i.test(msg) || code === "4001" ? 4001 : code; throw err;
        }
        let theirPk = null;
        params.forEach(function (v, k) { if (/encryption_public_key$/.test(k)) theirPk = v; });
        const nonce = params.get("nonce"), data = params.get("data");
        if (!nonce || !data) throw new Error("The wallet answered, but the answer was empty.");
        return { theirPk: theirPk, nonce: nonce, data: data };
    }

    function banner(text, good) {
        const bar = document.createElement("div");
        bar.style.cssText = "position:fixed;left:12px;right:12px;top:12px;z-index:99999;background:#0b1220;border:2px solid " + (good ? "#3ddc97" : "#ff6b6b") + ";border-radius:14px;padding:12px;color:#fff;font:600 14px system-ui,sans-serif;overflow-wrap:anywhere;box-shadow:0 6px 24px rgba(0,0,0,.6)";
        bar.textContent = text;
        const x = document.createElement("button"); x.type = "button"; x.textContent = "OK"; x.style.cssText = "display:block;margin:10px 0 0 auto;padding:6px 16px;border-radius:999px;border:0;background:#4ba3ff;font-weight:800";
        x.addEventListener("click", function () { bar.remove(); }); bar.appendChild(x); document.body.appendChild(bar);
        return bar;
    }
    function cleanUrl() { try { window.history.replaceState(null, "", here()); } catch (e) { /* ignore */ } }

    // ---------- the wallet sends the person back here ----------
    async function handleReturn() {
        const params = new URLSearchParams(window.location.search), kind = params.get("vyro_dl"), key = params.get("w");
        if (!kind || !supported(key)) return;
        const pend = load("pending");
        const fail = function (m) { cleanUrl(); store("pending", null); banner(m, false); };
        if (!pend || pend.wallet !== key || Date.now() - pend.at > MAX_AGE) return fail("That wallet request is too old or was not started here. Please start again in VYQIL.");
        try {
            need();
            if (kind === "connect") {
                const r = readResult(key, params, pend, null);
                const sk = unb64(pend.sk), shared = window.nacl.box.before(unb58(r.theirPk), sk);
                const plain = window.nacl.box.open.after(unb58(r.data), unb58(r.nonce), shared);
                if (!plain) throw new Error("The wallet's answer could not be read. Please try connecting again.");
                const info = JSON.parse(new TextDecoder().decode(plain));
                if (!info.public_key || !info.session) throw new Error("The wallet did not return an address.");
                store("conn:" + key + ":" + info.public_key, { sk: pend.sk, pk: b58(unb64(pend.pk)), walletPk: b64(unb58(r.theirPk)), session: info.session, at: Date.now() });
                store("pending", null); cleanUrl();
                if (window.VYROWallet && VYROWallet.addWallet) {
                    VYROWallet.addWallet(info.public_key, "deeplink-" + key, REG[key].label);
                    if (VYROWallet.updateUI) VYROWallet.updateUI();
                    const s = document.getElementById("wallet-connected-screen"); if (s && typeof window.showScreen === "function") window.showScreen(s);
                }
                return;
            }
            if (kind === "sign") {
                const conn = load("conn:" + key + ":" + pend.address);
                if (!conn) throw new Error("The wallet connection was lost. Remove the wallet in VYQIL and connect it again.");
                let theirPk = conn.walletPk; // stored base64 of the wallet's key
                const nonce = params.get("nonce"), data = params.get("data");
                if (params.get("errorCode") || params.get("errorMessage")) { readResult(key, params, pend, conn); }
                if (!nonce || !data) throw new Error("The wallet answered, but the answer was empty.");
                const shared = window.nacl.box.before(unb64(theirPk), unb64(conn.sk));
                const plain = window.nacl.box.open.after(unb58(data), unb58(nonce), shared);
                if (!plain) throw new Error("The wallet's answer could not be read. Please try the payment again.");
                const out = JSON.parse(new TextDecoder().decode(plain));
                if (!out.transaction) throw new Error("The wallet returned no signed payment.");
                const signed = unb58(out.transaction);
                cleanUrl();
                // Hand it to the page that is waiting (same tab, or the tab the person started in).
                const alive = load("alive");
                if (waiters[pend.id]) { store("pending", null); waiters[pend.id].resolve(signed); return; }
                if (alive && alive.tab !== tabId && Date.now() - alive.at < 6000) { store("signed", { id: pend.id, tx: b64(signed), at: Date.now() }); store("pending", null); banner("Approved. Go back to the VYQIL tab where you started the payment; it will finish by itself.", true); return; }
                // Nobody is waiting (the page was reloaded): send the signed payment now so the approval is not wasted.
                store("pending", null);
                const rpc = window.VYRO_CONFIG && VYRO_CONFIG.solana && VYRO_CONFIG.solana.rpcUrl;
                if (!rpc || !window.solanaWeb3 || !window.VYROWallet) throw new Error("Approved in the wallet, but VYQIL could not send it. Nothing was sent. Please try the payment again.");
                const conn2 = new solanaWeb3.Connection(rpc, "confirmed");
                const sig = await VYROWallet.sendSigned(conn2, signed, null);
                banner("Payment sent. Reference: " + sig + ". It may take a few seconds to confirm. (This page was reloaded, so the receipt is not in your history; the blockchain has it.)", true);
            }
        } catch (e) {
            if (kind === "sign" && waiters[(pend || {}).id]) { waiters[pend.id].reject(e); cleanUrl(); store("pending", null); return; }
            if (kind === "sign") {
                const alive = load("alive");
                if (alive && alive.tab !== tabId && Date.now() - alive.at < 6000) { store("signed", { id: pend.id, err: String(e.message || e), code: e.code || 0, at: Date.now() }); }
            }
            fail(e && e.message ? e.message : "The wallet request failed.");
        }
    }

    // A tab that is waiting hears from the tab the wallet sent the person back to.
    window.addEventListener("storage", function (ev) {
        if (ev.key !== KEY + "signed" || !ev.newValue) return;
        let r; try { r = JSON.parse(ev.newValue); } catch (e) { return; }
        const w = r && waiters[r.id]; if (!w) return;
        store("signed", null);
        if (r.err) { const err = new Error(r.err); err.code = r.code; w.reject(err); } else w.resolve(unb64(r.tx));
    });

    function forget(key, address) { store("conn:" + key + ":" + address, null); }
    function hasConnection(key, address) { return !!load("conn:" + key + ":" + address); }

    window.VYRODeepLink = { supported, labelOf, connect, sign, forget, hasConnection, handleReturn, isMobile };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { setTimeout(handleReturn, 400); });
    else setTimeout(handleReturn, 400);
})();
