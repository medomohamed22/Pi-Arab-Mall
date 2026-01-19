const axios = require('axios');
const StellarSdk = require('stellar-sdk');
const crypto = require('crypto'); // مكتبة لتوليد أرقام عشوائية

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

        // 1. توليد UID عشوائي تماماً في كل ضغطة (لإجبار Pi على فتح دفع جديد)
        const randomId = crypto.randomBytes(4).toString('hex');
        const forceUniqueUid = `user_${uid}_${Date.now()}_${randomId}`; 

        // 2. إنشاء طلب الدفع
        let paymentId;
        const piRes = await axios.post('https://api.minepi.com/v2/payments', {
            payment: {
                amount: parseFloat(amount),
                memo: `Order${randomId}`, // ميمو داخلي مختلف
                metadata: { type: "withdraw" },
                uid: forceUniqueUid 
            }
        }, { headers: { 'Authorization': `Key ${PI_API_KEY}` } });
        
        paymentId = piRes.data.identifier;

        // 3. بناء المعاملة على البلوكشين
        const sourceKeypair = StellarSdk.Keypair.fromSecret(MY_WALLET_SEED);
        const account = await server.loadAccount(sourceKeypair.publicKey());

        const transaction = new StellarSdk.TransactionBuilder(account, {
            fee: "100000", // رسوم عالية لضمان السرعة
            networkPassphrase: PI_NETWORK_PASSPHRASE
        })
        .addOperation(StellarSdk.Operation.payment({
            destination: walletAddress,
            asset: StellarSdk.Asset.native(),
            amount: amount.toString()
        }))
        // نضع الـ paymentId الجديد كـ Memo إجباري
        .addMemo(StellarSdk.Memo.text(paymentId)) 
        .setTimeout(180)
        .build();

        transaction.sign(sourceKeypair);
        const result = await server.submitTransaction(transaction);

        // 4. تأكيد العملية
        await axios.post(`https://api.minepi.com/v2/payments/${paymentId}/complete`, {
            txid: result.hash
        }, { headers: { 'Authorization': `Key ${PI_API_KEY}` } }).catch(() => {});

        return res.json({
            success: true,
            message: "تمت العملية بـ Memo فريد: " + paymentId,
            txid: result.hash
        });

    } catch (error) {
        console.error("Technical Error:", error.response?.data || error.message);
        return res.status(500).json({ 
            success: false, 
            message: "حدث خطأ تقني، حاول مرة أخرى بمعرف مختلف." 
        });
    }
};
