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
