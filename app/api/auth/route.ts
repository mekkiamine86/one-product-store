import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  ADMIN_COOKIE,
  checkAdminPassword,
  createSessionToken,
  getSessionCookieOptions,
} from '@/lib/auth';

export const dynamic = 'force-dynamic';

// POST /api/auth → login with password
export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 });
  }

  const { password } = body || {};
  if (typeof password !== 'string') {
    return NextResponse.json({ error: 'كلمة المرور مطلوبة' }, { status: 400 });
  }

  if (!checkAdminPassword(password)) {
    // Slow down brute-force attempts (per request, kept short)
    await new Promise((r) => setTimeout(r, 600));
    return NextResponse.json({ error: 'كلمة المرور غير صحيحة' }, { status: 401 });
  }

  const token = await createSessionToken();
  cookies().set(ADMIN_COOKIE, token, getSessionCookieOptions());
  return NextResponse.json({ ok: true });
}

// DELETE /api/auth → logout
export async function DELETE() {
  cookies().set(ADMIN_COOKIE, '', { ...getSessionCookieOptions(), maxAge: 0 });
  return NextResponse.json({ ok: true });
}
