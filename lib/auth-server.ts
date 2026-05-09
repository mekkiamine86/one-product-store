// =============================================================================
// Server-only auth helpers (use next/headers — Node runtime route handlers only).
// =============================================================================

import { cookies } from 'next/headers';
import { ADMIN_COOKIE, verifySessionToken } from './auth';

export async function isAdminAuthorized(): Promise<boolean> {
  const token = cookies().get(ADMIN_COOKIE)?.value;
  return verifySessionToken(token);
}
