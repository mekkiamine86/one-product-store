// =============================================================================
// PATCH /api/admin/whatsapp/merchants/[id]
//
// Update a merchant's WhatsApp configuration from the admin dashboard.
// Auth: same single-password admin session as /admin/dashboard.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAdminAuthorized } from '@/lib/auth-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface PatchBody {
  email?: string;
  name?: string;
  whatsappFromNumber?: string;
  whatsappTemplateSid?: string;
  defaultCountryCode?: string;
  youcanConfirmedSlug?: string;
  youcanCancelledSlug?: string;
  isActive?: boolean;
}

const E164 = /^\+\d{8,15}$/;
const COUNTRY = /^[A-Z]{2}$/;
const TEMPLATE_SID = /^HX[a-zA-Z0-9]{32}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// YouCan slugs from the seller dashboard: lowercase ASCII, digits, dashes,
// underscores. Permissive on length; rejects spaces and accented characters.
const STATUS_SLUG = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!(await isAdminAuthorized())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  const data: Record<string, unknown> = {};

  if (body.email !== undefined) {
    if (!EMAIL.test(body.email)) {
      return NextResponse.json({ error: 'invalid email' }, { status: 400 });
    }
    data.email = body.email;
  }
  if (body.name !== undefined) {
    data.name = body.name.trim() || null;
  }
  if (body.whatsappFromNumber !== undefined) {
    const v = body.whatsappFromNumber.trim();
    if (v && !E164.test(v)) {
      return NextResponse.json(
        { error: 'whatsappFromNumber must be E.164 (e.g. +14155238886)' },
        { status: 400 },
      );
    }
    data.whatsappFromNumber = v;
  }
  if (body.whatsappTemplateSid !== undefined) {
    const v = body.whatsappTemplateSid.trim();
    if (v && !TEMPLATE_SID.test(v)) {
      return NextResponse.json(
        { error: 'whatsappTemplateSid must look like HX followed by 32 chars' },
        { status: 400 },
      );
    }
    data.whatsappTemplateSid = v || null;
  }
  if (body.defaultCountryCode !== undefined) {
    const v = body.defaultCountryCode.toUpperCase();
    if (!COUNTRY.test(v)) {
      return NextResponse.json(
        { error: 'defaultCountryCode must be a 2-letter ISO code' },
        { status: 400 },
      );
    }
    data.defaultCountryCode = v;
  }
  if (body.youcanConfirmedSlug !== undefined) {
    const v = body.youcanConfirmedSlug.trim().toLowerCase();
    if (!STATUS_SLUG.test(v)) {
      return NextResponse.json(
        { error: 'youcanConfirmedSlug must be lowercase letters, digits, "-" or "_"' },
        { status: 400 },
      );
    }
    data.youcanConfirmedSlug = v;
  }
  if (body.youcanCancelledSlug !== undefined) {
    const v = body.youcanCancelledSlug.trim().toLowerCase();
    if (!STATUS_SLUG.test(v)) {
      return NextResponse.json(
        { error: 'youcanCancelledSlug must be lowercase letters, digits, "-" or "_"' },
        { status: 400 },
      );
    }
    data.youcanCancelledSlug = v;
  }
  if (body.isActive !== undefined) {
    data.isActive = !!body.isActive;
  }

  try {
    const merchant = await prisma.merchant.update({
      where: { id: params.id },
      data,
      select: {
        id: true,
        email: true,
        name: true,
        whatsappFromNumber: true,
        whatsappTemplateSid: true,
        defaultCountryCode: true,
        youcanConfirmedSlug: true,
        youcanCancelledSlug: true,
        isActive: true,
      },
    });
    return NextResponse.json({ merchant }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'update failed';
    // Prisma throws P2025 if the row is missing.
    if (message.includes('P2025')) {
      return NextResponse.json({ error: 'merchant not found' }, { status: 404 });
    }
    if (message.includes('Unique constraint')) {
      return NextResponse.json({ error: 'email already in use' }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
