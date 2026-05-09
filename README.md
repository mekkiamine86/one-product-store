# One Product Store

متجر إلكتروني احترافي بنظام **One Product Store** مبني بـ Next.js 14 و Tailwind CSS و Supabase.

تصميم Minimalist بالأبيض والأسود، Mobile-First، يدعم اللغة العربية (RTL).

---

## ✨ المميزات

- 🎨 تصميم عصري Minimalist (أسود وأبيض)
- 📱 Mobile-First — مثالي لزوار TikTok و Reels
- 🛒 صفحة منتج واحد مع نموذج طلب بسيط (دفع عند الاستلام)
- 🔐 لوحة تحكم محمية بكلمة مرور
- 📦 إدارة الطلبات مع تغيير الحالة (بانتظار التأكيد، مؤكد، تم الشحن، إلخ)
- ✏️ تعديل المنتج (الاسم، الوصف، السعر، الصورة) من اللوحة
- ⚡ Supabase كقاعدة بيانات (مجانية)
- 🚀 جاهز للنشر على Vercel

---

## 🛠️ المتطلبات

- Node.js 18+
- حساب مجاني على [Supabase](https://supabase.com)
- حساب مجاني على [Vercel](https://vercel.com) للنشر (اختياري)

---

## 🚀 الإعداد المحلي

### 1. تثبيت الحزم

```bash
npm install
```

### 2. إنشاء مشروع Supabase

1. اذهب إلى [supabase.com](https://supabase.com) وسجل حساباً.
2. اضغط **New project** واختر اسماً وكلمة مرور.
3. انتظر دقيقة حتى يجهز المشروع.

### 3. إعداد قاعدة البيانات

في Supabase Dashboard:

1. افتح **SQL Editor** → **New Query**.
2. الصق محتوى الملف [`supabase/schema.sql`](./supabase/schema.sql).
3. اضغط **Run**.

سيتم إنشاء جدولين: `products` و `orders` مع منتج افتراضي.

### 4. الحصول على المفاتيح

في Supabase Dashboard → **Settings** → **API**:

- `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
- `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `service_role secret` key → `SUPABASE_SERVICE_ROLE_KEY` ⚠️ **سري! لا تشاركه**

### 5. إنشاء ملف `.env.local`

انسخ `.env.local.example` إلى `.env.local` واملأ القيم:

```bash
cp .env.local.example .env.local
```

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...

ADMIN_PASSWORD=كلمة-مرور-قوية-هنا
ADMIN_SESSION_SECRET=نص-عشوائي-طويل-32-حرف-على-الأقل
```

> 💡 لتوليد `ADMIN_SESSION_SECRET` عشوائي:
> ```bash
> node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
> ```

### 6. تشغيل المشروع

```bash
npm run dev
```

افتح:
- المتجر: [http://localhost:3000](http://localhost:3000)
- لوحة التحكم: [http://localhost:3000/admin](http://localhost:3000/admin)

---

## 📁 هيكل المشروع

```
one-product-store/
├── app/
│   ├── page.tsx                    # الصفحة الرئيسية (المتجر)
│   ├── layout.tsx                  # Root layout (RTL)
│   ├── globals.css                 # Tailwind + custom styles
│   ├── admin/
│   │   ├── page.tsx                # تسجيل دخول الأدمن
│   │   └── dashboard/page.tsx      # لوحة التحكم
│   └── api/
│       ├── product/route.ts        # GET/PUT المنتج
│       ├── orders/route.ts         # POST (عام) / GET / PATCH (أدمن)
│       └── auth/route.ts           # POST تسجيل دخول / DELETE خروج
├── components/
│   ├── Header.tsx                  # شريط علوي
│   ├── Hero.tsx                    # القسم العلوي
│   ├── Features.tsx                # المميزات
│   ├── Testimonials.tsx            # آراء العملاء
│   ├── OrderCTA.tsx                # دعوة للطلب
│   ├── OrderForm.tsx               # نموذج الطلب (Modal)
│   ├── Footer.tsx                  # التذييل
│   └── admin/
│       ├── ProductEditor.tsx       # محرر المنتج
│       └── OrdersTable.tsx         # جدول الطلبات
├── lib/
│   ├── supabase.ts                 # عميل Supabase + الأنواع
│   └── auth.ts                     # نظام المصادقة (HMAC cookies)
├── middleware.ts                   # حماية /admin/dashboard
├── supabase/schema.sql             # SQL لإنشاء الجداول
├── .env.local.example              # مثال متغيرات البيئة
├── tailwind.config.ts              # إعدادات Tailwind
├── tsconfig.json
├── next.config.js
└── package.json
```

---

## 🚀 النشر على Vercel

### 1. ارفع المشروع إلى GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/your-username/one-product-store.git
git push -u origin main
```

### 2. اربطه بـ Vercel

1. اذهب إلى [vercel.com](https://vercel.com) وسجل دخولاً بـ GitHub.
2. **Add New** → **Project** → اختر المستودع.
3. في **Environment Variables** أضف نفس متغيرات `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ADMIN_PASSWORD`
   - `ADMIN_SESSION_SECRET`
4. اضغط **Deploy**.

سيتم نشر متجرك خلال دقيقتين.

### 3. ربط دومين مخصص (اختياري)

في Vercel → **Settings** → **Domains** → أضف الدومين الخاص بك.

---

## 🔧 الاستخدام اليومي

### تعديل المنتج

1. ادخل إلى `your-domain.com/admin`.
2. أدخل كلمة المرور.
3. اضغط على تبويب **المنتج** وعدّل ما تشاء.

> **نصيحة الصور:** استخدم خدمة استضافة صور مثل [Imgur](https://imgur.com)، [Cloudinary](https://cloudinary.com)، أو ارفع الصور إلى **Supabase Storage** والصق الرابط.

### إدارة الطلبات

1. تبويب **الطلبات** يعرض كل الطلبات الواردة من العملاء.
2. غيّر حالة كل طلب من القائمة المنسدلة.
3. اتصل بالعميل مباشرة بالضغط على رقم الهاتف.

---

## 🔒 الأمان

- ✅ كلمة مرور الأدمن مقارنة بـ `timing-safe equal`.
- ✅ جلسات الأدمن موقّعة بـ HMAC-SHA256 (HttpOnly cookie).
- ✅ Service-role key يُستخدم **فقط** على الخادم في API Routes.
- ✅ RLS مفعّل على Supabase: المتجر public-read، الطلبات public-insert فقط.
- ⚠️ **لا تنسَ تغيير `ADMIN_PASSWORD` و `ADMIN_SESSION_SECRET` قبل الإطلاق!**

---

## 🎨 التخصيص

### تغيير الألوان

التصميم بالأبيض والأسود فقط. لو أردت لمسة لون، عدّل [`tailwind.config.ts`](./tailwind.config.ts):

```ts
theme: {
  extend: {
    colors: {
      brand: '#your-color',
    },
  },
},
```

### تغيير المميزات والآراء

- المميزات: عدّل المصفوفة `features` في [`components/Features.tsx`](./components/Features.tsx).
- آراء العملاء: عدّل المصفوفة `testimonials` في [`components/Testimonials.tsx`](./components/Testimonials.tsx).

### تغيير الشعار

عدّل الحرف "م" في [`components/Header.tsx`](./components/Header.tsx) و [`components/Footer.tsx`](./components/Footer.tsx).

---

## 📝 الترخيص

MIT — استخدمه كما شئت.
