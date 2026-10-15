# Supabase migration status

Historical record before namespace normalization. Current table/bucket names and validation are documented in [NAMESPACE_STATUS.md](NAMESPACE_STATUS.md); unprefixed identifiers below describe the prior state.

Verified on 15 October 2026 (Asia/Jakarta). The existing migration work was continued, with no restart and no production Auth domain change.

## Scope review

All business persistence now goes through Supabase data queries, authorized database RPCs, private Storage, or the deployed `lesreport` Edge Function. Source searches found no remaining demo credentials, dummy business records, reset-to-demo behavior, business `localStorage`/`sessionStorage`, base64 photo persistence, or fake-data fallback.

Legitimate status/relationship choices, day names, formatting helpers, colors, and presentation state remain in the UI. Supabase Auth's own session storage is intentionally retained. Empty database results are shown as empty states; database errors are shown explicitly.

Earlier implementation consolidated admin screens into shared async CRUD components. That is a substantial component/presentation change relative to the original demo; this finishing pass did not introduce another redesign. Visual and interaction parity with the original screens has not been verified. Formatting-only changes in `src/main.tsx` and `ScoreBadge.tsx` were removed. No course, quiz, enrollment, SSR, or Cloudflare backend features were added.

## Files grouped by purpose

| Purpose | Changed/new files |
|---|---|
| Auth and configuration | `.env.example`, `.gitignore`, `src/services/supabase.ts`, `src/App.tsx`, `src/components/auth/LoginView.tsx` |
| Data access and async forms | `src/services/db.ts`, `src/services/hooks.ts`, `src/types/index.ts`, `src/data/forms.ts`, `src/components/common/DataUI.tsx` |
| Admin business screens | `src/components/admin/AdminWorkspace.tsx`, `CrudPanel.tsx`, `ChildDetail.tsx`, `TemplatePicker.tsx` |
| Private media and parent access | `src/components/admin/MediaManager.tsx`, `src/components/parent/ParentPortal.tsx`, `src/utils/whatsapp.ts`, `supabase/functions/lesreport/index.ts`, `supabase/functions/_shared/security.ts`, `supabase/config.toml` |
| Presentation/date helpers | `src/data/presets.ts`, `src/components/common/ProgressChart.tsx`, `src/index.css` |
| Schema and security | The nine SQL files in `supabase/migrations/` |
| Build and deployment | `package.json`, `package-lock.json`, `tsconfig.json`, `eslint.config.js`, `.node-version`, `public/_headers`, `metadata.json` |
| Verification/documentation | `tests/database.test.ts`, `tests/security.test.ts`, `scripts/probe-supabase.mjs`, `scripts/supabase-cli.mjs`, `scripts/validate-live.mjs`, `README.md`, this report |

Superseded demo modules were removed: `AdminDashboard`, `AdminNavigation`, `AdminSettings`, `AttendanceManager`, `ChildList`, `PaymentManager`, `ReportFormModal`, `ScheduleManager`, `WhatsappShareModal`, and the old client token generator `src/services/security.ts`. Their business flows now use the shared components above. Five demo images were removed from `src/assets/images/`.

Prototype dependencies removed include Gemini, Express, dotenv, motion, Lucide, Express types, tsx, and unused autoprefixer. Windows-native build packages remain transitive tooling dependencies rather than unnecessary direct dependencies. TypeScript 6 is used to satisfy the installed ESLint parser's supported peer range.

## Applied migrations

Remote migration history was checked directly after CLI application. All nine versions below are applied:

| Migration | Purpose |
|---|---|
| `202610140001_foundation.sql` | Entities, ownership/FKs, validation/uniqueness, indexes, RLS, atomic CRUD/payment RPCs, private bucket |
| `202610140002_sensitive_operations.sql` | Media lifecycle, trusted hashed-token portal, expiry/revoke/count, rate limits |
| `202610140003_integrity.sql` | Relation/avatar guards, safe versioned deletion, old-avatar cleanup queue, photo limit |
| `202610140004_query_hardening.sql` | Bounded invoice/transaction queries, teacher comment retry validation, parent comment scope guard |
| `202610140005_schedule_integrity.sql` | Serialized protection against overlapping active teacher schedules |
| `202610140006_storage_lifecycle.sql` | Coordinate prepared uploads with metadata deletion |
| `202610140007_conflict_response.sql` | Return HTTP 409 for stale forms instead of triggering serialization retry loops |
| `202610140008_comment_retry.sql` | Reject changed payloads replaying a parent comment UUID |
| `202610140009_parent_query_indexes.sql` | Index token-scoped child history and invoice ledger lookups |

Migrations were applied with Supabase CLI using local privileged environment configuration. No access token, database password, `.env.local`, or server key was committed or bundled into the frontend.

