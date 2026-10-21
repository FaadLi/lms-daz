# Notifikasi komentar parent — LMS-DAZ

Implementasi dan validasi: 21 Oktober 2026. React/Vite + Cloudflare Pages, Supabase Auth/RLS/Edge, routing hash, draft dan strategi cache PWA tetap digunakan.

## Status deployment

- Migration **202610210014_comment_notifications.sql** sudah diterapkan pada project terkonfigurasi `zfpfccznrbotrvfqcdzh`; migration historis tidak diedit.
- Edge Function **push-dispatch** sudah dideploy dengan `verify_jwt=false` dan autentikasi khusus backend di handler. `lesreport` dan validasi token parent tidak diubah.
- `lms_notifications` sudah masuk publication `supabase_realtime` dengan RLS penerima.
- **VAPID, dispatch secret, dua secret Vault, dan jadwal cron belum dikonfigurasi.** Dispatcher menolak pemanggilan tanpa secret; tidak ada pengiriman Web Push produksi yang diklaim berjalan.
- Cloudflare Pages belum diredeploy. Build lokal siap di `dist`; environment public VAPID perlu diisi sebelum build rilis.

## Alur dan schema

1. Parent mengirim UUID komentar melalui `lesreport` dan `lms_parent_request` existing. Pemeriksaan hash token, expiry/revoke, owner, child, report scope, rate limit, dan perlindungan replay tetap berlaku.
2. Trigger `AFTER INSERT` hanya untuk komentar parent membuat satu `lms_notifications` berdasarkan `owner_id` komentar, bukan penerima dari browser. Unique `comment_id` mencegah duplikasi. Komentar, notifikasi, dan outbox commit/rollback bersama. Tidak ada backfill/push untuk komentar historis.
3. Perangkat yang telah terdaftar saat komentar dibuat memperoleh satu delivery di `private.lms_push_deliveries`, unique `(notification_id,subscription_id)`. Berlangganan kemudian tidak mengirim backlog komentar lama.
4. Cron backend menguras outbox sesudah transaksi selesai. Gangguan provider tidak memengaruhi penyimpanan komentar atau menghapus notifikasi database.
5. Notification Center memakai satu feed terbaru (20 record + total unread), Realtime recipient filter khusus INSERT/UPDATE dan fallback refresh 60 detik saat visible. Mount/focus melakukan recheck. Tidak ada fetch komentar per notifikasi. Tidak berlangganan DELETE karena [RLS/filter delete Realtime memiliki batasan](https://supabase.com/docs/guides/realtime/postgres-changes).
6. Klik membuka `/#/children/<uuid>?tab=comments&notification=<uuid>` setelah verifikasi sesi existing. RPC mark read hanya berlaku untuk penerima. Status dibaca disinkronkan dengan `read_by_teacher_at` dan tombol Tandai Dibaca di tab Komentar.

Tabel baru:

| Tabel | Kolom/aturan utama |
|---|---|
| `public.lms_notifications` | UUID, user_id, unique comment_id, child_id, type, judul/body generik, read_at, created_at; FK owner/comment/child; indeks recent dan unread; SELECT hanya penerima |
| `public.lms_push_subscriptions` | UUID, user_id, unique endpoint, p256dh, auth, created_at, updated_at; indeks user; SELECT hanya pemilik; mutation melalui RPC authenticated; maksimal 20 perangkat per akun |
| `private.lms_push_deliveries` | UUID, notification/subscription FK, state, attempts, next_attempt_at, lease_id, leased_until, last_status, finished_at; tidak dapat diakses browser/anon |

Tidak mengubah tabel managed Supabase, RLS existing, namespace bisnis, aturan payment/idempotency, atau optimistic concurrency laporan. Semua fungsi baru membatasi grants; fungsi claim/finish hanya `service_role`.

## Web Push, retry dan kerahasiaan

Worker memakai **npm:web-push@3.6.7**, type **@types/web-push@3.6.4**, dan dependency terkunci di `supabase/functions/deno.lock`. Tidak ada library atau layanan notifikasi frontend tambahan. Browser tetap memakai PushManager/Notifications standar dan provider bawaan browser.

- VAPID private key hanya Edge secret. Browser hanya memperoleh public key.
- Dispatcher membutuhkan `x-lms-push-secret` acak, terpisah dari JWT guru/parent. Tidak menerima user_id atau tujuan dari body; hanya mengambil outbox terpercaya. Request dengan Origin ditolak dan tidak memiliki browser CORS allowlist.
- Endpoint subscription dibatasi ke host layanan push FCM, Mozilla, Apple dan Windows yang diizinkan; HTTPS saja, tanpa userinfo/port/redirect. Kunci dan ownership divalidasi. Menambah dukungan provider baru memerlukan review allowlist SQL dan Edge.
- Claim atomik menggunakan row lock `SKIP LOCKED`, lease acak 2 menit, maksimum 25 delivery per invocation dan 5 request bersamaan. Finish harus cocok dengan lease. Delivery sukses tidak dikirim ulang oleh invocation/retry berikutnya.
- Maksimum **3 attempt**. Timeout/network error, HTTP 408/429/5xx dijadwalkan ulang dengan backoff 60 lalu 120 detik, diperiksa cron. HTTP 404/410 menghapus subscription. Error permanen berhenti. Notifikasi yang telah dibaca atau berumur >24 jam tidak dikirim sebagai pekerjaan baru.
- Provider TTL **3600 detik**; topic dan notification tag stabil per event, `renotify:false`. Jika provider menerima push tetapi respons/ack hilang, retry dapat terjadi: sistem terdistribusi ini tidak mengklaim exactly-once delivery. Tag/topic menggabungkan pengiriman ambigu; Notification Center dan suara memakai deduplikasi UUID.
- Payload terenkripsi hanya `type`, `notificationId`, `childId`, `subscriptionId` (UUID), tanpa nama anak, isi komentar, token report, JWT, atau URL bebas. Lock screen memakai judul/body generik. Log hanya agregat jumlah/status, tanpa endpoint, keys, header, atau payload.
- VAPID tidak boleh dirotasi sepihak tanpa rencana re-subscribe perangkat. Private key dan dispatch secret tidak dicatat dalam repo atau output validasi.

Pengiriman pertama dapat menunggu sampai satu menit karena cron; push provider/OS dapat menambah delay. Throughput awal dibatasi 25 delivery/menit. Delivery terminal disimpan untuk diagnosis/deduplikasi; retensi historis perlu ditinjau bila volume meningkat.

## Service worker, akun dan suara

`src/sw.ts` mempertahankan precache/public-only routing, update explicit dan flush draft existing. Handler push/notificationclick ditambahkan ke worker yang sama. Tidak ada cache API, notifikasi, endpoint, token, atau gambar privat di Cache Storage.

Satu ID subscription perangkat yang opaque disimpan di IndexedDB `lms-push-device-v1`. Ini marker pengikatan akun/perangkat untuk worker saat aplikasi ditutup, bukan cache notifikasi/credential. Tidak menyimpan JWT, raw parent token, endpoint, encryption keys atau komentar di database ini. Push dengan binding lama atau sesudah logout tidak ditampilkan. Klik memfokuskan client dan mengirim pesan agar hash berubah tanpa forced reload; jika aplikasi tertutup, URL aman dibuka dan Auth existing memverifikasi sesi sebelum data privat diambil.

Logout menghapus binding dan notifikasi OS milik LMS terlebih dahulu, lalu mencoba penghapusan subscription milik akun dan unsubscribe browser. Kegagalan network tidak menahan logout; binding lokal tetap menolak push lama, dan endpoint yang mengembalikan 404/410 dihapus worker. Login akun berbeda tidak mengambil alih endpoint akun lama. Late response subscribe tidak dapat mengikat akun baru. `pushsubscriptionchange` menonaktifkan binding dan meminta aktivasi ulang melalui UI.

Lonceng header menampilkan unread, recent feed, empty/error state, mark read dan kontrol perangkat. Permission hanya diminta langsung dari klik **Aktifkan Notifikasi**. Denied/unsupported ditangani tanpa menghalangi fitur lain. Tidak ada prompt otomatis atau retry mutation otomatis. Disable tetap mencoba unsubscribe lokal jika offline.

Suara adalah beep Web Audio singkat saat aplikasi visible/focused, setelah gesture user membuka AudioContext. Preferensi boolean per akun (`lms-notification-sound:v1:<user>`) boleh tersimpan lokal; tidak memuat data privat. Event Realtime/push/feed dengan UUID sama tidak membunyikan beep lagi. Multi-tab membatasi suara pada tab focused. OS notification tetap user-visible (persyaratan Safari); di foreground diminta silent. Background/closed mengikuti OS/Focus/browser dan tidak memaksakan custom sound.

## Konfigurasi manual sebelum rilis

1. Buat **satu** pasangan VAPID dengan tooling tepercaya, misalnya `npx web-push@3.6.7 generate-vapid-keys --json`. Simpan private key secara aman; jangan commit atau masukkan ke variabel `VITE_`.
2. Isi `VITE_VAPID_PUBLIC_KEY` pada `.env.local` dan environment Cloudflare Pages untuk setiap environment rilis yang dipakai. Nilainya harus sama dengan public key Edge.
3. Tambahkan Edge Function Secrets di project tersebut:

   | Nama | Nilai |
   |---|---|
   | `VAPID_PUBLIC_KEY` | Public key dari pasangan tadi |
   | `VAPID_PRIVATE_KEY` | Private key pasangan tadi |
   | `VAPID_SUBJECT` | Kontak `mailto:` yang valid atau URL HTTPS milik pengelola; hindari localhost untuk Safari |
   | `LMS_PUSH_DISPATCH_SECRET` | Random secret minimal 32 karakter, disarankan 32 random byte base64url |

4. Melalui Supabase Vault, buat secret **lms_push_function_url** dengan nilai `https://zfpfccznrbotrvfqcdzh.supabase.co/functions/v1/push-dispatch` dan **lms_push_dispatch_secret** dengan nilai sama persis seperti `LMS_PUSH_DISPATCH_SECRET`. Jangan menempelkan secret di migration/cron source atau menaruh service-role key di browser.
5. Jalankan [push_dispatch.sql](../supabase/setup/push_dispatch.sql) sebagai administrator sesudah secret siap. Script mengaktifkan `pg_cron`/`pg_net` bila diperlukan, memeriksa Vault, lalu membuat/memperbarui job bernama `lms-push-dispatch` setiap menit. URL dan header diambil dari Vault saat runtime. Jangan menggandakan scheduler/webhook untuk outbox yang sama.
6. Build dan rilis Cloudflare Pages (`npm run build` → `dist`) menggunakan mekanisme update PWA existing. Gunakan Aktifkan Notifikasi pada setiap perangkat yang diinginkan.
7. Uji komentar dari private report-link pada Android dan iPhone nyata, termasuk background/closed, tap notification, revoke/expiry, logout/pergantian akun dan suara. Periksa terminal delivery `failed` serta cron/Edge status dengan akses backend; jangan mengekspos private outbox ke browser.

Referensi primer: [Web Push library/VAPID](https://github.com/web-push-libs/web-push), [Supabase cron + Vault](https://supabase.com/docs/guides/functions/schedule-functions), [Web Push pada iOS/iPadOS Home Screen](https://webkit.org/blog/13966/webkit-features-in-safari-16-4/).

## Validasi

- Unit/integration PostgreSQL dan React: 96 tes/15 file. Termasuk trigger atomic rollback, comment replay, recipient RLS, backend-only grants, dua perangkat, claim/dedup/retry, 410, read synchronization, permission denied, subscribe/unsubscribe, late account response, foreground event/sound dedup dan routing worker.
- Deno crypto smoke: payload dari library Web Push nyata berhasil didekripsi memakai kunci perangkat uji; VAPID Authorization dan enkripsi AES128GCM benar. Tidak menghubungi provider push.
- Hosted Supabase + browser Chrome: parent comment idempotent, satu notifikasi, dua delivery, cross-account denial, backend dispatcher menolak JWT guru, Realtime/unread, klik ke tab Komentar, mark read, logout, akun B dan old binding.
- Chrome DevTools `ServiceWorker.deliverPushMessage` mengeksekusi handler worker nyata dan menghasilkan OS notification generik; event ulang tergabung. **Ini push sintetis, bukan bukti pengiriman FCM/APNs dari backend.** Bukti tanpa credentials: `supabase/.temp/notification-check.json`.
- Lint, frontend/Edge typecheck dan production build lulus. Regresi hosted `--browser --pwa` lulus: laporan multi-mapel/nilai, stale HTTP 409, payment/idempotency, Storage, parent revoke/expiry, draft gagal/restore/save, offline static cache, update worker yang mempertahankan draft dan pergantian akun. Warning bundle >500 kB dan deprecation PWA existing tidak menggagalkan build.

**Belum diuji pada Android/iPhone nyata, transport provider background/closed end-to-end, atau audibilitas speaker perangkat.** Desktop/headless hanya membuktikan penjadwalan Web Audio/handler dan perilaku browser. iPhone memerlukan iOS/iPadOS 16.4+ serta aplikasi ditambahkan ke Home Screen; izin tetap harus dari gesture user. Dukungan OS, mode Focus/hemat daya, koneksi dan kebijakan browser dapat menunda/menolak push. Worker tidak mengakali pembatasan tersebut.

## File perubahan

- Schema/backend: `supabase/migrations/202610210014_comment_notifications.sql`, `supabase/setup/push_dispatch.sql`, `supabase/config.toml`, `supabase/functions/push-dispatch/index.ts`, `_shared/push.ts`, `_shared/push-crypto-check.ts`, `supabase/functions/deno.json`, `deno.lock`.
- Aplikasi: `src/components/admin/NotificationCenter.tsx`, `AdminWorkspace.tsx`, `ChildDetail.tsx`, `src/App.tsx`, `src/sw.ts`, `src/services/push.ts`, `pushBinding.ts`, `pushWorker.ts`, `notificationSound.ts`, `db.ts`, `queryCache.tsx`, `src/utils/pushProtocol.ts`.
- Konfigurasi/validasi: `.env.example`, `package.json`, `scripts/supabase-cli.mjs`, `validate-live.mjs`, `notification-check.mjs`, `pwa-browser-check.mjs`, `tests/notifications-database.test.ts`, `push.test.ts`, `push-device.test.ts`, `notification-center.test.tsx`, dokumen ini.

Perintah verifikasi:

```powershell
npm.cmd test
npm.cmd run test:push-crypto
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run typecheck:edge
npm.cmd run build
# Preview port 3000 dan 4173 harus tersedia untuk suite browser.
node scripts/validate-live.mjs --notifications
node scripts/validate-live.mjs --browser --pwa
```

Suite hosted membuat akun/data sementara dan membersihkannya. Validasi outbox menolak meng-claim bila ada pekerjaan pending milik user nyata. Tidak ada secret push yang dibuat/disimpan otomatis oleh suite.
