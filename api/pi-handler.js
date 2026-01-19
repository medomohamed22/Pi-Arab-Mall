const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const StellarSdk = require('stellar-sdk');

// تهيئة Supabase باستخدام المتغيرات البيئية
const supabase = createClient(
    'https://xncapmzlwuisupkjlftb.supabase.co', 
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async (req, res) => {
    // 1. إعدادات CORS للسماح بالاتصال من المتصفح
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const { action, walletAddress, amount, uid, paymentData } = req.body;
    const PI_API_KEY = process.env.PI_API_KEY;
    const MY_WALLET_SEED = process.env.MY_WALLET_SEED;

    try {
        // --- أولاً: حالة السحب من التطبيق للمستخدم (Withdraw) ---
        if (action === 'withdraw') {
            const PI_HORIZON_URL = "https://api.testnet.minepi.com";
            const server = new StellarSdk.Server(PI_HORIZON_URL);

            // أ. إنشاء طلب دفع في Pi API (سيولد Payment ID فريد يستخدم كميمو)
            let paymentId;
            try {
                const piRes = await axios.post('https://api.minepi.com/v2/payments', {
                    payment: {
                        amount: parseFloat(amount),
                        memo: "Withdrawal Payout",
                        metadata: { type: "withdraw" },
                        uid: uid 
                    }
                }, { headers: { 'Authorization': `Key ${PI_API_KEY}` } });
                paymentId = piRes.data.identifier;
            } catch (apiErr) {
                // إذا وجد معاملة معلقة، نستخدم الـ ID الخاص بها لإكمالها
                if (apiErr.response?.data?.error === "ongoing_payment_found") {
                    paymentId = apiErr.response.data.payment.identifier;
                } else {
                    throw apiErr;
                }
            }

            // ب. تنفيذ المعاملة على البلوكشين (Stellar/Pi Network)
            const sourceKeypair = StellarSdk.Keypair.fromSecret(MY_WALLET_SEED);
            const account = await server.loadAccount(sourceKeypair.publicKey());

            const transaction = new StellarSdk.TransactionBuilder(account, {
                fee: "250000", // رسوم أولوية عالية لضمان السرعة
                networkPassphrase: "Pi Testnet"
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
            const txid = result.hash;

            // ج. تأكيد الإكمال في Pi API وتخزين البيانات في Supabase
            await axios.post(`https://api.minepi.com/v2/payments/${paymentId}/complete`, 
                { txid: txid }, 
                { headers: { 'Authorization': `Key ${PI_API_KEY}` } }
            ).catch(() => console.log("Payment already completed/linked"));

            // تسجيل العملية في Supabase
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

        // --- ثانياً: حالة تأكيد الإيداع من المستخدم للتطبيق (Complete Deposit) ---
        if (action === 'complete-deposit') {
            const { paymentId, txid } = paymentData;

            // إكمال الدفع في سجلات Pi
            await axios.post(`https://api.minepi.com/v2/payments/${paymentId}/complete`, 
                { txid: txid }, 
                { headers: { 'Authorization': `Key ${PI_API_KEY}` } }
            );

            // تسجيل الإيداع في Supabase
            await supabase.from('transactions').insert([{
                user_uid: uid,
                amount: parseFloat(amount),
                type: 'deposit',
                status: 'completed',
                memo: paymentId,
                txid: txid
            }]);

            return res.json({ success: true, message: "تم تسجيل الإيداع بنجاح" });
        }

    } catch (error) {
        console.error("Technical Error:", error.response?.data || error.message);
        return res.status(500).json({ 
            success: false, 
            message: "فشل الإجراء التقني", 
            error: error.response?.data || error.message 
        });
    }
};
