// =========================================================
// VYRO — PAY A BUSINESS (scan a Vyro Business invoice QR)
// =========================================================
// The business's QR says how much the customer pays in total. This app splits it in ONE transaction:
//   98% to the business wallet, 2% to VYRO's own fee wallet (taken from js/config.js, never from the QR).
// A one-time "reference" key from the QR is added to the payment so the business can find it on chain.
// No extra sender fee is added on these payments: the business pays the 2%.
// VYRO never holds funds or keys. The user's own wallet shows and signs the payment.
(function () {
    "use strict";

    const CFG = window.VYRO_CONFIG || {};
    const SOL = CFG.solana || {};
    const COINS = window.VYROCoins;
    const T = window.VYROTransfer;
    const BIZ_FEE_BPS = 200;            // 2%, paid by the business out of the payment
    const $ = function (id) { return document.getElementById(id); };

    let conn = null, pending = null, stream = null, timer = null, busy = false, jsqrLoading = null;

    function getConn() {
        if (!window.solanaWeb3) throw new Error("Solana library failed to load. Check your connection and reload.");
        if (!conn) conn = new solanaWeb3.Connection(SOL.rpcUrl, "confirmed");
        return conn;
    }
    function bad(message) { return { ok: false, error: message }; }
    function clean(s, n) { return String(s || "").replace(/[\u0000-\u001f\u007f<>]/g, "").trim().slice(0, n || 60); }
    function short(a) { return a ? a.slice(0, 6) + "..." + a.slice(-4) : ""; }
    function userError(m) { const e = new Error(m); e.userFacing = true; return e; }

    // ---------- read and check the QR text ----------
    function parseCode(text) {
        text = String(text || "").trim();
        if (!/^vyro:\/\/pay\?/i.test(text)) return bad("This is not a Vyro Business payment code.");
        let q;
        try { q = new URLSearchParams(text.slice(text.indexOf("?") + 1)); } catch (e) { return bad("This payment code could not be read."); }
        if (q.get("v") !== "1") return bad("This payment code is from a newer version. Please update VYRO.");
        if (q.get("net") !== "mainnet") return bad("This is a TEST payment code (test network). VYRO pays on Solana mainnet only, so nothing was paid. Ask the business to switch to live payments.");
        const coin = String(q.get("coin") || "").toUpperCase();
        if (coin !== "USDC" && coin !== "SOL") return bad("This payment code uses a coin VYRO can't pay yet.");
        if (!COINS || !COINS.usable(coin)) return bad(coin + " payments are not set up in this app yet.");
        const to = q.get("to") || "", ref = q.get("ref") || "";
        if (!T.isValidSolanaAddress(to)) return bad("The business wallet in this code is not valid.");
        if (!T.isValidSolanaAddress(ref)) return bad("This payment code is damaged (bad reference).");
        const dec = coin === "USDC" ? (SOL.usdcDecimals || 6) : 9;
        if (parseInt(q.get("dec"), 10) !== dec) return bad("This payment code has the wrong number format.");
        const amt = q.get("amt") || "";
        if (!/^\d{1,18}$/.test(amt) || BigInt(amt) <= 0n) return bad("The amount in this code is not valid.");
        const units = BigInt(amt);
        if (coin === "USDC" && q.get("mint") !== SOL.usdcMint) return bad("This code asks for a different token than USDC.");
        const c = COINS.get(coin);
        if (units < T.parseAmount(c.min, c.decimals).units) return bad("The minimum payment is " + c.min + " " + coin + ".");
        if (units > T.parseAmount(c.max, c.decimals).units) return bad("This is above the " + c.max + " " + coin + " per-payment limit in VYRO.");
        const usd = parseInt(q.get("usd"), 10);
        if (coin === "USDC" && Number.isFinite(usd) && BigInt(usd) * 10000n !== units) return bad("The dollar amount and the USDC amount in this code do not match. Do not pay it.");
        return { ok: true, d: { coin: coin, to: to, ref: ref, units: units, dec: dec, inv: clean(q.get("inv"), 30), biz: clean(q.get("biz"), 60) || "Business", usd: Number.isFinite(usd) ? usd : null } };
    }

    function split(d) {
        const fee = T.feeUnits(d.units, BIZ_FEE_BPS);
        return { fee: fee, biz: d.units - fee };
    }

    // ---------- build the unsigned payment ----------
    async function build(d, sender) {
        const treasury = COINS.feeAddress(d.coin);
        if (!treasury) throw userError("Setup problem: no VYRO fee address for " + d.coin + " in js/config.js.");
        if (sender === treasury) throw userError("This wallet is VYRO's own fee wallet. Pick a different wallet to pay with.");
        if (d.to === treasury) throw userError("This payment code is not valid (it pays VYRO's fee wallet).");
        if (d.to === sender) throw userError("You can't pay your own wallet.");
        const s = split(d);
        if (s.biz <= 0n) throw userError("This amount is too small to split.");
        const common = { connection: getConn(), sender: sender, recipient: d.to, units: s.biz, feeUnits: s.fee, feeRecipient: treasury, reference: d.ref };
        let built;
        try {
            built = d.coin === "SOL" ? await T.buildSolTransfer(common) : await T.buildUsdcTransfer(Object.assign({ config: SOL }, common));
        } catch (e) {
            if (e.code === "INSUFFICIENT_USDC" || e.code === "INSUFFICIENT_SOL") throw userError(e.message);
            console.error("VYRO biz build error:", e);
            throw userError("Could not reach the Solana network. Please try again in a moment.");
        }
        // The customer must be charged exactly what the code says, no more.
        if (built.totalUnits !== d.units) throw userError("Internal check failed: the total did not match the code. Nothing was sent.");
        return built;
    }

    function checkBuild() {
        if (!T || !T.supportsReference) return "Setup problem: js/transfer.js on your site is an old version. Replace it with the latest file, wait a minute, then reload.";
        if (!window.VYROWallet || !COINS) return "Payment system is unavailable.";
        return null;
    }

    function activeWalletFor(coin) {
        if (!VYROWallet.isConnected()) throw userError("Connect a wallet first (Wallets), then scan again.");
        const w = VYROWallet.getActiveWallet();
        if (!w || !w.address) throw userError("Pick the wallet you want to pay with in Wallets, then scan again.");
        if (!COINS.walletCan(w, coin)) throw userError("This wallet can't send " + coin + ". Pick another wallet.");
        return w;
    }

    // ---------- views ----------
    function view(name) {
        ["scan", "confirm", "done"].forEach(function (v) { const el = $("bizpay-" + v); if (el) el.hidden = v !== name; });
        if (name !== "scan") stopScan();
    }
    function say(id, t, isErr) { const el = $(id); if (el) { el.textContent = t || ""; el.classList.toggle("bizpay-err", !!isErr); } }

    async function handleText(text) {
        const r = parseCode(text);
        if (!r.ok) { say("bizpay-scan-msg", r.error, true); return false; }
        const probe = checkBuild();
        if (probe) { say("bizpay-scan-msg", probe, true); return false; }
        stopScan();
        say("bizpay-scan-msg", "Checking...", false);
        try {
            const wallet = activeWalletFor(r.d.coin);
            const built = await build(r.d, wallet.address);
            const s = split(r.d);
            pending = { d: r.d, wallet: wallet };
            const dec = r.d.dec, coin = r.d.coin;
            $("bizpay-biz").textContent = r.d.biz;
            $("bizpay-inv").textContent = r.d.inv || "-";
            $("bizpay-amount").textContent = T.formatUnits(r.d.units, dec) + " " + coin + (r.d.usd != null ? "  (about $" + (r.d.usd / 100).toFixed(2) + ")" : "");
            $("bizpay-to").textContent = short(r.d.to);
            $("bizpay-wallet").textContent = (wallet.provider || wallet.type || "Wallet") + " - " + short(wallet.address);
            $("bizpay-note").textContent = "You pay " + T.formatUnits(r.d.units, dec) + " " + coin + " in total. " +
                T.formatUnits(s.biz, dec) + " goes to the business and " + T.formatUnits(s.fee, dec) + " is VYRO's 2% fee, which the business pays. " +
                "Network fee: about 0.000005 SOL from your wallet." +
                (built.createsRecipientAccount ? " About " + (built.rentLamports / 1e9).toFixed(5) + " SOL is also needed once to open the business's USDC account." : "");
            say("bizpay-confirm-msg", "", false);
            view("confirm");
        } catch (e) {
            console.error("VYRO biz check failed:", e);
            view("scan");
            say("bizpay-scan-msg", e.userFacing ? e.message : "Unable to prepare this payment. Please try again.", true);
        }
        return true;
    }

    async function pay() {
        if (busy || !pending) return;
        busy = true;
        const btn = $("bizpay-pay-btn"), label = btn.textContent;
        btn.disabled = true;
        const stage = function (t) { btn.textContent = t.toUpperCase(); };
        try {
            const d = pending.d, wallet = pending.wallet, sender = wallet.address;
            stage("Preparing...");
            const built = await build(d, sender);          // fresh blockhash, fresh balance check
            stage("Approve in your wallet...");
            let result;
            try { result = await VYROWallet.requestSignature(built.transaction, sender); }
            catch (e) {
                if (VYROWallet.isUserRejection(e)) throw userError("You declined the request in your wallet. No payment was made.");
                throw userError(e.message || "Your wallet could not sign this payment.");
            }
            let id = result.signature;
            if (!id) {
                stage("Submitting...");
                try { id = await getConn().sendRawTransaction(result.signedRaw, { skipPreflight: false, preflightCommitment: "confirmed" }); }
                catch (e) { console.error("VYRO biz send error:", e); throw userError("The network rejected this payment: " + (e.message || "unknown error") + ". No funds were moved."); }
            }
            saveRecord(d, id, sender);
            stage("Confirming...");
            const final = await waitForConfirmation(id, built.lastValidBlockHeight);
            const dec = d.dec;
            const done = $("bizpay-done-text");
            if (final === "Failed") {
                done.textContent = "The payment failed on Solana. No " + d.coin + " was moved.";
            } else {
                done.textContent = T.formatUnits(d.units, dec) + " " + d.coin + " paid to " + d.biz + (d.inv ? " (invoice " + d.inv + ")" : "") + ". " +
                    (final === "Confirmed" ? "Confirmed on Solana. The business's invoice updates by itself." : "Submitted. It is still confirming; the business's invoice updates once it finishes.");
            }
            const link = $("bizpay-done-link");
            link.href = COINS.explorerTxUrl(d.coin, id); link.hidden = false;
            pending = null;
            view("done");
        } catch (e) {
            console.error("VYRO biz payment failed:", e);
            say("bizpay-confirm-msg", e.userFacing ? e.message : "Your payment could not be completed. If your wallet shows a pending transaction, check it there before retrying.", true);
        } finally {
            busy = false; btn.disabled = false; btn.textContent = label;
        }
    }

    async function waitForConfirmation(signature, lastValidBlockHeight) {
        const c = getConn(), deadline = Date.now() + 75000;
        while (Date.now() < deadline) {
            try {
                const res = await c.getSignatureStatuses([signature], { searchTransactionHistory: false });
                const st = res && res.value && res.value[0];
                if (st) {
                    if (st.err) return "Failed";
                    if (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized") return "Confirmed";
                }
                if (lastValidBlockHeight && !st && (await c.getBlockHeight("confirmed")) > lastValidBlockHeight) return "Failed";
            } catch (e) { /* transient: keep polling */ }
            await new Promise(function (r) { setTimeout(r, 2000); });
        }
        return "Submitted";
    }

    // Best-effort receipt in the sender's own history. The blockchain stays the source of truth.
    function saveRecord(d, id, sender) {
        try {
            const me = firebaseAuth.currentUser;
            if (!me) return;
            firebaseDB.collection("payments").doc(id).set({
                id: id, fromUid: me.uid, fromUsername: (VYROWallet.getUsername && VYROWallet.getUsername()) || "",
                toUid: "", toUsername: d.biz, fromWallet: sender, recipientAddress: d.to,
                amount: T.formatUnits(d.units, d.dec), asset: d.coin, network: COINS.get(d.coin).network,
                status: "Submitted", type: "Send", businessPayment: true, invoice: d.inv,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            }).catch(function (e) { console.warn("VYRO: could not save history", e); });
        } catch (e) { console.warn("VYRO: could not save history", e); }
    }

    // ---------- camera scanning ----------
    function loadJsQr() {
        if (window.jsQR) return Promise.resolve();
        if (jsqrLoading) return jsqrLoading;
        jsqrLoading = new Promise(function (res, rej) {
            const s = document.createElement("script");
            s.src = "https://unpkg.com/jsqr@1.4.0/dist/jsQR.js"; s.crossOrigin = "anonymous";
            s.onload = res; s.onerror = function () { rej(new Error("scanner library failed to load")); };
            document.head.appendChild(s);
        });
        return jsqrLoading;
    }

    function stopScan() {
        if (timer) { clearInterval(timer); timer = null; }
        if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; }
        const v = $("bizpay-video"); if (v) { v.srcObject = null; v.hidden = true; }
        const b = $("bizpay-cam-btn"); if (b) b.hidden = false;
    }

    async function startScan() {
        say("bizpay-scan-msg", "", false);
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            say("bizpay-scan-msg", "The camera isn't available here. Paste the payment link below instead.", true); return;
        }
        try {
            stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        } catch (e) {
            say("bizpay-scan-msg", "Camera permission was denied or isn't available. Paste the payment link below instead.", true); return;
        }
        const video = $("bizpay-video");
        video.srcObject = stream; video.hidden = false; $("bizpay-cam-btn").hidden = true;
        try { await video.play(); } catch (e) { /* user gesture already given */ }
        let detector = null;
        if ("BarcodeDetector" in window) { try { detector = new BarcodeDetector({ formats: ["qr_code"] }); } catch (e) { detector = null; } }
        if (!detector) {
            try { await loadJsQr(); } catch (e) { stopScan(); say("bizpay-scan-msg", "Could not start the scanner. Paste the payment link below instead.", true); return; }
        }
        const canvas = document.createElement("canvas"), ctx2 = canvas.getContext("2d", { willReadFrequently: true });
        let working = false;
        timer = setInterval(async function () {
            if (working || !video.videoWidth) return;
            working = true;
            try {
                let text = null;
                if (detector) {
                    const codes = await detector.detect(video);
                    if (codes && codes.length) text = codes[0].rawValue;
                } else {
                    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
                    ctx2.drawImage(video, 0, 0, canvas.width, canvas.height);
                    const img = ctx2.getImageData(0, 0, canvas.width, canvas.height);
                    const code = window.jsQR(img.data, img.width, img.height);
                    if (code && code.data) text = code.data;
                }
                if (text && /^vyro:\/\//i.test(text)) await handleText(text);
            } catch (e) { /* keep scanning */ }
            working = false;
        }, 350);
    }

    // ---------- wiring ----------
    function open() {
        pending = null; $("bizpay-paste").value = ""; say("bizpay-scan-msg", "", false);
        $("bizpay-done-link").hidden = true;
        view("scan");
        window.showScreen($("bizpay-screen"));
    }
    function init() {
        const go = function () { stopScan(); window.showScreen($("home-screen")); };
        const homeBtn = $("home-scan-btn"); if (homeBtn) homeBtn.addEventListener("click", open);
        ["bizpay-back-btn", "bizpay-logo-btn", "bizpay-cancel-btn", "bizpay-done-btn"].forEach(function (id) { const b = $(id); if (b) b.addEventListener("click", go); });
        const cam = $("bizpay-cam-btn"); if (cam) cam.addEventListener("click", startScan);
        const use = $("bizpay-paste-btn"); if (use) use.addEventListener("click", function () { handleText($("bizpay-paste").value); });
        const payBtn = $("bizpay-pay-btn"); if (payBtn) payBtn.addEventListener("click", pay);
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();

    window.VYROBizPay = { version: "2026-10-23-r1", parseCode: parseCode, split: split, open: open };
})();
