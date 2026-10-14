import React, { useState } from 'react';
import { db } from '../../services/db';
import { BookOpen, ShieldCheck, ArrowRight, UserCheck, KeyRound } from 'lucide-react';

interface LoginViewProps {
  onLoginSuccess: () => void;
  onOpenParentDemo: (token: string) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({
  onLoginSuccess,
  onOpenParentDemo,
}) => {
  const [email, setEmail] = useState('sarah.tutor@example.com');
  const [password, setPassword] = useState('guru123');
  const [error, setError] = useState('');

  const tokens = db.getTokens();
  const children = db.getChildren();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Mohon isi email dan password');
      return;
    }
    // Teacher demo verification
    onLoginSuccess();
  };

  const handleQuickDemoTeacher = () => {
    onLoginSuccess();
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-center items-center p-4 selection:bg-indigo-100">
      <div className="w-full max-w-sm bg-white rounded-3xl p-6 sm:p-7 shadow-xl border border-slate-200">
        {/* Brand Icon & Heading */}
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center mx-auto mb-3 shadow-md shadow-indigo-600/20 font-bold text-lg">
            LR
          </div>
          <h1 className="text-xl font-bold text-slate-900">Les Report</h1>
          <p className="text-xs text-slate-500 mt-1">
            Buku Raport Digital & Manajemen Les Privat
          </p>
        </div>

        {error && (
          <div className="mb-4 p-2.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-3.5 text-xs">
          <div>
            <label className="font-semibold text-slate-700 block mb-1">Email Pengajar</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 focus:outline-indigo-500 focus:bg-white"
              required
            />
          </div>

          <div>
            <label className="font-semibold text-slate-700 block mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 focus:outline-indigo-500 focus:bg-white"
              required
            />
          </div>

          <button
            type="submit"
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-md shadow-indigo-600/20 transition-all flex items-center justify-center gap-1.5"
          >
            Masuk sebagai Guru <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </form>

        <div className="mt-4 pt-4 border-t border-slate-100">
          <button
            onClick={handleQuickDemoTeacher}
            className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
          >
            <UserCheck className="w-4 h-4 text-indigo-600" /> 1-Klik Masuk Demo Guru (Kak Sarah)
          </button>
        </div>

        {/* Shortcut to test Parent Portal without login */}
        <div className="mt-6 pt-4 border-t border-dashed border-slate-200">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block text-center mb-2">
            Atau Uji Akses Orang Tua (Tanpa Login)
          </span>
          <div className="space-y-1.5">
            {children.map((ch) => {
              const t = tokens.find((tok) => tok.childId === ch.id && !tok.isRevoked);
              if (!t) return null;
              return (
                <button
                  key={ch.id}
                  onClick={() => onOpenParentDemo(t.token)}
                  className="w-full p-2 bg-emerald-50/60 hover:bg-emerald-100/70 text-emerald-900 border border-emerald-200/80 rounded-xl text-xs font-semibold flex items-center justify-between transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <img
                      src={ch.avatarUrl}
                      alt={ch.nickname}
                      className="w-5 h-5 rounded-full object-cover"
                    />
                    <span>Buka Raport {ch.nickname}</span>
                  </div>
                  <ArrowRight className="w-3 h-3 text-emerald-600" />
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
