import { describe, it, expect } from "vitest";
import {
  randomToken,
  hashToken,
  imageMime,
} from "../supabase/functions/_shared/security";
import {
  todayJakarta,
  formatDateIndo,
  paymentStatus,
} from "../src/data/presets";
import { validatePublicKey } from "../src/services/supabase";

describe("security and calendar boundaries", () => {
  it("uses 256-bit URL-safe tokens and stable SHA256 hashes", async () => {
    const token = randomToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(randomToken()).not.toBe(token);
    expect(await hashToken(token)).toMatch(/^[a-f0-9]{64}$/);
    expect(await hashToken(token)).toBe(await hashToken(token));
  });
  it("rejects browser secret/service-role keys", () => {
    expect(validatePublicKey("sb_secret_test")).toBe(false);
    expect(
      validatePublicKey(
        `header.${btoa(JSON.stringify({ role: "service_role" }))}.signature`,
      ),
    ).toBe(false);
    expect(validatePublicKey("sb_publishable_test")).toBe(true);
  });
  it("uses Jakarta date at the UTC midnight boundary and derives balances", () => {
    const now = new Date("2026-10-13T18:00:00Z");
    expect(todayJakarta(now)).toBe("2026-10-14");
    expect(formatDateIndo("2026-10-14")).toContain("14");
    expect(paymentStatus(100, 20, "2026-10-15", now)).toBe("sebagian");
    expect(paymentStatus(100, 20, "2026-10-13", now)).toBe("jatuh_tempo");
  });
  it("checks image signatures rather than trusting a filename", () => {
    expect(imageMime(new TextEncoder().encode("<svg></svg>"))).toBe(null);
    expect(imageMime(Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]))).toBe(
      "image/png",
    );
  });
});
