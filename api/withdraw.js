const axios = require('axios');

module.exports = async (req, res) => {
    // إعدادات CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    const { walletAddress, amount, uid } = req.body;

    // جلب البيانات من متغيرات البيئة السرية
    const PI_API_KEY = process.env.PI_API_KEY;
    const MY_WALLET_SEED = process.env.MY_WALLET_SEED;

    try {
        const response = await axios.post('https://api.minepi.com/v2/payments', {
            payment: {
                amount: parseFloat(amount),
                memo: "Withdrawal from Vercel App",
                metadata: { 
                    type: "withdraw",
                    // ملاحظة: الـ Seed عادة يستخدم للتوقيع محلياً، 
                    // لكننا نضعه هنا إذا كان نظامك يتطلبه كـ Metadata
                    internal_seed: MY_WALLET_SEED 
                },
                uid: uid
            }
        }, {
            headers: { 'Authorization': `Key ${PI_API_KEY}` }
        });

        return res.json({
            success: true,
            paymentId: response.data.identifier
        });

    } catch (error) {
        return res.status(500).json({ 
            success: false, 
            message: error.response ? error.response.data : error.message 
        });
    }
};
