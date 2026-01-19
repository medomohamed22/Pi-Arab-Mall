const axios = require('axios');

module.exports = async (req, res) => {
    // إعدادات CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ message: 'Method Not Allowed' });

    const { walletAddress, amount, uid } = req.body;

    // التحقق من وجود المتغيرات
    if (!process.env.PI_API_KEY) {
        return res.status(500).json({ success: false, message: "API Key is missing in Vercel settings" });
    }

    try {
        const response = await axios.post('https://api.minepi.com/v2/payments', {
            payment: {
                amount: parseFloat(amount),
                memo: "Withdrawal request",
                metadata: { type: "withdraw" },
                uid: uid
            }
        }, {
            headers: { 
                'Authorization': `Key ${process.env.PI_API_KEY}`,
                'Content-Type': 'application/json'
            },
            timeout: 10000 // مهلة 10 ثوانٍ
        });

        return res.json({ success: true, paymentId: response.data.identifier });

    } catch (error) {
        // طباعة تفاصيل الخطأ في Vercel Logs لمعرفة السبب الحقيقي
        console.error("Pi API Error:", error.response ? error.response.data : error.message);
        
        return res.status(error.response ? error.response.status : 500).json({ 
            success: false, 
            message: error.response ? error.response.data : "Internal Server Error" 
        });
    }
};
