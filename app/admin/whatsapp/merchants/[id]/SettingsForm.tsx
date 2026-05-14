'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  merchantId: string;
  initial: {
    email: string;
    name: string;
    youcanStoreSlug: string;
    whatsappFromNumber: string;
    whatsappTemplateSid: string;
    defaultCountryCode: string;
    youcanConfirmedSlug: string;
    youcanCancelledSlug: string;
    isActive: boolean;
  };
  youcanStoreId: string | null;
}

export default function SettingsForm({ merchantId, initial, youcanStoreId }: Props) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/admin/whatsapp/merchants/${merchantId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      setStatus({ ok: true, msg: 'Saved.' });
      router.refresh();
    } catch (err) {
      setStatus({ ok: false, msg: err instanceof Error ? err.message : 'Save failed' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4 md:grid-cols-2">
      <Field label="Contact email">
        <input
          type="email"
          value={form.email}
          onChange={(e) => update('email', e.target.value)}
          className="w-full rounded-lg border border-black/15 px-3 py-2 text-sm focus:border-black focus:outline-none"
        />
      </Field>
      <Field label="Display name">
        <input
          type="text"
          value={form.name}
          onChange={(e) => update('name', e.target.value)}
          className="w-full rounded-lg border border-black/15 px-3 py-2 text-sm focus:border-black focus:outline-none"
        />
      </Field>

      <Field
        label="YouCan store"
        hint={
          youcanStoreId
            ? `Optional display label. Platform store id: ${youcanStoreId}`
            : 'Optional display label, e.g. "my-store.youcan.shop".'
        }
      >
        <input
          type="text"
          placeholder="my-store.youcan.shop"
          value={form.youcanStoreSlug}
          onChange={(e) => update('youcanStoreSlug', e.target.value)}
          className="w-full rounded-lg border border-black/15 px-3 py-2 font-mono text-sm focus:border-black focus:outline-none"
        />
      </Field>

      <Field
        label="WhatsApp sender (E.164)"
        hint='Twilio number, e.g. "+14155238886".'
      >
        <input
          type="text"
          inputMode="tel"
          placeholder="+14155238886"
          value={form.whatsappFromNumber}
          onChange={(e) => update('whatsappFromNumber', e.target.value)}
          className="w-full rounded-lg border border-black/15 px-3 py-2 font-mono text-sm focus:border-black focus:outline-none"
        />
      </Field>

      <Field
        label="Twilio Content SID"
        hint='Approved template with "Confirm" / "Cancel" quick-reply buttons.'
      >
        <input
          type="text"
          placeholder="HXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
          value={form.whatsappTemplateSid}
          onChange={(e) => update('whatsappTemplateSid', e.target.value)}
          className="w-full rounded-lg border border-black/15 px-3 py-2 font-mono text-sm focus:border-black focus:outline-none"
        />
        <details className="mt-2 text-xs text-black/60">
          <summary className="cursor-pointer hover:text-black">
            Template variable mapping
          </summary>
          <div className="mt-2 rounded-lg bg-neutral-50 p-3">
            Your Twilio template must use three positional variables in this
            order:
            <ul className="mt-2 space-y-1">
              <li>
                <code className="rounded bg-white px-1.5 py-0.5 font-mono">{'{{1}}'}</code>{' '}
                YouCan order reference (e.g. <em>#1024</em>)
              </li>
              <li>
                <code className="rounded bg-white px-1.5 py-0.5 font-mono">{'{{2}}'}</code>{' '}
                Customer's first name
              </li>
              <li>
                <code className="rounded bg-white px-1.5 py-0.5 font-mono">{'{{3}}'}</code>{' '}
                Total amount with currency (e.g. <em>149.99 MAD</em>)
              </li>
            </ul>
            <p className="mt-2">
              The template must include two quick-reply buttons whose payloads
              start with <code className="rounded bg-white px-1.5 py-0.5 font-mono">CONFIRM</code>{' '}
              and <code className="rounded bg-white px-1.5 py-0.5 font-mono">CANCEL</code>{' '}
              (case-insensitive). Free-text replies are accepted too — see the
              localised keyword tables in <code className="font-mono">lib/whatsapp.ts</code>.
            </p>
          </div>
        </details>
      </Field>

      <Field
        label="Default country (ISO-3166-1 alpha-2)"
        hint='Used to parse local-form phone numbers. e.g. "DZ", "MA", "EG".'
      >
        <input
          type="text"
          maxLength={2}
          value={form.defaultCountryCode}
          onChange={(e) => update('defaultCountryCode', e.target.value.toUpperCase())}
          className="w-20 rounded-lg border border-black/15 px-3 py-2 text-center font-mono text-sm uppercase focus:border-black focus:outline-none"
        />
      </Field>

      <Field
        label="Confirmed status slug"
        hint='YouCan custom-status slug to set when the customer confirms. Default "confirmed".'
      >
        <input
          type="text"
          value={form.youcanConfirmedSlug}
          onChange={(e) => update('youcanConfirmedSlug', e.target.value.toLowerCase())}
          className="w-full rounded-lg border border-black/15 px-3 py-2 font-mono text-sm lowercase focus:border-black focus:outline-none"
        />
      </Field>

      <Field
        label="Cancelled status slug"
        hint='YouCan custom-status slug to set when the customer cancels. Default "cancelled".'
      >
        <input
          type="text"
          value={form.youcanCancelledSlug}
          onChange={(e) => update('youcanCancelledSlug', e.target.value.toLowerCase())}
          className="w-full rounded-lg border border-black/15 px-3 py-2 font-mono text-sm lowercase focus:border-black focus:outline-none"
        />
      </Field>

      <Field label="Status">
        <label className="inline-flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => update('isActive', e.target.checked)}
            className="h-4 w-4 rounded"
          />
          <span className="text-sm">Active</span>
        </label>
      </Field>

      <div className="col-span-full flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-full bg-black px-5 py-2 text-sm font-medium text-white hover:bg-neutral-900 disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        {status && (
          <span className={`text-sm ${status.ok ? 'text-emerald-700' : 'text-red-700'}`}>
            {status.msg}
          </span>
        )}
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-black/70">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-black/50">{hint}</span>}
    </label>
  );
}
