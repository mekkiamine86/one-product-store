const testimonials = [
  {
    name: 'أمين بوزيان',
    location: 'الجزائر العاصمة',
    rating: 5,
    text: 'منتج رائع جداً! الجودة فاقت توقعاتي والتوصيل كان سريعاً. أنصح به بشدة.',
    avatar: 'أ',
  },
  {
    name: 'سارة بلقاسم',
    location: 'وهران',
    rating: 5,
    text: 'تجربة شراء ممتازة من البداية للنهاية. التغليف كان أنيقاً والمنتج بحالة ممتازة.',
    avatar: 'س',
  },
  {
    name: 'كريم عثماني',
    location: 'قسنطينة',
    rating: 5,
    text: 'أفضل قرار شرائي اتخذته هذا الشهر. المنتج يستحق كل دينار دفعته.',
    avatar: 'ك',
  },
  {
    name: 'ليلى مراد',
    location: 'سطيف',
    rating: 5,
    text: 'الخدمة احترافية والمنتج عالي الجودة. سأعود للشراء مرة أخرى بالتأكيد.',
    avatar: 'ل',
  },
  {
    name: 'يوسف بن صالح',
    location: 'عنابة',
    rating: 5,
    text: 'كنت متردداً في البداية، لكن المنتج تجاوز كل توقعاتي. شكراً لكم!',
    avatar: 'ي',
  },
  {
    name: 'نور هيفاء',
    location: 'تلمسان',
    rating: 5,
    text: 'تصميم أنيق وجودة ممتازة. وصلني المنتج خلال يومين فقط. تجربة مميزة.',
    avatar: 'ن',
  },
];

function Stars({ count }: { count: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <svg
          key={i}
          className={`h-4 w-4 ${i < count ? 'text-black' : 'text-black/15'}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M10 15.27L16.18 19l-1.64-7.03L20 7.24l-7.19-.61L10 0 7.19 6.63 0 7.24l5.46 4.73L3.82 19z" />
        </svg>
      ))}
    </div>
  );
}

export default function Testimonials() {
  return (
    <section className="relative bg-white py-20 md:py-32">
      <div className="mx-auto max-w-7xl px-5 md:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs font-medium text-black/70">
            <span className="h-1.5 w-1.5 rounded-full bg-black" />
            آراء عملائنا
          </div>
          <h2 className="text-balance text-3xl font-bold leading-tight tracking-tight text-black md:text-5xl">
            ماذا يقول عملاؤنا
          </h2>
          <p className="mt-4 text-balance text-base text-black/60 md:text-lg">
            مئات العملاء الراضين عن تجربتهم معنا
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {testimonials.map((t, idx) => (
            <div
              key={idx}
              className="rounded-3xl border border-black/10 bg-white p-7 transition-all hover:border-black/30 hover:shadow-[0_8px_32px_-8px_rgba(0,0,0,0.12)]"
            >
              <Stars count={t.rating} />
              <p className="mt-5 text-base leading-relaxed text-black/80">
                «{t.text}»
              </p>
              <div className="mt-6 flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-black text-base font-semibold text-white">
                  {t.avatar}
                </div>
                <div>
                  <div className="text-sm font-semibold text-black">{t.name}</div>
                  <div className="text-xs text-black/60">{t.location}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
