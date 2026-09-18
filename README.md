# Orbiz Operator Management

Repository: https://github.com/imnaulsa/Orbiz-Operator-Management

Mulai setup lewat browser: [Panduan Supabase + Netlify](docs/SETUP-DASHBOARD.md). Source berada di branch `feature/operator-management-v1`; main tetap baseline sampai UAT disetujui.

React + Vite + TypeScript frontend, Supabase Auth/PostgreSQL/RLS, and a Netlify Function for account invitations. GitHub is the intended source of truth. Work branch: `feature/operator-management-v1`; production branch: `main`.

**Status: Deploy Preview UAT candidate, not yet merged to production.** Hosted Auth, PostgREST/RLS, Realtime fallback, desktop/mobile flows and account invitations have been exercised on the development environment. The feature branch remains the only application branch until explicit approval to merge `main`.

## What is implemented

- Email/password login, logout, forgot password/recovery, persistent sessions, profile and active-account guards.
- Super Admin ecosystem switch; managers/staff follow their profile. RLS and table grants enforce isolation independently of UI.
- Netlify invitation function verifies the access token via Auth server, reads caller role/location, and calls a re-authorized database RPC. No real email/password is seeded.
- Partial hourly availability, locked pending/approved slots, rejection/revision, location-scoped approval.
- Permission requests and transactional cancellation of overlapping draft and published hour cells.
- Hourly plotting, grouped operator rows, adjacent ranges, single-hour deletion, drafts.
- Copy source day to multiple targets, preview, merge/replace, per-cell validation and transaction.
- Versioned weekly publication and staff-only published schedule, limited overlap colleague names.
- Append-only effective-date rates, publication fee snapshots, custom/calendar-month/Mitra 21–20 cost periods, combined locations for Super Admin.
- Personal `.xlsx` export with six HR columns, direct RLS database read and pagination.
- Audit records and Realtime location invalidation, with 15-second/focus refetch fallback.

Pending business features outside this release: true overnight shifts and any additional HR logbook columns. See `docs/IMPLEMENTATION-PLAN.md` for explicit decisions and blockers.

## Local setup

Prerequisites: Node 22.12+ (22 recommended), npm, Git. Supabase CLI + Docker are needed for a local full Supabase stack; the PGlite database suite works without Docker.

```bash
npm ci
cp .env.example .env.local
# Fill only the two VITE_SUPABASE_* public settings for frontend development.
npm run dev
```

Open the Vite URL. Without public settings, the login page shows setup incomplete; it does not fake authentication. Vite alone does not serve Netlify Functions. Use Netlify CLI (`netlify dev`) for the invitation endpoint, or test that endpoint on Deploy Preview.

Local `.env*` files are ignored. Never store a service-role key in any `VITE_*` variable, source file, issue, PR, or chat. Put server secrets directly in Netlify's environment settings with Functions scope.

## Supabase setup and migrations

Create a dedicated development project. Use a separate production project. Do not run a destructive `db reset` against a remote project.

Local full stack:

```bash
supabase start
supabase db reset
supabase test db
```

`db reset` is only for a disposable LOCAL database. It applies the ordered migrations and `supabase/seed.sql`. The seed adds Jakarta/Bandung and commented bootstrap instructions; it never creates real identities or hardcodes passwords.

For the development project, link the intended project and review the pending SQL before applying:

```bash
supabase link --project-ref <DEVELOPMENT_PROJECT_REF>
supabase db push --dry-run
supabase db push
```

Execute the two location inserts from `supabase/seed.sql` if seed execution is not part of your remote migration workflow. The frontend will not operate until these rows exist. Migrations do not touch unrelated schemas or disable RLS.

Migration order:

| File | Purpose |
|---|---|
| `202609110001_foundation.sql` | Nine domain tables, enums, FK/check/index/non-overlap, RLS/grants |
| `202609110002_workflows.sql` | Availability, review, leave, plotting/copy/publish/cost RPCs, validation and cancellation audit triggers |
| `202609110003_accounts.sql` | Account management, initial/rate history and immutability |
| `202609110004_live_invalidation.sql` | Tenth table: non-personal location revision signals and Realtime publication registration |

