'use client';

import { useEffect, useState } from 'react';
import Header from '@/components/Header';
import Hero from '@/components/Hero';
import Features from '@/components/Features';
import Testimonials from '@/components/Testimonials';
import OrderCTA from '@/components/OrderCTA';
import OrderForm from '@/components/OrderForm';
import Footer from '@/components/Footer';
import type { Product } from '@/lib/supabase';

const FALLBACK_PRODUCT: Product = {
  id: 'fallback',
  name: 'منتج مميز',
  description: 'منتج عالي الجودة مصمم بعناية فائقة. تجربة استثنائية تستحق التجربة.',
  price: 4999,
  currency: 'دج',
  image_url: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=1200&q=80',
};

export default function HomePage() {
  const [product, setProduct] = useState<Product>(FALLBACK_PRODUCT);
  const [orderOpen, setOrderOpen] = useState(false);

  useEffect(() => {
    fetch('/api/product')
      .then((r) => r.json())
      .then((data) => {
        if (data?.product) setProduct(data.product);
      })
      .catch(() => {});
  }, []);

  return (
    <main className="min-h-screen bg-white">
      <Header />
      <Hero product={product} onBuyClick={() => setOrderOpen(true)} />
      <Features />
      <section id="testimonials">
        <Testimonials />
      </section>
      <OrderCTA product={product} onBuyClick={() => setOrderOpen(true)} />
      <Footer />

      <OrderForm
        product={product}
        open={orderOpen}
        onClose={() => setOrderOpen(false)}
      />

      {/* Mobile sticky CTA */}
      <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-black/10 bg-white/90 px-4 py-3 backdrop-blur-xl md:hidden">
        <button
          onClick={() => setOrderOpen(true)}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-black py-3.5 text-base font-medium text-white transition-colors hover:bg-neutral-900"
        >
          <span>اشترِ الآن</span>
          <span className="text-white/60">·</span>
          <span>{product.price.toLocaleString('ar-DZ')} {product.currency}</span>
        </button>
      </div>

      {/* Spacer for sticky mobile CTA */}
      <div className="h-20 md:hidden" />
    </main>
  );
}
