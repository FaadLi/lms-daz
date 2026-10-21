# Audit penyimpanan Tambah Laporan — 21 Oktober 2026

## Root cause terverifikasi

`CrudPanel` pada Child Detail memberi form create default `{ id: "", version: 0, child_id }` agar pemilihan jadwal/mata pelajaran mengetahui konteks murid. `version: 0` adalah penanda lokal, bukan versi record Supabase.

Sebelum perbaikan, `DraftRecordForm` sudah menganggapnya draft baru untuk namespace/entity ID, tetapi meneruskan `initial.version` tanpa normalisasi pada submit:

1. `RecordForm.onSave(..., { version: 0 })`.
2. `CrudPanel` memanggil `db.save(..., meta.version ?? null)`. Operator `??` mempertahankan angka 0.
3. `db.save` memanggil `lms_save_lesson_report` dengan `p_version: 0` dan UUID create baru dari draft.
4. RPC menolak `p_version` non-null ketika ID belum ada, melalui `PT409`: `Data changed or unavailable. Reload before saving.`
5. `errorMessage` menerjemahkannya menjadi `Data sudah berubah. Muat ulang sebelum menyimpan.`

Reproduksi browser nyata pada build sebelum perbaikan membuktikan HTTP 409 / PostgreSQL `PT409`, baik pada form baru maupun draft yang dipulihkan. Owner akun uji tetap memiliki nol laporan, UUID create tetap sama setelah restore, dan draft tidak terhapus. Ini bukan konflik dengan laporan yang sudah ada.

## Audit kontrak deployment

Sebelum perbaikan, Cloudflare menyajikan `/assets/index-0Ads9Pui.js`, identik byte-per-byte dengan build lokal. SHA-256: `9719c3f784279f47e2bcf74a56a8b56ece67cae947366cb774e60d7985e082ab`. Service worker menyebut asset yang sama. Bundle memakai project Supabase yang sama dan mendukung RPC/relasi multi-subject.

Supabase aktual memiliki migration terakhir `202610210013`, RPC dengan argumen `p_data, p_version`, dan RLS relasi nilai aktif. Reproduksi dilakukan dalam profil browser baru. Cache/PWA atau kontrak database yang tertinggal tidak diperlukan untuk memicu bug ini.

## Perbaikan minimum

Hanya `src/components/common/DataUI.tsx` berubah pada kode produksi:

- Optimistic version hanya berasal dari record dengan ID terisi dan versi positif.
- Penentuan draft entity ID, base version, dan metadata submit memakai nilai yang sama.
- Create mengirim versi `undefined` ke callback, lalu `null` ke RPC melalui data-access existing.
- Edit mempertahankan versi positif aslinya.
- UUID operasi draft tetap stabil. Draft lama create dengan `baseVersion: 0` tetap dapat dipulihkan; aturan stale draft untuk edit tetap berlaku.

Tidak ada perubahan RPC, migration, RLS, schema, UI, mekanisme retry, cache atau pengolahan gambar. Tidak ada reload paksa atau penghapusan draft ketika gagal.

## Hasil validasi

| Kasus | Hasil hosted |
|---|---|
| Create sebelum fix, form baru | HTTP 409, `PT409`, `p_version: 0`; tidak insert |
| Create sebelum fix, draft pulih | HTTP 409, `PT409`, `p_version: 0`; draft/UUID dipertahankan |
| Create setelah fix | HTTP 200, `p_version: null`; dua subject, rata-rata 85,5 |
| Respons create diputus setelah server commit | Form tetap menampilkan gagal; draft tetap ada; hanya satu request mutation dikirim |
| Draft dipulihkan lalu user menekan Simpan lagi | HTTP 200, UUID sama, versi tetap 1; tidak ada laporan tambahan |
| Edit melalui form | HTTP 200, `p_version: 1`; rata-rata menjadi 90 |
| Stale edit | HTTP 409, `PT409` |
| Dua edit bersamaan dengan versi 2 | Satu HTTP 200, satu HTTP 409 / `PT409`; versi akhir 3 |
| Create ulang dengan ID sama tetapi payload berbeda | HTTP 409 / `PT409`, pesan `Conflicting create request` |
| Sesi sama tetapi UUID baru | HTTP 409 / `23505`, unique constraint laporan jadwal/tanggal |
| Parent token-scoped | Satu laporan yang diizinkan; dua rincian subject dan akumulasi 90 konsisten |

HTTP 409 tidak otomatis berarti stale update: audit membedakan pemeriksaan versi pada ID baru, stale edit, conflicting create, dan unique violation berdasarkan payload operasi, kode PostgreSQL, pesan RPC, serta keadaan row.

- 65 tes / 8 file lulus, termasuk regresi `CrudPanel → RecordForm → data-access` pada create dan draft lama `baseVersion: 0`.
- Lint, typecheck dan production build lulus. Warning bundle >500 kB dan deprecation PWA existing tidak menghalangi build.
- Browser real Auth + hosted Supabase lulus, nol uncaught application errors. Seluruh akun/data uji dibersihkan.
- Bukti tanpa credentials/token/record body: `supabase/.temp/report-create-before.json` dan `report-create-after.json` (gitignored).

Perintah reproduksi/validasi:

```powershell
npm.cmd run build
npm.cmd run preview -- --host 127.0.0.1 --port 3000
node scripts/validate-live.mjs --audit-report-create
```

Flag `--expect-create-conflict` hanya digunakan untuk mereproduksi build sebelum perbaikan. Jangan menggunakannya sebagai ekspektasi pada build hasil perbaikan.

## File perubahan dan rollout

- `src/components/common/DataUI.tsx`: normalisasi optimistic version.
- `tests/reports.test.tsx`: regresi create scoped, restore draft lama, dan payload versi.
- `scripts/report-create-check.mjs`: audit kontrak read-only dan pemeriksaan form/RPC hosted dengan fixture sementara.
- `scripts/validate-live.mjs`: entry point `--audit-report-create`, memakai setup/cleanup existing.
- `docs/REPORT_CREATE_SAVE_FIX.md`: hasil audit ini.

**Perlu redeploy Cloudflare Pages** dengan build terbaru (`dist`; bundle lokal hasil perbaikan `/assets/index-Ck9E7cch.js`). Production masih menyajikan bundle sebelum fix saat audit akhir. Gunakan alur update PWA existing yang mempertahankan draft; tidak perlu clear localStorage atau memaksa reload user.

**Tidak perlu migration Supabase atau deployment Edge Function.** Kontrak database yang ada sudah benar, dan proteksi concurrent update tetap aktif.
