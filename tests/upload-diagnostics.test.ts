import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Row } from "../src/types";
import { requestLog } from "../supabase/functions/_shared/diagnostics";
vi.mock('../src/services/images',()=>({optimizeUpload:async(file:File)=>file}));

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  upload: vi.fn(),
  single: vi.fn(),
  getSession: vi.fn(),
}));
vi.mock("../src/services/supabase", () => ({
  client: () => ({
    rpc: mocks.rpc,
    auth: { getSession: mocks.getSession },
    storage: { from: () => ({ upload: mocks.upload }) },
    from: () => ({ select: () => ({ eq: () => ({ single: mocks.single }) }) }),
  }),
}));
import { edge, upload, errorMessage } from "../src/services/db";

const file = new File([new Uint8Array([1])], "photo.png", {
  type: "image/png",
});
const target = { id: "child", version: 1 } as Row;
beforeEach(() => {
  vi.resetAllMocks();
  mocks.rpc.mockResolvedValue({
    data: { id: "asset", object_path: "children/test.png" },
  });
  mocks.upload.mockResolvedValue({ error: null });
  mocks.single.mockResolvedValue({ data: { state: "pending" } });
  mocks.getSession.mockResolvedValue({
    data: { session: { access_token: "private-jwt" } },
  });
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => vi.unstubAllGlobals());

describe("upload request stages", () => {
  it("identifies RPC preparation failures without attempting Storage", async () => {
    mocks.rpc.mockResolvedValue({
      error: { code: "23503", message: "Invalid relation" },
    });
    await expect(upload(file, "avatar", target)).rejects.toThrow(
      /RPC persiapan upload: Relasi data/,
    );
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.single).not.toHaveBeenCalled();
  });
  it("identifies Storage failures and preserves the HTTP status", async () => {
    mocks.upload.mockResolvedValue({
      error: { message: "Access denied", status: 403 },
    });
    await expect(upload(file, "avatar", target)).rejects.toMatchObject({
      message: expect.stringContaining("Storage upload (HTTP 403)"),
      status: 403,
    });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("identifies finalization network failures without exposing request secrets", async () => {
    vi.mocked(fetch).mockRejectedValue(
      new TypeError("private-jwt private-parent-token"),
    );
    const error = await upload(file, "avatar", target).catch((error) => error);
    expect(errorMessage(error)).toMatch(/Finalisasi upload:.*jaringan, CORS/);
    expect(errorMessage(error)).not.toMatch(/private-jwt|private-parent-token/);
    expect(mocks.single).toHaveBeenCalledOnce();
  });
  it("keeps stale update HTTP 409 and its user message", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          error: "Data sudah berubah. Muat ulang sebelum menyimpan.",
        }),
        { status: 409 },
      ),
    );
    await expect(upload(file, "avatar", target)).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining(
        "Finalisasi upload (HTTP 409): Data sudah berubah.",
      ),
    });
  });
  it("reconciles a lost finalize response when metadata is already ready", async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError("Failed to fetch"));
    mocks.single.mockResolvedValue({ data: { state: "ready" } });
    await expect(upload(file, "avatar", target)).resolves.toEqual({
      ok: true,
      cleanupPending: true,
    });
  });
  it("labels private-link errors and does not echo invalid response bodies", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response("private-parent-token", { status: 502 }),
    );
    const error = await edge(
      { action: "issue-link", childId: "child", days: 1 },
      true,
    ).catch((error) => error);
    expect(error).toMatchObject({
      message: "Edge Function (HTTP 502): Respons server tidak valid.",
      status: 502,
    });
  });
});

describe("safe Edge diagnostics", () => {
  it("projects only recognized action, stage and status", () => {
    expect(
      JSON.parse(requestLog("finish-upload", "storage-read", 400)),
    ).toEqual({
      action: "finish-upload",
      stage: "storage-read",
      status: 400,
    });
    const secret = "private-jwt private-parent-token sb_secret_test signed-url";
    const output = requestLog(
      { action: "parent", token: secret },
      secret as never,
      Number.NaN,
    );
    expect(JSON.parse(output)).toEqual({
      action: "unknown",
      stage: "request",
      status: 500,
    });
    expect(output).not.toContain(secret);
    expect(requestLog(secret, "request", 400)).not.toContain(secret);
  });
});
