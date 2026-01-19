const axios = require('axios');
const StellarSdk = require('stellar-sdk');

module.exports = async (req, res) => {
    // 1. إعدادات CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const { walletAddress, amount, uid } = req.body;
    const PI_API_KEY = process.env.PI_API_KEY;
    const MY_WALLET_SEED = process.env.MY_WALLET_SEED;

    if (!PI_API_KEY || !MY_WALLET_SEED) {
        return res.status(500).json({ success: false, message: "فشل في تهيئة السيرفر" });
    }

    try {
        const PI_HORIZON_URL = "https://api.testnet.minepi.com";
        const PI_NETWORK_PASSPHRASE = "Pi Testnet";
        const server = new StellarSdk.Server(PI_HORIZON_URL);

        // 1. طلب Payment ID من Pi API
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
            // التعامل مع المعاملات المعلقة (Ongoing)
            if (apiErr.response?.data?.error === "ongoing_payment_found") {
                paymentId = apiErr.response.data.payment.identifier;
            } else {
                throw apiErr;
            }
        }

        // 2. بناء المعاملة على البلوكشين
        const sourceKeypair = StellarSdk.Keypair.fromSecret(MY_WALLET_SEED);
        const account = await server.loadAccount(sourceKeypair.publicKey());

        const transaction = new StellarSdk.TransactionBuilder(account, {
            fee: "200000", // رسوم عالية لضمان النجاح اللحظي
            networkPassphrase: PI_NETWORK_PASSPHRASE
        })
        .addOperation(StellarSdk.Operation.payment({
            destination: walletAddress,
            asset: StellarSdk.Asset.native(),
            amount: amount.toString()
        }))
        .addMemo(StellarSdk.Memo.text(paymentId)) // وضع الـ Payment ID في الميمو
        .setTimeout(180)
        .build();

        transaction.sign(sourceKeypair);
        const result = await server.submitTransaction(transaction);
        const txid = result.hash;

        // 3. تأكيد الإكمال لـ Pi API
        await axios.post(`https://api.minepi.com/v2/payments/${paymentId}/complete`, 
            { txid: txid }, 
            { headers: { 'Authorization': `Key ${PI_API_KEY}` } }
        );

        // --- رسالة النجاح النهائية التي ستظهر للمستخدم ---
        return res.json({
            success: true,
            status: "SUCCESS",
            message: "✅ تمت العملية بنجاح!",
            memo_used: paymentId, // إظهار رقم الميمو بوضوح
            transaction_hash: txid,
            note: "يرجى الانتظار دقيقة قبل المعاملة التالية لضمان تغيير الميمو."
        });

    } catch (error) {
        console.error("Technical Error:", error.response?.data || error.message);
        
        // إظهار سبب الخطأ إذا كان من Pi API
        const errorMessage = error.response?.data?.error_message || "فشلت المعاملة، يرجى المحاولة مرة أخرى.";
        
        return res.status(500).json({
            success: false,
            message: `⚠️ خطأ: ${errorMessage}`
        });
    }
};
