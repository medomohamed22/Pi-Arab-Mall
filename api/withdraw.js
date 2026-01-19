const axios = require('axios');
const StellarSdk = require('stellar-sdk');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const { walletAddress, amount, uid } = req.body;
    const PI_API_KEY = process.env.PI_API_KEY;
    const MY_WALLET_SEED = process.env.MY_WALLET_SEED;

    if (!PI_API_KEY || !MY_WALLET_SEED) {
        return res.status(500).json({ success: false, message: "Server Configuration Error" });
    }

    try {
        const PI_HORIZON_URL = "https://api.testnet.minepi.com";
        const PI_NETWORK_PASSPHRASE = "Pi Testnet";
        const server = new StellarSdk.Server(PI_HORIZON_URL);

        // ضمان توليد UID فريد عند كل طلب لتغيير الـ Memo
        const uniqueUid = `${uid}_${Date.now()}`;

        let paymentId;
        try {
            const piRes = await axios.post('https://api.minepi.com/v2/payments', {
                payment: {
                    amount: parseFloat(amount),
                    memo: "Withdrawal",
                    metadata: { type: "withdraw" },
                    uid: uniqueUid 
                }
            }, { headers: { 'Authorization': `Key ${PI_API_KEY}` } });
            paymentId = piRes.data.identifier;
        } catch (apiErr) {
            if (apiErr.response?.data?.error === "ongoing_payment_found") {
                paymentId = apiErr.response.data.payment.identifier;
            } else {
                throw apiErr;
            }
        }

        const sourceKeypair = StellarSdk.Keypair.fromSecret(MY_WALLET_SEED);
        const account = await server.loadAccount(sourceKeypair.publicKey());

        // --- الحل: رفع الرسوم لضمان النجاح ---
        const transaction = new StellarSdk.TransactionBuilder(account, {
            fee: "150000", // زيادة الرسوم لتجنب tx_insufficient_fee
            networkPassphrase: PI_NETWORK_PASSPHRASE
        })
        .addOperation(StellarSdk.Operation.payment({
            destination: walletAddress,
            asset: StellarSdk.Asset.native(),
            amount: amount.toString()
        }))
        .addMemo(StellarSdk.Memo.text(paymentId)) 
        .setTimeout(180)
        .build();

        transaction.sign(sourceKeypair);
        const result = await server.submitTransaction(transaction);
        const txid = result.hash;

        await axios.post(`https://api.minepi.com/v2/payments/${paymentId}/complete`, 
            { txid: txid }, 
            { headers: { 'Authorization': `Key ${PI_API_KEY}` } }
        ).catch(() => {});

        return res.json({
            success: true,
            message: "✅ تمت العملية بنجاح بـ Memo فريد ورسوم كافية!",
            txid: txid,
            paymentId: paymentId
        });

    } catch (error) {
        console.error("Technical Error Details:", error.response?.data || error.message);
        return res.status(500).json({
            success: false,
            message: "⚠️ فشلت المعاملة، يرجى المحاولة مرة أخرى."
        });
    }
};
