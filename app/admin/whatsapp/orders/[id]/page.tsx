import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { WhatsAppDirection } from '@prisma/client';
import { formatDate, formatMoney, orderStatusBadge, waStatusLabel } from '../../_lib/format';
import ResendButton from './ResendButton';

export const dynamic = 'force-dynamic';

export default async function OrderDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const order = await prisma.order.findUnique({
    where: { id: params.id },
    include: {
      merchant: { select: { id: true, shopifyDomain: true } },
      whatsappLogs: { orderBy: { createdAt: 'desc' } },
    },
  });
  if (!order) notFound();

  const badge = orderStatusBadge(order.status);

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin/whatsapp/orders" className="text-xs text-black/60 hover:text-black">
          ← Back to orders
        </Link>
        <div className="mt-2 flex flex-wrap items-baseline gap-3">
          <h1 className="font-mono text-2xl font-semibold">{order.shopifyOrderName}</h1>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}>
            {badge.label}
          </span>
          <Link
            href={`/admin/whatsapp/merchants/${order.merchant.id}`}
            className="text-sm text-black/60 hover:text-black"
          >
            {order.merchant.shopifyDomain}
          </Link>
        </div>
      </div>

      <section className="grid gap-3 md:grid-cols-2">
        <Card label="Customer">
          <div className="text-lg font-medium">{order.customerName}</div>
          <div className="font-mono text-sm text-black/70">{order.customerPhone || '—'}</div>
          {order.customerEmail && (
            <div className="text-sm text-black/60">{order.customerEmail}</div>
          )}
        </Card>
        <Card label="Total">
          <div className="text-lg font-medium tabular-nums">
            {formatMoney(order.totalAmount, order.currency)}
          </div>
          {order.lineItemsSummary && (
            <div className="mt-1 text-sm text-black/60">{order.lineItemsSummary}</div>
          )}
        </Card>
        <Card label="Confirmation sent">
          <div className="text-sm">{formatDate(order.confirmationSentAt)}</div>
        </Card>
        <Card label="Customer responded">
          <div className="text-sm">{formatDate(order.respondedAt)}</div>
        </Card>
      </section>

      <section className="rounded-2xl border border-black/5 bg-white p-6">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-black/60">
            Actions
          </h2>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <ResendButton orderId={order.id} />
          <span className="text-xs text-black/50">
            Re-sends the WhatsApp confirmation template using the merchant's current settings.
          </span>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-black/60">
          WhatsApp timeline
        </h2>
        <div className="overflow-hidden rounded-2xl border border-black/5 bg-white">
          {order.whatsappLogs.length === 0 ? (
            <div className="px-4 py-10 text-center text-black/40">No WhatsApp events yet.</div>
          ) : (
            <ul className="divide-y divide-black/5">
              {order.whatsappLogs.map((log) => (
                <li key={log.id} className="flex items-start gap-4 px-4 py-3">
                  <div
                    className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                      log.direction === WhatsAppDirection.OUTBOUND ? 'bg-emerald-500' : 'bg-blue-500'
                    }`}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="text-sm font-medium">
                        {log.direction === WhatsAppDirection.OUTBOUND ? 'Sent' : 'Received'}
                      </span>
                      <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] uppercase tracking-wide text-neutral-700">
                        {waStatusLabel(log.status)}
                      </span>
                      <span className="text-xs text-black/50">{formatDate(log.createdAt)}</span>
                    </div>
                    <div className="mt-1 font-mono text-xs text-black/60">
                      {log.direction === WhatsAppDirection.OUTBOUND
                        ? `to ${log.toNumber}`
                        : `from ${log.fromNumber}`}
                      {log.providerMessageId && ` · ${log.providerMessageId}`}
                    </div>
                    {log.body && (
                      <div className="mt-1 text-sm text-black/80">"{log.body}"</div>
                    )}
                    {log.buttonPayload && (
                      <div className="mt-1 text-sm text-black/70">
                        button payload: <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs">{log.buttonPayload}</code>
                      </div>
                    )}
                    {log.errorMessage && (
                      <div className="mt-1 text-sm text-red-700">{log.errorMessage}</div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section>
        <details className="rounded-2xl border border-black/5 bg-white">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
            Raw Shopify payload
          </summary>
          <pre className="max-h-96 overflow-auto border-t border-black/5 bg-neutral-50 px-4 py-3 text-xs">
            {JSON.stringify(order.rawShopifyPayload, null, 2)}
          </pre>
        </details>
      </section>
    </div>
  );
}

function Card({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-black/5 bg-white p-5">
      <div className="text-xs uppercase tracking-wide text-black/50">{label}</div>
      <div className="mt-2">{children}</div>
    </div>
  );
}
