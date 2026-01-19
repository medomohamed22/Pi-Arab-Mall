const axios = require('axios');

module.exports = async (req, res) => {
    // إعدادات CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();

    // الحفاظ على المدخلات والمتغيرات المطلوبة
    const { walletAddress, amount, uid } = req.body;
    const PI_API_KEY = process.env.PI_API_KEY;

    // دالة للتحقق من حالة العملية على البلوكشين (Polling)
    const waitForBlockchainConfirmation = async (paymentId) => {
        const maxAttempts = 10; // عدد محاولات الفحص
        const interval = 3000;  // الانتظار 3 ثوانٍ بين كل فحص

        for (let i = 0; i < maxAttempts; i++) {
            console.log(`فحص حالة البلوكشين... محاولة رقم ${i + 1}`);
            const checkRes = await axios.get(`https://api.minepi.com/v2/payments/${paymentId}`, {
                headers: { 'Authorization': `Key ${PI_API_KEY}` }
            });

            // التأكد من أن المعاملة تم توثيقها (Verified) واكتملت برمجياً (Completed)
            if (checkRes.data.status.transaction_verified && checkRes.data.status.developer_completed) {
                return { confirmed: true, data: checkRes.data };
            }
            
            // الانتظار قبل المحاولة القادمة
            await new Promise(resolve => setTimeout(resolve, interval));
        }
        return { confirmed: false };
    };

    try {
        let paymentId;

        try {
            // 1. محاولة إنشاء دفع جديد
            const response = await axios.post('https://api.minepi.com/v2/payments', {
                payment: {
                    amount: parseFloat(amount),
                    memo: "Withdrawal from Pi Arab Mall",
                    metadata: { type: "withdraw", target: walletAddress },
                    uid: uid
                }
            }, {
                headers: { 'Authorization': `Key ${PI_API_KEY}` }
            });
            paymentId = response.data.identifier;
        } catch (error) {
            const errorData = error.response ? error.response.data : {};
            // إذا وجد عملية معلقة، نستخدم المعرف الخاص بها
            if (errorData.error === "ongoing_payment_found") {
                paymentId = errorData.payment.identifier;
                console.log("تم اكتشاف عملية معلقة برقم:", paymentId);
            } else {
                throw error; // إعادة إلقاء الخطأ إذا لم يكن بسبب عملية معلقة
            }
        }

        // 2. إرسال أمر إكمال العملية (Complete) للسيرفر
        await axios.post(`https://api.minepi.com/v2/payments/${paymentId}/complete`, {}, {
            headers: { 'Authorization': `Key ${PI_API_KEY}` }
        });

        // 3. الانتظار حتى تأكيد البلوكشين
        const confirmation = await waitForBlockchainConfirmation(paymentId);

        if (confirmation.confirmed) {
            return res.json({ 
                success: true, 
                status: "confirmed_on_blockchain",
                paymentId: paymentId,
                txid: confirmation.data.transaction.txid,
                message: "تم تأكيد العملية بنجاح على البلوكشين" 
            });
        } else {
            return res.json({ 
                success: true, 
                status: "pending_on_blockchain",
                paymentId: paymentId,
                message: "تم إرسال الطلب، لكنه يستغرق وقتاً طويلاً للتأكيد على البلوكشين. يمكنك الفحص لاحقاً." 
            });
        }

    } catch (error) {
        console.error("خطأ في التنفيذ:", error.response ? error.response.data : error.message);
        return res.status(500).json({ 
            success: false, 
            message: error.response ? error.response.data.error_message : "خطأ في معالجة العملية" 
        });
    }
};
