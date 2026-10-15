import { useEffect, useState, type ReactNode } from "react";
import type { Field, Row } from "../../types";
import { db, PAGE_SIZE } from "../../services/db";
import { useMutation, useQuery } from "../../services/hooks";

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
    <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">
      {message}
    </p>
  ) : null;
}
export function QueryState({
  query,
  children,
}: {
  query: { loading: boolean; error?: string; refresh: () => void };
  children: ReactNode;
}) {
  if (query.loading) return <p role="status">Memuat data…</p>;
  if (query.error)
    return (
      <div>
        <ErrorNotice message={query.error} />
        <button onClick={query.refresh}>Coba lagi</button>
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
  return (
    <div className="flex items-center gap-3 my-4 text-sm">
      <button disabled={!page} onClick={() => onPage(page - 1)}>
        Sebelumnya
      </button>
      <span>
        Halaman {page + 1} · {total} data
      </span>
      <button
        disabled={(page + 1) * PAGE_SIZE >= total}
        onClick={() => onPage(page + 1)}
      >
        Berikutnya
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
    <div>
      <input
        aria-label={`Cari ${field.label}`}
        placeholder={`Cari ${field.label}…`}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <ErrorNotice message={query.error || selected.error} />
      <select
        required={field.required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={query.loading}
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
              `${text(row, "date")} ${text(row, "topic") || text(row, "start_time")}`}
          </option>
        ))}
      </select>
      <small>Cari untuk mempersempit hasil (maksimal 20 pilihan).</small>
    </div>
  );
}
export function RecordForm({
  title,
  fields,
  initial,
  onSave,
  onClose,
  tools,
}: {
  title: string;
  fields: Field[];
  initial?: Row;
  onSave: (values: Record<string, unknown>, id: string) => Promise<unknown>;
  onClose: () => void;
  tools?: (apply: (values: Record<string, unknown>) => void) => ReactNode;
}) {
  const [id] = useState(() => initial?.id || crypto.randomUUID());
  const [values, setValues] = useState<Record<string, unknown>>(() =>
    Object.fromEntries(
      fields.map((field) => [
        field.name,
        initial?.[field.name] ?? (field.type === "checkbox" ? false : ""),
      ]),
    ),
  );
  const mutation = useMutation();
  const set = (name: string, value: unknown) =>
    setValues((current) => ({ ...current, [name]: value }));
  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 p-4 flex justify-center items-center"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <form
        className="bg-white rounded-2xl p-5 w-full max-w-xl max-h-[90vh] overflow-y-auto space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const payload = Object.fromEntries(
            fields.map((field) => {
              const value = values[field.name];
              return [
                field.name,
                field.type === "number"
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
          if (await mutation.run(() => onSave(payload, id))) onClose();
        }}
      >
        <h2 className="text-lg font-bold">{title}</h2>
        <fieldset disabled={mutation.pending} className="space-y-3">
          {tools?.((patch) =>
            setValues((current) => ({ ...current, ...patch })),
          )}
          {fields.map((field) => (
            <label key={field.name} className="block text-sm font-medium">
              {field.label}
              {field.type === "reference" ? (
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
                >
                  <option value="">Pilih…</option>
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
                />
              ) : field.type === "checkbox" ? (
                <input
                  type="checkbox"
                  checked={Boolean(values[field.name])}
                  onChange={(e) => set(field.name, e.target.checked)}
                />
              ) : (
                <input
                  type={field.type || "text"}
                  required={field.required}
                  min={field.min}
                  max={field.max}
                  value={
                    field.type === "month"
                      ? String(values[field.name]).slice(0, 7)
                      : String(values[field.name] ?? "")
                  }
                  onChange={(e) => set(field.name, e.target.value)}
                />
              )}
            </label>
          ))}
          <ErrorNotice message={mutation.error} />
          <div className="flex gap-2">
            <button type="submit">
              {mutation.pending ? "Menyimpan…" : "Simpan"}
            </button>
            <button type="button" onClick={onClose}>
              Batal
            </button>
          </div>
        </fieldset>
      </form>
    </div>
  );
}
