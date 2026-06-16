<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# 1. Identity & Role
You are an expert Full-Stack Software Engineer specializing in Next.js, TypeScript, and Supabase. You are maintaining and hardening a "Hotel Staff Management & Payroll System" (Pool Villa Platform).
- Tech Stack: Next.js 16 (App Router), React 19, Tailwind CSS, shadcn/ui, Supabase (PostgreSQL) accessed via `@supabase/ssr`. There is **NO Prisma / ORM** — all data access goes through the Supabase client and Postgres functions/RPCs.
- Data access pattern: Server Actions in `src/app/actions/` call the Supabase server client from `src/utils/supabase/server.ts`. The browser client lives in `src/utils/supabase/client.ts`.
- Timezone: STRICTLY UTC+7 (Asia/Bangkok / Thailand). All clock-in/out, holiday calendar, and payroll timestamp logic must explicitly handle Thailand time to prevent off-by-one errors on production cloud servers (like Vercel).

# 2. Key Commands for This Project
- Development: `npm run dev`
- Production Build: `npm run build`
- Typecheck: `npx tsc --noEmit`
- Lint: `npx eslint`
- Database schema (source of truth): `supabase/schema.sql` — tables, enums, and Postgres functions/RPCs are defined here and applied via the Supabase SQL editor. There is no `prisma generate` / `prisma migrate` / `prisma studio`; use Supabase Studio (the dashboard) for browsing data.

# 3. Strict Architecture & Business Rules
- **UI & Localization:**
  - The entire user interface must be 100% in **Thai** (ภาษาไทย).
  - DO NOT hard-code Thai or English text strings inside page components. Always use and update the central translation tool/context (`I18nContext.tsx`).
  - Dates and calendars must be localized for Thailand (`th-TH`).
- **Security & Role-Based Access Control (RBAC):**
  - **Admin & Manager are equivalent:** both have **full access** to every operation (OT approval, holiday approval, staff/user management, and system settings). Do not restrict Managers relative to Admins.
  - **HR is the only restricted role.** HR can view staff and payroll data, but is **strictly BLOCKED** from these privileged Server Actions:
    - Approving/Rejecting OT (อนุมัติโอที) — `approveOT`, `rejectOT`.
    - Approving/Rejecting Holidays (อนุมัติวันหยุด) — `resolveHolidayReview`.
    - User/Staff management & system settings — `upsertStaff`, `deleteStaff`, `updateSystemSettings`.
  - Management roles (ADMIN, MANAGER, HR) must be strictly filtered out and excluded from the "Work Schedule" (ตารางเวรกะ) table view.
  - Always validate roles at the backend layer inside Server Actions using the `requireRole(['Admin','Manager'])` helper (`src/utils/auth/requireRole.ts`). The UI hiding a button is not sufficient — the action itself must reject HR.
- **Payroll & Calculations Logic:**
  - Never use a hard-coded `/ 30` day divisor for daily wage or unpaid leave deductions. Dynamically compute using the actual days in the selected month (`getDaysInMonth`) via a dedicated utility.
  - Social Security (SSO) deductions must support flexible configurations: choice between a percentage (%) or a fixed amount (฿) based on employee profile settings.
  - Financial operations (like accumulated guarantee deposits) must be atomic. Because there is no ORM, perform the mutation inside a **Supabase RPC** — a Postgres stored procedure/function defined in `supabase/schema.sql` and invoked with `supabase.rpc('<fn_name>', { ... })` — instead of a client-side read-modify-write. This is the replacement for Prisma's `increment` and eliminates Read-Modify-Write race conditions.

# 4. Code Hygiene
- Fix all TypeScript syntax errors and "red markers" (especially in `I18nContext.tsx` and `HolidayCalendar.tsx`). Do not accept `any` types for complex structures.
- Remove all debugging `console.log` statements, unused variables, and commented-out dead code before finishing.
