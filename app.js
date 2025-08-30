// تهيئة SDK
Pi.init({ version: "2.0", sandbox: false });

const loginBtn = document.getElementById("loginBtn");
const donateBtn = document.getElementById("donateBtn");
const donateBox = document.getElementById("donateBox");
const status = document.getElementById("status");

let currentUser = null;

loginBtn.addEventListener("click", async () => {
  try {
    const scopes = ["username", "payments"];
    const user = await Pi.authenticate(scopes, onIncompletePaymentFound);
    currentUser = user;
    status.innerHTML = `✅ تم تسجيل الدخول: ${user.username}`;
    donateBox.style.display = "block";
  } catch (err) {
    console.error(err);
    status.innerHTML = "❌ فشل تسجيل الدخول";
  }
});

donateBtn.addEventListener("click", async () => {
  const amount = parseFloat(document.getElementById("amount").value);
  if (!amount || amount <= 0) {
    status.innerHTML = "⚠️ من فضلك أدخل مبلغ صحيح";
    return;
  }

  try {
    status.innerHTML = "⏳ جاري إنشاء الدفع...";
    const paymentData = {
      amount: amount,
      memo: "تبرع لموقع Donate Way",
      metadata: { project: "donate-way" }
    };

    const payment = await Pi.createPayment(paymentData, {
      onReadyForServerApproval: (paymentId) => {
        fetch("/approve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paymentId })
        });
      },
      onReadyForServerCompletion: (paymentId, txid) => {
        fetch("/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paymentId, txid })
        });
        status.innerHTML = "🎉 شكراً لتبرعك!";
      },
      onCancel: (paymentId) => {
        status.innerHTML = "❌ تم إلغاء العملية";
      },
      onError: (err, paymentId) => {
        status.innerHTML = "⚠️ خطأ: " + err;
      }
    });

  } catch (err) {
    console.error(err);
    status.innerHTML = "⚠️ حدث خطأ أثناء الدفع";
  }
});

// معالجة الدفع الغير مكتمل
function onIncompletePaymentFound(payment) {
  console.log("وجدنا دفع غير مكتمل:", payment);
}
