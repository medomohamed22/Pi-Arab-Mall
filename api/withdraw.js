const axios = require('axios');
const StellarSdk = require('stellar-sdk');

module.exports = async (req, res) => {
    // إعدادات CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();

    // 1. استدعاء المتغيرات الهامة (لن يتم حذفها)
    const { walletAddress, amount, uid } = req.body;
    const PI_API_KEY = process.env.PI_API_KEY;
    const MY_WALLET_SEED = process.env.MY_WALLET_SEED; // ضروري جداً الآن للتوقيع

    // التحقق من وجود الـ Seed
    if (!MY_WALLET_SEED) {
        return res.status(500).json({ success: false, message: "Wallet Seed is missing in Vercel Variables" });
    }

    try {
        // --- إعدادات شبكة Pi ---
        // إذا كنت في وضع التجربة، استخدم Testnet. إذا حقيقي، استخدم Mainnet.
        // هذا الكود معد لـ Mainnet (الحقيقي) بناءً على طلبك.
        const PI_HORIZON_URL = "https://api.mainnet.minepi.com";
        const PI_NETWORK_PASSPHRASE = "Pi Network"; 
        
        // لو أردت التجربة (Testnet) غير السطرين اللي فوق بـ:
        // const PI_HORIZON_URL = "https://api.testnet.minepi.com";
        // const PI_NETWORK_PASSPHRASE = "Pi Testnet";

        const server = new StellarSdk.Server(PI_HORIZON_URL);

        // 2. إنشاء طلب الدفع (Payment Intent) في Pi API
        // هذا مجرد سجل إداري
        let paymentId;
        try {
            const piRes = await axios.post('https://api.minepi.com/v2/payments', {
                payment: {
                    amount: parseFloat(amount),
                    memo: "Pi Arab Mall Withdrawal",
                    metadata: { type: "withdraw" },
                    uid: uid
                }
            }, { headers: { 'Authorization': `Key ${PI_API_KEY}` } });
            paymentId = piRes.data.identifier;
        } catch (err) {
            // التعامل مع عملية معلقة
            if (err.response && err.response.data.error === "ongoing_payment_found") {
                paymentId = err.response.data.payment.identifier;
                console.log("Resuming ongoing payment:", paymentId);
            } else {
                throw err;
            }
        }

        // 3. بناء المعاملة الحقيقية على البلوكشين (The Real Transfer)
        const sourceKeypair = StellarSdk.Keypair.fromSecret(MY_WALLET_SEED);
        const sourcePublicKey = sourceKeypair.publicKey();

        // تحميل بيانات محفظتك لمعرفة رقم التسلسل (Sequence Number)
        const account = await server.loadAccount(sourcePublicKey);

        // تجهيز العملية
        const transaction = new StellarSdk.TransactionBuilder(account, {
            fee: "10000", // رسوم الشبكة القياسية (0.00001 Pi)
            networkPassphrase: PI_NETWORK_PASSPHRASE
        })
        .addOperation(StellarSdk.Operation.payment({
            destination: walletAddress,
            asset: StellarSdk.Asset.native(),
            amount: amount.toString()
        }))
        .setTimeout(30) // مهلة 30 ثانية
        .build();

        // 4. التوقيع باستخدام الـ Seed الخاص بك
        transaction.sign(sourceKeypair);

        // 5. إرسال المعاملة للبلوكشين
        console.log("جاري إرسال العملات فعلياً...");
        const result = await server.submitTransaction(transaction);
        const txid = result.hash; // هذا هو كود المعاملة الحقيقي

        console.log("تم النقل بنجاح! TXID:", txid);

        // 6. إبلاغ سيرفر Pi بأن العملية تمت (Complete)
        await axios.post(`https://api.minepi.com/v2/payments/${paymentId}/complete`, {
            txid: txid
        }, { headers: { 'Authorization': `Key ${PI_API_KEY}` } });

        return res.json({
            success: true,
            message: "تم السحب بنجاح ووصل الرصيد للمحفظة",
            paymentId: paymentId,
            txid: txid
        });

    } catch (error) {
        console.error("Error:", error.message);
        
        // استخراج تفاصيل الخطأ إذا كان من Stellar
        let errorMsg = error.message;
        if (error.response && error.response.data && error.response.data.extras) {
            console.error("Stellar Extras:", JSON.stringify(error.response.data.extras));
            errorMsg = "Blockchain Error: " + JSON.stringify(error.response.data.extras.result_codes);
        } else if (error.response) {
             errorMsg = error.response.data.error_message || error.response.data;
        }

        return res.status(500).json({
            success: false,
            message: "فشل السحب: " + errorMsg
        });
    }
};
