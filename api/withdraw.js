const axios = require('axios');
const StellarSdk = require('stellar-sdk');

module.exports = async (req, res) => {
    // إعدادات CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const { walletAddress, amount, uid } = req.body;
    const PI_API_KEY = process.env.PI_API_KEY;
    const MY_WALLET_SEED = process.env.MY_WALLET_SEED;

    // التحقق من المتغيرات قبل البدء
    if (!PI_API_KEY || !MY_WALLET_SEED) {
        return res.status(500).json({ 
            success: false, 
            message: "Server Configuration Error: API Key or Wallet Seed is missing." 
        });
    }

    try {
        // تحديد الشبكة (تلقائياً Mainnet حسب طلبك)
        const PI_HORIZON_URL = "https://api.mainnet.minepi.com";
        const PI_NETWORK_PASSPHRASE = "Pi Network";
        const server = new StellarSdk.Server(PI_HORIZON_URL);

        // 1. تسجيل الطلب في Pi API
        let paymentId;
        try {
            const piRes = await axios.post('https://api.minepi.com/v2/payments', {
                payment: {
                    amount: parseFloat(amount),
                    memo: "Withdrawal from App",
                    metadata: { type: "withdraw" },
                    uid: uid
                }
            }, { headers: { 'Authorization': `Key ${PI_API_KEY}` } });
            paymentId = piRes.data.identifier;
        } catch (apiErr) {
            // التعامل مع وجود عملية معلقة
            if (apiErr.response && apiErr.response.data && apiErr.response.data.error === "ongoing_payment_found") {
                paymentId = apiErr.response.data.payment.identifier;
                console.log("Resuming pending payment:", paymentId);
            } else {
                throw apiErr; // إعادة توجيه الخطأ للـ catch الرئيسي
            }
        }

        // 2. تجهيز المفاتيح
        const sourceKeypair = StellarSdk.Keypair.fromSecret(MY_WALLET_SEED);
        const sourcePublicKey = sourceKeypair.publicKey();

        // 3. تحميل بيانات الحساب (Sequence Number)
        const account = await server.loadAccount(sourcePublicKey);

        // 4. بناء المعاملة
        const transaction = new StellarSdk.TransactionBuilder(account, {
            fee: "10000", // 0.00001 Pi
            networkPassphrase: PI_NETWORK_PASSPHRASE
        })
        .addOperation(StellarSdk.Operation.payment({
            destination: walletAddress,
            asset: StellarSdk.Asset.native(),
            amount: amount.toString()
        }))
        .setTimeout(180) // زيادة المهلة لضمان عدم الفشل السريع
        .build();

        // 5. التوقيع والإرسال
        transaction.sign(sourceKeypair);
        console.log("Submitting transaction to blockchain...");
        
        const result = await server.submitTransaction(transaction);
        const txid = result.hash;

        console.log("Success! TXID:", txid);

        // 6. إغلاق الطلب في Pi API
        await axios.post(`https://api.minepi.com/v2/payments/${paymentId}/complete`, {
            txid: txid
        }, { headers: { 'Authorization': `Key ${PI_API_KEY}` } });

        return res.json({
            success: true,
            message: "Withdrawal Successful",
            paymentId: paymentId,
            txid: txid
        });

    } catch (error) {
        // --- منطقة إصلاح الخطأ ---
        console.error("Full Error Object:", error); // طباعة الخطأ كاملاً في Vercel Logs

        let errorMessage = "Unknown Error";

        // 1. التعامل مع أخطاء Stellar (الأكثر شيوعاً)
        if (error.response && error.response.data && error.response.data.extras) {
            console.error("Stellar Extras:", JSON.stringify(error.response.data.extras));
            const resultCodes = error.response.data.extras.result_codes;
            errorMessage = `Blockchain Error: ${resultCodes ? JSON.stringify(resultCodes) : 'Unknown Stellar Error'}`;
        } 
        // 2. التعامل مع أخطاء Axios/HTTP (مثل 400, 500)
        else if (error.response && error.response.data) {
            // هنا كان الخطأ السابق: نتأكد أن البيانات موجودة قبل قراءتها
            errorMessage = error.response.data.error_message || JSON.stringify(error.response.data);
        } 
        // 3. التعامل مع الأخطاء البرمجية العادية
        else {
            errorMessage = error.message;
        }

        return res.status(500).json({
            success: false,
            message: "Failed to withdraw: " + errorMessage
        });
    }
};
