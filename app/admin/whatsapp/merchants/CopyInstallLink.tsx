'use client';

import { useState } from 'react';

export default function CopyInstallLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard API can fail on non-https or older browsers — fall back
      // to selecting the input below.
      const input = document.getElementById('install-link-input') as HTMLInputElement | null;
      if (input) {
        input.select();
        document.execCommand('copy');
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }
    }
  }

  return (
    <div className="flex items-center gap-2">
      <input
        id="install-link-input"
        readOnly
        value={url}
        onFocus={(e) => e.currentTarget.select()}
        className="w-full rounded-lg border border-black/15 bg-white px-3 py-2 font-mono text-xs focus:border-black focus:outline-none"
      />
      <button
        type="button"
        onClick={onCopy}
        className="shrink-0 rounded-full bg-black px-4 py-2 text-xs font-medium text-white hover:bg-neutral-900"
      >
        {copied ? 'Copied' : 'Copy link'}
      </button>
    </div>
  );
}
