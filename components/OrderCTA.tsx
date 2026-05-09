'use client';

import type { Product } from '@/lib/supabase';

type Props = {
  product: Product;
  onBuyClick: () => void;
};

export default function OrderCTA({ product, onBuyClick }: Props) {
  return (
    <section id="order" className="relative bg-white py-20 md:py-28">
      <div className="mx-auto max-w-4xl px-5 md:px-8">
        <div className="overflow-hidden rounded-3xl bg-black p-10 md:p-16">
          <div className="flex flex-col items-center text-center">
            <h2 className="text-balance text-3xl font-bold leading-tight tracking-tight text-white md:text-5xl">
              لا تفوت الفرصة
            </h2>
            <p className="mt-4 max-w-xl text-balance text-base text-white/60 md:text-lg">
              اطلب الآن واحصل على توصيل مجاني خلال 48 ساعة. الكمية محدودة.
            </p>

            <div className="mt-8 flex items-baseline gap-3">
              <span className="text-5xl font-bold text-white md:text-6xl">
                {product.price.toLocaleString('ar-DZ')}
              </span>
              <span className="text-xl font-medium text-white/60">
                {product.currency}
              </span>
            </div>

            <button
              onClick={onBuyClick}
              className="mt-8 inline-flex items-center justify-center gap-2 rounded-full bg-white px-10 py-4 text-base font-medium text-black transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <span>اطلب الآن</span>
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>

            <div className="mt-8 grid grid-cols-3 gap-6 text-white/70">
              <div className="text-center">
                <div className="text-2xl font-bold text-white">+500</div>
                <div className="text-xs">عميل سعيد</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-white">4.9</div>
                <div className="text-xs">متوسط التقييم</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-white">48h</div>
                <div className="text-xs">سرعة التوصيل</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
