# Status scheduler Web Push LMS-DAZ

Verifikasi: 21 Oktober 2026. Project terkonfigurasi: `zfpfccznrbotrvfqcdzh`.

## Konfigurasi aktif

| Komponen | Hasil |
|---|---|
| Edge Function | `push-dispatch`, ACTIVE; tidak mengubah/deploy ulang kode fungsi |
| VAPID | Public/private/subject existing dipertahankan; fingerprint metadata tetap sama selama setup |
| Dispatch secret | Secret acak baru dibuat sesuai persetujuan pengguna; Edge dan Vault cocok berdasarkan SHA-256 serta autentikasi runtime HTTP 200 |
| Vault `lms_push_function_url` | Menunjuk endpoint `push-dispatch` pada project yang sama |
| Vault `lms_push_dispatch_secret` | Sama dengan Edge Secret `LMS_PUSH_DISPATCH_SECRET` |
| Infrastruktur | `pg_cron` 1.6.4, `pg_net` 0.20.3; Vault existing 0.3.1 |
| Cron | **`lms-push-dispatch`**, **job ID 1**, active, database/owner `postgres` |
| Jadwal | **`* * * * *`**, setiap menit |
| Antrean akhir | Kosong setelah fixture dibersihkan; tidak ada pekerjaan pengiriman gagal tertinggal |
| Perangkat akhir | 0 subscription; belum ada penerimaan push perangkat nyata yang diuji pada konfigurasi ini |

Cron menjalankan pemeriksaan setiap menit. Edge hanya dipanggil bila ada delivery `pending`/`sending` yang due. Job idle tetap mencatat `succeeded` tanpa request HTTP baru. Batas pengiriman/retry, lease, expiry dan aturan notifikasi existing tidak diubah.

## Audit setup dan keamanan

Perubahan terbatas pada skrip konfigurasi, verifikasi dan dokumentasi. Tidak ada migration baru, perubahan schema/RLS bisnis, kode UI, business logic atau deployment Cloudflare Pages. Snapshot katalog kolom, flag RLS, policies dan fungsi `lms_*` sebelum/sesudah setup sama.

[push_dispatch.sql](../supabase/setup/push_dispatch.sql) kini:

- Melakukan setup dalam transaksi dengan advisory lock dan lock timeout 5 detik.
- Memvalidasi dua secret Vault, bentuk URL endpoint yang diizinkan, panjang/karakter secret header; error tidak memasukkan nilainya.
- Menggunakan nama job tetap. `cron.schedule` memperbarui job milik role yang sama; setup menolak owner berbeda dan menegaskan hanya ada satu job dengan nama tersebut.
- Mengaktifkan kembali job milik owner yang sama saat setup diulang.
- Menyimpan referensi nama Vault dalam command cron, tanpa nilai credential.

Setup berulang dibuktikan menghasilkan **satu job dengan ID yang sama**. Tidak membuat job sementara, webhook tambahan, atau scheduler kedua.

Management API secret memakai field `value` berisi fingerprint SHA-256, bukan nilai yang dapat dipakai sebagai header. Nilai fingerprint tidak disalin ke Vault. Rotasi dilakukan hanya untuk dispatch secret, sesuai persetujuan pengguna; VAPID tidak dirotasi. Secret baru dibuat di memori proses, dikirim melalui HTTPS dan parameter SQL ke Vault, tanpa ditulis di source, argumen shell, environment frontend, file bukti atau output.

Schema internal `net`, `vault`, dan `cron` ditolak oleh Data API dengan **HTTP 406 / PGRST106**. Grant tabel antrean internal milik Supabase dipertahankan; tidak mengklaim bahwa hak SELECT SQL internal dicabut. Tidak menambah schema internal tersebut ke daftar exposed schemas. Vault juga menolak SELECT dari role browser. Log yang diambil hanya timestamp, status dan counter; header, payload serta nilai secret tidak dicetak.

## Hasil verifikasi

1. Setup ulang: satu job aktif, ID 1, jadwal tetap sama.
2. Private parent RPC menerima replay UUID komentar yang sama dan menghasilkan tepat satu record notifikasi serta satu delivery untuk perangkat fixture.
3. Delivery fixture di-claim menggunakan RPC existing lalu diberi **ack HTTP 201 simulasi** melalui `lms_finish_push`. `lms_claim_push` berikutnya tidak mengambilnya lagi.
4. Fixture kedua sudah dibaca sebelum transaksi commit. Cron sungguhan memanggil worker yang membuangnya sesuai aturan existing, sehingga tidak ada request ke endpoint provider sintetis.
5. Dua siklus cron sungguhan lulus. Delivery sukses tetap `sent`, attempts **1**, last_status **201**. Setiap UUID komentar tetap mempunyai satu notifikasi.
6. `net._http_response` request ID **1**: **HTTP 200**, tanpa timeout/error. Edge runtime pada **15:15:06 UTC** mencatat `claimed=0, accepted=0, failed=0`, sesuai fixture read yang tidak perlu dikirim ke provider.
7. Log cron terbaru setelah pengujian semuanya `succeeded`; hanya satu invocation HTTP dibutuhkan oleh fixture, lalu cron kembali idle.
8. Akun/data fixture dibersihkan. Vault, satu job aktif dan konfigurasi produksi tetap dipertahankan.

Ini membuktikan jalur scheduler dan autentikasi worker nyata, serta semantik deduplikasi/completion database. **Ack 201 adalah simulasi; pengiriman dan penerimaan FCM/APNs pada perangkat nyata belum dibuktikan.**

Bukti tersanitasi (gitignored):

- `supabase/.temp/push-scheduler-setup.json`
- `supabase/.temp/push-scheduler-audit.json`
- `supabase/.temp/push-scheduler-check.json`
- `supabase/.temp/push-scheduler-logs.json`

## Operasi dan langkah manual

```powershell
# Audit/read-only terhadap konfigurasi bisnis; tidak mencetak credential.
node scripts/push-scheduler.mjs
node scripts/push-scheduler.mjs --logs

# Setup ulang memakai Vault existing yang sudah cocok, tanpa rotasi.
node scripts/push-scheduler.mjs --setup

# Pengujian memakai fixture sementara, tanpa mengirim push ke provider nyata.
node scripts/validate-live.mjs --scheduler
```

Flag `--rotate-dispatch-secret` hanya digunakan bersama `--setup` saat rotasi memang diotorisasi. Jangan menaruh fingerprint dari API sebagai secret. Tidak perlu rotasi ulang untuk menjalankan scheduler atau untuk subscribe perangkat.

Langkah manual tersisa: buka PWA guru pada perangkat yang mendukung, pilih **Aktifkan Notifikasi**, lalu kirim komentar parent dan uji penerimaan background/closed serta klik ke tab Komentar. Pada iPhone gunakan iOS 16.4+ dan PWA Home Screen. Konfigurasi scheduler ini tidak membutuhkan perubahan/deploy ulang frontend; environment VAPID frontend harus memakai pasangan yang telah disediakan pengelola.

File konfigurasi/verifikasi yang berubah: `supabase/setup/push_dispatch.sql`, `scripts/push-scheduler.mjs`, `scripts/push-scheduler-check.mjs`, cabang `--scheduler` pada `scripts/validate-live.mjs`, dan kedua dokumen push.

Referensi: [Supabase cron + Vault](https://supabase.com/docs/guides/functions/schedule-functions), [pg_cron](https://github.com/citusdata/pg_cron), [Management API parameters](https://supabase.com/docs/reference/api/v1-run-a-query), [query log yang dibatasi field/waktu](https://supabase.com/docs/guides/observability/advanced-log-filtering).
