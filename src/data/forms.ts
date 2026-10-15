import type { Field, Entity } from "../types";
const required = (
  name: string,
  label: string,
  type: Field["type"] = "text",
): Field => ({ name, label, type, required: true });
const ref = (
  name: string,
  label: string,
  reference: Entity,
  optional = false,
): Field => ({
  name,
  label,
  reference,
  type: "reference",
  required: !optional,
});
export const childFields: Field[] = [
  required("full_name", "Nama lengkap"),
  required("nickname", "Panggilan"),
  required("birth_date", "Tanggal lahir", "date"),
  { ...required("gender", "Jenis kelamin", "select"), options: ["L", "P"] },
  required("grade_level", "Kelas"),
  required("start_date", "Mulai les", "date"),
  ref("parent_id", "Orang tua", "parents"),
  {
    ...required("relationship", "Hubungan", "select"),
    options: ["Ibu", "Ayah", "Wali"],
  },
  { name: "address", label: "Alamat" },
  { name: "notes", label: "Catatan", type: "textarea" },
  { name: "is_active", label: "Aktif", type: "checkbox" },
];
export const parentFields: Field[] = [
  required("full_name", "Nama wali"),
  required("whatsapp_number", "WhatsApp (62…)"),
  { name: "email", label: "Email" },
  { name: "address", label: "Alamat" },
];
export const fields: Partial<Record<Entity, Field[]>> = {
  parents: parentFields,
  children: childFields,
  subjects: [
    required("name", "Mata pelajaran"),
    { name: "is_active", label: "Aktif", type: "checkbox" },
  ],
  report_templates: [
    required("name", "Nama template"),
    ref("subject_id", "Mata pelajaran", "subjects"),
    required("topic", "Topik"),
    required("what_learned", "Materi", "textarea"),
    { name: "next_step", label: "Langkah berikutnya", type: "textarea" },
    { name: "home_practice", label: "Latihan rumah", type: "textarea" },
  ],
  schedules: [
    ref("child_id", "Murid", "children"),
    ref("subject_id", "Mata pelajaran", "subjects"),
    {
      ...required("day_of_week", "Hari (0 Minggu – 6 Sabtu)", "number"),
      min: 0,
      max: 6,
    },
    required("start_time", "Mulai", "time"),
    required("end_time", "Selesai", "time"),
    required("location", "Lokasi"),
    { name: "notes", label: "Catatan", type: "textarea" },
    { name: "is_active", label: "Aktif", type: "checkbox" },
  ],
  attendance: [
    ref("child_id", "Murid", "children"),
    ref("schedule_id", "Jadwal", "schedules", true),
    required("date", "Tanggal", "date"),
    {
      ...required("status", "Status", "select"),
      options: ["hadir", "izin", "sakit", "alpa"],
    },
    required("start_time", "Mulai", "time"),
    required("end_time", "Selesai", "time"),
    { name: "notes", label: "Catatan", type: "textarea" },
  ],
  lesson_reports: [
    ref("child_id", "Murid", "children"),
    ref("schedule_id", "Jadwal", "schedules", true),
    ref("subject_id", "Mata pelajaran", "subjects"),
    required("date", "Tanggal", "date"),
    {
      ...required("duration_minutes", "Durasi (menit)", "number"),
      min: 1,
      max: 1440,
    },
    required("topic", "Topik"),
    required("what_learned", "Materi yang dipelajari", "textarea"),
    required("learning_outcome", "Hasil yang diamati", "textarea"),
    { ...required("score", "Nilai", "number"), min: 0, max: 100 },
    { name: "teacher_notes", label: "Catatan guru", type: "textarea" },
    { name: "next_step", label: "Langkah berikutnya", type: "textarea" },
    { name: "home_practice", label: "Latihan rumah", type: "textarea" },
  ],
  invoices: [
    ref("child_id", "Murid", "children"),
    required("invoice_number", "Nomor tagihan"),
    required("period", "Periode", "month"),
    {
      ...required("package_type", "Jenis paket", "select"),
      options: ["per_pertemuan", "bulanan", "paket_sesi"],
    },
    {
      name: "session_count",
      label: "Jumlah sesi (paket sesi)",
      type: "number",
      min: 1,
    },
    {
      ...required("amount", "Nominal (Rp)", "number"),
      min: 1,
      max: 1000000000000,
    },
    required("due_date", "Jatuh tempo", "date"),
    { name: "notes", label: "Catatan", type: "textarea" },
  ],
};
export const profileFields: Field[] = [
  required("name", "Nama guru"),
  { name: "phone", label: "Telepon" },
  { name: "institution_name", label: "Nama lembaga" },
];
export const paymentFields: Field[] = [
  { ...required("amount", "Nominal dibayar (Rp)", "number"), min: 1 },
  required("date", "Tanggal pembayaran", "date"),
  {
    ...required("method", "Metode", "select"),
    options: ["Transfer Bank", "Tunai", "E-Wallet"],
  },
  { name: "notes", label: "Catatan" },
];
