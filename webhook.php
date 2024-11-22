<?php
// استقبال البيانات من Pi Network
$data = json_decode(file_get_contents('php://input'), true);

// تحقق من التوقيع أو المصادقة
$secret_key = 'YOUR_SECRET_KEY_HERE'; // المفتاح السري الخاص بك

if (hash_hmac('sha256', $data['payment_id'], $secret_key) === $data['signature']) {
    // العملية ناجحة
    http_response_code(200); // أرسل استجابة ناجحة

    // تسجيل البيانات أو تحديث حالة الطلب
    file_put_contents('payment_log.txt', json_encode($data) . PHP_EOL, FILE_APPEND);
} else {
    // المصادقة فشلت
    http_response_code(403); // رفض الطلب
}