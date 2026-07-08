# إعداد لوحة الإدارة والمراجعة

لو الإعلان لا يظهر في لوحة الأدمن، اتبع الخطوات بالترتيب:

1. شغل ملف قاعدة البيانات في Supabase SQL Editor:
   `database/supabase-security-features.sql`

2. أنشئ مستخدم أدمن من Supabase Dashboard:
   Authentication > Users > Add user

   استخدم بريد وكلمة مرور للأدمن.

3. أضف البريد إلى جدول `admins`:

```sql
insert into public.admins (email, username)
values ('admin@example.com', 'Admin')
on conflict (email) do nothing;
```

يمكنك أيضًا ربطه بـ `auth_user_id` لاحقًا، لكن البريد يكفي للوحة الحالية.

4. على Vercel أضف Environment Variables:

```text
SUPABASE_URL=https://xncapmzlwuisupkjlftb.supabase.co
SUPABASE_SERVICE_ROLE_KEY=ضع service role key من Supabase هنا
SUPABASE_ANON_KEY=ضع anon/publishable key هنا
```

مهم جدًا:
- لا تضع `SUPABASE_SERVICE_ROLE_KEY` داخل أي ملف frontend.
- يوضع فقط داخل Vercel Environment Variables.
- دخول الأدمن الآن يتم من `admin.html` بالبريد وكلمة المرور عبر Supabase Auth.

5. بعد الإعداد:
   - أي إعلان جديد يدخل `pending`.
   - لا يظهر للجمهور.
   - يظهر في `admin.html` للمراجعة.
   - بعد الموافقة يصبح `active` ويظهر في الصفحة الرئيسية.

لو لم تشغل SQL، لن تعمل المراجعة لأن عمود `status` وجدول `admins` غير موجودين.
