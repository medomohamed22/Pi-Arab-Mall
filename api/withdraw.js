const axios = require('axios');
const StellarSdk = require('stellar-sdk');

module.exports = async (req, res) => {
    // 1. إعدادات CORS للسماح بالاتصال من واجهة التطبيق
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();

    // 2. المتغيرات الأساسية (محفوظة كما طلبت)
    const { walletAddress, amount, uid } = req.body;
    const PI_API_KEY = process.env.PI_API_KEY;
    const MY_WALLET_SEED = process.env.MY_WALLET_SEED;

    // فحص الأمان للمتغيرات
    if (!PI_API_KEY || !MY_WALLET_SEED) {
        return res.status(500).json({ 
            success: false, 
            message: "خطأ في الإعدادات: API Key أو Wallet Seed غير موجود في Vercel." 
        });
    }

    try {
        // 3. إعدادات شبكة Pi (تم الضبط على Testnet بناءً على السجلات السابقة)
        const PI_HORIZON_URL = "https://api.testnet.minepi.com";
        const PI_NETWORK_PASSPHRASE = "Pi Testnet";
        const server = new StellarSdk.Server(PI_HORIZON_URL);

        // 4. تسجيل العملية في نظام Pi API
        let paymentId;
        try {
            const piRes = await axios.post('https://api.minepi.com/v2/payments', {
                payment: {
                    amount: parseFloat(amount),
                    memo: "Pi Mall Withdrawal",
                    metadata: { type: "withdraw" },
                    uid: uid
                }
            }, { headers: { 'Authorization': `Key ${PI_API_KEY}` } });
            paymentId = piRes.data.identifier;
        } catch (apiErr) {
            if (apiErr.response && apiErr.response.data && apiErr.response.data.error === "ongoing_payment_found") {
                paymentId = apiErr.response.data.payment.identifier;
                console.log("استئناف عملية معلقة:", paymentId);
            } else {
                throw apiErr;
            }
        }

        // 5. بناء وتوقيع المعاملة على البلوكشين
        const sourceKeypair = StellarSdk.Keypair.fromSecret(MY_WALLET_SEED);
        const sourcePublicKey = sourceKeypair.publicKey();

        // تحميل بيانات الحساب
        const account = await server.loadAccount(sourcePublicKey);

        // --- تحديث: جلب الرسوم الديناميكية لضمان القبول ---
        let currentFee = "10000"; // القيمة الافتراضية
        try {
            const feeStats = await server.feeStats();
            // نستخدم رسوم أعلى قليلاً من المتوسط لضمان سرعة التنفيذ
            currentFee = (parseInt(feeStats.last_ledger_base_fee) * 3).toString();
        } catch (e) {
            console.log("تعذر جلب الرسوم، استخدام القيمة الافتراضية.");
        }

        // بناء العملية
        const transaction = new StellarSdk.TransactionBuilder(account, {
            fee: currentFee,
            networkPassphrase: PI_NETWORK_PASSPHRASE
        })
        .addOperation(StellarSdk.Operation.payment({
            destination: walletAddress,
            asset: StellarSdk.Asset.native(),
            amount: amount.toString()
        }))
        .setTimeout(180)
        .build();

        // التوقيع
        transaction.sign(sourceKeypair);

        // إرسال المعاملة للبلوكشين
        console.log("جاري إرسال المعاملة برسوم:", currentFee);
        const result = await server.submitTransaction(transaction);
        const txid = result.hash;

        // 6. إبلاغ Pi API باكتمال المعاملة (إرسال الـ txid)
        await axios.post(`https://api.minepi.com/v2/payments/${paymentId}/complete`, {
            txid: txid
        }, { headers: { 'Authorization': `Key ${PI_API_KEY}` } });

        return res.json({
            success: true,
            message: "تم السحب بنجاح!",
            txid: txid,
            paymentId: paymentId
        });

    } catch (error) {
        console.error("تفاصيل الخطأ كاملة:", error);
        
        let errorMsg = error.message;
        // محاولة استخراج رسالة خطأ مفصلة من البلوكشين
        if (error.response && error.response.data && error.response.data.extras) {
            errorMsg = `Blockchain Error: ${JSON.stringify(error.response.data.extras.result_codes)}`;
        } else if (error.response && error.response.data) {
            errorMsg = error.response.data.error_message || JSON.stringify(error.response.data);
        }

        return res.status(500).json({
            success: false,
            message: "فشل في إتمام السحب: " + errorMsg
        });
    }
};
