# Multi-subject Jadwal

Implemented and migrated to the configured Supabase **development** project on 17 October 2026 (Asia/Jakarta). Cloudflare Pages remains the static React/Vite frontend; Supabase Auth, PostgreSQL RLS and the existing Edge Function remain the trusted backend.

## 1. Migration

`supabase/migrations/202610170011_schedule_subjects.sql` is a new, transactional migration. Prior migrations are unchanged.

The migration locks schedules with a 10-second lock timeout, creates the junction table, copies every existing subject association (including original owner and creation time), asserts complete coverage, migrates RPC references, and finally drops the old schedule column without `CASCADE`. Failure rolls back the entire migration. The PostgREST schema cache is reloaded at commit.

## 2. Final schema and security

`public.lms_schedules` retains its ID, child, owner, recurring time, location, status, version and timestamps. It no longer has `subject_id`. No subject array is stored on this table.

`public.lms_schedule_subjects`:

| Column | Definition |
| --- | --- |
| `schedule_id` | UUID, not null |
| `subject_id` | UUID, not null |
| `owner_id` | UUID, not null, FK to `auth.users`, delete restricted |
| `created_at` | timestamptz, not null, default `now()` |

- Primary key `(schedule_id, subject_id)` rejects duplicates.
- Composite FK `(owner_id, schedule_id)` references the matching schedule owner; schedule deletion cascades to its associations.
- Composite FK `(owner_id, subject_id)` references the matching subject owner; subject deletion is restricted while associated.
- Indexes `(owner_id, schedule_id, subject_id)` and `(owner_id, subject_id, schedule_id)` support reads and FK checks. The primary key supports schedule lookup without an owner predicate.
- RLS allows authenticated owner-only reads. Authenticated writes to schedules and associations require the atomic RPC; direct schedule/association DML cannot bypass membership, concurrency or version checks.
- Deferred constraint triggers reject a committed schedule with zero subjects, including privileged SQL writes. Association changes are audited under the schedule ID.

The RPC derives the owner from `auth.uid()`, accepts an explicit field allowlist, validates all subject IDs, rejects duplicates/foreign/inactive additions, locks subjects against concurrent deactivation, and retains schedule ownership/child immutability. Existing inactive associations may be kept or removed during edits; they cannot be newly selected/re-added until activated.

## 3. Changed files

| Files | Responsibility |
| --- | --- |
| `supabase/migrations/202610170011_schedule_subjects.sql` | Schema, data backfill, constraints, RLS, atomic RPC and parent RPC migration |
| `src/services/db.ts` | Nested schedule reads and atomic schedule saves |
| `src/utils/schedules.ts` | Hydrate all edit selections and compact subject labels |
| `src/types/index.ts`, `src/data/forms.ts` | Multi-subject field configuration |
| `src/components/common/DataUI.tsx` | Searchable, paginated active-subject picker with removable selections and required validation; schedule reference labels |
| `src/components/admin/CrudPanel.tsx` | Schedule card labels, also used by child detail |
| `src/components/admin/AdminWorkspace.tsx` | Dashboard/upcoming schedule labels |
| `src/components/parent/ParentPortal.tsx` | Parent schedule labels |
| `tests/database.test.ts` | Backfill and database/business/security regressions |
| `tests/schedules.test.tsx` | Edit hydration, form rendering and compact labels |
| `scripts/validate-live.mjs` | Hosted multi-subject and existing system regression tests |
| `scripts/schedule-migration-check.mjs` | Read-only pre/post data fingerprint and stored-function reference audit |
| `scripts/supabase-cli.mjs` | Add migration dry-run action `plan` |
| `README.md`, `docs/MULTI_SUBJECT_SCHEDULES.md` | Entry point and implementation/validation report |

## 4. Queries, RPCs and dependency audit

