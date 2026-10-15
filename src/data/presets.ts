import type { PaymentStatus, ScoreCategory } from "../types";
export const DAY_NAMES = [
  "Minggu",
  "Senin",
  "Selasa",
  "Rabu",
  "Kamis",
  "Jumat",
  "Sabtu",
];
export function todayJakarta(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function getScoreCategory(score: number): ScoreCategory {
  return score >= 90
    ? "sangat_baik"
    : score >= 80
      ? "berkembang_baik"
      : score >= 70
        ? "perlu_latihan"
        : "perlu_pendampingan";
}
export function getScoreCategoryLabel(category: ScoreCategory) {
  return {
    sangat_baik: "Sangat Baik",
    berkembang_baik: "Berkembang Baik",
    perlu_latihan: "Perlu Latihan",
    perlu_pendampingan: "Perlu Pendampingan",
  }[category];
}
export function getScoreCategoryStyle(category: ScoreCategory) {
  const color = {
    sangat_baik: ["bg-emerald-50", "text-emerald-700", "border-emerald-200"],
    berkembang_baik: ["bg-indigo-50", "text-indigo-700", "border-indigo-200"],
    perlu_latihan: ["bg-amber-50", "text-amber-700", "border-amber-200"],
    perlu_pendampingan: ["bg-rose-50", "text-rose-700", "border-rose-200"],
  }[category];
  return { bg: color[0], text: color[1], border: color[2] };
}
export function formatRupiah(amount: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}
export function formatDateIndo(value: string) {
  return value
    ? new Intl.DateTimeFormat("id-ID", {
        timeZone: "Asia/Jakarta",
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(
        new Date(value.length === 10 ? `${value}T12:00:00+07:00` : value),
      )
    : "";
}
export function formatShortDateIndo(value: string) {
  return value
    ? new Intl.DateTimeFormat("id-ID", {
        timeZone: "Asia/Jakarta",
        day: "numeric",
        month: "short",
      }).format(new Date(`${value.slice(0, 10)}T12:00:00+07:00`))
    : "";
}
export function paymentStatus(
  amount: number,
  paid: number,
  due: string,
  now = new Date(),
): PaymentStatus {
  return paid >= amount
    ? "lunas"
    : due < todayJakarta(now)
      ? "jatuh_tempo"
      : paid > 0
        ? "sebagian"
        : "belum_lunas";
}

export function getPaymentStatusLabel(status: PaymentStatus): string {
  switch (status) {
    case "lunas":
      return "Lunas";
    case "belum_lunas":
      return "Belum Lunas";
    case "jatuh_tempo":
      return "Jatuh Tempo";
    case "sebagian":
      return "Sebagian";
    default:
      return status;
  }
}

export function getPaymentStatusStyle(status: PaymentStatus): {
  bg: string;
  text: string;
  border: string;
} {
  switch (status) {
    case "lunas":
      return { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" };
    case "belum_lunas":
      return { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" };
    case "jatuh_tempo":
      return { bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200" };
    case "sebagian":
      return { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" };
    default:
      return { bg: "bg-slate-50", text: "text-slate-700", border: "border-slate-200" };
  }
}

export function getAttendanceLabel(status: string): string {
  switch (status) {
    case "hadir":
      return "Hadir";
    case "izin":
      return "Izin";
    case "sakit":
      return "Sakit";
    case "alpa":
      return "Alpa";
    default:
      return status;
  }
}

export function getAttendanceStyle(status: string): {
  bg: string;
  text: string;
  border: string;
} {
  switch (status) {
    case "hadir":
      return { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" };
    case "izin":
      return { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" };
    case "sakit":
      return { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" };
    case "alpa":
      return { bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200" };
    default:
      return { bg: "bg-slate-50", text: "text-slate-700", border: "border-slate-200" };
  }
}

