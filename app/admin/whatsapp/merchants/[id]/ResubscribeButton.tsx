'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface SubscribeResult {
  event: string;
  ok: boolean;
  error?: string;
}

export default function ResubscribeButton({ merchantId }: { merchantId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<
    | { ok: true; msg: string }
    | { ok: false; msg: string; results?: SubscribeResult[] }
    | null
  >(null);

  async function onClick() {
    if (busy) return;
    if (!confirm('Re-register YouCan webhooks for this merchant?')) return;
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch(
        `/api/admin/whatsapp/merchants/${merchantId}/resubscribe`,
        { method: 'POST' },
      );
      const data = (await res.json()) as {
        ok: boolean;
        results?: SubscribeResult[];
        error?: string;
      };
      if (!res.ok || !data.ok) {
        const msg =
          data.error ??
          data.results?.find((r) => !r.ok)?.error ??
          'Subscribe failed';
        setStatus({ ok: false, msg, results: data.results });
      } else {
        setStatus({ ok: true, msg: 'Re-subscribed.' });
      }
      router.refresh();
    } catch (err) {
      setStatus({ ok: false, msg: err instanceof Error ? err.message : 'Request failed' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className="rounded-full border border-black/15 px-4 py-2 text-xs font-medium hover:bg-black hover:text-white disabled:opacity-60"
      >
        {busy ? 'Subscribing…' : 'Re-register webhooks'}
      </button>
      {status && (
        <span className={`text-xs ${status.ok ? 'text-emerald-700' : 'text-red-700'}`}>
          {status.msg}
        </span>
      )}
      {status && !status.ok && status.results && (
        <ul className="text-xs text-red-700">
          {status.results.map((r) => (
            <li key={r.event}>
              <code>{r.event}</code>: {r.ok ? 'ok' : r.error}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
