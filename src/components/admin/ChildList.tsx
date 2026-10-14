import React, { useState } from 'react';
import { db } from '../../services/db';
import { Child, Parent } from '../../types';
import { Plus, Search, Filter, Phone, MessageSquare, ChevronRight, Eye, Play } from 'lucide-react';
import { formatDateIndo } from '../../data/presets';

interface ChildListProps {
  onSelectChild: (childId: string) => void;
  onStartReport: (childId: string) => void;
  onPreviewAsParent: (token: string) => void;
}

export const ChildList: React.FC<ChildListProps> = ({
  onSelectChild,
  onStartReport,
  onPreviewAsParent,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('active');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Add child form state
  const [fullName, setFullName] = useState('');
  const [nickname, setNickname] = useState('');
  const [gradeLevel, setGradeLevel] = useState('Kelas 3 SD');
  const [gender, setGender] = useState<'L' | 'P'>('P');
  const [birthDate, setBirthDate] = useState('2018-05-14');
  const [parentName, setParentName] = useState('');
  const [parentWhatsapp, setParentWhatsapp] = useState('');
  const [notes, setNotes] = useState('');

  const allChildren = db.getChildren();

  const filteredChildren = allChildren.filter((c) => {
    const matchesSearch =
      c.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.nickname.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter =
      filterActive === 'all'
        ? true
        : filterActive === 'active'
        ? c.isActive
        : !c.isActive;
    return matchesSearch && matchesFilter;
  });

  const handleSaveNewChild = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !nickname.trim()) return;

    // Save parent first
    const newParentId = 'par_' + Date.now();
    const newParent: Parent = {
      id: newParentId,
      fullName: parentName || `Orang Tua ${nickname}`,
      whatsappNumber: parentWhatsapp || '081200000000',
      relationship: 'Ibu',
    };
    db.saveParent(newParent);

    // Save child
    const newChild: Child = {
      id: 'ch_' + Date.now(),
      fullName: fullName.trim(),
      nickname: nickname.trim(),
      avatarUrl:
        gender === 'P'
          ? '/src/assets/images/avatar_aisyah_1791905355087.jpg'
          : '/src/assets/images/avatar_budi_1791905378587.jpg',
      birthDate,
      gender,
      gradeLevel,
      notes,
      isActive: true,
      startDate: new Date().toISOString().split('T')[0],
      parentId: newParentId,
    };
    db.saveChild(newChild);

    // Reset and close
    setFullName('');
    setNickname('');
    setParentName('');
    setParentWhatsapp('');
    setNotes('');
    setIsAddModalOpen(false);
  };

  return (
    <div className="pb-24 max-w-4xl mx-auto px-4 sm:px-6 pt-2 space-y-4">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Daftar Murid Les</h1>
          <p className="text-xs text-slate-500">
            Kelola data murid, orang tua, dan raport digital anak
          </p>
        </div>
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition-all"
        >
          <Plus className="w-4 h-4" /> Tambah Murid Baru
        </button>
      </div>

      {/* Search and Filters */}
      <div className="bg-white p-3 rounded-2xl border border-slate-200 flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari nama lengkap atau panggilan..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-indigo-500"
          />
        </div>

        {/* Filter Segmented Control */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl w-full sm:w-auto">
          <button
            onClick={() => setFilterActive('active')}
            className={`flex-1 sm:flex-none px-3 py-1 text-xs font-semibold rounded-lg transition-colors ${
              filterActive === 'active'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Aktif
          </button>
          <button
            onClick={() => setFilterActive('all')}
            className={`flex-1 sm:flex-none px-3 py-1 text-xs font-semibold rounded-lg transition-colors ${
              filterActive === 'all'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Semua
          </button>
          <button
            onClick={() => setFilterActive('inactive')}
            className={`flex-1 sm:flex-none px-3 py-1 text-xs font-semibold rounded-lg transition-colors ${
              filterActive === 'inactive'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Nonaktif
          </button>
        </div>
      </div>

      {/* Child Cards List */}
      <div className="space-y-3">
        {filteredChildren.map((child) => {
          const stats = db.getChildStats(child.id);
          const tokenObj = db.getTokenForChild(child.id);
          const parent = child.parent;

          return (
            <div
              key={child.id}
              className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs hover:border-indigo-300 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div
                onClick={() => onSelectChild(child.id)}
                className="flex items-start sm:items-center gap-3.5 cursor-pointer flex-1"
              >
                <img
                  src={child.avatarUrl}
                  alt={child.fullName}
                  className="w-14 h-14 rounded-2xl object-cover border border-slate-200 shadow-2xs shrink-0"
                />
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-900 hover:text-indigo-600">
                      {child.fullName}
                    </h3>
                    <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                      {child.nickname}
                    </span>
                  </div>

                  <p className="text-xs text-slate-500 mt-0.5">
                    {child.gradeLevel} · Ortu: {parent?.fullName || '-'} ({parent?.whatsappNumber || '-'})
                  </p>

                  <div className="flex items-center gap-3 mt-1.5 text-xs">
                    <span className="text-slate-700 font-semibold">
                      Nilai Rata-rata: <strong className="text-indigo-600 tabular-nums">{stats.avgScore}</strong>
                    </span>
                    <span className="text-slate-300">·</span>
                    <span className="text-slate-700 font-semibold">
                      {stats.totalLessons} Sesi
                    </span>
                    <span className="text-slate-300">·</span>
                    <span className="text-slate-700 font-semibold">
                      Hadir {stats.attendanceRate}%
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 self-end sm:self-auto pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 w-full sm:w-auto justify-end">
                <button
                  onClick={() => onPreviewAsParent(tokenObj.token)}
                  className="px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl flex items-center gap-1 transition-colors"
                  title="Lihat tampilan orang tua"
                >
                  <Eye className="w-3.5 h-3.5" />
                  Preview
                </button>
                <button
                  onClick={() => onStartReport(child.id)}
                  className="px-3.5 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl flex items-center gap-1 shadow-2xs transition-colors"
                >
                  <Play className="w-3 h-3 fill-current" />
                  Mulai Report
                </button>
                <button
                  onClick={() => onSelectChild(child.id)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}

        {filteredChildren.length === 0 && (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-xs text-slate-500">
            Tidak ada data murid yang sesuai dengan filter pencarian.
          </div>
        )}
      </div>

      {/* Add Child Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl p-5 border border-slate-200 max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-bold text-slate-900 mb-1">Tambah Murid Baru</h3>
            <p className="text-xs text-slate-500 mb-4">
              Data murid akan langsung terhubung dengan pembuatan raport dan private link
            </p>

            <form onSubmit={handleSaveNewChild} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Nama Lengkap Murid</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Contoh: Muhammad Farhan Al-Fatih"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 focus:outline-indigo-500 focus:bg-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Nama Panggilan</label>
                  <input
                    type="text"
                    required
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    placeholder="Contoh: Farhan"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 focus:outline-indigo-500 focus:bg-white"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Tingkat Kelas</label>
                  <input
                    type="text"
                    value={gradeLevel}
                    onChange={(e) => setGradeLevel(e.target.value)}
                    placeholder="Kelas 3 SD"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 focus:outline-indigo-500 focus:bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Jenis Kelamin</label>
                  <select
                    value={gender}
                    onChange={(e) => setGender(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 focus:outline-indigo-500 focus:bg-white"
                  >
                    <option value="P">Perempuan</option>
                    <option value="L">Laki-laki</option>
                  </select>
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Tanggal Lahir</label>
                  <input
                    type="date"
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 focus:outline-indigo-500 focus:bg-white"
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100">
                <span className="font-bold text-slate-800 block mb-2">Informasi Orang Tua</span>
                <div className="space-y-2">
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">Nama Ibu/Ayah</label>
                    <input
                      type="text"
                      value={parentName}
                      onChange={(e) => setParentName(e.target.value)}
                      placeholder="Contoh: Ibu Rina Wulandari"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 focus:outline-indigo-500 focus:bg-white"
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">Nomor WhatsApp Orang Tua</label>
                    <input
                      type="tel"
                      value={parentWhatsapp}
                      onChange={(e) => setParentWhatsapp(e.target.value)}
                      placeholder="Contoh: 081234567890"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 focus:outline-indigo-500 focus:bg-white"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Catatan Khusus</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Catatan minat, gaya belajar, atau target khusus..."
                  rows={2}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 focus:outline-indigo-500 focus:bg-white resize-none"
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
                  Simpan Murid
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
