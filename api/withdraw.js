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

        // 1. توليد معرف فريد جداً باستخدام الوقت بالملي ثانية
        // هذا السطر هو السر في تغيير الـ Memo في كل مرة
        const forceUniqueUid = `${uid}_${Date.now()}`; 

        // 2. طلب Payment ID جديد
        let paymentId;
        const piRes = await axios.post('https://api.minepi.com/v2/payments', {
            payment: {
                amount: parseFloat(amount),
                memo: "New Withdrawal",
                metadata: { type: "withdraw" },
                uid: forceUniqueUid 
            }
        }, { headers: { 'Authorization': `Key ${PI_API_KEY}` } });
        
        paymentId = piRes.data.identifier;

        // 3. بناء المعاملة على البلوكشين
        const sourceKeypair = StellarSdk.Keypair.fromSecret(MY_WALLET_SEED);
        const account = await server.loadAccount(sourceKeypair.publicKey());

        const transaction = new StellarSdk.TransactionBuilder(account, {
            fee: "100000", // رسوم أولوية
            networkPassphrase: PI_NETWORK_PASSPHRASE
        })
        .addOperation(StellarSdk.Operation.payment({
            destination: walletAddress,
            asset: StellarSdk.Asset.native(),
            amount: amount.toString()
        }))
        .addMemo(StellarSdk.Memo.text(paymentId)) // ميمو جديد تماماً
        .setTimeout(180)
        .build();

        transaction.sign(sourceKeypair);
        const result = await server.submitTransaction(transaction);

        // 4. تأكيد العملية فوراً
        await axios.post(`https://api.minepi.com/v2/payments/${paymentId}/complete`, 
            { txid: result.hash }, 
            { headers: { 'Authorization': `Key ${PI_API_KEY}` } }
        ).catch(e => console.log("Note: Payment already completed or linked."));

        return res.json({
            success: true,
            message: "✅ تم السحب بنجاح! الـ Memo الجديد هو: " + paymentId,
            txid: result.hash
        });

    } catch (error) {
        console.error("Technical Error:", error.response?.data || error.message);
        return res.status(500).json({ 
            success: false, 
            message: "حدث خطأ. يرجى المحاولة مرة أخرى." 
        });
    }
};
