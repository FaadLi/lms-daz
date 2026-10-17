# Autosave drafts and installable PWA

Implemented for React/Vite and Cloudflare Pages on 17 October 2026 (Asia/Jakarta). Supabase remains the source of truth. No database migration, RLS, Edge security, payment calculation or Storage architecture changes are included.

## 1. Changed files

| Files | Purpose |
| --- | --- |
| `src/services/drafts.ts` | Shared versioned draft store, validation, debounce, lifecycle flush and clear |
| `src/services/useDraft.tsx` | Reusable React hook and authenticated-user scope |
| `src/components/common/DraftNotice.tsx` | Saved/restored indicator, discard and stale-edit choices |
| `src/components/common/DataUI.tsx` | All RecordForm drafts; fresh server read and version passed to edits; restored subject labels |
| `src/components/admin/CrudPanel.tsx` | CRUD scopes, guardian-create options/identity and persistent payment operation ID |
| `src/components/admin/AdminWorkspace.tsx` | Profile setup/settings drafts |
| `src/components/admin/ChildDetail.tsx` | Child edit, teacher comment, link options and report selection drafts |
| `src/components/admin/MediaManager.tsx` | Caption draft; file remains session-only |
| `src/components/parent/ParentPortal.tsx` | Parent comment draft scoped by one-way token digest |
| `src/App.tsx` | Authenticated user draft provider |
| `src/services/network.ts`, `src/services/hooks.ts`, `src/services/db.ts` | Explicit offline failure, in-flight mutation tracking and batch subject-label lookup |
| `src/services/pwa.ts`, `src/components/common/PwaStatus.tsx`, `src/main.tsx` | Registration, install offer, offline status and safe update UI |
| `src/sw.ts`, `src/utils/pwaPolicy.ts`, `vite.config.ts` | Public-asset-only service worker and generated manifest |
| `public/icon.svg`, `public/icons/pwa-192.png`, `public/icons/pwa-512.png`, `public/icons/pwa-maskable-512.png`, `index.html` | App icons and install metadata |
| `public/_headers` | Cloudflare worker/HTML/manifest revalidation and immutable hashed assets |
| `tests/drafts.test.tsx`, `tests/pwa-policy.test.ts` | Draft lifecycle/security/update and cache policy tests |
| `scripts/pwa-browser-check.mjs` | Isolated Chrome production-build verification, screenshots and cache audit |
| `package.json`, `package-lock.json` | PWA/Workbox and test dependencies; reproducible native optional dependencies |
| `README.md`, `docs/DRAFTS_PWA.md` | Usage, validation and limitations |

## 2. Draft design

Keys use `lms_draft:v1:<encoded-userId>:<encoded-form-and-scope>:<entityId-or-new>`.

Examples:

```text
lms_draft:v1:<teacher-uuid>:subjects:new
lms_draft:v1:<teacher-uuid>:children:<child-uuid>
lms_draft:v1:<teacher-uuid>:schedules%2F<child-uuid>:new
lms_draft:v1:<teacher-uuid>:payments%2F<invoice-uuid>:new
```

Each envelope contains `version`, `updatedAt`, `userId`, `form`, `entityId`, a field-schema fingerprint, `operationId`, `baseVersion`/`baseUpdatedAt` where available, and allowlisted `values`. Create UUIDs, comment UUIDs and payment idempotency IDs survive reopen/refresh; restoring a draft does not create another server request. Guardian+child creation also retains its guardian identity/options.

Updates write after **600 ms** of inactivity. The latest input is flushed synchronously on unmount, `pagehide`, `beforeunload`, hidden visibility, explicit submit and PWA update. Untouched form defaults are not written. Storage quota/access failures are visible and block PWA-triggered reload.

Only scalar form values and string ID arrays are accepted. Credentials/session/token/API-key fields, File/Blob objects and arbitrary objects are excluded. Only declared fields are restored; unknown versions/schema changes and corrupt JSON are ignored safely with a notice. Old incompatible draft content is not automatically submitted or silently mapped to another schema.

Authenticated draft scope comes from the verified Supabase user, with a separate provider/store on account changes. Parent comments have no Auth user, so their scope uses a SHA-256 digest of the private link token. **The raw parent token is never stored in a draft or cache key.** Rotated links intentionally have a different draft scope. If secure digest support fails, parent draft persistence is disabled.

The prohibition on copying credentials applies to the `lms_draft:*` namespace. The existing Supabase SDK manages its own Auth session persistence as before; this feature does not copy or replace that session.

## 3. Supported forms

- Murid, including simultaneous new guardian creation and child-detail edits.
- Orang Tua, Jadwal (including all selected subjects), Absensi and Laporan.
- Pembayaran and invoice input.
- Mata Pelajaran and Template.
- Profile setup and Pengaturan/profile edits.
- Teacher comments and parent comments.
- Photo captions, report selection for upload and private-link options (days/report scope only).

Search/filter inputs are navigation controls and do not create business drafts. Login/password and issued private-link displays are deliberately excluded.

## 4. Create/edit/clear behavior

Opening a matching form restores its unsaved values and operation identity. Cancel, backdrop close, route changes and tab closure preserve the draft. `Buang draft` explicitly removes it and resets the form. A failed/offline save leaves the draft; confirmed server success removes it. Clear failures are surfaced; no success is inferred from merely storing a draft locally.