`private` must not be added to Supabase's exposed schemas. Public tables have RLS and authenticated SELECT only. Writes are granted only through explicitly exposed RPCs. The role, location, employment and fee are never sourced from editable Auth metadata.

If `supabase_realtime` is present, migration 004 registers the signals table. Verify `public.schedule_signals` is enabled for Realtime in the project. An approved leave commits its cancellations and signal atomically. A browser with Realtime unavailable falls back to 15-second polling; no claim of instantaneous delivery is made during connection failure.

## First administrator and identities

1. User supplies the real email for Naulsa. Create/invite that Auth identity in the development Supabase dashboard.
2. Copy its Auth UUID privately and insert a `profiles` row with `role='super_admin'`, `location_id=null`, `employment_type='internal'`. Use the commented template in `seed.sql`.
3. Disable public signup in the hosted Auth settings. Use invitation-only accounts.
4. Sign in as Naulsa and invite Hilal as Operator Manager/Jakarta and Samuel as Operator Manager/Bandung once their real emails are supplied.
5. Invite staff with the correct ecosystem, employment type and initial hourly rate/effective date. Each user sets their own password through the invite link.

Auth Site URL must match the intended application origin. Allow recovery redirects for `http://localhost:5173/recovery`, the **specific** Netlify Deploy Preview `/recovery`, and later production `/recovery`. Avoid wide production wildcard redirects. The browser uses Supabase's SPA implicit callback flow, compatible with standard Auth invitation/recovery links, with tokens handled by supabase-js. Use HTTPS in hosted environments.

Configure production-capable SMTP and test delivery, rate limits, expiration, invitation and recovery on the actual development project. Hosted Auth settings must also enforce the desired password policy (UI recovery currently requires 12 characters). No delivery was attempted without actual accounts.

Auth invitations and application profile creation span two services and cannot be one database transaction. If the invitation succeeds but profile creation fails, the function returns HTTP 409 with a repair message; the profileless account has no application access. Admin should inspect the Auth user, repair its profile and initial rate privately, then resend an invitation as needed. Existing identities are not automatically deleted as compensation.

## Environment variables

| Variable | Where | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL` | Frontend build | Development/production public project URL |
| `VITE_SUPABASE_ANON_KEY` | Frontend build | Public anon key for the same project |
| `SUPABASE_URL` | Netlify Functions | Server project URL |
| `SUPABASE_ANON_KEY` | Netlify Functions | Token verification and caller-scoped RPC client |
| `SUPABASE_SERVICE_ROLE_KEY` | Netlify Functions ONLY | Auth Admin invite API |
| `APP_ORIGIN` | Netlify Functions | Exact allowed application origin, including scheme, without trailing slash |

Set development values in the Deploy Preview context and production values in the Production context. For this PR, configure `APP_ORIGIN` to the stable `https://deploy-preview-<PR>--<SITE>.netlify.app` origin. The function can also use `DEPLOY_PRIME_URL` when the runtime provides it with `CONTEXT=deploy-preview`; do not rely on build-only environment variables being available to Functions. Always set `APP_ORIGIN` correctly for each context. A new preview PR may require updating this allowlist value.

The browser sends only its current user token, never the service key. The function validates origin as an additional check; authorization always depends on verified identity and database role/location. The build rejects a service-role JWT or `sb_secret_` value supplied as the public key, and rejects secret-like `VITE_*` names. Netlify builds require both public variables. Local CI can build without credentials to verify compilation.

## GitHub and Netlify flow

The repository is `https://github.com/imnaulsa/Orbiz-Operator-Management`. GitHub is the source of truth; the earlier ZIP is an offline handoff snapshot.

For an existing GitHub project, clone that project, read its instructions, branch from its current main, and copy this candidate into the branch after reviewing conflicts. Do not force-push or replace unrelated source files.

```bash
git switch -c feature/operator-management-v1
# Add the reviewed candidate, validate, and commit.
git push -u origin feature/operator-management-v1
```

For a new empty repository, initialize its main baseline first, then put implementation changes on this feature branch so a meaningful PR diff exists. Do not push implementation directly onto main. The local source candidate already has the requested branch name, and its origin points to the GitHub repository.

