import { useEffect, useState } from "react";
import { db } from "../../services/db";
import { useQuery } from "../../services/hooks";
import { reportAverage, type SubjectScore } from "../../utils/reports";
import type { ScheduleSubject } from "../../utils/schedules";

export function ReportSubjectInput({
  value,
  scheduleId,
  childId,
  savedSubjects,
  onChange,
}: {
  value: SubjectScore[];
  scheduleId: string;
  childId: string;
  savedSubjects: ScheduleSubject[];
  onChange: (value: SubjectScore[]) => void;
}) {
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [page, setPage] = useState(0);
  useEffect(() => {
    const timeout = setTimeout(() => {
      setTerm(search);
      setPage(0);
    }, 250);
    return () => clearTimeout(timeout);
  }, [search]);
  const schedule = useQuery(`report-schedule:${scheduleId}`, () =>
    scheduleId ? db.get("schedules", scheduleId) : Promise.resolve(null),
  );
  const active = useQuery(
    `report-active-subjects:${!!scheduleId}:${term}:${page}`,
    () =>
      scheduleId
        ? Promise.resolve({ items: [], total: 0 })
        : db.list("subjects", {
            activeOnly: true,
            search: term,
            searchColumn: "name",
            page,
          }),
  );
  const selected = useQuery(
    `report-selected-subjects:${value
      .map((item) => item.subject_id)
      .sort()
      .join(",")}`,
    () =>
      value.length
        ? db.subjectsByIds(value.map((item) => item.subject_id))
        : Promise.resolve([]),
  );
  const available = scheduleId
    ? ((schedule.data?.subjects || []) as ScheduleSubject[])
    : (active.data?.items || []).map((item) => ({
        id: item.id,
        name: String(item.name),
        is_active: true,
      }));
  const known = [...savedSubjects, ...(selected.data || []), ...available];
  const name = (id: string) =>
    known.find((item) => item.id === id)?.name || "Mata pelajaran tersimpan";
  const invalid =
    schedule.data &&
    value.some(
      (item) => !available.some((subject) => subject.id === item.subject_id),
    );
  const wrongChild =
    schedule.data && childId && schedule.data.child_id !== childId;
  const error =
    schedule.error ||
    active.error ||
    selected.error ||
    (wrongChild
      ? "Jadwal tidak sesuai murid. Pilih ulang jadwal."
      : invalid
        ? "Pilihan jadwal berubah. Nilai tersimpan tetap ditampilkan; hapus pilihan yang tidak sesuai atau ubah jadwal sebelum menyimpan."
        : "");
  const average = reportAverage(value);
  return (
    <div className="space-y-3 mt-1">
      <p className="text-2xs text-slate-500">
        {scheduleId
          ? "Pilih mata pelajaran dari jadwal yang benar-benar diajarkan."
          : "Pilih mata pelajaran aktif yang diajarkan."}
      </p>
      {!scheduleId && (
        <input
          aria-label="Cari mata pelajaran laporan"
          placeholder="Cari mata pelajaran aktif…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"
        />
      )}
      <div className="flex flex-wrap gap-2">
        {available
          .filter(
            (subject) => !value.some((item) => item.subject_id === subject.id),
          )
          .map((subject) => (
            <label
              key={subject.id}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-2 text-xs cursor-pointer"
            >
              <input
                type="checkbox"
                checked={false}
                onChange={() =>
                  onChange([...value, { subject_id: subject.id, score: "" }])
                }
              />
              {subject.name}
            </label>
          ))}
      </div>
      {(schedule.loading || active.loading || selected.loading) && (
        <p className="text-xs text-slate-400">Memuat mata pelajaran…</p>
      )}
      {!scheduleId && (active.data?.total || 0) > 20 && (
        <div className="flex gap-3 text-xs">
          <button
            type="button"
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
          >
            Sebelumnya
          </button>
          <button
            type="button"
            disabled={(page + 1) * 20 >= (active.data?.total || 0)}
            onClick={() => setPage(page + 1)}
          >
            Berikutnya
          </button>
        </div>
      )}
      {value.map((item) => (
        <div
          key={item.subject_id}
          className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2"
        >
          <div className="flex items-center justify-between gap-2">
            <label
              className="text-xs font-semibold text-slate-700"
              htmlFor={`score-${item.subject_id}`}
            >
              {name(item.subject_id)}
            </label>
            <button
              type="button"
              aria-label={`Hapus ${name(item.subject_id)}`}
              className="text-xs text-rose-600"
              onClick={() => {
                if (
                  item.score !== "" &&
                  !window.confirm(
                    `Hapus ${name(item.subject_id)} beserta nilainya dari laporan ini?`,
                  )
                )
                  return;
                onChange(
                  value.filter((entry) => entry.subject_id !== item.subject_id),
                );
              }}
            >
              Hapus
            </button>
          </div>
          <input
            id={`score-${item.subject_id}`}
            aria-label={`Nilai ${name(item.subject_id)}`}
            type="number"
            required
            min={0}
            max={100}
            step="any"
            value={item.score}
            onChange={(e) =>
              onChange(
                value.map((entry) =>
                  entry.subject_id === item.subject_id
                    ? { ...entry, score: e.target.value }
                    : entry,
                ),
              )
            }
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          />
          <div className="flex flex-wrap gap-1.5">
            {[60, 70, 80, 90, 100].map((score) => (
              <button
                key={score}
                type="button"
                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
                onClick={() =>
                  onChange(
                    value.map((entry) =>
                      entry.subject_id === item.subject_id
                        ? { ...entry, score }
                        : entry,
                    ),
                  )
                }
              >
                {score}
              </button>
            ))}
          </div>
        </div>
      ))}
      {error && (
        <p role="alert" className="text-xs text-rose-600">
          {error}
        </p>
      )}
      <div className="flex items-center justify-between rounded-xl border border-indigo-100 bg-indigo-50 p-3 text-sm font-bold text-indigo-900">
        <span>Nilai Akumulasi</span>
        <output aria-label="Nilai Akumulasi">{average ?? "—"}</output>
      </div>
      {!value.length && (
        <p className="text-xs text-slate-500">
          Pilih minimal satu mata pelajaran dan isi setiap nilai (0–100).
        </p>
      )}
    </div>
  );
}
