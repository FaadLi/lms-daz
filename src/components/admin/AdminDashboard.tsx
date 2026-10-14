import React from 'react';
import { db } from '../../services/db';
import { Schedule, Child } from '../../types';
import { formatRupiah, DAY_NAMES } from '../../data/presets';
import {
  Users,
  Calendar,
  CheckCircle2,
  Clock,
  AlertCircle,
  Plus,
  ArrowRight,
  MessageCircle,
  CreditCard,
  ChevronRight,
  Play,
} from 'lucide-react';

interface AdminDashboardProps {
  onSelectChild: (childId: string) => void;
  onStartReport: (childId: string) => void;
  onNavigate: (view: string) => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  onSelectChild,
  onStartReport,
  onNavigate,
}) => {
  const teacher = db.getTeacher();
  const stats = db.getDashboardStats();
  const children = db.getChildren();

  // Find day greeting
  const hour = new Date().getHours();
  const greeting =
    hour < 11 ? 'Selamat pagi' : hour < 15 ? 'Selamat siang' : hour < 18 ? 'Selamat sore' : 'Selamat malam';

  return (
    <div className="pb-24 max-w-4xl mx-auto px-4 sm:px-6 pt-2 space-y-5">
      {/* Greeting Banner */}
      <div className="bg-gradient-to-r from-indigo-700 to-indigo-900 text-white rounded-3xl p-5 sm:p-6 shadow-md relative overflow-hidden">
        <div className="relative z-10">
          <span className="text-xs font-semibold text-indigo-200 block uppercase tracking-wider">
            {teacher.institutionName || 'Les Privat'}
          </span>
          <h1 className="text-xl sm:text-2xl font-bold mt-1">
            {greeting}, {teacher.name.split(',')[0]} 👋
          </h1>
          <p className="text-xs text-indigo-100 mt-1 max-w-md">
            Hari ini ada <span className="font-bold underline">{stats.todaySessionsCount} sesi les</span> yang terjadwal. Catat perkembangan anak segera setelah sesi selesai.
          </p>

          <div className="flex flex-wrap gap-2 mt-4">
            <button
              onClick={() => onNavigate('children')}
              className="text-xs bg-white text-indigo-950 font-bold px-3.5 py-2 rounded-xl shadow-xs hover:bg-indigo-50 transition-colors flex items-center gap-1.5"
            >
              <Users className="w-3.5 h-3.5" /> Kelola Murid ({stats.activeChildrenCount})
            </button>
            <button
              onClick={() => onNavigate('schedules')}
              className="text-xs bg-indigo-800/80 hover:bg-indigo-800 text-white font-semibold px-3.5 py-2 rounded-xl transition-colors flex items-center gap-1.5"
            >
              <Calendar className="w-3.5 h-3.5" /> Jadwal Mengajar
            </button>
          </div>
        </div>
      </div>

      {/* 4 Mini KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[11px] font-semibold text-slate-500">Sesi Hari Ini</span>
            <Calendar className="w-4 h-4 text-indigo-600" />
          </div>
          <span className="text-2xl font-bold text-slate-900 tabular-nums">
            {stats.todaySessionsCount}
          </span>
          <span className="text-[10px] text-slate-400 block mt-0.5">Jadwal aktif</span>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[11px] font-semibold text-slate-500">Hadir Hari Ini</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <span className="text-2xl font-bold text-slate-900 tabular-nums">
            {stats.todayPresentCount}
          </span>
          <span className="text-[10px] text-slate-400 block mt-0.5">Sudah check-in</span>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[11px] font-semibold text-slate-500">Tagihan Tertunda</span>
            <CreditCard className="w-4 h-4 text-amber-500" />
          </div>
          <span className="text-2xl font-bold text-slate-900 tabular-nums">
            {stats.pendingPaymentsCount}
          </span>
          <span className="text-[10px] text-slate-400 block mt-0.5">Belum lunas</span>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[11px] font-semibold text-slate-500">Pesan Masuk</span>
            <MessageCircle className="w-4 h-4 text-blue-500" />
          </div>
          <span className="text-2xl font-bold text-slate-900 tabular-nums">
            {stats.unreadCommentsCount}
          </span>
          <span className="text-[10px] text-slate-400 block mt-0.5">Dari orang tua</span>
        </div>
      </div>

      {/* Agenda Hari Ini (Schedules today with direct Mulai Report CTA) */}
      <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">Agenda Les Hari Ini</h2>
            <p className="text-xs text-slate-500">
              Mulai input laporan langsung dengan sekali klik
            </p>
          </div>
          <button
            onClick={() => onNavigate('schedules')}
            className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
          >
            Lihat Jadwal <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {stats.todaySchedules.length > 0 ? (
          <div className="space-y-3">
            {stats.todaySchedules.map((sch) => {
              const child = children.find((c) => c.id === sch.childId);
              if (!child) return null;

              return (
                <div
                  key={sch.id}
                  className="bg-slate-50/80 border border-slate-200/90 rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-indigo-300 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <img
                      src={child.avatarUrl}
                      alt={child.fullName}
                      className="w-11 h-11 rounded-xl object-cover border border-slate-200 shadow-2xs"
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                          {sch.startTime} - {sch.endTime}
                        </span>
                        <span className="text-xs text-slate-500 font-medium">({sch.durationMinutes} mnt)</span>
                      </div>
                      <h3
                        onClick={() => onSelectChild(child.id)}
                        className="text-sm font-bold text-slate-900 hover:text-indigo-600 cursor-pointer mt-0.5"
                      >
                        {child.fullName}
                      </h3>
                      <p className="text-[11px] text-slate-500">
                        {sch.subject} · {sch.location}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-auto">
                    <button
                      onClick={() => onSelectChild(child.id)}
                      className="px-3 py-1.5 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-100 transition-colors"
                    >
                      Detail
                    </button>
                    <button
                      onClick={() => onStartReport(child.id)}
                      className="px-3.5 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl flex items-center gap-1 shadow-2xs transition-colors"
                    >
                      <Play className="w-3 h-3 fill-current" /> Mulai Report
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-6 text-center text-xs text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
            Tidak ada agenda les terjadwal untuk hari ini.
          </div>
        )}
      </div>

      {/* Daftar Murid Aktif Shortcut */}
      <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">Murid Aktif</h2>
            <p className="text-xs text-slate-500">Pilih murid untuk melihat raport atau progress</p>
          </div>
          <button
            onClick={() => onNavigate('children')}
            className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
          >
            Semua ({children.length})
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {children.map((child) => {
            const childStats = db.getChildStats(child.id);
            return (
              <div
                key={child.id}
                onClick={() => onSelectChild(child.id)}
                className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl hover:border-indigo-300 hover:bg-indigo-50/20 transition-all cursor-pointer flex items-center gap-3"
              >
                <img
                  src={child.avatarUrl}
                  alt={child.fullName}
                  className="w-12 h-12 rounded-xl object-cover border border-slate-200 shadow-2xs shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <h4 className="text-xs font-bold text-slate-900 truncate">
                    {child.fullName}
                  </h4>
                  <p className="text-[11px] text-slate-500">{child.gradeLevel}</p>
                  <div className="flex items-center gap-2 mt-1 text-[10px]">
                    <span className="font-semibold text-indigo-700">
                      Nilai: {childStats.avgScore}
                    </span>
                    <span className="text-slate-300">·</span>
                    <span className="text-emerald-700 font-semibold">
                      {childStats.totalLessons} Sesi
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
