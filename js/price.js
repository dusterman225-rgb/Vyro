// =========================================================
// VYRO — PRICES (dollars <-> coins)
// People type DOLLARS. This file looks up the live price and works out the exact coin amount.
//   USDC is always $1.
//   SOL and ETH: Coinbase (main) and Kraken (cross-check). If the two disagree by more than 3%,
//   VYRO refuses to continue rather than guess. Prices are only read here; nothing is ever sent.
// This file holds no keys and moves no money.
// =========================================================
(function () {
    "use strict";

    const SOURCES = {
        SOL: {
            coinbase: "https://api.coinbase.com/v2/prices/SOL-USD/spot",
            kraken: "https://api.kraken.com/0/public/Ticker?pair=SOLUSD"
        },
        ETH: {
            coinbase: "https://api.coinbase.com/v2/prices/ETH-USD/spot",
            kraken: "https://api.kraken.com/0/public/Ticker?pair=ETHUSD"
        }
    };
    const CACHE_MS = 20000;
    const cache = {};

    function userError(message) { const e = new Error(message); e.userFacing = true; return e; }

    async function getJson(url) {
        const ctl = new AbortController();
        const timer = setTimeout(function () { ctl.abort(); }, 8000);
        try {
            const r = await fetch(url, { signal: ctl.signal });
            if (!r.ok) throw new Error("status " + r.status);
            return await r.json();
        } finally { clearTimeout(timer); }
    }
    async function fromCoinbase(asset) {
        const d = await getJson(SOURCES[asset].coinbase);
        const p = Number(d && d.data && d.data.amount);
        return p > 0 && isFinite(p) ? p : null;
    }
    async function fromKraken(asset) {
        const d = await getJson(SOURCES[asset].kraken);
        const t = d && d.result && d.result[Object.keys(d.result)[0]];
        const p = Number(t && t.c && t.c[0]);
        return p > 0 && isFinite(p) ? p : null;
    }

    // Dollars per one coin, as { price, at } (at = when it was read, in milliseconds).
    async function usdPerCoin(asset) {
        if (asset === "USDC") return { price: 1, at: Date.now() };
        if (!SOURCES[asset]) throw userError("There is no dollar price for " + asset + " yet.");
        const hit = cache[asset];
        if (hit && Date.now() - hit.at < CACHE_MS) return hit;
        const got = await Promise.all([
            fromCoinbase(asset).catch(function () { return null; }),
            fromKraken(asset).catch(function () { return null; })
        ]);
        const a = got[0], b = got[1];
        if (!a && !b) throw userError("Could not get the current " + asset + " price. Check your connection and try again.");
        if (a && b && Math.abs(a - b) / Math.min(a, b) > 0.03)
            throw userError("The " + asset + " price sources disagree right now, so VYRO will not guess. Please try again in a minute.");
        const out = { price: a || b, at: Date.now() };
        cache[asset] = out;
        return out;
    }

    // "$12.5" or "12.50" -> whole cents. At most 2 decimals.
    function parseUsd(text) {
        const s = String(text == null ? "" : text).trim().replace(/^\$/, "").replace(/,/g, "");
        if (!/^\d+(\.\d{1,2})?$/.test(s)) return { ok: false, error: "Enter a dollar amount like 5 or 5.25 (at most 2 decimals)." };
        const parts = s.split(".");
        const cents = Number(parts[0]) * 100 + Number((parts[1] || "").padEnd(2, "0"));
        if (!(cents > 0) || cents > 100000000) return { ok: false, error: "Enter a dollar amount like 5 or 5.25." };
        return { ok: true, cents: cents };
    }

    // Exact coin amount for these dollars. Rounded UP by a hair so the recipient never gets less than the dollars.
    // coin = (cents / 100) / price, in base units. All integer maths (price held to 6 decimals).
    function unitsFor(cents, price, decimals) {
        const priceMicro = BigInt(Math.round(price * 1e6));
        if (priceMicro <= 0n) throw userError("Bad price.");
        const num = BigInt(cents) * 10000n * (10n ** BigInt(decimals));
        return (num + priceMicro - 1n) / priceMicro;
    }

    function fmtUsd(cents) {
        const c = Math.round(Number(cents) || 0);
        return "$" + (c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    // Rough dollar value of a coin amount at a price (display only).
    function usdOfUnits(units, price, decimals) {
        const coin = Number(BigInt(units)) / Math.pow(10, decimals);
        return Math.round(coin * price * 100);
    }

    window.VYROPrice = { usdPerCoin: usdPerCoin, parseUsd: parseUsd, unitsFor: unitsFor, fmtUsd: fmtUsd, usdOfUnits: usdOfUnits, MIN_CENTS: 100 };
})();
