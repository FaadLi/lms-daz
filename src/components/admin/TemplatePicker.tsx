import { useState } from "react";
import { db } from "../../services/db";
import { useQuery, useMutation } from "../../services/hooks";
import { ErrorNotice, text } from "../common/DataUI";
import { Search, Sparkles } from "lucide-react";

export function TemplatePicker({
  apply,
}: {
  apply: (values: Record<string, unknown>) => void;
}) {
  const [search, setSearch] = useState("");
  const query = useQuery(`templates:${search}`, () =>
    db.list("report_templates", { search, searchColumn: "name" }),
  );
  const mutation = useMutation();

  return (
    <div className="bg-indigo-50/70 border border-indigo-100 p-3.5 rounded-2xl space-y-2">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-indigo-600" />
        <h4 className="text-xs font-bold text-indigo-900">
          Template Laporan Cepat
        </h4>
      </div>
      <p className="text-2xs text-indigo-700/80 leading-relaxed">
        Pilih template untuk mengisi otomatis topik, materi yang dipelajari, dan langkah berikutnya.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            aria-label="Cari template"
            placeholder="Cari nama template…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-indigo-200/80 pl-8 pr-3 py-1.5 text-xs text-slate-900 bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500 transition-colors shadow-2xs"
          />
        </div>

        <select
          value=""
          disabled={query.loading || mutation.pending}
          onChange={(e) => {
            const id = e.target.value;
            if (id)
              void mutation.run(async () => {
                const row = await db.get("report_templates", id);
                apply(
                  Object.fromEntries(
                    [
                      "subject_id",
                      "topic",
                      "what_learned",
                      "next_step",
                      "home_practice",
                    ].map((key) => [key, row[key]]),
                  ),
                );
              });
          }}
          className="w-full rounded-xl border border-indigo-200/80 px-3 py-1.5 text-xs font-medium text-slate-800 bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500 transition-colors shadow-2xs cursor-pointer"
        >
          <option value="">Terapkan template siap pakai…</option>
          {query.data?.items.map((row) => (
            <option key={row.id} value={row.id}>
              {text(row, "name")} ({text(row, "topic")})
            </option>
          ))}
        </select>
      </div>
      <ErrorNotice message={query.error || mutation.error} />
    </div>
  );
}
