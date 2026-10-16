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

        // One address line per network: a wallet has a different address on Solana and on Ethereum.
        const sendNet = VYROCoins.get(sendCoin) ? VYROCoins.get(sendCoin).chain : "solana";
        [["solana", "SOLANA (USDC, SOL)", VYROCoins.walletAddressFor(w, "USDC")],
         ["ethereum", "ETHEREUM (ETH)", VYROCoins.walletAddressFor(w, "ETH")]].forEach(function (r) {
            if (!r[2]) return;
            const line = document.createElement("div");
            line.className = "wallet-card-address" + (isSend && sendNet === r[0] ? " in-use" : "");
            const lab = document.createElement("span");
            lab.className = "addr-net";
            lab.textContent = r[1];
            const val = document.createElement("span");
            val.className = "addr-val";
            val.textContent = r[2];
            val.title = short(r[2]);
            line.appendChild(lab);
            line.appendChild(val);
            el.appendChild(line);
        });

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
        actions.appendChild(actionButton(isSend ? "CURRENTLY SENDING ✓" : "USE TO SEND", "secondary-button", function () {
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

    function showProblem(text) {
        ["connected-wallet-list", "wallet-list"].forEach(function (id) {
            const box = document.getElementById(id);
            if (!box) return;
            box.querySelectorAll(".wallet-problem").forEach(function (x) { x.remove(); });
            const p = document.createElement("p");
            p.className = "auth-card-text wallet-problem";
            p.style.color = "#ff8a8a";
            p.textContent = text;
            box.insertBefore(p, box.firstChild);
        });
    }

    function render() {
        if (typeof VYROWallet === "undefined") return;
        if (typeof VYROCoins === "undefined") { showProblem("The coin options could not load (coins.js is missing). Upload js/coins.js, then refresh."); return; }
        try { draw(); }
        catch (err) { console.error("VYRO: wallet cards failed", err); showProblem("The wallet options could not be drawn: " + (err && err.message ? err.message : err)); }
    }

    function draw() {
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
