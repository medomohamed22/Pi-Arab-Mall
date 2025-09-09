export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { paymentId } = req.body;

  const r = await fetch(`https://api.minepi.com/v2/payments/${paymentId}/approve`, {
    method: "POST",
    headers: { "Authorization": `Key ${process.env.PI_API_KEY}` }
  });

  const data = await r.json();
  res.status(200).json(data);
}