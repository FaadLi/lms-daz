import {
  User,
  Child,
  Parent,
  Schedule,
  Attendance,
  LessonReport,
  LessonPhoto,
  PaymentRecord,
  Comment,
  PrivateReportToken,
  AuditLog,
} from '../types';
import { generateSecureToken } from './security';
import { getScoreCategory } from '../data/presets';

const STORAGE_KEY_PREFIX = 'lesreport_';

// Initial Demo Data
const INITIAL_TEACHER: User = {
  id: 'usr_teacher_sarah',
  name: 'Sarah Rahmawati, S.Pd.',
  email: 'sarah.tutor@example.com',
  phone: '081288990011',
  role: 'admin_guru',
  avatarUrl: 'https://images.unsplash.com/photo-1544717305-2782549b5136?w=150&auto=format&fit=crop&q=80',
  institutionName: 'Bimbel & Les Privat Bintang Juara',
};

const INITIAL_PARENTS: Parent[] = [
  {
    id: 'par_fitri',
    fullName: 'Ibu Fitriani Santoso',
    whatsappNumber: '081234567890',
    relationship: 'Ibu',
    email: 'fitriani.s@example.com',
    address: 'Jl. Melati Indah No. 14, Jakarta Selatan',
  },
  {
    id: 'par_hendra',
    fullName: 'Bapak Hendra Pratama',
    whatsappNumber: '081298765432',
    relationship: 'Ayah',
    email: 'hendra.p@example.com',
    address: 'Jl. Kemang Raya Blok B No. 7, Jakarta Selatan',
  },
  {
    id: 'par_maya',
    fullName: 'Ibu Maya Anggraini',
    whatsappNumber: '085712349876',
    relationship: 'Ibu',
    email: 'maya.ang@example.com',
    address: 'Jl. Cempaka Putih Timur No. 28, Jakarta Pusat',
  },
];

const INITIAL_CHILDREN: Child[] = [
  {
    id: 'ch_aisyah',
    fullName: 'Aisyah Putri Ramadhani',
    nickname: 'Aisyah',
    avatarUrl: '/src/assets/images/avatar_aisyah_1791905355087.jpg',
    birthDate: '2018-05-14',
    gender: 'P',
    gradeLevel: 'Kelas 3 SD',
    address: 'Jl. Melati Indah No. 14, Jakarta Selatan',
    notes: 'Sangat menyukai cerita binatang. Sedang fokus kelancaran membaca dan pemahaman teks pendek.',
    isActive: true,
    startDate: '2026-08-01',
    parentId: 'par_fitri',
  },
  {
    id: 'ch_budi',
    fullName: 'Budi Santoso',
    nickname: 'Budi',
    avatarUrl: '/src/assets/images/avatar_budi_1791905378587.jpg',
    birthDate: '2017-09-20',
    gender: 'L',
    gradeLevel: 'Kelas 4 SD',
    address: 'Jl. Kemang Raya Blok B No. 7, Jakarta Selatan',
    notes: 'Aktif dan senang belajar dengan media visual / flashcard. Fokus peningkatan kosakata bahasa Inggris.',
    isActive: true,
    startDate: '2026-08-15',
    parentId: 'par_hendra',
  },
  {
    id: 'ch_citra',
    fullName: 'Citra Lestari',
    nickname: 'Citra',
    avatarUrl: '/src/assets/images/avatar_citra_1791905378964.jpg',
    birthDate: '2019-11-03',
    gender: 'P',
    gradeLevel: 'Kelas 1 SD',
    address: 'Jl. Cempaka Putih Timur No. 28, Jakarta Pusat',
    notes: 'Cepat tanggap, belajar membaca permulaan dan penjumlahan dasar 1-20.',
    isActive: true,
    startDate: '2026-09-01',
    parentId: 'par_maya',
  },
];

const INITIAL_TOKENS: PrivateReportToken[] = [
  {
    token: 'pr_aisyah_8fH29kLm72qR4p',
    childId: 'ch_aisyah',
    createdAt: '2026-08-01T10:00:00Z',
    isRevoked: false,
    accessCount: 19,
    lastAccessedAt: '2026-10-13T07:15:00Z',
  },
  {
    token: 'pr_budi_9mX42jVn81wY3z',
    childId: 'ch_budi',
    createdAt: '2026-08-15T10:00:00Z',
    isRevoked: false,
    accessCount: 12,
    lastAccessedAt: '2026-10-12T19:40:00Z',
  },
  {
    token: 'pr_citra_5kL78pQs34rT9b',
    childId: 'ch_citra',
    createdAt: '2026-09-01T10:00:00Z',
    isRevoked: false,
    accessCount: 7,
    lastAccessedAt: '2026-10-11T16:20:00Z',
  },
];

