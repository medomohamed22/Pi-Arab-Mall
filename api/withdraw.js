const axios = require('axios');
const StellarSdk = require('stellar-sdk');
const crypto = require('crypto');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const { walletAddress, amount } = req.body;

    const PI_API_KEY = process.env.PI_API_KEY;
    const MY_WALLET_SEED = process.env.MY_WALLET_SEED;

    if (!walletAddress || !amount) {
        return res.status(400).json({
            success: false,
            message: "walletAddress و amount مطلوبين"
        });
    }

    try {
        const PI_HORIZON_URL = "https://api.testnet.minepi.com";
        const PI_NETWORK_PASSPHRASE = "Pi Testnet";
        const server = new StellarSdk.Server(PI_HORIZON_URL);

        // 🔹 UID فريد لكل معاملة
        const uniqueUid = `user_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

        // 1️⃣ إنشاء Payment ID من Pi API
        let paymentId;
        try {
            const piRes = await axios.post(
                'https://api.minepi.com/v2/payments',
                {
                    payment: {
                        amount: parseFloat(amount),
                        memo: "Withdrawal Payment",
                        metadata: {
                            type: "withdraw",
                            uid: uniqueUid
                        },
                        uid: uniqueUid
                    }
                },
                {
                    headers: {
                        Authorization: `Key ${PI_API_KEY}`
                    }
                }
            );
            paymentId = piRes.data.identifier;
        } catch (apiErr) {
            if (apiErr.response?.data?.error === "ongoing_payment_found") {
                paymentId = apiErr.response.data.payment.identifier;
            } else {
                throw apiErr;
            }
        }

        // 2️⃣ تنفيذ المعاملة على بلوكشين Pi (Stellar)
        const sourceKeypair = StellarSdk.Keypair.fromSecret(MY_WALLET_SEED);
        const account = await server.loadAccount(sourceKeypair.publicKey());

        const memoText = `PI-${paymentId.slice(0, 24)}`; // آمن ≤ 28 حرف

        const transaction = new StellarSdk.TransactionBuilder(account, {
            fee: "250000",
            networkPassphrase: PI_NETWORK_PASSPHRASE
        })
            .addOperation(
                StellarSdk.Operation.payment({
                    destination: walletAddress,
                    asset: StellarSdk.Asset.native(),
                    amount: amount.toString()
                })
            )
            .addMemo(StellarSdk.Memo.text(memoText))
            .setTimeout(180)
            .build();

        transaction.sign(sourceKeypair);
        const result = await server.submitTransaction(transaction);
        const txid = result.hash;

        // 3️⃣ تأكيد الإكمال مع Pi API
        try {
            await axios.post(
                `https://api.minepi.com/v2/payments/${paymentId}/complete`,
                { txid },
                {
                    headers: {
                        Authorization: `Key ${PI_API_KEY}`
                    }
                }
            );
        } catch (completeErr) {
            const vErr = completeErr.response?.data?.verification_error;
            if (vErr !== "payment_already_linked_with_a_tx") {
                console.warn("تنبيه: خطأ في تأكيد Pi لكن المعاملة مسجلة على البلوكشين");
            }
        }

        // ✅ نجاح نهائي
        return res.json({
            success: true,
            message: "✅ تمت العملية بنجاح",
            uid: uniqueUid,
            payment_id: paymentId,
            memo_used: memoText,
            transaction_hash: txid
        });

    } catch (error) {
        console.error("Technical Error:", error.response?.data || error.message);
        return res.status(500).json({
            success: false,
            message: "⚠️ حدث خطأ في النظام"
        });
    }
};
