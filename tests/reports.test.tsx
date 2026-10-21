// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  reportAverage,
  reportRow,
  type SubjectScore,
} from "../src/utils/reports";
import { ReportScores } from "../src/components/common/ReportScores";
import { ReportSubjectInput } from "../src/components/common/ReportSubjectInput";
import { RecordForm } from "../src/components/common/DataUI";
import { DraftProvider } from "../src/services/useDraft";
import { DraftStore } from "../src/services/drafts";
import { db } from "../src/services/db";
import type { Field } from "../src/types";

vi.mock("../src/services/db", () => ({
  PAGE_SIZE: 20,
  errorMessage: (error: Error) => error.message,
  db: { list: vi.fn(), get: vi.fn(), subjectsByIds: vi.fn() },
}));
const subjects = [
  { id: "math", name: "Matematika", is_active: true },
  { id: "science", name: "IPA", is_active: true },
];
const scores = [
  { subject_id: "math", score: 91 },
  { subject_id: "science", score: 80 },
];
const field: Field = {
  name: "subject_scores",
  label: "Mata pelajaran dan nilai",
  type: "subject_scores",
  required: true,
};
beforeEach(() => {
  localStorage.clear();
  vi.mocked(db.list).mockResolvedValue({
    items: subjects.map((item) => ({ ...item, version: 1 })),
    total: 2,
  });
  vi.mocked(db.subjectsByIds).mockResolvedValue(subjects);
  vi.mocked(db.get).mockResolvedValue({
    id: "schedule",
    version: 1,
    child_id: "child",
    subjects,
  });
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value: true,
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const form = (
  save: (data: Record<string, unknown>, id: string) => Promise<unknown>,
  initialScores = scores,
) => (
  <DraftProvider userId="teacher">
    <RecordForm
      title="Laporan"
      fields={[field]}
      initial={{ id: "report", version: 1, subject_scores: initialScores }}
      draft={{ form: "lesson_reports" }}
      onSave={save}
      onClose={() => {}}
    />
  </DraftProvider>
);

describe("report subjects and drafts", () => {
  it("computes equal averages with one decimal and rejects incomplete/invalid scores", () => {
    expect(reportAverage(scores)).toBe(85.5);
    expect(reportAverage([{ subject_id: "math", score: 90 }])).toBe(90);
    expect(
      reportAverage(
        [0, 100, 100].map((score, i) => ({ subject_id: String(i), score })),
      ),
    ).toBe(66.7);
    for (const score of ["", NaN, -1, 101])
      expect(reportAverage([{ subject_id: "math", score }])).toBeNull();
    expect(reportAverage([])).toBeNull();
  });
  it("hydrates edit scores and renders parent/teacher details", () => {
    const row = reportRow({
      id: "r",
      version: 1,
      score: 85.5,
      report_subjects: scores.map((item, i) => ({
        ...item,
        subject: subjects[i],
      })),
    });
    expect(row.subject_scores).toHaveLength(2);
    const html = renderToStaticMarkup(<ReportScores row={row} />);
    for (const label of [
      "Matematika",
      "IPA",
      "91",
      "80",
      "Nilai Keseluruhan",
      "85.5",
    ])
      expect(html).toContain(label);
  });
  it("updates the preview, restores all scores, preserves failed saves and clears only after success", async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error("Server gagal"))
      .mockResolvedValue(undefined);
    const first = render(form(save));
    await screen.findByLabelText("Nilai Matematika");
    fireEvent.change(screen.getByLabelText("Nilai Matematika"), {
      target: { value: "90" },
    });
    expect(screen.getByLabelText("Nilai Akumulasi").textContent).toBe("85");
    first.unmount();
    const key = Object.keys(localStorage)[0];
    render(form(save));
    expect(
      ((await screen.findByLabelText("Nilai Matematika")) as HTMLInputElement)
        .value,
    ).toBe("90");
    fireEvent.submit(
      screen.getByRole("button", { name: "Simpan" }).closest("form")!,
    );
    await screen.findByText("Server gagal");
    expect(localStorage.getItem(key)).not.toBeNull();
    fireEvent.submit(
      screen.getByRole("button", { name: "Simpan" }).closest("form")!,
    );
    await waitFor(() => expect(localStorage.getItem(key)).toBeNull());
    expect(save.mock.calls[1][0].subject_scores).toEqual([
      { subject_id: "math", score: 90 },
      { subject_id: "science", score: 80 },
    ]);
  });
  it("requires at least one scored subject before calling Supabase", async () => {
    const save = vi.fn(async () => {});
    render(form(save, []));
    fireEvent.submit(
      screen.getByRole("button", { name: "Simpan" }).closest("form")!,
    );
    await screen.findByText(/isi seluruh nilai/);
    expect(save).not.toHaveBeenCalled();
  });
  it("shows only scheduled options and keeps old scores visibly when the schedule changes", async () => {
    const change = vi.fn();
    render(
      <ReportSubjectInput
        value={[{ subject_id: "old", score: 77 }]}
        scheduleId="schedule"
        childId="child"
        savedSubjects={[{ id: "old", name: "Tersimpan" }]}
        onChange={change}
      />,
    );
    await screen.findByText(/Pilihan jadwal berubah/);
    expect(
      (screen.getByLabelText("Nilai Tersimpan") as HTMLInputElement).value,
    ).toBe("77");
    fireEvent.click(screen.getByLabelText("Matematika"));
    expect(change).toHaveBeenCalledWith([
      { subject_id: "old", score: 77 },
      { subject_id: "math", score: "" },
    ]);
  });
  it("confirms removal of scored subjects and excludes removed scores from the average", async () => {
    const confirm = vi
      .spyOn(window, "confirm")
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    function Controlled() {
      const [value, set] = useState<SubjectScore[]>(scores);
      return (
        <ReportSubjectInput
          value={value}
          scheduleId=""
          childId=""
          savedSubjects={subjects}
          onChange={set}
        />
      );
    }
    render(<Controlled />);
    fireEvent.click(await screen.findByRole("button", { name: "Hapus IPA" }));
    expect(screen.getByLabelText("Nilai Akumulasi").textContent).toBe("85.5");
    fireEvent.click(screen.getByRole("button", { name: "Hapus IPA" }));
    expect(screen.getByLabelText("Nilai Akumulasi").textContent).toBe("91");
    expect(confirm).toHaveBeenCalledTimes(2);
  });
  it("migrates legacy single-subject drafts without losing other fields or stale protection", () => {
    const common = {
      userId: "teacher",
      form: "lesson_reports",
      entityId: "r",
      baseVersion: 1,
    };
    const old = new DraftStore({
      ...common,
      schema: JSON.stringify([
        { name: "topic" },
        { name: "subject_id" },
        { name: "score" },
      ]),
      defaults: { topic: "", subject_id: "", score: "" },
    });
    old.set({ topic: "Belum selesai", subject_id: "math", score: "82" });
    old.flush();
    const options = {
      ...common,
      schema: JSON.stringify([{ name: "topic" }, { name: "subject_scores" }]),
      defaults: { topic: "", subject_scores: [] },
    };
    const restored = new DraftStore(options).snapshot();
    expect(restored.values).toEqual({
      topic: "Belum selesai",
      subject_scores: [{ subject_id: "math", score: "82" }],
    });
    expect(
      new DraftStore({ ...options, baseVersion: 2 }).snapshot().conflict,
    ).toBe(true);
    const unsafe = new DraftStore({ ...options, entityId: "other" });
    unsafe.set({
      subject_scores: [{ subject_id: "math", score: 80, token: "secret" }],
    } as never);
    expect(unsafe.snapshot().values.subject_scores).toEqual([]);
  });
});
