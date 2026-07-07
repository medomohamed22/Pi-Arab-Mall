const SUPABASE_URL = process.env.SUPABASE_URL || 'https://xncapmzlwuisupkjlftb.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_PI_IDS = (process.env.ADMIN_PI_IDS || '').split(',').map(x => x.trim()).filter(Boolean);

function json(res, status, body) {
  res.status(status).json(body);
}

function assertAdmin(adminPiId) {
  if (!SERVICE_ROLE_KEY) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY env var');
  if (!adminPiId) throw new Error('Missing adminPiId');
  if (!ADMIN_PI_IDS.includes(adminPiId)) throw new Error('Not allowed');
}

async function supabaseRest(path, options = {}) {
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
  if (!response.ok) {
    throw new Error(data?.message || data?.error || `Supabase REST error ${response.status}`);
  }
  return data;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  try {
    const body = req.body || {};
    const { action, adminPiId } = body;
    assertAdmin(adminPiId);

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
        body: JSON.stringify({ status, reviewed_by: adminPiId, reviewed_at: new Date().toISOString() }),
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
    return json(res, 400, { error: error.message || 'Admin API error' });
  }
}
