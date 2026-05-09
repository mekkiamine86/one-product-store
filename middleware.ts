import { NextResponse, type NextRequest } from 'next/server';
import { ADMIN_COOKIE, verifySessionToken } from '@/lib/auth';

// Protect /admin/dashboard routes — redirect to /admin (login) if not authenticated.
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith('/admin/dashboard')) {
    const token = req.cookies.get(ADMIN_COOKIE)?.value;
    const ok = await verifySessionToken(token);
    if (!ok) {
      const url = req.nextUrl.clone();
      url.pathname = '/admin';
      url.searchParams.set('next', pathname);
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/dashboard/:path*'],
};
