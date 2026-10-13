// =========================================================
// VYRO — TRANSFER HELPERS (Solana / SPL token)
// =========================================================
// Pure helpers (amount parsing, base58, instruction data) plus the
// transaction builder. VYRO only ever BUILDS an UNSIGNED transaction here.
// The user's own wallet signs it; VYRO never sees a private key.
//
// The pure helpers have no dependencies and are unit-tested in tests/.
// buildUsdcTransfer() needs @solana/web3.js (global `solanaWeb3`).
(function (root) {
    "use strict";

    // ---------- username ----------
    function normalizeUsername(value) {
        return String(value || "").trim().replace(/^@+/, "").toLowerCase();
    }
    function isValidUsername(value) {
        return /^[a-z0-9_]{3,20}$/.test(value);
    }

    // ---------- amounts (no floating point anywhere) ----------
    // Parses a user-typed decimal string into integer base units (BigInt).
    function parseAmount(text, decimals) {
        const s = String(text == null ? "" : text).trim();
        if (!/^\d+(\.\d+)?$/.test(s)) return { ok: false, error: "Enter a valid amount." };
        const parts = s.split(".");
        const frac = parts[1] || "";
        if (frac.length > decimals) return { ok: false, error: "USDC supports at most " + decimals + " decimal places." };
        const units = BigInt(parts[0] + frac.padEnd(decimals, "0"));
        if (units <= 0n) return { ok: false, error: "Amount must be greater than zero." };
        return { ok: true, units: units };
    }

    function formatUnits(units, decimals) {
        let s = BigInt(units).toString().padStart(decimals + 1, "0");
        const whole = s.slice(0, s.length - decimals);
        const frac = s.slice(s.length - decimals).replace(/0+$/, "");
        return frac ? whole + "." + frac : whole;
    }

    // ---------- base58 (Bitcoin alphabet; used by Solana) ----------
    const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

    function base58Encode(bytes) {
        let zeros = 0;
        while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
        let n = 0n;
        for (let i = 0; i < bytes.length; i++) n = (n << 8n) | BigInt(bytes[i]);
        let out = "";
        while (n > 0n) { out = ALPHABET[Number(n % 58n)] + out; n /= 58n; }
        return "1".repeat(zeros) + out;
    }

    function base58Decode(str) {
        let zeros = 0;
        while (zeros < str.length && str[zeros] === "1") zeros++;
        let n = 0n;
        for (let i = 0; i < str.length; i++) {
            const idx = ALPHABET.indexOf(str[i]);
            if (idx < 0) throw new Error("Invalid base58 character.");
            n = n * 58n + BigInt(idx);
        }
        const bytes = [];
        while (n > 0n) { bytes.unshift(Number(n & 0xffn)); n >>= 8n; }
        return Uint8Array.from(new Array(zeros).fill(0).concat(bytes));
    }

    // A Solana address is a base58 string that decodes to exactly 32 bytes.
    function isValidSolanaAddress(address) {
        if (typeof address !== "string" || address.length < 32 || address.length > 44) return false;
        try { return base58Decode(address).length === 32; } catch (e) { return false; }
    }

    // ---------- SPL token instruction data ----------
    // TransferChecked = instruction index 12, then u64 LE amount, then u8 decimals.
    function transferCheckedData(units, decimals) {
        const data = new Uint8Array(10);
        data[0] = 12;
        let v = BigInt(units);
        if (v < 0n || v >= (1n << 64n)) throw new Error("Amount out of range.");
        for (let i = 1; i <= 8; i++) { data[i] = Number(v & 0xffn); v >>= 8n; }
        data[9] = decimals;
        return data;
    }

    // Associated Token Account program: CreateIdempotent = instruction index 1.
    function createAtaIdempotentData() { return Uint8Array.of(1); }

    function bytesToBase64(bytes) {
        let bin = "";
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        return btoa(bin);
    }
    function base64ToBytes(b64) {
        const bin = atob(b64);
        const out = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
    }

    // ---------- transaction builder (browser; needs @solana/web3.js) ----------
    const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
    const ATA_PROGRAM_ID = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
    const SYSTEM_PROGRAM_ID = "11111111111111111111111111111111";
    const TOKEN_ACCOUNT_SIZE = 165;

    function web3() {
        if (!root.solanaWeb3) throw new Error("Solana library failed to load. Check your connection and reload.");
        return root.solanaWeb3;
    }

    // web3.js expects Buffer for instruction data; use it when the page provides one.
    function toBuf(bytes) {
        const B = (root.solanaWeb3 && root.solanaWeb3.Buffer) || root.Buffer;
        return B ? B.from(bytes) : bytes;
    }

    function deriveAta(ownerPk, mintPk) {
        const w = web3();
        return w.PublicKey.findProgramAddressSync(
            [ownerPk.toBuffer(), new w.PublicKey(TOKEN_PROGRAM_ID).toBuffer(), mintPk.toBuffer()],
            new w.PublicKey(ATA_PROGRAM_ID)
        )[0];
    }

    // Fee in base units: floor(units * bps / 10000). 100 bps = 1%.
    function feeUnits(units, bps) {
        return (BigInt(units) * BigInt(bps)) / 10000n;
    }

    function createAtaInstruction(w, payer, ata, owner, mint) {
        return new w.TransactionInstruction({
            programId: new w.PublicKey(ATA_PROGRAM_ID),
            keys: [
                { pubkey: payer, isSigner: true, isWritable: true },        // payer
                { pubkey: ata, isSigner: false, isWritable: true },         // ata
                { pubkey: owner, isSigner: false, isWritable: false },      // owner
                { pubkey: mint, isSigner: false, isWritable: false },
                { pubkey: new w.PublicKey(SYSTEM_PROGRAM_ID), isSigner: false, isWritable: false },
                { pubkey: new w.PublicKey(TOKEN_PROGRAM_ID), isSigner: false, isWritable: false }
            ],
            data: toBuf(createAtaIdempotentData())
        });
    }

    function transferInstruction(w, fromAta, mint, toAta, authority, units, decimals) {
        return new w.TransactionInstruction({
            programId: new w.PublicKey(TOKEN_PROGRAM_ID),
            keys: [
                { pubkey: fromAta, isSigner: false, isWritable: true },
                { pubkey: mint, isSigner: false, isWritable: false },
                { pubkey: toAta, isSigner: false, isWritable: true },
                { pubkey: authority, isSigner: true, isWritable: false }
            ],
            data: toBuf(transferCheckedData(units, decimals))
        });
    }

    // Reads on-chain state and returns everything the UI needs to show the user
    // BEFORE they are asked to sign, plus the unsigned transaction itself.
    // Optional fee: opts.feeUnits (BigInt-able) + opts.feeRecipient (owner address). The fee is a
    // second transfer in the SAME transaction, paid by the sender on top of the payment.
    async function buildUsdcTransfer(opts) {
        const w = web3();
        const cfg = opts.config;
        const connection = opts.connection;
        const sender = new w.PublicKey(opts.sender);
        const recipient = new w.PublicKey(opts.recipient);
        const mint = new w.PublicKey(cfg.usdcMint);
        const units = BigInt(opts.units);
        const feeAmount = BigInt(opts.feeUnits || 0);
        const feeOwner = feeAmount > 0n && opts.feeRecipient ? new w.PublicKey(opts.feeRecipient) : null;
        const chargedFee = feeOwner ? feeAmount : 0n;
        const totalUnits = units + chargedFee;

        const senderAta = deriveAta(sender, mint);
        const recipientAta = deriveAta(recipient, mint);
        const feeAta = feeOwner ? deriveAta(feeOwner, mint) : null;

        // Sender's USDC balance (token account may not exist => 0).
        let senderUnits = 0n;
        try {
            const bal = await connection.getTokenAccountBalance(senderAta, "confirmed");
            senderUnits = BigInt(bal.value.amount);
        } catch (e) { senderUnits = 0n; }
        if (senderUnits < totalUnits) {
            const err = new Error(chargedFee > 0n
                ? "Insufficient USDC. This payment needs " + formatUnits(totalUnits, cfg.usdcDecimals) + " USDC (" +
                  formatUnits(units, cfg.usdcDecimals) + " + " + formatUnits(chargedFee, cfg.usdcDecimals) +
                  " VYRO fee) and this wallet holds " + formatUnits(senderUnits, cfg.usdcDecimals) + " USDC."
                : "Insufficient USDC. This wallet holds " + formatUnits(senderUnits, cfg.usdcDecimals) + " USDC.");
            err.code = "INSUFFICIENT_USDC";
            throw err;
        }

        const recipientAtaInfo = await connection.getAccountInfo(recipientAta, "confirmed");
        const needsAta = !recipientAtaInfo;

        // The fee wallet's USDC account normally exists already. If it does not, open it once.
        let needsFeeAta = false;
        if (feeAta && feeAta.toBase58() !== recipientAta.toBase58()) {
            needsFeeAta = !(await connection.getAccountInfo(feeAta, "confirmed"));
        }

        const ixs = [];
        if (needsAta) ixs.push(createAtaInstruction(w, sender, recipientAta, recipient, mint));
        if (needsFeeAta) ixs.push(createAtaInstruction(w, sender, feeAta, feeOwner, mint));
        ixs.push(transferInstruction(w, senderAta, mint, recipientAta, sender, units, cfg.usdcDecimals));
        if (feeOwner) ixs.push(transferInstruction(w, senderAta, mint, feeAta, sender, chargedFee, cfg.usdcDecimals));

        // SOL needed: base fee (5000 lamports/signature) + rent for any account we open.
        const newAccounts = (needsAta ? 1 : 0) + (needsFeeAta ? 1 : 0);
        const rentLamports = newAccounts ? newAccounts * (await connection.getMinimumBalanceForRentExemption(TOKEN_ACCOUNT_SIZE)) : 0;
        const feeLamports = 5000;
        const solBalance = await connection.getBalance(sender, "confirmed");
        if (solBalance < rentLamports + feeLamports) {
            const err = new Error("Not enough SOL for network fees. You need about " +
                ((rentLamports + feeLamports) / 1e9).toFixed(5) + " SOL in this wallet.");
            err.code = "INSUFFICIENT_SOL";
            throw err;
        }

        const latest = await connection.getLatestBlockhash("confirmed");
        const tx = new w.Transaction({
            feePayer: sender,
            recentBlockhash: latest.blockhash
        });
        tx.add.apply(tx, ixs);

        return {
            transaction: tx,
            lastValidBlockHeight: latest.lastValidBlockHeight,
            recipientTokenAccount: recipientAta.toBase58(),
            createsRecipientAccount: needsAta,
            createsFeeAccount: needsFeeAta,
            rentLamports: rentLamports,
            feeLamports: feeLamports,
            feeUnits: chargedFee,
            totalUnits: totalUnits
        };
    }

    const api = {
        version: "2026-10-09-r4",
        normalizeUsername, isValidUsername,
        parseAmount, formatUnits,
        base58Encode, base58Decode, isValidSolanaAddress,
        transferCheckedData, createAtaIdempotentData,
        bytesToBase64, base64ToBytes,
        buildUsdcTransfer, deriveAta, feeUnits,
        TOKEN_PROGRAM_ID, ATA_PROGRAM_ID
    };

    root.VYROTransfer = api;
    if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
