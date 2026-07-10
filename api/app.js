const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PI_API_KEY = process.env.PI_API_KEY;
const SESSION_SECRET = process.env.APP_SESSION_SECRET || SERVICE_ROLE_KEY;
const PI_API_BASE = 'https://api.minepi.com/v2';
const MAX_IMAGES = 3;
const MAX_IMAGE_BYTES = 900 * 1024;

if (!SUPABASE_URL) throw new Error('Missing SUPABASE_URL');
if (!SERVICE_ROLE_KEY) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');
if (!SESSION_SECRET) throw new Error('Missing APP_SESSION_SECRET');

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');
}

function json(res, status, body) { return res.status(status).json(body); }
function readBody(req) { return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}); }
function b64url(value) { return Buffer.from(value).toString('base64url'); }
function sign(value) { return crypto.createHmac('sha256', SESSION_SECRET).update(value).digest('base64url'); }
function safeText(value, max = 1000) { return String(value || '').trim().slice(0, max); }
function requireNumber(value, name) { const n = Number(value); if (!Number.isFinite(n)) throw new Error(`Invalid ${name}`); return n; }
function authHeader(req) { const h = req.headers.authorization || ''; return h.startsWith('Bearer ') ? h.slice(7) : ''; }

function createSession(user) {
  const payload = b64url(JSON.stringify({ pi_id: user.pi_id, username: user.username || '', iat: Date.now() }));
  return `${payload}.${sign(payload)}`;
}

function verifySessionToken(token) {
  if (!token || !token.includes('.')) throw new Error('Missing session');
  const [payload, sig] = token.split('.');
  const expected = sign(payload);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) throw new Error('Invalid session');
  const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  if (!data.pi_id || Date.now() - Number(data.iat || 0) > 1000 * 60 * 60 * 24 * 30) throw new Error('Expired session');
  return { pi_id: String(data.pi_id), username: String(data.username || '') };
}

function requireUser(req) { return verifySessionToken(authHeader(req)); }