## Schema, RLS, and Storage

The 12 exposed tables are `profiles`, `parents`, `children`, `subjects`, `report_templates`, `schedules`, `attendance`, `lesson_reports`, `invoices`, `payment_transactions`, `comments`, and `media_assets`. Private tables hold report-link hashes, audit records, and rate-limit counters.

- Every exposed table has RLS with owner-only reads. Simple writes require matching ownership; composite FKs reject cross-account relations.
- Sensitive RPCs derive teacher identity from Auth. Parent database RPCs cannot be executed by `anon` or `authenticated`; only the trusted service boundary can invoke them.
- Version checks reject stale edits with HTTP 409. Historical associations and ownership cannot be reassigned improperly.
- Schedule/attendance uniqueness and schedule overlap checks protect concurrent submissions.
- Payment recording locks the invoice, enforces remaining balance, and uses a unique idempotency key. Clients cannot directly insert ledger rows or supply authoritative payment status.
- Storage bucket `lesson-media` is private: JPEG/PNG/WebP, 5 MB/file, maximum 10 photos/report. Upload paths must have owned prepared metadata; reads require owned ready metadata.
- The Edge Function verifies teacher JWTs and image signatures. Parent tokens use secure random bytes, SHA-256 hashes, expiry, revocation, scope checks, and atomic access counts. Signed media URLs expire after 60 seconds.

## Validation results

| Check | Result |
|---|---|
| `npm ci --include=optional` | Passed |
| `npm run lint` | Passed |
| `npm run typecheck` | Passed |
| `npm run typecheck:edge` | Passed |
| `npm test` | Passed: 11 tests across two files |
| `npm run build` | Passed: output `dist` |
| `git diff --check` | Passed |
| Production bundle credential scan | No configured privileged credential values present |
| Hosted schema/RLS/private-bucket inspection | Passed |
| Real login, verified/restored session, logout | Passed via Auth API |
| CRUD updates and versioned deletion | Passed via real database API |
| Two-user RLS read/write isolation | Passed |
| Anonymous table denial | Passed |
| Concurrent stale update | Passed: one winner, other request HTTP 409 |
| Concurrent overlapping schedules | Passed: one winner, duplicate conflict rejected |
| Duplicate attendance | Passed |
| Concurrent payment retry/idempotency and overpayment rejection | Passed |
| Sharing state preserved during report edits | Passed |
| Parent scope, token hashes, access count, expiry, revoke | Passed |
| Parent comment identity and retry validation | Passed |
| Cross-account Storage denial and authorized signed access | Passed |
| Photo metadata/object deletion | Passed |
| Development-origin CORS preflight | Passed: localhost origin, HTTP 204 |

Temporary validation records and Auth accounts were removed after the hosted checks. PostgreSQL unit tests use isolated PGlite with minimal Auth/Storage schema shims; the hosted checks use actual Supabase APIs and the deployed Edge Function.

## Remaining manual checks

Browser tools returned no available browsers. Manual browser UI verification was not completed and is not reported as passed. Verify login/reload/logout, empty states, each CRUD form, reference selection, duplicate-submit feedback, stale-form feedback, avatar replacement, upload failures/recovery, parent portal tabs, signed-URL refresh, responsive layout, keyboard behavior, and visual parity with the original demo screens.

## Deployment TODOs and limits

1. Provide the final LMS domain. Auth currently remains on `https://daztore.web.id`, with redirect allowlist `https://daztore.web.id/admin-daz/auth/callback`; neither was changed.
2. Configure Cloudflare Pages build variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`, Node 22.12+, build `npm run build`, output `dist`.
3. Add exact production/approved preview origins to Edge `ALLOWED_ORIGINS`; currently only localhost development origins are configured.
4. Update Auth Site URL/redirect allowlist only after the LMS domain is provided, and verify the deployed browser flow.
5. Arrange periodic retryable cleanup for abandoned pending media. Manual cleanup and upload-finalization cleanup already exist; unattended pending uploads older than 24 hours still require cleanup invocation.
6. Existing signed media URLs can remain usable for up to their 60-second expiry after token revocation. Revocation blocks new portal requests immediately.

## Cloudflare recommendation

Keep **Cloudflare Pages**. The final frontend is a static React/Vite SPA with hash routing. It has no SSR, runtime filesystem, Node server, native runtime dependency, or persistent PostgreSQL connection. All trusted backend functionality runs in Supabase Edge Functions and PostgreSQL. Build-time Node/native tooling does not need to run on Cloudflare's request runtime. There is no concrete requirement for migrating this application to Workers.

The production bundle and Pages `_headers` artifact were generated successfully. A live Cloudflare deployment and browser verification remain release checks.
