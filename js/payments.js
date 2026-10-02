// =========================================================
// VYRO — PAYMENT ENGINE
// STAGE 4
// =========================================================

(function () {

    "use strict";

    const PENDING_PAYMENT_KEY =
        "vyro_pending_payment";


    // =====================================================
    // GET PENDING PAYMENT
    // =====================================================

    function getPendingPayment() {

        const saved =
            localStorage.getItem(
                PENDING_PAYMENT_KEY
            );

        if (!saved) {
            return null;
        }

        try {

            return JSON.parse(saved);

        } catch (error) {

            console.error(
                "VYRO: Could not read pending payment:",
                error
            );

            return null;
        }
    }


    // =====================================================
    // CLEAR PENDING PAYMENT
    // =====================================================

    function clearPendingPayment() {

        localStorage.removeItem(
            PENDING_PAYMENT_KEY
        );

    }


    // =====================================================
    // VALIDATE PAYMENT
    // =====================================================

    function validatePayment(payment) {

        if (!payment) {

            return {
                valid: false,
                error:
                    "No payment is waiting for confirmation."
            };

        }

        if (!payment.amount) {

            return {
                valid: false,
                error:
                    "Payment amount is missing."
            };

        }

        if (
            Number(payment.amount) <= 0
        ) {

            return {
                valid: false,
                error:
                    "Payment amount is invalid."
            };

        }

        if (!payment.recipient) {

            return {
                valid: false,
                error:
                    "Payment recipient is missing."
            };

        }

        if (
            payment.network &&
            payment.network !== "Solana"
        ) {

            return {
                valid: false,
                error:
                    "This payment network is not supported."
            };

        }

        if (
            payment.asset &&
            payment.asset !== "USDC"
        ) {

            return {
                valid: false,
                error:
                    "This payment asset is not supported."
            };

        }

        return {
            valid: true,
            error: null
        };

    }


    // =====================================================
    // CHECK WALLET
    // =====================================================

    function validateWallet() {

        if (
            typeof VYROWallet ===
            "undefined"
        ) {

            return {
                valid: false,
                error:
                    "VYRO wallet system is unavailable."
            };

        }

        if (
            !VYROWallet.isConnected()
        ) {

            return {
                valid: false,
                error:
                    "Please connect a wallet before sending."
            };

        }

        const wallet =
            VYROWallet.getActiveWallet();

        if (
            !wallet ||
            !wallet.address
        ) {

            return {
                valid: false,
                error:
                    "No active wallet is available."
            };

        }

        if (
            wallet.network &&
            wallet.network !== "solana"
        ) {

            return {
                valid: false,
                error:
                    "The active wallet is not on Solana."
            };

        }

        return {
            valid: true,
            wallet: wallet,
            error: null
        };

    }


    // =====================================================
    // PREPARE PAYMENT
    //
    // IMPORTANT:
    // This does NOT sign anything.
    //
    // The actual Solana recipient address will be supplied
    // later by the VYRO username/backend system.
    // =====================================================

    async function preparePayment() {

        const payment =
            getPendingPayment();

        const paymentValidation =
            validatePayment(payment);

        if (
            !paymentValidation.valid
        ) {

            throw new Error(
                paymentValidation.error
            );

        }

        const walletValidation =
            validateWallet();

        if (
            !walletValidation.valid
        ) {

            throw new Error(
                walletValidation.error
            );

        }

        const wallet =
            walletValidation.wallet;


        // =================================================
        // RECIPIENT ADDRESS CHECK
        // =================================================
        //
        // Stage 8 will resolve:
        //
        // @username
        //
        // into:
        //
        // Solana wallet address
        //
        // We intentionally DO NOT fake this here.
        // =================================================

        if (
            !payment.recipientAddress
        ) {

            return {
                status:
                    "awaiting-recipient-resolution",

                success:
                    false,

                walletAddress:
                    wallet.address,

                recipient:
                    payment.recipient,

                amount:
                    payment.amount,

                asset:
                    payment.asset || "USDC",

                network:
                    payment.network || "Solana",

                message:
                    "Recipient wallet address has not been resolved yet."
            };

        }


        // =================================================
        // TRANSACTION HANDOFF PLACEHOLDER
        // =================================================
        //
        // The actual Solana transaction construction will
        // occur once the VYRO backend can resolve the
        // recipient address and provide the required
        // transaction data.
        //
        // VYRO NEVER SIGNS THE TRANSACTION.
        // =================================================

        return {
            status:
                "ready-for-wallet",

            success:
                true,

            walletAddress:
                wallet.address,

            recipient:
                payment.recipient,

            recipientAddress:
                payment.recipientAddress,

            amount:
                payment.amount,

            asset:
                payment.asset || "USDC",

            network:
                payment.network || "Solana"
        };

    }


    // =====================================================
    // PUBLIC PAYMENT API
    // =====================================================

    window.VYROPayments = {

        getPendingPayment:
            getPendingPayment,

        clearPendingPayment:
            clearPendingPayment,

        validatePayment:
            validatePayment,

        validateWallet:
            validateWallet,

        preparePayment:
            preparePayment

    };


    console.log(
        "VYRO: Payment system loaded."
    );

})();
