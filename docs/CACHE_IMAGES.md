# Cache dan image loading LMS-DAZ

Implementasi/validasi: 21 Oktober 2026. Cloudflare Pages tetap static (`npm run build` → `dist`), Supabase tetap source of truth. Tidak ada migration, perubahan RLS/storage policy, payment/idempotency, aturan laporan, atau navigasi.

## Audit dan baseline

Sebelumnya `useQuery` melakukan fetch setiap mount tanpa cache/deduplication. Avatar mengambil metadata per komponen lalu membuat signed URL, sehingga avatar yang sama pada hero/panel dan navigasi ulang mengulang request. Foto ditampilkan dari file upload asli. Upload belum melakukan resize/kompresi. Service worker sudah membatasi cache ke aset publik; strategi itu dipertahankan.

Baseline dibangun dari commit `56c1979` (perbaikan create laporan sudah termasuk), dengan bundle `/assets/index-Ck9E7cch.js`. Pengukuran memakai Chrome headless, viewport 1280×1000, fresh context, preview lokal port 3000, hosted Supabase, akun/record sementara, dan fixture JPEG deterministik 2400×1600 berukuran 2.842.690 byte. Fixture dan urutan interaksi identik sebelum/sesudah.

`readyMs` mengukur aksi sampai elemen/gambar target siap dan jaringan Supabase tenang selama 500 ms. Transfer gambar berasal dari CDP `Network.loadingFinished.encodedDataLength` (termasuk overhead respons); waktu gambar berasal dari durasi request CDP. Angka berikut adalah sampel terakhir, bukan jaminan latency produksi. Waktu cold start/Edge/transform bervariasi antar-run; beberapa run awal galeri/cold Dashboard lebih lambat meskipun ukuran transfer jauh berkurang.

| Skenario | Request sebelum → sesudah | Siap sebelum → sesudah | Transfer gambar sebelum → sesudah |
|---|---:|---:|---:|
| Dashboard cold, termasuk login | 9 → 8 | 6.707 → 6.192 ms | 2.843.903 → 1.177 byte |
| Child Detail dari Dashboard | 8 → 3 | 4.569 → 1.840 ms | 2.843.632 → 0 byte |
| Kembali ke Dashboard | 6 → 0 | 4.514 → 558 ms | 2.843.695 → 0 byte |
| Kembali ke Child Detail | 8 → 1 | 4.472 → 899 ms | 2.843.607 → 0 byte |
| Galeri pertama, termasuk pemilihan laporan | 7 → 7 | 5.898 → 5.350 ms | 2.843.662 → 69.403 byte |

Satu request yang tetap ada saat kembali ke Child Detail adalah pemeriksaan status private link. Request signing/batch media dari browser pada seluruh rangkaian turun **7 → 2**; total request Supabase **38 → 19**. Transfer gambar seluruh rangkaian turun sekitar **99,5%**. Request server internal di Edge tidak termasuk hitungan request browser ini.

| Gambar | Sebelum | Sesudah |
|---|---|---|
| Avatar yang ditampilkan 80 px | File 2400×1600, payload 2.842.690 byte | Transform 160×107, payload 480 byte; waktu GET 2.242 → 1.012 ms |
| Foto galeri sekitar 498 px | File 2400×1600, payload 2.842.690 byte | Transform 640×427, payload 68.718 byte; waktu GET 2.229 → 593 ms |
| Upload avatar baru dari fixture sama | 2.842.690 byte JPEG | 26.260 byte WebP, `ready` |
| Upload foto laporan baru dari fixture sama | 2.842.690 byte JPEG | 905.902 byte WebP, `ready` |

Bukti tanpa token/credentials/URL privat: `supabase/.temp/cache-image-before.json`, `cache-image-after.json`, `image-capabilities.json`. Build baseline sementara dipisahkan dari workspace setelah pengukuran agar tidak ikut ditemukan sebagai suite test.

## Library dan cache data

Ditambahkan `@tanstack/react-query@5.104.5`; dependensi transitif `@tanstack/query-core@5.104.5`. Tidak memasang persister atau devtools. Perubahan lockfile hanya dependency baru, tanpa upgrade dependency lain.

Adapter `useQuery` existing mempertahankan kontrak komponen. Satu QueryClient per identitas guru atau digest token parent; query key berisi scope, entity, serta key/filter/page lengkap. Provider otomatis mengganti client ketika scope berubah. Tidak ada cache query di localStorage/IndexedDB/Cache Storage. Logout/pergantian akun membatalkan query, membersihkan QueryClient dan semua cache signed URL; hasil request lama tidak boleh mengisi cache akun baru.

