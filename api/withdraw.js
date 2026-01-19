const axios = require('axios');
const StellarSdk = require('stellar-sdk');

module.exports = async (req, res) => {
    // 1. إعدادات CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();

    // 2. المتغيرات الأساسية (محفوظة كلياً كما طلبت)
    const { walletAddress, amount, uid } = req.body;
    const PI_API_KEY = process.env.PI_API_KEY;
    const MY_WALLET_SEED = process.env.MY_WALLET_SEED;

    if (!PI_API_KEY || !MY_WALLET_SEED) {
        return res.status(500).json({ success: false, message: "خطأ في تهيئة النظام. يرجى المحاولة لاحقاً." });
    }

    try {
        // 3. إعدادات الشبكة
        const PI_HORIZON_URL = "https://api.testnet.minepi.com";
        const PI_NETWORK_PASSPHRASE = "Pi Testnet";
        const server = new StellarSdk.Server(PI_HORIZON_URL);

        // 4. تسجيل الطلب في Pi API
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
            if (apiErr.response && apiErr.response.data && apiErr.response.data.error === "ongoing_payment_found") {
                paymentId = apiErr.response.data.payment.identifier;
            } else {
                throw apiErr;
            }
        }

        // 5. بناء المعاملة على البلوكشين
        const sourceKeypair = StellarSdk.Keypair.fromSecret(MY_WALLET_SEED);
        const sourcePublicKey = sourceKeypair.publicKey();
        const account = await server.loadAccount(sourcePublicKey);

        const feeStats = await server.feeStats().catch(() => ({ last_ledger_base_fee: "10000" }));
        const dynamicFee = (parseInt(feeStats.last_ledger_base_fee) * 3).toString();

        const transaction = new StellarSdk.TransactionBuilder(account, {
            fee: dynamicFee,
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

        // 6. التوقيع والإرسال
        transaction.sign(sourceKeypair);
        const result = await server.submitTransaction(transaction);
        const txid = result.hash;

        // 7. تأكيد الإكمال (مع إصلاح معالجة الخطأ المكرر)
        try {
            await axios.post(`https://api.minepi.com/v2/payments/${paymentId}/complete`, {
                txid: txid
            }, { headers: { 'Authorization': `Key ${PI_API_KEY}` } });
        } catch (completeErr) {
            const errData = completeErr.response?.data;
            // إذا كانت المعاملة مرتبطة بالفعل بالبلوكشين، فهذا يعني نجاحاً تاماً وليس خطأً
            if (errData?.verification_error === "payment_already_linked_with_a_tx") {
                console.log("العملية ناجحة ومأكدة مسبقاً.");
            } else {
                throw completeErr;
            }
        }

        // رسالة النجاح الصافية للمستخدم
        return res.json({
            success: true,
            message: "✅ تم معالجة طلب السحب الخاص بك بنجاح ووصل الرصيد لمحفظتك!",
            txid: txid
        });

    } catch (error) {
        // فحص الخطأ داخل الـ catch الرئيسي أيضاً لضمان عدم إزعاج المستخدم
        const errData = error.response?.data;
        if (errData?.verification_error === "payment_already_linked_with_a_tx") {
            return res.json({
                success: true,
                message: "✅ تم معالجة طلب السحب الخاص بك بنجاح ووصل الرصيد لمحفظتك!"
            });
        }

        console.error("Technical Error Details:", errData || error.message);
        
        return res.status(500).json({
            success: false,
            message: "⚠️ عذراً، تعذر إكمال العملية حالياً. يرجى التأكد من رصيدك أو المحاولة مرة أخرى بعد قليل."
        });
    }
};
