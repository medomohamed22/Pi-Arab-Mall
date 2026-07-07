# إعداد لوحة الإدارة والمراجعة

إذا الإعلان لا يظهر في لوحة الأدمن، راجع هذه النقاط بالترتيب:

1. شغل ملف قاعدة البيانات:
   `database/supabase-security-features.sql`

   هذا الملف يضيف أهم الأعمدة، خصوصًا:
   - `products.status`
   - `products.reviewed_by`
   - `products.reviewed_at`
   - جدول `admins`

2. أضف حساب الأدمن في Supabase بعد تشغيل SQL:

```sql
insert into public.admins (pi_id, username)
values ('YOUR_PI_UID', 'Admin')
on conflict (pi_id) do nothing;
```

3. عدل ملف الواجهة:
   `js/admin-config.js`

```js
window.ADMIN_PI_IDS = ['YOUR_PI_UID'];
```

4. على Vercel أضف Environment Variables:

```text
SUPABASE_URL=https://xncapmzlwuisupkjlftb.supabase.co
SUPABASE_SERVICE_ROLE_KEY=ضع service role key من Supabase هنا
ADMIN_PI_IDS=YOUR_PI_UID
```

مهم: لا تضع `SUPABASE_SERVICE_ROLE_KEY` داخل ملفات JavaScript الأمامية. يوضع فقط في Vercel Environment Variables.

5. بعد هذه الخطوات:
   - الإعلان الجديد يدخل بحالة `pending`.
   - لا يظهر للجمهور.
   - يظهر في `admin.html` داخل تبويب مراجعة الإعلانات.
   - عند الموافقة يتحول إلى `active` ويظهر في الصفحة الرئيسية.

لو لم تشغل SQL، لن تعمل المراجعة لأن قاعدة البيانات لن تعرف عمود `status`.
