const axios = require('axios');
const StellarSdk = require('stellar-sdk');

module.exports = async (req, res) => {
    // 1. إعدادات CORS
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
        return res.status(500).json({ success: false, message: "Server Configuration Error" });
    }

    try {
        const PI_HORIZON_URL = "https://api.testnet.minepi.com";
        const PI_NETWORK_PASSPHRASE = "Pi Testnet";
        const server = new StellarSdk.Server(PI_HORIZON_URL);

        // --- التعديل الجوهري لضمان معاملة فريدة ---
        // نقوم بدمج الـ uid مع الوقت الحالي بالملي ثانية لضمان أن كل طلب جديد تماماً
        const uniqueUid = `${uid}_${Date.now()}`; 
        // ----------------------------------------

        // 3. تسجيل طلب الدفع بـ UID فريد
        let paymentId;
        try {
            const piRes = await axios.post('https://api.minepi.com/v2/payments', {
                payment: {
                    amount: parseFloat(amount),
                    memo: "Withdrawal Payment",
                    metadata: { type: "withdraw" },
                    uid: uniqueUid // استخدام المعرف الفريد هنا
                }
            }, { headers: { 'Authorization': `Key ${PI_API_KEY}` } });
            paymentId = piRes.data.identifier;
        } catch (apiErr) {
            // حتى لو وجد معاملة معلقة، سنحاول جلبها
            if (apiErr.response?.data?.error === "ongoing_payment_found") {
                paymentId = apiErr.response.data.payment.identifier;
            } else {
                throw apiErr;
            }
        }

        // 4. بناء المعاملة (سيكون الـ Memo هو الـ PaymentId الجديد)
        const sourceKeypair = StellarSdk.Keypair.fromSecret(MY_WALLET_SEED);
        const account = await server.loadAccount(sourceKeypair.publicKey());
        
        const transaction = new StellarSdk.TransactionBuilder(account, {
            fee: "30000",
            networkPassphrase: PI_NETWORK_PASSPHRASE
        })
        .addOperation(StellarSdk.Operation.payment({
            destination: walletAddress,
            asset: StellarSdk.Asset.native(),
            amount: amount.toString()
        }))
        .addMemo(StellarSdk.Memo.text(paymentId)) // الـ Memo سيكون دائماً فريداً الآن
        .setTimeout(180)
        .build();

        // 5. التوقيع والإرسال
        transaction.sign(sourceKeypair);
        const result = await server.submitTransaction(transaction);
        const txid = result.hash;

        // 6. التأكيد النهائي
        try {
            await axios.post(`https://api.minepi.com/v2/payments/${paymentId}/complete`, 
                { txid: txid }, 
                { headers: { 'Authorization': `Key ${PI_API_KEY}` } }
            );
        } catch (cErr) {
            if (cErr.response?.data?.verification_error !== "payment_already_linked_with_a_tx") {
                throw cErr;
            }
        }

        return res.json({
            success: true,
            message: "✅ تم السحب بنجاح بـ Memo فريد!",
            txid: txid,
            paymentId: paymentId
        });

    } catch (error) {
        console.error("Error Detail:", error.response?.data || error.message);
        return res.status(500).json({
            success: false,
            message: "⚠️ فشل السحب، يرجى المحاولة مرة أخرى."
        });
    }
};
