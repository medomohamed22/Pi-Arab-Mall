const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PI_API_KEY = process.env.PI_API_KEY;
const SESSION_SECRET = process.env.APP_SESSION_SECRET || SUPABASE_SERVICE_ROLE_KEY;
const PI_API_BASE = 'https://api.minepi.com/v2';

if (!SUPABASE_URL) throw new Error('Missing SUPABASE_URL');
if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');
if (!PI_API_KEY) throw new Error('Missing PI_API_KEY');

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

function setCors(res) { res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization'); }
function readBody(req) { return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}); }
function parseMetadata(metadata) { if (!metadata) return {}; if (typeof metadata === 'string') { try { return JSON.parse(metadata); } catch (_) { return {}; } } return metadata; }
function sign(value) { return crypto.createHmac('sha256', SESSION_SECRET).update(value).digest('base64url'); }
function requireUser(req) { const h = req.headers.authorization || ''; const token = h.startsWith('Bearer ') ? h.slice(7) : ''; const [payload, sig] = token.split('.'); if (!payload || !sig || sign(payload) !== sig) throw new Error('Invalid session'); const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); if (!data.pi_id) throw new Error('Invalid session'); return { pi_id: String(data.pi_id) }; }
async function assertOwnsProduct(productId, user) { const { data, error } = await supabase.from('products').select('seller_pi_id').eq('id', productId).single(); if (error) throw error; if (!data || data.seller_pi_id !== user.pi_id) throw new Error('Not allowed'); }

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const user = requireUser(req);
    const { paymentId, productId: bodyProductId } = readBody(req);
    if (!paymentId) return res.status(400).json({ error: 'paymentId is required' });

    const piRes = await fetch(`${PI_API_BASE}/payments/${paymentId}`, { headers: { Authorization: `Key ${PI_API_KEY}` } });
    if (!piRes.ok) throw new Error(`Pi API Error: ${await piRes.text()}`);
    const piData = await piRes.json();
    const metadata = parseMetadata(piData.metadata);
    const productId = metadata.productId || metadata.product_id || bodyProductId || null;
    if (!productId) throw new Error('Product ID missing');
    await assertOwnsProduct(productId, user);

    const amount = Number(piData.amount || 0);
    const { error } = await supabase.from('payments').upsert({
      payment_id: paymentId,
      user_id: user.pi_id,
      product_id: productId,
      amount,
      amount_pi: amount,
      amount_usd: metadata.usdAmount ? Number(metadata.usdAmount) : null,
      pi_usd_price: metadata.piUsdPrice ? Number(metadata.piUsdPrice) : null,
      status: 'approved'
    }, { onConflict: 'payment_id' });
    if (error) console.error('payments upsert warning:', error);

    const approveRes = await fetch(`${PI_API_BASE}/payments/${paymentId}/approve`, { method: 'POST', headers: { Authorization: `Key ${PI_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
    if (!approveRes.ok) throw new Error(`Pi approve failed: ${await approveRes.text()}`);
    return res.status(200).json({ approved: true });
  } catch (err) {
    console.error('approve error:', err);
    return res.status(/session|allowed/i.test(err.message) ? 403 : 500).json({ error: err.message });
  }
};
