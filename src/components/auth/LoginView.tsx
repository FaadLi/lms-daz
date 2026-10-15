import { useState } from "react";
import { client } from "../../services/supabase";
import { useMutation } from "../../services/hooks";
import { ErrorNotice } from "../common/DataUI";
import { BookOpen, Mail, Lock, Loader2, ArrowRight, ShieldCheck } from "lucide-react";

export function LoginView() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const mutation = useMutation();

  return (
    <main className="min-h-screen flex flex-col justify-center items-center p-4 sm:p-6 bg-gradient-to-b from-slate-50 via-indigo-50/30 to-slate-100">
      <div className="max-w-md w-full space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-600 text-white shadow-md shadow-indigo-200 mb-1">
            <BookOpen className="w-7 h-7" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Les Report
          </h1>
          <p className="text-sm text-slate-500">
            Manajemen Les Privat & Raport Digital Siswa
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-white border border-slate-200/80 rounded-3xl p-6 sm:p-8 shadow-xl shadow-slate-200/50">
          <div className="mb-6">
            <h2 className="text-lg font-bold text-slate-900">Masuk sebagai Guru</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Kelola data les privat, absensi, pembayaran, dan raport murid
            </p>
          </div>

          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void mutation.run(async () => {
                const { error } = await client().auth.signInWithPassword({
                  email: email.trim(),
                  password,
                });
                if (error) throw error;
              });
            }}
          >
            <fieldset disabled={mutation.pending} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Email Guru
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="email"
                    autoComplete="username"
                    required
                    placeholder="nama@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 pl-10 pr-3.5 py-2.5 text-sm text-slate-900 bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors shadow-2xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Kata Sandi
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="password"
                    autoComplete="current-password"
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 pl-10 pr-3.5 py-2.5 text-sm text-slate-900 bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors shadow-2xs"
                  />
                </div>
              </div>

              <ErrorNotice message={mutation.error} />

              <button
                type="submit"
                disabled={mutation.pending}
                className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md shadow-indigo-200 transition-all disabled:opacity-60 cursor-pointer"
              >
                {mutation.pending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                    Memverifikasi akun…
                  </>
                ) : (
                  <>
                    Masuk ke Dashboard
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </fieldset>
          </form>

          <div className="mt-6 pt-5 border-t border-slate-100 flex items-center justify-center gap-2 text-xs text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Koneksi aman terenkripsi & sesi tersimpan</span>
          </div>
        </div>

        {/* Footer info */}
        <p className="text-center text-xs text-slate-400">
          Les Report &copy; {new Date().getFullYear()} · Aplikasi Les Privat Mobile-First
        </p>
      </div>
    </main>
  );
}
