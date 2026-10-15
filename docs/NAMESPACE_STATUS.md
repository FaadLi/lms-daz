# LMS namespace normalization

Verified against the Supabase development project on 15 October 2026 (Asia/Jakarta).

## Migration and preservation

New migration: `supabase/migrations/202610150010_lms_namespace.sql`.

The remote history contains `202610140001`–`202610140009` and `202610150010`. SHA-256 checks confirm the first nine migration files were not modified. The new migration uses transactional `ALTER ... RENAME`, preserving table OIDs, row contents, business IDs, FK dependencies, grants, RLS and previously verified behavior. Pre/post-rename snapshots of all 15 LMS tables matched. Unrelated table OIDs/names and bucket settings also matched their baseline.

## Final tables

Public:

- `public.lms_profiles`
- `public.lms_parents`
- `public.lms_children`
- `public.lms_subjects`
- `public.lms_report_templates`
- `public.lms_schedules`
- `public.lms_attendance`
- `public.lms_lesson_reports`
- `public.lms_invoices`
- `public.lms_payment_transactions`
- `public.lms_comments`
- `public.lms_media_assets`

Private:

- `private.lms_report_links`
- `private.lms_audit_logs`
- `private.lms_request_limits`

There was no separate `lesson_photos` table in the actual schema. Report photos and avatars remain in `lms_media_assets`; no extra entity was introduced.

## Related identifiers

All 20 LMS public RPCs and nine private trigger functions now use `lms_`. Constraints, indexes, application triggers, policies and the owned audit identity sequence were renamed with the same prefix. Catalog inspection found zero unprefixed LMS dependency names and no dependent application views.

FKs and RLS still bind the same underlying relations. PL/pgSQL/static SQL bodies, dynamic CRUD allowlists and `TG_TABLE_NAME` comparisons were updated explicitly. Existing audit entity labels were preserved as historical row content; new entries receive prefixed table names.

`auth.users`, `storage.objects`, `storage.buckets` and unrelated application resources were not renamed.

## Final Storage

The only LMS bucket is private `lms_media`, with the same JPEG/PNG/WebP and 5 MB restrictions. New keys use:

- `avatars/<owner>/...`
- `children/<owner>/<child>/...`
- `reports/<owner>/<child>/<report>/...`

The legacy LMS bucket was empty at cutover, so no existing cloud objects needed copying. It was removed through the Storage API after schema preservation verification and Edge deployment. Unrelated buckets remain unchanged, including their existing visibility settings.

For installations with existing files, `scripts/namespace-storage.mjs prepare` copies them through the Storage API and verifies their SHA-256 contents before the database cutover. The migration aborts atomically if an old object has no prepared destination. Existing object keys remain valid in the new private bucket, preserving business metadata references; `finalize` validates copies again before retiring the source bucket. Storage object internals are managed by Supabase, not edited through SQL.

## References updated

| Purpose | Files |
|---|---|
| Database resource resolution, prefixed RPCs and joins | `src/services/db.ts` |
| Physical table versus UI entity types | `src/types/index.ts` |
| Existing UI type imports only | `src/data/forms.ts`, `src/components/common/DataUI.tsx`, `src/components/admin/AdminWorkspace.tsx`, `CrudPanel.tsx`, `ChildDetail.tsx` |
| Trusted API queries and private bucket | `supabase/functions/lesreport/index.ts` |
| Hosted regression tests and anonymous probe | `scripts/validate-live.mjs`, `scripts/probe-supabase.mjs` |
| Preservation and namespace transition | `scripts/namespace-storage.mjs`, `tests/namespace.test.ts`, `tests/database.test.ts` |
| Current/historical documentation | `README.md`, this report, historical banner in `MIGRATION_STATUS.md` |

No layout, CSS, labels, routing behavior or feature set was changed for namespace normalization. UI entity keys are translated to physical `lms_` table names in the data-access layer.

## Validation results

| Check | Result |
|---|---|
| Existing migrations plus namespace migration | Applied successfully through Supabase CLI |
| First nine migration hashes | Unchanged |
| All 15 LMS table names and RLS | Verified in the remote catalog |
| Data/IDs/table OIDs across cutover | Preserved |
| Unrelated application resources | Preserved |
| Anonymous access | Denied |
| Two-account RLS read/write isolation | Passed |
| CRUD, joins, updates and versioned deletion | Passed |
| Duplicate attendance | Rejected |
| Concurrent schedule conflict | One winner; conflicting request rejected |
| Concurrent stale update | One winner; stale request HTTP 409 |
| Payment retries/idempotency/overpayment guard | Passed |
| Parent scope, token hashes, count, expiry and revoke | Passed |
| Parent comment identity/retry protection | Passed |
| Report photo upload/signed read/delete in `lms_media` | Passed |
| Teacher/child avatar upload, attach, cross-account denial and delete | Passed |
| Sharing state across report edits | Preserved |
| Lint | Passed |
| Frontend and Edge typecheck | Passed |
| Unit/database tests | 16 passed across three files |
| Production build | Passed; output `dist` |

Temporary hosted validation data/accounts were cleaned after the checks. Browser UI verification remains uncompleted; API tests do not establish that manual UI QA passed.

## Old-name search and intentional references

The repository source, migrations, tests, scripts and documentation were searched for old table/bucket names. Generated dependency/build folders and Git internals are excluded from the source inventory. Runtime frontend/Edge queries, SQL qualifiers, joins and hosted regression queries contain no unprefixed LMS table/bucket references.

Remaining matches are intentional:

1. Immutable migrations `202610140001`–`202610140009`: the historical schema needed for reproducible upgrades.
2. The namespace migration and `namespace-storage.mjs`: explicit old-to-new mapping and source bucket used only during cutover.
3. `tests/namespace.test.ts`: pre-migration fixtures, preservation/rollback tests and rejection of unprefixed CRUD input.
4. UI `Entity` values, hash routes, portal section keys, DTO aliases and organized path names such as `children`: presentation/protocol keys rather than physical database queries. `tableName()` always adds `lms_` before access, and RPC arguments accept only prefixed physical tables.
5. `docs/MIGRATION_STATUS.md`: clearly marked historical pre-namespace report.
6. Stored historical audit labels and legacy object paths: retained intentionally to preserve data.

## Deployment target

Keep **Cloudflare Pages**: React/Vite remains a static SPA, with trusted APIs on Supabase Edge Functions and PostgreSQL. The namespace change creates no SSR, Node server, filesystem, native runtime or persistent-connection requirement on Cloudflare. Build remains `npm run build` with output `dist`.

The production Auth domain was not changed. Final LMS domain/redirect/CORS configuration and manual browser QA remain deployment TODOs described in the README.
