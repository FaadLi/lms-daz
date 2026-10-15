import { useState } from "react";
import { db } from "../../services/db";
import { useQuery, useMutation } from "../../services/hooks";
import { ErrorNotice, text } from "../common/DataUI";

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
    <div className="bg-slate-50 p-3 rounded-xl">
      <p>
        Template mengisi materi dan rencana. Isi hasil observasi serta nilai
        secara manual.
      </p>
      <input
        aria-label="Cari template"
        placeholder="Cari template…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
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
      >
        <option value="">Terapkan template…</option>
        {query.data?.items.map((row) => (
          <option key={row.id} value={row.id}>
            {text(row, "name")}
          </option>
        ))}
      </select>
      <ErrorNotice message={query.error || mutation.error} />
    </div>
  );
}
