# Engineering Log — Pool Villa Staff Management & Payroll

> Hardening pass before manual testing & deployment. Stack: Next.js 16 (App Router) + React 19 + Tailwind + Supabase/PostgreSQL (`@supabase/ssr`). No Prisma/ORM.

## 2026-06-16 — Hardening & cleanup

### 1. TypeScript / red-marker fixes
- `src/context/I18nContext.tsx`: removed duplicate `saving` keys (en + th), added the missing `editAccess` key (en/th/mm), and documented the localStorage-sync effect (hydration-safe).
- `src/components/admin/HolidayCalendar.tsx`: introduced an exported `Holiday` interface (replaced `any[]`); removed unused imports.
- `src/app/admin/settings/page.tsx`: full strict typing via `SystemSettings`/`Department`/etc. (no `any`); removed dead holiday handlers/state; reordered the fetch-on-mount effect.

### 2. Documentation aligned to reality (Prisma → Supabase)
- `AGENTS.md` + `SYSTEM_BLUEPRINT.md`: removed all Prisma references; documented Supabase (`@supabase/ssr`), `supabase/schema.sql` as the single source of truth, and the requirement that atomic financial mutations use **Supabase RPCs** (`supabase.rpc(...)`).
- RBAC rule clarified: **Admin = Manager (full access); HR is the only restricted role.**

### 3. Backend role enforcement (RBAC)
- New `src/utils/auth/requireRole.ts` — server-side guard returning `{ authorized, error }` (Thai error strings).
- `requireRole(['Admin','Manager'])` added to: `approveOT`, `rejectOT`, `resolveHolidayReview`, `upsertStaff`, `deleteStaff`, `updateSystemSettings`, `finalizeGuaranteeDeduction`. HR is blocked at the server even if it bypasses the UI.

### 4. Payroll: dynamic day-divisor (no more hard-coded `/30`)
- New `src/utils/payroll.ts` — `getDaysInMonth`, `getDaysInMonthFromDateStr`, `getDailyRate` (timezone-safe string parsing for UTC+7 / Asia/Bangkok).
- Applied in `admin.ts`: `getMonthlySummary` (daily wage + unpaid-leave deduction) and `resolveHolidayReview` (holiday pay) now divide by the actual days in the relevant month.

### 5. Atomic guarantee RPC
- `finalizeGuaranteeDeduction` converted from a read-modify-write to a single `supabase.rpc('finalize_guarantee_deduction', …)` call.
- The Postgres function is defined in `supabase/schema.sql` (atomic `UPDATE … = col + amount` + the matching `payroll_adjustments` insert in one transaction).

### 6. Type-hardening of `src/app/actions/admin.ts`
- New `src/types/db.ts` domain types (`Profile`, `StaffInput`, `SystemSettings`, `AuditLogPayload`, `ScheduleInput`, `HolidayInput`, `WarningLetterInput`, `PayrollAdjustment`, `AttendanceRecord`, `StaffPayrollSummary`, …).
- All 14 `any`/`Record<string,any>` in `admin.ts` eliminated.

### 7. Project-wide ESLint cleanup (safe-mechanical scope)
- Fixed 62 problems across 17 files: `no-explicit-any` (typed via `@/types/db` + small local interfaces), `no-unused-vars` (dead imports/vars + removed the never-rendered `AdjPill`/`sumAdj` dashboard component), `no-unescaped-entities`, `no-require-imports` (`test.js` added to ESLint ignores), and `set-state-in-effect` (documented suppressions for mount/hydration/derived-state patterns).
- **Deferred by request** (behavior-sensitive — need per-site review): 10 × `react-hooks/immutability`, 1 × `react-hooks/exhaustive-deps`.

## Verification (as of this entry)
- `npm run build` → ✅ passes (compiles, TypeScript clean, all 15 routes generated)
- `npx tsc --noEmit` → ✅ 0 errors
- `npm run lint` → 11 problems remaining, all intentionally deferred (see §7)

## ⚠️ Deployment checklist (do before / during deploy)
1. **Run the SQL in Supabase** — apply `finalize_guarantee_deduction(...)` from `supabase/schema.sql` in the Supabase SQL Editor. Until this exists in the live DB, guarantee finalization will fail. (Add `SECURITY DEFINER` only if RLS blocks the anon role from writing `profiles`.)
2. Confirm `.env.local` / production env has `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
3. Verify the Thailand timezone (UTC+7) behavior on the production host (Vercel) for clock-in/out and payroll boundaries.

## Known follow-ups (not blocking)
- `InAppBrowserBlocker.tsx` and `admin/qr/page.tsx` hard-code Thai strings instead of using `I18nContext` (violates the i18n rule; centralize when convenient).
- The 11 deferred `react-hooks` lint items.
- Broader `any` typing in other client pages was addressed; remaining ones (if any surface) can reuse `@/types/db`.
