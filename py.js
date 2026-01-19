const axios = require("axios");
const StellarSdk = require("stellar-sdk");

module.exports = async (req, res) => {
  const { paymentId } = req.body;

  const PI_API_KEY = process.env.PI_API_KEY;
  const MY_WALLET_SEED = process.env.MY_WALLET_SEED;

  try {
    const server = new StellarSdk.Server("https://api.testnet.minepi.com");
    const sourceKeypair = StellarSdk.Keypair.fromSecret(MY_WALLET_SEED);
    const account = await server.loadAccount(sourceKeypair.publicKey());

    const paymentRes = await axios.get(
      `https://api.minepi.com/v2/payments/${paymentId}`,
      { headers: { Authorization: `Key ${PI_API_KEY}` } }
    );

    const payment = paymentRes.data;

    const tx = new StellarSdk.TransactionBuilder(account, {
      fee: "250000",
      networkPassphrase: "Pi Testnet"
    })
      .addOperation(
        StellarSdk.Operation.payment({
          destination: payment.to_address,
          asset: StellarSdk.Asset.native(),
          amount: payment.amount.toString()
        })
      )
      .addMemo(StellarSdk.Memo.text("APP-PAY"))
      .setTimeout(180)
      .build();

    tx.sign(sourceKeypair);
    const result = await server.submitTransaction(tx);

    await axios.post(
      `https://api.minepi.com/v2/payments/${paymentId}/complete`,
      { txid: result.hash },
      { headers: { Authorization: `Key ${PI_API_KEY}` } }
    );

    res.json({ success: true });
  } catch (e) {
    console.error(e.response?.data || e.message);
    res.status(500).json({ success: false });
  }
};
