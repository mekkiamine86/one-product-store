'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ResendButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  async function onClick() {
    if (busy) return;
    if (!confirm('Re-send the WhatsApp confirmation to the customer?')) return;
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/admin/whatsapp/orders/${orderId}/resend`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || data.reason || 'Resend failed');
      }
      setStatus({ ok: true, msg: 'Sent.' });
      router.refresh();
    } catch (err) {
      setStatus({ ok: false, msg: err instanceof Error ? err.message : 'Resend failed' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
      >
        {busy ? 'Sending…' : 'Re-send confirmation'}
      </button>
      {status && (
        <span className={`text-xs ${status.ok ? 'text-emerald-700' : 'text-red-700'}`}>
          {status.msg}
        </span>
      )}
    </>
  );
}
