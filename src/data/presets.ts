import { ScoreCategory, AttendanceStatus, PaymentStatus } from '../types';

export function getScoreCategory(score: number): ScoreCategory {
  if (score >= 90) return 'sangat_baik';
  if (score >= 80) return 'berkembang_baik';
  if (score >= 70) return 'perlu_latihan';
  return 'perlu_pendampingan';
}

export function getScoreCategoryLabel(category: ScoreCategory): string {
  switch (category) {
    case 'sangat_baik':
      return 'Sangat Baik';
    case 'berkembang_baik':
      return 'Berkembang Baik';
    case 'perlu_latihan':
      return 'Perlu Latihan';
    case 'perlu_pendampingan':
      return 'Perlu Pendampingan';
  }
}

export function getScoreCategoryStyle(category: ScoreCategory): {
  bg: string;
  text: string;
  border: string;
} {
  switch (category) {
    case 'sangat_baik':
      return {
        bg: 'bg-emerald-50 dark:bg-emerald-950/40',
        text: 'text-emerald-700 dark:text-emerald-300',
        border: 'border-emerald-200 dark:border-emerald-800',
      };
    case 'berkembang_baik':
      return {
        bg: 'bg-indigo-50 dark:bg-indigo-950/40',
        text: 'text-indigo-700 dark:text-indigo-300',
        border: 'border-indigo-200 dark:border-indigo-800',
      };
    case 'perlu_latihan':
      return {
        bg: 'bg-amber-50 dark:bg-amber-950/40',
        text: 'text-amber-700 dark:text-amber-300',
        border: 'border-amber-200 dark:border-amber-800',
      };
    case 'perlu_pendampingan':
      return {
        bg: 'bg-rose-50 dark:bg-rose-950/40',
        text: 'text-rose-700 dark:text-rose-300',
        border: 'border-rose-200 dark:border-rose-800',
      };
  }
}

export const QUICK_SCORES = [60, 70, 75, 80, 85, 90, 95, 100];

export const SUBJECT_OPTIONS = [
  'Membaca',
  'Matematika',
  'Bahasa Inggris',
  'Menulis & Dikte',
  'IPA Dasar',
  'Mengaji / Iqra',
  'Tematik SD',
];

export interface ReportTemplate {
  id: string;
  subject: string;
  topic: string;
  whatLearned: string;
  learningOutcome: string;
  score: number;
  teacherNotes: string;
  nextStep: string;
  homePractice: string;
}

export const REPORT_TEMPLATES: ReportTemplate[] = [
  {
    id: 'tmpl-membaca-1',
    subject: 'Membaca',
    topic: 'Membaca kata dua suku kata (KV-KV)',
    whatLearned: 'Latihan membaca gabungan huruf konsonan dan vokal terbuka (pola ba-ca, ma-ma, bu-ku).',
    learningOutcome: 'Anak mampu membaca 8 dari 10 kata dengan lancar dan artikulasi jelas tanpa mengeja lama.',
    score: 85,
    teacherNotes: 'Anak mulai lebih percaya diri saat membaca dan antusias menyelesaikan kartu kata.',
    nextStep: 'Mulai latihan membaca kalimat pendek sederhana (3 kata).',
    homePractice: 'Membaca 5 kalimat pendek dari buku cerita bersama orang tua selama 10 menit.',
  },
  {
    id: 'tmpl-matematika-1',
    subject: 'Matematika',
    topic: 'Penjumlahan dan Pengurangan Bersusun',
    whatLearned: 'Konsep penjumlahan dua digit dengan teknik menyimpan menggunakan manipulatif blok.',
    learningOutcome: 'Menyelesaikan 12 dari 15 soal latihan dengan benar secara mandiri.',
    score: 88,
    teacherNotes: 'Sangat teliti dalam menghitung nilai puluhan dan satuan.',
    nextStep: 'Pengenalan soal cerita pengurangan bersusun teknik meminjam.',
    homePractice: 'Latihan 5 soal cerita sehari-hari (misal menghitung uang saku / buah di kulkas).',
  },
  {
    id: 'tmpl-inggris-1',
    subject: 'Bahasa Inggris',
    topic: 'Daily Activities & Phonics Dasar',
    whatLearned: 'Kosakata kegiatan pagi hari (wake up, brush teeth, eat breakfast) serta bunyi short vowel "a".',
    learningOutcome: 'Dapat melafalkan 6 frasa baru dengan tepat dan menjawab pertanyaan sederhana.',
    score: 90,
    teacherNotes: 'Pronunciation sangat bagus dan berani menjawab dengan suara lantang.',
    nextStep: 'Latihan menyusun kalimat tanya "What time do you wake up?".',
    homePractice: 'Menonton video lagu anak Bahasa Inggris 5 menit dan mengulang kata baru.',
  },
  {
    id: 'tmpl-menulis-1',
    subject: 'Menulis & Dikte',
    topic: 'Menulis Rapi Huruf Tegak Bersambung',
    whatLearned: 'Proporsi tinggi huruf gantung (g, j, y) dan huruf menjulang (b, d, k, l).',
    learningOutcome: 'Tulisan rapi berada di garis buku halus dan spasi antar kata konsisten.',
    score: 82,
    teacherNotes: 'Kecepatan menulis meningkat, pegangan pensil sudah semakin ergonomis.',
    nextStep: 'Dikte 1 paragraf pendek 4 baris.',
    homePractice: 'Menyalin 3 baris catatan harian di buku halus.',
  },
];

