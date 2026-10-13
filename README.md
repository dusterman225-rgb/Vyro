# VYRO — Refined Test Build

Mobile-first, **non-custodial** UI for sending USDC on Solana by username.

**VYRO never holds funds or keys and never signs.** The app builds an *unsigned* USDC transfer;
the user's own wallet (Trust Wallet first) shows it and the user approves it there.

## How a payment works
1. Sender enters `@username` + amount → VYRO looks the name up in the `usernames` directory and gets the
   recipient's *public* receiving address.
2. VYRO checks balances on-chain and shows the **full recipient address**, amount and fees.
3. On confirm, VYRO re-resolves the recipient (aborts if their address changed), builds a fresh unsigned
   transaction, and asks the user's wallet to sign it (injected provider or WalletConnect).
4. The transaction is broadcast, confirmed against the chain, and recorded in the sender's private history.

## Setup checklist
1. **Firestore rules** — paste `firestore.rules` into Firebase Console → Firestore → Rules → Publish.
   *Without these, usernames are not unique-protected and user data is exposed.*
2. **Authorized domains** — Firebase Console → Authentication → Settings → add your domain.
3. **Restrict the Firebase API key** (Google Cloud Console → Credentials) to your domain(s) and enable
   **App Check** before public launch. The key in `firebase-config.js` is public by design; these controls protect it.
4. **RPC endpoint** — set `solana.rpcUrl` in `js/config.js` to a dedicated provider (Helius/QuickNode/…).
   The default public RPC is rate-limited and not for production.
5. **WalletConnect** (optional now, needed for non-injected wallets) — put your project ID in
   `walletConnectProjectId` in `js/config.js`.
6. Serve over HTTPS (GitHub Pages is fine). Do not open `index.html` via `file://`.

## Testing
- Unit tests (amounts, base58, instruction bytes): `node tests/transfer.test.js`
- Wallet testing: open the site inside the Trust Wallet in-app browser (injected provider), or use WalletConnect.
- **Start with a tiny amount (e.g. 0.01 USDC) between two of your own accounts before anything else.**
  The transaction builder has been exercised against a stubbed Solana library, not yet on mainnet.

## Locking down third-party scripts
`index.html` loads two pinned libraries from unpkg. For a wallet app you should pin them with integrity hashes
(or vendor them into `js/vendor/`):
```
curl -sL https://unpkg.com/@solana/web3.js@1.98.4/lib/index.iife.min.js | openssl dgst -sha384 -binary | openssl base64 -A
```
Then add `integrity="sha384-<hash>"` to the script tag (keep `crossorigin="anonymous"`).
Also add a Content-Security-Policy at your host/CDN once your final domains are known.

## Data model
| Path | Contents | Who can read |
|---|---|---|
| `users/{uid}` | email, verification word, flags | owner only |
| `users/{uid}/transactions/{signature}` | sender-side payment records | owner only |
| `usernames/{name}` | `{uid, walletAddress}` — **no email/private data** | verified users, exact-name lookup only |

## Known gaps (not done yet)
- **2FA is not implemented.** The screens are placeholders; the enable button now says so. Real 2FA needs
  Firebase Multi-Factor Auth (Identity Platform) or a backend.
- **Verification word** is stored and editable but not checked anywhere in the payment flow.
- **Received payments** do not appear in history (needs an indexer/webhook or on-chain polling of the receive address).
- **Account deletion** screen has no working delete action.
- **WalletConnect on desktop** has no QR code yet (mobile deep-link works).
- Only Solana + USDC. Chain/asset specifics live in `js/config.js` and `js/transfer.js`; EVM would be a second builder.
