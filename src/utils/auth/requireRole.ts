import { getSession } from '@/app/actions/auth';

/**
 * Server-side Role-Based Access Control guard.
 *
 * RBAC rule (see AGENTS.md §3): Admin and Manager are equivalent and have full
 * access; HR is the only restricted role. Privileged actions (OT approval,
 * holiday approval, user/staff/settings management) must call
 * `requireRole(['Admin', 'Manager'])` so HR cannot bypass the UI by invoking
 * the Server Action directly.
 *
 * This module is intentionally NOT a `"use server"` file: it is a plain
 * server-side helper imported by Server Actions, not an action exposed to the
 * client. It returns a result object (rather than throwing) to match the
 * `{ error }` convention the rest of the actions use.
 */

export type AppRole = 'Admin' | 'Manager' | 'HR' | 'Staff';

export interface Session {
  id: string;
  name: string;
  role: AppRole;
  username: string;
}

export type RoleCheck =
  | { authorized: true; session: Session }
  | { authorized: false; error: string };

export async function requireRole(allowed: AppRole[]): Promise<RoleCheck> {
  const session = (await getSession()) as Session | null;

  if (!session?.role) {
    return { authorized: false, error: 'ไม่ได้เข้าสู่ระบบ' }; // not authenticated
  }

  if (!allowed.includes(session.role)) {
    return { authorized: false, error: 'สิทธิ์ของคุณไม่สามารถดำเนินการนี้ได้' }; // role not permitted
  }

  return { authorized: true, session };
}
