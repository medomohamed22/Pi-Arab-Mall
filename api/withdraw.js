const axios = require('axios');
const StellarSdk = require('stellar-sdk');

module.exports = async (req, res) => {
    // 1. إعدادات CORS المتكاملة
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();

    // 2. المتغيرات الأساسية (محفوظة كلياً)
    const { walletAddress, amount, uid } = req.body;
    const PI_API_KEY = process.env.PI_API_KEY;
    const MY_WALLET_SEED = process.env.MY_WALLET_SEED;

    if (!PI_API_KEY || !MY_WALLET_SEED) {
        return res.status(500).json({ success: false, message: "Server Config Error" });
    }

    try {
        // 3. إعدادات الشبكة (Testnet)
        const PI_HORIZON_URL = "https://api.testnet.minepi.com";
        const PI_NETWORK_PASSPHRASE = "Pi Testnet";
        const server = new StellarSdk.Server(PI_HORIZON_URL);

        // 4. خطوة Pi API: إنشاء أو جلب الطلب
        let paymentId;
        try {
            const piRes = await axios.post('https://api.minepi.com/v2/payments', {
                payment: {
                    amount: parseFloat(amount),
                    memo: "Withdrawal Payment",
                    metadata: { type: "withdraw" },
                    uid: uid
                }
            }, { 
                headers: { 'Authorization': `Key ${PI_API_KEY}` },
                timeout: 8000 // مهلة انتظار 8 ثوانٍ
            });
            paymentId = piRes.data.identifier;
        } catch (apiErr) {
            const errData = apiErr.response?.data;
            if (errData?.error === "ongoing_payment_found") {
                paymentId = errData.payment.identifier;
            } else {
                throw apiErr;
            }
        }

        // 5. خطوة البلوكشين: بناء وإرسال المعاملة
        const sourceKeypair = StellarSdk.Keypair.fromSecret(MY_WALLET_SEED);
        const account = await server.loadAccount(sourceKeypair.publicKey());
        
        // استخدام رسوم ثابتة قوية لسرعة التنفيذ (0.003 Pi)
        const transaction = new StellarSdk.TransactionBuilder(account, {
            fee: "30000",
            networkPassphrase: PI_NETWORK_PASSPHRASE
        })
        .addOperation(StellarSdk.Operation.payment({
            destination: walletAddress,
            asset: StellarSdk.Asset.native(),
            amount: amount.toString()
        }))
        .addMemo(StellarSdk.Memo.text(paymentId)) // ربط المعاملة بالطلب
        .setTimeout(60)
        .build();

        transaction.sign(sourceKeypair);
        const result = await server.submitTransaction(transaction);
        const txid = result.hash;

        // 6. خطوة التأكيد النهائي (مع معالجة ذكية للخطأ المتكرر)
        try {
            await axios.post(`https://api.minepi.com/v2/payments/${paymentId}/complete`, 
                { txid: txid }, 
                { headers: { 'Authorization': `Key ${PI_API_KEY}` } }
            );
        } catch (completeErr) {
            const cErrData = completeErr.response?.data;
            // إذا كانت العملية مرتبطة مسبقاً، فهذا يعني نجاحاً تاماً في الواقع
            if (cErrData?.verification_error === "payment_already_linked_with_a_tx") {
                console.log("Payment already verified, returning success.");
            } else {
                throw completeErr;
            }
        }

        // 7. الرد النهائي بالنجاح للمستخدم
        return res.status(200).json({
            success: true,
            message: "✅ تم السحب بنجاح! الرصيد في طريقه لمحفظتك.",
            txid: txid
        });

    } catch (error) {
        // طباعة التفاصيل في السجلات (Logs) للمطور فقط
        const technicalError = error.response?.data || error.message;
        console.error("Technical Error Details:", technicalError);

        // إذا كان الخطأ النهائي هو "مرتبطة مسبقاً" حتى بعد الفشل في الـ Catch الرئيسي
        if (JSON.stringify(technicalError).includes("payment_already_linked_with_a_tx")) {
            return res.status(200).json({
                success: true,
                message: "✅ تم تأكيد السحب بنجاح!"
            });
        }

        // رسالة بسيطة للمستخدم
        return res.status(500).json({
            success: false,
            message: "⚠️ عذراً، تعذر إتمام العملية. يرجى التأكد من رصيدك أو المحاولة لاحقاً."
        });
    }
};
