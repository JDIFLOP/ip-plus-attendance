"use server";

import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { createHmac, timingSafeEqual } from 'crypto';
import { verifyPassword } from '@/utils/auth/password';

const SESSION_COOKIE = 'attendance_session';

interface SessionPayload {
  id: string;
  name: string;
  role: string;
  username: string;
}

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    // Fail closed: never fall back to an unsigned/forgeable session.
    throw new Error('SESSION_SECRET is not configured.');
  }
  return secret;
}

/** Encode + HMAC-SHA256 sign a session: "<payloadB64url>.<sigB64url>". */
function signSession(payload: SessionPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', getSecret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

/** Verify the HMAC in constant time. Returns the payload, or null if tampered. */
function verifySession(token: string | undefined): SessionPayload | null {
  if (!token) return null;

  const [body, sig] = token.split('.');
  if (!body || !sig) return null;

  const expectedSig = createHmac('sha256', getSecret()).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload;
  } catch {
    return null;
  }
}

/** Constant-time string comparison (used for the env bootstrap credentials). */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

export async function login(username: string, password: string) {
  const supabase = await createClient();

  let user: SessionPayload | null = null;

  // Optional break-glass/bootstrap admin, configured via env (never hardcoded).
  // Disabled automatically when the env vars are not set.
  const bootstrapUser = process.env.ADMIN_BOOTSTRAP_USERNAME;
  const bootstrapPass = process.env.ADMIN_BOOTSTRAP_PASSWORD;
  if (
    bootstrapUser &&
    bootstrapPass &&
    safeEqual(username, bootstrapUser) &&
    safeEqual(password, bootstrapPass)
  ) {
    user = {
      id: process.env.ADMIN_BOOTSTRAP_ID || 'admin-bootstrap',
      name: 'System Admin',
      role: 'Admin',
      username: bootstrapUser,
    };
  } else {
    // Find user in profiles table (password column needed only here).
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, role, username, password')
      .eq('username', username)
      .single();

    if (error || !data) {
      return { error: 'Invalid username or password' };
    }

    // Verify against the stored scrypt hash (constant-time).
    if (!verifyPassword(password, data.password)) {
      return { error: 'Invalid username or password' };
    }

    user = {
      id: data.id,
      name: data.full_name,
      role: data.role,
      username: data.username,
    };
  }

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, signSession(user), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 1 week
    path: '/',
  });

  return { success: true, role: user.role };
}

export async function logout() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  return { success: true };
}

export async function getSession() {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(SESSION_COOKIE);
  return verifySession(cookie?.value);
}

export async function getAuthRole() {
  const session = await getSession();
  return session?.role || null;
}
