import { describe, expect, it } from "vitest";
import { mayServeShell, mayServeStatic } from "../src/utils/pwaPolicy";
describe("public static-only PWA caching policy", () => {
  const origin = "https://lms.example";
  const request = {
    method: "GET",
    headers: new Headers(),
    mode: "navigate" as RequestMode,
  };
  it("serves hashed assets and a fixed shell, without storing token-bearing URLs", () => {
    expect(
      mayServeStatic(
        request,
        new URL(`${origin}/assets/index-a1b2.js`),
        origin,
      ),
    ).toBe(true);
    expect(
      mayServeShell(request, new URL(`${origin}/?token=PRIVATE_TOKEN`), origin),
    ).toBe(true);
    expect(
      mayServeStatic(
        request,
        new URL(`${origin}/?token=PRIVATE_TOKEN`),
        origin,
      ),
    ).toBe(false);
    expect(
      mayServeStatic(
        request,
        new URL(`${origin}/assets/index-a1b2.js?token=SECRET`),
        origin,
      ),
    ).toBe(false);
  });
  it("never serves cached Supabase, signed storage, auth, Edge, payment or writes", () => {
    for (const path of [
      "https://project.supabase.co/auth/v1/token",
      "https://project.supabase.co/rest/v1/lms_children",
      "https://project.supabase.co/storage/v1/object/sign/lms_media/photo?token=SECRET",
      "https://project.supabase.co/functions/v1/lesreport",
      `${origin}/api/payment`,
      `${origin}/auth/callback`,
    ]) {
      expect(mayServeStatic(request, new URL(path), origin)).toBe(false);
      expect(mayServeShell(request, new URL(path), origin)).toBe(false);
    }
    expect(
      mayServeStatic(
        { ...request, method: "POST" },
        new URL(`${origin}/assets/index-a.js`),
        origin,
      ),
    ).toBe(false);
    expect(
      mayServeShell(
        {
          ...request,
          headers: new Headers({ Authorization: "Bearer SECRET" }),
        },
        new URL(origin),
        origin,
      ),
    ).toBe(false);
  });
});
