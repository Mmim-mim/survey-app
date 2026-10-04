# Mixed Questions: local development and release gates

This change has NOT been deployed. Existing `.env` points to the shared Aiven database.
Do not run `npm start` for development. No runtime migration is performed.

## Data contract

- System sections retain their existing immutable keys and renderers. Only `custom_<UUID>` sections use Mixed Questions; position/sort order is not identity.
- Defaults: Section -> Category -> Group -> Question. Null at Category/Group means inherit. New Custom Sections default to rating. Question stores its resolved type, source, required flag and choices. Changing a default never updates questions already stored. Editing an inherited question without an explicit new type preserves its resolved type.
- Custom types: `rating`, `checkbox`, `textarea`; legacy `text` remains supported only by the existing paths. New custom text is a textarea.
- Choices are JSON objects `{id,label,is_other,sort_order}`. IDs survive reordering, renaming and year cloning. Removing/replacing choices in the bank never rewrites existing form snapshots.
- `form_json.custom_sections` contains the Section/Category/Group hierarchy and selected questions with `questionId`, `questionBankId`, `questionText`, `question_type`, `required`, `choices`. Existing `sections`, `section2_models`, fiscal year rules and question IDs are preserved.
- `payload_json.mixed_questions = {version:1,sections,answers}`. The server supplies `sections` from the locked Form row; answers contain questionId/value/other. Checkbox value is an array of choice IDs. Selecting Other displays a text field and requires accompanying text, stored in `other` keyed by stable choice ID. Historical submissions remain unchanged and readable in Result. Client-provided types and snapshots are not trusted.
- Edit preserves IDs. Copy creates new question IDs and carries `mixed_copy_source_form_id` so the server can verify historical snapshots even if the bank has changed.
- After submissions exist, confirmed edits may add/remove Custom Questions. Retained question IDs cannot change question text, bank identity, type, choices or hierarchy identity. Removed historical IDs cannot be reused; re-adding a bank question creates a fresh questionId. Server checks historical submission snapshots without rewriting them. Old clients omitting the new field preserve the stored snapshot on Edit.
- Preview sends a canonical Custom snapshot token; the server compares it with the locked Form before validating answers. Changed/missing tokens for Mixed forms return 409 FORM_SNAPSHOT_CHANGED and require reload. Tokens are compared, never trusted as submission snapshots, and are not persisted. Legacy forms without Custom answers remain supported.

## Reporting

- Custom results are returned under `custom_questions`, separate from Section 2 KPI. Existing recursive score/comment walkers skip the new containers.
- Rating: respondent count, mean and sample S.D., grouped by section/category/group/question identity. The existing KPI formulas are unchanged.
- Checkbox: distinct respondents with at least one selected choice are the denominator. Counts and percentages are per choice; percentages can sum above 100%. Optional skipped answers are excluded.
- Text and Other free text appear only in Result for an identified staff/manager/admin session. Anonymous Result and both public dashboard APIs omit new free text. Dashboard/Strategy show Custom numeric/checkbox results separately. No new CSV/Excel export.
- Existing PDF still captures the Result container; the new result block is inside that container. Full PDF pagination/long-content quality requires manual review before release.

## Test safety and local workflows

**Durable UAT: `127.0.0.1:33308/survey_mixed_test`. Never reset, recreate or reseed it.**
Forms 122–125 and Submissions 165–171 are retained UAT data, not disposable fixtures.
Do not run `npm start`: the ordinary environment may point to shared Aiven.

### Non-destructive automated regression

Expand `tests/*.test.js` and run `node --test` with those paths. Baseline before this cleanup: **95/95 passed**.
Pre-commit cleanup verification: **97/97 passed**, including two new safety tests; three mock-browser suites passed. Destructive MySQL/browser integration and the manual Form 125 helper were skipped, not claimed as newly verified.
Corrected Other behavior: **99/99 automated tests passed**. `tests/browser-other-fixed.cjs` tests Admin empty-label auto-fill and respondent required Other text, using in-memory DOM/Form and blocked network; no UAT data is written. Existing snapshot/stale-preview tests remain in the suite. Disposable writing tests remain skipped.
Safety regression also launches destructive entry points WITHOUT opt-in and verifies refusal before connection.
Mock browser suites: `browser-auth.cjs`, `browser-question-bank.cjs`, `browser-legacy-preview.cjs`.
These do not validate Production data. Do not use a broad command that executes every `.cjs` file.

