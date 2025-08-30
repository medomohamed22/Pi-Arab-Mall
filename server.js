const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname)));

const PORT = process.env.PORT || 5000;

// API للموافقة على الدفع
app.post("/approve", (req, res) => {
  const { paymentId } = req.body;
  console.log("✅ تمت الموافقة على الدفع:", paymentId);
  res.json({ status: "approved" });
});

// API لإكمال الدفع
app.post("/complete", (req, res) => {
  const { paymentId, txid } = req.body;
  console.log("🎉 تم الدفع بنجاح:", paymentId, txid);
  res.json({ status: "completed" });
});

// تشغيل السيرفر
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
