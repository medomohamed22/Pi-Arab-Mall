export default async function handler(req, res) {
  // 1. التحقق من نوع الطلب (Method)
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }
  
  // 2. الحصول على البيانات (Vercel يقوم بعمل Parse للـ JSON تلقائياً)
  const { paymentId } = req.body;
  
  if (!paymentId) {
    return res.status(400).json({ error: 'Missing paymentId' });
  }
  
  const PI_SECRET_KEY = process.env.PI_SECRET_KEY;
  const PI_API_BASE = 'https://api.minepi.com/v2';
  
  try {
    const response = await fetch(`${PI_API_BASE}/payments/${paymentId}/approve`, {
      method: 'POST',
      headers: {
        'Authorization': `Key ${PI_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
    });
    
    if (response.ok) {
      return res.status(200).json({ approved: true });
    } else {
      const error = await response.json();
      return res.status(response.status).json({ error });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
