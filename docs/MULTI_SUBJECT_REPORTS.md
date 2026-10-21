# Laporan les multi-mata pelajaran

Implementasi dan validasi development: 21 Oktober 2026. Arsitektur tetap React/Vite, Supabase, private Storage `lms_media`, dan static Cloudflare Pages (`npm run build` → `dist`).

## Migrasi dan schema final

- `202610210012_report_subjects.sql`: backfill, relasi nilai, ownership/RLS, invariant nilai akumulasi, RPC atomik, routing CRUD lama, dan proyeksi parent.
- `202610210013_parent_report_compatibility.sql`: mempertahankan properti `subject.name` pada payload parent untuk frontend lama selama rollout. Migrasi 012 yang sudah diterapkan tidak diedit.
- Keduanya diterapkan pada Supabase development `zfpfccznrbotrvfqcdzh`.

Tabel baru `public.lms_lesson_report_subjects`:

| Kolom | Tipe / aturan |
|---|---|
| `report_id` | UUID wajib; bersama `subject_id` menjadi primary key / unique pair |
| `subject_id` | UUID wajib |
| `owner_id` | UUID wajib; FK `auth.users` |
| `score` | numeric wajib; 0–100 |
| `created_at` | timestamptz wajib; default `now()` |

Composite FK `(owner_id, report_id)` mengacu ke laporan milik owner yang sama (`ON DELETE CASCADE`). Composite FK `(owner_id, subject_id)` mengacu ke mata pelajaran milik owner yang sama (`ON DELETE RESTRICT`). Index owner/report/subject dan owner/subject/report mendukung query relasi dan statistik per mata pelajaran.

RLS hanya mengizinkan guru membaca baris miliknya. Anonymous tidak mendapat akses tabel. Write langsung oleh authenticated ke laporan dan relasi ditolak; perubahan melalui `lms_save_lesson_report(jsonb, integer)`. Service role tetap untuk operasi server yang sudah ada.

Kolom laporan lama **tetap ada**:

- `subject_id`: satu referensi kompatibilitas, selalu termasuk mata pelajaran laporan. Referensi lama dipertahankan jika masih dipilih; jika dihapus, dipilih ID subject pertama secara deterministik.
- `score`: diubah dari integer menjadi numeric, berisi proyeksi rata-rata rincian nilai. Bukan input manual.
- ID, versi, timestamp, shared state, foto, komentar, audit, dan relasi laporan lama dipertahankan saat backfill.

Deferred constraint trigger menolak transaksi yang berakhir tanpa mata pelajaran, memiliki `score` tidak sesuai rata-rata, atau memiliki referensi subject lama di luar rincian. Invariant juga berlaku pada privileged SQL; perbaikan melalui SQL harus memperbarui laporan dan rincian dalam satu transaksi.

## Penyimpanan dan aturan bisnis

Contoh payload RPC:

```json
{
  "p_data": {
    "id": "UUID laporan",
    "child_id": "UUID murid",
    "schedule_id": null,
    "date": "2026-10-21",
    "duration_minutes": 60,
    "topic": "Topik",
    "what_learned": "Materi",
    "learning_outcome": "Hasil belajar",
    "subject_scores": [
      { "subject_id": "UUID matematika", "score": 90 },
      { "subject_id": "UUID IPA", "score": 80 }
    ]
  },
  "p_version": null
}
```

Semua write laporan/rincian atomik. Update harus menyertakan versi yang dibaca form. Advisory lock owner mengikuti urutan lock jadwal; row lock dan verifikasi versi menghasilkan `PT409` / HTTP 409 pada stale edit. Retry create identik memakai ID yang sama tidak menggandakan laporan; payload berbeda dengan ID sama ditolak.

Laporan dari jadwal hanya boleh memakai subset `lms_schedule_subjects` dan murid yang sesuai. Tanpa jadwal, penambahan hanya untuk mata pelajaran aktif milik guru. Mata pelajaran nonaktif yang sudah tersimpan pada laporan tanpa jadwal dapat dipertahankan saat edit sejarah. Data sejarah tidak dihapus ketika jadwal berubah; jika tidak lagi sesuai, penyimpanan meminta guru memperbaiki pilihan atau melepaskan jadwal secara eksplisit.

Caller lama melalui `lms_save_record('lms_lesson_reports', ...)` diarahkan ke RPC yang sama. Payload `subject_id`/`score` lama didukung untuk satu mata pelajaran. Caller lama yang mencoba mengganti nilai laporan multi-subject mendapat HTTP 409 agar tidak menimpa rincian.

Nilai akumulasi dihitung server dengan `round(avg(score), 1)` dari rincian yang dipilih, bobot sama. Contoh: 90/80/70 → 80; 91/80 → 85,5; 0/100/100 → 66,7. Nol termasuk nilai valid. Subject dihapus tidak dihitung. Preview form menggunakan aturan yang sama; angka akhir selalu berasal dari Supabase.

## Form, draft, dan tampilan

