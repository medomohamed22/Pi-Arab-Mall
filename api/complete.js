export default async function handler(req, res) {
  // 1. التحقق من نوع الطلب
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  // 2. استخراج البيانات مباشرة من req.body
  const { paymentId, txid } = req.body;

  if (!paymentId || !txid) {
    return res.status(400).json({ error: 'Missing paymentId or txid' });
  }

  const PI_SECRET_KEY = process.env.PI_SECRET_KEY;
  const PI_API_BASE = 'https://api.minepi.com/v2';

  try {
    const response = await fetch(`${PI_API_BASE}/payments/${paymentId}/complete`, {
      method: 'POST',
      headers: {
        'Authorization': `Key ${PI_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ txid }),
    });

    if (response.ok) {
      const data = await response.json();
      // إرجاع النتيجة بنظام Vercel
      return res.status(200).json({ completed: true, data });
    } else {
      const error = await response.json();
      return res.status(response.status).json({ error });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
