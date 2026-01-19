const axios = require('axios');
const StellarSdk = require('stellar-sdk');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const PI_API_KEY = process.env.PI_API_KEY;
    const MY_WALLET_SEED = process.env.MY_WALLET_SEED;

    try {
        const PI_HORIZON_URL = "https://api.testnet.minepi.com";
        const server = new StellarSdk.Server(PI_HORIZON_URL);

        // 1. المعرف العالق الذي يسبب المشكلة
        const stuckPaymentId = "sZIh8myfsSOJY820X905sji7ZsWq";

        console.log("محاولة أخيرة لتنظيف المعاملة العالقة...");
        
        // محاولة إلغاء المعاملة (إذا كان النظام يسمح)
        await axios.post(`https://api.minepi.com/v2/payments/${stuckPaymentId}/cancel`, {}, {
            headers: { 'Authorization': `Key ${PI_API_KEY}` }
        }).catch(e => console.log("لا يمكن الإلغاء، ربما يجب الإكمال فقط."));

        // 2. محاولة إنشاء معاملة جديدة تماماً "بمبلغ مختلف"
        // أحياناً تغيير المبلغ يكسر نظام الـ Cache في API
        const randomSmallAmount = (0.01 + Math.random() * 0.01).toFixed(2);
        const uniqueUid = `reset_${Date.now()}`;

        const piRes = await axios.post('https://api.minepi.com/v2/payments', {
            payment: {
                amount: parseFloat(randomSmallAmount),
                memo: "Reset System",
                metadata: { type: "withdraw" },
                uid: uniqueUid
            }
        }, { headers: { 'Authorization': `Key ${PI_API_KEY}` } });

        const paymentId = piRes.data.identifier;

        // 3. التنفيذ على البلوكشين
        const sourceKeypair = StellarSdk.Keypair.fromSecret(MY_WALLET_SEED);
        const account = await server.loadAccount(sourceKeypair.publicKey());

        const transaction = new StellarSdk.TransactionBuilder(account, {
            fee: "100000",
            networkPassphrase: "Pi Testnet"
        })
        .addOperation(StellarSdk.Operation.payment({
            destination: req.body.walletAddress,
            asset: StellarSdk.Asset.native(),
            amount: randomSmallAmount.toString()
        }))
        .addMemo(StellarSdk.Memo.text(paymentId))
        .setTimeout(180)
        .build();

        transaction.sign(sourceKeypair);
        const result = await server.submitTransaction(transaction);

        await axios.post(`https://api.minepi.com/v2/payments/${paymentId}/complete`, 
            { txid: result.hash }, 
            { headers: { 'Authorization': `Key ${PI_API_KEY}` } }
        );

        return res.json({ success: true, message: "تم كسر العقدة بنجاح!", paymentId });

    } catch (error) {
        const errData = error.response?.data;
        console.error("Critical Error:", errData);

        // إذا لا يزال يعطيك نفس المعاملة العالقة
        if (errData?.payment?.identifier === "sZIh8myfsSOJY820X905sji7ZsWq") {
            return res.status(400).json({
                success: false,
                message: "النظام عالق يدوياً. برجاء الانتظار 24 ساعة لكي يقوم سيستم Pi بحذفها تلقائياً (Timeout)، أو حاول استخدام API Key جديد وتطبيق جديد.",
                stuck_id: errData.payment.identifier
            });
        }

        return res.status(500).json({ success: false, error: errData || error.message });
    }
};
