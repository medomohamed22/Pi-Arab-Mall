<?php
// قم بتضمين مفتاح API الخاص بك من Pi Network
$pi_api_key = '8ctgilrg6jkk0famz4rxemxemr2onmgmruldmy7x36btzgufdpsenr8j54tluezy';

// عنوان الدفع
$payment_url = "https://sandbox.minepi.com/sdk/payment";
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Pi Network Payment</title>
</head>
<body>
    <h1>ادفع باستخدام Pi Network</h1>
    <form action="<?php echo $payment_url; ?>" method="POST">
        <!-- معلومات الدفع -->
        <input type="hidden" name="amount" value="5"> <!-- المبلغ -->
        <input type="hidden" name="currency" value="PI"> <!-- العملة -->
        <input type="hidden" name="memo" value="Payment for services"> <!-- مذكرة -->
        <input type="hidden" name="api_key" value="<?php echo $pi_api_key; ?>"> <!-- مفتاح API -->
        
        <!-- زر الدفع -->
        <button type="submit">ادفع الآن</button>
    </form>
</body>
</html>