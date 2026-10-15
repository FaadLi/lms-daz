# Production CORS fix

Verified against the configured Supabase project on 15 October 2026 (Asia/Jakarta).

## Deployment

`lesreport` is **ACTIVE, version 7**, with `verify_jwt=false` retained. Teacher actions still verify their session through Auth `getUser`; parent actions still use scoped, hashed tokens.

The deployed `ALLOWED_ORIGINS` digest matches exactly:

```text
https://lms.daztore.web.id,http://localhost:3000,http://127.0.0.1:3000
```

Applied with the local-credential wrapper's `origins` command, then its `deploy` command. No database migration command was run. The helper now always preserves the production origin alongside both development origins. Arbitrary origins remain rejected.

## Changed files

| Purpose | Files |
|---|---|
| Exact deployment allowlist | `scripts/supabase-cli.mjs` |
| Frontend RPC/Storage/finalization error context | `src/services/db.ts` |
| Fixed-field, sanitized Edge diagnostics | `supabase/functions/lesreport/index.ts`, `supabase/functions/_shared/diagnostics.ts` |
| Production-origin hosted regression coverage | `scripts/validate-live.mjs` |
| Request-stage errors, HTTP 409, lost-response recovery and log sanitization tests | `tests/upload-diagnostics.test.ts` |
| Configuration/deployment examples and results | `.env.example`, `README.md`, this report |

No schema/migration, RLS design, Storage privacy, payment logic, component layout, CSS, Auth URL or Cloudflare runtime changes were made. Diagnostics do not change the Edge response contract. Secrets remain in local/server configuration.

## Real request validation

| Check | Result |
|---|---|
| Production OPTIONS | 204; `Access-Control-Allow-Origin: https://lms.daztore.web.id` |
| Both development OPTIONS | 204; exact requested allowed origin |
| Unknown-origin OPTIONS and POST | 403; no allow-origin header |
| Anonymous teacher Edge action | 401 |
| Real Auth login/session/logout and two-account RLS isolation | Passed |
| Private-link creation with production Origin | Passed |
| Report scope with a real sibling-report fixture | Only selected report returned; sibling comment and unrelated section rejected |
| Parent token hashes, access count, expiry and revoke | Passed |
| Report photo, teacher avatar and child avatar | Pending metadata, Storage upload, Edge finalize, ready state and signed GET all passed |
| Foreign-user media finalization/signing/download and link issuance | Rejected |
| Anonymous business data | Denied |
| Existing CRUD, attendance, schedule conflict, stale update and payment regression checks | Passed |
| Deployed application diagnostic events inspected | Only recognized action, fixed stage and numeric status; 33 events checked |

The final hosted regression run used the production Origin on user clients and Edge calls. Temporary Auth accounts and their fixtures were cleaned; final inventory found zero validation accounts.

Local checks passed: lint, frontend typecheck, Edge typecheck, **23 tests across four files**, production build to `dist`, and `git diff --check`. The build retains a bundle-size warning above 500 kB; code splitting is outside this fix.

The local Windows installation lacked platform-specific optional packages. These were restored locally at the versions declared by the locked packages; package manifests and lockfile were not changed, and installed locked-package versions matched the lockfile.

## Existing pending upload reconciliation

All five original pending avatars belonged to one owner/child, had valid image signatures and sizes, and had identical SHA-256 content. The target still had version 1 and no avatar.

The newest existing object was finalized through the existing service-only RPC from a trusted local maintenance process, using expected version 1. No user session was impersonated, file reuploaded, or metadata status changed through direct SQL. The target avatar and ready state were verified, as were signed GET and anonymous denial.

Four older identical copies were individually checked for ownership, matching content/caption and absence of references, then removed through prepare-delete RPC, Storage API removal, and finish-delete RPC. Immediate post-delete download verification briefly disagreed with the deleted metadata; a subsequent download returned 400. Cleanup resumed after read-only verification and used Storage listing/catalog absence rather than relying on that immediate GET. The ready avatar was not finalized again.

Final verified inventory: **1 recovered, 4 duplicates removed, 0 deferred, 0 pending, 1 ready asset and 1 stored object** for the affected child. No bulk deletion or reupload was performed. Maintenance scripts and credential-free verification artifacts are in ignored `supabase/.temp/`.

## Preservation and deployment TODOs

Before/after snapshots matched for database function definitions, all public/private/Storage policies, private bucket configuration and remote migration history. Hashes of all ten migration files matched. Auth Site URL/redirect settings also matched their baseline.

- **Keep Cloudflare Pages.** The existing static React/Vite SPA and Supabase backend boundary are unchanged.
- Publish the frontend diagnostic build through the existing Pages pipeline. The deployed CORS/backend fix already serves the existing frontend; this task did not publish Pages assets.
- Review Auth Site URL and redirects separately. They remain `https://daztore.web.id` and `https://daztore.web.id/admin-daz/auth/callback`; no Auth domain change was made.
- Manual browser UI QA remains uncompleted. Hosted HTTP/API tests do not establish a manual UI pass.
