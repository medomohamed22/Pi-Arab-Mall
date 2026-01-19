const axios = require('axios');
const StellarSdk = require('stellar-sdk');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const PI_API_KEY = process.env.PI_API_KEY;

    try {
        // هذه البيانات استخرجناها من رسالة الخطأ التي أرسلتها أنت
        const pendingPaymentId = "sZIh8myfsSOJY820X905sji7ZsWq";
        const pendingTxid = "aea5631f4491b73471bb20481fbb8ea4e5886722d733310dba5b578217b7b9ba";

        console.log("جاري محاولة إغلاق المعاملة المعلقة...");

        // إجبار نظام Pi على اعتماد الـ txid الذي تم فعلياً في البلوكشين
        const response = await axios.post(`https://api.minepi.com/v2/payments/${pendingPaymentId}/complete`, 
            { txid: pendingTxid }, 
            { headers: { 'Authorization': `Key ${PI_API_KEY}` } }
        );

        return res.json({
            success: true,
            message: "✅ تم تنظيف النظام وإغلاق المعاملة المعلقة! يمكنك الآن البدء بالـ 10 معاملات الجديدة.",
            details: response.data
        });

    } catch (error) {
        console.error("خطأ أثناء التنظيف:", error.response?.data || error.message);
        return res.status(500).json({
            success: false,
            message: "فشل التنظيف، قد تكون المعاملة اكتملت بالفعل أو تحتاج لتدخل يدوي.",
            error: error.response?.data
        });
    }
};
