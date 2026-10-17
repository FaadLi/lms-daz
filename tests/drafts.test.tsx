// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DraftStore,
  draftKey,
  flushAllDrafts,
  type DraftValues,
} from "../src/services/drafts";
import { DraftProvider } from "../src/services/useDraft";
import { RecordForm } from "../src/components/common/DataUI";
import { applyPwaUpdate } from "../src/services/pwa";
import { mutationStarted, mutationFinished } from "../src/services/network";
import type { Row } from "../src/types";

const options = {
  userId: "user-a",
  form: "subjects",
  schema: "name-v1",
  defaults: { name: "" },
};
const fields = [{ name: "name", label: "Nama", required: true }];
beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value: true,
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function form(
  save = vi.fn(async () => {}),
  userId = "user-a",
  initial?: Row,
  latest?: () => Promise<Row>,
) {
  return (
    <DraftProvider userId={userId}>
      <RecordForm
        title="Form"
        fields={fields}
        initial={initial}
        draft={{ form: "subjects", loadLatest: latest }}
        onSave={save}
        onClose={() => {}}
      />
    </DraftProvider>
  );
}
const input = () =>
  screen.getByPlaceholderText("Masukkan nama…") as HTMLInputElement;

describe("reusable local drafts", () => {
  it("debounces writes and synchronously flushes the final input on unmount/pagehide", () => {
    vi.useFakeTimers();
    const writes = vi.spyOn(Storage.prototype, "setItem");
    const store = new DraftStore(options);
    const dispose = store.mount();
    store.set({ name: "M" });
    store.set({ name: "Math" });
    expect(writes).not.toHaveBeenCalled();
    vi.advanceTimersByTime(600);
    expect(writes).toHaveBeenCalledTimes(1);
    store.set({ name: "Last key" });
    window.dispatchEvent(new Event("pagehide"));
    expect(new DraftStore(options).snapshot().values.name).toBe("Last key");
    store.set({ name: "Closed" });
    dispose();
    expect(new DraftStore(options).snapshot().values.name).toBe("Closed");
  });
  it("restores input after refresh and close/open while preserving the create UUID", () => {
    const first = render(form());
    fireEvent.change(input(), { target: { value: "Matematika" } });
    first.unmount();
    const saved = JSON.parse(localStorage.getItem(draftKey(options))!);
    const reopened = render(form());
    expect(input().value).toBe("Matematika");
    expect(screen.getByText(/Draft dipulihkan/)).toBeTruthy();
    fireEvent.click(screen.getByText("Batal"));
    reopened.unmount();
    expect(
      JSON.parse(localStorage.getItem(draftKey(options))!).operationId,
    ).toBe(saved.operationId);
    render(form());
    expect(input().value).toBe("Matematika");
  });
  it("clears only after confirmed save and retains failed/offline drafts without replay", async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error("Supabase failed"))
      .mockResolvedValueOnce({});
    render(form(save));
    fireEvent.change(input(), { target: { value: "Physics" } });
    fireEvent.submit(input().closest("form")!);
    await screen.findByText("Supabase failed");
    const key = draftKey(options);
    expect(localStorage.getItem(key)).not.toBeNull();
    const operationId = JSON.parse(localStorage.getItem(key)!).operationId;
    fireEvent.submit(input().closest("form")!);
    await waitFor(() => expect(localStorage.getItem(key)).toBeNull());
    expect(save.mock.calls[0][1]).toBe(operationId);
    expect(save.mock.calls[1][1]).toBe(operationId);
    fireEvent.change(input(), { target: { value: "Offline input" } });
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });
    fireEvent.submit(input().closest("form")!);
    await screen.findByText(/Sedang offline/);
    expect(JSON.parse(localStorage.getItem(key)!).values.name).toBe(
      "Offline input",
    );
    const calls = save.mock.calls.length;
    window.dispatchEvent(new Event("online"));
    expect(save).toHaveBeenCalledTimes(calls);
  });
  it("isolates users, create/edit and scoped child/payment forms", () => {
    const a = new DraftStore(options);
    a.set({ name: "Only A" });
    a.flush();
    expect(
      new DraftStore({ ...options, userId: "user-b" }).snapshot().values.name,
    ).toBe("");
    expect(
      new DraftStore({ ...options, entityId: "record" }).snapshot().values.name,
    ).toBe("");
    expect(draftKey({ ...options, form: "payments/invoice-1" })).not.toBe(
      draftKey({ ...options, form: "payments/invoice-2" }),
    );
    expect(draftKey(options)).not.toBe(
      draftKey({ ...options, entityId: "record" }),
    );
    const view = render(form());
    expect(input().value).toBe(""); // Different schema is deliberately not restored.
    view.rerender(form(undefined, "user-b"));
    expect(input().value).toBe("");
  });
  it("requires explicit stale-edit resolution against a fresh server read and saves its version", async () => {
    const v1 = {
      id: "record",
      version: 1,
      name: "Old server",
      updated_at: "2026-10-17T00:00:00Z",
    };
    const first = render(form(undefined, "user-a", v1));
    fireEvent.change(input(), { target: { value: "My unsaved draft" } });
    first.unmount();
    const v2 = {
      ...v1,
      version: 2,
      name: "New server",
      updated_at: "2026-10-17T01:00:00Z",
    };
    const save = vi.fn(async () => {});
    render(form(save, "user-a", v1, async () => v2));
    await screen.findByText(/Data server sudah berubah/);
    expect(input().value).toBe("New server");
    expect((screen.getByText("Simpan") as HTMLButtonElement).disabled).toBe(
      true,
    );
    fireEvent.click(screen.getByText("Pertahankan input draft"));
    expect(input().value).toBe("My unsaved draft");
    fireEvent.submit(input().closest("form")!);
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(
        { name: "My unsaved draft" },
        "record",
        { version: 2 },
      ),
    );
  });
  it("can discard a stale draft and use the latest server values", () => {
    const initial = { id: "record", version: 1, name: "Old" };
    const first = render(form(undefined, "user-a", initial));
    fireEvent.change(input(), { target: { value: "Draft" } });
    first.unmount();
    render(
      form(undefined, "user-a", { ...initial, name: "Latest", version: 2 }),
    );
    fireEvent.click(screen.getByText("Gunakan data terbaru"));
    expect(input().value).toBe("Latest");
    expect(
      localStorage.getItem(draftKey({ ...options, entityId: "record" })),
    ).toBeNull();
  });
  it("ignores corrupt/version/schema mismatches and excludes credentials, files and arbitrary objects", () => {
    const defaults = {
      name: "",
      password: "",
      access_token: "",
      session: "",
      privateToken: "",
      apiKey: "",
      file: null,
    } as DraftValues;
    const store = new DraftStore({ ...options, defaults });
    store.set({
      name: "Allowed",
      password: "PASSWORD_SECRET",
      access_token: "JWT_SECRET",
      session: "SESSION_SECRET",
      privateToken: "PARENT_SECRET",
      apiKey: "API_SECRET",
      file: new File(["photo"], "photo.png"),
    } as unknown as DraftValues);
    store.flush();
    const raw = localStorage.getItem(store.key)!;
    expect(JSON.parse(raw).values).toEqual({ name: "Allowed" });
    for (const secret of [
      "PASSWORD_SECRET",
      "JWT_SECRET",
      "SESSION_SECRET",
      "PARENT_SECRET",
      "API_SECRET",
      "photo.png",
    ])
      expect(raw).not.toContain(secret);
    localStorage.setItem(
      store.key,
      JSON.stringify({ ...JSON.parse(raw), version: 99 }),
    );
    expect(new DraftStore(options).snapshot().values.name).toBe("");
    localStorage.setItem(store.key, "broken");
    expect(new DraftStore(options).snapshot().values.name).toBe("");
  });
  it("reports quota failures and blocks update reload until drafts can be saved", async () => {
    const store = new DraftStore(options);
    const dispose = store.mount();
    store.set({ name: "Do not lose" });
    const write = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new DOMException("Quota", "QuotaExceededError");
      });
    expect(flushAllDrafts()).toBe(false);
    const reload = vi.fn();
    await expect(
      applyPwaUpdate({ waiting: null } as ServiceWorkerRegistration, reload),
    ).rejects.toThrow(/Draft belum tersimpan/);
    expect(reload).not.toHaveBeenCalled();
    write.mockRestore();
    await applyPwaUpdate(
      { waiting: null } as ServiceWorkerRegistration,
      reload,
    );
    expect(new DraftStore(options).snapshot().values.name).toBe("Do not lose");
    expect(reload).toHaveBeenCalledOnce();
    dispose();
  });
  it("does not silently restore a form after its validation schema changes", () => {
    const first = render(form());
    fireEvent.change(input(), { target: { value: "Old schema input" } });
    first.unmount();
    render(
      <DraftProvider userId="user-a">
        <RecordForm
          title="Form"
          fields={[{ name: "name", label: "Nama", required: false }]}
          draft={{ form: "subjects" }}
          onSave={async () => {}}
          onClose={() => {}}
        />
      </DraftProvider>,
    );
    expect(input().value).toBe("");
    expect(screen.getByText(/Format draft lama berbeda/)).toBeTruthy();
  });
  it("does not reload during a database/upload mutation", async () => {
    mutationStarted();
    try {
      await expect(
        applyPwaUpdate({ waiting: null } as ServiceWorkerRegistration, vi.fn()),
      ).rejects.toThrow(/Tunggu penyimpanan/);
    } finally {
      mutationFinished();
    }
  });
});