1. Connect the intended GitHub repository to Netlify; production branch `main`.
2. Build command `npm run build`, publish directory `dist`. `netlify.toml` supplies Functions location, SPA fallback and security headers.
3. Enable Deploy Previews for PRs and set development environment context. Untrusted external PRs must not receive production secrets.
4. Open a PR from `feature/operator-management-v1` to main. CI runs typecheck, tests, migrations/RLS checks, build and credential checks. No workflow merges or deploys production automatically.
5. After Netlify creates a preview URL, set its exact `APP_ORIGIN` and Supabase recovery allowlist, redeploy preview, and perform `docs/UAT.md`.
6. Only after explicit approval from Naulsa: review/apply production migrations and seed/bootstrap on the intended production project, merge approved PR to main, and let Netlify production build run.
7. For rollback, restore a previous known-good frontend deploy. Database changes require a forward corrective migration; do not blindly reverse migrations or reset a live database. Take a database backup before production changes.

## Tests and types

```bash
npm run typecheck
npm test
npm run test:db
npm run build
node scripts/check-secrets.mjs
```

- `npm test`: 29 unit/server tests (domain grouping/dates/validation/pagination, Mitra 20/21 boundary, Auth Admin boundary, true OOXML export).
- `npm run test:db`: 91 checks against PGlite's PostgreSQL engine with unmodified migrations, real grants/RLS and six synthetic identities (the five required roles plus an overlapping colleague).
- Auth schema/JWT claims are simulated inside this test harness; hosted Auth, PostgREST, Realtime/fallback and Netlify behavior are covered separately by the recorded UAT.
- `supabase/tests/security.test.sql`: additional native pgTAP smoke suite for a local full Supabase stack, supplied but not executed in this environment.
- `src/lib/database.generated.ts` is generated from the migrated PostgreSQL catalog by the database suite. Browser Insert/Update are intentionally `never`; writes use RPCs.
- With a running local Supabase stack, `npm run types:generate` can regenerate the standard Supabase CLI types. Review resulting differences, rerun typecheck/tests, and commit intentional schema/type changes together. The PGlite suite regenerates its catalog-derived version, so use one canonical generation path consistently in CI.
- A sample workbook was opened with openpyxl: six columns, numeric hours, frozen header, and formula-like operator name preserved as text.

## Known limitations / release gates

- Feature branch PR and Netlify Deploy Preview are active. The UAT workbook records 80/80 desktop and 34/34 mobile scenarios passing against the development environment.
- Concurrent manager mutations are serialized per location by `private.lock_location`; keep the two-manager hosted smoke test in future regression cycles.
- True cross-midnight shifts remain disabled. Same-day `24:00` end boundaries work; staff must not silently split overnight shifts until the business rule is agreed.
- Mitra preset follows the confirmed inclusive period: the 21st of the previous month through the 20th of the current month, based on the selected start date in WIB.
- Only the six required HR columns are exported. No invented additional fields or real operators.
- Fee changes cannot be backdated or applied to dates already published; rate history is append-only. A correction workflow or historical payroll locking requires additional agreed rules.
- Cost is a live estimate of active published assignments. Leave/cancellation or deliberate republishing can change working hours; the guarantee is that merely adding a newer rate does not rewrite old salary rates.
- Account location transfer with history requires a separate migration process. Deactivation cancels assignments from today onward and immediately blocks database access.
- Timeline/availability grid renders up to 31 days; narrow the date filter for later days. Cost/export support up to 367 days and paginate database reads.
- Forecast coverage, staffing demand, actual attendance and payroll payout are outside this requested implementation; no synthetic dashboard metrics are presented as real data.
- CI runs `npm audit --audit-level=moderate`. The Vitest path-traversal advisory was removed by upgrading to the patched line; export uses `fflate` and exact OOXML generation, tested independently.

## Technical references

[Supabase RLS and grants](https://supabase.com/docs/guides/database/postgres/row-level-security) and [Vite on Netlify](https://docs.netlify.com/build/frameworks/framework-setup-guides/vite/) informed the database boundary and deployment configuration. See the audit/plan and UAT files for project-specific implementation details.
