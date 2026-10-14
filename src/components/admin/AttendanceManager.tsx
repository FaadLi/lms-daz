import React, { useState } from 'react';
import { db } from '../../services/db';
import { Attendance, AttendanceStatus } from '../../types';
import {
  formatDateIndo,
  getAttendanceStyle,
  getAttendanceLabel,
} from '../../data/presets';
import { CheckCircle2, Plus, Calendar, Clock, UserCheck } from 'lucide-react';

export const AttendanceManager: React.FC = () => {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const children = db.getChildren();
  const attendanceList = db.getAttendance();

  // New attendance state
  const [childId, setChildId] = useState(children[0]?.id || '');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [status, setStatus] = useState<AttendanceStatus>('hadir');
  const [startTime, setStartTime] = useState('16:00');
  const [endTime, setEndTime] = useState('17:00');
  const [notes, setNotes] = useState('');

  const handleSaveAttendance = (e: React.FormEvent) => {
    e.preventDefault();
    if (!childId) return;

    const newAtt: Attendance = {
      id: 'att_' + Date.now(),
      childId,
      date,
      status,
      startTime,
      endTime,
      notes,
    };

    db.saveAttendance(newAtt);
    setIsAddModalOpen(false);
  };

  const hadirCount = attendanceList.filter((a) => a.status === 'hadir').length;
  const izinCount = attendanceList.filter((a) => a.status === 'izin').length;
  const sakitCount = attendanceList.filter((a) => a.status === 'sakit').length;
  const alpaCount = attendanceList.filter((a) => a.status === 'alpa').length;
  const total = attendanceList.length;
  const rate = total > 0 ? Math.round((hadirCount / total) * 100) : 100;

  return (
    <div className="pb-24 max-w-4xl mx-auto px-4 sm:px-6 pt-2 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Pencatatan Absensi Les</h1>
          <p className="text-xs text-slate-500">
            Catat kehadiran, izin, dan rekapitulasi sesi les anak
          </p>
        </div>
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition-all"
        >
          <Plus className="w-4 h-4" /> Catat Kehadiran Baru
        </button>
      </div>

      {/* Summary Stats */}
      <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs">
        <h3 className="text-sm font-bold text-slate-900 mb-3">Rekapitulasi Kehadiran Seluruh Murid</h3>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
            <span className="text-[11px] font-medium text-slate-500 block">Tingkat Hadir</span>
            <span className="text-2xl font-bold text-indigo-700 tabular-nums">{rate}%</span>
          </div>
          <div className="bg-emerald-50 p-3 rounded-2xl border border-emerald-100">
            <span className="text-[11px] font-medium text-emerald-800 block">Hadir</span>
            <span className="text-2xl font-bold text-emerald-700 tabular-nums">{hadirCount}</span>
          </div>
          <div className="bg-blue-50 p-3 rounded-2xl border border-blue-100">
            <span className="text-[11px] font-medium text-blue-800 block">Izin</span>
            <span className="text-2xl font-bold text-blue-700 tabular-nums">{izinCount}</span>
          </div>
          <div className="bg-amber-50 p-3 rounded-2xl border border-amber-100">
            <span className="text-[11px] font-medium text-amber-800 block">Sakit</span>
            <span className="text-2xl font-bold text-amber-700 tabular-nums">{sakitCount}</span>
          </div>
          <div className="bg-rose-50 p-3 rounded-2xl border border-rose-100">
            <span className="text-[11px] font-medium text-rose-800 block">Tidak Hadir</span>
            <span className="text-2xl font-bold text-rose-700 tabular-nums">{alpaCount}</span>
          </div>
        </div>
      </div>

      {/* Attendance List */}
      <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs space-y-3">
        <h3 className="text-sm font-bold text-slate-900 mb-2">Riwayat Presensi Terbaru</h3>
        <div className="divide-y divide-slate-100">
          {attendanceList.map((att) => {
            const child = children.find((c) => c.id === att.childId);
            const style = getAttendanceStyle(att.status);

            return (
              <div key={att.id} className="py-3 flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-3">
                  {child && (
                    <img
                      src={child.avatarUrl}
                      alt={child.fullName}
                      className="w-10 h-10 rounded-xl object-cover border border-slate-200 shadow-2xs"
                    />
                  )}
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm">
                      {child?.fullName || 'Murid'}
                    </h4>
                    <p className="text-slate-500">
                      {formatDateIndo(att.date)} {att.startTime && `· ${att.startTime} - ${att.endTime}`}
                    </p>
                    {att.notes && <p className="text-slate-500 italic mt-0.5">"{att.notes}"</p>}
                  </div>
                </div>

                <span
                  className={`px-3 py-1 rounded-xl border font-bold text-xs ${style.bg}`}
                >
                  {getAttendanceLabel(att.status)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Add Attendance Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl p-5 border border-slate-200">
            <h3 className="text-base font-bold text-slate-900 mb-1">Catat Presensi Les</h3>
            <p className="text-xs text-slate-500 mb-4">
              Pilih anak dan tentukan status kehadiran hari ini
            </p>

            <form onSubmit={handleSaveAttendance} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Pilih Murid</label>
                <select
                  value={childId}
                  onChange={(e) => setChildId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 focus:outline-indigo-500"
                >
                  {children.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.fullName} ({c.gradeLevel})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Tanggal</label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 focus:outline-indigo-500"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 focus:outline-indigo-500"
                  >
                    <option value="hadir">Hadir</option>
                    <option value="izin">Izin</option>
                    <option value="sakit">Sakit</option>
                    <option value="alpa">Tidak Hadir (Alpa)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Waktu Mulai</label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 focus:outline-indigo-500"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Waktu Selesai</label>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 focus:outline-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Catatan Tambahan (Opsional)</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Misal: Hadir tepat waktu, sangat aktif bertanya"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 focus:outline-indigo-500"
                />
              </div>

              <div className="mt-5 flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-xs"
                >
                  Simpan Presensi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
