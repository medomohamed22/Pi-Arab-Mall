exports.handler = async (event) => {
    console.log("=== APPROVE FUNCTION CALLED ===");
    
    if (event.httpMethod !== 'POST') return { statusCode: 405 };
    
    const { paymentId } = JSON.parse(event.body || '{}');
    if (!paymentId) return { statusCode: 400, body: JSON.stringify({ status: 'error', message: 'Missing paymentId' }) };
    
    // الـ API Key داخل الكود مؤقتًا للتجربة
    const apiKey = 'nxpzhjhnluvqlhjktt025lrlxdvvawxnueojgqoarofk0bqbeww7sfkdkvz15uzt'; // ← غيّر ده بالـ Key الحقيقي بتاعك
    
    try {
        const response = await fetch(`https://api.minepi.com/v2/payments/${paymentId}/approve`, {
            method: 'POST',
            headers: { 'Authorization': `Key ${apiKey}`, 'Content-Type': 'application/json' }
        });
        
        if (response.ok) {
            console.log("APPROVAL SUCCESS");
            return { statusCode: 200, body: JSON.stringify({ status: 'success' }) };
        } else {
            const err = await response.text();
            console.log("APPROVAL FAILED:", err);
            return { statusCode: 500, body: JSON.stringify({ status: 'error', message: err }) };
        }
    } catch (err) {
        console.log("ERROR:", err.message);
        return { statusCode: 500, body: JSON.stringify({ status: 'error', message: err.message }) };
    }
};