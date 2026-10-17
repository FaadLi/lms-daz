import { scheduleSubjectsLabel } from "../../utils/schedules";
import { useState, useEffect } from "react";
import type { User } from "@supabase/supabase-js";
import type { Row, Entity } from "../../types";
import { client } from "../../services/supabase";
import { db, edge } from "../../services/db";
import { useMutation, useQuery } from "../../services/hooks";
import { CrudPanel } from "./CrudPanel";
import { ChildDetail } from "./ChildDetail";
import { Avatar, MediaManager } from "./MediaManager";
import { ErrorNotice, QueryState, RecordForm, text } from "../common/DataUI";
import { profileFields } from "../../data/forms";
import { formatRupiah, DAY_NAMES } from "../../data/presets";
import {
  BookOpen,
  Home,
  Users,
  Calendar,
  CheckSquare,
  CreditCard,
  Settings,
  LogOut,
  Edit2,
  RefreshCw,
  ArrowRight,
  ShieldCheck,
  FileText,
  Clock,
  MessageSquare,
  UserCheck,
  MoreHorizontal,
  X,
  ChevronRight,
} from "lucide-react";

const navigationItems = [
  { key: "dashboard", label: "Dashboard", icon: Home },
  { key: "children", label: "Murid", icon: Users },
  { key: "parents", label: "Orang Tua", icon: UserCheck },
  { key: "schedules", label: "Jadwal", icon: Calendar },
  { key: "attendance", label: "Absensi", icon: CheckSquare },
  { key: "invoices", label: "Pembayaran", icon: CreditCard },
  { key: "subjects", label: "Mata Pelajaran", icon: BookOpen },
  { key: "report_templates", label: "Template", icon: FileText },
  { key: "settings", label: "Pengaturan", icon: Settings },
];

