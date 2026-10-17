# Les Report

React/Vite SPA with Supabase Auth, PostgreSQL RLS, private Storage, and a token-scoped Supabase Edge Function. Business records are never stored in browser storage. Supabase Auth alone persists its session.

## Local setup

1. Copy `.env.example` to `.env.local` and set the project URL and publishable key.
2. Install with `npm ci` using Node 22.12 or later.
3. Create teacher accounts through Supabase Auth. The first login asks for the teacher profile. Subjects, templates, guardians, and pupils start empty.
4. Run `npm run dev` (port 3000).

Never put a secret/service-role key, database password, or access token in a `VITE_` variable. Local `.env*` files are ignored by Git.

## Versioned database and function deployment

Supply these local environment variables: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, and `SUPABASE_PROJECT_REF` (the project ID, not its dashboard URL).

```powershell
npx supabase link --project-ref "$env:SUPABASE_PROJECT_REF"
# For a project upgrading the original LMS schema, prepare the private bucket
# and verify object copies before the namespace database migration.
node scripts/namespace-storage.mjs prepare
npx supabase db push
node scripts/namespace-storage.mjs verify
node scripts/supabase-cli.mjs origins
npx supabase functions deploy lesreport
node scripts/namespace-storage.mjs finalize
```

The wrapper `node scripts/supabase-cli.mjs link` and its `push`/`deploy` commands read the same variables from `.env.local`, verify that the target matches the frontend project, and redact privileged credentials from CLI output. The `origins` command always sets the exact production and development allowlist below, so it cannot reset production to localhost-only:

```text
ALLOWED_ORIGINS=https://lms.daztore.web.id,http://localhost:3000,http://127.0.0.1:3000
```

This is backend configuration, not a `VITE_` variable. No wildcard or arbitrary preview origins are accepted. For function-only releases use `node scripts/supabase-cli.mjs origins` followed by `node scripts/supabase-cli.mjs deploy`; do not run database migration commands for CORS updates.

For a completely new project, apply the migrations with `db push`, deploy the function, then run `namespace-storage.mjs finalize` to retire the empty historical bucket. The `prepare`/`verify` steps above are for existing installations. All current LMS tables and RPCs use the `lms_` namespace; the private Storage bucket is `lms_media`. The existing nine migrations are immutable; `202610150010_lms_namespace.sql` performs the namespace transition without replacing business rows.

`verify_jwt=false` allows public parent-token requests to reach the function. Every teacher action explicitly verifies the JWT using Supabase Auth `getUser`; public actions verify a SHA-256 token hash in a service-only database RPC. The standard server-side `SUPABASE_SERVICE_ROLE_KEY` is injected by Supabase into its Edge runtime and is never bundled into the SPA.

## Data integrity

- All exposed tables use owner-only RLS; composite FKs prevent cross-owner relationships.
- Versioned updates reject stale forms with `PT409` (HTTP 409) instead of overwriting newer changes. A serialization SQLSTATE is intentionally not used for application conflicts.
- Guardian + pupil creation is transactional. UUIDs are reused across uncertain request retries.
- Attendance is unique by pupil/date/start time and also by schedule/date.
- Payment recording locks the invoice and uses a unique idempotency key. Payment status and balance are derived from the ledger; paid invoices cannot be edited.
- Historical records with active FK references cannot be deleted. Deactivate pupils/schedules/subjects instead. Remove report photos before deleting a report; its scoped links are revoked and comments removed in the same transaction.
- Templates provide material/plans only. Scores and observed learning outcomes must be entered by the teacher.

## Private media and report links

Uploads are prepared in the database before Storage accepts their path. The Edge Function checks size and image signature before finalizing metadata. Supported formats: JPEG, PNG, WebP; maximum 5 MB, 10 photos/report.

Upload errors identify RPC preparation, Storage upload, or Edge finalization. A failed/lost finalization response is reconciled against metadata before suggesting a retry. Edge diagnostics contain only a recognized action, fixed stage and HTTP status; JWTs, parent tokens, payloads, signed URLs and secrets are never included.

Storage uses the private `lms_media` bucket. New keys are organized as `avatars/<owner>/...`, `children/<owner>/<child>/...`, and `reports/<owner>/<child>/<report>/...`. Existing keys are retained during copy/cutover to preserve references. Signed URLs expire after 60 seconds; an already issued URL may remain usable until expiry after a report-link revocation. The UI offers a refresh action. Parent endpoints check revocation and expiry on every request and return bounded, scoped data without object paths.

Raw report tokens appear only in the issue response and component memory. Reloading loses the raw link; issuing another rotates/revokes the previous one. Single-report links cannot read sibling reports, schedules, invoices, or attendance. Access counters are updated atomically. Public requests have persistent rate limits.

Avatar replacement queues the previous object for deletion. Cleanup is retryable: `Bersihkan Upload` processes queued deletions and abandoned pending uploads older than 24 hours, 50 at a time. Run repeatedly until empty. A periodic production job should invoke the same cleanup logic if teachers may leave abandoned uploads unattended.

## Validation

Multi-subject schedule schema, migration evidence, changed files, validation and rollout notes: [Multi-subject Jadwal](docs/MULTI_SUBJECT_SCHEDULES.md).

```powershell
npm run typecheck
npm run typecheck:edge
npm run lint
npm test
npm run build
```

Tests use isolated PostgreSQL (PGlite) with minimal Auth/Storage schema shims; they are not a substitute for hosted API verification.

`node scripts/validate-live.mjs` validates the configured development project using temporary Auth users, real sessions, two-user isolation, constraints, concurrent updates/payments, private Storage, and deployed Edge endpoints. The management access token must have permission to read server-side API credentials; credentials remain in the Node process. Fixtures are cleaned on completion. `--keep-for-ui` writes only temporary test-account credentials to ignored `.env.validation`; clean these with `node scripts/validate-live.mjs --cleanup` after UI checks.

## Cloudflare Pages

- Build: `npm run build`; output: `dist`; root: repository root.
- Set Node 22.12+ (prefer a maintained Node 22 release).
- Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` as build variables in production and preview environments.
- Configure Supabase Auth Site URL and redirect allowlist for the production domain and explicitly approved preview origins. Password login does not require a callback route; future email-link flows must use allowed URLs.
- Update Edge `ALLOWED_ORIGINS` for those exact frontend origins. Arbitrary preview origins are intentionally rejected.
- Hash routing works with static Pages hosting. No Node backend, SSR, filesystem, or persistent PostgreSQL connection is needed on Cloudflare.

The backend remains on Supabase, so Workers migration is unnecessary.

The production LMS domain is `https://lms.daztore.web.id` and is included in Edge `ALLOWED_ORIGINS`. Separate deployment TODO: the verified Auth Site URL remains `https://daztore.web.id`, with redirect allowlist `https://daztore.web.id/admin-daz/auth/callback`. These Auth values have not been changed; review them in a separate deployment task. Frontend diagnostic changes take effect when the new `dist` is published through the Cloudflare Pages pipeline.

The current namespace and validation record is in [docs/NAMESPACE_STATUS.md](docs/NAMESPACE_STATUS.md). [docs/MIGRATION_STATUS.md](docs/MIGRATION_STATUS.md) records the earlier migration before namespacing. Browser UI verification remains outstanding; API validation does not establish visual or interactive UI parity.

The production CORS deployment, hosted regression results and original pending-upload reconciliation are recorded in [docs/PRODUCTION_CORS_STATUS.md](docs/PRODUCTION_CORS_STATUS.md).