const INITIAL_SCHEDULES: Schedule[] = [
  {
    id: 'sch_aisyah_1',
    childId: 'ch_aisyah',
    dayOfWeek: 2, // Selasa
    startTime: '09:00',
    endTime: '10:00',
    durationMinutes: 60,
    subject: 'Membaca & Bahasa',
    location: 'Rumah Murid',
    notes: 'Bawa buku cerita fabel bergambar',
    isRecurring: true,
  },
  {
    id: 'sch_aisyah_2',
    childId: 'ch_aisyah',
    dayOfWeek: 4, // Kamis
    startTime: '17:00',
    endTime: '18:00',
    durationMinutes: 60,
    subject: 'Matematika Dasar',
    location: 'Rumah Murid',
    notes: 'Latihan soal penjumlahan bersusun',
    isRecurring: true,
  },
  {
    id: 'sch_budi_1',
    childId: 'ch_budi',
    dayOfWeek: 2, // Selasa
    startTime: '13:00',
    endTime: '14:00',
    durationMinutes: 60,
    subject: 'Bahasa Inggris',
    location: 'Studio Guru',
    notes: 'Modul Unit 3: Daily Routine',
    isRecurring: true,
  },
  {
    id: 'sch_citra_1',
    childId: 'ch_citra',
    dayOfWeek: 2, // Selasa
    startTime: '18:00',
    endTime: '19:00',
    durationMinutes: 60,
    subject: 'Membaca Permulaan',
    location: 'Rumah Murid',
    notes: 'Kartu suku kata terbuka',
    isRecurring: true,
  },
];

const INITIAL_ATTENDANCE: Attendance[] = [
  {
    id: 'att_a1',
    childId: 'ch_aisyah',
    date: '2026-10-13',
    status: 'hadir',
    startTime: '09:00',
    endTime: '10:00',
    notes: 'Datang tepat waktu dan sangat fokus.',
  },
  {
    id: 'att_a2',
    childId: 'ch_aisyah',
    date: '2026-10-08',
    status: 'hadir',
    startTime: '17:00',
    endTime: '18:00',
  },
  {
    id: 'att_a3',
    childId: 'ch_aisyah',
    date: '2026-10-06',
    status: 'hadir',
    startTime: '09:00',
    endTime: '10:00',
  },
  {
    id: 'att_a4',
    childId: 'ch_aisyah',
    date: '2026-10-01',
    status: 'hadir',
    startTime: '17:00',
    endTime: '18:00',
  },
  {
    id: 'att_a5',
    childId: 'ch_aisyah',
    date: '2026-09-29',
    status: 'izin',
    notes: 'Acara keluarga di luar kota.',
  },
  {
    id: 'att_b1',
    childId: 'ch_budi',
    date: '2026-10-13',
    status: 'hadir',
    startTime: '13:00',
    endTime: '14:00',
  },
  {
    id: 'att_c1',
    childId: 'ch_citra',
    date: '2026-10-13',
    status: 'hadir',
    startTime: '18:00',
    endTime: '19:00',
  },
];

