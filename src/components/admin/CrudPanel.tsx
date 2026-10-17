import { scheduleSubjectsLabel } from "../../utils/schedules";
import { useState } from "react";
import type { Row, Entity, PaymentStatus } from "../../types";
import { db } from "../../services/db";
import { useDraft } from "../../services/useDraft";
import { useMutation, useQuery } from "../../services/hooks";
import {
  fields,
  childFields,
  parentFields,
  paymentFields,
} from "../../data/forms";
import { Pager, QueryState, RecordForm, text } from "../common/DataUI";
import {
  formatDateIndo,
  formatRupiah,
  paymentStatus,
  getPaymentStatusLabel,
  getPaymentStatusStyle,
  getAttendanceLabel,
  getAttendanceStyle,
  DAY_NAMES,
} from "../../data/presets";
import { ScoreBadge } from "../common/ScoreBadge";
import { TemplatePicker } from "./TemplatePicker";
import { cleanWhatsappNumber } from "../../utils/whatsapp";
import { ErrorNotice } from "../common/DataUI";
import {
  Plus,
  Search,
  RefreshCw,
  Edit2,
  Trash2,
  CheckCircle2,
  Clock,
  MapPin,
  CreditCard,
  History,
  Phone,
  MessageCircle,
  FileText,
  ArrowRight,
  AlertTriangle,
  Send,
  X,
} from "lucide-react";

export function outstanding(row: Row) {
  if (row.paid_amount != null)
    return Number(row.amount) - Number(row.paid_amount);
  const transactions = (row.transactions || []) as { amount: number }[];
  return (
    Number(row.amount) -
    transactions.reduce((sum, item) => sum + Number(item.amount), 0)
  );
}

