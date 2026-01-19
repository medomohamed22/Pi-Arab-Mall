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

        // 1. الحصول على Payment ID
        let paymentId;
        try {
            const piRes = await axios.post('https://api.minepi.com/v2/payments', {
                payment: {
                    amount: parseFloat(amount),
                    memo: "Withdrawal Payment",
                    metadata: { type: "withdraw" },
                    uid: uid
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

        // 2. تنفيذ المعاملة على البلوكشين
        const sourceKeypair = StellarSdk.Keypair.fromSecret(MY_WALLET_SEED);
        const account = await server.loadAccount(sourceKeypair.publicKey());

        const transaction = new StellarSdk.TransactionBuilder(account, {
            fee: "250000", // رسوم أولوية لضمان السرعة
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

        // 3. تأكيد الإكمال (مع تجاهل الأخطاء إذا كانت المعاملة مرتبطة فعلاً)
        try {
            await axios.post(`https://api.minepi.com/v2/payments/${paymentId}/complete`, 
                { txid: txid }, 
                { headers: { 'Authorization': `Key ${PI_API_KEY}` } }
            );
        } catch (completeErr) {
            // إذا كان الخطأ أن العملية مرتبطة أصلاً، فهذا نجاح وليس فشل
            const vErr = completeErr.response?.data?.verification_error;
            if (vErr !== "payment_already_linked_with_a_tx") {
                console.log("تنبيه: خطأ بسيط في التأكيد لكن المعاملة تمت في البلوكشين.");
            }
        }

        // --- دائماً نرجع نجاح طالما وصلت لـ txid ---
        return res.json({
            success: true,
            message: "✅ تمت العملية بنجاح ووصلت المحفظة!",
            memo_used: paymentId,
            transaction_hash: txid
        });

    } catch (error) {
        console.error("Technical Error:", error.response?.data || error.message);
        return res.status(500).json({
            success: false,
            message: "⚠️ حدث خطأ في النظام، يرجى التحقق من محفظتك."
        });
    }
};