For Edit, the form fetches the current record from Supabase before enabling editing. A changed record ID, version or update timestamp prevents automatic draft application. The user must select **Pertahankan input draft** or **Gunakan data terbaru**. Keeping the draft rebases its input onto the explicitly reviewed current version; the save still uses the server's optimistic version guard. A later concurrent server change is rejected normally, leaving the draft intact. An unsuccessful latest-record fetch provides retry/close instead of submitting stale data.

## 5. PWA configuration

`vite-plugin-pwa` 2 uses `injectManifest` with a custom worker. Manifest identity/start URL/scope are `/`; name is **Les Report - Manajemen Les Privat**, short name **Les Report**, language `id`, display `standalone`, theme `#4f46e5`, background `#f8fafc`. PNG icons are 192/512 px plus a maskable 512 px icon, with SVG favicon and Apple touch icon.

Production registers `/sw.js` with `updateViaCache: none`. The dev server does not register a worker. Update checks occur on registration, returning online, becoming visible and every 30 minutes while online/visible. A new waiting worker shows an explicit update action. That action flushes all mounted drafts, refuses to interrupt in-flight saves/uploads, activates the worker, flushes once more, then reloads. Another tab never forces a reload. There is no automatic skipWaiting, clientsClaim, background sync or offline replay queue.

Cloudflare remains a static SPA with `npm run build` and output **`dist`**. HTTPS (or localhost for development) is required for install/service-worker support. No Node/SSR server is added to hosting.

## 6. Caching strategy

Only build-time public assets are precached: the fixed index shell, hashed Vite JS/CSS, icons and public manifest. Runtime routing serves only allowlisted same-origin hashed/icon GETs without query/Authorization and the fixed shell for root/index navigation. A private query/hash URL is never used as a cache key; navigation returns the identical static shell.

Supabase Auth/REST/RPC/Edge/Storage, signed URLs, private-link responses, payment responses, mutations, external fonts and arbitrary paths use the network. No sensitive API response is written to CacheStorage. Reconnecting does not submit a draft automatically. Cloudflare headers disable persistent worker HTTP caching, revalidate index/manifest, and allow long-lived immutable caching only for hashed assets.

## 7. Validation

- **48 tests passed across 7 files**, covering debounce/lifecycle recovery, user/create/edit isolation, save success/failure, stale resolution, credential/file filtering, schema mismatch, quota failure and safe update behavior, alongside existing database/security tests.
- Production build, frontend typecheck and lint: passed; manifest and worker emitted to `dist`.
- Supabase development regression: passed actual Auth, CRUD, concurrent schedules/stale updates, payments/idempotency, private Storage/upload/signed reads, private links/revocation/expiry and parent comments. Temporary accounts and data were cleaned; the temporary credential file was removed.
- Chrome production browser checks passed real Auth login; input refresh and close/open restore; mobile/desktop overflow checks at 390x844 and 1280x900; visible offline rejection; explicit successful CRUD removing the draft; actual waiting-worker update preserving typed input; account A/B isolation; no credential copies in draft storage; no sensitive cache entries; no uncaught browser errors.
- Screenshot evidence is ignored under `supabase/.temp/pwa-mobile.png` and `pwa-desktop.png`; browser results are in `pwa-browser-results.json`. Test Chrome profiles are isolated and removed after the run.

Clean `npm ci --include=optional` succeeds from the final lockfile, which includes the missing native dependencies for Windows and Linux. The native-metadata repair retained the dependency versions selected for this change; final lint, typechecks, tests, build and browser checks used that reproducible install. The Chrome protocol successfully installed and launched the PWA in an isolated profile, verified reload after installation, then uninstalled it and removed the profile.

To reproduce browser checks, build, run `npm run preview -- --host 127.0.0.1 --port 4173`, then `npm run test:pwa`. The optional authenticated scenario uses `node scripts/validate-live.mjs --keep-for-ui` followed by `npm run test:pwa -- --authenticated`; always finish with `node scripts/validate-live.mjs --cleanup` and remove `.env.validation`. These commands target the locally configured **development** project. The browser test restores its temporary worker fixture and removes its dedicated Chrome profile.

## 8. Limitations and release notes

- Files/foto are not stored in localStorage or IndexedDB. Uploads still go to `lms_media` immediately. An unfinished/failed file selection must be selected again after reload; caption text is recoverable after reopening the same report.
- Offline shell and drafts do not replace online authentication/record fetching. A full offline reload can show the login/verification state until Supabase becomes reachable. Already open forms can continue saving drafts locally. No offline business transaction synchronization is implemented.
- Browser storage can be cleared/evicted by the user/browser. Blocked/full storage produces a visible warning. Cross-tab drafts use the latest local writer; database writes retain Supabase's version checks.
- Desktop Chrome installability is tested locally. Platform-specific installation UI varies; production HTTPS/domain/header behavior should also be checked after the Cloudflare release. Production deployment is outside this task.
- The build retains Vite's advisory for the existing large application chunk, plus a plugin-internal deprecated bundler-option advisory. Neither is a build failure; unrelated UI refactoring/code splitting was not added.

References: [Vite PWA custom worker](https://vite-pwa-org.netlify.app/guide/inject-manifest), [Chrome PWA test protocol](https://chromedevtools.github.io/devtools-protocol/tot/PWA/).