Persistensi sesi Supabase Auth existing tidak diubah. Cache baru tidak menyalin access token, refresh token, raw parent token, atau signed URL ke penyimpanan persisten; draft tetap memakai namespace/allowlist existing yang terpisah.

| Modul | staleTime / aturan |
|---|---|
| Mata pelajaran, termasuk pilihan draft | 15 menit |
| Template | 10 menit |
| Profil | 5 menit |
| Murid | 3 menit |
| Jadwal, absensi, laporan/progress, Dashboard | 1 menit |
| Metadata media | 1 menit |
| Payment/transaksi, komentar, info private link | 0; recheck saat mount/focus |
| Snapshot edit (`edit-latest`) | Wajib fetch fresh sebelum form dibuka |
| Parent | Tidak mempertahankan hasil inactive; recheck saat mount/focus dan tiap 45 detik; error otorisasi menyembunyikan hasil lama |

Cache guru inactive memiliki gcTime 20 menit. Query stale direvalidasi di background saat mount/focus/reconnect. Query dan mutation tidak di-retry otomatis; tidak ada offline replay. Mutation tetap memakai lock, UUID idempotency, dan versi Supabase existing.

Sesudah RPC/mutation sukses, cache entity dan dependensi terkait diinvalidasi (misalnya parent → murid; subject → jadwal/template/laporan; payment → transaksi/Dashboard). Read yang sedang berjalan dibatalkan agar respons lama tidak mengganti data terbaru. Refresh komponen existing berbagi request yang sama. Rekonsiliasi upload yang sudah `ready` setelah respons finalisasi hilang juga menginvalidasi cache terkait.

Pagination existing tetap 20. Dashboard memilih hanya field yang dipakai, maksimal 6 murid dan 4 jadwal, sesuai jumlah kartu yang sebelumnya ditampilkan. Tidak ada preload seluruh database. Relational select laporan/jadwal tetap dipakai.

