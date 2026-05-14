'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function DeleteMerchantButton({ merchantId }: { merchantId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = typed === merchantId && !busy;

  async function onDelete() {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/whatsapp/merchants/${merchantId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmId: merchantId }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Delete failed');
      }
      router.push('/admin/whatsapp/merchants');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
      setBusy(false);
    }
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-full border border-red-200 px-4 py-2 text-xs font-medium text-red-700 hover:bg-red-50"
      >
        Delete merchant…
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-red-200 bg-red-50/50 p-4">
      <p className="text-sm text-red-900">
        This permanently deletes the merchant and every Order and WhatsApp log
        attached to them. The action cannot be undone.
      </p>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-red-900">
          Type the merchant id to confirm:{' '}
          <code className="rounded bg-white px-1.5 py-0.5 font-mono text-[11px] text-red-900">
            {merchantId}
          </code>
        </span>
        <input
          type="text"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoFocus
          className="w-full rounded-lg border border-red-300 px-3 py-2 font-mono text-sm focus:border-red-600 focus:outline-none"
        />
      </label>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onDelete}
          disabled={!canSubmit}
          className="rounded-full bg-red-600 px-4 py-2 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-40"
        >
          {busy ? 'Deleting…' : 'Delete permanently'}
        </button>
        <button
          type="button"
          onClick={() => {
            setConfirming(false);
            setTyped('');
            setError(null);
          }}
          disabled={busy}
          className="text-xs text-black/60 hover:text-black"
        >
          Cancel
        </button>
        {error && <span className="text-xs text-red-700">{error}</span>}
      </div>
    </div>
  );
}
