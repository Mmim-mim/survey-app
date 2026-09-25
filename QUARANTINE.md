# Test-data quarantine and online cleanup gates

This release does NOT authorize Production cleanup. No schema change is required.
It applies to this repository's known dataset only: Form 114; Questions 173–288;
Groups 21–60; Categories 7–16. Do not reuse this policy against another database
without reviewing the ID manifest. Never reset AUTO_INCREMENT or reuse these IDs.

## Enable and release

Deploy test-data-quarantine.js, question-bank-years.js and server.js together with
the existing session, fiscal-year and frontend dependencies. Quarantine is enabled
by code, not by a browser parameter or environment toggle. No Admin bypass exists.
Bank reads/mutations reject a year while it contains the quarantined IDs. The year
list hides those sets. Cloning from a quarantined source fails instead of silently
choosing another source. Existing activity fiscal_year=2570 is not itself blocked.

After an approved cleanup removes the old rows, the registry is empty and Admin can
create 2570 from Legacy. New IDs are allowed automatically. The old ID tombstones
and Form 114 restriction remain permanently, protecting stale tabs and direct API
requests. This is the release mechanism; do not disable the whole guard to create
a new year. Removal of tombstones would require a separate reviewed code change.

## References and concurrency

Create/Copy (POST /api/forms) and Edit (PUT /api/forms/:id) use one connection and
transaction from the question_bank_write_lock row's SELECT FOR UPDATE through
validation and INSERT/UPDATE. Responses are buffered until commit; validation
failures roll back. Bank mutations already use the same lock. Cleanup must acquire
this lock FIRST and use the same transaction for checks, deletes and verification.
Incoming nested questionBankId, bankGroupId/group_id, category IDs, model/dimension
IDs and datalist identities are checked even if the year marker is omitted.
questionId is not a Bank ID. Titles and the activity fiscal year are not identities.

Submissions to Form 114 are rejected before any write. Other submissions do not
take the bank lock; their saved form and incoming payload are checked for tombstone
references. Legacy forms 76/77/86 retain the existing calendar-year fallback.
Ordinary real-form responses continue while a form writer is queued behind cleanup.
The API also blocks ordinary edit/delete/budget writes to Form 114 so they cannot
invalidate its approved deletion manifest.

## Deployment is separate from Cleanup

1. With read-only checks, verify that ONLY Form 114 references the target set.
   Stop rollout if any real form has acquired a reference: this guard would reject
   its new responses. The restored backup is evidence for that snapshot, not proof
   about today's live database.
2. Approve and deploy the protection release separately. Verify API errors, real
   and Legacy responses, sessions and CSRF. All writers must use this release;
   stop/update old localhost processes and account for manual SQL clients.
3. Confirm ALL old Render processes and their in-flight requests have drained.
   New code cannot retroactively block requests running in an old process. A
   browser refresh or arbitrary sleep is not sufficient evidence of this gate.
   No cleanup while an old process or uncoordinated writer may still run.
4. Obtain separate approval for online-cleanup verification rules. Old rows must
   remain byte/content-identical, but legitimate new submissions may increase the
   total above 141. Freeze non-submission edits or account for them explicitly;
   the bank lock does not freeze Budget changes or ordinary form deletion.
5. Make/restore a fresh backup; compare IDs/content/references with the approved
   manifest. Acquire the common lock, use current reads, recheck Form 114 has no
   submissions, delete only the 169 rows, verify retained data, then commit only
   on exact success. Abort on drift. This release does not execute this operation.

Keep the transaction short. A global Bank lock serializes form saves and Admin
mutations, so these can wait or time out; real submissions need not wait for it.
Do not take table-wide Form locks: FK checks could block unrelated submissions.
Direct SQL and old code do not honor this application protocol. Do not claim it
protects against those writers. Restore tests alone do not establish live safety.

Rollback the protection only to an auth/quarantine-compatible release. Do not
reintroduce unscoped bank reads or client-trusted roles. Cleanup rollback is a
separate database operation restoring the approved deleted rows with original IDs,
never a whole-database restore over new responses.

## Tests (no Aiven access)

- Run all tests/*.test.js with node --test (expand paths on PowerShell).
- tests/mysql-quarantine.cjs explicitly connects ONLY to 127.0.0.1:33308, verifies
  MySQL 8, restores the immutable backup into a fresh survey_quarantine_test_* DB,
  and runs real SQL through API handlers plus session/CSRF middleware.
- Covers hidden/rejected test sets, direct/stale requests, Create/Edit/Copy, Form
  114 rejection, real/Legacy responses during a held cleanup lock, both lock orders,
  fresh-year cloning and old-ID rejection, and preservation of all retained rows.
- This integration harness does not run Render or exercise its proxy/cookie setup.
