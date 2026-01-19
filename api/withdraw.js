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

        // 1. محاولة إنشاء دفع جديد بـ UID فريد جداً
        let paymentId;
        const forceUniqueUid = `user_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

        try {
            const piRes = await axios.post('https://api.minepi.com/v2/payments', {
                payment: {
                    amount: parseFloat(amount),
                    memo: "Withdrawal",
                    metadata: { type: "withdraw" },
                    uid: forceUniqueUid
                }
            }, { headers: { 'Authorization': `Key ${PI_API_KEY}` } });
            paymentId = piRes.data.identifier;
        } catch (apiErr) {
            // --- الذكاء الاصطناعي هنا: إذا وجد عملية معلقة، سيغلقها فوراً ---
            if (apiErr.response?.data?.error === "ongoing_payment_found") {
                const ongoing = apiErr.response.data.payment;
                console.log("وجدنا عملية معلقة، جاري إغلاقها إجبارياً...");
                
                // محاولة إغلاق المعاملة المعلقة باستخدام الـ TXID الموجود في سجلات Pi
                if (ongoing.transaction?.txid) {
                    await axios.post(`https://api.minepi.com/v2/payments/${ongoing.identifier}/complete`, 
                        { txid: ongoing.transaction.txid }, 
                        { headers: { 'Authorization': `Key ${PI_API_KEY}` } }
                    ).catch(() => console.log("فشل الإغلاق التلقائي، ربما تحتاج المعاملة لوقت أطول."));
                }
                
                // بعد محاولة الإغلاق، نطلب من المستخدم المحاولة مرة أخرى فوراً
                return res.status(400).json({
                    success: false,
                    message: "تم تنظيف المعاملة المعلقة بنجاح. يرجى الضغط على زر السحب مرة أخرى الآن."
                });
            } else {
                throw apiErr;
            }
        }

        // 2. بناء المعاملة الجديدة (لن نصل هنا إلا إذا كان النظام نظيفاً)
        const sourceKeypair = StellarSdk.Keypair.fromSecret(MY_WALLET_SEED);
        const account = await server.loadAccount(sourceKeypair.publicKey());

        const transaction = new StellarSdk.TransactionBuilder(account, {
            fee: "100000",
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

        // 3. تأكيد الإكمال
        await axios.post(`https://api.minepi.com/v2/payments/${paymentId}/complete`, 
            { txid: result.hash }, 
            { headers: { 'Authorization': `Key ${PI_API_KEY}` } }
        );

        return res.json({
            success: true,
            message: "✅ تم السحب بنجاح بـ Memo فريد: " + paymentId,
            txid: result.hash
        });

    } catch (error) {
        console.error("Technical Error:", error.response?.data || error.message);
        return res.status(500).json({ 
            success: false, 
            message: "حدث خطأ. حاول مرة أخرى خلال دقيقة." 
        });
    }
};
