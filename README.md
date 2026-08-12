# HRMS

Attendance, leave, biometric import, payroll, KRA, assets, policies, recruitment, and exit
management for a single company — built as one Cloudflare Worker (Hono + D1) serving a React SPA.

## Stack

- **Backend:** Cloudflare Worker, [Hono](https://hono.dev), [Drizzle ORM](https://orm.drizzle.team) over D1 (SQLite)
- **Frontend:** React + Vite + TypeScript, served by the same Worker via Workers Static Assets
- **Auth:** email/password (PBKDF2 via Web Crypto), session as an httpOnly JWT cookie
- **Deploy target:** Cloudflare (one `wrangler deploy` ships both API and frontend)

No external services required — D1 is Cloudflare's own database, so there's nothing to provision
beyond a Cloudflare account.

## Project layout

```
src/                  Worker source
  db/schema/          Drizzle table definitions, one file per domain
  lib/                Auth/JWT, RBAC permissions, payroll engine, biometric file parser
  middleware/         requireAuth / requirePermission
  routes/             One file per API area, mounted in src/index.ts under /api/*
migrations/           D1 schema migrations (wrangler d1 migrations)
seed/                 Generated seed data (roles, permissions, founder login) — not a migration
scripts/generate-seed.ts   Regenerates seed/seed.sql
frontend/             React app (Vite). Builds to frontend/dist, which wrangler serves as assets.
```

## First-time setup

```bash
npm install
cd frontend && npm install && cd ..

# Create your own D1 database (the wrangler.jsonc database_id here is this session's — replace it)
npx wrangler d1 create hrms-db   # copy the database_id into wrangler.jsonc

npm run db:migrate:local         # apply schema to local D1
npm run seed:generate            # writes seed/seed.sql (founder login, roles, permissions, leave types)
npm run seed:local               # load it into local D1
```

The generated founder login is printed by `seed:generate` (defaults to
`Founder@12345` for the email address seeded in `scripts/generate-seed.ts` —
**change this password after first login**, and edit the email in that script
before regenerating if you want a different founder account).

## Local development

```bash
npm run build:frontend   # builds frontend/dist once
npm run dev               # wrangler dev — serves API + frontend together on :8787
```

For frontend-only iteration with hot reload, `cd frontend && npm run dev` runs Vite on its own
port and proxies `/api` to `:8787` (see `frontend/vite.config.ts`) — run `npm run dev` at the repo
root first so the API is there to proxy to.

## Deploying

```bash
npx wrangler d1 migrations apply hrms-db --remote
npm run seed:remote              # first deploy only — seeds roles/permissions/founder login
npx wrangler secret put JWT_SECRET   # any random 32+ byte string; .dev.vars is local-only
npm run deploy                   # builds frontend, then wrangler deploy
```

## What's implemented

Every phase from the system-overview spec, mapped onto this stack:

1. **Employee master + RBAC** — one employee record everything else reads from; four roles
   (Founder/HR/Manager/Employee) with permissions attached to the *role*, not the person; every
   access change logged with who/when/old/new (`/api/roles`, `access_audit_log` table).
2. **Attendance + biometric import + leave** — punch capture with confidence scoring
   (High/Medium/Low → auto-approve or hold for manager review), 7-day employee correction window,
   manager/HR exception queue, biometric Excel import (upload → auto-map → validate → preview →
   confirm, with de-dupe on re-upload), leave application/approval.
3. **Payroll** — payable-days calculation (present/half/paid-leave/LOP/holidays/overtime),
   configurable PF/ESI/professional-tax rates, preview → lock workflow, payroll cannot lock while
   attendance exceptions are unresolved, bank transfer file generation, arrears for post-lock
   corrections.
4. **KRA/performance, assets, policies, employee queries.**
5. **Recruitment, exit management (resignation → clearance → full & final), analytics dashboard.**

## Known assumptions / things to revisit

- **Biometric file columns** are matched by a generic set of header aliases (User/Card ID,
  DateTime, In/Out — see `src/lib/biometric-import.ts`). Adjust the alias lists once you have a
  real exported file from your device; legacy binary `.xls` isn't supported, only `.xlsx`.
- **TDS (income tax withholding) is not auto-calculated.** Real TDS depends on each employee's
  declared exemptions and projected annual income, which this system doesn't model — HR enters it
  manually per payslip. PF/ESI/Professional Tax rates *are* calculated automatically and are
  editable under Payroll → Statutory Settings.
- **Office-network and geofence detection** are simple exact-IP and radius checks
  (`office_networks` / `work_sites` tables) — add your office's public IP and any field-site
  coordinates before relying on High/Medium confidence scoring.
- **No native mobile app** — field/WFH punches go through the same responsive web app. Offline
  punches queue in the browser's IndexedDB and sync automatically when connectivity returns
  (`frontend/src/offlineQueue.ts`), covering the doc's "must work offline" requirement without a
  separate app.
- **Overtime pay** defaults to 1× the effective hourly rate (no multiplier) — add one if your OT
  policy pays a premium.
