import React, { useState } from 'react';
import { db } from '../../services/db';
import { ShieldCheck, RotateCcw, Save, Check, User, Phone, School, AlertTriangle } from 'lucide-react';

export const AdminSettings: React.FC = () => {
  const teacher = db.getTeacher();
  const [name, setName] = useState(teacher.name);
  const [phone, setPhone] = useState(teacher.phone);
  const [email, setEmail] = useState(teacher.email);
  const [institutionName, setInstitutionName] = useState(teacher.institutionName || '');
  const [isSaved, setIsSaved] = useState(false);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    db.updateTeacher({
      name,
      phone,
      email,
      institutionName,
    });
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const handleResetData = () => {
    db.resetToDefaults();
    setIsResetConfirmOpen(false);
    window.location.reload();
  };

  // Handle ESC key to dismiss reset modal
  React.useEffect(() => {
    if (!isResetConfirmOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsResetConfirmOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isResetConfirmOpen]);

  return (
    <div className="pb-24 max-w-4xl mx-auto px-4 sm:px-6 pt-2 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Pengaturan & Profil Guru</h1>
        <p className="text-xs text-slate-500">
          Atur informasi profil guru, lembaga, serta data sistem
        </p>
      </div>

      {/* Profile Form */}
      <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-xs">
        <h2 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
          <User className="w-4 h-4 text-indigo-600" /> Profil Guru & Kontak
        </h2>

        {isSaved && (
          <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-1.5">
            <Check className="w-4 h-4 text-emerald-600" />
            <span>Perubahan profil berhasil disimpan!</span>
          </div>
        )}

        <form onSubmit={handleSaveProfile} className="space-y-3.5 text-xs">
          <div>
            <label className="font-semibold text-slate-700 block mb-1">Nama Lengkap Guru</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 focus:outline-indigo-500 focus:bg-white"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Nomor WhatsApp Guru</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 focus:outline-indigo-500 focus:bg-white"
              />
            </div>
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 focus:outline-indigo-500 focus:bg-white"
              />
            </div>
          </div>

          <div>
            <label className="font-semibold text-slate-700 block mb-1">Nama Usaha / Bimbel</label>
            <input
              type="text"
              value={institutionName}
              onChange={(e) => setInstitutionName(e.target.value)}
              placeholder="Contoh: Les Privat Ceria Pintar"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 focus:outline-indigo-500 focus:bg-white"
            />
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold flex items-center gap-1.5 shadow-xs"
            >
              <Save className="w-3.5 h-3.5" /> Simpan Profil
            </button>
          </div>
        </form>
      </div>

      {/* Security & Token Architecture Card */}
      <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-xs">
        <h2 className="text-sm font-bold text-slate-900 mb-2 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-600" /> Keamanan & Privasi Data Anak
        </h2>
        <div className="text-xs text-slate-600 space-y-2 leading-relaxed">
          <p>
            • <strong>Unguessable Cryptographic Tokens:</strong> Setiap link raport orang tua dienkapsulasi menggunakan token random 24+ karakter tanpa mengekspos ID database sensitif.
          </p>
          <p>
            • <strong>Strict Child Isolation:</strong> Orang tua hanya dapat melihat murid yang terkait langsung dengan token privat mereka.
          </p>
          <p>
            • <strong>Instant Revocation:</strong> Guru dapat meregenerasi link kapan saja melalui halaman detail anak jika link bocor.
          </p>
        </div>
      </div>

      {/* Danger Zone: Reset Data */}
      <div className="bg-rose-50/60 rounded-3xl border border-rose-200 p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-rose-950 flex items-center gap-1.5">
              <RotateCcw className="w-4 h-4 text-rose-600" /> Reset ke Data Demo
            </h3>
            <p className="text-xs text-rose-800 mt-0.5">
              Kembalikan seluruh data murid, jadwal, nilai, dan absensi ke kondisi awal demo (Aisyah, Budi, Citra).
            </p>
          </div>
          <button
            onClick={() => setIsResetConfirmOpen(true)}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shrink-0 shadow-xs"
          >
            Reset Data Demo
          </button>
        </div>
      </div>

      {/* Reset Confirmation Modal */}
      {isResetConfirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsResetConfirmOpen(false);
          }}
        >
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 shadow-xl border border-slate-200">
            <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center mb-3">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-slate-900">Reset Semua Data?</h3>
            <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
              Tindakan ini akan mengembalikan seluruh database lokal ke contoh data awal (Aisyah, Budi, Citra). Perubahan kustom yang baru Anda input akan dihapus.
            </p>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                onClick={() => setIsResetConfirmOpen(false)}
                className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Batal
              </button>
              <button
                onClick={handleResetData}
                className="px-4 py-2 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-2xs"
              >
                Ya, Reset Sekarang
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
