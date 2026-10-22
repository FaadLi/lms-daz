import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearMediaScope,
  invalidateMedia,
  mediaUrls,
  type SignedAsset,
} from "../src/services/mediaCache";
import {
  signMedia,
  clearSignedMedia,
  validRequests,
} from "../supabase/functions/_shared/media";
afterEach(() => {
  for (const scope of ["A", "B"]) clearMediaScope(scope);
  clearSignedMedia();
  vi.restoreAllMocks();
});
const loader = vi.fn(async (requests: { id: string }[]) =>
  requests.map(({ id }) => ({
    id,
    url: `private:${id}`,
    url_expires_at: Date.now() + 60000,
  })),
);
describe("private signed URL memory lifecycle", () => {
  it("uses remaining TTL conservatively even when server and browser clocks differ", async () => {
    const now = Date.now();
    const result = await mediaUrls(
      "A",
      [{ id: "clock", variant: "avatar" }],
      async () => [
        {
          id: "clock",
          url: "signed",
          server_time: now + 90000,
          url_expires_at: now + 150000,
        },
      ],
    );
    expect(result[0].url_expires_at).toBeLessThanOrEqual(Date.now() + 59000);
    expect(result[0].url_expires_at).toBeGreaterThan(Date.now() + 50000);
  });
  it("batches different visible assets and deduplicates the same variant", async () => {
    loader.mockClear();
    const [one, two, duplicate] = await Promise.all([
      mediaUrls("A", [{ id: "one", variant: "avatar" }], loader),
      mediaUrls("A", [{ id: "two", variant: "thumbnail" }], loader),
      mediaUrls("A", [{ id: "one", variant: "avatar" }], loader),
    ]);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(loader.mock.calls[0][0]).toHaveLength(2);
    expect(one).toEqual(duplicate);
    expect(two[0].id).toBe("two");
    await mediaUrls("A", [{ id: "one", variant: "avatar" }], loader);
    expect(loader).toHaveBeenCalledTimes(1);
  });
  it("refreshes before 60 seconds without extending expiry when reused, and isolates accounts", async () => {
    loader.mockClear();
    const request = { id: "one", variant: "avatar" as const };
    const first = (await mediaUrls("A", [request], loader))[0];
    vi.spyOn(Date, "now").mockReturnValue(first.url_expires_at - 14000);
    const refreshed = (await mediaUrls("A", [request], loader))[0];
    expect(refreshed.url_expires_at).toBeGreaterThan(first.url_expires_at);
    await mediaUrls("B", [request], loader);
    expect(loader).toHaveBeenCalledTimes(3);
  });
  it("invalidates replacements/deletes and rejects in-flight results from a logged out account", async () => {
    loader.mockClear();
    const request = { id: "one", variant: "avatar" as const };
    await mediaUrls("A", [request], loader);
    invalidateMedia("A", "one");
    await mediaUrls("A", [request], loader);
    expect(loader).toHaveBeenCalledTimes(2);
    let finish!: (value: SignedAsset[]) => void;
    const slow = () =>
      new Promise<SignedAsset[]>((resolve) => {
        finish = resolve;
      });
    const pending = mediaUrls("B", [request], slow);
    const rejected = expect(pending).rejects.toThrow("Session");
    await Promise.resolve();
    clearMediaScope("B");
    finish([{ id: "one", url: "late", url_expires_at: Date.now() + 60000 }]);
    await rejected;
    await mediaUrls("B", [request], loader);
    expect(loader).toHaveBeenCalledTimes(3);
  });
  it("requires an authorized row even if the Edge signer has a cached URL; variants remain signed", async () => {
    const request = {
      id: "11111111-1111-4111-8111-111111111111",
      variant: "avatar" as const,
    };
    const rows = [{ id: request.id, object_path: "owner/object.jpg" }];
    const sign = vi.fn(
      async (_path: string, _transform?: { width: number; height: number }) =>
        "signed",
    );
    await signMedia("owner", [request], rows, sign);
    await signMedia("owner", [request], rows, sign);
    expect(sign).toHaveBeenCalledOnce();
    expect(sign.mock.calls[0][1]).toMatchObject({ width: 160, height: 160 });
    await expect(signMedia("owner", [request], [], sign)).rejects.toMatchObject(
      { code: "42501" },
    );
    expect(validRequests([{ ...request, object_path: "forged" }])).toBe(false);
    expect(validRequests([{ ...request, variant: "forged" }])).toBe(false);
  });
  it("signs stored private derivatives without paid transforms and checks authorization before using cache", async () => {
    const request={id:"11111111-1111-4111-8111-111111111111",variant:"thumbnail" as const};
    const rows=[{id:request.id,object_path:"reports/owner/photo.jpg"}];
    const signer=vi.fn(async()=>"signed");
    await signMedia("owner",[request],rows,signer,true);
    expect(signer).toHaveBeenCalledWith("reports/owner/photo.jpg.lms-v1-thumbnail.webp",undefined);
    await expect(signMedia("owner",[request],[],signer,true)).rejects.toMatchObject({code:"42501"});
    await signMedia("owner",[{...request,variant:"original"}],rows,signer,true);
    expect(signer).toHaveBeenLastCalledWith("reports/owner/photo.jpg",undefined);
  });
});
