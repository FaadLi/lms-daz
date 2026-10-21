import type { Row } from "../../types";
import type { ReportSubject } from "../../utils/reports";

export function ReportScores({ row }: { row: Row }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs">
      <strong className="block mb-2 text-slate-700">Rincian Nilai</strong>
      <dl className="space-y-1.5">
        {((row.report_subjects || []) as ReportSubject[]).map(
          ({ subject_id, subject, score }) => (
            <div
              key={subject_id}
              className="flex items-center justify-between gap-3"
            >
              <dt className="text-slate-600">{subject.name}</dt>
              <dd className="font-semibold tabular-nums text-slate-900">
                {Number(score)}
              </dd>
            </div>
          ),
        )}
        <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-2 font-bold text-slate-800">
          <dt>Nilai Keseluruhan</dt>
          <dd className="tabular-nums">{Number(row.score)}</dd>
        </div>
      </dl>
    </div>
  );
}