async function verifyPiLogin(piId, accessToken) {
  if (!accessToken) {
    if (process.env.ALLOW_UNVERIFIED_PI_LOGIN === 'true') return;
    throw new Error('Missing Pi access token');
  }
  const response = await fetch(`${PI_API_BASE}/me`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw new Error('Pi login verification failed');
  const data = await response.json();
  const verifiedId = data?.uid || data?.user?.uid || data?.username;
  if (verifiedId && String(verifiedId) !== String(piId)) throw new Error('Pi user mismatch');
}

async function assertProductParticipant(productId, user, otherId) {
  const { data: product, error } = await sb.from('products').select('id,name,seller_pi_id,seller_username,status').eq('id', productId).single();
  if (error) throw error;
  if (!product) throw new Error('Product not found');
  const isSeller = product.seller_pi_id === user.pi_id;
  const isBuyerMessageSeller = product.seller_pi_id === otherId;
  if (!isSeller && !isBuyerMessageSeller) throw new Error('Invalid chat target');
  return product;
}

async function uploadImages(user, images) {
  const urls = [];
  for (const image of (images || []).slice(0, MAX_IMAGES)) {
    const dataUrl = String(image.dataUrl || '');
    const match = dataUrl.match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,(.+)$/i);
    if (!match) throw new Error('Invalid image');
    const contentType = match[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : match[1].toLowerCase();
    const buffer = Buffer.from(match[2], 'base64');
    if (buffer.length > MAX_IMAGE_BYTES) throw new Error('Image is too large');
    const ext = contentType.split('/')[1].replace('jpeg', 'jpg');
    const path = `${user.pi_id}/${Date.now()}_${crypto.randomBytes(5).toString('hex')}.${ext}`;
    const { error } = await sb.storage.from('images').upload(path, buffer, { contentType, upsert: false });
    if (error) throw error;
    urls.push(sb.storage.from('images').getPublicUrl(path).data.publicUrl);
  }
  return urls;
}

async function handle(action, body, req) {
  if (action === 'login') {
    const piId = safeText(body.piId || body.uid, 100);
    const username = safeText(body.username || 'User', 120);
    if (!piId) throw new Error('Missing Pi user id');
    await verifyPiLogin(piId, body.accessToken);
    const { data: existing, error: readError } = await sb.from('users').select('is_banned').eq('pi_id', piId).maybeSingle();
    if (readError) throw readError;
    if (existing?.is_banned) return { banned: true };
    const { error } = await sb.from('users').upsert({ pi_id: piId, username }, { onConflict: 'pi_id' });
    if (error) throw error;
    return { user: { uid: piId, username }, token: createSession({ pi_id: piId, username }) };
  }

  if (action === 'products.list') {
    const { data, error } = await sb.from('products').select('*').eq('status', 'active').order('promoted_until', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false });
    if (error) throw error;
    return { products: data || [] };
  }

  if (action === 'products.detail') {
    const id = requireNumber(body.productId, 'productId');
    const { data: product, error } = await sb.from('products').select('*').eq('id', id).single();
    if (error) throw error;
    await sb.from('products').update({ views: Number(product.views || 0) + 1 }).eq('id', id);
    const { data: seller } = await sb.from('users').select('created_at').eq('pi_id', product.seller_pi_id).maybeSingle();
    const { count } = await sb.from('products').select('*', { count: 'exact', head: true }).eq('seller_pi_id', product.seller_pi_id);
    return { product: { ...product, views: Number(product.views || 0) + 1 }, sellerJoinedAt: seller?.created_at || null, sellerAdCount: count || 0 };
  }

  const user = requireUser(req);

  if (action === 'me') return { user: { uid: user.pi_id, username: user.username } };

  if (action === 'telegram.status') {
    const { data, error } = await sb.from('users').select('telegram_chat_id,telegram_username').eq('pi_id', user.pi_id).maybeSingle();
    if (error) throw error;
    return { linked: !!data?.telegram_chat_id, telegram_username: data?.telegram_username || null };
  }

  if (action === 'telegram.token') {
    const token = `tg_${crypto.randomBytes(24).toString('base64url')}`.slice(0, 60);
    const { error } = await sb.from('users').update({ telegram_link_token: token }).eq('pi_id', user.pi_id);
    if (error) throw error;
    return { token };
  }

  if (action === 'products.create') {
    const price = requireNumber(body.price, 'price');
    if (price <= 0) throw new Error('Invalid price');
    const images = await uploadImages(user, body.images);
    const row = {
      name: safeText(body.name, 160),
      price,
      price_usd: price,
      price_pi_snapshot: body.piUsdPrice ? Number(body.pricePiSnapshot || 0) : null,
      pi_usd_snapshot: body.piUsdPrice ? Number(body.piUsdPrice) : null,
      description: safeText(body.description, 3000),
      images,
      image_url: images[0] || null,
      seller_pi_id: user.pi_id,
      seller_username: user.username,
      category: safeText(body.category, 80),
      location: safeText(body.location, 120),
      country: safeText(body.country, 120),
      status: 'pending'
    };
    if (!row.name || !row.category || !row.location || !row.country) throw new Error('Missing product fields');
    const { data, error } = await sb.from('products').insert(row).select('*').single();
    if (error) throw error;
    return { product: data };
  }

  if (action === 'products.delete') {
    const id = requireNumber(body.productId, 'productId');
    const { data: product, error: readError } = await sb.from('products').select('seller_pi_id').eq('id', id).single();
    if (readError) throw readError;
    if (product.seller_pi_id !== user.pi_id) throw new Error('Not allowed');
    const { error } = await sb.from('products').delete().eq('id', id);
    if (error) throw error;
    return { success: true };
  }

  if (action === 'profile.summary') {
    const { data: products, error } = await sb.from('products').select('*').eq('seller_pi_id', user.pi_id).order('created_at', { ascending: false });
    if (error) throw error;
    const { data: messages } = await sb.from('messages').select('product_id,sender_pi_id,receiver_pi_id').or(`sender_pi_id.eq.${user.pi_id},receiver_pi_id.eq.${user.pi_id}`);
    const uniqueChats = new Set((messages || []).map(m => `${m.product_id}_${m.sender_pi_id === user.pi_id ? m.receiver_pi_id : m.sender_pi_id}`));
    return { products: products || [], stats: { ads: (products || []).length, views: (products || []).reduce((s, p) => s + Number(p.views || 0), 0), chats: uniqueChats.size } };
  }

  if (action === 'messages.unread') {
    const { count, error } = await sb.from('messages').select('*', { count: 'exact', head: true }).eq('receiver_pi_id', user.pi_id).eq('is_read', false);
    if (error) throw error;
    return { count: count || 0 };
  }

  if (action === 'messages.list') {
    const productId = requireNumber(body.productId, 'productId');
    const otherId = safeText(body.otherId, 100);
    await assertProductParticipant(productId, user, otherId);
    await sb.from('messages').update({ is_read: true }).eq('product_id', productId).eq('receiver_pi_id', user.pi_id).eq('sender_pi_id', otherId);
    const { data, error } = await sb.from('messages').select('*').eq('product_id', productId).or(`and(sender_pi_id.eq.${user.pi_id},receiver_pi_id.eq.${otherId}),and(sender_pi_id.eq.${otherId},receiver_pi_id.eq.${user.pi_id})`).order('created_at', { ascending: true });
    if (error) throw error;
    return { messages: data || [] };
  }

  if (action === 'messages.send') {
    const productId = requireNumber(body.productId, 'productId');
    const otherId = safeText(body.otherId, 100);
    const content = safeText(body.content, 2000);
    if (!content) throw new Error('Missing message');
    const product = await assertProductParticipant(productId, user, otherId);
    const { data, error } = await sb.from('messages').insert({ product_id: productId, sender_pi_id: user.pi_id, receiver_pi_id: otherId, content }).select('*').single();
    if (error) throw error;
    return { message: data, product };
  }

  if (action === 'messages.inbox') {
    const { data, error } = await sb.from('messages').select('*, products(name)').or(`sender_pi_id.eq.${user.pi_id},receiver_pi_id.eq.${user.pi_id}`).order('created_at', { ascending: false });
    if (error) throw error;
    const otherIds = [...new Set((data || []).map(m => m.sender_pi_id === user.pi_id ? m.receiver_pi_id : m.sender_pi_id))];
    const { data: users } = otherIds.length ? await sb.from('users').select('pi_id,username').in('pi_id', otherIds) : { data: [] };
    const names = new Map((users || []).map(u => [u.pi_id, u.username]));
    return { messages: data || [], users: Object.fromEntries(names) };
  }

  throw new Error('Unknown action');
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  try {
    const body = readBody(req);
    const result = await handle(body.action, body, req);
    return json(res, 200, { ok: true, ...result });
  } catch (error) {
    const status = /Missing session|Invalid session|Expired session|Not allowed|banned/i.test(error.message || '') ? 403 : 400;
    return json(res, status, { ok: false, error: error.message || 'API error' });
  }
};
