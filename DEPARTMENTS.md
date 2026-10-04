# Department Management — Phase 1

Scope: Departments master/API, Admin Departments, Admin Users only. Existing Form
Builder/Question Bank department lists, Manager scope, dashboard/report formulas,
respondent `profile.dept`, form snapshots and submissions are unchanged.

## Data model and compatibility

Migration `003-departments.sql` is additive: departments, name aliases, nullable
`users.department_id` and RESTRICT foreign keys. No automatic name/ID backfill,
production seed, cascade delete, or historical row rewrite is included.

Names are trimmed, limited to 255 characters, and unique using the existing
utf8mb4_general_ci semantics. Aliases reserve old names after rename, preventing
another identity from reusing them. User `dept_name` remains its saved snapshot.
An unchanged current department remains valid even if inactive/legacy. New
assignments accept only active master IDs (or current names for older clients).
An empty department remains optional as before.

Successful assignment locks the master row and sets `first_used_at` in the same
transaction as the user write. This permanent marker survives user deletion.
Delete locks the same row, checks the marker and current legacy user/form name
references, then removes aliases and the unused master in one transaction.
Imported legacy departments must be marked used. Rename does not update users,
forms or submissions. Staff/Manager permissions remain based on the existing
name fields; Phase 1 does NOT unify historical/new names in Manager filters.
Therefore a rename is not an organizational reassignment or a permission migration.

The coordinated usage guarantee in this phase covers Admin User assignments.
Unmodified Form Builder writes do not use Department IDs or this lock; current
form-name references are only an additional conservative deletion check. It is
not a claim of cross-system historical usage tracking for all old free-text data.
Before extending this master to Forms, define that usage/locking policy explicitly.

## API/security

- `GET /api/departments`: authenticated users, active only, sort_order/name/ID.
- `GET /api/admin/departments`: Admin, all states and `can_delete` hint.
- `POST /api/admin/departments`: Admin + existing session CSRF.
- `PUT /api/admin/departments/:id`: Admin + CSRF, name/status/order.
- `DELETE /api/admin/departments/:id`: Admin + CSRF, server rechecks eligibility.

The approved UI is retained. Add/Edit/Delete use the APIs; used deletion returns
a Thai explanation directing the Admin to deactivate instead. Unknown/inactive
users remain visible, with their exact current value, rather than being filtered out.

## Local preparation and testing

`node tests/apply-departments-local.cjs --apply-local` explicitly guards the existing
loopback UAT target, checks schema absence, then applies Migration 003 once. It
adds only the four authorized historical names marked used. Never run it as a
production seed. A partial/existing migration stops; inspect rather than retry DDL.

- Unit/regression: run `node --test` with the explicit `tests/*.test.js` file list.
- Browser mock: `node tests/browser-departments.cjs` (Playwright/Chrome; all requests intercepted).
- Local MySQL/API: `node tests/mysql-departments.cjs --rollback-only-local`.
  This helper starts one outer transaction; actual route transactions use
  savepoints, and ALL test rows roll back. It never resets fixtures or writes
  existing Users/Forms/Submissions. MySQL AUTO_INCREMENT counters may advance.
  Auth middleware is independently covered in the non-database tests.
- Existing browser-auth, browser-question-bank, browser-legacy-preview and
  browser-other-fixed are mock-only regressions.

Do not run reset/destructive integration helpers against durable UAT data.

## Production is not approved

Before production: back up, inspect schema/collation/engine and existing names,
approve the exact legacy import with `first_used_at` set, rehearse additive DDL,
and coordinate code rollout after schema preparation. MySQL DDL auto-commits.
Do not copy Local UAT/prototype data. No deployment/startup auto-migration exists.
Rollback code only while retaining additive tables/columns and new master data;
do not drop them. Old code may not display newly introduced departments, so a
forward fix is preferable after new user assignments. Stage/Commit/Push/Deploy
require separate approval.
