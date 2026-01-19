const axios = require('axios');

module.exports = async (req, res) => {
    // إعدادات CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();

    // السطر المطلوب (لن يتم حذفه)
    const { walletAddress, amount, uid } = req.body;
    const PI_API_KEY = process.env.PI_API_KEY;

    try {
        let payment;

        // 1. محاولة إنشاء أو جلب الدفعة المعلقة
        try {
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
            payment = response.data;
        } catch (error) {
            const errorData = error.response ? error.response.data : {};
            if (errorData.error === "ongoing_payment_found") {
                payment = errorData.payment;
            } else {
                throw error;
            }
        }

        const paymentId = payment.identifier;

        // 2. الحصول على txid (رقم المعاملة) - ضروري جداً لتجنب الخطأ الذي ظهر لك
        let txid = payment.transaction ? payment.transaction.txid : null;

        // إذا لم يتوفر txid فوراً، نقوم بعمل فحص (Polling) لمدة 10 ثوانٍ
        if (!txid) {
            for (let i = 0; i < 5; i++) {
                await new Promise(r => setTimeout(r, 2000)); // انتظار ثانيتين بين كل محاولة
                const checkStatus = await axios.get(`https://api.minepi.com/v2/payments/${paymentId}`, {
                    headers: { 'Authorization': `Key ${PI_API_KEY}` }
                });
                if (checkStatus.data.transaction && checkStatus.data.transaction.txid) {
                    txid = checkStatus.data.transaction.txid;
                    break;
                }
            }
        }

        // 3. التحقق النهائي قبل الإكمال
        if (!txid) {
            return res.status(400).json({ 
                success: false, 
                message: "Blockchain txid not generated yet. Please try again in a moment." 
            });
        }

        // 4. إرسال الـ txid إلى نقطة النهاية /complete (حل مشكلة txid param)
        await axios.post(`https://api.minepi.com/v2/payments/${paymentId}/complete`, {
            txid: txid
        }, {
            headers: { 'Authorization': `Key ${PI_API_KEY}` }
        });

        return res.json({
            success: true,
            paymentId: paymentId,
            txid: txid,
            message: "تم التأكيد والإكمال بنجاح"
        });

    } catch (error) {
        console.error("Pi API Error:", error.response ? error.response.data : error.message);
        return res.status(500).json({
            success: false,
            message: error.response ? error.response.data.error_message : "Internal Server Error"
        });
    }
};
