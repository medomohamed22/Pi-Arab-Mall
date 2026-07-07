export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=30');

  try {
    const okxRes = await fetch('https://www.okx.com/api/v5/market/ticker?instId=PI-USDT', {
      headers: { accept: 'application/json' },
    });

    if (!okxRes.ok) {
      throw new Error(`OKX request failed: ${okxRes.status}`);
    }

    const json = await okxRes.json();
    const last = Number(json?.data?.[0]?.last);

    if (!Number.isFinite(last) || last <= 0) {
      throw new Error('Invalid OKX PI-USDT price');
    }

    res.status(200).json({ priceUsd: last, source: 'OKX', pair: 'PI-USDT', ts: new Date().toISOString() });
  } catch (error) {
    res.status(502).json({ error: error.message || 'Could not fetch PI price' });
  }
}
