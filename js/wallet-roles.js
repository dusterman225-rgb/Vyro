// =========================================================
// VYRO — WALLET CARDS WITH SEND / RECEIVE INDICATORS
// Draws every connected wallet with a bright SEND tag (the wallet that signs and pays) and a bright
// RECEIVE tag (the wallet other VYRO users pay when they send to your @username).
// Uses only the public VYROWallet API; no keys are involved.
// =========================================================
(function () {
    "use strict";

    function short(a) { return a.slice(0, 6) + "…" + a.slice(-6); }

    function pill(kind, text) {
        const s = document.createElement("span");
        s.className = "role-pill " + kind;
        s.textContent = text;
        return s;
    }

    function actionButton(text, className, onClick, disabled) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = className;
        b.textContent = text;
        b.disabled = !!disabled;
        b.addEventListener("click", onClick);
        return b;
    }

    function card(w, active, receiveMap) {
        const isSend = !!active && w.address === active.address;
        const myReceive = VYROCoins.ORDER.filter(function (id) {
            const addr = VYROCoins.walletAddressFor(w, id);
            return addr && receiveMap[id] === addr;
        });
        const isReceive = myReceive.length > 0;
        const sendCoin = VYROCoins.getSendCoin(w);
        const el = document.createElement("div");
        el.className = "wallet-card" + (isSend ? " is-send active" : "") + (isReceive ? " is-receive" : "");

        const roles = document.createElement("div");
        roles.className = "wallet-role-row";
        if (isSend) roles.appendChild(pill("send", "SEND " + sendCoin));
        if (isReceive) roles.appendChild(pill("receive", "RECEIVE " + myReceive.join(" · ")));
        el.appendChild(roles);

        const top = document.createElement("div");
        top.className = "wallet-card-top";
        const left = document.createElement("div");
        const prov = document.createElement("div");
        prov.className = "wallet-card-provider";
        prov.textContent = w.provider || "External Wallet";
        const net = document.createElement("div");
        net.className = "wallet-card-network";
        net.textContent = [VYROCoins.walletAddressFor(w, "USDC") ? "SOLANA" : "", VYROCoins.walletAddressFor(w, "ETH") ? "ETHEREUM" : ""].filter(Boolean).join(" · ");
        left.appendChild(prov);
        left.appendChild(net);
        top.appendChild(left);
        el.appendChild(top);

        const addr = document.createElement("div");
        addr.className = "wallet-card-address";
        addr.textContent = w.address;
        addr.title = short(w.address);
        el.appendChild(addr);

        // Which of VYRO's coins this wallet can use (a wallet only offers what it shares over WalletConnect).
        const can = VYROCoins.list().filter(function (c) { return VYROCoins.walletCan(w, c.id); }).map(function (c) { return c.label; });
        const cannot = VYROCoins.list().filter(function (c) { return !VYROCoins.walletCan(w, c.id); }).map(function (c) { return c.label; });
        const avail = document.createElement("div");
        avail.className = "coin-avail";
        avail.textContent = "Works with: " + (can.join(", ") || "none") + (cannot.length ? ". Not shared by this wallet: " + cannot.join(", ") + "." : "");
        el.appendChild(avail);

        // ---- SENDS: the coin this wallet pays with ----
        const sendRow = document.createElement("div");
        sendRow.className = "coin-row";
        const sendLabel = document.createElement("span");
        sendLabel.className = "coin-row-label";
        sendLabel.textContent = "SENDS";
        const sel = document.createElement("select");
        sel.className = "coin-select";
        VYROCoins.list().forEach(function (c) {
            const o = document.createElement("option");
            const ok = VYROCoins.walletCan(w, c.id);
            o.value = c.id;
            o.textContent = c.label + (ok ? "" : " (not shared by this wallet)");
            o.disabled = !ok;
            sel.appendChild(o);
        });
        sel.value = sendCoin;
        sel.addEventListener("change", function () {
            VYROCoins.setSendCoin(w, sel.value);
            VYROWallet.setActiveWallet(w.address);   // choosing what a wallet sends makes it the sending wallet
        });
        sendRow.appendChild(sendLabel);
        sendRow.appendChild(sel);
        el.appendChild(sendRow);

        // ---- RECEIVES: tap a coin to receive it in this wallet ----
        const recRow = document.createElement("div");
        recRow.className = "coin-row";
        const recLabel = document.createElement("span");
        recLabel.className = "coin-row-label";
        recLabel.textContent = "RECEIVES";
        const chips = document.createElement("div");
        chips.className = "coin-chips";
        VYROCoins.list().forEach(function (c) {
            const address = VYROCoins.walletAddressFor(w, c.id);
            const on = !!address && receiveMap[c.id] === address;
            const elsewhere = !!receiveMap[c.id] && !on;
            const chip = document.createElement("button");
            chip.type = "button";
            chip.className = "coin-chip" + (on ? " on" : "");
            chip.textContent = c.label;
            chip.disabled = !VYROCoins.walletCan(w, c.id) || !VYROWallet.getUsername();
            chip.title = on ? "Receiving " + c.label + " here. Tap to turn off."
                : (elsewhere ? c.label + " currently goes to another wallet. Tap to receive it here instead." : "Tap to receive " + c.label + " here.");
            chip.addEventListener("click", async function () {
                chip.disabled = true;
                try { await VYROCoins.setReceive(c.id, on ? null : address); }
                catch (err) { alert("Could not update what you receive: " + (err.message || "please try again.")); }
                render();
            });
            chips.appendChild(chip);
        });
        recRow.appendChild(recLabel);
        recRow.appendChild(chips);
        el.appendChild(recRow);

        const actions = document.createElement("div");
        actions.className = "wallet-role-actions";
        actions.appendChild(actionButton(isSend ? "SENDING ✓" : "USE TO SEND", "secondary-button", function () {
            VYROWallet.setActiveWallet(w.address);
        }, isSend));
        actions.appendChild(actionButton("REMOVE", "secondary-button wallet-remove-button", async function () {
            const msg = isReceive
                ? "This wallet receives " + myReceive.join(", ") + " for @" + VYROWallet.getUsername() + ". People will keep paying it until you choose another wallet for those coins. Remove it from VYRO anyway? Your funds are not affected."
                : "Remove this wallet from VYRO? Your wallet funds are not affected.";
            if (confirm(msg)) await VYROWallet.removeWallet(w.address);
        }, false));
        el.appendChild(actions);
        return el;
    }

    function render() {
        if (typeof VYROWallet === "undefined") return;
        const wallets = VYROWallet.getWallets();
        const active = VYROWallet.getActiveWallet();
        const receiveMap = VYROCoins.getReceive();
        if (VYROWallet.getUsername() && !render.loading) {
            render.loading = true;
            VYROCoins.loadReceive(true).then(function () { render.loading = false; }, function () { render.loading = false; });
        }

        // "My Wallets" screen
        const mine = document.getElementById("connected-wallet-list");
        if (mine) {
            mine.innerHTML = "";
            wallets.forEach(function (w) { mine.appendChild(card(w, active, receiveMap)); });
        }

        // Wallets screen: replace the plain cards with the same ones.
        const list = document.getElementById("wallet-list");
        if (list) {
            list.querySelectorAll(".wallet-card").forEach(function (x) { x.remove(); });
            wallets.forEach(function (w) { list.appendChild(card(w, active, receiveMap)); });
        }

        const disc = document.getElementById("disconnect-wallet-btn");
        if (disc) disc.style.display = active ? "" : "none";
    }

    window.renderWalletRoles = render;

    function init() {
        const another = document.getElementById("connect-another-btn");
        if (another) another.addEventListener("click", function () {
            const screen = document.getElementById("connect-wallet-screen");
            if (screen && typeof window.showScreen === "function") window.showScreen(screen);
        });
        render();
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
