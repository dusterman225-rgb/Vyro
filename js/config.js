// =========================================================
// VYRO — APP CONFIGURATION (MAINNET)
// =========================================================
// One line needs your own value:  walletConnectProjectId  (paste your WalletConnect project ID).

window.VYRO_CONFIG = Object.freeze({
    appName: "VYRO",

    network: "solana",
    asset: "USDC",

    solana: Object.freeze({
        // Solana MAINNET (used by WalletConnect).
        chainId: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",

        // Dedicated mainnet endpoint. The key is visible to anyone who views this file, so in the
        // Alchemy dashboard restrict it to your website address (allowed domains).
        rpcUrl: "https://solana-mainnet.g.alchemy.com/v2/alch_X9mveVmXQneC5MXDJXAEi",

        // Circle's native USDC on Solana mainnet.
        usdcMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        usdcDecimals: 6,

        explorerTxUrl: "https://solscan.io/tx/"
    }),

    // VYRO service fee: charged to the SENDER on top of the payment (the recipient gets the full
    // amount). 100 basis points = 1%. Sent to the fee wallet inside the same transaction.
    fee: Object.freeze({
        bps: 100,
        treasuryAddress: "7ScnZKuXee7AUnh3BwWSPvWznzcF3a3cHLrSGJS2vu8C"
    }),

    limits: Object.freeze({
        minAmountPerPayment: "1",     // USDC ($1)
        maxAmountPerPayment: "100000"     // USDC. Start small; raise it once you are comfortable.
    }),

    // <<< PUT YOUR WALLETCONNECT PROJECT ID HERE (between the quotes)
    walletConnectProjectId: "44f320d19361d5829141766a65015080",
    walletConnectMetadata: {
        name: "VYRO",
        description: "Non-custodial crypto transfers by username.",
        url: window.location.origin,
        icons: []
    }
});
