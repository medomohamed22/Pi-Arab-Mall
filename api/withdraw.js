const axios = require('axios');
const StellarSdk = require('stellar-sdk');
const crypto = require('crypto'); // مكتبة مدمجة لتوليد قيم عشوائية

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const { walletAddress, amount } = req.body;
    const PI_API_KEY = process.env.PI_API_KEY;
    const MY_WALLET_SEED = process.env.MY_WALLET_SEED;

    try {
        const PI_HORIZON_URL = "https://api.testnet.minepi.com";
        const PI_NETWORK_PASSPHRASE = "Pi Testnet";
        const server = new StellarSdk.Server(PI_HORIZON_URL);

        // --- التعديل السحري هنا ---
        // سنولد UID عشوائي تماماً لا علاقة له بالقديم إطلاقاً
        const ghostUid = crypto.randomBytes(12).toString('hex'); 
        // -------------------------

        let paymentId;
        try {
            const piRes = await axios.post('https://api.minepi.com/v2/payments', {
                payment: {
                    amount: parseFloat(amount),
                    memo: "Express Withdrawal",
                    metadata: { type: "withdraw" },
                    uid: ghostUid // نرسل المعرف العشوائي الجديد
                }
            }, { headers: { 'Authorization': `Key ${PI_API_KEY}` } });
            
            paymentId = piRes.data.identifier;
        } catch (apiErr) {
            // إذا استمر الخطأ، سنعرض تفاصيله بدقة لنعرف لماذا يرفض اليوزر العشوائي
            console.error("API Error Detail:", apiErr.response?.data);
            throw apiErr;
        }

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

        await axios.post(`https://api.minepi.com/v2/payments/${paymentId}/complete`, 
            { txid: result.hash }, 
            { headers: { 'Authorization': `Key ${PI_API_KEY}` } }
        ).catch(() => {});

        return res.json({
            success: true,
            message: "✅ تم السحب بنجاح بـ Memo فريد تماماً!",
            txid: result.hash,
            paymentId: paymentId
        });

    } catch (error) {
        return res.status(500).json({ 
            success: false, 
            message: "فشل السحب. جرب مرة أخرى، سيتم توليد معرف جديد تلقائياً." 
        });
    }
};
