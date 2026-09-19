# Production Ops V1 — setup & UAT

Branch: `feature/livestreaming-production-v1`. This is an incremental UAT candidate, not an approved production release. Do not merge to main or run new migrations on the operational database yet.

## Implemented scope

- Existing Operator Management remains accessible, including existing availability, approvals, plotting, cost and legacy logbook.
- New `/production` workspace: Super Admin, Operator Manager, Operator Staff, Host Manager, Host, Admin Sales.
- Admin Sales: manual quotation input (reference, brand, shop account, platform, period, quota hours, selling rate). Hours are entered from the quotation; no PDF/OCR parsing.
- Quota counts all non-cancelled draft/published sessions across the entire quotation period, not only the visible date range.
- Studios with parallel capacity lanes; manual scheduling, daily 24-hour studio timeline, shop/studio/host conflict checks.
- Best hours entered manually. Auto-plot creates one-hour drafts on earliest eligible dates, using one selected studio and up to three manually prioritized hosts. It reports unfilled quota; it does not optimize fairness or campaign/day weighting yet.
- Host weekly availability with click/drag, partial submit, pending/approved lock, reject/resubmit, one-hour cutoff.
- Host Manager approvals scoped to location, leave review, hourly rate history, planned/actual duration and cost summaries.
- Host leave approved before session start removes host from the entire overlapping session(s), preserving studio and live schedule. Manager replots replacement. Partial session splitting is not yet implemented.
- Publish requires approved available host, applicable host rate, and published operator shift covering every hour. Host fee is snapshotted on publish.
- Per-session technical checklist: one assigned operator may submit; assigned host alone submits host checklist and actual duration. Duplicate, future and impersonated checklists rejected server-side.
- Host XLSX export automatically aggregates eligible actual duration per day. Export is generated on button click, not a scheduled email/background download.
- Production Operator XLSX has daily checklist-gated hours. One shift hour is counted only once, and requires checks for all overlapping published lives. Hours without linked live sessions remain pending. The legacy operator logbook remains available during the pilot; do not mix the two exports for payment.

## 1. Create isolated Supabase testing project

Use a **different project** from the one currently used by staff. Do not copy production users, passwords, or personal data into fixtures.

In the new project's SQL editor, run each file separately, in this order:

1. `supabase/migrations/202609110001_foundation.sql`
2. `supabase/migrations/202609110002_workflows.sql`
3. `supabase/migrations/202609110003_accounts.sql`
4. `supabase/migrations/202609110004_live_invalidation.sql`
5. `supabase/migrations/202609190001_production_roles.sql`
6. `supabase/migrations/202609190002_production_ops.sql`
7. `supabase/migrations/202609190003_production_accounts.sql`
8. `supabase/migrations/202609190004_locations.sql`
9. `supabase/migrations/202609190005_planning_master.sql`

The last two migrations are safe to rerun. They guarantee that Jakarta/Bandung reference rows exist, upgrade quotations into general commercial master data shared across locations, and add Brand/Shop ID mapping, Mirror, duration-based best hours, multi-date plotting, and global schedule filtering. `supabase/seed.sql` remains an optional local-development seed and is no longer required for the location rows.

Step 5 must commit before step 6/7 references the new enum values. Do not combine all migration files into one transaction. If the project already has migrations 1–4, only apply the missing files after verifying its migration history.

Create a test user via Supabase Authentication. Copy that user's UUID, then bootstrap its profile in the **testing database only**:

```sql
insert into public.profiles (id, display_name, role, location_id, employment_type, active)
values ('REPLACE_WITH_TEST_AUTH_USER_UUID', 'UAT Super Admin', 'super_admin', null, 'internal', true);
```

Do not enable public self-signup. New roles are assigned by trusted admins, not signup metadata.

## 2. Netlify preview environment

Keep the existing site's production branch set to `main`. Enable Deploy Previews for pull requests (including draft PRs if supported by the site's settings), or a Branch Deploy for `feature/livestreaming-production-v1`.

Set the following values for **Deploy Previews and Branch Deploys only**, leaving Production values unchanged:

| Variable | Value from testing project | Exposure |
|---|---|---|
| `VITE_SUPABASE_URL` | `https://TEST_PROJECT_REF.supabase.co` | Public build |
| `VITE_SUPABASE_ANON_KEY` | Test anon/publishable key | Public build |
| `SUPABASE_URL` | Same testing URL | Server and build validation |
| `SUPABASE_ANON_KEY` | Test anon/publishable key | Server |
| `SUPABASE_SERVICE_ROLE_KEY` | Test service role/secret key | Functions only; never `VITE_` |
| `STAGING_SUPABASE_PROJECT_REF` | Test project ref only | Build and Functions |
| `APP_ORIGIN` | Exact preview origin, without path | Functions |

