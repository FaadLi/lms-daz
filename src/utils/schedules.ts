import type { Row } from "../types";

export interface ScheduleSubject {
  id: string;
  name: string;
  is_active?: boolean;
}

// A single nested PostgREST select supplies both display labels and edit values.
export function scheduleRow(row: Row): Row {
  const relations = (row.schedule_subjects || []) as {
    subject: ScheduleSubject;
  }[];
  const subjects = relations
    .map((relation) => relation.subject)
    .sort(
      (a, b) => a.name.localeCompare(b.name, "id") || a.id.localeCompare(b.id),
    );
  return {
    ...row,
    subjects,
    subject_ids: subjects.map((subject) => subject.id),
  };
}

export function scheduleSubjectsLabel(row: Row): string {
  return ((row.subjects || []) as ScheduleSubject[])
    .map((subject) => subject.name)
    .join(" · ");
}
