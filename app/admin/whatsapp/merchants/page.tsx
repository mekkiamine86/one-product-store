import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { formatDate, storeSlugLabel } from '../_lib/format';

export const dynamic = 'force-dynamic';

export default async function MerchantsPage() {
  const merchants = await prisma.merchant.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { orders: true } },
    },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Merchants</h1>

      <div className="overflow-hidden rounded-2xl border border-black/5 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-black/50">
            <tr>
              <Th>YouCan store</Th>
              <Th>Status</Th>
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
                <td colSpan={7} className="px-4 py-10 text-center text-black/40">
                  No merchants yet. Send a merchant to{' '}
                  <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs">
                    /api/youcan/install
                  </code>
                  .
                </td>
              </tr>
            )}
            {merchants.map((m) => (
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
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children }: { children?: React.ReactNode }) {
  return <th className="px-4 py-3 text-left font-medium">{children}</th>;
}
