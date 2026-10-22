# Full Supabase Migration: US → Singapore

> Arsip scope full-project sebelum prioritas diubah menjadi LMS-only. Gunakan [laporan LMS terkini](SUPABASE_FULL_MIGRATION.md) untuk keputusan cutover LMS; blocker aplikasi lain di arsip ini tidak berlaku sebagai blocker LMS.

Readiness assessment: **22 Oktober 2026, Asia/Jakarta**. Bukti final pada sesi ini diambil sekitar 13:21–13:28 WIB; waktu dalam artefak menggunakan UTC.

**Keputusan: NO-GO untuk cutover seluruh aplikasi.** Database dan file staging sudah dipulihkan dan memiliki bukti verifikasi yang kuat, tetapi seluruh dependensi aplikasi belum teridentifikasi, akses host production belum berhasil, dan masih ada perbedaan konfigurasi serta referensi URL yang harus diselesaikan. Phase 2 belum dapat dinyatakan tervalidasi penuh. Phase 3 belum dimulai.

Assessment lanjutan hanya membaca production/API dan menambahkan bukti lokal. Tidak ada backup/restore ulang, pengulangan functional test yang telah lulus, perubahan environment production, perubahan host/firewall/credential, penghentian layanan, cutover, rollback, atau penghapusan resource. Pekerjaan restore dan pengujian target di bawah adalah hasil tahap sebelumnya dalam sesi migrasi yang sama.

## 1. Identitas dan batas pekerjaan

