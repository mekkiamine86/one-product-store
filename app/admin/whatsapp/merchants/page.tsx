import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { formatDate, storeSlugLabel } from '../_lib/format';
import { getMerchantHealth } from '@/lib/merchant-health';
import CopyInstallLink from './CopyInstallLink';

export const dynamic = 'force-dynamic';

export default async function MerchantsPage() {
  const merchants = await prisma.merchant.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { orders: true } },
    },
  });

  const publicBase = process.env.PUBLIC_BASE_URL?.replace(/\/$/, '');
  const installUrl = publicBase
    ? `${publicBase}/api/youcan/install`
    : null;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Merchants</h1>

      <section className="rounded-2xl border border-black/5 bg-neutral-50/60 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-black/60">
          Onboard a new merchant
        </h2>
        <p className="mt-1 text-sm text-black/60">
          Share this install link with the merchant. Opening it in their browser
          takes them through YouCan's consent screen and lands them in this
          dashboard once webhooks are subscribed.
        </p>
        <div className="mt-3">
          {installUrl ? (
            <CopyInstallLink url={installUrl} />
          ) : (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Set <code className="rounded bg-white px-1.5 py-0.5 font-mono">PUBLIC_BASE_URL</code>{' '}
              in the deployment environment to enable the install link.
            </div>
          )}
        </div>
      </section>

      <div className="overflow-hidden rounded-2xl border border-black/5 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-black/50">
            <tr>
              <Th>YouCan store</Th>
              <Th>Status</Th>
              <Th>Health</Th>
              <Th>WhatsApp sender</Th>
              <Th>Template</Th>
              <Th>Orders</Th>
              <Th>Installed</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {merchants.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-black/40">
                  No merchants yet. Send a merchant to{' '}
                  <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs">
                    /api/youcan/install
                  </code>
                  .
                </td>
              </tr>
            )}
            {merchants.map((m) => {
              const health = getMerchantHealth(m);
              return (
              <tr key={m.id} className="border-t border-black/5">
                <td className="px-4 py-3 font-medium">
                  {m.youcanStoreSlug?.trim() ?? (
                    <span className="text-black/40">{storeSlugLabel(m.youcanStoreSlug)}</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {m.isActive ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                      Active
                    </span>
                  ) : (
                    <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-xs font-medium text-neutral-700">
                      Inactive
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {health.ok ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                      Ready
                    </span>
                  ) : (
                    <span
                      className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800"
                      title={health.issues.join(', ')}
                    >
                      {health.issues.length} issue{health.issues.length === 1 ? '' : 's'}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 font-mono text-xs">
                  {m.whatsappFromNumber || <span className="text-amber-600">— not set —</span>}
                </td>
                <td className="px-4 py-3 font-mono text-xs">
                  {m.whatsappTemplateSid ? (
                    `${m.whatsappTemplateSid.slice(0, 10)}…`
                  ) : (
                    <span className="text-amber-600">— not set —</span>
                  )}
                </td>
                <td className="px-4 py-3 tabular-nums">{m._count.orders.toLocaleString()}</td>
                <td className="px-4 py-3 text-xs text-black/60">{formatDate(m.createdAt)}</td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/admin/whatsapp/merchants/${m.id}`}
                    className="text-xs font-medium text-emerald-700 hover:underline"
                  >
                    Settings →
                  </Link>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children }: { children?: React.ReactNode }) {
  return <th className="px-4 py-3 text-left font-medium">{children}</th>;
}
