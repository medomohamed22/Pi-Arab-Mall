export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { amount, memo } = req.body;
  const payment = {
    amount,
    memo,
    metadata: { type: "donation" }
  };

  const r = await fetch("https://api.minepi.com/v2/payments", {
    method: "POST",
    headers: {
      "Authorization": `Key ${process.env.PI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payment)
  });

  const data = await r.json();
  res.status(200).json(data);
}