// =========================================================
// VYRO — WALLETCONNECT PANEL
// Shown when a wallet is connected through WalletConnect (any wallet app, from a normal
// browser). Lets the user open their wallet app or copy the pairing link. VYRO never sees
// keys: this only hands the wallet a connection request.
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

    // uri: the WalletConnect pairing link ("wc:…"); label: the wallet the user tapped (may be null).
    function show(uri, label) {
        hide();
        const name = label || "your wallet";

        overlay = make("div", "wc-overlay");
        const card = make("div", "wc-card");
        card.appendChild(make("h2", "", "Connect " + name));
        card.appendChild(make("p", "", isMobile()
            ? "Tap OPEN WALLET and approve the connection in your wallet app, then come back to VYRO."
            : "Open your wallet app on this device and approve the connection, or copy the link into it."));

        card.appendChild(make("div", "wc-uri", uri));

        card.appendChild(button("OPEN WALLET", "primary-button", function () { window.location.href = uri; }));
        const copyBtn = button("COPY LINK", "secondary-button", function () { copy(uri, copyBtn); });
        card.appendChild(copyBtn);

        // Phantom's documented way to open a site inside the Phantom app.
        if (/phantom/i.test(name) && isMobile()) {
            card.appendChild(button("OPEN VYRO IN PHANTOM", "secondary-button", function () {
                window.location.href = "https://phantom.app/ul/browse/" + encodeURIComponent(window.location.href) +
                    "?ref=" + encodeURIComponent(window.location.origin);
            }));
        }

        card.appendChild(button("CANCEL", "secondary-button", hide));
        overlay.appendChild(card);
        document.body.appendChild(overlay);
    }

    window.VYROWalletConnectUI = { show: show, hide: hide };
})();
