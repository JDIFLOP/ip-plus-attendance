# System Blueprint: Pool Villa Payroll & Staff Management

## 1. Key Component Mapping
- `src/context/I18nContext.tsx` - Centralized Thai/Language localization context (Fixing IDE type errors here is highest priority).
- `src/components/admin/HolidayCalendar.tsx` - Admin calendar component for public holidays.
- `src/app/admin/payroll/` & `src/app/page.tsx` - Monthly summary and calculation views.
- `src/utils/payroll.ts` - (Pending/New) Centralized helper for dynamic month-day divisors and cycle boundaries.
- `supabase/schema.sql` - The single source of truth for the database (Supabase / PostgreSQL): tables (`profiles`, `attendance`, `schedules`, `public_holidays`, `settings`, `audit_logs`, `payroll_adjustments`, `warning_letters`), enums, and Postgres functions/RPCs (e.g. `haversine_distance`). **There is no Prisma.** Data access uses the Supabase client (`@supabase/ssr`) from Server Actions in `src/app/actions/`. Atomic financial mutations must be implemented as Supabase RPCs and called with `supabase.rpc(...)`.

## 2. Immediate Hardening Focus
1. Fix the `I18nContext.tsx` type errors (currently showing 9+ syntax/type errors in IDE).
2. Implement backend-level role enforcement in server actions to prevent HR from bypassing UI restrictions. **Admin and Manager have full access (treated identically); HR is the only restricted role** and is blocked from OT approval (`approveOT`/`rejectOT`), holiday approval (`resolveHolidayReview`), and user/staff/settings management (`upsertStaff`/`deleteStaff`/`updateSystemSettings`). Guard each with `requireRole(['Admin','Manager'])` from `src/utils/auth/requireRole.ts`.
3. Replace hardcoded date divisors with dynamic calculations to handle shorter/longer months accurately.
