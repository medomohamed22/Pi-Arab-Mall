<?php
// معالجة التحقق من الدفع

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // الحصول على البيانات من Pi Network
    $data = json_decode(file_get_contents('php://input'), true);

    // التحقق من صحة الطلب
    if ($data['verified'] === true) {
        // إذا تم التحقق من الدفع
        echo json_encode(['status' => 'success', 'message' => 'Payment Verified']);
    } else {
        // إذا فشل التحقق
        echo json_encode(['status' => 'error', 'message' => 'Payment Not Verified']);
    }
} else {
    echo "Access Denied!";
}
?>