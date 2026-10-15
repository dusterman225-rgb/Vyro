// =========================================================
// VYRO — COINS
// What VYRO can send and receive, the limits for each coin, which wallet sends which coin, and
// which wallet receives which coin.
//
//   USDC  on Solana    (a token)
//   SOL   native       (Solana)
//   ETH   native       (Ethereum; the wallet signs through WalletConnect)
//
// This file holds only PUBLIC data: coin settings and public addresses. No keys.
// =========================================================
(function () {
    "use strict";

    const CFG = window.VYRO_CONFIG || {};
    const FEE = CFG.fee || {};
    const ETHC = CFG.ethereum || {};
    const LIM = CFG.limits || {};
    const OVER = CFG.coins || {};

    const ORDER = ["USDC", "SOL", "ETH"];

    const defs = {
        USDC: { id: "USDC", label: "USDC", chain: "solana", network: "Solana", decimals: (CFG.solana && CFG.solana.usdcDecimals) || 6,
                min: LIM.minAmountPerPayment || "1", max: LIM.maxAmountPerPayment || "50" },
        SOL:  { id: "SOL", label: "SOL", chain: "solana", network: "Solana", decimals: 9, min: "0.01", max: "1" },
        ETH:  { id: "ETH", label: "ETH", chain: "ethereum", network: "Ethereum", decimals: 18, min: "0.001", max: "0.05" }
    };
    ORDER.forEach(function (id) {
        const o = OVER[id];
        if (!o) return;
        if (o.min) defs[id].min = String(o.min);
        if (o.max) defs[id].max = String(o.max);
    });

    // USDC and SOL are always on. ETH turns on only when an Ethereum RPC is configured.
    function enabled(id) {
        if (!defs[id]) return false;
        if (id === "ETH") return !!(ETHC.rpcUrl && ETHC.chainId);
        return true;
    }

    function feeAddress(id) {
        if (id === "ETH") return FEE.treasuryEthAddress || "";
        return FEE.treasuryAddress || "";
    }

    // A coin is usable when it is on AND, if a VYRO fee is set, that coin has a fee address.
    // (Otherwise the fee would silently be skipped for that coin.)
    function usable(id) {
        return enabled(id) && (!FEE.bps || !!feeAddress(id));
    }

    function list() { return ORDER.filter(enabled).map(function (id) { return defs[id]; }); }
    function get(id) { return defs[id] || null; }

    function isEvmAddress(a) { return typeof a === "string" && /^0x[0-9a-fA-F]{40}$/.test(a); }
    function isValidAddress(id, a) {
        if (!defs[id]) return false;
        return defs[id].chain === "ethereum" ? isEvmAddress(a) : VYROTransfer.isValidSolanaAddress(a);
    }

    // The address a wallet uses for a coin (null when the wallet cannot do that coin).
    function walletAddressFor(wallet, id) {
        if (!wallet || !defs[id]) return null;
        if (defs[id].chain === "ethereum") {
            if (isEvmAddress(wallet.evmAddress)) return wallet.evmAddress;
            return isEvmAddress(wallet.address) ? wallet.address : null;   // an Ethereum-only wallet
        }
        return VYROTransfer.isValidSolanaAddress(wallet.address) ? wallet.address : null;
    }
    function walletCan(wallet, id) { return usable(id) && !!walletAddressFor(wallet, id); }

    function explorerTxUrl(id, hash) {
        if (defs[id] && defs[id].chain === "ethereum") return (ETHC.explorerTxUrl || "https://etherscan.io/tx/") + encodeURIComponent(hash);
        return ((CFG.solana && CFG.solana.explorerTxUrl) || "https://solscan.io/tx/") + encodeURIComponent(hash) + ((CFG.solana && CFG.solana.explorerSuffix) || "");
    }

    // ---------- which coin each wallet SENDS (stored on this device) ----------
    function uid() { return (typeof firebaseAuth !== "undefined" && firebaseAuth.currentUser && firebaseAuth.currentUser.uid) || null; }
    function sendKey(address) { return "vyro:" + uid() + ":sendcoin:" + address; }

    function getSendCoin(wallet) {
        if (!wallet || !uid()) return "USDC";
        let saved = null;
        try { saved = localStorage.getItem(sendKey(wallet.address)); } catch (e) { /* storage blocked */ }
        return (saved && walletCan(wallet, saved)) ? saved : "USDC";
    }
    function setSendCoin(wallet, id) {
        if (!wallet || !uid() || !walletCan(wallet, id)) return false;
        try { localStorage.setItem(sendKey(wallet.address), id); } catch (e) { /* storage blocked */ }
        return true;
    }

    // ---------- which wallet RECEIVES which coin (published to the username directory) ----------
    // usernames/{name}.receive = { USDC: "<solana address>", SOL: "<solana address>", ETH: "0x…" }
    // An older entry with only `walletAddress` means: USDC and SOL go to that address.
    let receive = null;          // null until loaded
    let receiveFor = null;       // username the map belongs to
    const listeners = [];

    function onReceiveChange(fn) { if (typeof fn === "function") listeners.push(fn); }
    function emit() { listeners.forEach(function (fn) { try { fn(); } catch (e) { console.warn(e); } }); }

    function receiveFromDirectory(data) {
        if (data && data.receive && typeof data.receive === "object") {
            const out = {};
            ORDER.forEach(function (id) { if (data.receive[id] && isValidAddress(id, data.receive[id])) out[id] = data.receive[id]; });
            return out;
        }
        const out = {};
        if (data && data.walletAddress && VYROTransfer.isValidSolanaAddress(data.walletAddress)) { out.USDC = data.walletAddress; out.SOL = data.walletAddress; }
        return out;
    }

    function me() { return (window.VYROWallet && VYROWallet.getUsername && VYROWallet.getUsername()) || null; }

    async function loadReceive(force) {
        const name = me();
        if (!name) return null;
        if (!force && receive && receiveFor === name) return receive;
        try {
            const snap = await firebaseDB.collection("usernames").doc(name).get();
            const next = snap.exists ? receiveFromDirectory(snap.data() || {}) : {};
            const changed = JSON.stringify(next) !== JSON.stringify(receive) || receiveFor !== name;
            receive = next;
            receiveFor = name;
            if (changed) emit();
        } catch (e) { console.warn("VYRO: could not read receiving coins", e); return receive; }
        return receive;
    }
    function getReceive() { return Object.assign({}, receive || {}); }
    function resetReceive() { receive = null; receiveFor = null; }

    // Turn a coin on for one wallet (address given) or off (address null).
    async function setReceive(id, address) {
        const name = me();
        if (!name) throw new Error("Your username is not loaded yet. Please try again.");
        await loadReceive();
        const next = Object.assign({}, receive || {});
        if (address) {
            if (!isValidAddress(id, address)) throw new Error("That wallet cannot receive " + id + ".");
            next[id] = address;
        } else {
            delete next[id];
            if (!Object.keys(next).length) throw new Error("Keep at least one coin turned on, so people have a way to pay you.");
        }
        const update = { receive: next };
        // Older code reads `walletAddress`; keep it pointing at the first Solana coin you receive.
        const legacy = next.USDC || next.SOL;
        if (legacy) update.walletAddress = legacy;
        await firebaseDB.collection("usernames").doc(name).update(update);
        receive = next;
        receiveFor = name;
        emit();
        return next;
    }

    // What a sender needs: the address to pay for a coin, from a directory entry.
    function addressFromDirectory(data, id) { return receiveFromDirectory(data)[id] || null; }
    function acceptedFromDirectory(data) {
        const r = receiveFromDirectory(data);
        return ORDER.filter(function (id) { return r[id] && usable(id); });
    }

    window.VYROCoins = {
        version: "2026-10-14-r6",
        ORDER: ORDER,
        list: list, get: get, enabled: enabled, usable: usable, feeAddress: feeAddress,
        isValidAddress: isValidAddress, isEvmAddress: isEvmAddress,
        walletAddressFor: walletAddressFor, walletCan: walletCan,
        explorerTxUrl: explorerTxUrl,
        getSendCoin: getSendCoin, setSendCoin: setSendCoin,
        loadReceive: loadReceive, getReceive: getReceive, setReceive: setReceive, resetReceive: resetReceive, onReceiveChange: onReceiveChange,
        addressFromDirectory: addressFromDirectory, acceptedFromDirectory: acceptedFromDirectory
    };
})();
