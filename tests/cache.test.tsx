// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, act } from "@testing-library/react";
import { focusManager } from "@tanstack/react-query";
import {
  DataCacheProvider,
  invalidateData,
  staleTimeFor,
} from "../src/services/queryCache";
import { useQuery } from "../src/services/hooks";
vi.mock("../src/services/db", () => ({
  errorMessage: (error: Error) => error.message,
}));
beforeEach(() => {
  localStorage.clear();
  focusManager.setFocused(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  focusManager.setFocused(undefined);
});
function Value({
  loader,
  name = "subjects:active:0",
}: {
  loader: () => Promise<string>;
  name?: string;
}) {
  const query = useQuery(name, loader);
  return (
    <span>
      {query.data ||
        (query.error ? "denied" : query.loading ? "loading" : "empty")}
    </span>
  );
}
const deferred = () => {
  let resolve!: (value: string) => void;
  const promise = new Promise<string>((done) => {
    resolve = done;
  });
  return { resolve, promise };
};
describe("account-isolated in-memory query cache", () => {
  it("deduplicates mounted consumers and reuses fresh data on return without persistence", async () => {
    const loader = vi.fn(async () => "Math");
    const write = vi.spyOn(Storage.prototype, "setItem");
    const tree = (show: boolean) => (
      <DataCacheProvider scope="A">
        {show && (
          <>
            <Value loader={loader} />
            <Value loader={loader} />
          </>
        )}
      </DataCacheProvider>
    );
    const view = render(tree(true));
    await screen.findAllByText("Math");
    expect(loader).toHaveBeenCalledTimes(1);
    view.rerender(tree(false));
    view.rerender(tree(true));
    await screen.findAllByText("Math");
    expect(loader).toHaveBeenCalledTimes(1);
    expect(write).not.toHaveBeenCalled();
  });
  it("revalidates stale data on focus while retaining the current display", async () => {
    const loader = vi
      .fn()
      .mockResolvedValueOnce("Old")
      .mockResolvedValue("Fresh");
    render(
      <DataCacheProvider scope="A">
        <Value loader={loader} />
      </DataCacheProvider>,
    );
    await screen.findByText("Old");
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now + 901000);
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    await screen.findByText("Fresh");
    expect(loader).toHaveBeenCalledTimes(2);
  });
  it("cancels an older read on mutation invalidation so it cannot replace fresh data", async () => {
    const old = deferred();
    const loader = vi
      .fn()
      .mockReturnValueOnce(old.promise)
      .mockResolvedValue("New");
    render(
      <DataCacheProvider scope="A">
        <Value loader={loader} />
      </DataCacheProvider>,
    );
    await waitFor(() => expect(loader).toHaveBeenCalledTimes(1));
    await act(async () => {
      await invalidateData(["subjects"]);
    });
    await screen.findByText("New");
    await act(async () => {
      old.resolve("Obsolete");
      await old.promise;
    });
    expect(screen.queryByText("Obsolete")).toBeNull();
  });
  it("clears account A on logout/switch, including late reads, before showing account B", async () => {
    const old = deferred();
    const a = vi.fn(() => old.promise);
    const b = vi.fn(async () => "Private B");
    const tree = (scope: string, loader: () => Promise<string>) => (
      <DataCacheProvider scope={scope}>
        <Value loader={loader} />
      </DataCacheProvider>
    );
    const view = render(tree("A", a));
    await waitFor(() => expect(a).toHaveBeenCalledOnce());
    view.rerender(tree("B", b));
    await screen.findByText("Private B");
    await act(async () => {
      old.resolve("Private A");
      await old.promise;
    });
    expect(screen.queryByText("Private A")).toBeNull();
    view.rerender(tree("A", a));
    await screen.findByText("Private A");
    expect(a).toHaveBeenCalledTimes(2);
  });
  it("rechecks payment pages and fresh edit snapshots on every opening", async () => {
    const loader = vi.fn().mockResolvedValueOnce("v1").mockResolvedValue("v2");
    const tree = (show: boolean) => (
      <DataCacheProvider scope="A">
        {show && <Value name="edit-latest:lesson_reports:id" loader={loader} />}
      </DataCacheProvider>
    );
    const view = render(tree(true));
    await screen.findByText("v1");
    view.rerender(tree(false));
    view.rerender(tree(true));
    await screen.findByText("v2");
    expect(loader).toHaveBeenCalledTimes(2);
    expect(staleTimeFor("invoices:child:0:")).toBe(0);
    expect(staleTimeFor("transactions:id:0")).toBe(0);
    expect(staleTimeFor("dashboard:children:active:0:6")).toBe(60_000);
  });
  it("does not display prior parent data when token revalidation is denied", async () => {
    const loader = vi
      .fn()
      .mockResolvedValueOnce("Allowed")
      .mockRejectedValue(new Error("revoked"));
    const tree = (show: boolean) => (
      <DataCacheProvider scope="parent.hash" parent>
        {show && <Value name="parent:reports:0" loader={loader} />}
      </DataCacheProvider>
    );
    const view = render(tree(true));
    await screen.findByText("Allowed");
    view.rerender(tree(false));
    view.rerender(tree(true));
    await screen.findByText("denied");
    expect(screen.queryByText("Allowed")).toBeNull();
  });
});
