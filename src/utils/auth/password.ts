/**
 * Password hashing helpers (server-only).
 *
 * Uses Node's built-in `crypto.scrypt` — a memory-hard KDF — so no extra
 * dependency is needed. Stored format: `scrypt$<saltHex>$<hashHex>`.
 *
 * Passwords are NEVER stored or compared in plaintext. See AGENTS.md §3.
 */

import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

const KEYLEN = 64;

/** Hash a plaintext password with a fresh random salt. */
export function hashPassword(plain: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(plain, salt, KEYLEN).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

/**
 * Constant-time verification of a plaintext password against a stored hash.
 * Returns false for any malformed / legacy (non-hashed) value, so plaintext
 * rows left over from before hashing can never authenticate.
 */
export function verifyPassword(plain: string, stored: string | null | undefined): boolean {
  if (!stored) return false;

  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;

  const [, salt, hashHex] = parts;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(plain, salt, expected.length);

  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
