import { scheduleSubjectsLabel } from "../../utils/schedules";
import { useEffect, useState } from "react";
import { DraftProvider, useDraft } from "../../services/useDraft";
import { DraftNotice } from "../common/DraftNotice";
import type { Row } from "../../types";
import { edge } from "../../services/db";
import { useMutation, useQuery } from "../../services/hooks";
import { ErrorNotice, Pager, QueryState, text } from "../common/DataUI";
import {
  formatDateIndo,
  formatRupiah,
  DAY_NAMES,
  getAttendanceStyle,
  getAttendanceLabel,
} from "../../data/presets";
import { ScoreBadge } from "../common/ScoreBadge";
import { ProgressChart } from "../common/ProgressChart";
import {
  BookOpen,
  Calendar,
  Camera,
  CheckCircle2,
  Clock,
  CreditCard,
  FileText,
  Loader2,
  MapPin,
  MessageSquare,
  RefreshCw,
  Sparkles,
} from "lucide-react";

interface PortalData {
  child: Row;
  teacher: Row;
  items: Row[];
  media: Row[];
  total: number;
  report_id: string | null;
}

export function ParentPortal({ token }: { token: string }) {
  const [scope, setScope] = useState("");
  useEffect(() => {
    let active = true;
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)).then((digest) => {
      if (active) setScope(`parent.${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`);
    }).catch(() => { if (active) setScope("unpersisted-parent"); });
    return () => { active = false; };
  }, [token]);
  if (!scope) return <main className="p-6 text-sm text-slate-500" role="status">Memulihkan draft...</main>;
  return <DraftProvider userId={scope === "unpersisted-parent" ? "" : scope}><ParentPortalContent token={token} /></DraftProvider>;
}
function ParentPortalContent({ token }: { token: string }) {
  const [section, setSection] = useState("reports");
  const [page, setPage] = useState(0);
  const [opened, setOpened] = useState(false);
  const draft = useDraft({ form: "parent-comments", schema: "message-v1", defaults: { message: "" } });
  const message = String(draft.values.message);
  const mutation = useMutation();

  const query = useQuery(`parent:${token}:${section}:${page}`, async () => {
    const result = await edge<PortalData>({
      action: "parent",
      token,
      operation: opened ? "read" : "open",
      section,
      page,
    });
    setOpened(true);
    return result;
  });

  const data = query.data;
  const child = data?.child;
  const teacher = data?.teacher;

  const tabs: Record<string, { label: string; icon: typeof FileText }> =
    data?.report_id
      ? {
          reports: { label: "Laporan", icon: FileText },
          comments: { label: "Komentar", icon: MessageSquare },
        }
      : {
          reports: { label: "Laporan", icon: FileText },
          schedules: { label: "Jadwal", icon: Calendar },
          attendance: { label: "Absensi", icon: CheckCircle2 },
          invoices: { label: "Pembayaran", icon: CreditCard },
          photos: { label: "Foto", icon: Camera },
          comments: { label: "Komentar", icon: MessageSquare },
        };

  const avatarMedia = data?.media.find(
    (row) => row.id === data.child.avatar_id,
  );

  return (
    <main className="min-h-screen bg-gradient-to-b from-indigo-50/40 via-slate-50 to-slate-100 text-slate-900 pb-24 font-sans">
      {/* Top Brand Banner */}
      <header className="bg-white border-b border-slate-200/80 sticky top-0 z-30 shadow-2xs">
        <div className="max-w-xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-700 text-white flex items-center justify-center shadow-xs">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-sm font-extrabold text-slate-900 leading-tight">
                Raport Digital Les Privat
              </h1>
              <p className="text-2xs text-indigo-600 font-semibold">
                {teacher
                  ? text(teacher, "institution_name") || "Bimbel Privat"
                  : "Les Report"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={query.refresh}
            className="p-2 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
            title="Perbarui data"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </header>

      <div className="max-w-xl mx-auto px-4 pt-4 space-y-4">
        <QueryState query={query}>
          {data && child && (
            <>
              {/* Child Profile Card */}
              <section className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-xs space-y-3">
                <div className="flex items-center gap-4">
                  {avatarMedia ? (
                    <img
                      src={text(avatarMedia, "url")}
                      alt={`Foto ${text(child, "full_name")}`}
                      className="w-16 h-16 rounded-2xl object-cover border-2 border-white shadow-md"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-700 text-white font-bold text-xl flex items-center justify-center shadow-md">
                      {(text(child, "nickname") || text(child, "full_name"))[0] ||
                        "A"}
                    </div>
                  )}

                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="text-base sm:text-lg font-extrabold text-slate-900 truncate">
                        {text(child, "full_name")}
                      </h2>
                      {Boolean(child.nickname) && (
                        <span className="text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-md shrink-0">
                          {text(child, "nickname")}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">
                      Kelas:{" "}
                      <strong className="text-slate-700">
                        {text(child, "grade_level")}
                      </strong>{" "}
                      · Pengajar:{" "}
                      <strong className="text-slate-700">
                        {text(teacher, "name") || "Guru Les"}
                      </strong>
                    </p>
                  </div>
                </div>

                {/* Instant Clarity Banner */}
                <div className="bg-indigo-50/70 border border-indigo-100 rounded-2xl p-3 flex items-center gap-2.5 text-xs text-indigo-900">
                  <Sparkles className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span className="leading-snug">
                    Laporan perkembangan belajar ananda selalu diperbarui setiap selesai sesi les.
                  </span>
                </div>
              </section>

              {/* Score Progress Chart (only in reports section) */}
              {section === "reports" && (
                <ProgressChart
                  childName={
                    text(child, "nickname") || text(child, "full_name")
                  }
                  reports={data.items.slice(0, 6).map((row) => ({
                    id: row.id,
                    date: text(row, "date"),
                    score: Number(row.score),
                    topic: text(row, "topic"),
                  }))}
                />
              )}

              {/* Navigation Tabs */}
              <nav className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                {Object.entries(tabs).map(([key, item]) => {
                  const Icon = item.icon;
                  const isActive = section === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        setSection(key);
                        setPage(0);
                      }}
                      className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl transition-all whitespace-nowrap cursor-pointer ${
                        isActive
                          ? "bg-indigo-600 text-white shadow-xs"
                          : "bg-white text-slate-600 hover:text-indigo-600 hover:bg-indigo-50/60 border border-slate-200/80"
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {item.label}
                    </button>
                  );
                })}
              </nav>

              {/* Section Contents */}
              {data.items.length === 0 ? (
                <div className="bg-white border border-slate-200/80 rounded-2xl p-8 text-center space-y-2">
                  <FileText className="w-10 h-10 text-slate-300 mx-auto" />
                  <p className="text-sm font-semibold text-slate-700">
                    Belum ada data {tabs[section]?.label.toLowerCase() || ""}
                  </p>
                  <p className="text-xs text-slate-400">
                    Informasi akan tampil setelah guru les memperbarui catatan belajar.
                  </p>
                </div>
              ) : (
                <div className="space-y-3.5">
                  {data.items.map((row) => (
                    <article
                      key={row.id}
                      className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-xs space-y-3"
                    >
                      {section === "reports" ? (
                        <>
                          {/* Report Header */}
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                            <div className="space-y-1">
                              <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2.5 py-0.5 rounded-md">
                                {text(row, "subject.name") || "Pelajaran"}
                              </span>
                              <h3 className="text-base font-extrabold text-slate-900 mt-1">
                                {text(row, "topic")}
                              </h3>
                              <p className="text-xs text-slate-400">
                                {formatDateIndo(text(row, "date"))}
                                {row.duration_minutes
                                  ? ` · ${row.duration_minutes} menit`
                                  : ""}
                              </p>
                            </div>
                            <ScoreBadge score={Number(row.score)} size="lg" />
                          </div>

                          {/* 4-Question Breakdown */}
                          <div className="space-y-2.5 text-xs">
                            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3">
                              <strong className="text-slate-800 block mb-1">
                                📘 Apa yang dipelajari hari ini?
                              </strong>
                              <p className="text-slate-600 whitespace-pre-wrap leading-relaxed">
                                {text(row, "what_learned")}
                              </p>
                            </div>

                            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3">
                              <strong className="text-slate-800 block mb-1">
                                🎯 Bagaimana capaian ananda?
                              </strong>
                              <p className="text-slate-600 whitespace-pre-wrap leading-relaxed">
                                {text(row, "learning_outcome")}
                              </p>
                            </div>

                            {Boolean(row.teacher_notes) && (
                              <div className="bg-amber-50/70 border border-amber-100 rounded-2xl p-3">
                                <strong className="text-amber-900 block mb-1">
                                  💡 Catatan dari guru:
                                </strong>
                                <p className="text-slate-700 whitespace-pre-wrap leading-relaxed">
                                  {text(row, "teacher_notes")}
                                </p>
                              </div>
                            )}

                            {Boolean(row.next_step || row.home_practice) && (
                              <div className="bg-indigo-50/60 border border-indigo-100 rounded-2xl p-3 space-y-1.5">
                                {Boolean(row.next_step) && (
                                  <p className="text-slate-700">
                                    <strong className="text-indigo-900">
                                      🚀 Langkah Berikutnya:{" "}
                                    </strong>
                                    {text(row, "next_step")}
                                  </p>
                                )}
                                {Boolean(row.home_practice) && (
                                  <p className="text-slate-700">
                                    <strong className="text-indigo-900">
                                      🏠 Latihan di Rumah:{" "}
                                    </strong>
                                    {text(row, "home_practice")}
                                  </p>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Photos attached to this report */}
                          {data.media
                            .filter((photo) => photo.report_id === row.id)
                            .map((photo) => (
                              <figure
                                key={photo.id}
                                className="mt-2 rounded-2xl overflow-hidden border border-slate-200 bg-slate-50"
                              >
                                <img
                                  src={text(photo, "url")}
                                  alt={
                                    text(photo, "caption") ||
                                    "Dokumentasi kegiatan les"
                                  }
                                  className="w-full max-h-72 object-cover"
                                />
                                {Boolean(photo.caption) && (
                                  <figcaption className="p-2.5 text-xs text-slate-600 font-medium bg-white">
                                    📷 {text(photo, "caption")}
                                  </figcaption>
                                )}
                              </figure>
                            ))}
                        </>
                      ) : section === "comments" ? (
                        <>
                          <div className="flex items-center justify-between text-xs border-b border-slate-100 pb-2">
                            <strong className="font-bold text-slate-800">
                              {row.from_teacher ? "Guru Les" : "Orang Tua (Anda)"}
                            </strong>
                            <span className="text-2xs text-slate-400">
                              {formatDateIndo(text(row, "created_at"))}
                            </span>
                          </div>
                          <p className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">
                            {text(row, "message")}
                          </p>
                        </>
                      ) : section === "photos" ? (
                        <div className="space-y-2">
                          <img
                            src={text(row, "url")}
                            alt={
                              text(row, "caption") || "Dokumentasi belajar"
                            }
                            className="w-full h-56 object-cover rounded-2xl"
                          />
                          <p className="text-xs text-slate-700 font-medium">
                            {text(row, "caption") || "Foto kegiatan belajar"}
                          </p>
                        </div>
                      ) : section === "invoices" ? (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                            <div>
                              <span className="text-xs font-mono font-bold text-slate-700">
                                {text(row, "invoice_number")}
                              </span>
                              <h4 className="text-sm font-bold text-slate-900">
                                Periode {text(row, "period")}
                              </h4>
                            </div>
                            <div className="text-right">
                              <span className="text-base font-extrabold text-slate-900 tabular-nums">
                                {formatRupiah(Number(row.amount))}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center justify-between text-xs text-slate-500">
                            <span>
                              Jatuh tempo:{" "}
                              {formatDateIndo(text(row, "due_date"))}
                            </span>
                            <span className="font-semibold text-slate-700">
                              Sisa:{" "}
                              {formatRupiah(
                                Number(row.amount) - Number(row.paid_amount),
                              )}
                            </span>
                          </div>
                        </div>
                      ) : section === "schedules" ? (
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="px-2.5 py-1 rounded-lg bg-indigo-50 border border-indigo-100 text-xs font-bold text-indigo-700">
                              {DAY_NAMES[Number(row.day_of_week)]}
                            </span>
                            <span className="max-w-full break-words text-xs font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                              {scheduleSubjectsLabel(row)}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-slate-500">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5 text-slate-400" />
                              {text(row, "start_time")} – {text(row, "end_time")}
                            </span>
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3.5 h-3.5 text-slate-400" />
                              {text(row, "location")}
                            </span>
                          </div>
                        </div>
                      ) : (
                        /* Attendance */
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span
                              className={`text-xs font-bold px-2.5 py-0.5 rounded-md border ${
                                getAttendanceStyle(String(row.status)).bg
                              } ${getAttendanceStyle(String(row.status)).text} ${
                                getAttendanceStyle(String(row.status)).border
                              }`}
                            >
                              {getAttendanceLabel(String(row.status))}
                            </span>
                            <span className="text-xs text-slate-500 font-medium">
                              {formatDateIndo(text(row, "date"))}
                            </span>
                          </div>
                          <div className="text-xs text-slate-500">
                            <span className="font-mono">
                              {text(row, "start_time")} – {text(row, "end_time")}
                            </span>
                            {Boolean(row.notes) && (
                              <p className="mt-1 text-slate-600">
                                {text(row, "notes")}
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              )}

              <Pager page={page} total={data.total} onPage={setPage} />

              {/* Comment Box for Parent */}
              {section === "comments" && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!message.trim()) return;
                    void mutation.run(async () => {
                      draft.flush();
                      await edge({
                        action: "parent",
                        token,
                        operation: "comment",
                        section: "comments",
                        id: draft.operationId,
                        message,
                        reportId: data.report_id,
                      });
                      draft.clear();
                      query.refresh();
                    });
                  }}
                  className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-xs space-y-3"
                >
                  <label className="block text-xs font-bold text-slate-900">
                    Tulis Komentar atau Tanggapan untuk Guru:
                  </label>
                  <textarea
                    required
                    maxLength={2000}
                    rows={3}
                    placeholder="Contoh: Terima kasih Bu/Pak, di rumah ananda sudah mulai bisa membaca kata-kata sulit…"
                    value={message}
                    disabled={mutation.pending}
                    onChange={(e) => draft.set({ message: e.target.value })}
                    className="w-full rounded-2xl border border-slate-200 p-3 text-xs text-slate-900 bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500 transition-colors shadow-2xs resize-none"
                  />
                  <DraftNotice draft={draft} />
                  <div className="flex items-center justify-between">
                    <span className="text-2xs text-slate-400">
                      Pesan akan langsung terbaca oleh guru pengajar.
                    </span>
                    <button
                      type="submit"
                      disabled={mutation.pending || !message.trim()}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      {mutation.pending && (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      )}
                      Kirim Tanggapan
                    </button>
                  </div>
                  <ErrorNotice message={mutation.error} />
                </form>
              )}
            </>
          )}
        </QueryState>

        {/* Footer info */}
        <footer className="text-center py-6 text-2xs text-slate-400 space-y-1">
          <p>
            Les Report · Aplikasi Raport Digital Les Privat
          </p>
          <p>
            Laporan ini bersifat privat dan hanya dapat diakses melalui tautan resmi yang dibagikan guru.
          </p>
        </footer>
      </div>
    </main>
  );
}