const INITIAL_REPORTS: LessonReport[] = [
  {
    id: 'rep_aisyah_4',
    childId: 'ch_aisyah',
    date: '2026-10-13',
    durationMinutes: 60,
    subject: 'Membaca',
    topic: 'Membaca kata dua suku kata (KV-KV)',
    whatLearned: 'Latihan membaca gabungan huruf konsonan dan vokal terbuka dengan pola kata ba-ca, bu-ku, ma-ta.',
    learningOutcome: 'Aisyah dapat membaca 8 dari 10 kata secara mandiri tanpa bantuan mengeja.',
    score: 85,
    scoreCategory: 'berkembang_baik',
    teacherNotes: 'Aisyah mulai lebih percaya diri saat membaca. Tidak ragu-ragu saat menemui huruf vokal ganda.',
    nextStep: 'Mulai latihan membaca kalimat pendek berisi 3-4 kata.',
    homePractice: 'Membaca 5 kalimat pendek dari buku cerita bersama Ibu/Ayah selama 10 menit.',
    photos: [
      {
        id: 'ph_1',
        reportId: 'rep_aisyah_4',
        childId: 'ch_aisyah',
        url: '/src/assets/images/activity_reading_1791905380254.jpg',
        caption: 'Aisyah fokus menyusun kartu kata berpola KV-KV.',
        createdAt: '2026-10-13T10:05:00Z',
      },
    ],
    sharedViaWhatsapp: true,
    sharedAt: '2026-10-13T10:10:00Z',
    createdAt: '2026-10-13T10:00:00Z',
    updatedAt: '2026-10-13T10:00:00Z',
  },
  {
    id: 'rep_aisyah_3',
    childId: 'ch_aisyah',
    date: '2026-10-08',
    durationMinutes: 60,
    subject: 'Matematika Dasar',
    topic: 'Penjumlahan bersusun dengan teknik menyimpan',
    whatLearned: 'Memahami nilai tempat puluhan dan satuan serta proses menyimpan 1 pada kolom puluhan.',
    learningOutcome: 'Menyelesaikan 9 dari 10 soal latihan tanpa kesalahan perhitungan dasar.',
    score: 90,
    scoreCategory: 'sangat_baik',
    teacherNotes: 'Sangat teliti. Konsep nilai tempat sudah dipahami dengan baik.',
    nextStep: 'Latihan variasi soal cerita penjumlahan sehari-hari.',
    homePractice: 'Mengerjakan lembar kerja 3 soal cerita belanja sederhana.',
    photos: [
      {
        id: 'ph_2',
        reportId: 'rep_aisyah_3',
        childId: 'ch_aisyah',
        url: '/src/assets/images/activity_math_1791905380233.jpg',
        caption: 'Praktik hitung menggunakan blok warna puluhan.',
        createdAt: '2026-10-08T18:05:00Z',
      },
    ],
    sharedViaWhatsapp: true,
    sharedAt: '2026-10-08T18:15:00Z',
    createdAt: '2026-10-08T18:00:00Z',
    updatedAt: '2026-10-08T18:00:00Z',
  },
  {
    id: 'rep_aisyah_2',
    childId: 'ch_aisyah',
    date: '2026-10-06',
    durationMinutes: 60,
    subject: 'Membaca',
    topic: 'Pengenalan Huruf Konsonan Keras (k, p, t, b)',
    whatLearned: 'Membedakan pelafalan huruf serupa dan memasangkan gambar dengan huruf awal kata.',
    learningOutcome: 'Mampu menyebutkan huruf awal 15 benda di sekeliling dengan cepat.',
    score: 82,
    scoreCategory: 'berkembang_baik',
    teacherNotes: 'Konsentrasi bertahan penuh sepanjang sesi 60 menit.',
    nextStep: 'Penggabungan huruf konsonan keras dengan vokal tertutup.',
    homePractice: 'Tebak huruf awalan benda di ruang tamu.',
    photos: [],
    sharedViaWhatsapp: true,
    sharedAt: '2026-10-06T10:15:00Z',
    createdAt: '2026-10-06T10:00:00Z',
    updatedAt: '2026-10-06T10:00:00Z',
  },
  {
    id: 'rep_aisyah_1',
    childId: 'ch_aisyah',
    date: '2026-10-01',
    durationMinutes: 60,
    subject: 'Menulis',
    topic: 'Kerapian Huruf Tegak dan Spasi',
    whatLearned: 'Mengatur jarak antar kata selebar satu jari pada buku bergaris tiga.',
    learningOutcome: 'Buku tulisan jauh lebih tertata dan huruf tidak keluar garis dasar.',
    score: 80,
    scoreCategory: 'berkembang_baik',
    teacherNotes: 'Posisi duduk dan pegangan pensil sudah sesuai arahan.',
    nextStep: 'Latihan menulis kalimat pendek dikte.',
    homePractice: 'Menuliskan 1 kalimat jurnal rasa syukur hari ini.',
    photos: [],
    sharedViaWhatsapp: true,
    sharedAt: '2026-10-01T18:10:00Z',
    createdAt: '2026-10-01T18:00:00Z',
    updatedAt: '2026-10-01T18:00:00Z',
  },
  {
    id: 'rep_budi_1',
    childId: 'ch_budi',
    date: '2026-10-13',
    durationMinutes: 60,
    subject: 'Bahasa Inggris',
    topic: 'Daily Routine Vocabulary',
    whatLearned: 'Belajar kosakata kegiatan harian seperti wake up, take a bath, have breakfast.',
    learningOutcome: 'Dapat membuat 5 kalimat sederhana dalam simple present tense.',
    score: 84,
    scoreCategory: 'berkembang_baik',
    teacherNotes: 'Budi sangat antusias bermain tebak kata dengan flashcards.',
    nextStep: 'Latihan tanya jawab "What do you do in the morning?".',
    homePractice: 'Mengingat 3 kata kerja baru.',
    photos: [],
    sharedViaWhatsapp: true,
    sharedAt: '2026-10-13T14:15:00Z',
    createdAt: '2026-10-13T14:05:00Z',
    updatedAt: '2026-10-13T14:05:00Z',
  },
  {
    id: 'rep_citra_1',
    childId: 'ch_citra',
    date: '2026-10-13',
    durationMinutes: 60,
    subject: 'Membaca Permulaan',
    topic: 'Mengenal huruf vokal & konsonan b-d',
    whatLearned: 'Membedakan perut huruf b (kanan) dan d (kiri) dengan senam jari.',
    learningOutcome: 'Tidak tertukar lagi saat membaca kata bu-ku dan da-si.',
    score: 92,
    scoreCategory: 'sangat_baik',
    teacherNotes: 'Ceria sekali sepanjang les. Daya ingat Citra sangat tajam.',
    nextStep: 'Membaca kalimat 2 kata dengan gambar pendukung.',
    homePractice: 'Bermain puzzle huruf.',
    photos: [],
    sharedViaWhatsapp: false,
    createdAt: '2026-10-13T19:05:00Z',
    updatedAt: '2026-10-13T19:05:00Z',
  },
];

