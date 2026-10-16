// =========================================================
// VYRO — WALLETCONNECT PANEL
// Shown when a wallet is connected through WalletConnect (any wallet app, from a normal
// browser). VYRO never sees keys: this only hands the wallet a connection request.
//
// VYRO connects wallets with WalletConnect only. The wallet app approves the connection and every
// payment; VYRO stays in your normal browser.
// =========================================================
(function () {
    "use strict";

    let overlay = null;

    function isMobile() { return /android|iphone|ipad|ipod/i.test(navigator.userAgent); }

    function make(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text != null) node.textContent = text;
        return node;
    }

    function button(label, className, onClick) {
        const b = make("button", className, label);
        b.type = "button";
        b.addEventListener("click", onClick);
        return b;
    }

    function hide() {
        if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
        overlay = null;
    }

    async function copy(text, btn) {
        const original = btn.textContent;
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(text);
            else {
                const helper = document.createElement("textarea");
                helper.value = text;
                helper.style.position = "fixed";
                helper.style.opacity = "0";
                document.body.appendChild(helper);
                helper.select();
                document.execCommand("copy");
                helper.remove();
            }
            btn.textContent = "COPIED ✓";
        } catch (e) {
            btn.textContent = "COPY FAILED";
        }
        setTimeout(function () { btn.textContent = original; }, 1500);
    }

    // Where to get each wallet (shown if it is not installed).
    const DOWNLOADS = {
        "Backpack": "https://backpack.app/download",
        "Exodus": "https://www.exodus.com/download/",
        "OKX Wallet": "https://www.okx.com/download",
        "Bitget Wallet": "https://web3.bitget.com/en/wallet-download",
        "TokenPocket": "https://www.tokenpocket.pro/en/download/app",
        "OneKey": "https://onekey.so/download/",
        "Trust Wallet": "https://trustwallet.com/download"
    };

    // uri: the WalletConnect pairing link ("wc:…"); label: the wallet the user tapped (may be null).
    function show(uri, label) {
        hide();
        const name = label || "your wallet";
        const mobile = isMobile();

        overlay = make("div", "wc-overlay");
        const card = make("div", "wc-card");
        card.appendChild(make("h2", "", "Connect " + name));
        card.appendChild(make("p", "", mobile
            ? "Tap OPEN WALLET and approve the connection in " + name + ", then come back to VYRO."
            : "Open " + name + " on this device and approve the connection, or copy the link into it."));
        card.appendChild(make("div", "wc-uri", uri));
        card.appendChild(button("OPEN WALLET", "primary-button", function () { window.location.href = uri; }));
        const copyBtn = button("COPY LINK", "secondary-button", function () { copy(uri, copyBtn); });
        card.appendChild(copyBtn);
        if (mobile) {
            card.appendChild(make("p", "wc-hint open-with-note", "If your phone shows an \"Open with\" list, choose " + name + " and tap \"Just once\". If " + name + " is not in the list, tap COPY LINK, open " + name + ", find WalletConnect (often under Settings or the scan icon) and paste the link."));
        }
        // A phone opens whichever installed wallet handles WalletConnect links. Without the wallet installed,
        // it can open a different one (often Trust Wallet), so say so and link to the download.
        const warn = make("p", "wc-hint open-with-note", "You need " + name + " installed on this phone. If you don't have it, a different wallet may open instead. Cancel and install it first.");
        card.appendChild(warn);
        const dl = DOWNLOADS[label] || null;
        if (dl) {
            const a = make("a", "secondary-button wc-download", "DOWNLOAD " + String(label).toUpperCase());
            a.href = dl;
            a.target = "_blank";
            a.rel = "noopener";
            card.appendChild(a);
        }
        card.appendChild(button("CANCEL", "secondary-button", hide));
        overlay.appendChild(card);
        document.body.appendChild(overlay);
    }

    window.VYROWalletConnectUI = { show: show, hide: hide };
})();
