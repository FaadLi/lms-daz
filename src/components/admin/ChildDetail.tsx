import React, { useState } from 'react';
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
import { ReportFormModal } from './ReportFormModal';
import { WhatsappShareModal } from './WhatsappShareModal';
import {
  ArrowLeft,
  Calendar,
  Clock,
  Plus,
  Share2,
  Copy,
  Check,
  RefreshCw,
  Eye,
  MessageCircle,
  Camera,
  AlertTriangle,
  ChevronRight,
  Send,
  CreditCard,
  UserCheck,
  BookOpen,
} from 'lucide-react';

interface ChildDetailProps {
  childId: string;
  onBack: () => void;
  onPreviewAsParent: (token: string) => void;
  originUrl: string;
}

export const ChildDetail: React.FC<ChildDetailProps> = ({
  childId,
  onBack,
  onPreviewAsParent,
  originUrl,
}) => {
  const [activeTab, setActiveTab] = useState<
    'overview' | 'progress' | 'absensi' | 'jadwal' | 'pembayaran' | 'foto' | 'komentar'
  >('overview');

  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [editingReport, setEditingReport] = useState<LessonReport | null>(null);

  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [selectedReportForShare, setSelectedReportForShare] = useState<LessonReport | null>(null);

  const [copiedLink, setCopiedLink] = useState(false);
  const [isRegenerateConfirmOpen, setIsRegenerateConfirmOpen] = useState(false);

  // New comment input by teacher
  const [newCommentText, setNewCommentText] = useState('');

  // Selected report detail modal for viewing complete report
  const [viewingReportDetail, setViewingReportDetail] = useState<LessonReport | null>(null);

  const child = db.getChildById(childId);

  if (!child) {
    return (
      <div className="p-6 text-center">
        <p className="text-slate-500">Data anak tidak ditemukan.</p>
        <button
          onClick={onBack}
          className="mt-3 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-semibold"
        >
          Kembali ke Daftar Anak
        </button>
      </div>
    );
  }

  const tokenObj = db.getTokenForChild(child.id);
  const privateLink = `${originUrl}/#/report/${tokenObj.token}`;
  const parent = child.parentId ? db.getParentById(child.parentId) : undefined;
  const stats = db.getChildStats(child.id);
  const reports = db.getReportsForChild(child.id);
  const schedules = db.getSchedulesForChild(child.id);
  const attendanceList = db.getAttendanceForChild(child.id);
  const payments = db.getPaymentsForChild(child.id);
  const comments = db.getCommentsForChild(child.id);

  // Collect all photos from reports
  const allPhotos = reports.flatMap((r) => r.photos || []);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(privateLink);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleRegenerateToken = () => {
    db.regenerateTokenForChild(child.id);
    setIsRegenerateConfirmOpen(false);
  };

  const handleAddComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCommentText.trim()) return;
    const teacher = db.getTeacher();
    db.addComment({
      childId: child.id,
      senderRole: 'guru',
      senderName: `${teacher.name} (Guru)`,
      message: newCommentText.trim(),
      isReadByGuru: true,
    });
    setNewCommentText('');
  };

  const handleMarkPaymentPaid = (paymentId: string) => {
    db.markPaymentPaid(paymentId, 'Transfer Bank');
  };

  return (
    <div className="pb-24 max-w-4xl mx-auto px-4 sm:px-6 pt-2">
      {/* Top Nav Back */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white border border-slate-200 px-3 py-1.5 rounded-xl shadow-2xs"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Kembali
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onPreviewAsParent(tokenObj.token)}
            className="flex items-center gap-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 px-3 py-1.5 rounded-xl hover:bg-indigo-100 transition-colors"
          >
            <Eye className="w-3.5 h-3.5" /> Preview Orang Tua
          </button>
        </div>
      </div>

      {/* Child Header Profile Card */}
      <div className="bg-white rounded-3xl border border-slate-200/80 p-5 shadow-xs mb-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <img
              src={child.avatarUrl}
              alt={child.fullName}
              className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-cover border border-slate-200 shadow-2xs"
            />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900 leading-tight">
                  {child.fullName}
                </h1>
                <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                  {child.isActive ? 'Aktif' : 'Nonaktif'}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Panggilan: <strong>{child.nickname}</strong> · {child.gradeLevel} · Les sejak {formatDateIndo(child.startDate)}
              </p>
              {parent && (
                <p className="text-xs text-slate-500 mt-1">
                  Orang Tua: <span className="font-medium text-slate-700">{parent.fullName}</span> ({parent.relationship}) · WA: {parent.whatsappNumber}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={() => {
                setEditingReport(null);
                setIsReportModalOpen(true);
              }}
              className="flex-1 sm:flex-none px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition-all"
            >
              <Plus className="w-4 h-4" /> Mulai Report
            </button>
          </div>
        </div>

        {/* 4 Quick Stat KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-5 pt-5 border-t border-slate-100">
          <div className="bg-slate-50 rounded-2xl p-3 border border-slate-100">
            <span className="text-[11px] font-medium text-slate-500 block">Pertemuan</span>
            <span className="text-xl sm:text-2xl font-bold text-slate-900 tabular-nums">
              {stats.totalLessons}
            </span>
            <span className="text-[10px] text-slate-400 block mt-0.5">Sesi selesai</span>
          </div>

          <div className="bg-slate-50 rounded-2xl p-3 border border-slate-100">
            <span className="text-[11px] font-medium text-slate-500 block">Rata-rata Nilai</span>
            <span className="text-xl sm:text-2xl font-bold text-slate-900 tabular-nums">
              {stats.avgScore}
            </span>
            <span className="text-[10px] text-slate-400 block mt-0.5">Skala 100</span>
          </div>

          <div className="bg-slate-50 rounded-2xl p-3 border border-slate-100">
            <span className="text-[11px] font-medium text-slate-500 block">Kehadiran</span>
            <span className="text-xl sm:text-2xl font-bold text-slate-900 tabular-nums">
              {stats.attendanceRate}%
            </span>
            <span className="text-[10px] text-slate-400 block mt-0.5">{stats.presentCount} hadir</span>
          </div>

          <div className="bg-slate-50 rounded-2xl p-3 border border-slate-100">
            <span className="text-[11px] font-medium text-slate-500 block">Tagihan Tertunda</span>
            <span className={`text-base sm:text-lg font-bold tabular-nums ${stats.pendingBill > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
              {stats.pendingBill > 0 ? formatRupiah(stats.pendingBill) : 'Lunas'}
            </span>
            <span className="text-[10px] text-slate-400 block mt-0.5">Status pembayaran</span>
          </div>
        </div>

        {/* Private Link Quick Toolbar */}
        <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 bg-slate-50/70 p-3 rounded-2xl">
          <div className="flex items-center gap-2 text-xs text-slate-600 min-w-0">
            <span className="text-slate-400 shrink-0 font-medium">Private Link:</span>
            <span className="font-mono text-slate-700 truncate select-all max-w-[200px] sm:max-w-xs">
              {privateLink}
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={handleCopyLink}
              className="text-xs px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-100 font-semibold flex items-center gap-1 shadow-2xs"
            >
              {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedLink ? 'Tersalin' : 'Salin Link'}
            </button>
            <button
              onClick={() => {
                if (stats.latestReport) {
                  setSelectedReportForShare(stats.latestReport);
                  setIsShareModalOpen(true);
                } else {
                  alert('Belum ada report untuk dibagikan. Silakan buat report terlebih dahulu.');
                }
              }}
              className="text-xs px-2.5 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-semibold flex items-center gap-1 shadow-2xs"
            >
              <Share2 className="w-3.5 h-3.5" />
              Share WA
            </button>
            <button
              onClick={() => setIsRegenerateConfirmOpen(true)}
              className="text-xs p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
              title="Perbarui Private Link jika bocor"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Tabs Navigation (Responsive Horizontal Scroller) */}
      <div className="flex items-center gap-1 overflow-x-auto pb-2 mb-4 scrollbar-none border-b border-slate-200">
        {[
          { id: 'overview', label: 'Ringkasan' },
          { id: 'progress', label: 'Progress & Nilai' },
          { id: 'absensi', label: `Absensi (${attendanceList.length})` },
          { id: 'jadwal', label: `Jadwal (${schedules.length})` },
          { id: 'pembayaran', label: 'Pembayaran' },
          { id: 'foto', label: `Foto (${allPhotos.length})` },
          { id: 'komentar', label: `Komentar (${comments.length})` },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-3.5 py-2 text-xs font-semibold rounded-xl whitespace-nowrap transition-colors shrink-0 ${
              activeTab === tab.id
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB CONTENT: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          {/* Latest Lesson Report Card */}
          {stats.latestReport ? (
            <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-indigo-700 tracking-wide uppercase">
                  Laporan Terakhir ({formatDateIndo(stats.latestReport.date)})
                </span>
                <ScoreBadge
                  score={stats.latestReport.score}
                  category={stats.latestReport.scoreCategory}
                  size="md"
                />
              </div>

              <h3 className="text-base font-bold text-slate-900 mb-1">
                {stats.latestReport.subject}: {stats.latestReport.topic}
              </h3>

              <div className="space-y-3 mt-3 text-xs text-slate-700">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <span className="font-semibold text-slate-900 block mb-0.5">
                    Yang Dipelajari:
                  </span>
                  <p className="text-slate-600">{stats.latestReport.whatLearned}</p>
                </div>

                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <span className="font-semibold text-slate-900 block mb-0.5">
                    Hasil Pembelajaran:
                  </span>
                  <p className="text-slate-600">{stats.latestReport.learningOutcome}</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="bg-emerald-50/60 p-3 rounded-xl border border-emerald-100">
                    <span className="font-semibold text-emerald-900 block mb-0.5">
                      🌱 Tahap Berikutnya:
                    </span>
                    <p className="text-emerald-800">{stats.latestReport.nextStep}</p>
                  </div>
                  <div className="bg-blue-50/60 p-3 rounded-xl border border-blue-100">
                    <span className="font-semibold text-blue-900 block mb-0.5">
                      🏠 Latihan di Rumah:
                    </span>
                    <p className="text-blue-800">{stats.latestReport.homePractice}</p>
                  </div>
                </div>
              </div>

              {/* Actions on latest report */}
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                <button
                  onClick={() => setViewingReportDetail(stats.latestReport)}
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                >
                  Lihat Detail Penuh <ChevronRight className="w-3.5 h-3.5" />
                </button>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setEditingReport(stats.latestReport);
                      setIsReportModalOpen(true);
                    }}
                    className="text-xs px-2.5 py-1.5 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-100 font-semibold"
                  >
                    Edit Report
                  </button>
                  <button
                    onClick={() => {
                      setSelectedReportForShare(stats.latestReport);
                      setIsShareModalOpen(true);
                    }}
                    className="text-xs px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-semibold flex items-center gap-1"
                  >
                    <Share2 className="w-3.5 h-3.5" /> Share WA
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 text-center">
              <BookOpen className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <h4 className="text-sm font-bold text-slate-800">Belum Ada Laporan Pembelajaran</h4>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                Setelah les pertama selesai, buat laporan untuk mencatat perkembangan dan nilai anak.
              </p>
              <button
                onClick={() => {
                  setEditingReport(null);
                  setIsReportModalOpen(true);
                }}
                className="mt-3 px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl"
              >
                + Buat Laporan Pertama
              </button>
            </div>
          )}

          {/* Score Trend Chart */}
          <ProgressChart reports={reports} childName={child.nickname} />
        </div>
      )}

      {/* TAB CONTENT: PROGRESS & NILAI */}
      {activeTab === 'progress' && (
        <div className="space-y-4">
          <ProgressChart reports={reports} childName={child.nickname} />

          <div className="flex items-center justify-between pt-2">
            <h4 className="text-sm font-bold text-slate-900">
              Riwayat Seluruh Laporan Belajar ({reports.length})
            </h4>
            <button
              onClick={() => {
                setEditingReport(null);
                setIsReportModalOpen(true);
              }}
              className="text-xs px-3 py-1.5 bg-indigo-600 text-white font-semibold rounded-lg flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> Tambah Report
            </button>
          </div>

          <div className="space-y-3">
            {reports.map((rep) => (
              <div
                key={rep.id}
                className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs hover:border-indigo-300 transition-colors"
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <span className="text-xs font-semibold text-slate-400 block">
                      {formatDateIndo(rep.date)} · {rep.durationMinutes} Menit
                    </span>
                    <h5 className="text-sm font-bold text-slate-900 mt-0.5">
                      {rep.subject}: {rep.topic}
                    </h5>
                  </div>
                  <ScoreBadge score={rep.score} category={rep.scoreCategory} size="sm" />
                </div>

                <p className="text-xs text-slate-600 line-clamp-2 mt-1 bg-slate-50 p-2 rounded-lg">
                  {rep.learningOutcome}
                </p>

                <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-100">
                  <div className="flex items-center gap-2 text-[11px] text-slate-500">
                    {rep.sharedViaWhatsapp ? (
                      <span className="text-emerald-600 font-semibold flex items-center gap-1">
                        <Check className="w-3 h-3" /> Sudah dishare via WA
                      </span>
                    ) : (
                      <span className="text-slate-400">Belum dishare</span>
                    )}
                    {rep.photos && rep.photos.length > 0 && (
                      <span>· {rep.photos.length} foto</span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setViewingReportDetail(rep)}
                      className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                    >
                      Buka
                    </button>
                    <button
                      onClick={() => {
                        setSelectedReportForShare(rep);
                        setIsShareModalOpen(true);
                      }}
                      className="text-xs text-emerald-600 hover:text-emerald-700 font-semibold flex items-center gap-1"
                    >
                      <Share2 className="w-3 h-3" /> WA
                    </button>
                    <button
                      onClick={() => {
                        setEditingReport(rep);
                        setIsReportModalOpen(true);
                      }}
                      className="text-xs text-slate-500 hover:text-slate-800"
                    >
                      Edit
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB CONTENT: ABSENSI */}
      {activeTab === 'absensi' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs">
            <h4 className="text-sm font-bold text-slate-900 mb-2">Statistik Kehadiran</h4>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-100">
                <span className="text-xs font-semibold text-emerald-800 block">Hadir</span>
                <span className="text-xl font-bold text-emerald-700 tabular-nums">
                  {attendanceList.filter((a) => a.status === 'hadir').length}
                </span>
              </div>
              <div className="bg-blue-50 rounded-xl p-3 border border-blue-100">
                <span className="text-xs font-semibold text-blue-800 block">Izin</span>
                <span className="text-xl font-bold text-blue-700 tabular-nums">
                  {attendanceList.filter((a) => a.status === 'izin').length}
                </span>
              </div>
              <div className="bg-rose-50 rounded-xl p-3 border border-rose-100">
                <span className="text-xs font-semibold text-rose-800 block">Tidak Hadir</span>
                <span className="text-xl font-bold text-rose-700 tabular-nums">
                  {attendanceList.filter((a) => a.status === 'alpa' || a.status === 'sakit').length}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs">
            <h4 className="text-sm font-bold text-slate-900 mb-3">Histori Absensi Lengkap</h4>
            <div className="divide-y divide-slate-100">
              {attendanceList.map((att) => {
                const style = getAttendanceStyle(att.status);
                return (
                  <div key={att.id} className="py-2.5 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-semibold text-slate-900 block">
                        {formatDateIndo(att.date)}
                      </span>
                      {att.startTime && (
                        <span className="text-slate-400">
                          {att.startTime} - {att.endTime}
                        </span>
                      )}
                      {att.notes && <span className="text-slate-500 block italic">"{att.notes}"</span>}
                    </div>
                    <span className={`px-2.5 py-1 rounded-md border font-semibold ${style.bg}`}>
                      {getAttendanceLabel(att.status)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: JADWAL */}
      {activeTab === 'jadwal' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs">
            <h4 className="text-sm font-bold text-slate-900 mb-3">Jadwal Rutin Les</h4>
            {schedules.length > 0 ? (
              <div className="space-y-3">
                {schedules.map((sch) => (
                  <div
                    key={sch.id}
                    className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200 flex flex-col items-center justify-center text-indigo-700">
                        <Clock className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-indigo-700 block">
                          {DAY_NAMES[sch.dayOfWeek]} · {sch.startTime} - {sch.endTime}
                        </span>
                        <h5 className="text-sm font-semibold text-slate-900">{sch.subject}</h5>
                        <p className="text-[11px] text-slate-500">{sch.location}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setEditingReport(null);
                        setIsReportModalOpen(true);
                      }}
                      className="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg font-semibold shadow-2xs"
                    >
                      Mulai Report
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500">Belum ada jadwal les untuk anak ini.</p>
            )}
          </div>
        </div>
      )}

      {/* TAB CONTENT: PEMBAYARAN */}
      {activeTab === 'pembayaran' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs">
            <h4 className="text-sm font-bold text-slate-900 mb-3">Riwayat Pembayaran & Tagihan</h4>
            {payments.length > 0 ? (
              <div className="space-y-3">
                {payments.map((pay) => {
                  const style = getPaymentStatusStyle(pay.status);
                  return (
                    <div
                      key={pay.id}
                      className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <h5 className="text-sm font-bold text-slate-900">{pay.period}</h5>
                          <span
                            className={`text-xs font-bold px-2 py-0.5 rounded-md border ${style.bg} ${style.border}`}
                          >
                            {getPaymentStatusLabel(pay.status)}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                          Nominal: <strong>{formatRupiah(pay.amount)}</strong> · Jatuh tempo:{' '}
                          {formatDateIndo(pay.dueDate)}
                        </p>
                        {pay.paidDate && (
                          <p className="text-xs text-emerald-700 mt-0.5 font-medium">
                            ✓ Terbayar lunas pada {formatDateIndo(pay.paidDate)}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {pay.status !== 'lunas' && (
                          <button
                            onClick={() => handleMarkPaymentPaid(pay.id)}
                            className="px-3 py-1.5 bg-emerald-600 text-white rounded-xl text-xs font-bold shadow-2xs hover:bg-emerald-700"
                          >
                            Tandai Lunas
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-slate-500">Belum ada data pembayaran.</p>
            )}
          </div>
        </div>
      )}

      {/* TAB CONTENT: FOTO */}
      {activeTab === 'foto' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-sm font-bold text-slate-900">
                Dokumentasi Kegiatan Belajar ({allPhotos.length})
              </h4>
              <button
                onClick={() => {
                  setEditingReport(null);
                  setIsReportModalOpen(true);
                }}
                className="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg font-semibold flex items-center gap-1"
              >
                <Camera className="w-3.5 h-3.5" /> Upload via Report
              </button>
            </div>

            {allPhotos.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {allPhotos.map((photo) => (
                  <div
                    key={photo.id}
                    className="group relative rounded-2xl overflow-hidden border border-slate-200 aspect-4/3 bg-slate-100"
                  >
                    <img
                      src={photo.url}
                      alt={photo.caption || 'Foto'}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                    />
                    {photo.caption && (
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/80 via-slate-950/40 to-transparent p-2">
                        <p className="text-[11px] text-white font-medium line-clamp-1">
                          {photo.caption}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-xs text-slate-400">
                Belum ada foto kegiatan. Foto dapat diunggah saat membuat report les.
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB CONTENT: KOMENTAR ORANG TUA */}
      {activeTab === 'komentar' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs">
            <h4 className="text-sm font-bold text-slate-900 mb-3">
              Percakapan & Catatan Komunikasi ({comments.length})
            </h4>

            <div className="space-y-3 mb-4 max-h-96 overflow-y-auto">
              {comments.map((comm) => (
                <div
                  key={comm.id}
                  className={`p-3.5 rounded-2xl text-xs ${
                    comm.senderRole === 'guru'
                      ? 'bg-indigo-50 border border-indigo-100 ml-6 text-indigo-950'
                      : 'bg-slate-50 border border-slate-200 mr-6 text-slate-900'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold">
                      {comm.senderName}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {formatDateIndo(comm.createdAt.split('T')[0])}
                    </span>
                  </div>
                  <p className="leading-relaxed">{comm.message}</p>
                </div>
              ))}
            </div>

            {/* Comment reply input */}
            <form onSubmit={handleAddComment} className="flex gap-2">
              <input
                type="text"
                value={newCommentText}
                onChange={(e) => setNewCommentText(e.target.value)}
                placeholder="Tulis balasan atau catatan untuk orang tua..."
                className="flex-1 text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 focus:outline-indigo-500 focus:bg-white"
              />
              <button
                type="submit"
                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs"
              >
                <Send className="w-3.5 h-3.5" /> Kirim
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Report Form Wizard Modal */}
      <ReportFormModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        child={child}
        initialReport={editingReport}
        onSaved={(savedReport, openShare) => {
          setIsReportModalOpen(false);
          if (openShare) {
            setSelectedReportForShare(savedReport);
            setIsShareModalOpen(true);
          }
        }}
      />

      {/* WhatsApp Share Deep Link Modal */}
      {selectedReportForShare && (
        <WhatsappShareModal
          isOpen={isShareModalOpen}
          onClose={() => {
            setIsShareModalOpen(false);
            setSelectedReportForShare(null);
          }}
          child={child}
          report={selectedReportForShare}
          originUrl={originUrl}
        />
      )}

      {/* Full Report Detail Modal */}
      {viewingReportDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-xl overflow-hidden border border-slate-200 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50">
              <h3 className="text-sm font-bold text-slate-900">
                Detail Laporan Belajar
              </h3>
              <button
                onClick={() => setViewingReportDetail(null)}
                className="text-xs px-2.5 py-1 bg-slate-200 hover:bg-slate-300 rounded-lg font-semibold"
              >
                Tutup
              </button>
            </div>
            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-slate-400 block">{formatDateIndo(viewingReportDetail.date)}</span>
                  <h4 className="text-base font-bold text-slate-900 mt-0.5">
                    {viewingReportDetail.subject}: {viewingReportDetail.topic}
                  </h4>
                </div>
                <ScoreBadge
                  score={viewingReportDetail.score}
                  category={viewingReportDetail.scoreCategory}
                  size="md"
                />
              </div>

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                <span className="font-bold text-slate-800 block mb-1">Yang Dipelajari:</span>
                <p className="text-slate-600">{viewingReportDetail.whatLearned}</p>
              </div>

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                <span className="font-bold text-slate-800 block mb-1">Hasil Pembelajaran:</span>
                <p className="text-slate-600">{viewingReportDetail.learningOutcome}</p>
              </div>

              <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-100">
                <span className="font-bold text-emerald-900 block mb-1">Tahap Berikutnya:</span>
                <p className="text-emerald-800">{viewingReportDetail.nextStep}</p>
              </div>

              <div className="bg-blue-50 p-3 rounded-xl border border-blue-100">
                <span className="font-bold text-blue-900 block mb-1">Rekomendasi Latihan di Rumah:</span>
                <p className="text-blue-800">{viewingReportDetail.homePractice}</p>
              </div>

              {viewingReportDetail.photos && viewingReportDetail.photos.length > 0 && (
                <div>
                  <span className="font-bold text-slate-800 block mb-2">Dokumentasi:</span>
                  <div className="grid grid-cols-2 gap-2">
                    {viewingReportDetail.photos.map((p) => (
                      <img
                        key={p.id}
                        src={p.url}
                        alt="Dokumentasi"
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

      {/* Regenerate Token Confirmation Dialog */}
      {isRegenerateConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 shadow-xl border border-slate-200">
            <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center mb-3">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-slate-900">Perbarui Private Report Link?</h3>
            <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
              Jika Anda membuat link baru, <strong>link lama yang telah dikirim ke WhatsApp akan otomatis tidak dapat diakses lagi</strong>. Anda perlu membagikan link baru ke orang tua.
            </p>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                onClick={() => setIsRegenerateConfirmOpen(false)}
                className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Batal
              </button>
              <button
                onClick={handleRegenerateToken}
                className="px-4 py-2 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-xl shadow-2xs"
              >
                Ya, Buat Link Baru
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
