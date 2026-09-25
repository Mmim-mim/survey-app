# Server-side sessions (single instance only)

The server issues a cryptographically random 256-bit session ID after the existing
username/password check. Only its SHA-256 digest is retained as the in-memory key.
The cookie is HttpOnly, SameSite=Lax, Path=/, and Secure when NODE_ENV=production
or RENDER=true. No database schema, new credentials or .env changes are required.

Sessions expire absolutely after eight hours (not sliding). Restart/deploy clears
all sessions. This release requires exactly one application instance/process;
do not use multiple Render instances or clustered workers with this store.
Expired sessions are removed on access/login; the store is capped at 10,000 sessions.

Each protected request reloads user ID, username, role and department from users.
Deleted users lose access; role changes take effect on their next request. Client
role/username cannot grant privileges. Existing plaintext password storage has NOT
been migrated by this work and remains a separate hardening task.

## API and browser contract

- POST /api/login preserves its JSON response and additionally sets a session cookie.
- GET /api/session returns verified display identity, a CSRF token and expiration;
  it is no-store. The CSRF token stays in browser memory, not localStorage.
- POST /api/logout requires session and CSRF, removes the server session and cookie.
- Every HTML page loads auth-client.js. Same-origin API writes get X-Survey-CSRF
  automatically; existing logout links call the server before clearing localStorage.
- Missing/expired sessions return 401; insufficient role or invalid CSRF returns 403.
  Old open pages must be refreshed; previously logged-in users must log in again.
- Login and anonymous POST /api/submissions do not require a preexisting session.
  Cross-origin browser writes are rejected, including login/submissions. Public
  respondent submission remains public; this is not an anti-bot mechanism.

## Authorization boundary

- All /api/admin/* and writes to Section/Category/Group require verified Admin.
  Question Bank/Clone business logic and transactions are unchanged.
- Form writes require session/CSRF. Creation ownership comes from the session;
  edit remains owner-only and delete remains owner-or-Admin, as in existing rules.
- Non-public form lists/dashboard/strategy requests use session identity. Explicit
  public report reads keep the existing public behavior.
- Budget writes require session/CSRF and an ownership lookup from survey_forms.
  The verified owner may update their own form; verified Admin may update any form.
  Browser-supplied username/role never establish ownership. Missing forms return 404.
- Public form/Result/submission reads have not been reclassified in this task.
  Review their data visibility separately before claiming all APIs are private.

## Verification and rollout

Run every tests/*.test.js with node --test (expand paths in PowerShell).
Run tests/browser-auth.cjs and tests/browser-question-bank.cjs with PLAYWRIGHT_MODULE
and BROWSER_CHANNEL configured for the installed browser. Tests use mock APIs/SQL;
they do not authorize writes against Production.

Deploy server.js, auth-session.js, public/auth-client.js and all updated HTML files
together, after approval. Verify one Render instance, Secure cookie over HTTPS,
Login/Logout, 401/403 and CSRF on a separate test environment. Never start the actual
server for write testing against the configured Aiven production-capable database.
No migration is needed. Do not roll back only the server to the former role-trusting
guard. An auth-compatible rollback also invalidates all in-memory sessions.
