# Migrasi LMS-DAZ ke Supabase Singapore

**Phase 3 berhasil dijalankan pada 22 Oktober 2026. Production LMS sekarang memakai Supabase Singapore `db-daz`.** Frontend tetap [lms.daztore.web.id](https://lms.daztore.web.id) melalui Cloudflare Pages. Verifikasi akhir: **16:21:19 WIB**. Persetujuan pengguna mencakup maintenance, final synchronization, deployment, aktivasi scheduler dan smoke test.

Scope hanya LMS-DAZ. Mikrotik, landing page, Docker/Nginx dan validasi aplikasi lain tidak dijadikan prasyarat dan tidak diuji. Riwayat full-project sebelum perubahan scope tersimpan dalam [arsip](SUPABASE_FULL_MIGRATION_ARCHIVE_2026-10-22.md). Laporan readiness sebelum Phase 3 disimpan terenkripsi sebagai `lms-cutover/readiness-report-before.md.enc`.

## 1. Hasil dan waktu pelaksanaan

| Checkpoint | Waktu 22 Oktober 2026, WIB | Hasil |
| --- | --- | --- |
| Backup/checkpoint sebelum maintenance | 15:56:09 | Data, Auth, environment/deployment rollback dan preservasi target tersimpan terenkripsi |
| Maintenance Edge LMS US dimulai | 15:56:39 | Hanya `lesreport` dan `push-dispatch`; flag `LMS_MAINTENANCE=1` |
| Fence database US commit | 15:57:01 | Write 20 tabel LMS dan Storage `lms_media` diblokir; cron LMS US berhenti |
| Snapshot LMS setelah freeze | 15:58:14 | Seluruh kolom/ID bisnis dan Auth dibandingkan kembali |
| Final synchronization diverifikasi | 15:58:44 | 194 record bisnis/histori cocok; tidak ada delta bisnis yang perlu ditulis ulang |
| Pages production dipromosikan | 15:59:31 | Bundle kandidat Singapore cocok SHA-256 |
| Smoke production selesai | 16:00:54 | 34 pemeriksaan lulus, fixture dibersihkan |
| Notification Center/Realtime/SW production | 16:02:26 | 13 pemeriksaan lulus, fixture dibersihkan |
| Scheduler Singapore diaktifkan | 16:03:03 | Setelah endpoint, Vault, secret dan subscription tervalidasi |
| PWA/session transition | 16:05:05 | Session US diabaikan, login ulang ditampilkan, draft lokal utuh |
| Dua siklus cron nyata | 16:06:05 | Vault → pg_net → Edge HTTP 200, tidak ada dispatcher LMS ganda |
| Web Push provider nyata | 16:10:01 | HTTP 201, satu attempt; push diterima browser uji dan notifikasi native tampil |
| Audit data setelah cleanup | 16:11:20 | 19 tabel/194 record bisnis tetap identik; Auth asli utuh |
| Pemeriksaan operasional | 16:11:49 | Kedua project ACTIVE_HEALTHY; cron SG aktif, LMS US tetap frozen |
| Komentar production pengguna | 16:17:32?16:18:01 | Dua delivery ke dua subscription Apple berbeda; masing-masing sent/201, attempts=1 |
| Verifikasi sesudah konfirmasi iPhone | 16:21:19 | 18 tick cron SG sejak aktivasi, nol gagal; US nol tick LMS setelah freeze; outbox tanpa pending/duplikat |

Maintenance write US tetap dipertahankan sesudah promosi untuk mencegah PWA/tab lama menulis ke backend lama. Tidak dilakukan full restore, penghapusan project, perubahan paket berbayar, rotasi VAPID, atau perubahan business logic/UI di Phase 3.

## 2. Identitas backend dan deployment

| | US | Singapore |
| --- | --- | --- |
| Project | `supabase-daztore` | **`db-daz`** |
| Ref | `zfpfccznrbotrvfqcdzh` | `zfhrzehocewhflytfbyl` |
| Region | `us-east-1` | `ap-southeast-1` |
| Status project terakhir | ACTIVE_HEALTHY | ACTIVE_HEALTHY |
| Write bisnis LMS | Dibekukan | Production aktif |
| Cron `lms-push-dispatch` | Nonaktif | Aktif, tepat satu job, setiap menit |
| Aplikasi lain | Tetap memakai US | Data hasil restore dipertahankan |

- Pages project: `lms-daz`, production branch `main`.
- Deployment baru: **`312344d8-3362-4e6e-b330-4d510539ef12`**.
- Deployment URL: [312344d8.lms-daz.pages.dev](https://312344d8.lms-daz.pages.dev).
- Main asset: `/assets/index-CN_s-uRo.js`.
- SHA-256 main asset: `6f11fb12488d1bd6e96fe1ddffff109735c28a6d789e49f8593ff42f89665cb8`.
- Asset yang diambil dari domain production cocok dengan kandidat yang diuji, memuat ref Singapore dan tidak memuat ref US. Tidak ditemukan server credential pada bundle yang dipromosikan. Audit artifact 16:16:51 WIB memindai 12 file lokal (11 file kandidat publik dan satu cache CLI), lalu memverifikasi hash kedua JavaScript kandidat yang dilayani domain production; seluruhnya cocok dan bebas ref US/credential privileged.
- Rilis diunggah sebagai prebuilt artifact memakai Wrangler 4.151.3; Git integration tetap ada. [Direct Upload Cloudflare](https://developers.cloudflare.com/pages/get-started/direct-upload/) mendukung deployment manual pada project yang terhubung Git.

**Auto-deploy Git untuk production ditahan pada 16:05:21 WIB.** Perubahan source rilis masih berada di workspace dan belum di-commit/push ke `main`; build Git lama dapat menimpa implementasi varian gambar yang sudah diuji. Preview configuration dipertahankan dan manual deploy tetap tersedia. Publikasikan source yang sesuai rilis ini, validasi build dengan environment Singapore, lalu aktifkan kembali `production_deployments_enabled`. Jangan melakukan rebuild dari Git lama.

## 3. Final synchronization dan jumlah data

Snapshot setelah fence dibandingkan terhadap target terkini, bukan mengandalkan snapshot restore awal. **19 tabel bisnis/histori, total 194 record, identik seluruh kolom/checksum.** Tidak ada source-only, target-only atau changed row bisnis. Karena delta kosong, final sync merupakan no-op terverifikasi; tidak ada UPSERT/DELETE/TRUNCATE bisnis atau restore Auth ulang. ID, owner, relasi, timestamps, histori, idempotency pembayaran dan hash private link dipertahankan.

Snapshot setelah seluruh fixture dibersihkan, sebelum aktivitas production baru: **22 Oktober 2026 16:11:20 WIB**. Tabel berikut menunjukkan kesetaraan pada checkpoint tersebut; perubahan production terbaru dijelaskan sesudah tabel.

| Tabel | US | Singapore | Hasil |
| --- | ---: | ---: | --- |
| private.lms_audit_logs | 112 | 112 | Identik |
| private.lms_push_deliveries | 1 | 1 | Identik |
| private.lms_report_links | 7 | 7 | Identik |
| private.lms_request_limits | 9 | 13 | Runtime per-project, dipertahankan |
| public.lms_attendance | 7 | 7 | Identik |
| public.lms_children | 4 | 4 | Identik |
| public.lms_comments | 2 | 2 | Identik |
| public.lms_invoices | 2 | 2 | Identik |
| public.lms_lesson_report_subjects | 7 | 7 | Identik |
| public.lms_lesson_reports | 6 | 6 | Identik |
| public.lms_media_assets | 7 | 7 | Identik |
| public.lms_notifications | 2 | 2 | Identik |
| public.lms_parents | 3 | 3 | Identik |
| public.lms_payment_transactions | 2 | 2 | Identik |
| public.lms_profiles | 1 | 1 | Identik |
| public.lms_push_subscriptions | 1 | 1 | Identik |
| public.lms_report_templates | 1 | 1 | Identik |
| public.lms_schedule_subjects | 9 | 9 | Identik |
| public.lms_schedules | 4 | 4 | Identik |
| public.lms_subjects | 16 | 16 | Identik |

`lms_request_limits` menyimpan window/counter sementara yang berubah saat request dan pengujian. Key IP di-hash bersama server key project, sehingga counter US tidak portable. Bukti US diarsipkan; window target tidak ditimpa dan counter lama tidak direplay. Operational table `private.lms_cutover_state` hanya ada di US untuk fence dan tidak dihitung sebagai data aplikasi yang disinkronkan.

Sequence LMS target diverifikasi tidak lebih rendah dari source; tidak menurunkan counter setelah cleanup fixture. Tidak ada referensi literal ref Supabase US dalam data LMS yang diperiksa, sehingga tidak diperlukan rewrite URL data.

**Preservasi aplikasi lain:** 21 tabel public non-LMS target dan 17 objek Storage non-LMS tetap cocok dengan baseline sebelum Phase 3. Tidak ada write aplikasi lain, pengujian aplikasi lain atau restore ulang.

### Data production sesudah login dan komentar pengguna

Pada **16:21:19 WIB**, US tetap **194 record bisnis/histori**, identik dengan snapshot freeze; Singapore berisi **200 record**. Enam record baru berasal dari aktivitas production sesudah cutover: audit +1, komentar +1, notifikasi +1, subscription +1 dan delivery +2. Tidak ada baris baseline yang hilang. Satu report-link berubah hanya pada `access_count` dan `last_accessed_at` akibat pemakaian link. Data baru ini dipertahankan, tanpa sync balik/restore atau reset ke snapshot US.

Pengguna telah mengonfirmasi **login akun lama berhasil dan PWA iPhone menerima push komentar orang tua**. Outbox target berisi 3 delivery sent: satu historis dan dua baru untuk satu notifikasi pada dua subscription Apple berbeda. Masing-masing delivery baru mendapat HTTP 201 dengan attempts=1; nol pasangan notification/subscription duplikat, nol pending/sending. Dua subscription berbeda tidak disatukan atau dihapus tanpa bukti kepemilikan/perangkat dan status usang.

Scheduler Singapore tepat satu job aktif, 18 tick sejak aktivasi, nol failed run; tiga request pg_net yang tercatat menerima HTTP 200 dan tidak ada HTTP error. Worker hanya mengirim HTTP bila ada pekerjaan; jumlah HTTP tidak perlu sama dengan jumlah tick. Di US: cron LMS nonaktif, **nol tick setelah freeze, nol antrean dispatch**, maintenance flag aktif, 42 fence trigger aktif, serta seluruh data bisnis/outbox tetap sama dengan snapshot freeze. Bukti ini menunjukkan US tidak ikut mengirim komentar production baru.

## 4. Auth, database dan keamanan

- Dua akun Auth dan dua identities asli tetap utuh dan seluruh barisnya identik dengan US pada snapshot 16:11:20 WIB sebelum login production pengguna. Satu akun terhubung LMS. Hash password, UUID/provider dan ownership tidak diubah.
- Login password, getUser, session restoration, logout dan isolasi dua akun berhasil melalui fixture Singapore; browser production juga berhasil login. Akun fixture telah dihapus. Pengguna kemudian mengonfirmasi login akun asli berhasil; metadata login target dapat maju sesuai aktivitas production. Password pengguna asli tidak diminta, dicetak, direset atau diketahui.
- Auth Site URL: `https://lms.daztore.web.id`. Redirect root LMS dengan/tanpa slash terpasang; callback lama yang sudah ada dipertahankan. Signup publik tetap nonaktif; LMS menggunakan login akun yang sudah tersedia.
- Database SSL enforcement target aktif dan applied; API menggunakan HTTPS. Private bucket, RLS, RPC, triggers, ownership dan token guards dipertahankan.
- Bukti kesetaraan schema readiness yang sudah lulus tetap berlaku: 21 relations termasuk sequence, 193 columns, 138 constraints, 80 indexes, 34 policies tabel LMS, 44 database functions, 40 triggers, 65 objects effective grants dan satu anggota publication LMS. Tidak menjalankan ulang migration bisnis atau pengujian schema yang telah lulus.
- Satu INSERT policy Storage tambahan `lms_media_variant_insert` membatasi tiga nama varian yang sah, owner yang sama dengan auth.uid(), bucket `lms_media`, dan asset pending/ready milik owner. Tidak ada schema/UI baru untuk fitur gambar.
- CORS production/development yang eksplisit lulus; origin asing ditolak. Tidak memakai CORS wildcard.

Auth US tidak dinonaktifkan secara global karena dipakai aplikasi lain. JWT US tidak disalin ke namespace session Singapore. Pagar LMS tetap menolak write walaupun PWA lama masih mempunyai JWT US yang valid.

## 5. Storage dan WebP private

Final sync mengunduh kembali 7 original US sebagai backup final, membandingkan hash konten dengan target, memverifikasi owner/path/size, lalu memverifikasi seluruh 21 varian target terhadap provenance dan checksum. Tidak menimpa file asli atau metadata/version target yang sah.

| Resource | Jumlah | Byte |
| --- | ---: | ---: |
| Original | 7 | 15.054.189 |
| Varian avatar | 7 | 32.916 |
| Varian thumbnail | 7 | 179.460 |
| Varian detail | 7 | 492.354 |
| **Total LMS** | **28** | **15.758.919** |

- Avatar sekitar 3,2–5,2 KB, thumbnail 13,9–41,8 KB, detail 31,1–124,8 KB. Avatar/thumbnail memakai file varian tersimpan, tanpa mengunduh original besar secara otomatis.
- Bucket `lms_media` tetap private, maksimum 5 MB, MIME JPEG/PNG/WebP. Varian menggunakan `.lms-v1-avatar.webp`, `.lms-v1-thumbnail.webp`, `.lms-v1-detail.webp`.
- Signed URL 60 detik dan akses owner/parent-token tetap berlaku. Endpoint public ditolak; foreign user dan forged derivative path ditolak. Missing derivative tidak boleh menandai upload ready.
- Canvas/WebP resize dilakukan sebelum upload baru; browser production menguji foto kamera 2400×1600 → WebP maksimum 320 untuk avatar original upload dan varian tampilan maksimum 160.
- Readiness sebelumnya membuktikan 21/21 varian dapat didecode browser dan ownership sesuai. Smoke production membuktikan render private stored avatar dan alur parent report.
- Image Transformations berbayar tidak digunakan atau diaktifkan. Paket Supabase tidak berubah.

## 6. Edge Functions, secrets, Vault, Web Push dan cron

Target `lesreport` dan `push-dispatch` ACTIVE; verify_jwt=false dipertahankan sesuai autentikasi aplikasi sendiri. Lima custom secret asli cocok tanpa mencetak nilai: `ALLOWED_ORIGINS`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `LMS_PUSH_DISPATCH_SECRET`. Tidak ada secret LMS yang belum pulih. Pasangan VAPID lama dipertahankan.

Target flags: `LMS_MAINTENANCE=0`, `LMS_STORED_MEDIA_VARIANTS=1`. Vault `lms_push_function_url` menunjuk endpoint push-dispatch Singapore; `lms_push_dispatch_secret` cocok dengan Edge secret. Kedua nilai diverifikasi dalam state terenkripsi.

Tepat satu job `lms-push-dispatch` Singapore aktif (`* * * * *`). Source LMS cron nonaktif sebelum promosi; cron aplikasi lain tidak berubah. Tidak ada replay delivery yang sudah terkirim.

Bukti Web Push production:

1. Notification Center, Realtime komentar, badge/read state, ownership, subscription idempotency, lease completion, revoke/expiry dan account switch lulus. Chrome injected PushEvent hanya dipakai untuk regresi service worker dan tidak diklaim sebagai bukti provider.
2. Dua tick cron nyata menghasilkan pg_net → Edge HTTP 200 memakai Vault. Fixture read-only/discard dan simulated acknowledgement menguji idempotency tanpa mengirim endpoint palsu ke provider.
3. Pengujian terpisah memakai **PushManager subscription nyata** pada Chrome terisolasi melalui domain production, dengan akun fixture dan VAPID lama. Komentar parent fixture diproses cron aktif. Provider merespons **HTTP 201, attempts=1**; browser benar-benar menerima push terenkripsi dan service worker menampilkan notifikasi native. Tidak menggunakan CDP injection untuk bukti ini.
4. Subscription browser uji di-unsubscribe; akun, komentar, outbox, file dan data fixture dibersihkan. Audit 16:11:20 WIB sebelum aktivitas pengguna kembali ke 1 subscription asli, 1 delivery historis asli, dan nol pending/sending. Aktivitas pengguna berikutnya menambah subscription/delivery yang sah seperti dijelaskan pada bagian data production.

Pengguna telah mengonfirmasi login akun lama serta penerimaan push nyata pada PWA iPhone setelah komentar orang tua. Operator memverifikasi delivery terkait berstatus sent/201 dan satu attempt per subscription. Bukti perangkat fisik berasal dari konfirmasi pengguna; bukti database/provider berasal dari pemeriksaan read-only operator. Perangkat lain tetap perlu login/update dan aktivasi notifikasi sesuai kebutuhan.

## 7. Environment production dan transisi client

| Environment Pages production | Keadaan sekarang |
| --- | --- |
| VITE_SUPABASE_URL | URL project Singapore |
| VITE_SUPABASE_PUBLISHABLE_KEY | Public/anon key Singapore |
| VITE_VAPID_PUBLIC_KEY | Nilai lama dipertahankan |
| VITE_LMS_STORED_MEDIA_VARIANTS | `1` |
| SUPABASE_PROJECT_REF | Ref Singapore |
| SUPABASE_DB_PASSWORD | Credential database Singapore, hanya server/build environment |
| SUPABASE_ACCESS_TOKEN | Nilai existing dipertahankan, hanya server/build environment |

Nilai credential tidak ditulis dalam laporan. Environment preview tidak diubah. Kandidat memuat public key saja; secret privileged tidak menjadi environment VITE. `.env.local` workspace tidak diubah; menjalankan helper lama dengan default US tetap harus dihindari. Helper Phase 3 mengisi environment target secara eksplisit.

Service worker production mengontrol halaman, precache menunjuk asset rilis baru, dan index/sw dikirim dengan no-cache. Cache tidak memuat Supabase API, signed/private token URL atau credential. Uji session US lokal yang invalid pada browser terisolasi menampilkan login Singapore tanpa request ke US dan mempertahankan draft byte-identik setelah reload.

Upgrade dari setiap service worker lama yang sudah terpasang pada perangkat pengguna tidak disimulasikan. Aplikasi memakai prompt update dan flush draft sebelum reload, tanpa menghapus local draft, auto-replay transaksi atau pemaksaan reload di tab lain. PWA lama yang belum update tetap tidak dapat menulis ke US karena fence database/Edge. Jangan meminta pengguna membersihkan seluruh site storage karena draft lokal perlu dipertahankan.

## 8. Pagar US dan preservasi platform

[lms_cutover_freeze.sql](../supabase/setup/lms_cutover_freeze.sql) telah dijalankan dengan persetujuan Phase 3 dan guard identitas Vault US. Pagar berisi 42 trigger aktif: write/truncate pada 20 tabel LMS, ditambah write pada storage.objects/storage.buckets yang hanya menolak bucket LMS. Tiga restrictive policy menolak INSERT/UPDATE/DELETE LMS bagi client. Non-LMS Storage diteruskan oleh trigger tanpa perubahan.

Probe transaksi yang di-rollback membuktikan write seluruh 20 tabel dan metadata Storage LMS ditolak SQLSTATE 55000; data tidak diubah. Verifikasi terakhir 16:11:39 WIB juga membuktikan kedua Edge LMS US mengembalikan 503 dan cron LMS US nonaktif. Probe awal sempat memakai kolom identity GENERATED ALWAYS dan ditolak sebelum trigger; probe dikoreksi ke kolom non-identity lalu seluruh 20 pemeriksaan lulus.

Edge US memakai source deployed asli yang telah diverifikasi hash, dengan hanya dua tambahan maintenance guard. Source Auth config dan semua secret existing tetap sama; hanya menambahkan flag maintenance LMS. Platform menaikkan runtime version non-LMS `test-edge` 8 → 9 saat secret project diperbarui. Download read-only membuktikan source bytes, updated_at dan verify_jwt fungsi tersebut tetap sama; fungsi aplikasi lain tidak di-deploy atau di-invoke oleh pengujian.

Project US tidak dihapus, di-pause atau diubah credential-nya. Aplikasi lain tetap berjalan dengan backend US. Perubahan trigger/control LMS dan penambahan flag maintenance merupakan perubahan US yang memang diotorisasi untuk cutover ini.

## 9. Backup dan bukti audit

Lokasi private terenkripsi:

`C:\Users\Surya Pertiwi N\.codex\private\supabase-migrations\zfpfccznrbotrvfqcdzh-singapore`

AES-256-GCM; key dibungkus Windows DPAPI CurrentUser, ACL untuk SID operator. Setiap save diverifikasi decrypt/readback dan dicatat dalam manifest checksum. Nilai Auth/secret/environment, native SQL/CLI logs, blob dan konfigurasi rollback tidak disimpan sebagai plaintext dalam repository.

Audit ledger penutup membuktikan **635/635 artifact terenkripsi** tercatat, tidak ada file hilang/checksum berbeda, dan seluruh GCM tag valid. Pemindaian literal credential/whitespace pada 27 file perubahan juga lulus.

Bukti utama, semua dengan suffix `.enc`:

- `lms-cutover/state.json`: urutan/checkpoint, waktu freeze/promosi/aktivasi dan identitas deployment.
- `lms-cutover/checkpoint-pages.json`: environment/source config/deployment Pages sebelum perubahan.
- `lms-cutover/checkpoint-source-data.json`, `checkpoint-source-auth.json`, `checkpoint-target-data.json`, `checkpoint-target-preservation.json`: snapshot sebelum maintenance.
- `lms-cutover/final-source-data.json`, `final-source-auth.json`, `final-storage-manifest.json`, `final-sync-proof.json`: snapshot setelah fence dan keputusan final sync.
- `lms-cutover/2026-10-22T08-57-48.016Z/storage-originals/*`: tujuh blob original dari US yang diunduh kembali setelah freeze.
- `lms-readiness/variants.json` dan `lms-readiness/variant-verification.json`: provenance blob/owner/render 21 varian yang telah dibackup.
- `lms-cutover/deployment-proof.json`, `production-smoke.json`, `production-notifications.json`, `production-pwa-transition.json`, `production-scheduler.json`, `provider-push.json`, `production-artifact-audit.json`: bukti runtime production.
- `lms-readiness/2026-10-22T09-11-05.729Z/*`: data/config audit akhir setelah cleanup.
- `lms-cutover/live-postcheck.json`: konfirmasi pengguna, delta production terbaru dan bukti scheduler/outbox US?Singapore read-only.
- `lms-cutover/final-status.json`, `freeze-proof.json`, `source-non-lms-function-preservation.json`, `production-release-pin.json`: status operasional dan preservasi.
- Backup full-project awal tetap disimpan sebagai fallback historis; tidak di-restore ulang pada Phase 3.

## 10. Checklist hasil cutover dan tindak lanjut

- [x] Persetujuan pengguna dan checkpoint rollback tersedia.
- [x] Maintenance LMS, drain upload/dispatcher dan fence US terbukti; tidak ada shutdown global.
- [x] Final data/Auth/media comparison, backup, sequence dan preservasi non-LMS lulus.
- [x] Environment dan artifact Singapore dipromosikan; bundle domain production cocok.
- [x] Login/session/logout, CRUD murid/orang tua/jadwal/absensi, laporan multi-mapel/nilai, pembayaran/idempotency, private parent link/komentar/revoke/expiry lulus dengan fixture aman.
- [x] Foto/avatar/WebP, private Storage, signed URL 60 detik, ownership dan RLS dua akun lulus.
- [x] Realtime, Notification Center, PWA/session namespace/draft retention lulus.
- [x] Satu dispatcher Singapore aktif; cron → pg_net → Edge dan provider → browser nyata terbukti.
- [x] Fixture dibersihkan; 194 record bisnis dan 28 objek LMS asli/varian utuh.
- [x] US ACTIVE_HEALTHY, LMS US tetap frozen, cron dan data aplikasi lain dipertahankan.
- [x] Pengguna mengonfirmasi login akun asli dan push nyata pada PWA iPhone; outbox/scheduler dan tidak adanya dispatcher US diperiksa kembali secara read-only.
- [ ] Publikasikan source rilis yang sudah diuji ke Git `main`, validasi build Singapore, lalu buka kembali auto-deploy production yang ditahan.
- [ ] Lanjutkan pemantauan error/login/upload/push dan pastikan client lama melakukan update; jangan membuka fence US.

Tidak ditemukan error kritis atau kehilangan data pada pemeriksaan akhir. Penerimaan provider terbukti pada browser uji terisolasi dan PWA iPhone dikonfirmasi pengguna. Seluruh instalasi PWA lain tidak dikendalikan operator; fence US tetap dipertahankan.

## 11. Rollback setelah Singapore menerima write

Deployment rollback sebelum cutover: **`aea3611c-42f4-4ddc-87b0-9d0c219347e5`**. Konfigurasi environment/source Pages sebelumnya, source function asli dan backup final tersedia terenkripsi. Rollback belum dijalankan.

**Jangan hanya mengembalikan environment/deployment.** Singapore sudah menerima write smoke test dan kini menerima traffic production; perlakukan sebagai sumber delta baru walaupun fixture telah dibersihkan.

1. Jika ada insiden kritis, aktifkan maintenance kedua Edge LMS Singapore. Jalankan hanya fence target beridentitas Singapore yang sudah disiapkan, [lms_cutover_target_freeze.sql](../supabase/setup/lms_cutover_target_freeze.sql), dengan approval flag yang sesuai konteks insiden/rollback. Script ini **belum dijalankan**. Ia menghentikan hanya cron/write LMS target, bukan layanan global. Tunggu dispatcher/upload in-flight selesai; source US tetap frozen.
2. Ambil backup baru kedua sisi. Rekonsiliasi hanya LMS/Auth terkait/lms_media, termasuk laporan, payment idempotency, audit, link/revoke, subscription/delivery dan original/varian WebP. Bandingkan UUID/owner/version/checksum dan sequence. Jangan menimpa data aplikasi lain atau mengirim ulang delivery sent.
3. Tentukan satu backend penulis setelah rekonsiliasi. Siapkan rilis frontend/Edge yang kompatibel dengan data dan varian gambar terbaru; jangan menganggap rilis Git lama sesuai otomatis. Verifikasi akses private media dan URL/secrets/Vault/CORS sebelum membuka traffic.
4. Setelah target writers/jobs benar-benar berhenti dan US telah berisi semua delta yang disetujui, gunakan [lms_cutover_unfreeze.sql](../supabase/setup/lms_cutover_unfreeze.sql) untuk source. Script memerlukan konfirmasi rollback dan target writers stopped. Ia memulihkan hanya cron LMS US sesuai state sebelumnya. Matikan Edge maintenance US terakhir.
5. Promosikan environment/rilis yang telah direkonsiliasi, jalankan smoke fixture dan pastikan tepat satu dispatcher. Simpan waktu/reconciliation/deployment sebagai checkpoint baru. US dan Singapore tidak dihapus.

Readiness rollback tersedia sebagai checkpoint, backup, script fence/unfreeze dan prosedur rekonsiliasi; bukan tombol rollback satu langkah setelah production menerima data baru.