| Komponen | US, tetap production | Singapore, staging |
| --- | --- | --- |
| Nama | `supabase-daztore` | **`db-daz`** |
| Project ref | `zfpfccznrbotrvfqcdzh` | `zfhrzehocewhflytfbyl` |
| Region | `us-east-1` | **`ap-southeast-1`** |
| Organization | faadli's projects, sama dengan target | Sama dengan sumber |
| Dashboard | [US](https://supabase.com/dashboard/project/zfpfccznrbotrvfqcdzh) | [Singapore](https://supabase.com/dashboard/project/zfhrzehocewhflytfbyl) |
| Cron push | Aktif, tidak diubah | Nonaktif |
| Public Auth signup | Aktif | Sengaja nonaktif selama staging |

Target dibuat pada organisasi Free tanpa upgrade paket atau addon berbayar. Password database target baru disimpan terenkripsi di luar repository. Project Singapore lain bernama `Ngaturi` tidak digunakan atau diubah. Nama tujuan pada instruksi pengguna mengalahkan nama lama pada berkas environment migrasi.

Phase 1 selesai sesuai akses yang tersedia: inventaris, backup tervalidasi, dan target tersedia. Inventaris dependensi eksternal tetap memiliki batas akses yang dijelaskan di bawah. Phase 2 telah menghasilkan staging yang dipulihkan, tetapi gate kesetaraan platform dan validasi semua aplikasi masih terbuka.

## 2. Inventaris sumber

Snapshot mencakup **13 schema**: `auth`, `cron`, `extensions`, `graphql`, `graphql_public`, `net`, `pgbouncer`, `private`, `public`, `realtime`, `storage`, `supabase_migrations`, `vault`. Terdapat **91 tabel fisik termasuk partisi dan tabel managed** pada saat inventaris. Partisi Realtime dan log runtime bersifat dinamis.

### Tabel aplikasi dan jumlah record snapshot

| Schema | Tabel | Record |
| --- | --- | ---: |
| public | admin_users | 2 |
| public | faqs | 6 |
| public | feedback_requests | 2 |
| public | feedback_submissions | 2 |
| public | gallery_items | 6 |
| public | landing_items | 20 |
| public | landing_sections | 11 |
| public | lead_messages | 1 |
| public | leads | 1 |
| public | lms_attendance | 7 |
| public | lms_children | 4 |
| public | lms_comments | 2 |
| public | lms_invoices | 2 |
| public | lms_lesson_report_subjects | 7 |
| public | lms_lesson_reports | 6 |
| public | lms_media_assets | 7 |
| public | lms_notifications | 2 |
| public | lms_parents | 3 |
| public | lms_payment_transactions | 2 |
| public | lms_profiles | 1 |
| public | lms_push_subscriptions | 1 |
| public | lms_report_templates | 1 |
| public | lms_schedule_subjects | 9 |
| public | lms_schedules | 4 |
| public | lms_subjects | 16 |
| public | mikrotik_bayar_tagihan | 4 |
| public | mikrotik_users | 6 |
| public | navigation_items | 14 |
| public | order_items | 0 |
| public | order_status_histories | 0 |
| public | orders | 0 |
| public | package_tiers | 3 |
| public | product_categories | 6 |
| public | products | 11 |
| public | rate_limit_buckets | 2 |
| public | site_settings | 1 |
| public | testimonials | 7 |
| private | lms_audit_logs | 112 |
| private | lms_push_deliveries | 1 |
| private | lms_report_links | 7 |
| private | lms_request_limits | 9 |
| supabase_migrations | schema_migrations | 14 |

`public`: 37 tabel/179 record; `private`: 4 tabel/129 record. Seluruhnya masuk pemulihan, termasuk tabel kosong.

### Auth dan resource managed

- Auth: 27 tabel; 2 users, 2 identities, provider email, 6 sessions, 20 refresh tokens, 6 MFA AMR claims, 3 flow states, 1 one-time token, 82 entry migration managed. Tabel Auth lain pada snapshot kosong: audit logs, custom OAuth providers, instances, MFA challenges/factors/recovery sets/codes, OAuth authorizations/client states/clients/consents, SAML providers/relay states, SCIM tokens/users, SSO domains/providers, WebAuthn challenges/credentials.
- Storage: 4 buckets, 24 objects, 74 entry migration managed. Analytics buckets, vector buckets/indexes, dan multipart uploads/parts kosong.
- Realtime: 91 entry migration managed; messages dan subscriptions kosong. Snapshot memiliki partisi tanggal 20–25 Oktober 2026, semuanya kosong.
- Cron: 1 job dan 850 entry `job_run_details` pada snapshot awal. US tetap menjalankan job, sehingga jumlah log selanjutnya dapat bertambah.
- pg_net: 0 queued requests dan 1 response diagnostik pada inventaris awal; tabel runtime ini bukan data bisnis dan tidak diputar ulang ke target.
- Vault: 2 secret bernama `lms_push_function_url` dan `lms_push_dispatch_secret`.
- Roles: 31 role platform, tanpa custom role tambahan pada inventaris. Grants, memberships, default ACL, policies, functions, triggers, constraints, indexes, publications, settings, event triggers, replication slots, dan foreign servers tercatat dalam inventaris terenkripsi. Foreign server: 0.
- Extensions: `pg_cron` 1.6.4, `pg_net` 0.20.3, `pg_stat_statements` 1.11, `pgcrypto` 1.3, `plpgsql` 1.0, `supabase_vault` 0.3.1, `uuid-ossp` 1.1.
- Edge Functions: `test-edge` v8/JWT verification aktif; `lesreport` v14/JWT verification nonaktif; `push-dispatch` v5/JWT verification nonaktif. Nomor versi deployment target tidak harus sama.
- Edge Secrets: 12 metadata secret sumber, termasuk 5 custom secret dan 7 reserved `SUPABASE_*` yang dikelola platform. Nilai custom bukan fingerprint yang dipakai sebagai nilai pengganti.
- Auth settings: site URL `https://daztore.web.id`, allowlist callback `https://daztore.web.id/admin-daz/auth/callback`; SMTP custom tidak terkonfigurasi; Auth hooks tidak aktif. Konfigurasi/template Auth yang dikembalikan API dibandingkan penuh.

### Storage fisik

| Bucket | Akses | File | Byte |
| --- | --- | ---: | ---: |
| catalogs | Public | 10 | 2.206.461 |
| feedback_customer_photos | Private | 4 | 4.426.289 |
| landing_page | Public | 3 | 6.077.216 |
| lms_media | Private | 7 | 15.054.189 |
| **Total** | | **24** | **27.764.155** |

Termasuk 2 placeholder folder berukuran nol. `lms_media` memiliki limit 5.242.880 byte dan MIME JPEG/PNG/WebP; ketiga bucket lain tidak menetapkan limit/MIME khusus pada konfigurasi bucket. Ownership 11 objek dipertahankan; 13 objek tanpa owner tetap tanpa owner.

## 3. Backup, penyimpanan bukti, dan integritas

Lokasi privat, di luar Git:

```text
C:\Users\Surya Pertiwi N\.codex\private\supabase-migrations\zfpfccznrbotrvfqcdzh-singapore
```

- Native PostgreSQL `pg_dump` custom archive, 796.771 byte, 1.255 TOC entries, dengan satu snapshot konsisten. `schema-all.sql` dan `data-all.sql` diekstrak dari archive tersebut. Ukuran database sumber pada inventaris: 18.205.843 byte.
- Backup roles menggunakan `--no-role-passwords`. Metadata Auth/password hash tersimpan dalam backup data terenkripsi; password pengguna tidak direset.
- File Storage fisik dibackup terpisah, dengan manifest bucket/path/size/MIME/owner/version/SHA-256. Dump PostgreSQL tidak dianggap sebagai backup file Storage.
- Source deployed Edge Functions, konfigurasi API, metadata secret, nilai custom secret yang dipulihkan, root key Vault, dan bukti verifikasi disimpan terenkripsi. Plaintext working directory function code berada dalam direktori privat ber-ACL, bukan pengganti backup.
- AES-256-GCM per artefak; key dibungkus Windows DPAPI CurrentUser. ACL direktori dibatasi ke SID pengguna Windows saat ini. Pemulihan backup bergantung pada profil Windows/DPAPI tersebut; salinan offsite atau recovery escrow independen belum diverifikasi.
- Manifest mencatat SHA-256 plaintext dan ciphertext. Audit final setelah download pembuktian source function target membaca **297/297 artefak**, memeriksa tag GCM dan kedua checksum: semuanya valid, tidak ada entry hilang/tidak cocok.
- Pada capture awal, benturan penulisan ledger sudah dideteksi dan direkonsiliasi: endpoint PostgREST yang semula 404 diganti capture 200, dan entry ledger yang tertinggal dipulihkan dari file GCM valid. Penulisan ledger berikutnya menggunakan lock; audit final tidak menemukan mismatch.

Backup menyimpan state sumber, termasuk history managed. Restore selektif melalui mekanisme platform tidak berarti seluruh history operasional diciptakan ulang di target. pg_net memakai tabel runtime/unlogged; response diagnostik tidak diklaim sebagai antrian bisnis yang dipulihkan.

## 4. Hasil restore dan bukti kesetaraan

| Komponen | Bukti dan hasil | Batas |
| --- | --- | --- |
| Data aplikasi, Auth, own migration history | **68/68 tabel sama**, sorted COPY row SHA-256 sama setelah seluruh fixture dibersihkan | Dibandingkan dengan snapshot backup, bukan klaim sinkron terus dengan US aktif |
| UUID/PK akun dan data bisnis | Dipertahankan dalam pembandingan data di atas | UUID internal Storage/Vault berbeda, dijelaskan di bawah |
| Schema aplikasi | 3 schema, 44 relations termasuk sequence, 426 columns, 263 constraints, 143 indexes, 72 policies, 53 functions, 57 triggers sama | Managed schema mengikuti platform target |
| Grants dan RLS | **100 objects effective grants sama**; 6 default ACL sama; 12 custom policies pada Auth/Storage sama | Raw ACL NULL/default bisa berbeda representasi; effective grants yang dibandingkan |
| Foreign keys | **89 FK, 0 orphan**, dengan anti-join terhadap data target | Tidak membuktikan integrasi aplikasi eksternal |
| Migration history aplikasi | 14 entry dipertahankan, migration lama tidak dijalankan ulang | History internal Auth/Storage/Realtime mengikuti versi target |
| Auth | 2 users/identities dan hash password sama; fixture password login lulus | Password asli pengguna tidak diketahui/tidak diminta; OAuth/email delivery/session lama belum diuji end-to-end |
| Storage fisik | **24/24 checksum konten sama**, jumlah/byte/path/MIME/ownership dan konfigurasi bucket sama | Bukan kesetaraan fitur Storage tingkat project |
| Edge Functions | 3 ACTIVE, JWT flags sama; source hasil download target **7/7 file byte-identik** dengan backup source deployed | Dependency remote/platform runtime bukan artefak executable yang dibekukan; alur aplikasi lengkap belum seluruhnya diuji |
| Custom Edge Secrets | **5/5 fingerprint SHA-256 cocok** dengan sumber | Reserved platform secrets menggunakan identitas target |
| Vault | Root encryption key cocok, dua secret dapat didekripsi, dispatch secret cocok Edge, function URL mengarah Singapore | ID/timestamp Vault baru |
| Cron | Nama/schedule/command dipulihkan; job ID 1; target nonaktif, queue pg_net target 0 | Tidak menjalankan scheduler target/real push selama staging |
| Realtime | Config API dan dua publications sama; CDC notification target benar-benar diterima | Satu partisi kosong historis dan metadata role managed berbeda |
| Webhooks | Tidak ditemukan trigger database `supabase_functions/http_request/net.http` pada katalog, Auth hooks nonaktif, foreign server 0 | Tidak membuktikan ketiadaan webhook pada host, router, provider, atau aplikasi yang belum ditemukan |

Lima custom Edge Secrets yang telah pulih: `ALLOWED_ORIGINS`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, **`LMS_PUSH_DISPATCH_SECRET`**. Pasangan public/private VAPID lama diverifikasi secara kriptografis dan dipertahankan. Tidak ada custom Edge Secret dalam inventaris sumber yang masih gagal dipulihkan. Nilai secret sumber tidak diubah.

Nilai Vault dipulihkan melalui fungsi resmi `vault.create_secret`; insert/update langsung ke tabel managed dibatasi platform. Root key dipindahkan melalui API resmi. Tidak ditemukan referensi UUID Vault lama dalam function/cron yang diaudit.

Upload Storage menggunakan API yang didukung, bukan menyalin baris metadata yang tidak memiliki objek fisik. 24 UUID internal object diregenerasi; path dan ownership dipertahankan. Pemeriksaan seluruh nilai kolom data `public/private` tidak menemukan referensi literal ke UUID object Storage lama. Referensi dari integrasi eksternal belum dapat dikesampingkan.

Verifikasi lanjutan read-only membuktikan metadata/version seluruh 24 objek target belum berubah sejak download checksum, dan sumber masih 24 objek tanpa perubahan metadata/version/hapus dibanding inventaris awal. Tidak dilakukan download ulang seluruh file.

### Pengujian yang telah lulus dan tidak diulang

Bukti `verification/functional-checks.json`, 22 Oktober 2026 12:48 WIB: **10/10 lulus**, fixture cleanup selesai, real push tidak dikirim.

1. Auth password login dengan dua akun fixture target dan profile terkait.
2. LMS CRUD/RPC, isolasi antar-owner/RLS, stale version conflict, penolakan anonymous.
3. Landing admin FAQ CRUD, penolakan non-admin, public read.
4. Realtime Postgres Changes untuk notification fixture.
5. CRUD SQL Mikrotik dengan service role dalam transaksi rollback.
6. CORS origin LMS yang dikenal: 204.
7. CORS origin tidak dikenal: 403.
8. Unauthorized push dispatcher: 401.
9. Runtime `test-edge`: 200.
10. Penolakan akses Storage private.

Pengujian tersebut tidak menggantikan UI/browser smoke test setiap aplikasi, proses order/payment/feedback sebenarnya, integrasi router, atau penerimaan push di perangkat nyata. Dispatcher dengan secret valid tidak dipanggil karena target berisi salinan subscription/delivery asli.

## 5. Perbedaan source–target dan pekerjaan tersisa

| Area | US | Singapore | Penilaian/tindakan yang belum dijalankan |
| --- | --- | --- | --- |
| Database SSL enforcement | `true` | `false` | **Blocker keamanan konfigurasi**; siapkan perubahan target dan verifikasi kompatibilitas koneksi sebelum cutover, dengan persetujuan perubahan |
| Storage imageTransformation | enabled | disabled | **Belum setara**; verifikasi entitlement/dukungan target dan kebutuhan seluruh aplikasi; jangan upgrade paket otomatis |
| Storage icebergCatalog | enabled | disabled | Belum setara; tabel analytics sumber kosong, tetapi status fitur tetap harus diselesaikan/disetujui |
| Storage vectorBuckets | enabled | disabled | Belum setara; vector source kosong, bukan bukti semua integrasi tak memakainya |
| Storage upstreamTarget | Nilai sumber | Nilai target berbeda | Routing platform berbeda; tidak disalin membabi buta; perlu konfirmasi perilaku/dukungan platform |
| Public signup | enabled | disabled | Quarantine staging; kembalikan sesuai keputusan cutover hanya pada waktunya |
| Auth/rest JWT/signing keys | Kunci US | Kunci Singapore berbeda | Direncanakan memakai key project target, re-login, refresh koneksi Realtime dan tautan bertanda tangan; portabilitas session lama belum terbukti |
| Auth config lainnya | Konfigurasi sumber | Sama menurut API | Termasuk settings/template yang dikembalikan API; source live Auth config juga tidak berubah sejak snapshot |
| pg_net | 0.20.3 | 0.20.4 | Patch platform berbeda; jangan downgrade managed extension tanpa kebutuhan/dukungan |
| Realtime role | Default source | Tambahan search_path dan 3 memberships pada `supabase_realtime_admin` | Terlihat setelah Realtime provisioning; effective user grants dan CDC lulus. Jangan cabut grant managed agar menyerupai source |
| Realtime publication table | 7 entries | 6 entries | Yang hilang hanya partisi managed kosong `messages_2026_10_20`; logical application publication sama |
| Vault | UUID/timestamps lama | UUID/timestamps baru | Names/descriptions/values dipertahankan, kecuali URL function diarahkan target; nilai/ID lama tetap dalam backup |
| Storage metadata internal | UUID/version/timestamps lama | Dibuat API target | 24 UUID baru; bytes/path/owner/config terverifikasi; external UUID consumers belum diperiksa |
| Cron history | Ada run log lama | Tidak direplay | Diarsipkan; pembatasan sequence managed membuat pemulihan history identik tidak dilakukan |
| Runtime pg_net/Realtime | State server lama | State server baru | Tidak mereplay network request, subscription runtime, atau response diagnostik |

API Realtime, konfigurasi Postgres yang diekspos API, network restrictions, SSO providers, third-party Auth, addons, disk config, dan daftar branches dibandingkan: sama; branches kosong pada keduanya. Respons konfigurasi Postgres berupa object kosong tidak membuktikan seluruh GUC internal identik. Dua algoritma signing key sama (`HS256` previously used, `ES256` in use), tetapi key material/ID berbeda.

GET custom hostname dan vanity subdomain menghasilkan **HTTP 400 pada kedua project**. Kesamaan respons error bukan verifikasi konfigurasi domain. Dashboard/platform admin masih diperlukan. Log drains, read-replica/integrasi organisasi yang tidak tercakup read API yang tersedia, SMTP delivery, dan pengaturan provider eksternal belum mendapat bukti menyeluruh. Tidak ada klaim bahwa resource tersebut pasti kosong.

### Sequence

State berikut dibaca tanpa `setval` tambahan pada assessment ini. Angka sumber berasal dari snapshot sequence yang diambil saat inventaris integrasi; sumber aktif dapat terus maju. `last_value = NULL` pada `pg_sequences` berarti belum ada nilai yang dilaporkan, bukan bukti sequence hilang; final synchronization harus memeriksa `last_value` dan `is_called` langsung.

| Sequence | Snapshot US | Target assessment |
| --- | ---: | ---: |
| auth.refresh_tokens_id_seq | 220 | 227 |
| private.lms_audit_logs_id_seq | 2324 | 2360 |
| public.order_number_seq | NULL | NULL |
| cron.jobid_seq | 6 | 1 |
| cron.runid_seq | 859 | NULL |
| net.http_request_queue_id_seq | 2 | NULL |
| realtime.subscription_id_seq | 47 | 3 |

Sequence Auth/audit maju saat fixture dibuat, meskipun record fixture sudah dibersihkan dan data tabel kembali sama. Sequence platform runtime bukan data bisnis yang perlu direplay. Final synchronization harus memeriksa definisi, ownership/grants, `is_called`, ID maksimum dan nilai terkini. Jangan menurunkan sequence secara otomatis; tetapkan nilai aman berdasarkan state final source, target, dan ID data yang benar-benar ada. Kesenjangan angka setelah fixture dapat diterima hanya bila tercatat; kesetaraan sequence belum dinyatakan penuh.

### Referensi URL yang masih mengarah US

Audit seluruh kolom `public/private` dalam snapshot menemukan:

| Tabel/kolom | Record berisi ref US |
| --- | ---: |
| public.products.image_url | 10 |
| public.landing_sections.image_url | 1 |
| public.leads.product_snapshot | 1 |

Total **11 nilai pada kolom image_url dan 1 snapshot lead**. Nilai tersebut masih asli agar hasil restore identik. Landing source `lib/security/safe-image-src.ts` dan `next.config.mjs` hanya mengizinkan origin Supabase dari environment aktif. Mengganti env saja berisiko menolak gambar US, walau US tetap hidup dan file Singapore lengkap.

Siapkan pemetaan tepat bucket/path US → Singapore dan validasi objek tujuan/checksum sebelum perubahan target. Jangan global replace dump/JSON. Snapshot lead merupakan data historis; perlu keputusan eksplisit apakah URL historis dipertahankan dengan resolver atau ditransformasikan secara tercatat. Simpan before-image dan manifest perubahan. Kesetaraan final harus memisahkan perubahan URL yang disetujui dari perbedaan data yang tidak diharapkan. Tidak ada rewrite URL atau business logic yang dijalankan pada assessment ini.

## 6. Aplikasi, deployment, dan environment cutover

| Aplikasi/lokasi | Bukti hubungan ke US | Environment/tempat yang perlu disiapkan saat cutover | Status |
| --- | --- | --- | --- |
| LMS, `lms.daztore.web.id`, Cloudflare Pages `lms-daz` | Pages env URL/ref dan JS production menunjuk US | Pages production `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`; pertahankan `VITE_VAPID_PUBLIC_KEY`; tinjau kebutuhan `SUPABASE_ACCESS_TOKEN` build tanpa menyalin ke frontend | Dikenal; belum redeploy atau UI QA Singapore |
| LMS workspace `.env.local`, scripts/CLI | URL/ref lokal menunjuk US | Public URL/key, ref/password dan server credential yang dibaca tooling; update konfigurasi project/linked CLI hanya setelah persetujuan | Lokal tetap US pada assessment |
| Landing/commerce `daztore.web.id` | Source `C:\xampp8\htdocs\landing_page`; remote `github.com/daztore/landing_page`; HTML/10 initial JS production memuat ref US | GitHub Actions repository secrets untuk `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; Docker build args; host runtime `NEXT_PUBLIC_SUPABASE_URL`, public key, `SUPABASE_SERVICE_ROLE_KEY`; app config/link Storage | Source ditemukan, host/image/deployment aktif belum diverifikasi |
| Landing Docker deployment | Compose production dan Dockerfile tersedia lokal | `APP_IMAGE`, immutable `APP_TAG`/digest build Singapore; preserve `ORDER_ACCESS_COOKIE_SECRET`, site URL, `RATE_LIMIT_STORE=supabase` | Host env/Compose override/tunnel belum terbaca |
| Salinan `C:\xampp8\htdocs\landing` | Source mirror dan literal ref US dalam debug script | Pastikan apakah source/deployment lain benar-benar aktif; audit local env/build/runtime bila digunakan | Hubungan deployment belum dipastikan |
| Integrasi Mikrotik | Dua tabel, 6 users/4 pembayaran, SQL CRUD target lulus | Belum diketahui: URL/key, DSN DB, router script, scheduler, backend, webhook, atau secret store pemilik integrasi | **Blocker identifikasi dan QA** |
| Pages `rumah-madu-pacet-pos`, `talorys-cbq0j81n-web`, `rumah-madu-pacet`, `landing-page-ngaturi` | Terlihat dalam account Cloudflare; production/preview env kosong | Audit source/config tersembunyi, backend dan dynamic imports sebelum menutup inventaris | Initial JS tidak memuat ref US atau literal tabel Mikrotik; belum dapat dinyatakan independen sepenuhnya |
| Provider/host eksternal lain | Inventaris belum lengkap | OAuth callback, SMTP, webhook consumer, direct PostgreSQL DSN/pooler, S3 endpoint/keys bila dipakai, report/share link, scheduler/router | Membutuhkan konfirmasi pemilik dan akses baca |

LMS Pages production mempunyai 6 nama env pada tabel di atas; preview env kosong. Empat Pages lain juga tidak memiliki env production/preview pada API yang tersedia. Workers list dan zones list kosong pada account/scope token yang tersedia; ini tidak membuktikan tidak ada DNS/worker di account lain.

Cloudflare token yang disiapkan adalah **Account API Token**: account-token verification berhasil. Kegagalan endpoint user-token sebelumnya bukan bukti token saat ini invalid.

Scan HTTP publik dibatasi HTML dan maksimal 12 initial same-origin scripts per situs, bukan semua dynamic chunks/server code. Enam situs merespons 200. LMS dan daztore terbukti masih US; empat Pages lain tidak menunjukkan ref Supabase dalam script awal. Tidak ada literal nama tabel Mikrotik dalam cakupan scan tersebut. Ref tak ditemukan tidak menutup kemungkinan pemanggilan melalui backend atau konfigurasi dinamis.

Inventaris environment belum dapat dianggap lengkap karena integrasi Mikrotik dan runtime host belum tersedia. Untuk setiap aplikasi, public key harus key target yang sesuai project; server secret/DSN hanya di server. Jangan menyalin database password, service role, private VAPID, atau Vault key ke frontend.

### Audit Docker Compose/Nginx, read-only

Berkas diperiksa di `landing_page`: `docker-compose.yml`, `docker-compose.production.yml`, `docker-compose.override.yml`, `Dockerfile`, `docker/nginx/default.conf`, `.github/workflows/ci-cd.yml`.

- Production app memakai `${APP_IMAGE}:${APP_TAG}`, Node production, health check HTTP localhost:3000, restart unless-stopped, network bridge `daztore`.
- Web memakai `nginx:1.30.1-alpine`, published port `8003:80`, proxy ke `app:3000`, mount config read-only, menunggu app healthy.
- Nginx meneruskan WebSocket/forwarded host/proto, menetapkan client IP dari remote peer, dan mengosongkan `CF-Connecting-IP`. Sanitized access log memakai path tanpa query; `/order/` memiliki no-referrer dan error log dinonaktifkan untuk menghindari kebocoran bearer query token.
- `server_name localhost`; routing TLS/domain/tunnel di depan port 8003 belum ditemukan. Ini bukan bukti konfigurasi Nginx yang sedang berjalan.
- Dockerfile melakukan `npm run build` dengan `NEXT_PUBLIC_*`; mengubah runtime env saja tidak memperbarui bundle browser. Next image allowlist juga dibuat dari URL Supabase build.
- GitHub workflow memverifikasi/build dan push GHCR `ghcr.io/daztore/landing_page` untuk branch main. Job deploy SSH secara eksplisit dihapus. Workflow lokal tidak menunjukkan siapa/apa yang memasang image ke production.
- Docker context lokal hanya named pipe Windows/Desktop; tidak ada remote context yang memberi akses host. Daemon lokal tidak dijalankan untuk audit ini.

Tidak menjalankan `docker compose config`/`docker inspect` dengan output env mentah karena dapat menampilkan secret. Setelah akses host tersedia, ambil nama env, label Compose project/working_dir/config_files, image digest, port/mount/status, dan hash konfigurasi secara tersanitasi; jangan dump `.Config.Env`, file env, Nginx include berisi credential, atau log request mentah ke chat.

## 7. Diagnosis SSH dan identifikasi Mikrotik

### Diagnosis SSH yang terbukti

| Tujuan/config lokal | Hasil pemeriksaan `BatchMode`, strict known-host, verbose | Kesimpulan yang dapat dibuktikan |
| --- | --- | --- |
| `100.92.203.33`, user `okee`, port 22 | TCP tersambung; OpenSSH 8.9p1 Ubuntu; key RSA ditawarkan, server tidak menerima; `Permission denied (publickey,password)` | Kegagalan autentikasi key/user, bukan TCP/firewall memblokir seluruh koneksi |
| Alias `ptkpp`, host sama, user `ptkpp` | Hasil sama, key yang sama ditolak | Kedua user belum memberikan akses baca |
| `147.93.80.87`, user `u566227274`, port 65002 | TCP tersambung; banner OpenSSH 9.9; key exchange dan `SSH2_MSG_NEWKEYS` selesai; connection reset sebelum auth methods/key offer | Reset setelah key exchange; tidak cukup bukti menyalahkan key/password/firewall tertentu |

Key yang ditawarkan untuk dua user Tailscale memiliki fingerprint publik `SHA256:K71McN4maJ4e54gBEOPovcXV8ROKgGSuONwjv/h4nrg`. File `id_rsa` tersedia dan memang dicoba. SSH agent Windows berhenti/tidak tersedia; itu membatasi identitas tambahan dari agent, tetapi bukan satu-satunya penyebab karena key disk sudah ditawarkan dan ditolak. Tidak mencoba password interaktif atau mengonversi key PPK.

Belum diketahui apakah salah satu host tersebut benar-benar menjalankan daztore/Mikrotik. Tidak ada perubahan `authorized_keys`, SSH config, known_hosts, ACL host, firewall, service, atau agent.

Administrator perlu memeriksa secara manual:

1. Host production sebenarnya, user/port yang benar, lokasi Compose dan pengelola deployment.
2. Apakah fingerprint publik di atas terdaftar untuk user yang dimaksud; permission/ownership home, `.ssh`, `authorized_keys`; aturan `AllowUsers`/`Match`/account status dan log auth server pada waktu percobaan. Pemilihan perbaikan harus berdasarkan log, bukan tebakan client.
3. Untuk port 65002, log server/provider setelah NEWKEYS: pembatasan akses/account/SSH service atau penutupan koneksi. Hasil client tidak membedakan penyebab server tersebut.
4. Akses session baca yang sah ke host/repository/container; kemampuan membaca metadata Docker dapat memerlukan pengelola host. Jangan mengirim password/private key/token di chat. Pemasangan key atau perubahan firewall/credential/config memerlukan persetujuan terpisah.

### Mikrotik: hasil audit dependensi

- `mikrotik_bayar_tagihan.mikrotik_user_id` → `mikrotik_users.id`, `ON DELETE RESTRICT`; FK valid, tidak ada orphan target. Username unik, role dibatasi `admin/user`, tagihan nonnegatif, pembayaran positif.
- Kedua tabel memiliki RLS **aktif**, `force_rls=false`, tanpa policy pada inventaris. Ordinary row access anon/authenticated tetap terhalang default-deny RLS meski ACL tabel luas. Service role/owner dapat menjalankan SQL fixture; hasil itu tidak membuktikan jalur autentikasi aplikasi sebenarnya.
- Dependensi function/trigger yang ditemukan hanya dua `set_mikrotik_*_updated_at` dan BEFORE UPDATE triggers masing-masing. Tidak ditemukan function bisnis, view, webhook, atau petunjuk nama aplikasi tambahan dari dependensi tersebut.
- Pencarian literal nama kedua tabel/ref sumber pada source lokal yang tersedia mencakup htdocs dan direktori `D:\container docker`, `D:\Docker-SPN_App`, Desktop `docker-prod`, Desktop `Docker-Server`, dengan exclusion dependency/build. Tidak ditemukan source konsumen Mikrotik dalam cakupan pencarian tersebut.
- Log API Gateway sumber 24 jam, 21 Oktober 13:22 sampai 22 Oktober 13:22 WIB, query khusus path mengandung `mikrotik`: HTTP 200, **0 hasil**. Tidak membuktikan aplikasi tidak ada: penggunaan bisa di luar retensi, memakai direct SQL, backend, atau endpoint bernama lain. Log umum memuat traffic landing/LMS dan origin localhost; banyak request tidak membawa referer.

Kebutuhan akses: repository/backend/router scripts dan scheduler Mikrotik, konfigurasi koneksi/secret store tanpa mencetak nilai, identitas deployment, serta pemilik yang dapat menyaksikan read/write bisnis dengan fixture di staging. Status tetap **aplikasi belum teridentifikasi**, bukan migrasi Mikrotik gagal atau data boleh diabaikan.

## 8. Blocker dan kebutuhan manual

| ID | Blocker/keterbatasan | Akses/keputusan yang dibutuhkan untuk menutupnya |
| --- | --- | --- |
| B1 | Akses host gagal; active Compose/image/env/Nginx/tunnel tidak terbukti | Admin host/provider: diagnosis auth/reset, konfirmasi host/user, session baca, lokasi deployment dan image digest |
| B2 | Aplikasi/integrasi Mikrotik tidak teridentifikasi | Pemilik router/backend/repository/scheduler dan uji alur bisnis staging |
| B3 | SSL enforcement dan 3 Storage features/routing berbeda | Admin Supabase/dukungan platform: target config/entitlement setara atau keputusan pengecualian terdokumentasi; tidak melakukan upgrade otomatis |
| B4 | URL Storage US dalam 11 image_url dan 1 snapshot lead | Keputusan pemetaan URL target, preservasi snapshot historis, before-image dan validasi file tujuan |
| B5 | Seluruh environment/callback/DSN/integrasi eksternal belum lengkap | GitHub Actions/repository settings, host env/override dan secret-store metadata, admin provider, inventaris semua consumer termasuk account lain |
| B6 | Production UI/business end-to-end setiap aplikasi, real-device push/email belum terbukti | Owner aplikasi/perangkat test dan staging terisolasi; jangan memakai queue/subscription asli untuk tes dispatcher |
| B7 | JWT/session/signed-link transition belum diverifikasi | Rencana re-login, callback/login browser, PWA cache/update, Realtime reconnect, signed link regeneration; backup session bukan jaminan token portable |
| B8 | Source aktif sejak snapshot, sequence berbeda | Maintenance/fencing semua writer yang disetujui, final sync konsisten, sequence dan delta file terverifikasi |
| B9 | Custom domain/vanity API 400; sebagian resource organisasi/provider tidak terjangkau | Dashboard/admin/provider audit domain, log drains, replica, dan integrasi organisasi; catat hasil eksplisit |

Tidak ada custom Edge Secret sumber yang masih belum pulih. Blocker di atas tidak dapat diselesaikan dengan mengganti secret acak, menyalin fingerprint, atau menganggap semua aplikasi hanya LMS.

## 9. Final synchronization — rencana saja

Seluruh langkah berikut **belum dijalankan**, dan hanya boleh dijalankan setelah blocker diselesaikan serta persetujuan cutover eksplisit diberikan. Perubahan konfigurasi target untuk menyetarakan SSL/fitur juga perlu keputusan tersendiri sebelum eksekusi.

1. Tutup inventaris semua consumer dan tentukan operator tiap aplikasi, deployment, provider, database client dan scheduler. Tetapkan maintenance window serta kriteria abort. Verifikasi recovery backup dengan akses profil DPAPI dan salinan recovery yang dipilih pemilik.
2. Siapkan kandidat Pages/build image Singapore dengan immutable commit/digest dan env mapping tersanitasi, tanpa mempromosikan ke production. Simpan deployment/image/env-reference US sebagai rollback. Pastikan private secret tidak masuk build/browser.
3. Setarakan target platform/config yang disetujui dan uji akses aman. Quarantine target tetap berlaku: cron nonaktif, dispatcher tidak dipanggil dengan data asli, outbound hook/worker tambahan yang ditemukan harus terkontrol. Auth signup tetap staging sampai waktu yang disepakati.
4. Terapkan maintenance **seluruh aplikasi** dan write fence yang dapat dibuktikan, termasuk old tabs/PWA/mobile, direct REST/SQL, Auth flows/token refresh, router, webhook, cron dan workers. Penghentian writer/job US pada tahap ini memerlukan otorisasi; tidak ada job US yang dihentikan sekarang. Jangan mengandalkan perubahan frontend saja untuk menghentikan writer lama.
5. Setelah writer benar-benar berhenti, ambil snapshot/backup final DB, roles/config dan Auth serta manifest Storage final dalam window beku. Backup baru pada langkah ini dibutuhkan untuk delta yang terjadi sejak snapshot awal; jangan menggunakan snapshot lama sebagai final state. Capture sequence `last_value/is_called`, pending jobs, delivery state, schema/migration delta, serta references file.
6. Siapkan restore/sync final hanya ke target, dengan transaksi dan pemeriksaan scope. Sinkronkan insert/update/delete yang sah, password/account/session changes dan relasi. Storage delta harus membandingkan path/version/owner/hash; arsipkan preimage sebelum penggantian/penghapusan target yang memang disetujui. Jangan menimpa resource tak dikenal atau menghapus resource US.
7. Terapkan hanya pemetaan URL yang disetujui pada target, termasuk keputusan khusus snapshot historis. Validasi file tujuan sebelum rewrite. Simpan manifest intentional differences. Verifikasi target sequence aman terhadap ID maksimum; jangan menurunkan counter otomatis atau memutar ulang cron/net history.
8. Bandingkan data final/IDs/FK/grants/RLS/functions/history, konfigurasi, dan jumlah/size/hash seluruh file yang berubah; validasi unchanged files terhadap bukti/version. Perbedaan di luar manifest yang disetujui berarti **abort sebelum promosi**. Pemeriksaan final ini dibutuhkan karena source terus aktif sampai freeze.

## 10. Cutover checklist — belum dijalankan

- [ ] B1–B9 ditutup atau pengecualian yang spesifik disetujui pemilik; semua aplikasi punya penanggung jawab dan smoke test.
- [ ] Persetujuan cutover eksplisit tersedia; maintenance/write fencing dibuktikan; checkpoint backup final lulus.
- [ ] Target SSL/fitur/config, Auth callbacks/templates/provider, Edge Secrets/Vault/JWT flags dan bucket ACL lulus; URL source yang tersisa memang disengaja dan disetujui.
- [ ] Semua env frontend/backend/CLI/DSN/secret-store dipetakan; Pages production dan GitHub build secrets serta host runtime diganti secara terkoordinasi. Gunakan public key dan server key target yang sesuai; pasangan VAPID dan order-cookie secret lama dipertahankan.
- [ ] Promote build Pages dan image Singapore yang sudah diverifikasi. Next/Vite memerlukan build baru. Nginx/domain/tunnel dan image digest aktif dibuktikan dari host.
- [ ] Tangani old sessions: re-login jika perlu, callback browser dan refresh token di project baru, Realtime reconnect, regenerasi signed links bila diperlukan. Service worker/cache dan tab lama tidak boleh melanjutkan write US; update PWA harus mengikuti alur aplikasi yang sudah ada.
- [ ] Restore signup sesuai keputusan; aktifkan scheduler/dispatcher/hook hanya satu sisi setelah final delivery/queue state diperiksa. US scheduler harus sudah berhenti dengan persetujuan sebelum target diaktifkan. Jangan mengulang delivery berstatus terkirim.
- [ ] Jalankan smoke test **LMS, landing/commerce/admin/feedback/order, dan integrasi Mikrotik**, termasuk Auth/roles, CRUD positif/negatif, upload/download public/private, gambar historis, report link, Realtime, rate limits, provider dan push perangkat test.
- [ ] Observasi traffic/write metrics US dan target serta host logs yang tersanitasi. Traffic read aset lama berbeda dari write; tidak adanya hasil log dalam sampel singkat bukan bukti semua writer berpindah. Monitoring mencakup direct SQL dan job/router, bukan API Gateway saja.
- [ ] Jika ada write masih ke US, ketidakcocokan data/file, atau kegagalan aplikasi: hentikan promosi, pertahankan maintenance dan jalankan keputusan abort/rollback yang disetujui. Jangan membuka dua writer production.
- [ ] Simpan US hidup sebagai rollback sesuai instruksi pengguna; tidak ada penghapusan project, rotasi credential production, atau pembersihan resource otomatis.

## 11. Rollback plan — belum dijalankan

**Sebelum Singapore menerima write baru:** hentikan promosi, pertahankan fence dan pastikan target jobs nonaktif. Dengan persetujuan rollback, kembalikan Pages deployment/image/env-reference US yang disimpan, verifikasi browser/cache/client routes, lalu buka kembali satu sumber penulisan US dan scheduler US. Tetap lakukan smoke test setiap aplikasi.

**Setelah Singapore menerima write baru:** mengganti env kembali saja dapat kehilangan transaksi. Freeze writer Singapore dan outbound jobs dengan persetujuan; backup kedua sisi; inventaris delta berdasarkan UUID/relasi dan waktu/checkpoint yang dapat dipercaya. Rekonsiliasi insert/update/delete, pembayaran/order, akun/password/session, file/path/owner, link, audit dan status delivery tanpa mengirim ulang efek eksternal. Susun conflict mapping serta sequence aman dan minta persetujuan rencana rekonsiliasi sebelum mengubah US. Baru setelah konsistensi dibuktikan, pilih satu sisi production dan jalankan smoke test lengkap. Tidak ada merge dua arah atau overwrite dump otomatis.

Tidak menjalankan rollback tanpa persetujuan, tidak menghapus data/objek target sebagai jalan pintas, dan tidak menghapus atau merotasi credential US.

## 12. Jejak bukti dan verifikasi laporan

Helper lokal: `scripts/supabase-full-migration.mjs`. Secret hanya dibaca dari environment lokal yang diabaikan Git dan arsip privat. Jangan menjalankan action mutasi dari helper selama assessment ini.

Artefak privat utama, seluruhnya bersufiks `.enc`:

- `inventory/summary.json`, `table-counts.json`, `sql-*.json`, `effective-permissions.json`, `sequence-state.json`.
- `database/full.dump`, `schema-all.sql`, `data-all.sql`, `roles.sql`, `archive-toc.txt`.
- `storage/manifest.json` dan backup physical objects.
- `verification/data-comparison.json`, `schema-comparison.json`, `effective-permissions.json`, `managed-policies.json`, `relations.json`, `functional-checks.json`, `fixtures.json`.
- `restore/database-completed.json`, `storage-completed.json`, `storage-catalog.stdout`, `functions-completed.json`; `target/configuration-completed.json`.
- `readiness/assessment.json`, `platform-assessment.json`, `ssh-summary.json`, encrypted SSH verbose logs, `source-mikrotik-summary.json`, `source-consumer-summary.json`, `public-consumers.json`, `function-source-comparison.json`.

Assessment tidak mengulang restore atau 10 functional tests. Verifikasi tambahan dibatasi: source code deployed target, metadata/config, readonly SQL, versi object Storage, bounded public bundle/log discovery, dan integritas arsip. Rincian secret, email pengguna, payload bisnis, raw request query, password/hash password, dan key material tidak dimuat dalam laporan ini.

Verifikasi lokal akhir: `node --check scripts/supabase-full-migration.mjs` lulus; audit ledger **297/297** lulus; pemindaian literal credential yang diketahui terhadap helper dan laporan lulus; pemeriksaan whitespace berkas baru dan `git diff --check` lulus. Working tree hanya menambahkan helper dan laporan ini; tidak ada perubahan source/environment aplikasi dan tidak ada commit/deploy production.

Referensi prosedur: [Backup/restore project](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore), [Vault](https://supabase.com/docs/guides/database/vault), [Storage schema](https://supabase.com/docs/guides/storage/schema/design), [Logs SQL](https://supabase.com/docs/guides/observability/advanced-log-filtering), [Log fields](https://supabase.com/docs/guides/observability/log-field-reference). Keputusan readiness di atas berasal dari artefak aktual, bukan dari asumsi bahwa tersedianya API/prosedur berarti resource sudah diuji.

**Status akhir assessment: belum semua aplikasi aman untuk cutover. US tetap production; Singapore tetap staging. Menunggu penyelesaian blocker dan validasi seluruh dependensi sebelum permintaan persetujuan Phase 3.**
