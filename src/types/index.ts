// UI entities retain their route/form keys; physical database tables are namespaced.
export type Entity =
  | "profiles"
  | "parents"
  | "children"
  | "subjects"
  | "report_templates"
  | "schedules"
  | "attendance"
  | "lesson_reports"
  | "invoices"
  | "comments"
  | "media_assets";
export type Table = `lms_${Entity}` | "lms_payment_transactions";
export interface Row {
  id: string;
  version: number;
  [key: string]: unknown;
}
export interface Page {
  items: Row[];
  total: number;
}
export type ScoreCategory =
  "sangat_baik" | "berkembang_baik" | "perlu_latihan" | "perlu_pendampingan";
export type AttendanceStatus = "hadir" | "izin" | "sakit" | "alpa";
export type PaymentStatus =
  "lunas" | "belum_lunas" | "jatuh_tempo" | "sebagian";
export interface Field {
  name: string;
  label: string;
  type?:
    | "text"
    | "textarea"
    | "date"
    | "month"
    | "time"
    | "number"
    | "checkbox"
    | "select"
    | "reference";
  required?: boolean;
  min?: number;
  max?: number;
  options?: readonly string[];
  reference?: Entity;
  searchColumn?: string;
  childId?: string;
}
