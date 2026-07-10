const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

function normalizeSupabaseUrl(value) { return String(value || '').trim().replace(/\/+$/, '').replace(/\/rest\/v1$/i, ''); }

const SUPABASE_URL = normalizeSupabaseUrl(process.env.SUPABASE_URL);
const SESSION_SECRET = process.env.APP_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
const sb = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

function sign(value) { return crypto.createHmac('sha256', SESSION_SECRET).update(value).digest('base64url'); }
function requireUser(req) { const h = req.headers.authorization || ''; const token = h.startsWith('Bearer ') ? h.slice(7) : ''; const [payload, sig] = token.split('.'); if (!payload || !sig || sign(payload) !== sig) throw new Error('Invalid session'); const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); if (!data.pi_id) throw new Error('Invalid session'); return { pi_id: String(data.pi_id) }; }

module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });
    const user = requireUser(req);
    const { receiver_pi_id, message } = req.body || {};
    if (!receiver_pi_id || !message) return res.status(400).json({ ok: false, error: 'receiver_pi_id and message are required' });

    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    if (!SUPABASE_URL) return res.status(500).json({ ok: false, error: 'SUPABASE_URL missing' });
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(500).json({ ok: false, error: 'SUPABASE_SERVICE_ROLE_KEY missing' });
    if (!BOT_TOKEN) return res.status(500).json({ ok: false, error: 'TELEGRAM_BOT_TOKEN missing' });

    const { count } = await sb.from('messages').select('*', { count: 'exact', head: true }).eq('sender_pi_id', user.pi_id).eq('receiver_pi_id', receiver_pi_id);
    if (!count) return res.status(403).json({ ok: false, error: 'No message relationship found' });

    const { data: receiver, error } = await sb.from('users').select('telegram_chat_id').eq('pi_id', receiver_pi_id).maybeSingle();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    if (!receiver?.telegram_chat_id) return res.status(200).json({ ok: false, reason: 'telegram_not_linked' });

    const tgRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: String(receiver.telegram_chat_id), text: String(message).slice(0, 3500), parse_mode: 'HTML', disable_web_page_preview: false }) });
    const tgData = await tgRes.json().catch(() => null);
    if (!tgRes.ok || !tgData?.ok) return res.status(500).json({ ok: false, error: 'telegram_send_failed', telegram: tgData });
    return res.status(200).json({ ok: true, telegram: tgData });
  } catch (err) {
    return res.status(/session/i.test(err?.message || '') ? 403 : 500).json({ ok: false, error: err?.message || 'Internal server error' });
  }
};
