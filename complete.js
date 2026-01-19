import { createClient } from '@supabase/supabase-js';

// تهيئة Supabase (تأكد من إضافة المفاتيح في Vercel Env)
const supabase = createClient(
  process.env.SUPABASE_URL, 
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const { paymentId, txid, username, uid, amount } = req.body;
  const PI_SECRET_KEY = process.env.PI_SECRET_KEY;

  try {
    // 1. إبلاغ Pi Network بإتمام المعاملة
    const piResponse = await fetch(`https://api.minepi.com/v2/payments/${paymentId}/complete`, {
      method: 'POST',
      headers: {
        'Authorization': `Key ${PI_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ txid }),
    });

    if (!piResponse.ok) {
      const errorData = await piResponse.json();
      return res.status(400).json({ error: errorData });
    }

    // 2. إذا نجحت المعاملة، سجلها في Supabase
    const { data, error } = await supabase
      .from('payments')
      .insert([
        { 
          payment_id: paymentId, 
          txid: txid, 
          username: username, 
          user_uid: uid, 
          amount: parseFloat(amount) 
        }
      ]);

    if (error) throw error;

    return res.status(200).json({ success: true, message: "تم التأكيد والحفظ في القاعدة" });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
