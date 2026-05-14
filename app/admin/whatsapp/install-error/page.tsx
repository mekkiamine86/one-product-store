// =============================================================================
// /admin/whatsapp/install-error?reason=<kebab-case>
//
// User-facing landing for failed OAuth handshakes. The OAuth routes used to
// return JSON ({ "error": "invalid state" }), which is fine for an API
// consumer but useless for a merchant who clicked an install link in their
// browser. This page renders a friendly explanation keyed off the reason
// query param plus a clear "what to do next" instruction.
// =============================================================================

import Link from 'next/link';

interface Reason {
  title: string;
  body: string;
  retryable: boolean;
}

const REASONS: Record<string, Reason> = {
  'missing-code': {
    title: 'No authorisation code received',
    body:
      'YouCan redirected you here without an authorisation code, which means the consent screen was likely closed or dismissed. Click your install link again to retry.',
    retryable: true,
  },
  'app-not-configured': {
    title: 'App configuration incomplete',
    body:
      "This installation can't proceed because the operator hasn't finished configuring the app's YouCan credentials. Contact whoever set up this dashboard — they need to add YOUCAN_CLIENT_ID, YOUCAN_CLIENT_SECRET, and PUBLIC_BASE_URL to the deployment environment.",
    retryable: false,
  },
  'invalid-state': {
    title: 'Install session expired',
    body:
      'Your install session has expired or the callback was tampered with. This usually happens when too much time passed between clicking install and finishing the consent screen, or when the link was opened in a different browser. Click the install link again to start fresh.',
    retryable: true,
  },
  'token-exchange-failed': {
    title: 'YouCan rejected the handshake',
    body:
      "We received the authorisation code but YouCan refused to exchange it for an access token. This usually means the app's client ID or secret is wrong, or the redirect URL registered in the YouCan Partner Dashboard doesn't match this site. Contact the operator.",
    retryable: false,
  },
  'webhook-register-failed': {
    title: 'Webhooks could not be registered',
    body:
      "Your access token was issued successfully, but we couldn't subscribe to the YouCan order webhooks. Your merchant account exists in our dashboard — an operator can retry the subscription from the merchant detail page using the 'Re-register webhooks' button.",
    retryable: false,
  },
};

const FALLBACK: Reason = {
  title: 'Install failed',
  body: 'Something went wrong during the install handshake with YouCan. Try the install link again, or contact the operator if it keeps failing.',
  retryable: true,
};

export default function InstallErrorPage({
  searchParams,
}: {
  searchParams: { reason?: string };
}) {
  const key = searchParams.reason ?? '';
  const reason = REASONS[key] ?? FALLBACK;

  return (
    <div className="mx-auto max-w-xl space-y-6 px-6 py-16">
      <div className="rounded-2xl border border-red-200 bg-red-50/50 p-8">
        <div className="text-xs font-semibold uppercase tracking-wide text-red-900/70">
          Install error
        </div>
        <h1 className="mt-2 text-2xl font-semibold text-red-900">
          {reason.title}
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-red-900/90">
          {reason.body}
        </p>
        {key && (
          <p className="mt-6 text-xs text-red-900/60">
            Reference code:{' '}
            <code className="rounded bg-white px-1.5 py-0.5 font-mono">
              {key}
            </code>
          </p>
        )}
      </div>

      {reason.retryable && (
        <div className="rounded-2xl border border-black/5 bg-white p-6 text-sm text-black/70">
          <p className="font-medium text-black">What to do next</p>
          <p className="mt-2">
            Open your YouCan store, find the app listing for this integration,
            and click <strong>Install</strong> again. If the same error appears,
            note the reference code above and contact the operator.
          </p>
        </div>
      )}

      <div className="text-center">
        <Link
          href="/admin/whatsapp"
          className="text-xs text-black/50 hover:text-black"
        >
          Operator dashboard →
        </Link>
      </div>
    </div>
  );
}