function Dashboard({
  onNavigate,
  onOpenChild,
}: {
  onNavigate: (route: string) => void;
  onOpenChild: (id: string) => void;
}) {
  const query = useQuery("dashboard", db.dashboard);
  const childrenQuery = useQuery("dashboard:children", () =>
    db.list("children", { page: 0, activeOnly: true }),
  );
  const schedulesQuery = useQuery("dashboard:schedules", () =>
    db.list("schedules", { page: 0, activeOnly: true }),
  );

  const stats = [
    {
      key: "children",
      label: "Murid Aktif",
      icon: Users,
      color: "from-blue-500 to-indigo-600",
      bgLight: "bg-blue-50",
      textColor: "text-blue-700",
      route: "children",
    },
    {
      key: "sessions",
      label: "Sesi Hari Ini",
      icon: Calendar,
      color: "from-emerald-500 to-teal-600",
      bgLight: "bg-emerald-50",
      textColor: "text-emerald-700",
      route: "schedules",
    },
    {
      key: "present",
      label: "Hadir Hari Ini",
      icon: CheckSquare,
      color: "from-teal-500 to-cyan-600",
      bgLight: "bg-teal-50",
      textColor: "text-teal-700",
      route: "attendance",
    },
    {
      key: "reports",
      label: "Laporan Belajar",
      icon: FileText,
      color: "from-purple-500 to-indigo-600",
      bgLight: "bg-purple-50",
      textColor: "text-purple-700",
      route: "children",
    },
    {
      key: "unread",
      label: "Komentar Baru",
      icon: MessageSquare,
      color: "from-amber-500 to-orange-600",
      bgLight: "bg-amber-50",
      textColor: "text-amber-700",
      route: "children",
    },
    {
      key: "outstanding",
      label: "Sisa Tagihan",
      icon: CreditCard,
      color: "from-rose-500 to-pink-600",
      bgLight: "bg-rose-50",
      textColor: "text-rose-700",
      route: "invoices",
    },
  ];

  return (
    <div className="space-y-5">
      {/* KPI Cards Grid */}
      <QueryState query={query}>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {stats.map((item) => {
            const Icon = item.icon;
            const val = query.data?.[item.key] || 0;
            const isMoney = item.key === "outstanding";

            return (
              <article
                key={item.key}
                onClick={() => onNavigate(item.route)}
                className="bg-white border border-slate-200/80 rounded-2xl p-4 sm:p-5 shadow-xs hover:border-indigo-200 transition-all cursor-pointer space-y-2 group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500 group-hover:text-indigo-600 transition-colors">
                    {item.label}
                  </span>
                  <div
                    className={`w-8 h-8 rounded-xl ${item.bgLight} ${item.textColor} flex items-center justify-center`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight tabular-nums">
                  {isMoney ? formatRupiah(val) : val}
                </div>
              </article>
            );
          })}
        </div>
      </QueryState>

      {/* Quick Actions Row */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-4 sm:p-5 shadow-xs space-y-3">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
          Aksi Cepat Guru
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <button
            type="button"
            onClick={() => onNavigate("children")}
            className="flex flex-col items-center justify-center p-3 rounded-xl bg-slate-50 hover:bg-indigo-50 hover:text-indigo-700 border border-slate-200/80 text-slate-700 text-xs font-semibold gap-1.5 transition-colors cursor-pointer"
          >
            <Users className="w-5 h-5 text-indigo-600" />
            <span>Kelola Murid</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate("schedules")}
            className="flex flex-col items-center justify-center p-3 rounded-xl bg-slate-50 hover:bg-indigo-50 hover:text-indigo-700 border border-slate-200/80 text-slate-700 text-xs font-semibold gap-1.5 transition-colors cursor-pointer"
          >
            <Calendar className="w-5 h-5 text-emerald-600" />
            <span>Atur Jadwal</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate("attendance")}
            className="flex flex-col items-center justify-center p-3 rounded-xl bg-slate-50 hover:bg-indigo-50 hover:text-indigo-700 border border-slate-200/80 text-slate-700 text-xs font-semibold gap-1.5 transition-colors cursor-pointer"
          >
            <CheckSquare className="w-5 h-5 text-teal-600" />
            <span>Catat Absensi</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate("invoices")}
            className="flex flex-col items-center justify-center p-3 rounded-xl bg-slate-50 hover:bg-indigo-50 hover:text-indigo-700 border border-slate-200/80 text-slate-700 text-xs font-semibold gap-1.5 transition-colors cursor-pointer"
          >
            <CreditCard className="w-5 h-5 text-rose-600" />
            <span>Tagihan & Biaya</span>
          </button>
        </div>
      </div>

      {/* Active Students Quick Cards */}
      <section className="bg-white border border-slate-200/80 rounded-2xl p-4 sm:p-5 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Murid Aktif & Raport Cepat
            </h3>
            <p className="text-2xs text-slate-400">
              Pilih murid untuk membuka raport dan membagikan laporan ke orang tua
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate("children")}
            className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 cursor-pointer"
          >
            Lihat Semua
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <QueryState query={childrenQuery}>
          {childrenQuery.data?.items.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-400">
              Belum ada data murid terdaftar. Klik &quot;Kelola Murid&quot; untuk menambahkan murid baru.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {childrenQuery.data?.items.slice(0, 6).map((child) => (
                <div
                  key={child.id}
                  onClick={() => onOpenChild(child.id)}
                  className="p-3.5 rounded-xl border border-slate-200 hover:border-indigo-300 bg-slate-50/50 hover:bg-white transition-all cursor-pointer flex items-center justify-between gap-3 group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar
                      id={child.avatar_id ? String(child.avatar_id) : undefined}
                      name={text(child, "full_name")}
                    />
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-slate-900 truncate group-hover:text-indigo-600">
                        {text(child, "full_name")}
                      </h4>
                      <p className="text-2xs text-slate-500">
                        Kelas: {text(child, "grade_level")} ·{" "}
                        {text(child, "nickname") || "Murid"}
                      </p>
                    </div>
                  </div>
                  <span className="shrink-0 text-2xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-1 rounded-lg group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                    Raport →
                  </span>
                </div>
              ))}
            </div>
          )}
        </QueryState>
      </section>

      {/* Today's Schedule Overview */}
      <section className="bg-white border border-slate-200/80 rounded-2xl p-4 sm:p-5 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-900">
              Jadwal Les Mendatang
            </h3>
          </div>
          <button
            type="button"
            onClick={() => onNavigate("schedules")}
            className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 cursor-pointer"
          >
            Semua Jadwal
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <QueryState query={schedulesQuery}>
          {schedulesQuery.data?.items.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-400">
              Belum ada jadwal les tersimpan. Tambahkan jadwal melalui menu Jadwal.
            </div>
          ) : (
            <div className="space-y-2">
              {schedulesQuery.data?.items.slice(0, 4).map((row) => (
                <div
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="px-2 py-1 rounded-md bg-indigo-50 text-indigo-700 font-bold text-2xs border border-indigo-100">
                      {DAY_NAMES[Number(row.day_of_week)]}
                    </span>
                    <div>
                      <strong className="text-slate-800">
                        {text(row, "child.full_name") || "Murid"}
                      </strong>
                      <span className="text-slate-400 ml-1.5 break-words">
                        · {scheduleSubjectsLabel(row)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-2xs text-slate-500 font-mono">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    <span>
                      {text(row, "start_time")} – {text(row, "end_time")}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </QueryState>
      </section>
    </div>
  );
}

export function AdminWorkspace({ user, path }: { user: User; path: string }) {
  const profile = useQuery(
    `profile:${user.id}`,
    async () => (await db.list("profiles")).items[0] || null,
  );
  const [editing, setEditing] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const mutation = useMutation();
  const page = path.split("/")[1] || "dashboard";
  const childId = path.match(/^\/children\/([a-f0-9-]+)$/i)?.[1];

  useEffect(() => {
    setMoreOpen(false);
  }, [path]);

  useEffect(() => {
    if (!moreOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMoreOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [moreOpen]);

  const navigateTo = (route: string) => {
    window.location.hash = `/${route}`;
  };

  const teacherName = text(profile.data || undefined, "name") || "Guru";
  const institutionName =
    text(profile.data || undefined, "institution_name") || "Les Privat";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-28 md:pb-12">
      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-2xs">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          {/* Logo & Brand */}
          <a
            href="#/dashboard"
            className="flex items-center gap-2.5 text-slate-900 hover:opacity-90 transition-opacity"
          >
            <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <span className="font-black text-base tracking-tight text-slate-900 block leading-tight">
                Les Report
              </span>
              <span className="text-2xs text-slate-400 block font-medium">
                Portal Guru
              </span>
            </div>
          </a>

          {/* User profile & actions */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200/80">
              <Avatar
                id={profile.data?.avatar_id ? String(profile.data.avatar_id) : undefined}
                name={teacherName}
              />
              <div className="text-left text-xs leading-tight">
                <strong className="block font-bold text-slate-800">
                  {teacherName}
                </strong>
                <span className="text-2xs text-slate-400">
                  {institutionName}
                </span>
              </div>
            </div>

            <button
              type="button"
              disabled={mutation.pending}
              onClick={() =>
                void mutation.run(async () => {
                  const { error } = await client().auth.signOut();
                  if (error) throw error;
                })
              }
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-600 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 rounded-xl transition-colors cursor-pointer"
              title="Keluar dari akun"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Keluar</span>
            </button>
          </div>
        </div>

        {/* Desktop Navigation Tabs */}
        <div className="hidden md:block max-w-6xl mx-auto px-4 sm:px-6 border-t border-slate-100">
          <nav className="flex items-center gap-1 overflow-x-auto py-2 scrollbar-none">
            {navigationItems.map((item) => {
              const Icon = item.icon;
              const isActive = page === item.key;
              return (
                <a
                  key={item.key}
                  href={`#/${item.key}`}
                  className={`inline-flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-lg transition-colors whitespace-nowrap ${
                    isActive
                      ? "bg-indigo-600 text-white shadow-xs"
                      : "text-slate-600 hover:text-indigo-600 hover:bg-indigo-50/50"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {item.label}
                </a>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-5 space-y-4">
        {/* Welcome greeting banner for dashboard */}
        {page === "dashboard" && !childId && (
          <div className="bg-gradient-to-r from-indigo-700 via-indigo-600 to-purple-600 rounded-3xl p-5 sm:p-6 text-white shadow-md space-y-1 relative overflow-hidden">
            <div className="relative z-10">
              <span className="inline-block px-2.5 py-0.5 rounded-full bg-white/20 text-white font-semibold text-2xs mb-1 backdrop-blur-xs">
                {institutionName}
              </span>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight">
                Selamat Datang, {teacherName} 👋
              </h1>
              <p className="text-xs sm:text-sm text-indigo-100 max-w-xl">
                Catat kemajuan belajar anak, kirim laporan instan ke orang tua via WhatsApp, dan pantau administrasi les privat dengan mudah.
              </p>
            </div>
            <div className="absolute right-4 -bottom-6 opacity-10 pointer-events-none">
              <BookOpen className="w-48 h-48 text-white" />
            </div>
          </div>
        )}

        <ErrorNotice message={mutation.error} />

        <QueryState query={profile}>
          {profile.data === null ? (
            <RecordForm
              title="Lengkapi Profil Guru"
              draft={{ form: "profiles" }}
              fields={profileFields}
              initial={{ id: user.id, version: 0 } as Row}
              onClose={() => void client().auth.signOut()}
              onSave={async (values) => {
                await db.save("profiles", { ...values, id: user.id });
                profile.refresh();
              }}
            />
          ) : childId ? (
            <ChildDetail key={childId} id={childId} />
          ) : page === "dashboard" ? (
            <Dashboard
              onNavigate={navigateTo}
              onOpenChild={(id) => {
                window.location.hash = `/children/${id}`;
              }}
            />
          ) : page === "settings" ? (
            <section className="space-y-4">
              {/* Profile Card */}
              <div className="bg-white border border-slate-200/80 rounded-2xl p-5 sm:p-6 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                  <div className="flex items-center gap-3.5">
                    <Avatar
                      id={profile.data?.avatar_id ? String(profile.data.avatar_id) : undefined}
                      name={teacherName}
                    />
                    <div>
                      <h2 className="text-lg font-bold text-slate-900">
                        {teacherName}
                      </h2>
                      <p className="text-xs text-slate-500">
                        {user.email} · {institutionName}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditing(true)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors cursor-pointer self-start sm:self-auto"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    Edit Profil Guru
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <span className="text-2xs text-slate-400 block font-semibold uppercase">
                      Nama Guru:
                    </span>
                    <strong className="text-slate-800">{teacherName}</strong>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <span className="text-2xs text-slate-400 block font-semibold uppercase">
                      Nama Lembaga:
                    </span>
                    <strong className="text-slate-800">{institutionName}</strong>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <span className="text-2xs text-slate-400 block font-semibold uppercase">
                      Nomor Telepon:
                    </span>
                    <strong className="text-slate-800">
                      {text(profile.data || undefined, "phone") || "Belum diisi"}
                    </strong>
                  </div>
                </div>

                {profile.data && (
                  <MediaManager
                    target={profile.data}
                    kind="profile"
                    onChanged={profile.refresh}
                  />
                )}
              </div>

              {/* Maintenance Card */}
              <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs space-y-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-indigo-600" />
                  <h3 className="text-sm font-bold text-slate-900">
                    Pemeliharaan Penyimpanan Cloud
                  </h3>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Jalankan fungsi pembersihan untuk menghapus berkas sementara atau unggahan yang tertunda dan tidak terpakai dari Supabase Storage.
                </p>
                <button
                  type="button"
                  disabled={mutation.pending}
                  onClick={() =>
                    void mutation.run(() =>
                      edge({ action: "cleanup-media" }, true),
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  {mutation.pending ? "Membersihkan…" : "Bersihkan Upload Tertunda"}
                </button>
              </div>
            </section>
          ) : (
            <CrudPanel
              key={page}
              table={page as Entity}
              title={
                navigationItems.find((n) => n.key === page)?.label ||
                page
              }
              onChild={
                page === "children"
                  ? (row) => {
                      window.location.hash = `/children/${row.id}`;
                    }
                  : undefined
              }
            />
          )}
        </QueryState>

        {/* Edit profile modal */}
        {editing && profile.data && (
          <RecordForm
            title="Edit Profil Guru"
            draft={{ form: "profiles", loadLatest: () => db.get("profiles", user.id) }}
            fields={profileFields}
            initial={profile.data}
            onClose={() => setEditing(false)}
            onSave={async (values, _id, meta) => {
              await db.save(
                "profiles",
                { ...values, id: user.id },
                meta.version,
              );
              profile.refresh();
            }}
          />
        )}
      </main>

      {/* Mobile Bottom Navigation Bar (Exactly 5 items) */}
      <nav
        aria-label="Navigasi Bawah Mobile"
        className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-slate-200/80 px-1 py-1.5 flex justify-around items-center pb-safe shadow-lg"
      >
        {/* 1. Beranda */}
        <a
          href="#/dashboard"
          className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-colors min-w-[56px] ${
            page === "dashboard" && !childId
              ? "text-indigo-600 font-bold"
              : "text-slate-500 hover:text-slate-800 font-medium"
          }`}
        >
          <Home
            className={`w-5 h-5 mb-0.5 ${
              page === "dashboard" && !childId
                ? "text-indigo-600 scale-110"
                : "text-slate-400"
            } transition-transform`}
          />
          <span className="text-3xs leading-none">Beranda</span>
        </a>

        {/* 2. Murid */}
        <a
          href="#/children"
          className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-colors min-w-[56px] ${
            page === "children" || Boolean(childId)
              ? "text-indigo-600 font-bold"
              : "text-slate-500 hover:text-slate-800 font-medium"
          }`}
        >
          <Users
            className={`w-5 h-5 mb-0.5 ${
              page === "children" || Boolean(childId)
                ? "text-indigo-600 scale-110"
                : "text-slate-400"
            } transition-transform`}
          />
          <span className="text-3xs leading-none">Murid</span>
        </a>

        {/* 3. Jadwal */}
        <a
          href="#/schedules"
          className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-colors min-w-[56px] ${
            page === "schedules" && !childId
              ? "text-indigo-600 font-bold"
              : "text-slate-500 hover:text-slate-800 font-medium"
          }`}
        >
          <Calendar
            className={`w-5 h-5 mb-0.5 ${
              page === "schedules" && !childId
                ? "text-indigo-600 scale-110"
                : "text-slate-400"
            } transition-transform`}
          />
          <span className="text-3xs leading-none">Jadwal</span>
        </a>

        {/* 4. Absensi */}
        <a
          href="#/attendance"
          className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-colors min-w-[56px] ${
            page === "attendance" && !childId
              ? "text-indigo-600 font-bold"
              : "text-slate-500 hover:text-slate-800 font-medium"
          }`}
        >
          <CheckSquare
            className={`w-5 h-5 mb-0.5 ${
              page === "attendance" && !childId
                ? "text-indigo-600 scale-110"
                : "text-slate-400"
            } transition-transform`}
          />
          <span className="text-3xs leading-none">Absensi</span>
        </a>

        {/* 5. Lainnya */}
        <button
          type="button"
          onClick={() => setMoreOpen(!moreOpen)}
          aria-expanded={moreOpen}
          aria-haspopup="dialog"
          className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-colors min-w-[56px] cursor-pointer ${
            moreOpen ||
            (["parents", "subjects", "report_templates", "invoices", "settings"].includes(page) && !childId)
              ? "text-indigo-600 font-bold"
              : "text-slate-500 hover:text-slate-800 font-medium"
          }`}
        >
          <div className="relative">
            <MoreHorizontal
              className={`w-5 h-5 mb-0.5 ${
                moreOpen ||
                (["parents", "subjects", "report_templates", "invoices", "settings"].includes(page) && !childId)
                  ? "text-indigo-600 scale-110"
                  : "text-slate-400"
              } transition-transform`}
            />
            {["parents", "subjects", "report_templates", "invoices", "settings"].includes(page) && !childId && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-indigo-600 ring-2 ring-white" />
            )}
          </div>
          <span className="text-3xs leading-none">Lainnya</span>
        </button>
      </nav>

      {/* Mobile Bottom Sheet for "Lainnya" */}
      {moreOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs transition-opacity animate-in fade-in"
            onClick={() => setMoreOpen(false)}
            aria-hidden="true"
          />

          {/* Bottom Sheet Container */}
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Menu Lainnya"
            className="relative z-10 bg-white rounded-t-3xl border-t border-slate-200/90 shadow-2xl max-w-lg w-full mx-auto max-h-[85vh] overflow-y-auto animate-in slide-in-from-bottom duration-200 pb-safe"
          >
            {/* Grab Bar Indicator */}
            <div className="pt-3 pb-1 flex justify-center sticky top-0 bg-white z-10">
              <div className="w-10 h-1 bg-slate-300 rounded-full" />
            </div>

            {/* Header */}
            <div className="px-5 py-2.5 flex items-center justify-between border-b border-slate-100 sticky top-5 bg-white z-10">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Menu Lainnya
                </h3>
                <p className="text-2xs text-slate-400">
                  Akses modul administrasi & sistem
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors cursor-pointer"
                aria-label="Tutup menu"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Menu Sections */}
            <div className="p-4 space-y-4 pb-8">
              {/* SECTION: DATA */}
              <div>
                <span className="text-3xs font-bold text-slate-400 uppercase tracking-wider block px-1 mb-2">
                  DATA
                </span>
                <div className="space-y-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setMoreOpen(false);
                      navigateTo("parents");
                    }}
                    className={`w-full flex items-center justify-between p-2.5 rounded-xl border text-left transition-colors cursor-pointer ${
                      page === "parents" && !childId
                        ? "bg-indigo-50 border-indigo-200 text-indigo-900"
                        : "bg-slate-50/70 hover:bg-slate-100/70 border-slate-200/70 text-slate-800"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                          page === "parents" && !childId
                            ? "bg-indigo-600 text-white"
                            : "bg-blue-100 text-blue-700"
                        }`}
                      >
                        <UserCheck className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold flex items-center gap-2 truncate">
                          <span>Orang Tua</span>
                          {page === "parents" && !childId && (
                            <span className="text-3xs px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-bold">
                              Aktif
                            </span>
                          )}
                        </div>
                        <div className="text-2xs text-slate-400 truncate">
                          Data kontak & akses wali murid
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setMoreOpen(false);
                      navigateTo("subjects");
                    }}
                    className={`w-full flex items-center justify-between p-2.5 rounded-xl border text-left transition-colors cursor-pointer ${
                      page === "subjects" && !childId
                        ? "bg-indigo-50 border-indigo-200 text-indigo-900"
                        : "bg-slate-50/70 hover:bg-slate-100/70 border-slate-200/70 text-slate-800"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                          page === "subjects" && !childId
                            ? "bg-indigo-600 text-white"
                            : "bg-indigo-100 text-indigo-700"
                        }`}
                      >
                        <BookOpen className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold flex items-center gap-2 truncate">
                          <span>Mata Pelajaran</span>
                          {page === "subjects" && !childId && (
                            <span className="text-3xs px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-bold">
                              Aktif
                            </span>
                          )}
                        </div>
                        <div className="text-2xs text-slate-400 truncate">
                          Daftar mata pelajaran les
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setMoreOpen(false);
                      navigateTo("report_templates");
                    }}
                    className={`w-full flex items-center justify-between p-2.5 rounded-xl border text-left transition-colors cursor-pointer ${
                      page === "report_templates" && !childId
                        ? "bg-indigo-50 border-indigo-200 text-indigo-900"
                        : "bg-slate-50/70 hover:bg-slate-100/70 border-slate-200/70 text-slate-800"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                          page === "report_templates" && !childId
                            ? "bg-indigo-600 text-white"
                            : "bg-purple-100 text-purple-700"
                        }`}
                      >
                        <FileText className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold flex items-center gap-2 truncate">
                          <span>Template</span>
                          {page === "report_templates" && !childId && (
                            <span className="text-3xs px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-bold">
                              Aktif
                            </span>
                          )}
                        </div>
                        <div className="text-2xs text-slate-400 truncate">
                          Template narasi & penilaian raport
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                  </button>
                </div>
              </div>

              {/* SECTION: ADMINISTRASI */}
              <div>
                <span className="text-3xs font-bold text-slate-400 uppercase tracking-wider block px-1 mb-2">
                  ADMINISTRASI
                </span>
                <div className="space-y-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setMoreOpen(false);
                      navigateTo("invoices");
                    }}
                    className={`w-full flex items-center justify-between p-2.5 rounded-xl border text-left transition-colors cursor-pointer ${
                      page === "invoices" && !childId
                        ? "bg-indigo-50 border-indigo-200 text-indigo-900"
                        : "bg-slate-50/70 hover:bg-slate-100/70 border-slate-200/70 text-slate-800"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                          page === "invoices" && !childId
                            ? "bg-indigo-600 text-white"
                            : "bg-rose-100 text-rose-700"
                        }`}
                      >
                        <CreditCard className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold flex items-center gap-2 truncate">
                          <span>Pembayaran</span>
                          {page === "invoices" && !childId && (
                            <span className="text-3xs px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-bold">
                              Aktif
                            </span>
                          )}
                        </div>
                        <div className="text-2xs text-slate-400 truncate">
                          Status SPP, biaya & tagihan les
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                  </button>
                </div>
              </div>

              {/* SECTION: SISTEM */}
              <div>
                <span className="text-3xs font-bold text-slate-400 uppercase tracking-wider block px-1 mb-2">
                  SISTEM
                </span>
                <div className="space-y-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setMoreOpen(false);
                      navigateTo("settings");
                    }}
                    className={`w-full flex items-center justify-between p-2.5 rounded-xl border text-left transition-colors cursor-pointer ${
                      page === "settings" && !childId
                        ? "bg-indigo-50 border-indigo-200 text-indigo-900"
                        : "bg-slate-50/70 hover:bg-slate-100/70 border-slate-200/70 text-slate-800"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                          page === "settings" && !childId
                            ? "bg-indigo-600 text-white"
                            : "bg-slate-200 text-slate-700"
                        }`}
                      >
                        <Settings className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold flex items-center gap-2 truncate">
                          <span>Pengaturan</span>
                          {page === "settings" && !childId && (
                            <span className="text-3xs px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-bold">
                              Aktif
                            </span>
                          )}
                        </div>
                        <div className="text-2xs text-slate-400 truncate">
                          Profil guru, lembaga & cloud
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                  </button>

                  <button
                    type="button"
                    disabled={mutation.pending}
                    onClick={() => {
                      setMoreOpen(false);
                      void mutation.run(async () => {
                        const { error } = await client().auth.signOut();
                        if (error) throw error;
                      });
                    }}
                    className="w-full flex items-center justify-between p-2.5 rounded-xl border border-rose-100 bg-rose-50/70 hover:bg-rose-100/70 text-left transition-colors cursor-pointer group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-600 flex items-center justify-center shrink-0 group-hover:bg-rose-200 transition-colors">
                        <LogOut className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-rose-700 truncate">
                          Akun / Keluar
                        </div>
                        <div className="text-2xs text-rose-500/80 truncate">
                          {user.email || "Keluar dari sesi"}
                        </div>
                      </div>
                    </div>
                    <span className="text-2xs font-bold text-rose-600 px-2 py-1 rounded-lg bg-white border border-rose-200 shrink-0 group-hover:bg-rose-600 group-hover:text-white transition-colors">
                      Keluar
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