### Disposable integration tests (explicit approval; skipped during cleanup)

Only `127.0.0.1:33308/survey_mixed_disposable` is permitted for Mixed fixture resets.
`--allow-destructive-test` is mandatory; no flag means fail closed before connection.
`test-db-safety.js` rejects UAT, remote hosts, wrong ports, URI/socket/SSL overrides and unknown databases.
Connections verify MySQL 8, server port and selected schema before writes.

- `node tests/init-mixed-db.cjs --allow-destructive-test`: creates the disposable schema only when absent; imports schema only from the verified external backup and applies 002. Never overwrites an existing schema.
- `node tests/mysql-mixed.cjs --allow-destructive-test`: resets disposable fixtures and owns its child HTTP server on **33009**. It refuses a busy port instead of using an existing server. Its state file is `survey-mixed-disposable-state.json` in OS temp.
- `node tests/browser-mixed.cjs --allow-destructive-test`: uses the same disposable data after the API suite, owns a new child server on 33009 and limits browser traffic to that origin. Requires Playwright/Chrome. This is a writing test, never a durable UAT check.
- `node tests/mysql-quarantine.cjs --allow-destructive-test`: uses only `survey_quarantine_regression` at the same loopback endpoint. An existing schema additionally requires `--reset-fixtures` to drop it. Its restored data is sensitive; keep backups/data outside Git with restricted access.

Do not run any of these reset/integration commands during a non-destructive audit. No integration test runs on install/start.

### Manual UAT (preserve current data)

`tests/start-mixed-local.cjs` starts existing UAT on **33008**; it does not initialize/reset data.
`tests/uat-mixed-edit.cjs` is a **Manual UAT Helper** tied to Form 125: it edits the form and creates submissions. Its approval flag is not standing permission; obtain fresh user approval before each use. Never include it in automated suites.
`browser-choice-layout.cjs` and `browser-form-dates.cjs` are separate local UI checks; review their interception/read-only safeguards before running against durable UAT.
Do not restart UAT merely to run regression: in-memory login sessions would be lost.

## Current behavior and recent regression

- Checkbox stores multiple stable choice IDs; reordering preserves IDs. Required applies per question. Admin: checking is_other on a blank/whitespace choice auto-fills “อื่นๆ”; existing labels and IDs are preserved, and unchecking does not erase the label. Respondent: selecting Other reveals a text field and requires nonblank accompanying text (maximum 10000 characters). The is_other flag and choice IDs remain unchanged. Historical Other text remains readable without rewriting any submission. Non-checkbox types do not submit stale choices.
- Textarea stores a string; legacy Text retains its existing path.
- Confirmed Edit can remove/add Custom Questions after responses. Retained questions keep identity/type/choices; re-adding a removed bank question requires a new questionId.
- Historical submissions retain their own sections/answers snapshots unchanged. Result groups by question identity, including removed questions; old/new identities are never combined merely because labels or bank IDs match.
- Stale Preview is rejected with **409 FORM_SNAPSHOT_CHANGED** before persistence.
- GET `/api/forms/:id` formats both `start_date` and `end_date` as `YYYY-MM-DD`, avoiding UTC day shifts in Edit/Copy. Same-day forms remain valid (`end < start` is rejected).
- Index uses Asia/Bangkok fiscal years (October 1 boundary), lists 2566 through current FY + 1 without duplicates, and selects current FY. Form fiscal year still comes from start_date.
- Recent tests: `mixed-edit-history.test.js`, `index-fiscal-year.test.js`, `browser-form-dates.cjs`, `browser-choice-layout.cjs`, and the manual `uat-mixed-edit.cjs`; safety coverage is in `test-db-safety.test.js`.

## Migration 002 and rollback

`migrations/002-mixed-questions.sql` adds nullable default columns to Section/Category/Group; adds nullable type-source/required/choices fields to Question Bank and extends its enum. It changes no existing IDs, forms, submissions, relationships or fiscal years. No Form/Submission table change is needed.

Before Production (separate approval required):