Konfigurasi mengacu pada [staleTime dan revalidation TanStack](https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults) serta [invalidation setelah mutation](https://tanstack.com/query/latest/docs/framework/react/guides/query-invalidation).

## Gambar dan signed URL

Storage capability project menyatakan Image Transformations aktif; GET transform terhadap objek privat existing diverifikasi HTTP 200. [Supabase mendukung resize privat melalui signed transformations](https://supabase.com/docs/guides/storage/serving/image-transformations). Tidak ada perubahan paket project atau penulisan ulang file lama.

Ukuran penyajian yang ditandatangani server:

- Avatar: contain dalam 160×160, quality 75.
- Galeri: contain dalam 640×480, quality 75.
- Foto pada detail laporan parent: contain dalam 1280×960, quality 82.
- Original hanya sebagai fallback jika transform tidak tersedia/gagal. Supabase memilih format yang didukung browser; sumber tetap privat.

Tidak ada objek thumbnail tambahan atau metadata schema baru. Edge `media-urls` memverifikasi Auth user, mengambil semua asset `ready` milik user dalam satu query batch (maksimal 20), kemudian menandatangani variant yang diizinkan. Body tidak boleh memberikan path storage atau transform bebas. Signing Storage dilakukan paralel untuk tiap objek/variant yang belum ada dalam cache isolate; API signing transform membutuhkan token per objek. Browser mengirim satu batch, bukan metadata query per avatar.

Parent tetap memakai `lms_parent_request` untuk memverifikasi token, expiry, revocation, owner, murid, report dan page. Respons awal dapat meminta metadata tanpa URL/path. Hanya gambar yang mendekati viewport meminta batch URL; setiap batch **mengulang authorization RPC parent sebelum memakai cache signer**. Caller lama yang meminta payload parent biasa tetap didukung.

Signed URL tetap TTL **60 detik**. Browser menyimpan URL di memori berdasarkan scope session, asset/objek immutable dan variant; permintaan bersamaan dibatch/deduplicate. URL digunakan ulang sampai mendekati expiry, lalu diperbarui sekitar 15 detik sebelum kedaluwarsa. Sisa TTL dari server dikonversi menjadi deadline lokal dengan mengurangi waktu request dan margin, sehingga perbedaan jam browser/server tidak memperpanjang TTL. Cache browser dibatasi dan dibuang saat logout; cache signer Edge juga dibatasi, berumur pendek dan tetap melewati authorization saat digunakan.

`PrivateImage` memakai placeholder SVG publik, dimensi/aspect ratio, `decoding="async"`, lazy loading dan IntersectionObserver. Avatar utama eager; kartu/foto di luar viewport menunda signing serta download. Error transform dapat fallback ke original yang tetap diotorisasi. Pergantian/penghapusan media menginvalidasi cache; tidak ada signed URL atau token yang disimpan dalam draft.

Upload baru memeriksa kecocokan MIME/signature sebelum membuat asset, memakai orientasi EXIF pada decode, menjaga rasio tanpa upscale, membatasi avatar/profil ke 320 px dan foto ke 1600 px, lalu memilih encode WebP jika lebih kecil. Animasi dipertahankan, browser tanpa decoder yang sesuai memakai file valid asli, dan file existing tidak diubah. Validasi server MIME/signature/size/hash/ownership, private bucket, dan `begin-upload → Storage → finish-upload → ready` tetap berlaku. Kegagalan optimasi terjadi sebelum asset/objek dibuat.

## PWA dan validasi

Service worker tetap hanya cache aset publik. Hanya placeholder SVG statis yang ditambahkan ke precache/allowlist. Auth, RPC, API/Edge, payment, private-link, dan gambar privat tidak masuk persistent service-worker cache. Update tetap explicit dan melakukan flush draft; draft tidak dibersihkan oleh query cache.

- Unit/integration: **78 tes, 11 file**, mencakup cache hit/dedup, background revalidation, stale response cancellation, account switch, fresh edit, parent denial, expiry/clock skew, signing invalidation, upload compression, draft, database ownership/concurrency, dan cache policy.
- Lint, frontend typecheck, Edge typecheck, production build: lulus.
- Browser benchmark hosted: avatar/foto sesuai ukuran, reuse signed URL, renewal nyata sebelum expiry, penghapusan foto dari tampilan, kompresi/finalisasi upload avatar dan foto, isolasi akun A/B, zero browser errors, tidak ada cache privat di Cache Storage.
- Batch endpoint hosted: akun lain HTTP 403, anonymous HTTP 401, media di luar scope parent HTTP 403, revoke menolak batch baru meskipun signer memiliki cache.
- Regresi tambahan menggunakan `validate-live.mjs --browser --pwa` serta `--audit-report-create`: laporan/draft/concurrency, parent, payment, Storage dan update PWA. Akun/data fixture dibersihkan; credentials PWA diteruskan hanya di memori/process environment.

Reproduksi benchmark: jalankan build yang ingin diukur pada preview port 3000 lalu `node scripts/validate-live.mjs --benchmark-cache-image` (baseline) atau tambahkan `--after` untuk validasi hasil. Preview port 4173 digunakan oleh suite PWA. Jangan menjalankan beban browser/test lain bersamaan dengan pengukuran latency.

## File perubahan

- `package.json`, `package-lock.json`
- `src/App.tsx`
- `src/services/queryCache.tsx`, `hooks.ts`, `db.ts`, `mediaCache.ts`, `images.ts`
- `src/components/common/PrivateImage.tsx`
- `src/components/admin/AdminWorkspace.tsx`, `ChildDetail.tsx`, `MediaManager.tsx`
- `src/components/parent/ParentPortal.tsx`
- `supabase/functions/_shared/media.ts`, `_shared/diagnostics.ts`, `lesreport/index.ts`
- `public/image-placeholder.svg`, `src/utils/pwaPolicy.ts`, `vite.config.ts`
- `tests/cache.test.tsx`, `media-cache.test.ts`, `images.test.ts`, `pwa-policy.test.ts`, `upload-diagnostics.test.ts`
- `scripts/cache-image-check.mjs`, `validate-live.mjs`, `pwa-browser-check.mjs`
- `docs/CACHE_IMAGES.md`

## Rollout dan keterbatasan

Edge Function `lesreport` sudah dideploy ke project terkonfigurasi dan tetap kompatibel dengan frontend lama. **Cloudflare Pages belum dipublikasikan/diubah deployment-nya**; build terbaru berada di `dist`. Edge endpoint baru harus tersedia sebelum frontend hasil optimasi dirilis. Tidak diperlukan migration Supabase.

Cold latency masih bergantung Auth, jaringan, Edge signing dan transform pertama; keuntungan paling konsisten adalah navigasi ulang dan pengurangan byte gambar. Tambahan library membuat JS gzip sekitar **159,57 → 171,78 kB**. Warning bundle >500 kB dan deprecation PWA tetap ada; build sukses. Transform memakai kapasitas project existing; jika dinonaktifkan, fallback original menjaga fungsi tetapi penghematan file lama berkurang. Ukuran/hasil kompresi gambar nyata bergantung isinya dan tidak dijamin sama dengan fixture.
