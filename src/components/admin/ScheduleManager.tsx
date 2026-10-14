import React, { useState } from 'react';
import { db } from '../../services/db';
import { Schedule, DayOfWeek } from '../../types';
import { DAY_NAMES, SUBJECT_OPTIONS } from '../../data/presets';
import { Calendar, Clock, Plus, Trash2, MapPin, Play, User } from 'lucide-react';

interface ScheduleManagerProps {
  onStartReport: (childId: string) => void;
  onSelectChild: (childId: string) => void;
}

export const ScheduleManager: React.FC<ScheduleManagerProps> = ({
  onStartReport,
  onSelectChild,
}) => {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedDayFilter, setSelectedDayFilter] = useState<number | 'all'>('all');

  const children = db.getChildren();
  const schedules = db.getSchedules();

  // Add schedule form state
  const [childId, setChildId] = useState(children[0]?.id || '');
  const [dayOfWeek, setDayOfWeek] = useState<DayOfWeek>(1);
  const [startTime, setStartTime] = useState('16:00');
  const [endTime, setEndTime] = useState('17:00');
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [subject, setSubject] = useState(SUBJECT_OPTIONS[0]);
  const [location, setLocation] = useState('Rumah Murid');
  const [notes, setNotes] = useState('');

  // Handle ESC key to dismiss add schedule modal
  React.useEffect(() => {
    if (!isAddModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsAddModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isAddModalOpen]);

  const handleSaveSchedule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!childId) return;

    const newSchedule: Schedule = {
      id: 'sch_' + Date.now(),
      childId,
      dayOfWeek,
      startTime,
      endTime,
      durationMinutes: Number(durationMinutes),
      subject,
      location,
      notes,
      isRecurring: true,
    };

    db.saveSchedule(newSchedule);
    setIsAddModalOpen(false);
  };

  const handleDeleteSchedule = (id: string) => {
    if (confirm('Hapus jadwal les ini?')) {
      db.deleteSchedule(id);
    }
  };

  const filteredSchedules = schedules.filter((s) =>
    selectedDayFilter === 'all' ? true : s.dayOfWeek === selectedDayFilter
  );

  return (
    <div className="pb-24 max-w-4xl mx-auto px-4 sm:px-6 pt-2 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Jadwal Mengajar Les</h1>
          <p className="text-xs text-slate-500">
            Jadwal mingguan les privat untuk seluruh murid
          </p>
        </div>
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition-all"
        >
          <Plus className="w-4 h-4" /> Tambah Jadwal Baru
        </button>
      </div>

      {/* Day Filter Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-none">
        <button
          onClick={() => setSelectedDayFilter('all')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-xl whitespace-nowrap transition-colors ${
            selectedDayFilter === 'all'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          Semua Hari ({schedules.length})
        </button>
        {[1, 2, 3, 4, 5, 6, 0].map((dayNum) => {
          const count = schedules.filter((s) => s.dayOfWeek === dayNum).length;
          return (
            <button
              key={dayNum}
              onClick={() => setSelectedDayFilter(dayNum as any)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-xl whitespace-nowrap transition-colors ${
                selectedDayFilter === dayNum
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              {DAY_NAMES[dayNum]} ({count})
            </button>
          );
        })}
      </div>

      {/* Schedules List */}
      <div className="space-y-3">
        {filteredSchedules.map((sch) => {
          const child = children.find((c) => c.id === sch.childId);
          if (!child) return null;

          return (
            <div
              key={sch.id}
              className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-indigo-300 transition-colors"
            >
              <div className="flex items-center gap-3.5">
                <img
                  src={child.avatarUrl}
                  alt={child.fullName}
                  className="w-12 h-12 rounded-xl object-cover border border-slate-200 shadow-2xs"
                />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                      {DAY_NAMES[sch.dayOfWeek]} · {sch.startTime} - {sch.endTime}
                    </span>
                    <span className="text-xs font-semibold text-slate-500">
                      ({sch.durationMinutes} menit)
                    </span>
                  </div>
                  <h3
                    onClick={() => onSelectChild(child.id)}
                    className="text-sm font-bold text-slate-900 hover:text-indigo-600 cursor-pointer mt-0.5"
                  >
                    {child.fullName} ({child.gradeLevel})
                  </h3>
                  <p className="text-xs text-slate-600 flex items-center gap-2 mt-0.5">
                    <span>📚 {sch.subject}</span>
                    <span>·</span>
                    <span className="flex items-center gap-1 text-slate-500">
                      <MapPin className="w-3 h-3" /> {sch.location}
                    </span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-auto pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                <button
                  onClick={() => onStartReport(child.id)}
                  className="px-3.5 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl flex items-center gap-1 shadow-2xs transition-colors"
                >
                  <Play className="w-3 h-3 fill-current" /> Selesai Les (Report)
                </button>
                <button
                  onClick={() => handleDeleteSchedule(sch.id)}
                  className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
                  title="Hapus jadwal"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}

        {filteredSchedules.length === 0 && (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-xs text-slate-500">
            Tidak ada jadwal mengajar pada filter ini.
          </div>
        )}
      </div>

      {/* Add Schedule Modal */}
      {isAddModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsAddModalOpen(false);
          }}
        >
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl p-5 border border-slate-200">
            <h3 className="text-base font-bold text-slate-900 mb-1">Tambah Jadwal Les</h3>
            <p className="text-xs text-slate-500 mb-4">
              Atur waktu dan mata pelajaran untuk jadwal rutin les
            </p>

            <form onSubmit={handleSaveSchedule} className="space-y-3 text-xs">
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
                  <label className="font-semibold text-slate-700 block mb-1">Hari</label>
                  <select
                    value={dayOfWeek}
                    onChange={(e) => setDayOfWeek(Number(e.target.value) as any)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 focus:outline-indigo-500"
                  >
                    {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                      <option key={d} value={d}>
                        {DAY_NAMES[d]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Durasi</label>
                  <select
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 focus:outline-indigo-500"
                  >
                    <option value={45}>45 Menit</option>
                    <option value={60}>60 Menit</option>
                    <option value={90}>90 Menit</option>
                    <option value={120}>120 Menit</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Jam Mulai</label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 focus:outline-indigo-500"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Jam Selesai</label>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 focus:outline-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Mata Pelajaran</label>
                  <select
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 focus:outline-indigo-500"
                  >
                    {SUBJECT_OPTIONS.map((sub) => (
                      <option key={sub} value={sub}>
                        {sub}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Lokasi</label>
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 focus:outline-indigo-500"
                  />
                </div>
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
                  Simpan Jadwal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