export function getAttendanceLabel(status: AttendanceStatus): string {
  switch (status) {
    case 'hadir':
      return 'Hadir';
    case 'izin':
      return 'Izin';
    case 'sakit':
      return 'Sakit';
    case 'alpa':
      return 'Tidak Hadir';
  }
}

export function getAttendanceStyle(status: AttendanceStatus): {
  bg: string;
  text: string;
  dot: string;
} {
  switch (status) {
    case 'hadir':
      return {
        bg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        text: 'text-emerald-700',
        dot: 'bg-emerald-500',
      };
    case 'izin':
      return {
        bg: 'bg-blue-50 text-blue-700 border-blue-200',
        text: 'text-blue-700',
        dot: 'bg-blue-500',
      };
    case 'sakit':
      return {
        bg: 'bg-amber-50 text-amber-700 border-amber-200',
        text: 'text-amber-700',
        dot: 'bg-amber-500',
      };
    case 'alpa':
      return {
        bg: 'bg-rose-50 text-rose-700 border-rose-200',
        text: 'text-rose-700',
        dot: 'bg-rose-500',
      };
  }
}

export function getPaymentStatusLabel(status: PaymentStatus): string {
  switch (status) {
    case 'lunas':
      return 'Lunas';
    case 'belum_lunas':
      return 'Belum Lunas';
    case 'jatuh_tempo':
      return 'Jatuh Tempo';
    case 'sebagian':
      return 'Sebagian';
  }
}

export function getPaymentStatusStyle(status: PaymentStatus): {
  bg: string;
  text: string;
  border: string;
} {
  switch (status) {
    case 'lunas':
      return {
        bg: 'bg-emerald-50 text-emerald-700',
        text: 'text-emerald-700',
        border: 'border-emerald-200',
      };
    case 'belum_lunas':
      return {
        bg: 'bg-amber-50 text-amber-700',
        text: 'text-amber-700',
        border: 'border-amber-200',
      };
    case 'jatuh_tempo':
      return {
        bg: 'bg-rose-50 text-rose-700',
        text: 'text-rose-700',
        border: 'border-rose-200',
      };
    case 'sebagian':
      return {
        bg: 'bg-blue-50 text-blue-700',
        text: 'text-blue-700',
        border: 'border-blue-200',
      };
  }
}

export function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export const DAY_NAMES = [
  'Minggu',
  'Senin',
  'Selasa',
  'Rabu',
  'Kamis',
  'Jumat',
  'Sabtu',
];

export function formatDateIndo(dateStr: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

export function formatShortDateIndo(dateStr: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'short',
  }).format(date);
}
