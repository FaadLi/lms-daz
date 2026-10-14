import React, { useState, useEffect } from 'react';
import { Child, LessonReport } from '../../types';
import { db } from '../../services/db';
import {
  formatDateIndo,
  formatRupiah,
  getAttendanceStyle,
  getAttendanceLabel,
  getPaymentStatusStyle,
  getPaymentStatusLabel,
  DAY_NAMES,
} from '../../data/presets';
import { ScoreBadge } from '../common/ScoreBadge';
import { ProgressChart } from '../common/ProgressChart';
import {
  Home,
  TrendingUp,
  Calendar,
  CreditCard,
  MoreHorizontal,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Sparkles,
  Camera,
  MessageCircle,
  Send,
  ChevronRight,
  BookOpen,
  ArrowRight,
  UserCheck,
} from 'lucide-react';

interface ParentPortalProps {
  token: string;
  onExitPreview?: () => void;
  isTeacherPreview?: boolean;
}

export const ParentPortal: React.FC<ParentPortalProps> = ({
  token,
  onExitPreview,
  isTeacherPreview = false,
}) => {
  const [activeTab, setActiveTab] = useState<'beranda' | 'progress' | 'jadwal' | 'pembayaran' | 'lainnya'>('beranda');
  const [lainnyaSubTab, setLainnyaSubTab] = useState<'absensi' | 'foto' | 'komentar'>('komentar');
  const [selectedReportDetail, setSelectedReportDetail] = useState<LessonReport | null>(null);

  // Comment state
  const [commentInput, setCommentInput] = useState('');
  const [commentSuccessNotice, setCommentSuccessNotice] = useState(false);

  // Safely record token access once on mount without re-render side-effects
  useEffect(() => {
    if (token) {
      db.recordTokenAccess(token);
    }
  }, [token]);

  // Handle ESC key to exit report modal or preview
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedReportDetail) {
          setSelectedReportDetail(null);
        } else if (isTeacherPreview && onExitPreview) {
          onExitPreview();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedReportDetail, isTeacherPreview, onExitPreview]);

  // Load child by secure token (pure query)
  const { child, tokenObj } = db.getChildByToken(token);

  if (!child || !tokenObj) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl p-6 max-w-sm w-full text-center shadow-lg border border-slate-200">
          <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-3">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h2 className="text-base font-bold text-slate-900">Tautan Laporan Tidak Valid</h2>
          <p className="text-xs text-slate-500 mt-2 leading-relaxed">
            Tautan laporan ini sudah kedaluwarsa atau telah diperbarui oleh guru les untuk alasan keamanan.
          </p>
          <p className="text-xs text-indigo-600 mt-3 font-semibold">
            Silakan hubungi guru les untuk meminta tautan laporan terbaru.
          </p>
          {onExitPreview && (
            <button
              onClick={onExitPreview}
              className="mt-5 w-full py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold"
            >
              Kembali ke Mode Guru
            </button>
          )}
        </div>
      </div>
    );
  }

  const reports = db.getReportsForChild(child.id);
  const latestReport = reports[0];
  const schedules = db.getSchedulesForChild(child.id);
  const attendanceList = db.getAttendanceForChild(child.id);
  const payments = db.getPaymentsForChild(child.id);
  const latestPayment = payments[0];
  const comments = db.getCommentsForChild(child.id);
  const teacher = db.getTeacher();
  const allPhotos = reports.flatMap((r) => r.photos || []);

  // Find next upcoming schedule
  const todayDay = new Date().getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6;
  const nextSchedule = schedules.find((s) => s.dayOfWeek >= todayDay) || schedules[0];

  const handleSendComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentInput.trim()) return;

    db.addComment({
      childId: child.id,
      reportId: latestReport?.id,
      senderRole: 'orang_tua',
      senderName: child.parent?.fullName || 'Orang Tua',
      message: commentInput.trim(),
      isReadByGuru: false,
    });

    setCommentInput('');
    setCommentSuccessNotice(true);
    setTimeout(() => setCommentSuccessNotice(false), 3000);
  };

  return (
    <div className="min-h-screen bg-slate-100 flex justify-center selection:bg-indigo-100">
      {/* Mobile-first centered app shell: optimized for 375-430px smartphone canvas */}
      <div className="w-full max-w-md bg-white min-h-screen flex flex-col shadow-2xl relative border-x border-slate-200">
        {/* Teacher Preview Banner (if triggered by guru) */}
        {isTeacherPreview && (
          <div className="bg-amber-500 text-amber-950 px-4 py-2 text-xs font-bold flex items-center justify-between sticky top-0 z-50">
            <span>👁️ Mode Pratinjau Orang Tua</span>
            {onExitPreview && (
              <button
                onClick={onExitPreview}
                className="bg-amber-950 text-white px-2.5 py-1 rounded-md text-[11px] font-semibold hover:bg-black transition-colors"
              >
                Kembali ke Guru
              </button>
            )}
          </div>
        )}

        {/* Top App Header */}
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-100 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shadow-xs">
              LR
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 block leading-none">
                Buku Raport Digital
              </span>
              <h1 className="text-sm font-bold text-slate-900 leading-tight">
                {teacher.institutionName || 'Les Privat'}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-1.5 bg-emerald-50 text-emerald-800 text-[10px] font-bold px-2 py-1 rounded-full border border-emerald-200">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>Privat</span>
          </div>
        </header>

        {/* Child Profile Bar */}
        <div className="bg-gradient-to-b from-indigo-50/80 via-white to-white px-4 pt-4 pb-2 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="relative">
              <img
                src={child.avatarUrl}
                alt={child.fullName}
                className="w-14 h-14 rounded-2xl object-cover border-2 border-white shadow-sm"
              />
              <span className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 border-2 border-white rounded-full" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold text-slate-900 truncate flex items-center gap-1.5">
                {child.nickname}
                <span className="text-xs font-normal text-slate-500">({child.fullName.split(' ')[0]})</span>
              </h2>
              <p className="text-xs text-slate-600">
                {child.gradeLevel} · Update: {latestReport ? formatDateIndo(latestReport.date) : 'Hari ini'}
              </p>
            </div>
          </div>
        </div>

        {/* Scrollable Content Area with smooth natural page scrolling */}
        <main className="flex-1 p-4 pb-28 space-y-4">
          {/* TAB 1: BERANDA (Answers 4 questions in 5-10 seconds) */}
          {activeTab === 'beranda' && (
            <>
              {/* Question 1 & 2: Bagaimana perkembangan anak & Apa yang dipelajari terakhir? */}
              {latestReport ? (
                <div className="bg-gradient-to-br from-indigo-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-5 shadow-lg relative overflow-hidden">
                  {/* Subtle educational backdrop accent */}
                  <div className="absolute -right-8 -bottom-8 w-32 h-32 bg-indigo-500/10 rounded-full blur-xl pointer-events-none" />

                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" /> Perkembangan Terbaru
                    </span>
                    <span className="text-xs font-mono text-indigo-200">
                      {formatDateIndo(latestReport.date)}
                    </span>
                  </div>

                  <div className="mb-4">
                    <span className="text-xs text-indigo-200 block">{latestReport.subject}</span>
                    <h3 className="text-lg font-bold text-white leading-snug">
                      {latestReport.topic}
                    </h3>
                  </div>

                  {/* Big Hero Score with Category */}
                  <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3.5 border border-white/15 flex items-center justify-between mb-4">
                    <div>
                      <span className="text-[11px] text-indigo-200 block">Nilai Pembelajaran</span>
                      <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-extrabold text-white tabular-nums">
                          {latestReport.score}
                        </span>
                        <span className="text-xs font-bold text-amber-300">
                          / 100
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-[11px] text-indigo-200 block mb-0.5">Status Evaluasi</span>
                      <span className="text-xs font-bold bg-white/20 text-white px-2.5 py-1 rounded-lg">
                        {latestReport.scoreCategory === 'sangat_baik' && 'Sangat Baik 🌟'}
                        {latestReport.scoreCategory === 'berkembang_baik' && 'Berkembang Baik 👍'}
                        {latestReport.scoreCategory === 'perlu_latihan' && 'Perlu Latihan 📖'}
                        {latestReport.scoreCategory === 'perlu_pendampingan' && 'Perlu Dampingan 🤝'}
                      </span>
                    </div>
                  </div>

                  {/* Summary of what child mastered */}
                  <div className="space-y-2.5 text-xs">
                    <div className="bg-white/5 rounded-xl p-3 border border-white/10">
                      <span className="font-semibold text-indigo-200 block mb-1">
                        ✨ Yang Sudah Dikuasai:
                      </span>
                      <p className="text-indigo-50 leading-relaxed">
                        {latestReport.learningOutcome}
                      </p>
                    </div>

                    <div className="bg-emerald-500/15 rounded-xl p-3 border border-emerald-400/20">
                      <span className="font-semibold text-emerald-300 block mb-1">
                        🌱 Tahap Berikutnya:
                      </span>
                      <p className="text-emerald-100 leading-relaxed">
                        {latestReport.nextStep}
                      </p>
                    </div>

                    {latestReport.teacherNotes && (
                      <div className="bg-white/5 rounded-xl p-3 border border-white/10">
                        <span className="font-semibold text-indigo-200 block mb-1">
                          💬 Catatan Guru ({teacher.name}):
                        </span>
                        <p className="text-indigo-100 italic">
                          "{latestReport.teacherNotes}"
                        </p>
                      </div>
                    )}
                  </div>

                  {/* View complete report detail button */}
                  <button
                    onClick={() => setSelectedReportDetail(latestReport)}
                    className="w-full mt-4 py-2.5 bg-white text-indigo-950 font-bold text-xs rounded-xl flex items-center justify-center gap-1 hover:bg-indigo-50 transition-colors shadow-sm"
                  >
                    Buka Detail Laporan Lengkap <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="bg-white border border-slate-200 rounded-3xl p-6 text-center">
                  <p className="text-xs text-slate-500">Belum ada laporan pembelajaran untuk ditampilkan.</p>
                </div>
              )}

              {/* Question 3: Kapan les berikutnya? */}
              <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-indigo-600" /> Jadwal Les Berikutnya
                  </span>
                  <button
                    onClick={() => setActiveTab('jadwal')}
                    className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800"
                  >
                    Lihat Semua
                  </button>
                </div>

                {nextSchedule ? (
                  <div className="bg-indigo-50/60 border border-indigo-100 rounded-xl p-3 flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-indigo-950 block">
                        {DAY_NAMES[nextSchedule.dayOfWeek]}, {nextSchedule.startTime} - {nextSchedule.endTime}
                      </span>
                      <p className="text-xs text-slate-600 mt-0.5">
                        {nextSchedule.subject} · {nextSchedule.location}
                      </p>
                    </div>
                    <span className="text-[11px] font-bold text-indigo-700 bg-white px-2 py-1 rounded-lg border border-indigo-200 shadow-2xs">
                      {nextSchedule.durationMinutes} mnt
                    </span>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">Jadwal berikutnya belum ditentukan.</p>
                )}
              </div>

              {/* Question 4: Apakah ada pembayaran? */}
              <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <CreditCard className="w-4 h-4 text-emerald-600" /> Status Pembayaran Les
                  </span>
                  <button
                    onClick={() => setActiveTab('pembayaran')}
                    className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800"
                  >
                    Rincian
                  </button>
                </div>

                {latestPayment ? (
                  <div className="flex items-center justify-between bg-slate-50 border border-slate-100 rounded-xl p-3">
                    <div>
                      <span className="text-xs font-bold text-slate-800 block">
                        {latestPayment.period}
                      </span>
                      <p className="text-xs text-slate-500">
                        {formatRupiah(latestPayment.amount)}
                      </p>
                    </div>
                    <div className="text-right">
                      {latestPayment.status === 'lunas' ? (
                        <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> LUNAS
                        </span>
                      ) : (
                        <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200">
                          {getPaymentStatusLabel(latestPayment.status)}
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">Belum ada tagihan.</p>
                )}
              </div>

              {/* Latest Photo Preview (if any) */}
              {allPhotos.length > 0 && (
                <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs">
                  <div className="flex items-center justify-between mb-2.5">
                    <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <Camera className="w-4 h-4 text-purple-600" /> Dokumentasi Belajar
                    </span>
                    <button
                      onClick={() => {
                        setActiveTab('lainnya');
                        setLainnyaSubTab('foto');
                      }}
                      className="text-[11px] font-semibold text-indigo-600"
                    >
                      Lihat Foto ({allPhotos.length})
                    </button>
                  </div>
                  <div className="rounded-xl overflow-hidden aspect-16/9 bg-slate-100 border border-slate-200 relative group">
                    <img
                      src={allPhotos[0].url}
                      alt={allPhotos[0].caption || 'Dokumentasi'}
                      className="w-full h-full object-cover"
                    />
                    {allPhotos[0].caption && (
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-2.5">
                        <p className="text-xs text-white font-medium">
                          {allPhotos[0].caption}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Quick Feedback Form for Parents */}
              <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs">
                <span className="text-xs font-bold text-slate-900 block mb-1">
                  💬 Sampaikan Pesan ke Guru
                </span>
                <p className="text-xs text-slate-500 mb-3">
                  Punya catatan atau tanggapan untuk guru les? Kirimkan langsung di sini.
                </p>

                {commentSuccessNotice && (
                  <div className="mb-3 p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Pesan Anda berhasil terkirim ke Guru!</span>
                  </div>
                )}

                <form onSubmit={handleSendComment} className="flex gap-2">
                  <input
                    type="text"
                    value={commentInput}
                    onChange={(e) => setCommentInput(e.target.value)}
                    placeholder="Contoh: Baik Kak, nanti malam kami latih lagi di rumah..."
                    className="flex-1 text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 focus:outline-indigo-500 focus:bg-white"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1 shrink-0"
                  >
                    <Send className="w-3.5 h-3.5" /> Kirim
                  </button>
                </form>
              </div>
            </>
          )}

          {/* TAB 2: PROGRESS & HISTORI NILAI */}
          {activeTab === 'progress' && (
            <div className="space-y-4">
              <ProgressChart reports={reports} childName={child.nickname} />

              <div>
                <h3 className="text-sm font-bold text-slate-900 mb-2">
                  Histori Laporan Belajar ({reports.length})
                </h3>
                <div className="space-y-3">
                  {reports.map((rep) => (
                    <div
                      key={rep.id}
                      onClick={() => setSelectedReportDetail(rep)}
                      className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs hover:border-indigo-300 transition-all cursor-pointer active:scale-[0.99]"
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <span className="text-[11px] font-medium text-slate-400 block">
                            {formatDateIndo(rep.date)} · {rep.durationMinutes} Menit
                          </span>
                          <h4 className="text-sm font-bold text-slate-900 mt-0.5">
                            {rep.subject}: {rep.topic}
                          </h4>
                        </div>
                        <ScoreBadge score={rep.score} category={rep.scoreCategory} size="sm" />
                      </div>

                      <p className="text-xs text-slate-600 line-clamp-2 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                        {rep.learningOutcome}
                      </p>

                      <div className="flex items-center justify-between mt-3 text-xs text-indigo-600 font-semibold pt-2 border-t border-slate-100">
                        <span>Lihat Rincian Laporan</span>
                        <ChevronRight className="w-4 h-4" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: JADWAL */}
          {activeTab === 'jadwal' && (
            <div className="space-y-4">
              <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs">
                <h3 className="text-sm font-bold text-slate-900 mb-3">
                  Jadwal Rutin Les {child.nickname}
                </h3>
                <div className="space-y-3">
                  {schedules.map((sch) => (
                    <div
                      key={sch.id}
                      className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200 flex flex-col items-center justify-center text-indigo-700 font-bold text-xs">
                          {DAY_NAMES[sch.dayOfWeek].slice(0, 3)}
                        </div>
                        <div>
                          <span className="text-xs font-bold text-indigo-900 block">
                            {DAY_NAMES[sch.dayOfWeek]} ({sch.startTime} - {sch.endTime})
                          </span>
                          <h4 className="text-xs font-semibold text-slate-800">{sch.subject}</h4>
                          <p className="text-[11px] text-slate-500">{sch.location}</p>
                        </div>
                      </div>
                      <span className="text-[11px] font-semibold text-slate-500 bg-white px-2 py-1 rounded-md border border-slate-200">
                        {sch.durationMinutes} menit
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-2xl text-xs text-blue-900">
                <span className="font-bold block mb-1">ℹ️ Konfirmasi Perubahan Jadwal:</span>
                Jika berhalangan hadir atau ingin menyesuaikan waktu les, mohon hubungi guru paling lambat 1 hari sebelum jadwal.
              </div>
            </div>
          )}

          {/* TAB 4: PEMBAYARAN */}
          {activeTab === 'pembayaran' && (
            <div className="space-y-4">
              <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs">
                <h3 className="text-sm font-bold text-slate-900 mb-3">
                  Informasi Pembayaran Les
                </h3>
                <div className="space-y-3">
                  {payments.map((pay) => {
                    const style = getPaymentStatusStyle(pay.status);
                    return (
                      <div
                        key={pay.id}
                        className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-sm font-bold text-slate-900">{pay.period}</h4>
                          <span
                            className={`text-xs font-bold px-2 py-0.5 rounded-md border ${style.bg} ${style.border}`}
                          >
                            {getPaymentStatusLabel(pay.status)}
                          </span>
                        </div>
                        <div className="text-xs text-slate-600 space-y-1">
                          <div className="flex justify-between">
                            <span>Total Tagihan:</span>
                            <span className="font-bold text-slate-900">{formatRupiah(pay.amount)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Jatuh Tempo:</span>
                            <span>{formatDateIndo(pay.dueDate)}</span>
                          </div>
                          {pay.paidDate && (
                            <div className="flex justify-between text-emerald-700 font-medium">
                              <span>Tanggal Bayar:</span>
                              <span>{formatDateIndo(pay.paidDate)}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: LAINNYA (Absensi, Foto, Komentar) */}
          {activeTab === 'lainnya' && (
            <div className="space-y-4">
              {/* Sub-tab segmented filter */}
              <div className="flex items-center p-1 bg-slate-100 rounded-xl">
                {[
                  { id: 'komentar', label: `Komentar (${comments.length})` },
                  { id: 'foto', label: `Foto (${allPhotos.length})` },
                  { id: 'absensi', label: `Absensi (${attendanceList.length})` },
                ].map((st) => (
                  <button
                    key={st.id}
                    onClick={() => setLainnyaSubTab(st.id as any)}
                    className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                      lainnyaSubTab === st.id
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>

              {/* Sub Tab: Komentar */}
              {lainnyaSubTab === 'komentar' && (
                <div className="space-y-3">
                  <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs">
                    <h4 className="text-sm font-bold text-slate-900 mb-3">
                      Percakapan dengan Guru
                    </h4>

                    <div className="space-y-3 mb-4 max-h-80 overflow-y-auto">
                      {comments.map((comm) => (
                        <div
                          key={comm.id}
                          className={`p-3 rounded-2xl text-xs ${
                            comm.senderRole === 'orang_tua'
                              ? 'bg-indigo-50 border border-indigo-100 ml-4 text-indigo-950'
                              : 'bg-slate-50 border border-slate-200 mr-4 text-slate-900'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-bold">{comm.senderName}</span>
                            <span className="text-[10px] text-slate-400">
                              {formatDateIndo(comm.createdAt.split('T')[0])}
                            </span>
                          </div>
                          <p>{comm.message}</p>
                        </div>
                      ))}
                    </div>

                    <form onSubmit={handleSendComment} className="flex gap-2">
                      <input
                        type="text"
                        value={commentInput}
                        onChange={(e) => setCommentInput(e.target.value)}
                        placeholder="Tulis pesan untuk guru..."
                        className="flex-1 text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 focus:outline-indigo-500 focus:bg-white"
                      />
                      <button
                        type="submit"
                        className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1"
                      >
                        <Send className="w-3.5 h-3.5" />
                      </button>
                    </form>
                  </div>
                </div>
              )}

              {/* Sub Tab: Foto */}
              {lainnyaSubTab === 'foto' && (
                <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs">
                  <h4 className="text-sm font-bold text-slate-900 mb-3">
                    Dokumentasi Pembelajaran ({allPhotos.length})
                  </h4>
                  {allPhotos.length > 0 ? (
                    <div className="grid grid-cols-2 gap-2.5">
                      {allPhotos.map((photo) => (
                        <div
                          key={photo.id}
                          className="rounded-xl overflow-hidden border border-slate-200 aspect-4/3 bg-slate-100 relative group"
                        >
                          <img
                            src={photo.url}
                            alt={photo.caption || 'Foto'}
                            className="w-full h-full object-cover"
                          />
                          {photo.caption && (
                            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                              <p className="text-[10px] text-white line-clamp-1">{photo.caption}</p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 text-center py-6">
                      Belum ada foto kegiatan yang diunggah.
                    </p>
                  )}
                </div>
              )}

              {/* Sub Tab: Absensi */}
              {lainnyaSubTab === 'absensi' && (
                <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs">
                  <h4 className="text-sm font-bold text-slate-900 mb-3">
                    Riwayat Kehadiran ({attendanceList.length})
                  </h4>
                  <div className="divide-y divide-slate-100">
                    {attendanceList.map((att) => {
                      const style = getAttendanceStyle(att.status);
                      return (
                        <div key={att.id} className="py-2.5 flex items-center justify-between text-xs">
                          <div>
                            <span className="font-semibold text-slate-800 block">
                              {formatDateIndo(att.date)}
                            </span>
                            {att.notes && <span className="text-slate-400 italic">"{att.notes}"</span>}
                          </div>
                          <span className={`px-2 py-0.5 rounded-md border font-semibold ${style.bg}`}>
                            {getAttendanceLabel(att.status)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </main>

        {/* Full Report Detail Modal when Parent taps any report */}
        {selectedReportDetail && (
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-xs"
            onClick={(e) => {
              if (e.target === e.currentTarget) setSelectedReportDetail(null);
            }}
          >
            <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full max-w-md max-h-[85vh] overflow-y-auto shadow-2xl p-5 border border-slate-200">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
                <span className="text-xs font-bold text-indigo-600">
                  Laporan Lengkap
                </span>
                <button
                  onClick={() => setSelectedReportDetail(null)}
                  className="text-xs px-2.5 py-1 bg-slate-100 hover:bg-slate-200 rounded-lg font-bold text-slate-600"
                >
                  Tutup
                </button>
              </div>

              <div className="space-y-3.5 text-xs">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-slate-400 block">{formatDateIndo(selectedReportDetail.date)}</span>
                    <h3 className="text-base font-bold text-slate-900">
                      {selectedReportDetail.subject}: {selectedReportDetail.topic}
                    </h3>
                  </div>
                  <ScoreBadge
                    score={selectedReportDetail.score}
                    category={selectedReportDetail.scoreCategory}
                    size="md"
                  />
                </div>

                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <span className="font-bold text-slate-800 block mb-1">Yang Dipelajari:</span>
                  <p className="text-slate-600 leading-relaxed">{selectedReportDetail.whatLearned}</p>
                </div>

                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <span className="font-bold text-slate-800 block mb-1">Hasil Pembelajaran:</span>
                  <p className="text-slate-600 leading-relaxed">{selectedReportDetail.learningOutcome}</p>
                </div>

                <div className="bg-emerald-50/70 p-3 rounded-xl border border-emerald-100">
                  <span className="font-bold text-emerald-900 block mb-1">🌱 Tahap Berikutnya:</span>
                  <p className="text-emerald-800 leading-relaxed">{selectedReportDetail.nextStep}</p>
                </div>

                <div className="bg-blue-50/70 p-3 rounded-xl border border-blue-100">
                  <span className="font-bold text-blue-900 block mb-1">🏠 Rekomendasi Latihan di Rumah:</span>
                  <p className="text-blue-800 leading-relaxed">{selectedReportDetail.homePractice}</p>
                </div>

                {selectedReportDetail.teacherNotes && (
                  <div className="bg-amber-50/60 p-3 rounded-xl border border-amber-100">
                    <span className="font-bold text-amber-900 block mb-1">Catatan Guru:</span>
                    <p className="text-amber-800 leading-relaxed">{selectedReportDetail.teacherNotes}</p>
                  </div>
                )}

                {selectedReportDetail.photos && selectedReportDetail.photos.length > 0 && (
                  <div>
                    <span className="font-bold text-slate-800 block mb-2">Foto Kegiatan:</span>
                    <div className="grid grid-cols-2 gap-2">
                      {selectedReportDetail.photos.map((ph) => (
                        <img
                          key={ph.id}
                          src={ph.url}
                          alt="Foto"
                          className="rounded-xl border border-slate-200 aspect-4/3 object-cover"
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Bottom Tab Navigation (Fixed to bottom, ergonomic touch targets > 44px) */}
        <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 pb-safe">
          <div className="grid grid-cols-5 h-14 items-center">
            <button
              onClick={() => setActiveTab('beranda')}
              className={`flex flex-col items-center justify-center h-full min-h-[44px] transition-colors ${
                activeTab === 'beranda' ? 'text-indigo-600 font-bold' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <Home className="w-5 h-5" />
              <span className="text-[10px] mt-0.5">Beranda</span>
            </button>

            <button
              onClick={() => setActiveTab('progress')}
              className={`flex flex-col items-center justify-center h-full min-h-[44px] transition-colors ${
                activeTab === 'progress' ? 'text-indigo-600 font-bold' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <TrendingUp className="w-5 h-5" />
              <span className="text-[10px] mt-0.5">Progress</span>
            </button>

            <button
              onClick={() => setActiveTab('jadwal')}
              className={`flex flex-col items-center justify-center h-full min-h-[44px] transition-colors ${
                activeTab === 'jadwal' ? 'text-indigo-600 font-bold' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <Calendar className="w-5 h-5" />
              <span className="text-[10px] mt-0.5">Jadwal</span>
            </button>

            <button
              onClick={() => setActiveTab('pembayaran')}
              className={`flex flex-col items-center justify-center h-full min-h-[44px] transition-colors ${
                activeTab === 'pembayaran' ? 'text-indigo-600 font-bold' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <CreditCard className="w-5 h-5" />
              <span className="text-[10px] mt-0.5">Bayar</span>
            </button>

            <button
              onClick={() => setActiveTab('lainnya')}
              className={`flex flex-col items-center justify-center h-full min-h-[44px] transition-colors ${
                activeTab === 'lainnya' ? 'text-indigo-600 font-bold' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <MoreHorizontal className="w-5 h-5" />
              <span className="text-[10px] mt-0.5">Lainnya</span>
            </button>
          </div>
        </nav>
      </div>
    </div>
  );
};
