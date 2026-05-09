'use client';

import { useEffect, useState } from 'react';
import type { Product } from '@/lib/supabase';

type Props = {
  product: Product;
  open: boolean;
  onClose: () => void;
};

export default function OrderForm({ product, open, onClose }: Props) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim() || !phone.trim() || !address.trim()) {
      setError('يرجى ملء جميع الحقول');
      return;
    }

    if (phone.trim().length < 9) {
      setError('رقم الهاتف غير صحيح');
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: name.trim(),
          customer_phone: phone.trim(),
          customer_address: address.trim(),
          product_name: product.name,
          product_price: product.price,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'حدث خطأ ما');

      setSuccess(true);
      setName('');
      setPhone('');
      setAddress('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ ما');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setSuccess(false);
    setError(null);
    onClose();
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm md:items-center"
      onClick={handleClose}
    >
      <div
        className="relative w-full max-w-lg animate-slide-up overflow-hidden rounded-t-3xl bg-white md:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute top-4 left-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/5 text-black/60 transition-colors hover:bg-black/10 hover:text-black"
          aria-label="إغلاق"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {success ? (
          <div className="px-6 py-12 text-center md:px-10">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-black">
              <svg className="h-8 w-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="mt-6 text-2xl font-bold text-black">تم استلام طلبك!</h3>
            <p className="mt-3 text-balance text-base text-black/60">
              سنتواصل معك قريباً لتأكيد الطلب وترتيب التوصيل. شكراً لثقتك بنا.
            </p>
            <button
              onClick={handleClose}
              className="mt-8 inline-flex items-center justify-center rounded-full bg-black px-8 py-3 text-sm font-medium text-white transition-all hover:bg-neutral-900"
            >
              إغلاق
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="px-6 pb-8 pt-14 md:px-10">
            <h3 className="text-2xl font-bold text-black md:text-3xl">إتمام الطلب</h3>
            <p className="mt-2 text-sm text-black/60">
              املأ معلوماتك وسنتواصل معك لتأكيد الطلب
            </p>

            {/* Order summary */}
            <div className="mt-6 flex items-center gap-4 rounded-2xl border border-black/10 bg-neutral-50 p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={product.image_url}
                alt={product.name}
                className="h-14 w-14 flex-shrink-0 rounded-xl object-cover"
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-black">{product.name}</div>
                <div className="text-xs text-black/60">الكمية: 1</div>
              </div>
              <div className="text-base font-bold text-black">
                {product.price.toLocaleString('ar-DZ')} {product.currency}
              </div>
            </div>

            <div className="mt-6 space-y-4">
              <Field
                label="الاسم الكامل"
                value={name}
                onChange={setName}
                placeholder="مثال: محمد أحمد"
                disabled={submitting}
              />
              <Field
                label="رقم الهاتف"
                value={phone}
                onChange={setPhone}
                placeholder="0X XX XX XX XX"
                type="tel"
                disabled={submitting}
                inputMode="tel"
              />
              <Field
                label="العنوان الكامل"
                value={address}
                onChange={setAddress}
                placeholder="الولاية، البلدية، الشارع"
                multiline
                disabled={submitting}
              />
            </div>

            {error && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-black px-8 py-4 text-base font-medium text-white transition-all hover:bg-neutral-900 disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <span className="spinner" />
                  <span>جارٍ الإرسال...</span>
                </>
              ) : (
                <>
                  <span>تأكيد الطلب</span>
                  <span className="text-white/60">·</span>
                  <span>{product.price.toLocaleString('ar-DZ')} {product.currency}</span>
                </>
              )}
            </button>

            <p className="mt-4 text-center text-xs text-black/50">
              الدفع عند الاستلام · لن نشارك معلوماتك مع أي طرف ثالث
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

type FieldProps = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  multiline?: boolean;
  disabled?: boolean;
  inputMode?: 'text' | 'tel' | 'numeric';
};

function Field({ label, value, onChange, placeholder, type = 'text', multiline, disabled, inputMode }: FieldProps) {
  const baseClass =
    'w-full rounded-2xl border border-black/15 bg-white px-4 py-3 text-base text-black placeholder:text-black/30 transition-colors focus:border-black focus:outline-none disabled:opacity-60';

  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-black/80">{label}</span>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          rows={3}
          className={`${baseClass} resize-none`}
        />
      ) : (
        <input
          type={type}
          inputMode={inputMode}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className={baseClass}
        />
      )}
    </label>
  );
}