export function RowDetails({ row, table }: { row: Row; table: Entity }) {
  if (table === "lesson_reports") {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
          <div className="space-y-0.5">
            <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-md">
              {text(row, "subject.name") || "Pelajaran"}
            </span>
            <h4 className="text-base font-bold text-slate-900 mt-1">
              {text(row, "topic")}
            </h4>
            <p className="text-xs text-slate-500">
              {formatDateIndo(text(row, "date"))}
              {row.duration_minutes
                ? ` · ${row.duration_minutes} menit`
                : ""}
            </p>
          </div>
          <div>
            <ScoreBadge score={Number(row.score)} size="md" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-2.5">
            <span className="font-bold text-slate-700 block mb-1">
              📘 Materi yang dipelajari:
            </span>
            <p className="text-slate-600 whitespace-pre-wrap leading-relaxed">
              {text(row, "what_learned")}
            </p>
          </div>
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-2.5">
            <span className="font-bold text-slate-700 block mb-1">
              🎯 Hasil & Capaian:
            </span>
            <p className="text-slate-600 whitespace-pre-wrap leading-relaxed">
              {text(row, "learning_outcome")}
            </p>
          </div>
        </div>

        {Boolean(row.teacher_notes || row.next_step || row.home_practice) && (
          <div className="bg-amber-50/60 border border-amber-100 rounded-xl p-2.5 text-xs space-y-1.5">
            {Boolean(row.teacher_notes) && (
              <p className="text-slate-700">
                <strong className="text-amber-800">💡 Catatan Guru: </strong>
                {text(row, "teacher_notes")}
              </p>
            )}
            {Boolean(row.next_step) && (
              <p className="text-slate-700">
                <strong className="text-amber-800">🚀 Rencana Lanjut: </strong>
                {text(row, "next_step")}
              </p>
            )}
            {Boolean(row.home_practice) && (
              <p className="text-slate-700">
                <strong className="text-amber-800">🏠 Latihan Rumah: </strong>
                {text(row, "home_practice")}
              </p>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 pt-1 text-2xs text-slate-400">
          {row.shared_at ? (
            <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md font-medium">
              <CheckCircle2 className="w-3 h-3" />
              Sudah dibagikan ({formatDateIndo(text(row, "shared_at"))})
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
              Belum dicatat dibagikan
            </span>
          )}
        </div>
      </div>
    );
  }

  if (table === "invoices") {
    const balance = outstanding(row);
    const status: PaymentStatus = paymentStatus(
      Number(row.amount),
      Number(row.amount) - balance,
      text(row, "due_date"),
    );
    const style = getPaymentStatusStyle(status);
    const label = getPaymentStatusLabel(status);

    return (
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-slate-700">
                {text(row, "invoice_number")}
              </span>
              <span
                className={`text-2xs font-bold px-2 py-0.5 rounded-md border ${style.bg} ${style.text} ${style.border}`}
              >
                {label}
              </span>
            </div>
            <h4 className="text-sm font-bold text-slate-900 mt-0.5">
              {text(row, "child.full_name") || "Murid"}
            </h4>
          </div>
          <div className="text-right">
            <span className="text-base font-extrabold text-slate-900 tabular-nums">
              {formatRupiah(Number(row.amount))}
            </span>
            {balance > 0 && (
              <p className="text-xs text-rose-600 font-semibold tabular-nums">
                Sisa: {formatRupiah(balance)}
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs text-slate-600">
          <div>
            <span className="text-slate-400 block text-2xs">Periode</span>
            <span className="font-medium">{text(row, "period")}</span>
          </div>
          <div>
            <span className="text-slate-400 block text-2xs">Paket</span>
            <span className="font-medium capitalize">
              {text(row, "package_type").replace("_", " ")}
            </span>
          </div>
          <div>
            <span className="text-slate-400 block text-2xs">Jatuh Tempo</span>
            <span className="font-medium">
              {formatDateIndo(text(row, "due_date"))}
            </span>
          </div>
        </div>

        {((row.transactions || []) as Row[]).length > 0 && (
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-2 text-xs space-y-1">
            <span className="text-2xs font-semibold text-slate-500 uppercase tracking-wider block">
              Pembayaran tercatat:
            </span>
            {((row.transactions || []) as Row[]).map((item, index) => (
              <div
                key={index}
                className="flex items-center justify-between text-2xs text-slate-700 font-mono"
              >
                <span>
                  {formatDateIndo(text(item, "date"))} · {text(item, "method")}
                </span>
                <span className="font-bold text-emerald-700">
                  {formatRupiah(Number(item.amount))}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (table === "schedules") {
    const day = DAY_NAMES[Number(row.day_of_week)] || "Hari";
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-lg bg-indigo-50 border border-indigo-100 text-xs font-bold text-indigo-700">
              {day}
            </span>
            <h4 className="text-sm font-bold text-slate-900">
              {text(row, "child.nickname") || text(row, "child.full_name")}
            </h4>
          </div>
          <span className="max-w-full break-words text-xs font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
            {scheduleSubjectsLabel(row)}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
          <span className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            {text(row, "start_time")} – {text(row, "end_time")}
          </span>
          <span className="flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5 text-slate-400" />
            {text(row, "location")}
          </span>
        </div>

        {Boolean(row.notes) && (
          <p className="text-xs text-slate-600 bg-slate-50 p-2 rounded-lg">
            {text(row, "notes")}
          </p>
        )}
      </div>
    );
  }

  if (table === "attendance") {
    const status = String(row.status || "hadir");
    const style = getAttendanceStyle(status);
    const label = getAttendanceLabel(status);

    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className={`text-xs font-bold px-2.5 py-0.5 rounded-md border ${style.bg} ${style.text} ${style.border}`}
            >
              {label}
            </span>
            <h4 className="text-sm font-bold text-slate-900">
              {text(row, "child.full_name") || "Murid"}
            </h4>
          </div>
          <span className="text-xs text-slate-500 font-medium">
            {formatDateIndo(text(row, "date"))}
          </span>
        </div>

        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            {text(row, "start_time")} – {text(row, "end_time")}
          </span>
          {Boolean(row.notes) && (
            <span className="text-slate-600 italic">· {text(row, "notes")}</span>
          )}
        </div>
      </div>
    );
  }

  if (table === "parents") {
    const phone = text(row, "whatsapp_number");
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-bold text-slate-900">
            {text(row, "full_name")}
          </h4>
          {Boolean(phone) && (
            <a
              href={`https://wa.me/${phone}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg hover:bg-emerald-100 transition-colors cursor-pointer"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              Chat WA
            </a>
          )}
        </div>
        <div className="text-xs text-slate-500 space-y-0.5">
          <p>
            <Phone className="w-3.5 h-3.5 inline mr-1 text-slate-400" />
            {phone}
          </p>
          {Boolean(row.email) && <p>✉️ {text(row, "email")}</p>}
          {Boolean(row.address) && <p>📍 {text(row, "address")}</p>}
        </div>
      </div>
    );
  }

  // Fallback for generic entities (subjects, templates, etc.)
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-bold text-slate-900">
          {text(row, "name") ||
            text(row, "full_name") ||
            text(row, "topic") ||
            "Data"}
        </h4>
        {row.is_active !== undefined && (
          <span
            className={`text-2xs font-semibold px-2 py-0.5 rounded-full ${
              row.is_active
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : "bg-slate-100 text-slate-500"
            }`}
          >
            {row.is_active ? "Aktif" : "Non-aktif"}
          </span>
        )}
      </div>

      {table === "report_templates" && (
        <div className="space-y-1 text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
          <p>
            <strong className="text-slate-700">Topik: </strong>
            {text(row, "topic")}
          </p>
          <p className="line-clamp-2">
            <strong className="text-slate-700">Materi: </strong>
            {text(row, "what_learned")}
          </p>
        </div>
      )}

      {fields[table]
        ?.filter(
          (field) =>
            field.name !== "child_id" &&
            field.name !== "subject_id" &&
            field.name !== "parent_id" &&
            field.name !== "schedule_id" &&
            field.name !== "name" &&
            field.name !== "is_active" &&
            field.name !== "topic" &&
            field.name !== "what_learned",
        )
        .map((field) => (
          <p key={field.name} className="text-xs text-slate-600">
            <span className="text-slate-400">{field.label}: </span>
            {field.type === "checkbox"
              ? row[field.name]
                ? "Ya"
                : "Tidak"
              : text(row, field.name)}
          </p>
        ))}
    </div>
  );
}

export function CrudPanel({
  table,
  title,
  childId,
  onChild,
  onChanged,
}: {
  table: Entity;
  title: string;
  childId?: string;
  onChild?: (row: Row) => void;
  onChanged?: () => void;
}) {
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Row | null | undefined>();
  const [paying, setPaying] = useState<Row | null>(null);
  const parentDraft = useDraft({ form: "children-options", schema: "new-parent-v1", defaults: { newParent: false }, enabled: table === "children" });
  const newParent = !!parentDraft.values.newParent;
  const [paymentKey, setPaymentKey] = useState("");
  const parentId = parentDraft.operationId;
  const [deleting, setDeleting] = useState<Row | null>(null);
  const [history, setHistory] = useState<Row | null>(null);
  const mutation = useMutation();

  const query = useQuery(`${table}:${childId}:${page}:${search}`, () =>
    db.list(table, {
      page,
      childId,
      search: table === "children" || table === "parents" ? search : undefined,
      searchColumn: table === "parents" ? "full_name" : "full_name",
    }),
  );

  const refresh = () => {
    query.refresh();
    onChanged?.();
  };

  const base = fields[table] || [];
  const formFields = base
    .filter((field) => !childId || field.name !== "child_id")
    .map((field) => ({
      ...field,
      childId: field.reference === "schedules" ? childId : undefined,
    }));

  return (
    <section className="space-y-4">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs">
        <div>
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          <p className="text-xs text-slate-500">
            Kelola data dan catatan {title.toLowerCase()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={query.refresh}
            className="p-2 text-slate-500 hover:text-slate-800 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors cursor-pointer"
            title="Muat ulang"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(null);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Tambah {title}
          </button>
        </div>
      </div>

      {/* Search bar for children / parents */}
      {(table === "children" || table === "parents") && (
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            aria-label={`Cari ${title.toLowerCase()}`}
            placeholder={`Cari nama ${title.toLowerCase()}…`}
            value={search}
            onChange={(e) => {
              setPage(0);
              setSearch(e.target.value);
            }}
            className="w-full rounded-xl border border-slate-200 pl-10 pr-3.5 py-2.5 text-xs sm:text-sm text-slate-900 bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500 transition-colors shadow-2xs"
          />
        </div>
      )}

      {/* Cards list */}
      <QueryState query={query}>
        {query.data?.items.length === 0 ? (
          <div className="bg-white border border-slate-200/80 rounded-2xl p-8 text-center space-y-2">
            <FileText className="w-10 h-10 text-slate-300 mx-auto" />
            <p className="text-sm font-semibold text-slate-700">
              Belum ada data {title.toLowerCase()}
            </p>
            <p className="text-xs text-slate-400">
              Klik tombol &quot;Tambah {title}&quot; di atas untuk menambahkan data baru.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {query.data?.items.map((row) => (
              <article
                key={row.id}
                className="bg-white border border-slate-200/80 rounded-2xl p-4 sm:p-5 shadow-xs space-y-3 hover:border-indigo-100 transition-colors"
              >
                <RowDetails table={table} row={row} />

                {/* Actions row */}
                <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-100">
                  {onChild && (
                    <button
                      type="button"
                      onClick={() => onChild(row)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors cursor-pointer"
                    >
                      Buka Raport
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {table === "lesson_reports" && !row.shared_at && (
                    <button
                      type="button"
                      disabled={mutation.pending}
                      onClick={() =>
                        void mutation.run(async () => {
                          await db.share(row);
                          refresh();
                        })
                      }
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors cursor-pointer"
                    >
                      <Send className="w-3 h-3" />
                      Tandai Dibagikan
                    </button>
                  )}

                  {table === "invoices" && outstanding(row) > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setPaymentKey(crypto.randomUUID());
                        setPaying(row);
                      }}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors cursor-pointer"
                    >
                      <CreditCard className="w-3 h-3" />
                      Catat Bayar
                    </button>
                  )}

                  {table === "invoices" && (
                    <button
                      type="button"
                      onClick={() => setHistory(row)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors cursor-pointer"
                    >
                      <History className="w-3 h-3" />
                      Riwayat
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setEditing(row)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-indigo-600 bg-white hover:bg-indigo-50 border border-slate-200 rounded-lg transition-colors cursor-pointer"
                    title="Edit"
                  >
                    <Edit2 className="w-3 h-3" />
                    Edit
                  </button>

                  <button
                    type="button"
                    onClick={() => setDeleting(row)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:text-rose-600 bg-white hover:bg-rose-50 border border-slate-200 rounded-lg transition-colors cursor-pointer"
                    title="Hapus"
                  >
                    <Trash2 className="w-3 h-3" />
                    Hapus
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </QueryState>

      <Pager page={page} total={query.data?.total || 0} onPage={setPage} />

      {/* Edit / Create Form Modal */}
      {editing !== undefined && (
        <RecordForm
          key={`${editing?.id || "new"}:${newParent}`}
          title={`${editing ? "Edit" : "Tambah"} ${title}`}
          draft={{ form: table === "children" && !editing && newParent ? "children-with-parent" : table, scope: editing ? undefined : childId, loadLatest: editing ? () => db.get(table, editing.id) : undefined }}
          initial={editing || undefined}
          tools={
            editing === null && table === "children"
              ? () => (
                  <label className="flex items-center gap-2 p-3 rounded-xl bg-indigo-50/70 border border-indigo-100 text-xs font-semibold text-indigo-900 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newParent}
                      onChange={(e) => parentDraft.set({ newParent: e.target.checked })}
                      className="w-4 h-4 rounded text-indigo-600"
                    />
                    Buat data wali baru bersamaan dengan murid ini
                  </label>
                )
              : table === "lesson_reports"
                ? (apply) => <TemplatePicker apply={apply} />
                : undefined
          }
          fields={
            table === "children" && editing === null && newParent
              ? [
                  ...childFields.filter((field) => field.name !== "parent_id"),
                  ...parentFields.map((field) => ({
                    ...field,
                    name: `parent_${field.name}`,
                    label: `Wali: ${field.label}`,
                  })),
                ]
              : formFields
          }
          onClose={() => setEditing(undefined)}
          onSave={async (values, id, meta) => {
            let payload: Record<string, unknown> = {
              ...values,
              id,
              ...(childId ? { child_id: childId } : {}),
            };
            if (table === "invoices" && values.package_type !== "paket_sesi")
              payload = { ...payload, session_count: null };
            if (table === "children" && editing === null && newParent) {
              const parent = Object.fromEntries(
                Object.entries(values)
                  .filter(([key]) => key.startsWith("parent_"))
                  .map(([key, value]) => [key.slice(7), value]),
              );
              const child = Object.fromEntries(
                Object.entries(payload).filter(
                  ([key]) => !key.startsWith("parent_"),
                ),
              );
              await db.createChild(
                { ...child, parent_id: parentId },
                {
                  ...parent,
                  whatsapp_number: cleanWhatsappNumber(
                    String(parent.whatsapp_number),
                  ),
                  id: parentId,
                },
              );
            } else {
              if (table === "parents")
                payload.whatsapp_number = cleanWhatsappNumber(
                  String(payload.whatsapp_number),
                );
              await db.save(table, payload, meta.version ?? null);
            }
            if (table === "children" && !editing && !parentDraft.clear()) throw new Error("Data tersimpan, tetapi draft opsi wali belum dapat dibersihkan.");
            refresh();
          }}
        />
      )}

      {/* Payment recording modal */}
      {paying && (
        <RecordForm
          key={paymentKey}
          title={`Catat Pembayaran: ${text(paying, "invoice_number")}`}
          draft={{ form: "payments", scope: paying.id }}
          fields={paymentFields}
          onClose={() => setPaying(null)}
          onSave={async (values, operationId) => {
            await db.payment(paying, values, operationId);
            refresh();
          }}
        />
      )}

      <ErrorNotice message={mutation.error} />

      {/* History modal */}
      {history && (
        <TransactionHistory row={history} onClose={() => setHistory(null)} />
      )}

      {/* Delete confirmation modal */}
      {deleting && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in"
        >
          <div className="bg-white p-6 rounded-2xl max-w-sm w-full space-y-4 shadow-xl border border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Konfirmasi Hapus
                </h3>
                <p className="text-xs text-slate-500">
                  Tindakan ini tidak dapat dibatalkan.
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Apakah Anda yakin ingin menghapus data ini? Catatan yang masih
              terhubung dengan data lain harus dilepas atau dinonaktifkan
              terlebih dahulu.
            </p>

            <ErrorNotice message={mutation.error} />

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={mutation.pending}
                onClick={() => setDeleting(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={mutation.pending}
                onClick={() =>
                  void mutation.run(async () => {
                    await db.remove(table, deleting);
                    setDeleting(null);
                    refresh();
                  })
                }
                className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                {mutation.pending ? "Menghapus…" : "Ya, Hapus"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function TransactionHistory({
  row,
  onClose,
}: {
  row: Row;
  onClose: () => void;
}) {
  const [page, setPage] = useState(0);
  const query = useQuery(`transactions:${row.id}:${page}`, () =>
    db.transactions(row.id, page),
  );

  return (
    <div
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 p-4 flex justify-center items-center overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Riwayat Pembayaran"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section className="bg-white rounded-3xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto space-y-4 shadow-2xl border border-slate-100">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-indigo-600" />
            <h3 className="text-base font-bold text-slate-900">
              Riwayat Pembayaran {text(row, "invoice_number")}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <QueryState query={query}>
          {query.data?.items.length === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center">
              Belum ada riwayat transaksi pembayaran.
            </p>
          ) : (
            <div className="space-y-2">
              {query.data?.items.map((item) => (
                <div
                  key={item.id}
                  className="bg-slate-50 border border-slate-100 rounded-xl p-3 flex items-center justify-between text-xs"
                >
                  <div className="space-y-0.5">
                    <span className="font-semibold text-slate-800">
                      {formatDateIndo(text(item, "date"))}
                    </span>
                    <p className="text-2xs text-slate-500">
                      Metode: {text(item, "method")}
                      {item.notes ? ` · ${text(item, "notes")}` : ""}
                    </p>
                  </div>
                  <strong className="text-sm font-extrabold text-emerald-700 tabular-nums">
                    {formatRupiah(Number(item.amount))}
                  </strong>
                </div>
              ))}
            </div>
          )}
        </QueryState>

        <Pager page={page} total={query.data?.total || 0} onPage={setPage} />

        <div className="pt-2 text-right">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </section>
    </div>
  );
}
