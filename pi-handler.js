const axios = require('axios');
const StellarSdk = require('stellar-sdk');
const { createClient } = require('@supabase/supabase-api');

const supabase = createClient('https://xncapmzlwuisupkjlftb.supabase.co', process.env.SUPABASE_SERVICE_ROLE_KEY);

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const { action, walletAddress, amount, uid, paymentData } = req.body;
    const PI_API_KEY = process.env.PI_API_KEY;
    const MY_WALLET_SEED = process.env.MY_WALLET_SEED;

    try {
        // --- الحالة الأولى: سحب من التطبيق للمستخدم (Withdraw) ---
        if (action === 'withdraw') {
            const server = new StellarSdk.Server("https://api.testnet.minepi.com");
            
            // 1. إنشاء Payment ID
            const piRes = await axios.post('https://api.minepi.com/v2/payments', {
                payment: { amount: parseFloat(amount), memo: "Withdrawal", metadata: { type: "withdraw" }, uid: uid }
            }, { headers: { 'Authorization': `Key ${PI_API_KEY}` } });
            
            const paymentId = piRes.data.identifier;

            // 2. تنفيذ المعاملة على البلوكشين
            const sourceKeypair = StellarSdk.Keypair.fromSecret(MY_WALLET_SEED);
            const account = await server.loadAccount(sourceKeypair.publicKey());
            const transaction = new StellarSdk.TransactionBuilder(account, { fee: "200000", networkPassphrase: "Pi Testnet" })
                .addOperation(StellarSdk.Operation.payment({ destination: walletAddress, asset: StellarSdk.Asset.native(), amount: amount.toString() }))
                .addMemo(StellarSdk.Memo.text(paymentId))
                .setTimeout(180).build();

            transaction.sign(sourceKeypair);
            const result = await server.submitTransaction(transaction);

            // 3. تأكيد الإكمال وتسجيل في Supabase
            await axios.post(`https://api.minepi.com/v2/payments/${paymentId}/complete`, { txid: result.hash }, { headers: { 'Authorization': `Key ${PI_API_KEY}` } });
            
            await supabase.from('transactions').insert([{ user_uid: uid, amount, type: 'withdraw', memo: paymentId, txid: result.hash, status: 'completed' }]);

            return res.json({ success: true, memo: paymentId, txid: result.hash });
        }

        // --- الحالة الثانية: دفع من المستخدم للتطبيق (Deposit/Approve) ---
        if (action === 'complete-deposit') {
            const { paymentId, txid } = paymentData;
            
            await axios.post(`https://api.minepi.com/v2/payments/${paymentId}/complete`, { txid: txid }, { headers: { 'Authorization': `Key ${PI_API_KEY}` } });
            
            await supabase.from('transactions').insert([{ user_uid: uid, amount, type: 'deposit', memo: paymentId, txid: txid, status: 'completed' }]);

            return res.json({ success: true });
        }

    } catch (error) {
        console.error(error);
        return res.status(500).json({ success: false, error: error.message });
    }
};
