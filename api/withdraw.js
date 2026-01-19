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

    try {
        const PI_HORIZON_URL = "https://api.testnet.minepi.com";
        const PI_NETWORK_PASSPHRASE = "Pi Testnet";
        const server = new StellarSdk.Server(PI_HORIZON_URL);

        // --- تعديل لضمان أن UID دائماً جديد تماماً لسيرفر Pi ---
        const timestamp = Date.now();
        const forceUniqueUid = `${uid}_${timestamp}`; 

        let paymentId;
        try {
            const piRes = await axios.post('https://api.minepi.com/v2/payments', {
                payment: {
                    amount: parseFloat(amount),
                    memo: `Order_${timestamp}`, // تغيير الـ memo هنا أيضاً لـ Pi API
                    metadata: { type: "withdraw" },
                    uid: forceUniqueUid 
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

        // بناء المعاملة مع ضمان Memo فريد للبلوكشين
        const transaction = new StellarSdk.TransactionBuilder(account, {
            fee: "100000",
            networkPassphrase: PI_NETWORK_PASSPHRASE
        })
        .addOperation(StellarSdk.Operation.payment({
            destination: walletAddress,
            asset: StellarSdk.Asset.native(),
            amount: amount.toString()
        }))
        // --- تعديل إجباري: نستخدم الـ paymentId الحقيقي لربط العملية ---
        .addMemo(StellarSdk.Memo.text(paymentId)) 
        // -----------------------------------------------------------
        .setTimeout(180)
        .build();

        transaction.sign(sourceKeypair);
        const result = await server.submitTransaction(transaction);

        await axios.post(`https://api.minepi.com/v2/payments/${paymentId}/complete`, {
            txid: result.hash
        }, { headers: { 'Authorization': `Key ${PI_API_KEY}` } }).catch(() => {});

        return res.json({
            success: true,
            message: "✅ تم السحب بـ Memo فريد: " + paymentId,
            txid: result.hash
        });

    } catch (error) {
        return res.status(500).json({ success: false, message: "حدث خطأ، جرب مرة أخرى." });
    }
};
