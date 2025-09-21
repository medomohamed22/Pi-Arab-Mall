require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors'); // أضف للـ CORS إذا كان الموقع منفصل
const app = express();
app.use(express.json());
app.use(cors()); // للسماح بالطلبات من الموقع

const PI_API_URL = process.env.PI_API_URL || 'https://api.testnet.minepi.com/v2';
const PI_API_KEY = process.env.PI_API_KEY;

if (!PI_API_KEY) {
  console.error('أضف PI_API_KEY في .env');
  process.exit(1);
}

// موافقة على الدفع (Phase I)
app.post('/api/approve', async (req, res) => {
  const { paymentId } = req.body;
  if (!paymentId) return res.status(400).json({ error: 'paymentId مطلوب' });
  try {
    const response = await axios.post(`${PI_API_URL}/payments/${paymentId}/approve`, {}, {
      headers: { Authorization: `Key ${PI_API_KEY}` }
    });
    console.log('تم الموافقة:', response.data);
    res.json({ success: true, data: response.data });
  } catch (error) {
    console.error('خطأ في الموافقة:', error.response?.data || error.message);
    res.status(500).json({ error: 'فشل في الموافقة' });
  }
});

// إكمال الدفع (Phase III)
app.post('/api/complete', async (req, res) => {
  const { paymentId, txid } = req.body;
  if (!paymentId || !txid) return res.status(400).json({ error: 'paymentId و txid مطلوبان' });
  try {
    const response = await axios.post(`${PI_API_URL}/payments/${paymentId}/complete`, { txid }, {
      headers: { Authorization: `Key ${PI_API_KEY}` }
    });
    console.log('تم الإكمال:', response.data);
    // هنا يمكنك تحديث قاعدة بياناتك (مثل زيادة raised في الحملة)
    res.json({ success: true, data: response.data });
  } catch (error) {
    console.error('خطأ في الإكمال:', error.response?.data || error.message);
    res.status(500).json({ error: 'فشل في الإكمال - لا تُكمل الدفع' });
  }
});

app.listen(3000, () => console.log('الخادم يعمل على http://localhost:3000'));
