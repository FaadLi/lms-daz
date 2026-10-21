import type { SubjectScore } from "../utils/reports";
export type DraftValue =
  string | number | boolean | null | string[] | SubjectScore[];
export type DraftValues = Record<string, DraftValue>;
export interface DraftOptions {
  userId?: string;
  form: string;
  entityId?: string;
  schema: string;
  defaults: DraftValues;
  baseVersion?: number;
  baseUpdatedAt?: string;
}
interface DraftEnvelope {
  version: 1;
  updatedAt: string;
  userId: string;
  form: string;
  entityId: string;
  schema: string;
  operationId: string;
  baseVersion?: number;
  baseUpdatedAt?: string;
  values: DraftValues;
}
export interface DraftState {
  values: DraftValues;
  operationId: string;
  saved: boolean;
  conflict: boolean;
  error?: string;
  restored: boolean;
}
const active = new Set<DraftStore>();
export function flushAllDrafts(): boolean {
  let success = true;
  for (const store of active) if (!store.flush()) success = false;
  return success;
}
export function draftKey(
  options: Pick<DraftOptions, "userId" | "form" | "entityId">,
): string {
  return `lms_draft:v1:${encodeURIComponent(options.userId || "")}:${encodeURIComponent(options.form)}:${encodeURIComponent(options.entityId || "new")}`;
}
const sensitive =
  /password|passwd|token|secret|session|api[_-]?key|authorization|credential|base64|^file$|^photo$|^image$/i;
function safeSubjectScore(value: unknown): value is SubjectScore {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entry = value as Record<string, unknown>;
  return (
    Object.keys(entry).every(
      (key) => key === "subject_id" || key === "score",
    ) &&
    typeof entry.subject_id === "string" &&
    (typeof entry.score === "string" ||
      (typeof entry.score === "number" && Number.isFinite(entry.score)))
  );
}
function safeValues(values: unknown, defaults: DraftValues): DraftValues {
  if (!values || typeof values !== "object" || Array.isArray(values)) return {};
  return Object.fromEntries(
    Object.entries(values).filter(
      ([key, value]) =>
        Object.hasOwn(defaults, key) &&
        !sensitive.test(key) &&
        (key === "subject_scores"
          ? Array.isArray(value) && value.every(safeSubjectScore)
          : value === null ||
            typeof value === "string" ||
            typeof value === "boolean" ||
            (typeof value === "number" && Number.isFinite(value)) ||
            (Array.isArray(value) &&
              value.every((entry) => typeof entry === "string"))),
    ),
  );
}

