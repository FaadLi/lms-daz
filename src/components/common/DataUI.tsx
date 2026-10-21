import { useEffect, useState, type ReactNode } from "react";
import type { Field, Row } from "../../types";
import { db, PAGE_SIZE } from "../../services/db";
import { useMutation, useQuery } from "../../services/hooks";
import { useDraft } from "../../services/useDraft";
import type { DraftValues } from "../../services/drafts";
import { DraftNotice } from "./DraftNotice";
import { ReportSubjectInput } from './ReportSubjectInput';
import { reportAverage, type SubjectScore, type ReportSubject } from '../../utils/reports';
import {
  scheduleSubjectsLabel,
  type ScheduleSubject,
} from "../../utils/schedules";
import {
  AlertCircle,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
  RefreshCw,
  Sparkles,
} from "lucide-react";

export function text(row: Row | undefined, key: string): string {
  const value = key
    .split(".")
    .reduce<unknown>(
      (value, part) =>
        value && typeof value === "object"
          ? (value as Record<string, unknown>)[part]
          : undefined,
      row,
    );
  return value == null ? "" : String(value);
}

export function ErrorNotice({ message }: { message?: string }) {
  return message ? (
    <div
      role="alert"
      className="rounded-xl bg-rose-50 border border-rose-200 p-3.5 text-sm text-rose-800 flex items-start gap-2.5 shadow-2xs"
    >
      <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
      <span className="leading-snug">{message}</span>
    </div>
  ) : null;
}

export function QueryState({
  query,
  children,
}: {
  query: { loading: boolean; error?: string; refresh: () => void };
  children: ReactNode;
}) {
  if (query.loading)
    return (
      <div
        role="status"
        className="py-12 flex flex-col items-center justify-center gap-3 text-slate-500"
      >
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
        <p className="text-sm font-medium">Memuat data…</p>
      </div>
    );
  if (query.error)
    return (
      <div className="py-8 space-y-4 max-w-md mx-auto text-center">
        <ErrorNotice message={query.error} />
        <button
          type="button"
          onClick={query.refresh}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer"
        >
          <RefreshCw className="w-4 h-4" />
          Coba lagi
        </button>
      </div>
    );
  return <>{children}</>;
}

