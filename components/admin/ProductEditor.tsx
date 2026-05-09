'use client';

import { useEffect, useState } from 'react';
import type { Product } from '@/lib/supabase';

export default function ProductEditor() {
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetch('/api/product')
      .then((r) => r.json())
      .then((data) => {
        setProduct(
          data.product ?? {
            id: '',
            name: '',
            description: '',
            price: 0,
            currency: 'دج',
            image_url: '',
          },
        );
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const update = (patch: Partial<Product>) => {
    setProduct((p) => (p ? { ...p, ...patch } : p));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!product) return;

    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch('/api/product', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(product),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل الحفظ');

      setProduct(data.product);
      setMessage({ type: 'success', text: 'تم حفظ المنتج بنجاح' });
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'فشل الحفظ',
      });
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 3500);
    }
  };

  if (loading) {
    return (
      <div className="rounded-3xl border border-black/10 bg-white p-8 md:p-10">
        <div className="h-6 w-40 animate-pulse rounded bg-black/10" />
        <div className="mt-4 h-4 w-64 animate-pulse rounded bg-black/5" />
      </div>
    );
  }

  if (!product) return null;

  return (
    <form onSubmit={handleSave} className="rounded-3xl border border-black/10 bg-white p-6 md:p-10">
      <div className="mb-8">
        <h2 className="text-xl font-bold text-black md:text-2xl">المنتج</h2>
        <p className="mt-1 text-sm text-black/60">
          عدّل تفاصيل المنتج الظاهرة في صفحة المتجر
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Preview */}
        <div className="order-1 lg:order-2">
          <div className="sticky top-6">
            <div className="mb-3 text-xs font-medium uppercase tracking-wider text-black/50">معاينة</div>
            <div className="overflow-hidden rounded-2xl border border-black/10 bg-neutral-50 p-5">
              <div className="aspect-square w-full overflow-hidden rounded-xl bg-neutral-100">
                {product.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={product.image_url} alt={product.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-black/30">
                    لا توجد صورة
                  </div>
                )}
              </div>
              <div className="mt-4">
                <div className="text-lg font-bold text-black">{product.name || 'اسم المنتج'}</div>
                <div className="mt-1 line-clamp-2 text-sm text-black/60">
                  {product.description || 'وصف المنتج'}
                </div>
                <div className="mt-3 text-2xl font-bold text-black">
                  {product.price.toLocaleString('ar-DZ')} {product.currency}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Form */}
        <div className="order-2 lg:order-1 space-y-5">
          <Field label="اسم المنتج">
            <input
              type="text"
              value={product.name}
              onChange={(e) => update({ name: e.target.value })}
              className={inputClass}
              required
            />
          </Field>

          <Field label="الوصف">
            <textarea
              value={product.description}
              onChange={(e) => update({ description: e.target.value })}
              rows={4}
              className={`${inputClass} resize-none`}
              required
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="السعر">
              <input
                type="number"
                step="0.01"
                min="0"
                value={product.price}
                onChange={(e) => update({ price: Number(e.target.value) })}
                className={inputClass}
                required
              />
            </Field>
            <Field label="العملة">
              <input
                type="text"
                value={product.currency}
                onChange={(e) => update({ currency: e.target.value })}
                className={inputClass}
                required
              />
            </Field>
          </div>

          <Field label="رابط الصورة">
            <input
              type="url"
              value={product.image_url}
              onChange={(e) => update({ image_url: e.target.value })}
              className={inputClass}
              placeholder="https://..."
              required
            />
            <p className="mt-1 text-xs text-black/50">
              الصق رابط الصورة من أي مصدر خارجي (Imgur، Cloudinary، إلخ)
            </p>
          </Field>

          {message && (
            <div
              className={`rounded-xl px-4 py-3 text-sm ${
                message.type === 'success'
                  ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border border-red-200 bg-red-50 text-red-700'
              }`}
            >
              {message.text}
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-black px-8 py-3.5 text-base font-medium text-white transition-all hover:bg-neutral-900 disabled:opacity-60 sm:w-auto"
          >
            {saving ? (
              <>
                <span className="spinner" />
                <span>جارٍ الحفظ...</span>
              </>
            ) : (
              'حفظ التغييرات'
            )}
          </button>
        </div>
      </div>
    </form>
  );
}

const inputClass =
  'w-full rounded-xl border border-black/15 bg-white px-4 py-2.5 text-base text-black placeholder:text-black/30 transition-colors focus:border-black focus:outline-none';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-black/80">{label}</span>
      {children}
    </label>
  );
}
