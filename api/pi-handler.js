const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const StellarSdk = require('stellar-sdk');

// تفكيك الكلاسات من StellarSdk لتجنب خطأ "Not a constructor"
const { Server, TransactionBuilder, Keypair, Operation, Asset, Memo } = StellarSdk;

// تهيئة Supabase
const supabase = createClient(
    'https://xncapmzlwuisupkjlftb.supabase.co', 
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async (req, res) => {
    // إعدادات CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const { action, walletAddress, amount, uid, paymentData } = req.body;
    const PI_API_KEY = process.env.PI_API_KEY;
    const MY_WALLET_SEED = process.env.MY_WALLET_SEED;

    try {
        const PI_HORIZON_URL = "https://api.testnet.minepi.com";
        const server = new Server(PI_HORIZON_URL);

        // --- الحالة الأولى: سحب من التطبيق للمستخدم ---
        if (action === 'withdraw') {
            let paymentId;
            
            // 1. إنشاء طلب الدفع في Pi API للحصول على الميمو
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
                if (apiErr.response?.data?.error === "ongoing_payment_found") {
                    paymentId = apiErr.response.data.payment.identifier;
                } else {
                    throw apiErr;
                }
            }

            // 2. بناء المعاملة على البلوكشين
            const sourceKeypair = Keypair.fromSecret(MY_WALLET_SEED);
            const account = await server.loadAccount(sourceKeypair.publicKey());

            const transaction = new TransactionBuilder(account, {
                fee: "500000", // رسوم أولوية عالية جداً
                networkPassphrase: "Pi Testnet"
            })
            .addOperation(Operation.payment({
                destination: walletAddress,
                asset: Asset.native(),
                amount: amount.toString()
            }))
            .addMemo(Memo.text(paymentId)) 
            .setTimeout(300)
            .build();

            transaction.sign(sourceKeypair);
            const result = await server.submitTransaction(transaction);
            const txid = result.hash;

            // 3. تأكيد الإكمال في Pi وتسجيل البيانات في Supabase
            await axios.post(`https://api.minepi.com/v2/payments/${paymentId}/complete`, 
                { txid: txid }, 
                { headers: { 'Authorization': `Key ${PI_API_KEY}` } }
            );

            await supabase.from('transactions').insert([{
                user_uid: uid,
                amount: parseFloat(amount),
                type: 'withdraw',
                status: 'completed',
                memo: paymentId,
                txid: txid
            }]);

            return res.json({ success: true, message: "تم السحب بنجاح", memo: paymentId, txid: txid });
        }

        // --- الحالة الثانية: تأكيد إيداع المستخدم للتطبيق ---
        if (action === 'complete-deposit') {
            const { paymentId, txid } = paymentData;

            await axios.post(`https://api.minepi.com/v2/payments/${paymentId}/complete`, 
                { txid: txid }, 
                { headers: { 'Authorization': `Key ${PI_API_KEY}` } }
            );

            await supabase.from('transactions').insert([{
                user_uid: uid,
                amount: parseFloat(amount),
                type: 'deposit',
                status: 'completed',
                memo: paymentId,
                txid: txid
            }]);

            return res.json({ success: true, message: "تم تسجيل الإيداع" });
        }

    } catch (error) {
        console.error("Error Details:", error.response?.data || error.message);
        return res.status(500).json({ 
            success: false, 
            message: error.message,
            error_details: error.response?.data 
        });
    }
};
