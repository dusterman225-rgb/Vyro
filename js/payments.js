// =========================================================
// VYRO — PAYMENT ENGINE (non-custodial)
// =========================================================
// Flow:  quote()  → resolves @username → address, checks balances, builds a preview
//        submit() → rebuilds a fresh unsigned tx, hands it to the USER's wallet to sign,
//                   broadcasts/confirms it, and records it in the sender's own history.
//
// VYRO never holds funds, never holds keys and never signs. If the user declines in
// their wallet, nothing happens.
// =========================================================
(function () {
    "use strict";

    const CFG = window.VYRO_CONFIG;
    const SOL = CFG.solana;
    const FEE = CFG.fee || {};
    const ETHC = CFG.ethereum || {};
    const COINS = window.VYROCoins;

    let pending = null;      // in-memory only: a half-finished payment should not outlive the tab
    let connection = null;
    let inFlight = false;

    function getConnection() {
        if (!window.solanaWeb3) throw new Error("Solana library failed to load. Check your connection and reload.");
        if (!connection) connection = new solanaWeb3.Connection(SOL.rpcUrl, "confirmed");
        return connection;
    }

    // ---------- pending payment ----------
    function setPendingPayment(p) { pending = p ? Object.assign({}, p) : null; }
    function getPendingPayment() { return pending ? Object.assign({}, pending) : null; }
    function clearPendingPayment() { pending = null; }

    // ---------- validation ----------
    function assetOf(p) { return (p && p.asset) || "USDC"; }

    // Minimum payment text for a coin ("1" for USDC). config.js can override per coin.
    function minAmountText(asset) { return COINS.get(asset || "USDC").min; }

    function validatePayment(p) {
        if (!p) return { valid: false, error: "No payment is waiting for confirmation." };
        if (!VYROTransfer.isValidUsername(VYROTransfer.normalizeUsername(p.recipient))) return { valid: false, error: "Recipient username is invalid." };
        const asset = assetOf(p);
        const coin = COINS.get(asset);
        if (!coin || !COINS.enabled(asset)) return { valid: false, error: "This payment asset is not supported yet." };
        if (!COINS.usable(asset)) return { valid: false, error: "Setup problem: " + asset + " payments are not fully set up yet (no VYRO fee address for " + asset + " in js/config.js)." };
        if (p.network && String(p.network).toLowerCase() !== coin.network.toLowerCase()) return { valid: false, error: "This payment network is not supported yet." };
        const amt = VYROTransfer.parseAmount(p.amount, coin.decimals);
        if (!amt.ok) return { valid: false, error: amt.error.replace("USDC supports", asset + " supports") };
        if (amt.units < VYROTransfer.parseAmount(coin.min, coin.decimals).units)
            return { valid: false, error: "The minimum payment is " + coin.min + " " + asset + "." };
        if (amt.units > VYROTransfer.parseAmount(coin.max, coin.decimals).units)
            return { valid: false, error: "Amount is above the " + coin.max + " " + asset + " per-payment limit." };
        return { valid: true, units: amt.units, asset: asset, coin: coin, error: null };
    }

    function validateWallet(address, asset) {
        if (!window.VYROWallet) return { valid: false, error: "VYRO wallet system is unavailable." };
        if (!VYROWallet.isConnected()) return { valid: false, error: "Please connect a wallet before sending." };
        const wallet = address
            ? VYROWallet.getWallets().find(function (w) { return w.address === address; })
            : VYROWallet.getActiveWallet();
        if (!wallet || !wallet.address) return { valid: false, error: "The selected wallet is not available." };
        if (asset && !COINS.walletAddressFor(wallet, asset))
            return { valid: false, error: "This wallet did not share a " + COINS.get(asset).network + " account with VYRO, so it cannot send " + asset + ". Pick another coin or wallet." };
        return { valid: true, wallet: wallet, error: null };
    }

    // ---------- recipient resolution ----------
    async function resolveRecipient(rawUsername, asset) {
        asset = asset || "USDC";
        const name = VYROTransfer.normalizeUsername(rawUsername);
        if (!VYROTransfer.isValidUsername(name)) throw userError("Enter a valid VYRO username.");
        let snap;
        try { snap = await firebaseDB.collection("usernames").doc(name).get(); }
        catch (e) { console.error("VYRO resolve error:", e); throw userError("Could not look up @" + name + ". Check your connection and try again."); }
        if (!snap.exists) throw userError("@" + name + " was not found on VYRO.");
        const data = snap.data() || {};
        const accepted = COINS.acceptedFromDirectory(data);
        const address = COINS.addressFromDirectory(data, asset);
        if (!address) {
            if (!accepted.length) throw userError("@" + name + " has not set up a receiving wallet yet.");
            throw userError("@" + name + " does not accept " + asset + ". They accept: " + accepted.join(", ") + ".");
        }
        const me = firebaseAuth.currentUser;
        if (me && data.uid === me.uid) throw userError("You can't send a payment to yourself.");
        return { username: name, uid: data.uid, address: address, accepts: accepted, verificationWord: data.verificationWord || "" };
    }

    function userError(message) { const e = new Error(message); e.userFacing = true; return e; }

    // ---------- quote (shown on the confirm screen) ----------
    async function quote() {
        const p = getPendingPayment();
        const pv = validatePayment(p);
        if (!pv.valid) throw userError(pv.error);
        const wv = validateWallet(p.fromWallet, pv.asset);
        if (!wv.valid) throw userError(wv.error);

        const to = await resolveRecipient(p.recipient, pv.asset);
        const built = await buildForAsset(pv.asset, wv.wallet, to.address, pv.units);

        pending = Object.assign({}, p, {
            asset: pv.asset,
            network: pv.coin.network,
            recipientAddress: to.address,
            recipientUid: to.uid,
            recipientWord: to.verificationWord,
            units: pv.units.toString(),
            createsRecipientAccount: !!built.createsRecipientAccount,
            createsFeeAccount: !!built.createsFeeAccount,
            feeUnits: built.feeUnits.toString(),
            totalUnits: built.totalUnits.toString(),
            feeBps: built.feeUnits > 0n ? FEE.bps : 0,
            rentLamports: built.rentLamports || 0,
            feeLamports: built.feeLamports || 0,
            gasWei: built.gasWei ? built.gasWei.toString() : ""
        });
        return getPendingPayment();
    }

    // VYRO's service fee for a payment of `units`, paid by the sender on top. Zero when no fee is
    // configured, and when the fee wallet itself is the sender (it does not pay itself).
    function feeFor(senderAddress, units, asset) {
        const treasury = COINS.feeAddress(asset || "USDC");
        if (!FEE.bps || !treasury) return 0n;
        if (String(senderAddress).toLowerCase() === String(treasury).toLowerCase()) return 0n;
        return VYROTransfer.feeUnits(units, FEE.bps);
    }

    async function buildForAsset(asset, wallet, recipientAddress, units) {
        if (asset === "ETH") return buildEth(COINS.walletAddressFor(wallet, "ETH"), recipientAddress, units);
        return buildWithFriendlyErrors(asset, wallet.address, recipientAddress, units);
    }

    async function buildWithFriendlyErrors(asset, sender, recipient, units) {
        try {
            const common = {
                connection: getConnection(), sender: sender, recipient: recipient, units: units,
                feeUnits: feeFor(sender, units, asset), feeRecipient: COINS.feeAddress(asset)
            };
            if (asset === "SOL") return await VYROTransfer.buildSolTransfer(common);
            return await VYROTransfer.buildUsdcTransfer(Object.assign({ config: SOL }, common));
        } catch (e) {
            if (e.code === "INSUFFICIENT_USDC" || e.code === "INSUFFICIENT_SOL") throw userError(e.message);
            console.error("VYRO build error:", e);
            throw userError("Could not reach the Solana network. Please try again in a moment.");
        }
    }

    // ---------- Ethereum (native ETH), signed in the user's wallet through WalletConnect ----------
    async function ethRpc(method, params) {
        const res = await fetch(ETHC.rpcUrl, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: method, params: params || [] })
        });
        const j = await res.json();
        if (j.error) throw new Error(j.error.message || "Ethereum network error");
        return j.result;
    }

    function weiHex(units) { return "0x" + BigInt(units).toString(16); }

    // Checks the balance and builds the preview. ETH has no way to put two payments in one
    // transaction, so the payment and the VYRO fee are two approvals in the wallet.
    async function buildEth(sender, recipient, units) {
        const fee = feeFor(sender, units, "ETH");
        const total = units + fee;
        let balance, gasPrice;
        try {
            balance = BigInt(await ethRpc("eth_getBalance", [sender, "latest"]));
            gasPrice = BigInt(await ethRpc("eth_gasPrice", []));
        } catch (e) {
            console.error("VYRO ETH read error:", e);
            throw userError("Could not reach the Ethereum network. Please try again in a moment.");
        }
        const txCount = fee > 0n ? 2n : 1n;
        const gasWei = 21000n * gasPrice * txCount * 2n;   // x2 headroom so a busy network does not fail it
        if (balance < total + gasWei) {
            throw userError("Insufficient ETH. This payment needs " + VYROTransfer.formatUnits(total, 18) + " ETH" +
                (fee > 0n ? " (" + VYROTransfer.formatUnits(units, 18) + " + " + VYROTransfer.formatUnits(fee, 18) + " VYRO fee)" : "") +
                " plus about " + VYROTransfer.formatUnits(gasWei, 18) + " ETH for network fees, and this wallet holds " +
                VYROTransfer.formatUnits(balance, 18) + " ETH.");
        }
        return { feeUnits: fee, totalUnits: total, gasWei: gasWei, createsRecipientAccount: false, createsFeeAccount: false, rentLamports: 0, feeLamports: 0 };
    }

    async function requestEthSend(solAddress, from, to, units) {
        if (!VYROWallet.wcRequest) throw new Error("Setup problem: js/wallet.js is out of date (it has no Ethereum signing). Replace it with the latest edits and reload.");
        const hash = await VYROWallet.wcRequest(solAddress, ETHC.chainId, {
            method: "eth_sendTransaction",
            params: [{ from: from, to: to, value: weiHex(units) }]
        });
        if (typeof hash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new Error("The wallet returned no transaction.");
        return hash;
    }

    async function waitForEthConfirmation(hash) {
        const deadline = Date.now() + 150000;
        while (Date.now() < deadline) {
            try {
                const r = await ethRpc("eth_getTransactionReceipt", [hash]);
                if (r) return r.status === "0x1" ? "Confirmed" : "Failed";
            } catch (e) { /* transient RPC error: keep polling */ }
            await new Promise(function (res) { setTimeout(res, 4000); });
        }
        return "Submitted";
    }

    // ---------- submit ----------
    // onStage(text) lets the UI show progress: "Preparing…", "Waiting for your wallet…", …
    async function submit(onStage) {
        if (inFlight) throw userError("A payment is already in progress.");
        inFlight = true;
        const stage = typeof onStage === "function" ? onStage : function () {};
        try {
            const p = getPendingPayment();
            const pv = validatePayment(p);
            if (!pv.valid) throw userError(pv.error);
            const wv = validateWallet(p.fromWallet, pv.asset);
            if (!wv.valid) throw userError(wv.error);
            const asset = pv.asset;
            const sender = wv.wallet.address;

            stage("Checking recipient…");
            await checkRequest(p);
            // Re-resolve right before signing: if the recipient changed their address
            // since the confirm screen was shown, stop rather than pay a different address.
            const to = await resolveRecipient(p.recipient, asset);
            if (p.recipientAddress && to.address !== p.recipientAddress)
                throw userError("@" + to.username + " changed their receiving wallet. Please review the payment again.");

            stage("Preparing…");
            const built = await buildForAsset(asset, wv.wallet, to.address, pv.units);

            let id, lastValidBlockHeight = null, feeNote = "";
            if (asset === "ETH") {
                const from = COINS.walletAddressFor(wv.wallet, "ETH");
                stage("Approve in your wallet…");
                try { id = await requestEthSend(sender, from, to.address, pv.units); }
                catch (e) {
                    if (VYROWallet.isUserRejection(e)) throw userError("You declined the request in your wallet. No payment was made.");
                    throw userError(e.message || "Your wallet could not sign this payment.");
                }
            } else {
                stage("Approve in your wallet…");
                let result;
                try { result = await VYROWallet.requestSignature(built.transaction, sender); }
                catch (e) {
                    if (VYROWallet.isUserRejection(e)) throw userError("You declined the request in your wallet. No payment was made.");
                    throw userError(e.message || "Your wallet could not sign this payment.");
                }
                id = result.signature;
                if (!id) {
                    stage("Submitting…");
                    try {
                        id = await getConnection().sendRawTransaction(result.signedRaw, { skipPreflight: false, preflightCommitment: "confirmed" });
                    } catch (e) {
                        console.error("VYRO send error:", e);
                        throw userError("The network rejected this payment: " + (e.message || "unknown error") + ". No funds were moved.");
                    }
                }
                lastValidBlockHeight = built.lastValidBlockHeight;
            }

            // One shared receipt per payment. The sender writes it; both the sender and the
            // recipient can read it (see firestore.rules). The blockchain stays the source of truth.
            const me = firebaseAuth.currentUser;
            const record = {
                id: id,
                fromUid: me.uid,
                fromUsername: (VYROWallet.getUsername && VYROWallet.getUsername()) || "",
                toUid: to.uid,
                toUsername: to.username,
                fromWallet: sender,
                recipientAddress: to.address,
                amount: VYROTransfer.formatUnits(pv.units, pv.coin.decimals),
                asset: asset,
                network: pv.coin.network,
                status: "Submitted",
                type: "Send"
            };
            saveRecord(record);
            if (p.requestId) markRequestPaid(p.requestId, id);

            // Ethereum: the VYRO fee is a second approval, asked for right after the payment.
            if (asset === "ETH" && built.feeUnits > 0n) {
                stage("Approve the VYRO fee in your wallet…");
                try { await requestEthSend(sender, COINS.walletAddressFor(wv.wallet, "ETH"), COINS.feeAddress("ETH"), built.feeUnits); }
                catch (e) { feeNote = "Your payment was sent, but the VYRO fee was not approved."; }
            }

            stage("Confirming on " + pv.coin.network + "…");
            const final = asset === "ETH" ? await waitForEthConfirmation(id) : await waitForConfirmation(id, lastValidBlockHeight);
            if (final !== "Submitted") updateRecordStatus(id, final);

            clearPendingPayment();
            return Object.assign({}, record, {
                requestId: p.requestId || null,
                recipient: "@" + to.username,
                status: final,
                note: feeNote,
                fee: VYROTransfer.formatUnits(built.feeUnits, pv.coin.decimals)   // shown on the success screen; not stored
            });
        } finally {
            inFlight = false;
        }
    }

    // Polls the chain instead of trusting the wallet: the blockchain is the source of truth.
    async function waitForConfirmation(signature, lastValidBlockHeight) {
        const conn = getConnection();
        const deadline = Date.now() + 75000;
        while (Date.now() < deadline) {
            try {
                const res = await conn.getSignatureStatuses([signature], { searchTransactionHistory: false });
                const st = res && res.value && res.value[0];
                if (st) {
                    if (st.err) return "Failed";
                    if (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized") return "Confirmed";
                }
                if (lastValidBlockHeight && (await conn.getBlockHeight("confirmed")) > lastValidBlockHeight && !st) return "Failed";
            } catch (e) { /* transient RPC error: keep polling */ }
            await new Promise(function (r) { setTimeout(r, 2000); });
        }
        return "Submitted"; // still pending; the history screen links to the explorer
    }

    // ---------- history (sent AND received) ----------
    // Each payment is one document in `payments/{signature}`. The sender writes it after
    // signing; the sender and the recipient can both read it. Nobody else can.
    function paymentsCol() { return firebaseDB.collection("payments"); }

    function saveRecord(record) {
        try {
            paymentsCol().doc(record.id).set(Object.assign({}, record, { createdAt: firebase.firestore.FieldValue.serverTimestamp() }))
                .catch(function (e) { console.warn("VYRO: could not save history", e); });
        } catch (e) { console.warn("VYRO: could not save history", e); }
    }
    function updateRecordStatus(signature, status) {
        try { paymentsCol().doc(signature).update({ status: status }).catch(function (e) { console.warn("VYRO: status update failed", e); }); }
        catch (e) { /* history is best-effort; the chain is the source of truth */ }
    }

    function millis(t) { return t && typeof t.toMillis === "function" ? t.toMillis() : Date.now(); }

    // Turns a stored receipt into what the screens need, from THIS user's point of view.
    function decorate(d, myUid) {
        const sent = d.fromUid === myUid;
        return Object.assign({}, d, {
            direction: sent ? "sent" : "received",
            type: sent ? "Sent" : "Received",
            counterparty: "@" + ((sent ? d.toUsername : d.fromUsername) || "unknown"),
            recipient: "@" + (d.toUsername || "unknown"),   // kept for older screens
            time: millis(d.createdAt)
        });
    }

    // Does this receipt match what really happened on chain? A recipient should not trust
    // a receipt just because someone wrote it: check the transfer itself.
    async function verifyReceived(rec) {
        try {
            const asset = rec.asset || "USDC";
            const coin = COINS.get(asset) || COINS.get("USDC");
            const units = VYROTransfer.parseAmount(rec.amount, coin.decimals);
            const age = Date.now() - rec.time;

            if (asset === "ETH") {
                const tx = await ethRpc("eth_getTransactionByHash", [rec.id]);
                if (!tx) return age > 120000 ? "Unverified" : null;
                if (!units.ok || String(tx.to || "").toLowerCase() !== String(rec.recipientAddress || "").toLowerCase() || BigInt(tx.value) !== units.units) return "Unverified";
                const r = await ethRpc("eth_getTransactionReceipt", [rec.id]);
                if (!r) return null;
                return r.status === "0x1" ? "Confirmed" : "Failed";
            }

            const conn = getConnection();
            const tx = await conn.getParsedTransaction(rec.id, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
            if (!tx) return age > 120000 ? "Unverified" : null;   // not visible yet
            if (tx.meta && tx.meta.err) return "Failed";
            if (asset === "SOL") {
                const okSol = units.ok && tx.transaction.message.instructions.some(function (ix) {
                    const p = ix.parsed;
                    return p && p.type === "transfer" && p.info && p.info.destination === rec.recipientAddress &&
                        String(p.info.lamports) === units.units.toString();
                });
                return okSol ? "Confirmed" : "Unverified";
            }
            const w = window.solanaWeb3;
            const ata = VYROTransfer.deriveAta(new w.PublicKey(rec.recipientAddress), new w.PublicKey(SOL.usdcMint)).toBase58();
            const ok = units.ok && tx.transaction.message.instructions.some(function (ix) {
                const p = ix.parsed;
                return p && p.type === "transferChecked" && p.info &&
                    p.info.destination === ata &&
                    p.info.mint === SOL.usdcMint &&
                    p.info.tokenAmount && p.info.tokenAmount.amount === units.units.toString();
            });
            return ok ? "Confirmed" : "Unverified";
        } catch (e) { return null; }   // network trouble: leave the stored status alone
    }

    // Updates "Submitted" receipts from the chain, so a payment shows Confirmed even if the
    // sender closed the app before it finished.
    async function refreshStatuses(list, myUid) {
        const open = list.filter(function (r) { return r.status === "Submitted"; });
        const sol = open.filter(function (r) { return (r.asset || "USDC") !== "ETH"; });
        const eth = open.filter(function (r) { return r.asset === "ETH"; });
        if (sol.length) {
            try {
                const res = await getConnection().getSignatureStatuses(sol.map(function (r) { return r.id; }), { searchTransactionHistory: true });
                sol.forEach(function (r, i) {
                    const st = res.value[i];
                    if (!st) return;
                    const next = st.err ? "Failed" : (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized") ? "Confirmed" : null;
                    if (!next) return;
                    r.status = next;
                    if (r.fromUid === myUid) updateRecordStatus(r.id, next);   // only the sender may write it back
                });
            } catch (e) { /* leave statuses as stored */ }
        }
        await Promise.all(eth.map(async function (r) {
            try {
                const rc = await ethRpc("eth_getTransactionReceipt", [r.id]);
                if (!rc) return;
                const next = rc.status === "0x1" ? "Confirmed" : "Failed";
                r.status = next;
                if (r.fromUid === myUid) updateRecordStatus(r.id, next);
            } catch (e) { /* leave status as stored */ }
        }));
    }

    async function loadHistory() {
        const me = firebaseAuth.currentUser;
        if (!me) return [];
        // Two simple queries (no composite index needed), merged and sorted here.
        const results = await Promise.all([
            paymentsCol().where("fromUid", "==", me.uid).limit(100).get(),
            paymentsCol().where("toUid", "==", me.uid).limit(100).get()
        ]);
        const byId = {};
        results.forEach(function (snap) { snap.docs.forEach(function (d) { byId[d.id] = d.data(); }); });
        const list = Object.keys(byId).map(function (id) { return decorate(byId[id], me.uid); });
        list.sort(function (a, b) { return b.time - a.time; });
        const recent = list.slice(0, 50);

        await refreshStatuses(recent, me.uid);
        await Promise.all(recent.filter(function (r) { return r.direction === "received" && r.status !== "Failed"; }).map(async function (r) {
            const v = await verifyReceived(r);
            if (v === "Unverified" || v === "Failed") r.status = v;
            else if (v === "Confirmed" && r.status === "Submitted") r.status = "Confirmed";
        }));
        return recent;
    }


    // ---------- live username search ----------
    // Partial match on the start of a username. Reads the name-only index, never the
    // directory itself, so verification words and addresses are not exposed by a search.
    async function searchUsernames(prefix) {
        const p = VYROTransfer.normalizeUsername(prefix);
        if (p.length < 2 || !/^[a-z0-9_]+$/.test(p)) return [];
        const me = (VYROWallet.getUsername && VYROWallet.getUsername()) || "";
        const snap = await firebaseDB.collection("usernameIndex")
            .orderBy(firebase.firestore.FieldPath.documentId())
            .startAt(p).endAt(p + "\uf8ff").limit(6).get();
        return snap.docs.map(function (d) { return d.id; }).filter(function (n) { return n !== me; });
    }

    // ---------- payment requests ----------
    // A request is a document the requester writes and the payer can read. It moves no money:
    // the payer must still approve and sign a normal VYRO payment in their own wallet.
    function requestsCol() { return firebaseDB.collection("requests"); }

    function amountProblem(text, asset) {
        const coin = COINS.get(asset);
        if (!coin || !COINS.usable(asset)) return { error: asset + " requests are not available yet." };
        const amt = VYROTransfer.parseAmount(text, coin.decimals);
        if (!amt.ok) return { error: amt.error.replace("USDC supports", asset + " supports") };
        if (amt.units < VYROTransfer.parseAmount(coin.min, coin.decimals).units) return { error: "The minimum is " + coin.min + " " + asset + "." };
        if (amt.units > VYROTransfer.parseAmount(coin.max, coin.decimals).units) return { error: "The maximum is " + coin.max + " " + asset + "." };
        return { units: amt.units, coin: coin };
    }

    async function createRequest(rawUsername, amountText, asset) {
        asset = asset || "USDC";
        const me = firebaseAuth.currentUser;
        if (!me) throw userError("Please log in again.");
        const myName = VYROWallet.getUsername && VYROWallet.getUsername();
        if (!myName) throw userError("Your username is not loaded yet. Please try again.");
        const mine = await COINS.loadReceive();
        if (!mine || !mine[asset])
            throw userError("Turn on " + asset + " as a coin you receive first (Wallets → RECEIVES), so the money has somewhere to go.");

        const name = VYROTransfer.normalizeUsername(rawUsername);
        if (!VYROTransfer.isValidUsername(name)) throw userError("Enter a valid VYRO username.");
        const ap = amountProblem(amountText, asset);
        if (ap.error) throw userError(ap.error);

        let snap;
        try { snap = await firebaseDB.collection("usernames").doc(name).get(); }
        catch (e) { console.error("VYRO request lookup error:", e); throw userError("Could not look up @" + name + ". Check your connection and try again."); }
        if (!snap.exists) throw userError("@" + name + " was not found on VYRO.");
        const data = snap.data() || {};
        if (data.uid === me.uid) throw userError("You can't request money from yourself.");

        const doc = {
            fromUid: me.uid, fromUsername: myName,
            toUid: data.uid, toUsername: name,
            amount: VYROTransfer.formatUnits(ap.units, ap.coin.decimals),
            asset: asset, network: ap.coin.network, status: "Pending",
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        const ref = requestsCol().doc();
        try { await ref.set(doc); }
        catch (e) { console.error("VYRO request save error:", e); throw userError("Could not send the request. Please try again."); }
        return Object.assign({ id: ref.id }, doc);
    }

    async function loadRequests() {
        const me = firebaseAuth.currentUser;
        if (!me) return [];
        const results = await Promise.all([
            requestsCol().where("fromUid", "==", me.uid).limit(50).get(),
            requestsCol().where("toUid", "==", me.uid).limit(50).get()
        ]);
        const byId = {};
        results.forEach(function (snap) { snap.docs.forEach(function (d) { byId[d.id] = Object.assign({ id: d.id }, d.data()); }); });
        return Object.keys(byId).map(function (id) {
            const r = byId[id];
            const incoming = r.toUid === me.uid;
            return Object.assign({}, r, {
                direction: incoming ? "incoming" : "outgoing",
                counterparty: "@" + ((incoming ? r.fromUsername : r.toUsername) || "unknown"),
                time: millis(r.createdAt)
            });
        }).sort(function (a, b) { return b.time - a.time; });
    }

    // Payer declines (status Declined) or requester withdraws (status Cancelled).
    async function respondToRequest(id, status) {
        try { await requestsCol().doc(id).update({ status: status }); }
        catch (e) { console.error("VYRO request update error:", e); throw userError("Could not update the request. Please try again."); }
    }

    function markRequestPaid(id, signature) {
        try { requestsCol().doc(id).update({ status: "Paid", paymentId: signature }).catch(function (e) { console.warn("VYRO: could not mark request paid", e); }); }
        catch (e) { /* the payment itself is on chain; the request status is a convenience */ }
    }

    // Right before signing: the request must still be open, addressed to this user, and unchanged.
    async function checkRequest(p) {
        if (!p.requestId) return;
        let snap;
        try { snap = await requestsCol().doc(p.requestId).get(); }
        catch (e) { throw userError("Could not check this request. Please try again."); }
        const r = snap.exists ? snap.data() : null;
        const me = firebaseAuth.currentUser;
        if (!r || !me || r.toUid !== me.uid) throw userError("This request is no longer available.");
        if (r.status !== "Pending") throw userError("This request was already " + String(r.status).toLowerCase() + ".");
        if (VYROTransfer.normalizeUsername(p.recipient) !== r.fromUsername || String(p.amount) !== r.amount || assetOf(p) !== (r.asset || "USDC"))
            throw userError("This request has changed. Please open it again.");
    }

    // ---------- balances (what the home screen shows) ----------
    // Reads the wallet's USDC and SOL (and ETH when the wallet shared an Ethereum account) from the chain.
    // address: the wallet's Solana account (or null); evmAddress: its Ethereum account (or null).
    async function getBalances(address, evmAddress) {
        const out = { usdc: null, sol: null, eth: null };
        if (address) {
            const conn = getConnection();
            const w = window.solanaWeb3;
            const owner = new w.PublicKey(address);
            const ata = VYROTransfer.deriveAta(owner, new w.PublicKey(SOL.usdcMint));
            let usdcUnits = 0n;
            try {
                const b = await conn.getTokenAccountBalance(ata, "confirmed");
                usdcUnits = BigInt(b.value.amount);
            } catch (e) {
                // No USDC account yet means a balance of zero. Anything else is a real error.
                if (!/could not find account/i.test(String(e && e.message))) throw e;
            }
            const lamports = await conn.getBalance(owner, "confirmed");
            out.usdc = VYROTransfer.formatUnits(usdcUnits, SOL.usdcDecimals);
            out.sol = lamports / 1e9;
        }
        if (evmAddress && COINS.enabled("ETH")) {
            try { out.eth = Number(BigInt(await ethRpc("eth_getBalance", [evmAddress, "latest"])) / 1000000000000n) / 1e6; }
            catch (e) { out.eth = null; }
        }
        return out;
    }

    function explorerUrl(id, asset) { return COINS.explorerTxUrl(asset || "USDC", id); }

    window.VYROPayments = {
        version: "2026-10-14-r6",   // app.js compares this to spot a stale copy on the site
        feeConfigured: !!(FEE.bps && FEE.treasuryAddress),
        minAmount: minAmountText,
        setPendingPayment, getPendingPayment, clearPendingPayment,
        validatePayment, validateWallet, resolveRecipient,
        quote, submit, loadHistory, getBalances, explorerUrl,
        searchUsernames, createRequest, loadRequests, respondToRequest
    };
})();
