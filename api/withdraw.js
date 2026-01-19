const axios = require('axios');

module.exports = async (req, res) => {
    // إعدادات CORS للسماح بالاتصال من المتصفح
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // --- استعادة المتغيرات التي حُذفت ---
    const PI_API_KEY = process.env.PI_API_KEY;
    const MY_WALLET_SEED = process.env.MY_WALLET_SEED; 
    // ملاحظة: الـ Seed مخزن في Vercel للاستخدام في التوثيق أو التوقيع المستقبلي

    const { walletAddress, amount, uid } = req.body;

    try {
        // 1. محاولة إنشاء طلب دفع App-to-User
        const response = await axios.post('https://api.minepi.com/v2/payments', {
            payment: {
                amount: parseFloat(amount),
                memo: "Withdrawal from Pi Arab Mall",
                metadata: { type: "withdraw" },
                uid: uid
            }
        }, {
            headers: { 'Authorization': `Key ${PI_API_KEY}` }
        });

        const paymentId = response.data.identifier;

        // 2. إرسال أمر "إكمال" (Complete) فوراً لإنهاء العملية وخصم الرصيد
        await axios.post(`https://api.minepi.com/v2/payments/${paymentId}/complete`, {}, {
            headers: { 'Authorization': `Key ${PI_API_KEY}` }
        });

        return res.json({
            success: true,
            paymentId: paymentId,
            message: "تمت المعاملة وخصم الرصيد بنجاح"
        });

    } catch (error) {
        const errorData = error.response ? error.response.data : {};

        // حل مشكلة العملية المعلقة (التي واجهتك سابقاً)
        if (errorData.error === "ongoing_payment_found") {
            const pendingId = errorData.payment.identifier;
            
            try {
                // محاولة إغلاق العملية المعلقة القديمة
                await axios.post(`https://api.minepi.com/v2/payments/${pendingId}/complete`, {}, {
                    headers: { 'Authorization': `Key ${PI_API_KEY}` }
                });
                
                return res.json({
                    success: true,
                    paymentId: pendingId,
                    message: "تم إكمال عملية معلقة سابقة بنجاح"
                });
            } catch (compErr) {
                return res.status(500).json({ success: false, message: "فشل إكمال العملية المعلقة" });
            }
        }

        return res.status(500).json({ 
            success: false, 
            message: errorData.error_message || "حدث خطأ غير متوقع" 
        });
    }
};