1. Confirm deployed SHA, schema and every writer; review the full diff including previous uncommitted Admin option fixes.
2. Back up schema/data consistently, hash it, restore to an isolated MySQL 8 and verify retained rows/checksums. Review DDL duration/metadata-lock behavior on representative data. MySQL DDL is not transactionally reversible.
3. Check that all six new columns are absent and question_type has the expected old enum. Migration 002 is intentionally not blindly idempotent: partial application must be audited before continuing; never rerun it automatically.
4. Apply the additive migration in an approved window before releasing code. Deploying new code without it will break queries/clone. Mixed-year clones must copy all added fields.
5. Release only after UAT of Admin Structure, choices editor, Create/Edit/Copy, required validation, Other, Result/PDF, dashboards, mobile and concurrent submission/edit. Existing authentication, CSRF, quarantine and legacy forms remain mandatory.

Rollback strategy: Prefer a forward fix and retain additive columns. Never downgrade the enum or drop choices while new data exists. Never restore a whole database over newer submissions. A code rollback must retain the custom snapshot preservation, validation, reporting exclusions and authenticated free-text handling; do not revert directly to a pre-Mixed release that could overwrite new form JSON.

If there is demonstrably no Mixed data and no active writer using the new code, schema removal may be planned separately. First inspect counts of custom questions, non-null added fields, and `custom_sections` / `mixed_questions` in valid Form/Submission JSON. Any nonzero count blocks a destructive down-migration. Restoring a backup to Production or deleting new data is not part of this development task.

## Limits / manual checks

- Section definitions/defaults remain global; Category/Group/Question defaults are fiscal-year scoped, as in the existing data model.
- This release exposes per-question statistics under hierarchical labels, not a new combined Custom-section KPI.
- No Aiven schema inspection/migration/write was performed during Mixed development. Baseline schema comes from the verified September 25 backup; recheck current Production schema before release.
- Browser regression checks UI and the real local submit path. User acceptance, Render HTTPS behavior, large-PDF pagination and production-scale load testing remain release gates.

## Historical integration results (2026-09-30; not rerun during cleanup)

- Earlier Node regression: 91 passed; latest pre-cleanup automated baseline is 95/95. New safety tests extend that baseline.
- Real MySQL 8.0.45 + HTTP: 15 assertion groups passed, including bank edits after Form creation, Copy preserving the historical snapshot, and rejection of Custom IDs in legacy rating payloads (camelCase and snake_case).
- Real Chrome + isolated MySQL: 7 assertion groups passed; Admin Section/Question creation, builder, Edit/Copy identity, required/Other validation, six viewport widths, and Submission.
- Existing mock-browser suites: Login/Logout/CSRF, Question Bank/validation, and Legacy Preview 76/77/86 passed. These do not verify Production data.
- Separate restored MySQL quarantine regression passed: stale IDs, roles, both lock orderings, legacy submissions and fresh clone IDs.
- These group counts are not added to the Node test count. No Production connection, migration, commit, push or deploy was performed.

## Working file manifest

Preserved pre-existing changes: `public/admin-questions.js`, `question-bank-years.js`, `tests/admin-question-option-order.test.js`, `tests/question-bank-years.test.js`.

Runtime: `server.js`, `auth-session.js`, `question-bank-years.js`, new `mixed-bank.js`.

Frontend: `public/admin-questions.html/js`, `public/admin-structure.html/js`, `public/from.html`, `public/index.html`, `public/preview.html`, `public/result.html/js`, `public/dashboard.html/js`, `public/dashboard-view.html/js`, `public/strategy-dashboard.html/js`; new `public/mixed-questions.js`, `public/mixed-ui.js`, `public/mixed-admin.js`, `public/mixed-questions.css`.

Migration/docs: new `migrations/002-mixed-questions.sql` and this document.

Tests/safety: new `test-db-safety.js`, `tests/test-db-safety.test.js`, `tests/mixed-questions.test.js`, `tests/mysql-mixed.cjs`, `tests/browser-mixed.cjs`, `tests/init-mixed-db.cjs`, `tests/start-mixed-local.cjs`; updated `tests/mysql-quarantine.cjs`, `tests/browser-question-bank.cjs`, `tests/section-snapshot.test.js`, and the two pre-existing test files above.

Pre-commit support also includes `tests/disposable-server.cjs`; test-only target values belong in test support, never production configuration.
