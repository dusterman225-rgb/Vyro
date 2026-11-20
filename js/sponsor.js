// =========================================================
// VYQIL — SPONSORED PAYMENTS (Vyqil pays the network fee)
// Talks to the Vyqil payments worker. The worker checks the payment, adds Vyqil's own signature as the
// network-fee payer, and sends it. It never sees a private key; your wallet still approves every payment.
// =========================================================
(function (root) {
    "use strict";
    const DEFAULT_URL = "https://vyqil-push.dusterman225.workers.dev";
    const BPS = { person: 100, biz: 200 };
    function base() {
        const c = root.VYRO_CONFIG || {};
        return String(c.sponsorUrl || DEFAULT_URL).replace(/\/+$/, "");
    }
    async function call(path, body) {
        let res, j;
        try {
            res = await fetch(base() + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
            j = await res.json();
        } catch (e) { const err = new Error("Could not reach Vyqil payments. Check your connection and try again."); err.code = "network"; throw err; }
        if (!res.ok || !j || !j.ok) {
            const err = new Error((j && j.detail) || "Vyqil payments could not complete this right now. Please try again.");
            err.code = (j && j.error) || "failed"; throw err;
        }
        return j;
    }
    // Rounded UP so the fee is never a hair short of what the server expects.
    function feeUnits(units, mode) { return (BigInt(units) * BigInt(BPS[mode] || 0) + 9999n) / 10000n; }
    // quote: is the receiver's USDC account new? (then a one-time startup fee comes out of this first payment)
    async function quote(ownerAddress) { return call("/pay/quote", { to: ownerAddress }); }
    function toB64(bytes) { let s = ""; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return btoa(s); }
    async function send(signedRaw, mode) { return call("/pay/send", { tx: toB64(signedRaw), mode: mode === "biz" ? "biz" : "person" }); }
    root.VYROSponsor = { quote: quote, send: send, feeUnits: feeUnits, BPS: BPS };
    if (typeof module !== "undefined" && module.exports) module.exports = root.VYROSponsor;
})(typeof window !== "undefined" ? window : globalThis);
