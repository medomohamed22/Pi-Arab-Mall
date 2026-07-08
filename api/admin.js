const SUPABASE_URL = process.env.SUPABASE_URL || 'https://xncapmzlwuisupkjlftb.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_zPECXAiI_bDbeLtRYe3vIw_IEt_p_AS';

function json(res, status, body) { res.status(status).json(body); }
function bearer(req) { const h = req.headers.authorization || ''; return h.startsWith('Bearer ') ? h.slice(7) : ''; }

async function supabaseRest(path, options = {}) {
  if (!SERVICE_ROLE_KEY) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY env var');
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SERVICE_ROLE_KEY,
      authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'content-type': 'application/json',
      prefer: 'return=representation',
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(data?.message || data?.error || `Supabase REST error ${response.status}`);
  return data;
}

async function getAuthUser(token) {
  if (!token) throw new Error('Missing admin auth token');
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: ANON_KEY, authorization: `Bearer ${token}` },
  });
  const user = await response.json().catch(() => null);
  if (!response.ok || !user?.email) throw new Error('Invalid admin session');
  return user;
}

async function assertAdmin(req) {
  const user = await getAuthUser(bearer(req));
  const email = String(user.email || '').toLowerCase();
  const rows = await supabaseRest(`admins?select=*&or=(email.eq.${encodeURIComponent(email)},auth_user_id.eq.${encodeURIComponent(user.id)})`);
  if (!rows?.length) throw new Error('Not allowed');
  return { authUser: user, admin: rows[0] };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  try {
    const { authUser } = await assertAdmin(req);
    const body = req.body || {};
    const { action } = body;

    if (action === 'list') {
      const [products, users, reports] = await Promise.all([
        supabaseRest('products?select=*&order=created_at.desc'),
        supabaseRest('users?select=*&order=created_at.desc').catch(() => []),
        supabaseRest('reports?select=*&order=created_at.desc').catch(() => []),
      ]);
      return json(res, 200, { products, users, reports });
    }

    if (action === 'productStatus') {
      const { productId, status } = body;
      if (!productId || !['pending', 'active', 'rejected'].includes(status)) throw new Error('Invalid product status request');
      const row = await supabaseRest(`products?id=eq.${encodeURIComponent(productId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ status, reviewed_by: authUser.email, reviewed_at: new Date().toISOString() }),
      });
      return json(res, 200, { product: row?.[0] || null });
    }

    if (action === 'deleteProduct') {
      const { productId } = body;
      if (!productId) throw new Error('Missing productId');
      await supabaseRest(`products?id=eq.${encodeURIComponent(productId)}`, { method: 'DELETE' });
      return json(res, 200, { success: true });
    }

    if (action === 'setUserBan') {
      const { piId, isBanned } = body;
      if (!piId) throw new Error('Missing piId');
      const row = await supabaseRest(`users?pi_id=eq.${encodeURIComponent(piId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_banned: !!isBanned }),
      });
      return json(res, 200, { user: row?.[0] || null });
    }

    if (action === 'reportStatus') {
      const { reportId, status } = body;
      if (!reportId || !status) throw new Error('Invalid report status request');
      const row = await supabaseRest(`reports?id=eq.${encodeURIComponent(reportId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      return json(res, 200, { report: row?.[0] || null });
    }

    throw new Error('Unknown admin action');
  } catch (error) {
    return json(res, 403, { error: error.message || 'Admin API error' });
  }
}
