import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const SESSION_COOKIE = 'attendance_session';
const MANAGEMENT_ROLES = ['Admin', 'Manager', 'HR'];

interface SessionPayload {
  id: string;
  name: string;
  role: string;
  username: string;
}

/** Decode a base64url string to bytes (Edge-runtime safe — no Buffer). */
function base64urlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=');
  const bin = atob(b64);
  const bytes = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/**
 * Verify the HMAC-signed session cookie using Web Crypto (works on the Edge
 * runtime). Mirrors the signing in `src/app/actions/auth.ts`. Returns the
 * payload only if the signature is valid, otherwise null.
 */
async function verifySession(token: string | undefined, secret: string): Promise<SessionPayload | null> {
  if (!token) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;

  try {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      base64urlToBytes(sig),
      new TextEncoder().encode(body),
    );
    if (!valid) return null;

    return JSON.parse(new TextDecoder().decode(base64urlToBytes(body))) as SessionPayload;
  } catch {
    return null;
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const secret = process.env.SESSION_SECRET;

  const session = secret ? await verifySession(token, secret) : null;

  // 1. No valid (verified) session.
  if (!session) {
    if (pathname.startsWith('/admin')) {
      const url = request.nextUrl.clone();
      url.pathname = '/';
      return NextResponse.redirect(url);
    }
    // Clear a tampered/expired cookie so the client returns to a clean state.
    if (token) {
      const response = NextResponse.next();
      response.cookies.delete(SESSION_COOKIE);
      return response;
    }
    return NextResponse.next();
  }

  // 2. Authenticated users.
  const isAdmin = MANAGEMENT_ROLES.includes(session.role);

  // If a management user hits root /, send them to the dashboard.
  if (pathname === '/' && isAdmin) {
    const url = request.nextUrl.clone();
    url.pathname = '/admin';
    return NextResponse.redirect(url);
  }

  // Protection for /admin.
  if (pathname.startsWith('/admin')) {
    if (!isAdmin) {
      // Staff trying to access admin -> redirect to root with error.
      const url = request.nextUrl.clone();
      url.pathname = '/';
      url.searchParams.set('error', 'access_denied');
      return NextResponse.redirect(url);
    }

    // Only Admin can access /admin/users.
    if (pathname.startsWith('/admin/users') && session.role !== 'Admin') {
      const url = request.nextUrl.clone();
      url.pathname = '/admin';
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/admin', '/'],
};
