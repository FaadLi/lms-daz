export type UserRole = 'admin_guru';

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  avatarUrl?: string;
  institutionName?: string;
}

export interface Parent {
  id: string;
  fullName: string;
  whatsappNumber: string;
  relationship: 'Ibu' | 'Ayah' | 'Wali';
  email?: string;
  address?: string;
}

export type Gender = 'L' | 'P';

export interface Child {
  id: string;
  fullName: string;
  nickname: string;
  avatarUrl: string;
  birthDate: string;
  gender: Gender;
  gradeLevel: string; // e.g. "Kelas 3 SD"
  address?: string;
  notes?: string;
  isActive: boolean;
  startDate: string;
  parentId: string;
  parent?: Parent;
}

export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Minggu, 1 = Senin, ...

export interface Schedule {
  id: string;
  childId: string;
  dayOfWeek: DayOfWeek;
  startTime: string; // "17:00"
  endTime: string;   // "18:00"
  durationMinutes: number;
  subject: string;   // "Matematika", "Bahasa Inggris", "Membaca"
  location: string;  // "Rumah Murid", "Studio Guru", "Online"
  notes?: string;
  isRecurring: boolean;
}

export type AttendanceStatus = 'hadir' | 'izin' | 'sakit' | 'alpa';

export interface Attendance {
  id: string;
  childId: string;
  date: string; // "2026-10-13"
  status: AttendanceStatus;
  startTime?: string;
  endTime?: string;
  notes?: string;
}

export type ScoreCategory = 'sangat_baik' | 'berkembang_baik' | 'perlu_latihan' | 'perlu_pendampingan';

export interface LessonPhoto {
  id: string;
  reportId?: string;
  childId: string;
  url: string;
  caption?: string;
  createdAt: string;
}

export interface LessonReport {
  id: string;
  childId: string;
  scheduleId?: string;
  date: string; // "2026-10-13"
  durationMinutes: number;
  subject: string;
  topic: string;
  whatLearned: string;
  learningOutcome: string;
  score: number; // 0 - 100
  scoreCategory: ScoreCategory;
  teacherNotes: string;
  nextStep: string;
  homePractice: string;
  photos: LessonPhoto[];
  sharedViaWhatsapp: boolean;
  sharedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type PaymentPackageType = 'per_pertemuan' | 'bulanan' | 'paket_sesi';
export type PaymentStatus = 'lunas' | 'belum_lunas' | 'jatuh_tempo' | 'sebagian';

export interface PaymentTransaction {
  id: string;
  paymentId: string;
  amount: number;
  date: string;
  method: 'Transfer Bank' | 'Tunai' | 'E-Wallet';
  notes?: string;
}

export interface PaymentRecord {
  id: string;
  childId: string;
  period: string; // "Oktober 2026"
  packageType: PaymentPackageType;
  sessionCount?: number;
  amount: number;
  paidAmount: number;
  dueDate: string;
  status: PaymentStatus;
  paidDate?: string;
  notes?: string;
  transactions: PaymentTransaction[];
}

export interface Comment {
  id: string;
  reportId?: string;
  childId: string;
  senderRole: 'guru' | 'orang_tua';
  senderName: string;
  message: string;
  createdAt: string;
  isReadByGuru: boolean;
}

export interface PrivateReportToken {
  token: string;
  childId: string;
  createdAt: string;
  expiresAt?: string;
  isRevoked: boolean;
  accessCount: number;
  lastAccessedAt?: string;
}

export interface AuditLog {
  id: string;
  action: string;
  entity: string;
  entityId: string;
  timestamp: string;
  details?: string;
}
