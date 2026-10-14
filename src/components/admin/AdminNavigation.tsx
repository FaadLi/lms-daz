import React from 'react';
import {
  Home,
  Users,
  Calendar,
  CheckSquare,
  CreditCard,
  Settings,
  Eye,
  LogOut,
} from 'lucide-react';
import { db } from '../../services/db';

interface AdminNavigationProps {
  currentView: string;
  onNavigate: (view: string) => void;
  onLogout: () => void;
  onPreviewAsParent: () => void;
}

export const AdminNavigation: React.FC<AdminNavigationProps> = ({
  currentView,
  onNavigate,
  onLogout,
  onPreviewAsParent,
}) => {
  const teacher = db.getTeacher();

  return (
    <>
      {/* Desktop & Tablet Top Bar (Adheres to Top Bar Contract) */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Brand wordmark */}
          <div
            onClick={() => onNavigate('dashboard')}
            className="flex items-center gap-2.5 cursor-pointer whitespace-nowrap shrink-0"
          >
            <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-sm shadow-xs">
              LR
            </div>
            <div>
              <span className="text-base font-bold tracking-tight text-slate-900 block leading-tight">
                Les Report
              </span>
              <span className="text-[10px] text-slate-400 block leading-none">
                Portal Guru
              </span>
            </div>
          </div>

          {/* Zone 2: Navigation links */}
          <nav className="hidden md:flex items-center gap-6 text-xs font-semibold text-slate-600">
            <button
              onClick={() => onNavigate('dashboard')}
              className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 ${
                currentView === 'dashboard' ? 'text-indigo-600 font-bold' : ''
              }`}
            >
              Dashboard
            </button>
            <button
              onClick={() => onNavigate('children')}
              className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 ${
                currentView === 'children' || currentView === 'child_detail'
                  ? 'text-indigo-600 font-bold'
                  : ''
              }`}
            >
              Daftar Murid
            </button>
            <button
              onClick={() => onNavigate('schedules')}
              className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 ${
                currentView === 'schedules' ? 'text-indigo-600 font-bold' : ''
              }`}
            >
              Jadwal
            </button>
            <button
              onClick={() => onNavigate('attendance')}
              className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 ${
                currentView === 'attendance' ? 'text-indigo-600 font-bold' : ''
              }`}
            >
              Absensi
            </button>
            <button
              onClick={() => onNavigate('payments')}
              className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 ${
                currentView === 'payments' ? 'text-indigo-600 font-bold' : ''
              }`}
            >
              Pembayaran
            </button>
            <button
              onClick={() => onNavigate('settings')}
              className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 ${
                currentView === 'settings' ? 'text-indigo-600 font-bold' : ''
              }`}
            >
              Pengaturan
            </button>
          </nav>

          {/* Zone 3: Primary action / Parent preview */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onPreviewAsParent}
              className="text-xs font-semibold px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
              title="Pratinjau tampilan orang tua"
            >
              <Eye className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Preview Ortu</span>
            </button>

            <button
              onClick={onLogout}
              className="text-xs p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors shrink-0"
              title="Keluar"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Bottom Tab Navigation (Fixed to bottom for < 768px smartphones) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 pb-safe">
        <div className="grid grid-cols-5 h-14 items-center">
          <button
            onClick={() => onNavigate('dashboard')}
            className={`flex flex-col items-center justify-center h-full min-h-[44px] transition-colors ${
              currentView === 'dashboard' ? 'text-indigo-600 font-bold' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <Home className="w-5 h-5" />
            <span className="text-[10px] mt-0.5">Beranda</span>
          </button>

          <button
            onClick={() => onNavigate('children')}
            className={`flex flex-col items-center justify-center h-full min-h-[44px] transition-colors ${
              currentView === 'children' || currentView === 'child_detail'
                ? 'text-indigo-600 font-bold'
                : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <Users className="w-5 h-5" />
            <span className="text-[10px] mt-0.5">Murid</span>
          </button>

          <button
            onClick={() => onNavigate('schedules')}
            className={`flex flex-col items-center justify-center h-full min-h-[44px] transition-colors ${
              currentView === 'schedules' ? 'text-indigo-600 font-bold' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <Calendar className="w-5 h-5" />
            <span className="text-[10px] mt-0.5">Jadwal</span>
          </button>

          <button
            onClick={() => onNavigate('attendance')}
            className={`flex flex-col items-center justify-center h-full min-h-[44px] transition-colors ${
              currentView === 'attendance' ? 'text-indigo-600 font-bold' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <CheckSquare className="w-5 h-5" />
            <span className="text-[10px] mt-0.5">Absensi</span>
          </button>

          <button
            onClick={() => onNavigate('settings')}
            className={`flex flex-col items-center justify-center h-full min-h-[44px] transition-colors ${
              currentView === 'settings' || currentView === 'payments'
                ? 'text-indigo-600 font-bold'
                : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <Settings className="w-5 h-5" />
            <span className="text-[10px] mt-0.5">Lainnya</span>
          </button>
        </div>
      </nav>
    </>
  );
};