- New `lms_save_schedule(p_data jsonb, p_version integer default null)` saves one schedule and replaces its subject set in one transaction. `subject_ids` is a transient RPC parameter only. Existing creation UUID retries are accepted only when typed schedule values and the unordered subject set match; changed retries/stale versions return `PT409`. Patch-only versioned updates retain the subject set.
- `lms_save_record` routes schedule writes to that atomic RPC. Other entities retain their prior implementation.
- `db.list('schedules')` and `db.get('schedules', id)` fetch child and all subject associations in one nested PostgREST query. Child detail and dashboard reuse these reads; no per-schedule/per-subject requests are added.
- `lms_parent_request` aggregates all subjects inside the existing bounded, token-scoped schedule query. The Edge Function forwards that response unchanged, so no Edge deployment is needed. Other portal sections and token/revocation behavior are preserved.
- Existing `private.lms_schedule_conflict_guard` and schedule uniqueness rules remain in force. Multiple subjects create no additional schedules or sessions.
- Attendance remains unique by schedule/date and child/date/start time. No subject field or per-subject attendance records are added.
- Lesson reports retain their independent, required **single** `subject_id`, templates and one-report-per-schedule/date rule. Reports previously did not require the report subject to equal the schedule subject; that behavior remains intact, including when schedule subjects change.
- `lms_dashboard_stats` counts schedules/sessions directly and requires no schema-related change. Deletion remains versioned and respects historical attendance/report references.

Final source and stored-function audit: no runtime query reads the removed schedule column. Intentional old references remain only in immutable historical migrations, the new migration's backfill/query replacement/drop, legacy test fixtures and explicit absence checks. Junction-table, report and template `subject_id` fields remain valid.

## 5. Existing-data migration evidence

Supabase CLI dry run selected only `202610170011_schedule_subjects.sql`; the push then applied exactly that migration. Remote history contains all eleven migrations.

| Evidence | Before | After |
| --- | ---: | ---: |
| Existing schedules | 2 | 2 |
| Existing subject associations | 2 legacy column values | 2 junction rows |
| Existing attendance | 1 | 1 |
| Existing lesson reports | 3 | 3 |
| Schedules without subjects | 0 | 0 |
| Ownership mismatches | 0 | 0 |
| Old schedule `subject_id` column | 1 | 0 |

Whole-row fingerprints for schedules (excluding the removed column), attendance and reports matched exactly. Fingerprints of `(schedule_id, subject_id, owner_id, created_at)` also matched. Schedule IDs, versions, timestamps and associated history were preserved. Local snapshot files are ignored under `supabase/.temp/schedule-subjects-{before,after}.json` and contain only counts/hashes, not credentials or record bodies.

## 6. Validation

- Lint and frontend typecheck: passed.
- Edge Function typecheck: passed.
- Tests: **36 passed across 5 files**, including 18 database tests.
- Production build: passed; Vite emitted its bundle-size advisory (JS chunk about 569 kB before gzip).
- New database cases cover multiple-subject create/retry, add/remove edit, stale updates, duplicate/empty/null/missing/foreign/inactive rejection, RLS and composite FKs, rollback after a deliberately failed relation insert, historical inactive selections, overlap rejection and adjacent-session acceptance, one attendance/session, unchanged single-subject reports, parent subject aggregation, minimum membership and cascading deletion.
- Form tests verify every joined subject hydrates into edit selections, inactive history remains removable, and compact labels render correctly.

Hosted Supabase regression: **passed**, including actual Auth login, two-subject create/nested select, subject replacement, duplicate/empty/cross-owner denial, relation RLS, one attendance, concurrent overlapping schedule rejection (one winner), concurrent stale update rejection (one `PT409`), unchanged report sharing, payments, private media, parent token scope, all subjects through the live Edge portal, comment retry, token revocation/expiry and logout. Both temporary accounts and all test data were cleaned automatically. The final read-only fingerprint audit confirms that only the original 2 schedules, 2 relations, 1 attendance and 3 reports remain.

## 7. Release considerations

This task applies the migration to development and produces a production frontend build. A Cloudflare production deployment is not part of this change. Because the legacy column is removed, production rollout must coordinate the database migration and frontend release; cached old clients must reload. Use a maintenance window if old clients could write during cutover. The lock timeout fails safely instead of waiting indefinitely.

No browser interaction/visual QA is claimed by the form-rendering tests. Check the picker on desktop/mobile before the production release. Bundle splitting is an existing build advisory and was kept outside this feature's scope.

Implementation references: [PostgreSQL deferred constraint triggers](https://www.postgresql.org/docs/current/sql-createtrigger.html), [Supabase nested joins](https://supabase.com/docs/guides/database/joins-and-nesting).