- Form existing mengganti subject tunggal/nilai manual menjadi checkbox pilihan dan input nilai per subject. Pilihan mengikuti jadwal; tanpa jadwal tersedia pencarian/paginasi subject aktif.
- Nilai cepat tersedia per subject. Preview akumulasi berubah langsung. Minimal satu subject dan semua nilai harus valid.
- Edit memuat seluruh nilai melalui satu nested relational select. Hydration nama untuk pilihan draft menggunakan batch query, bukan query per subject.
- Perubahan jadwal tidak menghapus nilai input. Pilihan yang tidak sesuai ditandai dan server menolak penyimpanan. Menghapus subject bernilai meminta konfirmasi.
- Draft tetap memakai namespace user/form/entity, debounce dan stale-version resolution existing. Hanya struktur `subject_scores` yang diizinkan secara khusus: `subject_id` dan `score`, tanpa object bebas/credentials/File. Draft lama satu subject dikonversi bila perubahan schema tepat sesuai migrasi fitur ini. Gagal/offline tidak menghapus draft; sukses Supabase baru membersihkannya.
- Template tetap mengisi topik, materi, langkah berikutnya, dan latihan rumah; tidak menimpa subject atau nilai yang dipilih.
- Riwayat/Child Detail dan Parent Portal menampilkan semua nama subject, rincian nilai, dan nilai keseluruhan. Materi, hasil belajar, catatan, foto, komentar, dan latihan tetap tampil.
- Grafik progress menggunakan `report.score` yang dijaga database sebagai akumulasi. Rata-rata/tren ditampilkan maksimal satu desimal. Dashboard existing menghitung jumlah laporan/sesi, sehingga satu laporan tetap dihitung satu kali. Tidak ada statistik per-subject terpisah pada UI existing.
- Parent membaca hanya melalui Edge/RPC token existing, tetap dibatasi owner/murid/report, expiry dan revocation. Tidak ada akses anonymous ke tabel rincian nilai. Edge tidak memerlukan deployment baru karena payload RPC diteruskan secara generik.

## Bukti migrasi data existing

Snapshot sebelum/sesudah migrasi menunjukkan **5 laporan → 5 relasi nilai**, tanpa mismatch owner atau rata-rata. Hash seluruh baris laporan, media, komentar dan audit tetap sama. ID, versi, timestamp, nilai lama dan seluruh referensi dipertahankan. Bukti lokal tanpa record body/credentials berada pada `supabase/.temp/report-subjects-before.json` dan `report-subjects-after.json` (gitignored).

## Validasi

- `npm.cmd test`: 64 tes lulus, 8 file. Termasuk 27 tes database dan 7 tes fitur laporan/draft/UI.
- `npm.cmd run lint`, `typecheck`, `typecheck:edge`, `build`: lulus.
- `node scripts/report-migration-check.mjs before|after`: schema aktual, preservation hash, FK/ownership, RLS, denied direct writes, dan konsistensi akumulasi.
- `node scripts/validate-live.mjs`: real Auth, relational select hosted, laporan single/multi, angka desimal, edit subset, rollback validasi, dua akun, anonymous denial, HTTP 409 concurrency, parent detail/scope, token expiry/revoke, storage/media, attendance, payment; lulus. Akun/data sementara dibersihkan.
- Browser: `npm.cmd run preview -- --host 127.0.0.1 --port 3000`, kemudian `node scripts/validate-live.mjs --browser`. Port 3000 memakai development origin dalam allowlist CORS existing. Edit hydration, preview desimal, layout desktop/mobile, recovery draft setelah save gagal, clear draft setelah save berhasil, parent tanpa session guru, dan zero browser errors lulus. Script memakai akun sementara di memori; tidak menyimpan password/token ke file. Screenshot dan hasil berada di `supabase/.temp/report-*.png` / `report-browser-results.json`.

## File yang berubah

Database:

- `supabase/migrations/202610210012_report_subjects.sql`
- `supabase/migrations/202610210013_parent_report_compatibility.sql`

Frontend:

- `src/types/index.ts`
- `src/data/forms.ts`
- `src/utils/reports.ts`
- `src/services/db.ts`
- `src/services/drafts.ts`
- `src/components/common/DataUI.tsx`
- `src/components/common/ReportSubjectInput.tsx`
- `src/components/common/ReportScores.tsx`
- `src/components/common/ProgressChart.tsx`
- `src/components/admin/CrudPanel.tsx`
- `src/components/admin/TemplatePicker.tsx`
- `src/components/parent/ParentPortal.tsx`

Validasi/dokumentasi:

- `tests/database.test.ts`
- `tests/schedules.test.tsx`
- `tests/reports.test.tsx`
- `scripts/report-migration-check.mjs`
- `scripts/report-browser-check.mjs`
- `scripts/validate-live.mjs`
- `docs/MULTI_SUBJECT_REPORTS.md`

## Batas rollout

Frontend production belum dipublikasikan ke Cloudflare Pages; `dist` siap mengikuti pipeline existing. Kolom kompatibilitas tidak dihapus. Build masih memberi warning ukuran chunk di atas 500 kB dan deprecation `inlineDynamicImports` dari toolchain PWA; build tetap sukses. Tidak ada refactor/deployment di luar fitur laporan.