The branch intentionally blocks Netlify `CONTEXT=production`. It also blocks preview builds when the staging project ref and frontend/backend URLs are missing or inconsistent. This guard cannot independently prove a user-entered project ref is non-production: verify it is the new testing project. Do not paste server secrets into chat or commit them.

If using restricted variable scopes, `SUPABASE_URL` must be available at build time as well as runtime because the build validates both URLs. `SUPABASE_SERVICE_ROLE_KEY` does not need build access.

After the preview URL exists, add its exact `/recovery` URL to the **testing** Supabase Auth redirect allowlist. Use the preview URL for the testing Site URL. Redeploy the branch after setting variables. Missing setup is expected to produce an explicit failed build rather than fall back to production.

## 3. Test accounts and first data

1. Login with the testing Super Admin at `/production`.
2. Host & Cost → invite Host Manager, Admin Sales and test Hosts. Initial fee is mandatory for Hosts.
3. Operator Management → invite test Operator Manager/Staff if required.
4. Sales inputs a quotation for future dates, e.g. 8 hours and best hours `9,10,19,20`.
5. Operator Manager adds a studio, then submits/approves/publishes test operator shifts through the existing operator workflow.
6. Host submits availability for the same dates/hours. Host Manager approves it.
7. Manager generates draft sessions with selected studio and preferred hosts, reviews table/timeline, then publishes.
8. Host sees only assigned published sessions. Operator sees published sessions and can submit technical check only if assigned to overlapping shift hours.
9. During/after the session, submit checks. Host actual duration must lie within the live session and not be in the future.
10. Export host logbook: multiple sessions on one date must yield one total-duration row. Check planned vs actual cost separately.

## UAT acceptance matrix

- Main URL and existing production database remain unchanged throughout testing.
- Host and Sales cannot call operator-management or approval mutations.
- Operator Manager cannot approve host availability/leave or view host fees.
- Host Manager cannot create Admin Sales or elevate to Super Admin.
- Jakarta/Bandung data isolation holds with actual Supabase sessions, not only UI hiding.
- Pending availability cannot be plotted; rejected slots can be resubmitted.
- Auto-plot repeated when quota is full creates zero duplicates.
- Studio capacity and shop account conflicts fail closed.
- Insufficient capacity/availability returns remaining quota; never silently overbooks.
- Host leave approved removes assignments immediately on next refresh (polling 15s), without republishing.
- Another host or manager cannot impersonate Check Host; non-shift operator cannot submit Check Operator.
- Actual duration, rate snapshots and daily XLSX totals agree.
- Refresh/relogin preserves saved data. Test concurrent users before release.

## Edit and delete management (migration 202609190006)

Run `supabase/migrations/202609190006_production_management.sql` on the staging project after migration 005, then refresh the preview.

- Quota tracker: Sales/Super Admin can edit quotations; quota/period must cover existing active sessions. Brand/platform changes require no linked sessions.
- Deleting a quotation permanently removes **all** linked sessions and checks across every location/date, including completed sessions. Derived logbook hours and cost disappear. The UI requires explicit confirmation; no undo is provided. Export records before deleting real history.
- Master Brand/Studio: Super Admin can edit/delete. Referenced masters cannot be deleted. Used Shop IDs and used studio locations cannot change; capacity cannot be reduced below an occupied lane. Brand renames propagate to quotations.
- Schedule Delete mode: select visible rows or select all (maximum 1000), then confirm. Only visible selected rows are submitted. Managers can delete only within their own city; the whole request fails if any ID is missing or unauthorized. Checks are removed and quotation allocation is released.
- Mutations are transactional and audited. Audit records are not a complete backup of deleted checklists. No live data is deleted by installing the migration.
- UAT: exercise edit/cancel, blocked in-use master deletion, quota/date validation, deselect/select-all, filter changes while selected, cancel confirmation, cross-city denial, and logbook refresh after delete.

## Known limits and release gate

- Enabler-style table/timeline is an initial implementation, not a pixel-identical replica; original Enabler screens/source were not available in this repository.
- Whole-hour planning. Split midnight into separate dates; minute-level actual host duration is supported.
- No quotation versioning/carryover workflow yet. Editing updates the existing record; delete is permanent and requires care with completed sessions.
- Host Manager scope is city/location, not arbitrary subteams. All hosts in that location belong to the approval queue for now.
- Reminders, scheduled auto-export/email, automatic best-hour analytics and Fase 2/3 integrations are not part of this implementation.
- Checks are immutable through the UI. Host checklist combines readiness confirmation and end-of-session actual duration; split preflight vs checkout can be added after UAT.
- Hosted Supabase Auth/email/REST/Realtime, real concurrency and Netlify deployment must be tested on staging. Local PostgreSQL-emulation tests do not establish hosted integration success.
- No migration has been executed against a hosted database by this change.

Release only after UAT approval, backup/rollback preparation, and an explicit decision about legacy vs Production Operator logbook cutover. Remove the staging-only production build guard only in the reviewed release change.
