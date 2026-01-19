const axios = require('axios');
const StellarSdk = require('stellar-sdk');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const { walletAddress, amount, uid } = req.body; // نستخدم الـ uid الأصلي القادم من Pi SDK
    const PI_API_KEY = process.env.PI_API_KEY;
    const MY_WALLET_SEED = process.env.MY_WALLET_SEED;

    try {
        const PI_HORIZON_URL = "https://api.testnet.minepi.com";
        const PI_NETWORK_PASSPHRASE = "Pi Testnet";
        const server = new StellarSdk.Server(PI_HORIZON_URL);

        // 1. طلب Payment من Pi API (باستخدام الـ UID الحقيقي للمستخدم)
        let paymentId;
        try {
            const piRes = await axios.post('https://api.minepi.com/v2/payments', {
                payment: {
                    amount: parseFloat(amount),
                    memo: "Official Withdrawal",
                    metadata: { type: "withdraw" },
                    uid: uid // الـ UID الحقيقي بدون إضافات
                }
            }, { headers: { 'Authorization': `Key ${PI_API_KEY}` } });
            paymentId = piRes.data.identifier;
        } catch (apiErr) {
            // إذا وجد معاملة معلقة، نأخذ الـ ID الخاص بها لننهيها ونغير الـ Memo في المرة القادمة
            if (apiErr.response?.data?.error === "ongoing_payment_found") {
                paymentId = apiErr.response.data.payment.identifier;
            } else {
                throw apiErr;
            }
        }

        // 2. بناء المعاملة برسوم عالية جداً (لضمان السرعة القصوى)
        const sourceKeypair = StellarSdk.Keypair.fromSecret(MY_WALLET_SEED);
        const account = await server.loadAccount(sourceKeypair.publicKey());

        const transaction = new StellarSdk.TransactionBuilder(account, {
            fee: "200000", // رفعنا الرسوم أكثر لضمان التأكيد اللحظي
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

        // 3. تأكيد الإكمال (خطوة حاسمة لفتح الطريق للمعاملة التالية بـ Memo جديد)
        await axios.post(`https://api.minepi.com/v2/payments/${paymentId}/complete`, 
            { txid: txid }, 
            { headers: { 'Authorization': `Key ${PI_API_KEY}` } }
        );

        return res.json({
            success: true,
            message: "✅ تم السحب! انتظر 10 ثوانٍ قبل السحب القادم لضمان تغيير الـ Memo.",
            txid: txid,
            paymentId: paymentId
        });

    } catch (error) {
        console.error("Technical Error:", error.response?.data || error.message);
        return res.status(500).json({ success: false, message: "فشلت العملية، حاول مرة أخرى." });
    }
};