export function Pager({
  page,
  total,
  onPage,
}: {
  page: number;
  total: number;
  onPage: (value: number) => void;
}) {
  const totalPages = Math.ceil(total / PAGE_SIZE) || 1;
  if (total <= PAGE_SIZE) return null;

  return (
    <div className="flex items-center justify-between gap-3 my-4 py-2 border-t border-slate-100 text-sm">
      <button
        type="button"
        disabled={!page}
        onClick={() => onPage(page - 1)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs transition-colors cursor-pointer"
      >
        <ChevronLeft className="w-4 h-4" />
        Sebelumnya
      </button>
      <span className="text-xs sm:text-sm text-slate-500 font-medium">
        Halaman <strong className="text-slate-800">{page + 1}</strong> dari{" "}
        <strong className="text-slate-800">{totalPages}</strong> ({total} data)
      </span>
      <button
        type="button"
        disabled={(page + 1) * PAGE_SIZE >= total}
        onClick={() => onPage(page + 1)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs transition-colors cursor-pointer"
      >
        Berikutnya
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}

function ReferenceInput({
  field,
  value,
  onChange,
}: {
  field: Field;
  value: string;
  onChange: (value: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  useEffect(() => {
    const timeout = setTimeout(() => setTerm(search), 250);
    return () => clearTimeout(timeout);
  }, [search]);
  const query = useQuery(`${field.reference}:${field.childId}:${term}`, () =>
    db.list(field.reference!, {
      search: term,
      searchColumn:
        field.searchColumn ||
        (["subjects", "report_templates"].includes(field.reference!)
          ? "name"
          : "full_name"),
      childId: field.childId,
    }),
  );
  const selected = useQuery(`${field.reference}:${value}`, () =>
    value ? db.get(field.reference!, value) : Promise.resolve(null),
  );

  return (
    <div className="space-y-1.5 mt-1">
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          aria-label={`Cari ${field.label}`}
          placeholder={`Ketik untuk menyaring ${field.label.toLowerCase()}…`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl border border-slate-200 pl-9 pr-3 py-2 text-xs text-slate-900 bg-slate-50/50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors shadow-2xs"
        />
      </div>
      <ErrorNotice message={query.error || selected.error} />
      <select
        required={field.required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={query.loading}
        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors shadow-2xs disabled:bg-slate-100"
      >
        <option value="">Pilih {field.label}</option>
        {value && !query.data?.items.some((row) => row.id === value) && (
          <option value={value}>
            {text(selected.data || undefined, "name") ||
              text(selected.data || undefined, "full_name") ||
              text(selected.data || undefined, "topic") ||
              "Pilihan tersimpan"}
          </option>
        )}
        {query.data?.items.map((row) => (
          <option key={row.id} value={row.id}>
            {text(row, "name") ||
              text(row, "full_name") ||
              (field.reference === "schedules"
                ? `${text(row, "start_time")} · ${scheduleSubjectsLabel(row)}`
                : `${text(row, "date")} ${text(row, "topic") || text(row, "start_time")}`)}
          </option>
        ))}
      </select>
      <small className="block text-2xs text-slate-400">
        Pilih salah satu referensi yang tersedia.
      </small>
    </div>
  );
}

function SubjectMultiInput({
  field,
  value,
  selectedSubjects,
  onChange,
}: {
  field: Field;
  value: string[];
  selectedSubjects: ScheduleSubject[];
  onChange: (value: string[]) => void;
}) {
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [page, setPage] = useState(0);
  const [known, setKnown] = useState(selectedSubjects);
  useEffect(() => {
    const timeout = setTimeout(() => {
      setTerm(search);
      setPage(0);
    }, 250);
    return () => clearTimeout(timeout);
  }, [search]);
  const query = useQuery(`schedule-subjects:${term}:${page}`, () =>
    db.list("subjects", {
      search: term,
      searchColumn: "name",
      activeOnly: true,
      page,
    }),
  );
  const missing = value.filter((id) => !known.some((item) => item.id === id));
  const restoredSubjects = useQuery(
    `draft-subjects:${missing.join(",")}`,
    () => (missing.length ? db.subjectsByIds(missing) : Promise.resolve([])),
  );
  return (
    <div className="space-y-1.5 mt-1">
      <div className="flex flex-wrap gap-1.5">
        {value.map((id) => {
          const subject =
            known.find((item) => item.id === id) ||
            restoredSubjects.data?.find((item) => item.id === id);
          return (
            <span
              key={id}
              className="inline-flex max-w-full items-center gap-1 rounded-lg border border-indigo-100 bg-indigo-50 px-2 py-1 text-xs text-indigo-700"
            >
              <span className="min-w-0 break-words">
                {subject?.name || "Mata pelajaran tersimpan"}
                {subject?.is_active === false ? " (nonaktif)" : ""}
              </span>
              <button
                type="button"
                aria-label={`Hapus ${subject?.name || "mata pelajaran"}`}
                onClick={() => onChange(value.filter((item) => item !== id))}
                className="shrink-0 rounded p-0.5 hover:bg-indigo-100 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          );
        })}
      </div>
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          aria-label={`Cari ${field.label}`}
          placeholder="Cari mata pelajaran aktif…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl border border-slate-200 pl-9 pr-3 py-2 text-xs text-slate-900 bg-slate-50/50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
        />
      </div>
      <ErrorNotice message={query.error || restoredSubjects.error} />
      <select
        aria-label="Tambah mata pelajaran"
        required={field.required && value.length === 0}
        value=""
        onChange={(e) => {
          const id = e.target.value;
          const subject = query.data?.items.find((item) => item.id === id);
          if (!subject || value.includes(id)) return;
          setKnown((items) => [
            ...items.filter((item) => item.id !== id),
            { id, name: String(subject.name), is_active: true },
          ]);
          onChange([...value, id]);
        }}
        disabled={query.loading || !!query.error}
        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-100"
      >
        <option value="">Pilih mata pelajaran untuk ditambahkan</option>
        {query.data?.items
          .filter((item) => !value.includes(item.id))
          .map((item) => (
            <option key={item.id} value={item.id}>
              {String(item.name)}
            </option>
          ))}
      </select>
      <Pager page={page} total={query.data?.total || 0} onPage={setPage} />
      <small className="block text-2xs text-slate-400">
        Pilih minimal satu mata pelajaran. Pilihan nonaktif tersimpan dapat
        dihapus.
      </small>
    </div>
  );
}

interface RecordFormProps {
  title: string;
  fields: Field[];
  initial?: Row;
  onSave: (
    values: Record<string, unknown>,
    id: string,
    meta: { version?: number },
  ) => Promise<unknown>;
  onClose: () => void;
  tools?: (apply: (values: Record<string, unknown>) => void) => ReactNode;
  draft?: { form: string; scope?: string; loadLatest?: () => Promise<Row> };
}
function FreshRecordForm(props: RecordFormProps) {
  const query = useQuery(
    `edit-latest:${props.draft!.form}:${props.initial!.id}`,
    props.draft!.loadLatest!,
  );
  if (query.data)
    return (
      <RecordForm
        {...props}
        initial={query.data}
        draft={{ ...props.draft!, loadLatest: undefined }}
      />
    );
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={props.title}
      className="fixed inset-0 z-50 bg-slate-900/60 p-4 flex justify-center items-center"
    >
      <div className="rounded-2xl bg-white p-5 max-w-xl w-full space-y-3">
        <QueryState query={query}>
          <span />
        </QueryState>
        <button
          type="button"
          onClick={props.onClose}
          className="text-sm underline"
        >
          Tutup
        </button>
      </div>
    </div>
  );
}
export function RecordForm(props: RecordFormProps) {
  return props.draft?.loadLatest && props.initial?.id ? (
    <FreshRecordForm {...props} />
  ) : (
    <DraftRecordForm {...props} />
  );
}
function DraftRecordForm({
  title,
  fields,
  initial,
  onSave,
  onClose,
  tools,
  draft: config,
}: RecordFormProps) {
  // A scoped create may carry defaults with version=0. Only a persisted row
  // supplies an optimistic version; new records keep the draft's stable UUID.
  const version = initial?.id && initial.version > 0 ? initial.version : undefined;
  const draft = useDraft({
    enabled: !!config,
    form: `${config?.form || "unpersisted"}${config?.scope ? `/${config.scope}` : ""}`,
    entityId: version !== undefined ? initial!.id : undefined,
    baseVersion: version,
    baseUpdatedAt: initial?.updated_at as string | undefined,
    schema: JSON.stringify(
      fields.map(
        ({ name, type, multiple, reference, required, min, max, options }) => ({
          name,
          type,
          multiple,
          reference,
          required,
          min,
          max,
          options,
        }),
      ),
    ),
    defaults: Object.fromEntries(
      fields.map((field) => [
        field.name,
        initial?.[field.name] ??
          (field.multiple || field.type === 'subject_scores' ? [] : field.type === "checkbox" ? false : ""),
      ]),
    ) as DraftValues,
  });
  const { values } = draft;
  const id = initial?.id || draft.operationId;
  const mutation = useMutation();
  const set = (name: string, value: unknown) =>
    draft.set({ [name]: value } as DraftValues);

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4 flex justify-center items-center overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => {
        if (e.target === e.currentTarget && !mutation.pending) onClose();
      }}
    >
      <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-xl max-h-[92vh] flex flex-col border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
              <Sparkles className="w-4 h-4" />
            </div>
            <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={mutation.pending}
            aria-label="Tutup modal"
            className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form
          className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (draft.conflict) return;
            draft.flush();
            const payload = Object.fromEntries(
              fields.map((field) => {
                const value = values[field.name];
                return [
                  field.name,
                  field.type === 'subject_scores' ? (value as SubjectScore[]).map((entry) => ({ subject_id: entry.subject_id, score: entry.score === '' ? null : Number(entry.score) })) : field.type === "number"
                    ? value === ""
                      ? null
                      : Number(value)
                    : field.type === "month"
                      ? `${value}-01`
                      : field.type === "reference" && value === ""
                        ? null
                        : typeof value === "string"
                          ? value.trim()
                          : value,
                ];
              }),
            );
            if (
              await mutation.run(() => {
                if (fields.some((field) => field.type === 'subject_scores' && reportAverage(values[field.name] as SubjectScore[]) === null))
                  throw new Error('Pilih minimal satu mata pelajaran dan isi seluruh nilai 0 sampai 100.');
                if (
                  fields.some(
                    (field) =>
                      field.multiple &&
                      field.required &&
                      (!Array.isArray(payload[field.name]) ||
                        !(payload[field.name] as unknown[]).length),
                  )
                )
                  throw new Error("Pilih minimal satu mata pelajaran.");
                return onSave(payload, id, { version }).then(
                  () => {
                    if (!draft.clear())
                      throw new Error(
                        "Data tersimpan di server, tetapi draft belum dapat dihapus dari perangkat. Coba bersihkan draft sebelum menutup.",
                      );
                  },
                );
              })
            )
              onClose();
          }}
        >
          {config && <DraftNotice draft={draft} />}
          <fieldset
            disabled={mutation.pending || draft.conflict}
            className="space-y-4"
          >
            {tools?.((patch) => draft.set(patch as DraftValues))}
            {fields.map((field) => (
              <div key={field.name} className="space-y-1">
                <label className="block text-xs font-semibold text-slate-700">
                  {field.label}
                  {field.required && (
                    <span className="text-rose-500 ml-0.5">*</span>
                  )}
                </label>
                {field.type === 'subject_scores' ? (
                  <ReportSubjectInput value={values[field.name] as SubjectScore[]} scheduleId={String(values.schedule_id || '')}
                    childId={String(values.child_id || initial?.child_id || field.childId || '')}
                    savedSubjects={((initial?.report_subjects || []) as ReportSubject[]).map((item) => item.subject)}
                    onChange={(value) => set(field.name, value)} />
                ) : field.multiple ? (
                  <SubjectMultiInput
                    field={field}
                    value={values[field.name] as string[]}
                    selectedSubjects={
                      (initial?.subjects || []) as ScheduleSubject[]
                    }
                    onChange={(value) => set(field.name, value)}
                  />
                ) : field.type === "reference" ? (
                  <ReferenceInput
                    field={{
                      ...field,
                      childId:
                        field.childId ||
                        (field.reference === "schedules"
                          ? String(values.child_id || "") || undefined
                          : undefined),
                      searchColumn:
                        field.searchColumn ||
                        (field.reference === "schedules"
                          ? "notes"
                          : field.reference === "lesson_reports"
                            ? "topic"
                            : undefined),
                    }}
                    value={String(values[field.name] || "")}
                    onChange={(value) => set(field.name, value)}
                  />
                ) : field.type === "select" ? (
                  <select
                    required={field.required}
                    value={String(values[field.name])}
                    onChange={(e) => set(field.name, e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors shadow-2xs"
                  >
                    <option value="">Pilih {field.label}…</option>
                    {field.options?.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                ) : field.type === "textarea" ? (
                  <textarea
                    required={field.required}
                    value={String(values[field.name])}
                    onChange={(e) => set(field.name, e.target.value)}
                    maxLength={5000}
                    rows={3}
                    placeholder={`Masukkan ${field.label.toLowerCase()}…`}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors shadow-2xs min-h-[80px]"
                  />
                ) : field.type === "checkbox" ? (
                  <label className="flex items-center gap-2.5 pt-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(values[field.name])}
                      onChange={(e) => set(field.name, e.target.checked)}
                      className="w-4 h-4 rounded-md text-indigo-600 border-slate-300 focus:ring-indigo-500"
                    />
                    <span className="text-sm font-medium text-slate-700">
                      {field.label}
                    </span>
                  </label>
                ) : (
                  <div>
                    <input
                      type={field.type || "text"}
                      required={field.required}
                      min={field.min}
                      max={field.max}
                      placeholder={`Masukkan ${field.label.toLowerCase()}…`}
                      value={
                        field.type === "month"
                          ? String(values[field.name]).slice(0, 7)
                          : String(values[field.name] ?? "")
                      }
                      onChange={(e) => set(field.name, e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors shadow-2xs"
                    />
                    {field.name === "score" && (
                      <div className="flex flex-wrap items-center gap-1.5 mt-2">
                        <span className="text-2xs text-slate-400 mr-1">
                          Nilai cepat:
                        </span>
                        {[70, 75, 80, 85, 90, 95, 100].map((quick) => (
                          <button
                            key={quick}
                            type="button"
                            onClick={() => set("score", quick)}
                            className={`px-2 py-0.5 text-xs font-semibold rounded-md border transition-colors cursor-pointer ${
                              Number(values.score) === quick
                                ? "bg-indigo-600 text-white border-indigo-600"
                                : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-indigo-50 hover:text-indigo-600"
                            }`}
                          >
                            {quick}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            <ErrorNotice message={mutation.error} />
          </fieldset>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              disabled={mutation.pending}
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={mutation.pending || draft.conflict}
              className="inline-flex items-center justify-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-colors disabled:opacity-60 cursor-pointer"
            >
              {mutation.pending && (
                <Loader2 className="w-4 h-4 animate-spin text-white" />
              )}
              {mutation.pending ? "Menyimpan…" : "Simpan"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
