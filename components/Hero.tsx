'use client';

import type { Product } from '@/lib/supabase';

type Props = {
  product: Product;
  onBuyClick: () => void;
};

export default function Hero({ product, onBuyClick }: Props) {
  return (
    <section className="relative overflow-hidden bg-white">
      <div className="mx-auto max-w-7xl px-5 pt-8 pb-12 md:px-8 md:pt-16 md:pb-24">
        <div className="grid grid-cols-1 items-center gap-10 md:grid-cols-2 md:gap-16">
          {/* Image */}
          <div className="order-1 md:order-2 animate-scale-in">
            <div className="relative aspect-square w-full overflow-hidden rounded-3xl bg-neutral-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={product.image_url}
                alt={product.name}
                className="h-full w-full object-cover"
                loading="eager"
              />
              <div className="absolute top-4 right-4 rounded-full bg-black px-3 py-1.5 text-xs font-medium text-white">
                توصيل مجاني
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="order-2 md:order-1 animate-slide-up">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs font-medium text-black/70">
              <span className="h-2 w-2 rounded-full bg-black animate-pulse" />
              متوفر الآن
            </div>

            <h1 className="text-balance text-4xl font-bold leading-[1.1] tracking-tight text-black md:text-6xl lg:text-7xl">
              {product.name}
            </h1>

            <p className="mt-5 text-balance text-base leading-relaxed text-black/60 md:text-lg">
              {product.description}
            </p>

            <div className="mt-8 flex items-baseline gap-3">
              <span className="text-4xl font-bold text-black md:text-5xl">
                {product.price.toLocaleString('ar-DZ')}
              </span>
              <span className="text-xl font-medium text-black/60">
                {product.currency}
              </span>
            </div>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <button
                onClick={onBuyClick}
                className="group relative inline-flex items-center justify-center gap-2 rounded-full bg-black px-8 py-4 text-base font-medium text-white transition-all hover:scale-[1.02] hover:bg-neutral-900 active:scale-[0.98]"
              >
                <span>اشترِ الآن</span>
                <svg
                  className="h-4 w-4 transition-transform group-hover:-translate-x-1"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 19l-7-7m0 0l7-7m-7 7h18"
                  />
                </svg>
              </button>

              <a
                href="#features"
                className="inline-flex items-center justify-center gap-2 rounded-full border border-black/15 bg-white px-8 py-4 text-base font-medium text-black transition-all hover:bg-black hover:text-white"
              >
                المميزات
              </a>
            </div>

            <div className="mt-8 flex items-center gap-6 text-sm text-black/60">
              <div className="flex items-center gap-2">
                <svg className="h-4 w-4 text-black" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10 15.27L16.18 19l-1.64-7.03L20 7.24l-7.19-.61L10 0 7.19 6.63 0 7.24l5.46 4.73L3.82 19z" />
                </svg>
                <span>4.9 (320+ تقييم)</span>
              </div>
              <div className="flex items-center gap-2">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>دفع عند الاستلام</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
