import { useState } from "react";
import type { Row, Entity } from "../../types";
import { db, edge } from "../../services/db";
import { useMutation, useQuery } from "../../services/hooks";
import { CrudPanel } from "./CrudPanel";
import { Avatar, MediaManager } from "./MediaManager";
import {
  ErrorNotice,
  Pager,
  QueryState,
  RecordForm,
  text,
} from "../common/DataUI";
import { fields } from "../../data/forms";
import { formatDateIndo } from "../../data/presets";
import { ProgressChart } from "../common/ProgressChart";
import { cleanWhatsappNumber, createWhatsappUrl } from "../../utils/whatsapp";
import {
  ArrowLeft,
  Calendar,
  Camera,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  Edit2,
  ExternalLink,
  FileText,
  KeyRound,
  LineChart,
  MessageCircle,
  MessageSquare,
  Send,
  Share2,
  Users,
} from "lucide-react";

function Comments({ childId }: { childId: string }) {
  const [page, setPage] = useState(0);
  const [message, setMessage] = useState("");
  const [id, setId] = useState(() => crypto.randomUUID());
  const mutation = useMutation();
  const query = useQuery(`comments:${childId}:${page}`, () =>
    db.list("comments", { childId, page }),
  );

  return (
    <section className="bg-white border border-slate-200/80 rounded-2xl p-4 sm:p-6 shadow-xs space-y-4">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-indigo-600" />
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Komentar & Komunikasi Orang Tua
            </h3>
            <p className="text-xs text-slate-500">
              Pesan dan diskusi perkembangan anak dengan wali
            </p>
          </div>
        </div>
        <button
          type="button"
          disabled={mutation.pending}
          onClick={() =>
            void mutation.run(async () => {
              await db.readComments(childId);
              query.refresh();
            })
          }
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors cursor-pointer"
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          Tandai Dibaca
        </button>
      </div>

      <QueryState query={query}>
        {query.data?.items.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400">
            Belum ada komentar dari orang tua atau guru.
          </div>
        ) : (
          <div className="space-y-3 max-h-[420px] overflow-y-auto p-1">
            {query.data?.items.map((row) => {
              const isTeacher = Boolean(row.sender_user_id);
              return (
                <div
                  key={row.id}
                  className={`flex flex-col ${
                    isTeacher ? "items-end" : "items-start"
                  }`}
                >
                  <div
                    className={`max-w-[85%] sm:max-w-[75%] rounded-2xl p-3.5 text-xs space-y-1 ${
                      isTeacher
                        ? "bg-indigo-600 text-white rounded-br-xs shadow-xs"
                        : "bg-slate-100 text-slate-800 rounded-bl-xs border border-slate-200"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3 text-2xs opacity-85">
                      <strong className="font-semibold">
                        {isTeacher ? "Guru (Anda)" : "Orang Tua / Wali"}
                      </strong>
                      <span>{formatDateIndo(text(row, "created_at"))}</span>
                    </div>
                    <p className="whitespace-pre-wrap leading-relaxed text-xs">
                      {text(row, "message")}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </QueryState>

      <Pager page={page} total={query.data?.total || 0} onPage={setPage} />

      {/* Reply input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!message.trim()) return;
          void mutation.run(async () => {
            await db.comment(childId, message, id);
            setMessage("");
            setId(crypto.randomUUID());
            query.refresh();
          });
        }}
        className="space-y-2 pt-2 border-t border-slate-100"
      >
        <label className="block text-xs font-semibold text-slate-700">
          Kirim Balasan / Catatan untuk Orang Tua:
        </label>
        <div className="flex gap-2">
          <textarea
            required
            value={message}
            maxLength={2000}
            rows={2}
            placeholder="Tulis pesan atau tanggapan untuk orang tua…"
            onChange={(e) => setMessage(e.target.value)}
            disabled={mutation.pending}
            className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-900 bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500 transition-colors shadow-2xs resize-none"
          />
          <button
            type="submit"
            disabled={mutation.pending || !message.trim()}
            className="self-end px-4 py-2.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
            Kirim
          </button>
        </div>
      </form>
      <ErrorNotice message={mutation.error} />
    </section>
  );
}

function Links({ child }: { child: Row }) {
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [issued, setIssued] = useState<{
    token: string;
    expires_at: string;
  } | null>(null);
  const mutation = useMutation();
  const query = useQuery(`link:${child.id}`, () => db.linkInfo(child.id));

  const link = issued
    ? `${window.location.origin}/#/report/${issued.token}`
    : "";

  const parentPhone = text(child, "parent.whatsapp_number");
  const childNickname = text(child, "nickname") || text(child, "full_name");
  const parentName = text(child, "parent.full_name") || "Orang Tua";

  const waMessage = `Halo ${parentName}, berikut kami sampaikan raport digital dan perkembangan belajar ananda ${childNickname}: ${link}\n\nTerima kasih atas kerja samanya.`;

  return (
    <section className="bg-gradient-to-br from-indigo-50/90 via-white to-purple-50/50 border border-indigo-100 rounded-2xl p-4 sm:p-5 shadow-xs space-y-3.5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-indigo-100/80 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center shadow-xs">
            <Share2 className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Akses Raport Digital Orang Tua
            </h3>
            <p className="text-2xs text-slate-500">
              Tautan privat instan via WhatsApp (orang tua tidak perlu login)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs transition-colors cursor-pointer"
          >
            <KeyRound className="w-3.5 h-3.5" />
            {query.data ? "Buat / Ganti Tautan" : "Terbitkan Tautan"}
          </button>
          {query.data && !query.data.revoked_at && (
            <button
              type="button"
              disabled={mutation.pending}
              onClick={() =>
                void mutation.run(async () => {
                  await db.revokeLink(child.id);
                  setIssued(null);
                  query.refresh();
                })
              }
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors cursor-pointer"
            >
              Cabut Akses
            </button>
          )}
        </div>
      </div>

      <QueryState query={query}>
        {query.data && (
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 bg-white/80 border border-indigo-50 rounded-xl p-2.5">
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-indigo-500" />
              Berlaku hingga:{" "}
              <strong className="text-slate-800">
                {formatDateIndo(text(query.data, "expires_at"))}
              </strong>
            </span>
            <span className="flex items-center gap-1">
              <Users className="w-3.5 h-3.5 text-slate-400" />
              Diakses:{" "}
              <strong className="text-slate-800">
                {Number(query.data.access_count)} kali
              </strong>
            </span>
            {Boolean(query.data.revoked_at) && (
              <span className="text-xs font-bold text-rose-600 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-md">
                Tautan Dicabut
              </span>
            )}
          </div>
        )}
      </QueryState>

      {issued && (
        <div className="space-y-3 bg-white p-3.5 rounded-xl border border-indigo-100 shadow-2xs">
          <label className="block text-2xs font-bold text-indigo-900 uppercase tracking-wider">
            Tautan Baru Berhasil Diterbitkan:
          </label>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={link}
              aria-label="Tautan privat"
              className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-mono text-slate-800"
            />
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(link);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="inline-flex items-center gap-1 px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer shrink-0"
            >
              {copied ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              {copied ? "Tersalin!" : "Salin"}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <a
              target="_blank"
              rel="noreferrer"
              href={link}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Preview Raport Ortu
            </a>

            {parentPhone && (
              <a
                target="_blank"
                rel="noreferrer"
                href={createWhatsappUrl(parentPhone, waMessage)}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs transition-colors"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                Kirim via WhatsApp
              </a>
            )}
          </div>
        </div>
      )}

      <ErrorNotice message={mutation.error} />

      {creating && (
        <RecordForm
          title="Terbitkan Tautan Privat Raport"
          fields={[
            {
              name: "days",
              label: "Masa berlaku (hari)",
              type: "number",
              min: 1,
              max: 90,
              required: true,
            },
            {
              name: "report_id",
              label: "Batasi ke satu laporan tertentu (opsional)",
              type: "reference",
              reference: "lesson_reports",
              childId: child.id,
            },
          ]}
          initial={{ days: 30 } as unknown as Row}
          onClose={() => setCreating(false)}
          onSave={async (values) => {
            const result = await edge<{ token: string; expires_at: string }>(
              {
                action: "issue-link",
                childId: child.id,
                reportId: values.report_id || null,
                days: values.days,
              },
              true,
            );
            setIssued(result);
            query.refresh();
          }}
        />
      )}
    </section>
  );
}

function ReportMedia({ childId }: { childId: string }) {
  const [selecting, setSelecting] = useState(false);
  const [reportId, setReportId] = useState("");
  const query = useQuery(`report-media:${reportId}`, () =>
    reportId ? db.get("lesson_reports", reportId) : Promise.resolve(null),
  );
  const report = query.data;

  return (
    <section className="bg-white border border-slate-200/80 rounded-2xl p-4 sm:p-6 shadow-xs space-y-4">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <Camera className="w-5 h-5 text-indigo-600" />
          <h3 className="text-base font-bold text-slate-900">
            Dokumentasi & Foto Belajar
          </h3>
        </div>
        <button
          type="button"
          onClick={() => setSelecting(true)}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors cursor-pointer"
        >
          <Camera className="w-3.5 h-3.5" />
          {report ? "Ganti Laporan" : "Pilih Laporan untuk Unggah Foto"}
        </button>
      </div>

      <ErrorNotice message={query.error} />

      {report ? (
        <div className="space-y-4">
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
            <span className="text-2xs font-semibold text-slate-400 uppercase tracking-wider block">
              Laporan Terpilih:
            </span>
            <p className="text-xs font-bold text-slate-800">
              {formatDateIndo(text(report, "date"))} · {text(report, "topic")}
            </p>
          </div>
          <MediaManager
            target={report}
            kind="photo"
            onChanged={query.refresh}
          />
        </div>
      ) : (
        <div className="py-8 text-center text-xs text-slate-400">
          Pilih salah satu laporan belajar di atas untuk mengunggah atau melihat foto dokumentasi.
        </div>
      )}

      {selecting && (
        <RecordForm
          title="Pilih Laporan Belajar"
          fields={[
            {
              name: "report_id",
              label: "Laporan Belajar",
              type: "reference",
              reference: "lesson_reports",
              childId,
              required: true,
            },
          ]}
          onClose={() => setSelecting(false)}
          onSave={async (values) => {
            const selected = await db.get(
              "lesson_reports",
              String(values.report_id),
            );
            setReportId(selected.id);
          }}
        />
      )}
    </section>
  );
}

function Progress({ childId, name }: { childId: string; name: string }) {
  const query = useQuery(`progress:${childId}`, () =>
    db.list("lesson_reports", { childId }),
  );

  return (
    <QueryState query={query}>
      <ProgressChart
        childName={name}
        reports={(query.data?.items || []).slice(0, 8).map((row) => ({
          id: row.id,
          date: text(row, "date"),
          score: Number(row.score),
          topic: text(row, "topic"),
        }))}
      />
    </QueryState>
  );
}

export function ChildDetail({ id }: { id: string }) {
  const [tab, setTab] = useState("lesson_reports");
  const [editing, setEditing] = useState(false);
  const query = useQuery(`child:${id}`, () => db.get("children", id));
  const child = query.data;

  const tabs: Record<string, { label: string; icon: typeof FileText }> = {
    lesson_reports: { label: "Laporan", icon: FileText },
    progress: { label: "Progress", icon: LineChart },
    schedules: { label: "Jadwal", icon: Calendar },
    attendance: { label: "Absensi", icon: CheckCircle2 },
    invoices: { label: "Pembayaran", icon: CreditCard },
    photos: { label: "Foto", icon: Camera },
    comments: { label: "Komentar", icon: MessageSquare },
  };

  const parentPhone = text(child, "parent.whatsapp_number");

  return (
    <QueryState query={query}>
      {child && (
        <div className="space-y-4">
          {/* Back button */}
          <div>
            <a
              href="#/children"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-indigo-600 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Kembali ke Daftar Murid
            </a>
          </div>

          {/* Child Hero Card */}
          <section className="bg-white border border-slate-200/80 rounded-2xl sm:rounded-3xl p-5 sm:p-6 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <Avatar
                  id={child.avatar_id ? String(child.avatar_id) : undefined}
                  name={text(child, "full_name")}
                />
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
                      {text(child, "full_name")}
                    </h1>
                    {Boolean(child.nickname) && (
                      <span className="text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-md">
                        {text(child, "nickname")}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="font-semibold text-slate-700">
                      Kelas: {text(child, "grade_level")}
                    </span>
                    <span>·</span>
                    <span>Mulai: {formatDateIndo(text(child, "start_date"))}</span>
                    <span>·</span>
                    <span
                      className={`font-semibold ${
                        child.is_active ? "text-emerald-600" : "text-slate-400"
                      }`}
                    >
                      {child.is_active ? "Aktif" : "Non-aktif"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors cursor-pointer"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  Edit Murid
                </button>
              </div>
            </div>

            {/* Guardian & notes strip */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-slate-100 text-xs">
              <div className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-100">
                <div className="space-y-0.5">
                  <span className="text-2xs text-slate-400 block font-semibold uppercase">
                    Wali Murid ({text(child, "relationship") || "Orang Tua"}):
                  </span>
                  <span className="font-bold text-slate-800">
                    {text(child, "parent.full_name") || "Belum ada"}
                  </span>
                </div>
                {parentPhone && (
                  <a
                    href={`https://wa.me/${cleanWhatsappNumber(parentPhone)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-white border border-emerald-200 px-2.5 py-1 rounded-lg hover:bg-emerald-50 transition-colors"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    WA
                  </a>
                )}
              </div>

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-0.5">
                <span className="text-2xs text-slate-400 block font-semibold uppercase">
                  Catatan Khusus:
                </span>
                <p className="text-slate-600 line-clamp-2">
                  {text(child, "notes") || "Tidak ada catatan khusus."}
                </p>
              </div>
            </div>

            {/* Avatar upload expander */}
            <MediaManager
              target={child}
              kind="avatar"
              onChanged={query.refresh}
            />
          </section>

          {/* Akses Orang Tua Section */}
          <Links child={child} />

          {/* Navigation Tabs */}
          <nav className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-slate-200/80 scrollbar-none">
            {Object.entries(tabs).map(([key, item]) => {
              const Icon = item.icon;
              const isActive = tab === key;
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => setTab(key)}
                  className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl transition-all whitespace-nowrap cursor-pointer ${
                    isActive
                      ? "bg-indigo-600 text-white shadow-xs"
                      : "bg-white text-slate-600 hover:text-indigo-600 hover:bg-indigo-50/50 border border-slate-200"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Active Tab Panel */}
          {["lesson_reports", "schedules", "attendance", "invoices"].includes(
            tab,
          ) && (
            <CrudPanel
              key={tab}
              table={tab as Entity}
              title={tabs[tab].label}
              childId={id}
            />
          )}

          {tab === "progress" && (
            <Progress childId={id} name={text(child, "nickname") || text(child, "full_name")} />
          )}

          {tab === "comments" && <Comments childId={id} />}

          {tab === "photos" && <ReportMedia childId={id} />}

          {/* Edit child modal */}
          {editing && (
            <RecordForm
              title="Edit Data Murid"
              fields={fields.children!}
              initial={child}
              onClose={() => setEditing(false)}
              onSave={async (values) => {
                await db.save(
                  "children",
                  { ...values, id: child.id },
                  child.version,
                );
                query.refresh();
              }}
            />
          )}
        </div>
      )}
    </QueryState>
  );
}