const INITIAL_PAYMENTS: PaymentRecord[] = [
  {
    id: 'pay_aisyah_okt',
    childId: 'ch_aisyah',
    period: 'Oktober 2026',
    packageType: 'paket_sesi',
    sessionCount: 8,
    amount: 800000,
    paidAmount: 800000,
    dueDate: '2026-10-10',
    status: 'lunas',
    paidDate: '2026-10-04',
    notes: 'Paket 8 sesi les privat bulan Oktober',
    transactions: [
      {
        id: 'trx_1',
        paymentId: 'pay_aisyah_okt',
        amount: 800000,
        date: '2026-10-04',
        method: 'Transfer Bank',
        notes: 'Transfer via BCA Ibu Fitriani',
      },
    ],
  },
  {
    id: 'pay_budi_okt',
    childId: 'ch_budi',
    period: 'Oktober 2026',
    packageType: 'bulanan',
    amount: 750000,
    paidAmount: 0,
    dueDate: '2026-10-15',
    status: 'belum_lunas',
    notes: 'Biaya les bulanan Oktober 2026',
    transactions: [],
  },
  {
    id: 'pay_citra_okt',
    childId: 'ch_citra',
    period: 'Oktober 2026',
    packageType: 'paket_sesi',
    sessionCount: 6,
    amount: 600000,
    paidAmount: 600000,
    dueDate: '2026-10-05',
    status: 'lunas',
    paidDate: '2026-10-03',
    notes: 'Paket 6 pertemuan',
    transactions: [
      {
        id: 'trx_2',
        paymentId: 'pay_citra_okt',
        amount: 600000,
        date: '2026-10-03',
        method: 'Transfer Bank',
        notes: 'Transfer via Mandiri Ibu Maya',
      },
    ],
  },
];

const INITIAL_COMMENTS: Comment[] = [
  {
    id: 'com_1',
    reportId: 'rep_aisyah_4',
    childId: 'ch_aisyah',
    senderRole: 'guru',
    senderName: 'Kak Sarah (Guru)',
    message: 'Aisyah hari ini sangat fokus dan mulai lebih percaya diri dalam membaca kata KV-KV.',
    createdAt: '2026-10-13T10:05:00Z',
    isReadByGuru: true,
  },
  {
    id: 'com_2',
    reportId: 'rep_aisyah_4',
    childId: 'ch_aisyah',
    senderRole: 'orang_tua',
    senderName: 'Ibu Fitriani',
    message: 'Alhamdulillah, terima kasih banyak Kak Sarah. Nanti malam akan kami dampingi baca 5 kalimat pendek di rumah sesuai rekomendasi Kakak.',
    createdAt: '2026-10-13T11:20:00Z',
    isReadByGuru: false,
  },
];

