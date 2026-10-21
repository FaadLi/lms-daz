import { afterEach, describe, expect, it, vi } from "vitest";
import { optimizeUpload } from "../src/services/images";
const jpeg = () =>
  new File(
    [new Uint8Array([255, 216, 255, ...new Array(1000).fill(0)])],
    "camera.jpg",
    { type: "image/jpeg" },
  );
afterEach(() => vi.unstubAllGlobals());
describe("upload optimization before preparing Storage", () => {
  it("rejects spoofed MIME/signatures and keeps valid files when decoding is unsupported", async () => {
    await expect(
      optimizeUpload(
        new File(["forged"], "image.jpg", { type: "image/jpeg" }),
        "photo",
      ),
    ).rejects.toThrow("format");
    vi.stubGlobal("createImageBitmap", undefined);
    const original = jpeg();
    expect(await optimizeUpload(original, "photo")).toBe(original);
  });
  it("orients, bounds, and encodes new uploads without changing the original File", async () => {
    const draw = vi.fn();
    const close = vi.fn();
    const decode = vi.fn(async () => ({ width: 2400, height: 1600, close }));
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: draw }),
      toBlob: (done: (value: Blob) => void) =>
        done(new Blob([new Uint8Array(100)], { type: "image/webp" })),
    };
    vi.stubGlobal("createImageBitmap", decode);
    vi.stubGlobal("document", { createElement: () => canvas });
    const original = jpeg();
    const avatar = await optimizeUpload(original, "avatar");
    expect(canvas.width).toBe(320);
    expect(canvas.height).toBe(213);
    expect(avatar.type).toBe("image/webp");
    expect(avatar.size).toBeLessThan(original.size);
    expect(original.name).toBe("camera.jpg");
    expect(decode).toHaveBeenCalledWith(original, {
      imageOrientation: "from-image",
    });
    expect(close).toHaveBeenCalledOnce();
    await optimizeUpload(original, "photo");
    expect(canvas.width).toBe(1600);
    expect(canvas.height).toBe(1067);
  });
});