// One store per mounted form, with synchronous field updates and debounced disk
// writes. Lifecycle/update flushes cannot race a React effect or lose the last key.
export class DraftStore {
  readonly key: string;
  private state: DraftState;
  private pending?: DraftEnvelope;
  private dirty = false;
  private timer?: ReturnType<typeof setTimeout>;
  private listeners = new Set<() => void>();
  constructor(readonly options: DraftOptions) {
    this.key = draftKey(options);
    this.state = {
      values: { ...options.defaults },
      operationId: crypto.randomUUID(),
      saved: false,
      conflict: false,
      restored: false,
    };
    if (!options.userId) return;
    try {
      const raw = localStorage.getItem(this.key);
      if (!raw) return;
      const entry = JSON.parse(raw) as DraftEnvelope;
      // Preserve pre-migration single-subject report drafts. Only accept the
      // precise field replacement; all unrelated schema changes stay rejected.
      if (
        entry.version === 1 &&
        entry.schema !== options.schema &&
        Object.hasOwn(options.defaults, "subject_scores") &&
        /^lesson_reports(?:\/|$)/.test(options.form)
      ) {
        try {
          const oldFields = JSON.parse(entry.schema) as { name: string }[];
          const newFields = JSON.parse(options.schema) as { name: string }[];
          if (
            oldFields.some((field) => field.name === "subject_id") &&
            oldFields.some((field) => field.name === "score") &&
            JSON.stringify(
              oldFields.filter(
                (field) => !["subject_id", "score"].includes(field.name),
              ),
            ) ===
              JSON.stringify(
                newFields.filter((field) => field.name !== "subject_scores"),
              ) &&
            typeof entry.values.subject_id === "string" &&
            entry.values.subject_id &&
            (typeof entry.values.score === "string" ||
              typeof entry.values.score === "number")
          ) {
            entry.values = {
              ...entry.values,
              subject_scores: [
                {
                  subject_id: entry.values.subject_id,
                  score: entry.values.score,
                },
              ],
            };
            entry.schema = options.schema;
          }
        } catch {
          /* Unsupported legacy shape remains a visible schema mismatch. */
        }
      }
      if (entry.version !== 1 || entry.schema !== options.schema) {
        this.state.error =
          "Format draft lama berbeda. Input terbaru digunakan; draft lama tidak dipulihkan.";
        return;
      }
      if (
        entry.userId !== options.userId ||
        entry.form !== options.form ||
        entry.entityId !== (options.entityId || "new") ||
        !/^[0-9a-f-]{36}$/i.test(entry.operationId)
      )
        return;
      entry.values = safeValues(entry.values, options.defaults);
      if (
        options.entityId &&
        (entry.baseVersion !== options.baseVersion ||
          entry.baseUpdatedAt !== options.baseUpdatedAt)
      ) {
        this.pending = entry;
        this.state.conflict = true;
      } else {
        this.state = {
          ...this.state,
          values: { ...options.defaults, ...entry.values },
          operationId: entry.operationId,
          restored: true,
          saved: true,
        };
      }
    } catch {
      this.state.error =
        "Draft tidak dapat dibaca. Penyimpanan browser mungkin dibatasi.";
    }
  }
  snapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private update(patch: Partial<DraftState>) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
  set = (patch: DraftValues) => {
    if (this.state.conflict) return;
    this.dirty = true;
    this.update({
      values: {
        ...this.state.values,
        ...safeValues(patch, this.options.defaults),
      },
      saved: false,
    });
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 600);
  };
  flush = (): boolean => {
    clearTimeout(this.timer);
    if (!this.options.userId || !this.dirty || this.state.conflict) return true;
    try {
      const entry: DraftEnvelope = {
        version: 1,
        updatedAt: new Date().toISOString(),
        userId: this.options.userId,
        form: this.options.form,
        entityId: this.options.entityId || "new",
        schema: this.options.schema,
        operationId: this.state.operationId,
        baseVersion: this.options.baseVersion,
        baseUpdatedAt: this.options.baseUpdatedAt,
        values: safeValues(this.state.values, this.options.defaults),
      };
      const serialized = JSON.stringify(entry);
      if (serialized.length > 256_000) throw new Error("Draft too large");
      localStorage.setItem(this.key, serialized);
      this.dirty = false;
      this.update({ saved: true, error: undefined });
      return true;
    } catch {
      this.update({
        saved: false,
        error:
          "Draft belum tersimpan di perangkat. Penyimpanan penuh atau dibatasi; jangan tutup form.",
      });
      return false;
    }
  };
  clear = (): boolean => {
    clearTimeout(this.timer);
    try {
      if (this.options.userId) localStorage.removeItem(this.key);
      this.dirty = false;
      this.pending = undefined;
      this.update({
        values: { ...this.options.defaults },
        operationId: crypto.randomUUID(),
        conflict: false,
        saved: false,
        restored: false,
        error: undefined,
      });
      return true;
    } catch {
      this.update({ error: "Draft belum dapat dihapus dari perangkat." });
      return false;
    }
  };
  resolve = (keepDraft: boolean) => {
    if (!keepDraft) {
      this.clear();
      return;
    }
    if (!this.pending) return;
    const entry = this.pending;
    this.pending = undefined;
    this.update({
      values: { ...this.options.defaults, ...entry.values },
      operationId: entry.operationId,
      conflict: false,
      restored: true,
    });
    this.dirty = true;
    this.flush();
  };
  mount = () => {
    active.add(this);
    const hidden = () => {
      if (document.visibilityState === "hidden") this.flush();
    };
    window.addEventListener("pagehide", this.flush);
    window.addEventListener("beforeunload", this.flush);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      this.flush();
      active.delete(this);
      clearTimeout(this.timer);
      window.removeEventListener("pagehide", this.flush);
      window.removeEventListener("beforeunload", this.flush);
      document.removeEventListener("visibilitychange", hidden);
    };
  };
}