class LesReportDB {
  private getStorage<T>(key: string, defaultValue: T): T {
    if (typeof window === 'undefined') return defaultValue;
    try {
      const data = localStorage.getItem(STORAGE_KEY_PREFIX + key);
      return data ? JSON.parse(data) : defaultValue;
    } catch {
      return defaultValue;
    }
  }

  private setStorage<T>(key: string, value: T): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY_PREFIX + key, JSON.stringify(value));
      window.dispatchEvent(new CustomEvent('lesreport_db_change', { detail: { key } }));
    } catch (e) {
      console.error('Failed to save to localStorage', e);
    }
  }

  init(): void {
    if (typeof window === 'undefined') return;
    if (!localStorage.getItem(STORAGE_KEY_PREFIX + 'initialized_v1')) {
      this.resetToDefaults();
      localStorage.setItem(STORAGE_KEY_PREFIX + 'initialized_v1', 'true');
    }
  }

  resetToDefaults(): void {
    this.setStorage('teacher', INITIAL_TEACHER);
    this.setStorage('parents', INITIAL_PARENTS);
    this.setStorage('children', INITIAL_CHILDREN);
    this.setStorage('tokens', INITIAL_TOKENS);
    this.setStorage('schedules', INITIAL_SCHEDULES);
    this.setStorage('attendance', INITIAL_ATTENDANCE);
    this.setStorage('reports', INITIAL_REPORTS);
    this.setStorage('payments', INITIAL_PAYMENTS);
    this.setStorage('comments', INITIAL_COMMENTS);
  }

  // Teacher / User
  getTeacher(): User {
    return this.getStorage('teacher', INITIAL_TEACHER);
  }

  updateTeacher(user: Partial<User>): User {
    const current = this.getTeacher();
    const updated = { ...current, ...user };
    this.setStorage('teacher', updated);
    return updated;
  }

  // Parents
  getParents(): Parent[] {
    return this.getStorage('parents', INITIAL_PARENTS);
  }

  getParentById(id: string): Parent | undefined {
    return this.getParents().find((p) => p.id === id);
  }

  saveParent(parent: Parent): Parent {
    const parents = this.getParents();
    const index = parents.findIndex((p) => p.id === parent.id);
    if (index >= 0) {
      parents[index] = parent;
    } else {
      parents.push(parent);
    }
    this.setStorage('parents', parents);
    return parent;
  }

  // Children
  getChildren(): Child[] {
    const children = this.getStorage<Child[]>('children', INITIAL_CHILDREN);
    const parents = this.getParents();
    return children.map((c) => ({
      ...c,
      parent: parents.find((p) => p.id === c.parentId),
    }));
  }

  getChildById(id: string): Child | undefined {
    const children = this.getChildren();
    return children.find((c) => c.id === id);
  }

  saveChild(child: Child): Child {
    const children = this.getStorage<Child[]>('children', INITIAL_CHILDREN);
    const index = children.findIndex((c) => c.id === child.id);
    if (index >= 0) {
      children[index] = { ...child };
    } else {
      children.push({ ...child });
      // Ensure token exists for new child
      this.ensureChildToken(child.id);
    }
    this.setStorage('children', children);
    return child;
  }

  deleteChild(id: string): void {
    const children = this.getStorage<Child[]>('children', INITIAL_CHILDREN).filter((c) => c.id !== id);
    this.setStorage('children', children);
  }

  // Private Report Tokens
  getTokens(): PrivateReportToken[] {
    return this.getStorage('tokens', INITIAL_TOKENS);
  }

  getTokenForChild(childId: string): PrivateReportToken {
    const tokens = this.getTokens();
    let tokenObj = tokens.find((t) => t.childId === childId && !t.isRevoked);
    if (!tokenObj) {
      tokenObj = {
        token: generateSecureToken(24),
        childId,
        createdAt: new Date().toISOString(),
        isRevoked: false,
        accessCount: 0,
      };
      tokens.push(tokenObj);
      // Save directly to localStorage without dispatching disruptive re-render events
      try {
        localStorage.setItem(STORAGE_KEY_PREFIX + 'tokens', JSON.stringify(tokens));
      } catch (e) {
        console.error('Failed to save token to localStorage', e);
      }
    }
    return tokenObj;
  }

  ensureChildToken(childId: string): PrivateReportToken {
    return this.getTokenForChild(childId);
  }

  // Pure query without side-effects or event dispatching to prevent infinite re-render loops
  getChildByToken(tokenStr: string): { child?: Child; tokenObj?: PrivateReportToken } {
    const tokens = this.getTokens();
    const tokenObj = tokens.find((t) => t.token === tokenStr && !t.isRevoked);
    if (!tokenObj) {
      return {};
    }
    const child = this.getChildById(tokenObj.childId);
    return { child, tokenObj };
  }

  // Explicitly record token access asynchronously or on component mount
  recordTokenAccess(tokenStr: string): void {
    if (typeof window === 'undefined') return;
    try {
      const tokens = this.getTokens();
      const tokenObj = tokens.find((t) => t.token === tokenStr && !t.isRevoked);
      if (tokenObj) {
        tokenObj.accessCount += 1;
        tokenObj.lastAccessedAt = new Date().toISOString();
        localStorage.setItem(STORAGE_KEY_PREFIX + 'tokens', JSON.stringify(tokens));
      }
    } catch (e) {
      console.error('Failed to record token access', e);
    }
  }

  regenerateTokenForChild(childId: string): PrivateReportToken {
    const tokens = this.getTokens();
    // Revoke old tokens for this child
    for (const t of tokens) {
      if (t.childId === childId) {
        t.isRevoked = true;
      }
    }
    const newToken: PrivateReportToken = {
      token: generateSecureToken(24),
      childId,
      createdAt: new Date().toISOString(),
      isRevoked: false,
      accessCount: 0,
    };
    tokens.push(newToken);
    this.setStorage('tokens', tokens);
    return newToken;
  }

  // Schedules
  getSchedules(): Schedule[] {
    return this.getStorage('schedules', INITIAL_SCHEDULES);
  }

  getSchedulesForChild(childId: string): Schedule[] {
    return this.getSchedules().filter((s) => s.childId === childId);
  }

  saveSchedule(schedule: Schedule): Schedule {
    const schedules = this.getSchedules();
    const index = schedules.findIndex((s) => s.id === schedule.id);
    if (index >= 0) {
      schedules[index] = schedule;
    } else {
      schedules.push(schedule);
    }
    this.setStorage('schedules', schedules);
    return schedule;
  }

  deleteSchedule(id: string): void {
    const schedules = this.getSchedules().filter((s) => s.id !== id);
    this.setStorage('schedules', schedules);
  }

  // Attendance
  getAttendance(): Attendance[] {
    return this.getStorage('attendance', INITIAL_ATTENDANCE);
  }

  getAttendanceForChild(childId: string): Attendance[] {
    return this.getAttendance()
      .filter((a) => a.childId === childId)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  saveAttendance(attendance: Attendance): Attendance {
    const records = this.getAttendance();
    const index = records.findIndex((r) => r.id === attendance.id);
    if (index >= 0) {
      records[index] = attendance;
    } else {
      records.unshift(attendance);
    }
    this.setStorage('attendance', records);
    return attendance;
  }

  // Lesson Reports
  getReports(): LessonReport[] {
    return this.getStorage('reports', INITIAL_REPORTS).sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }

  getReportsForChild(childId: string): LessonReport[] {
    return this.getReports().filter((r) => r.childId === childId);
  }

  getReportById(id: string): LessonReport | undefined {
    return this.getReports().find((r) => r.id === id);
  }

  saveReport(report: LessonReport): LessonReport {
    const reports = this.getReports();
    // Auto calculate score category if missing
    if (!report.scoreCategory) {
      report.scoreCategory = getScoreCategory(report.score);
    }
    const index = reports.findIndex((r) => r.id === report.id);
    if (index >= 0) {
      reports[index] = { ...report, updatedAt: new Date().toISOString() };
    } else {
      reports.unshift({
        ...report,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
    this.setStorage('reports', reports);
    return report;
  }

  deleteReport(id: string): void {
    const reports = this.getReports().filter((r) => r.id !== id);
    this.setStorage('reports', reports);
  }

  markReportShared(reportId: string): void {
    const reports = this.getReports();
    const target = reports.find((r) => r.id === reportId);
    if (target) {
      target.sharedViaWhatsapp = true;
      target.sharedAt = new Date().toISOString();
      this.setStorage('reports', reports);
    }
  }

  // Payments
  getPayments(): PaymentRecord[] {
    return this.getStorage('payments', INITIAL_PAYMENTS);
  }

  getPaymentsForChild(childId: string): PaymentRecord[] {
    return this.getPayments().filter((p) => p.childId === childId);
  }

  savePayment(payment: PaymentRecord): PaymentRecord {
    const payments = this.getPayments();
    const index = payments.findIndex((p) => p.id === payment.id);
    if (index >= 0) {
      payments[index] = payment;
    } else {
      payments.unshift(payment);
    }
    this.setStorage('payments', payments);
    return payment;
  }

  markPaymentPaid(paymentId: string, method: 'Transfer Bank' | 'Tunai' | 'E-Wallet' = 'Transfer Bank'): PaymentRecord | undefined {
    const payments = this.getPayments();
    const target = payments.find((p) => p.id === paymentId);
    if (target) {
      target.status = 'lunas';
      target.paidAmount = target.amount;
      target.paidDate = new Date().toISOString().split('T')[0];
      target.transactions.push({
        id: 'trx_' + Date.now(),
        paymentId: target.id,
        amount: target.amount,
        date: target.paidDate,
        method,
        notes: 'Pelunasan dicatat oleh guru',
      });
      this.setStorage('payments', payments);
      return target;
    }
    return undefined;
  }

  // Comments
  getComments(): Comment[] {
    return this.getStorage('comments', INITIAL_COMMENTS);
  }

  getCommentsForChild(childId: string): Comment[] {
    return this.getComments()
      .filter((c) => c.childId === childId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  addComment(comment: Omit<Comment, 'id' | 'createdAt'>): Comment {
    const comments = this.getComments();
    const newComment: Comment = {
      ...comment,
      id: 'com_' + Date.now(),
      createdAt: new Date().toISOString(),
    };
    comments.push(newComment);
    this.setStorage('comments', comments);
    return newComment;
  }

  markCommentsAsRead(childId: string): void {
    const comments = this.getComments();
    let changed = false;
    for (const c of comments) {
      if (c.childId === childId && !c.isReadByGuru) {
        c.isReadByGuru = true;
        changed = true;
      }
    }
    if (changed) {
      this.setStorage('comments', comments);
    }
  }

  // Analytics Helpers
  getDashboardStats() {
    const children = this.getChildren();
    const activeChildren = children.filter((c) => c.isActive);
    const reports = this.getReports();
    const payments = this.getPayments();
    const attendance = this.getAttendance();
    const comments = this.getComments();

    // Today's day of week
    const now = new Date();
    const todayDay = now.getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6;
    const todayDateStr = now.toISOString().split('T')[0];

    const todaySchedules = this.getSchedules().filter((s) => s.dayOfWeek === todayDay);
    const todayAttendance = attendance.filter((a) => a.date === todayDateStr && a.status === 'hadir');
    const pendingPayments = payments.filter((p) => p.status === 'belum_lunas' || p.status === 'jatuh_tempo');
    const unreadComments = comments.filter((c) => !c.isReadByGuru && c.senderRole === 'orang_tua');

    return {
      activeChildrenCount: activeChildren.length,
      todaySessionsCount: todaySchedules.length,
      todayPresentCount: todayAttendance.length,
      pendingPaymentsCount: pendingPayments.length,
      unreadCommentsCount: unreadComments.length,
      totalReportsCount: reports.length,
      todaySchedules,
    };
  }

  getChildStats(childId: string) {
    const reports = this.getReportsForChild(childId);
    const attendance = this.getAttendanceForChild(childId);
    const payments = this.getPaymentsForChild(childId);

    const totalLessons = reports.length;
    const avgScore = totalLessons > 0 ? Math.round(reports.reduce((acc, r) => acc + r.score, 0) / totalLessons) : 0;

    const presentCount = attendance.filter((a) => a.status === 'hadir').length;
    const attendanceRate = attendance.length > 0 ? Math.round((presentCount / attendance.length) * 100) : 100;

    const pendingBill = payments
      .filter((p) => p.status === 'belum_lunas' || p.status === 'jatuh_tempo')
      .reduce((acc, p) => acc + (p.amount - p.paidAmount), 0);

    return {
      totalLessons,
      avgScore,
      attendanceRate,
      presentCount,
      totalAttendanceRecords: attendance.length,
      pendingBill,
      latestReport: reports[0],
    };
  }
}

export const db = new LesReportDB();
db.init();
