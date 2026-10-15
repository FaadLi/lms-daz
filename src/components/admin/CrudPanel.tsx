import { useState } from "react";
import type { Row, Entity } from "../../types";
import { db } from "../../services/db";
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
} from "../../data/presets";
import { ScoreBadge } from "../common/ScoreBadge";
import { TemplatePicker } from "./TemplatePicker";
import { cleanWhatsappNumber } from "../../utils/whatsapp";
import { ErrorNotice } from "../common/DataUI";

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
  if (table === "lesson_reports")
    return (
      <div className="space-y-2">
        <strong>{text(row, "topic")}</strong> ·{" "}
        {formatDateIndo(text(row, "date"))}
        <p>{text(row, "subject.name")}</p>
        <ScoreBadge score={Number(row.score)} />
        {[
          "what_learned",
          "learning_outcome",
          "teacher_notes",
          "next_step",
          "home_practice",
        ].map((key) => (
          <p key={key} className="whitespace-pre-wrap">
            {text(row, key)}
          </p>
        ))}
        <small>
          {row.shared_at
            ? `Dibagikan pada ${formatDateIndo(text(row, "shared_at"))}`
            : "Belum dicatat dibagikan"}
        </small>
      </div>
    );
  if (table === "invoices")
    return (
      <div>
        <strong>
          {text(row, "invoice_number")} · {text(row, "child.full_name")}
        </strong>
        <p>
          {formatDateIndo(text(row, "period"))} ·{" "}
          {formatRupiah(Number(row.amount))}
        </p>
        <p>
          Sisa: {formatRupiah(outstanding(row))} · Jatuh tempo{" "}
          {formatDateIndo(text(row, "due_date"))}
        </p>
        <p>
          Status:{" "}
          {paymentStatus(
            Number(row.amount),
            Number(row.amount) - outstanding(row),
            text(row, "due_date"),
          )}
        </p>
        {((row.transactions || []) as Row[]).map((item, index) => (
          <p key={index}>
            {formatDateIndo(text(item, "date"))} ·{" "}
            {formatRupiah(Number(item.amount))} · {text(item, "method")}
          </p>
        ))}
      </div>
    );
  return (
    <div className="space-y-1">
      <strong>
        {text(row, "full_name") ||
          text(row, "name") ||
          text(row, "child.full_name")}
      </strong>
      {fields[table]
        ?.filter(
          (field) =>
            field.name !== "child_id" &&
            field.name !== "subject_id" &&
            field.name !== "parent_id" &&
            field.name !== "schedule_id",
        )
        .map((field) => (
          <p key={field.name} className="text-sm whitespace-pre-wrap">
            <span className="text-slate-500">{field.label}: </span>
            {field.type === "checkbox"
              ? row[field.name]
                ? "Ya"
                : "Tidak"
              : text(row, field.name)}
          </p>
        ))}
      {Boolean(row.subject) && <p>{text(row, "subject.name")}</p>}
      {Boolean(row.parent) && <p>Wali: {text(row, "parent.full_name")}</p>}
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
  const [page, setPage] = useState(0),
    [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Row | null | undefined>();
  const [paying, setPaying] = useState<Row | null>(null);
  const [newParent, setNewParent] = useState(false);
  const [paymentKey, setPaymentKey] = useState("");
  const [parentId, setParentId] = useState(() => crypto.randomUUID());
  const [deleting, setDeleting] = useState<Row | null>(null);
  const [history, setHistory] = useState<Row | null>(null);
  const mutation = useMutation();
  const query = useQuery(`${table}:${childId}:${page}:${search}`, () =>
    db.list(table, {
      page,
      childId,
      search: table === "children" ? search : undefined,
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
      <div className="flex justify-between gap-2">
        <h2 className="text-xl font-bold">{title}</h2>
        <button
          onClick={() => {
            setNewParent(false);
            setParentId(crypto.randomUUID());
            setEditing(null);
          }}
        >
          Tambah
        </button>
        <button onClick={query.refresh}>Muat ulang</button>
      </div>
      {table === "children" && (
        <input
          aria-label="Cari murid"
          placeholder="Cari nama murid…"
          value={search}
          onChange={(e) => {
            setPage(0);
            setSearch(e.target.value);
          }}
        />
      )}
      <QueryState query={query}>
        {query.data?.items.length === 0 && <p>Belum ada data.</p>}
        {query.data?.items.map((row) => (
          <article
            key={row.id}
            className="bg-white border rounded-2xl p-4 space-y-3"
          >
            <RowDetails table={table} row={row} />
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setEditing(row)}>Edit</button>
              <button onClick={() => setDeleting(row)}>Hapus</button>
              {table === "lesson_reports" && (
                <button
                  disabled={mutation.pending}
                  onClick={() =>
                    void mutation.run(async () => {
                      await db.share(row);
                      refresh();
                    })
                  }
                >
                  Catat sudah dibagikan
                </button>
              )}
              {onChild && (
                <button onClick={() => onChild(row)}>Buka raport</button>
              )}
              {table === "invoices" && outstanding(row) > 0 && (
                <button
                  onClick={() => {
                    setPaymentKey(crypto.randomUUID());
                    setPaying(row);
                  }}
                >
                  Catat pembayaran
                </button>
              )}
              {table === "invoices" && (
                <button onClick={() => setHistory(row)}>
                  Riwayat pembayaran
                </button>
              )}
            </div>
          </article>
        ))}
      </QueryState>
      <Pager page={page} total={query.data?.total || 0} onPage={setPage} />

      {editing !== undefined && (
        <RecordForm
          key={`${editing?.id || "new"}:${newParent}`}
          title={`${editing ? "Edit" : "Tambah"} ${title}`}
          initial={editing || undefined}
          tools={
            editing === null && table === "children"
              ? () => (
                  <label>
                    <input
                      type="checkbox"
                      checked={newParent}
                      onChange={(e) => setNewParent(e.target.checked)}
                    />{" "}
                    Buat wali baru bersama murid
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
                  })),
                ]
              : formFields
          }
          onClose={() => setEditing(undefined)}
          onSave={async (values, id) => {
            let payload: Record<string, unknown> = {
              ...values,
              id,
              ...(childId ? { child_id: childId } : {}),
            };
            if (table === "invoices" && values.package_type !== "paket_sesi")
              payload = { ...payload, session_count: null };
            if (table === "children" && editing === null && newParent) {
              // Stable guardian UUID makes a network retry replay the same atomic create.
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
              await db.save(table, payload, editing?.version ?? null);
            }
            refresh();
          }}
        />
      )}
      {paying && (
        <RecordForm
          key={paymentKey}
          title="Catat pembayaran"
          fields={paymentFields}
          onClose={() => setPaying(null)}
          onSave={async (values) => {
            await db.payment(paying, values, paymentKey);
            refresh();
          }}
        />
      )}
      <ErrorNotice message={mutation.error} />
      {history && (
        <TransactionHistory row={history} onClose={() => setHistory(null)} />
      )}
      {deleting && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50"
        >
          <div className="bg-white p-5 rounded-xl space-y-3">
            <p>
              Hapus data ini? Data dengan relasi yang masih dipakai harus
              dinonaktifkan atau dilepas terlebih dahulu.
            </p>
            <ErrorNotice message={mutation.error} />
            <button
              disabled={mutation.pending}
              onClick={() =>
                void mutation.run(async () => {
                  await db.remove(table, deleting);
                  setDeleting(null);
                  refresh();
                })
              }
            >
              Hapus
            </button>
            <button
              disabled={mutation.pending}
              onClick={() => setDeleting(null)}
            >
              Batal
            </button>
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
      className="fixed inset-0 bg-slate-900/60 z-50 p-4 flex justify-center items-center"
      role="dialog"
      aria-modal="true"
    >
      <section className="bg-white rounded-xl p-5 max-w-xl w-full max-h-[90vh] overflow-y-auto">
        <h2>Riwayat {text(row, "invoice_number")}</h2>
        <QueryState query={query}>
          {query.data?.items.map((item) => (
            <p className="my-3" key={item.id}>
              {formatDateIndo(text(item, "date"))} ·{" "}
              {formatRupiah(Number(item.amount))} · {text(item, "method")} ·{" "}
              {text(item, "notes")}
            </p>
          ))}
        </QueryState>
        <Pager page={page} total={query.data?.total || 0} onPage={setPage} />
        <button onClick={onClose}>Tutup</button>
      </section>
    </div>
  );
}
