import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { scheduleRow, scheduleSubjectsLabel } from "../src/utils/schedules";
import { RecordForm } from "../src/components/common/DataUI";
import { fields } from "../src/data/forms";

describe("schedule presentation and edit hydration", () => {
  const row = scheduleRow({
    id: "schedule",
    version: 7,
    schedule_subjects: [
      { subject: { id: "math", name: "Matematika", is_active: true } },
      { subject: { id: "english", name: "Bahasa Inggris", is_active: false } },
    ],
  });
  it("hydrates every subject from one joined result for editing and compact labels", () => {
    expect(row.subject_ids).toEqual(["english", "math"]);
    expect(scheduleSubjectsLabel(row)).toBe("Bahasa Inggris · Matematika");
  });
  it("renders all saved subjects, including removable inactive history", () => {
    const html = renderToStaticMarkup(
      <RecordForm
        title="Edit Jadwal"
        initial={row}
        fields={fields.schedules!}
        onClose={() => {}}
        onSave={async () => {}}
      />,
    );
    expect(html).toContain("Bahasa Inggris (nonaktif)");
    expect(html).toContain('aria-label="Hapus Bahasa Inggris"');
    expect(html).toContain('aria-label="Hapus Matematika"');
    expect(html).toContain('aria-label="Tambah mata pelajaran"');
    expect(
      fields.schedules?.find((field) => field.name === "subject_ids"),
    ).toMatchObject({ multiple: true, required: true });
    expect(
      fields.lesson_reports?.find((field) => field.name === "subject_id"),
    ).toMatchObject({ type: "reference", required: true });
  });
});
