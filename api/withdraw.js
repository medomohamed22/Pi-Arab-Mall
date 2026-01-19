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
        return res.status(500).json({ success: false, message: "خطأ في تهيئة النظام." });
    }

    try {
        const PI_HORIZON_URL = "https://api.testnet.minepi.com";
        const PI_NETWORK_PASSPHRASE = "Pi Testnet";
        const server = new StellarSdk.Server(PI_HORIZON_URL);

        // --- التعديل الجوهري هنا ---
        // نقوم بدمج الـ uid مع الوقت الحالي لضمان أن كل طلب هو "دفع جديد" تماماً
        const uniqueUid = `${uid}_${Date.now()}`;
        // ---------------------------

        let paymentId;
        try {
            const piRes = await axios.post('https://api.minepi.com/v2/payments', {
                payment: {
                    amount: parseFloat(amount),
                    memo: "Withdrawal Payment",
                    metadata: { type: "withdraw" },
                    uid: uniqueUid // نرسل الـ uid المتغير هنا
                }
            }, { headers: { 'Authorization': `Key ${PI_API_KEY}` } });
            paymentId = piRes.data.identifier;
        } catch (apiErr) {
            // في حالة وجود دفع معلق لنفس الـ uniqueUid (وهذا شبه مستحيل الآن)
            if (apiErr.response && apiErr.response.data && apiErr.response.data.error === "ongoing_payment_found") {
                paymentId = apiErr.response.data.payment.identifier;
            } else {
                throw apiErr;
            }
        }

        const sourceKeypair = StellarSdk.Keypair.fromSecret(MY_WALLET_SEED);
        const account = await server.loadAccount(sourceKeypair.publicKey());

        // رفع الرسوم لضمان سرعة التأكيد في المعاملات المتتالية
        const transaction = new StellarSdk.TransactionBuilder(account, {
            fee: "50000", 
            networkPassphrase: PI_NETWORK_PASSPHRASE
        })
        .addOperation(StellarSdk.Operation.payment({
            destination: walletAddress,
            asset: StellarSdk.Asset.native(),
            amount: amount.toString()
        }))
        .addMemo(StellarSdk.Memo.text(paymentId)) // هنا سيكون الـ Memo دائماً جديداً
        .setTimeout(180)
        .build();

        transaction.sign(sourceKeypair);
        const result = await server.submitTransaction(transaction);
        const txid = result.hash;

        // تأكيد الإكمال
        await axios.post(`https://api.minepi.com/v2/payments/${paymentId}/complete`, {
            txid: txid
        }, { headers: { 'Authorization': `Key ${PI_API_KEY}` } });

        return res.json({
            success: true,
            message: "✅ تم السحب بنجاح بـ Memo فريد!",
            txid: txid,
            paymentId: paymentId // أرسلنا الـ id لكي تراه في الرد
        });

    } catch (error) {
        console.error("Technical Error Details:", error.response ? error.response.data : error.message);
        return res.status(500).json({
            success: false,
            message: "⚠️ عذراً، حاول مرة أخرى بعد قليل."
        });
    }
};
