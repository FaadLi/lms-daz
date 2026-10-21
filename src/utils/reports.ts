import type { Row } from "../types";
import type { ScheduleSubject } from "./schedules";

export interface SubjectScore {
  subject_id: string;
  score: number | string;
}
export interface ReportSubject extends SubjectScore {
  subject: ScheduleSubject;
}
export function reportAverage(scores: SubjectScore[]): number | null {
  if (
    !scores.length ||
    scores.some(
      ({ score }) =>
        (typeof score === "string" && score.trim() === "") ||
        !Number.isFinite(Number(score)) ||
        Number(score) < 0 ||
        Number(score) > 100,
    )
  )
    return null;
  return (
    Math.round(
      (scores.reduce((sum, item) => sum + Number(item.score), 0) /
        scores.length +
        Number.EPSILON) *
        10,
    ) / 10
  );
}
export function reportRow(row: Row): Row {
  const subjects = ((row.report_subjects || []) as ReportSubject[])
    .slice()
    .sort(
      (a, b) =>
        a.subject.name.localeCompare(b.subject.name, "id") ||
        a.subject_id.localeCompare(b.subject_id),
    );
  return {
    ...row,
    report_subjects: subjects,
    subject_scores: subjects.map(({ subject_id, score }) => ({
      subject_id,
      score,
    })),
  };
}
export function reportSubjectsLabel(row: Row): string {
  return ((row.report_subjects || []) as ReportSubject[])
    .map(({ subject }) => subject.name)
    .join(" · ");
}
