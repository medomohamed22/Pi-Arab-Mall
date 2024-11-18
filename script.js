// Get button and status elements
const button = document.getElementById("pi-payment-button");
const status = document.getElementById("payment-status");

// Initialize Pi SDK
const Pi = window.Pi;

if (!Pi) {
  status.textContent = "Pi SDK is not loaded. Please try again later.";
} else {
  Pi.init({
    version: "2.0", // Current version of Pi SDK
    sandbox: true, // Set to false for production
  });

  button.addEventListener("click", async () => {
    try {
      const payment = await Pi.createPayment({
        amount: 1, // Amount in Pi
        memo: "Test Payment", // Description of the payment
        metadata: { orderId: "12345" }, // Optional metadata
      });

      status.textContent = "Payment is being processed...";

      payment.onReadyForServerApproval(() => {
        status.textContent = "Waiting for server approval...";
        console.log("Payment ready for server approval");
      });

      payment.onReadyForServerCompletion(() => {
        status.textContent = "Waiting for server completion...";
        console.log("Payment ready for server completion");
      });

      payment.onCancel(() => {
        status.textContent = "Payment was cancelled.";
        console.log("Payment cancelled");
      });

      payment.onError((error) => {
        status.textContent = `Payment failed: ${error.message}`;
        console.error("Payment error:", error);
      });

      payment.onSuccess((txid) => {
        status.textContent = `Payment successful! Transaction ID: ${txid}`;
        console.log("Payment successful! Transaction ID:", txid);
      });
    } catch (error) {
      console.error("Payment error:", error);
      status.textContent = `Error: ${error.message}`;
    }
  });
}