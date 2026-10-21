export type Variant = "avatar" | "thumbnail" | "detail" | "original";
export type MediaRequest = { id: string; variant: Variant };
export type MediaRow = {
  id: unknown;
  object_path: unknown;
  [key: string]: unknown;
};
type Signed = {
  id: string;
  url: string;
  url_expires_at: number;
  server_time?: number;
};
const urls = new Map<string, Signed>();
const variants = {
  avatar: { width: 160, height: 160, resize: "contain" as const, quality: 75 },
  thumbnail: {
    width: 640,
    height: 480,
    resize: "contain" as const,
    quality: 75,
  },
  detail: { width: 1280, height: 960, resize: "contain" as const, quality: 82 },
};
export function validRequests(value: unknown): value is MediaRequest[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= 20 &&
    value.every(
      (entry) =>
        entry &&
        typeof entry === "object" &&
        /^[a-f0-9-]{36}$/i.test(entry.id) &&
        ["avatar", "thumbnail", "detail", "original"].includes(entry.variant) &&
        Object.keys(entry).every((key) => key === "id" || key === "variant"),
    )
  );
}
export function clearSignedMedia(id?: string) {
  for (const [key, value] of urls) if (!id || value.id === id) urls.delete(key);
}
export async function signMedia(
  owner: string,
  requests: MediaRequest[],
  rows: MediaRow[],
  sign: (
    path: string,
    transform?: (typeof variants)[keyof typeof variants],
  ) => Promise<string>,
): Promise<Signed[]> {
  for (const [key, value] of urls)
    if (value.url_expires_at <= Date.now()) urls.delete(key);
  if (urls.size > 512) urls.clear();
  return await Promise.all(
    requests.map(async (request) => {
      const row = rows.find((row) => row.id === request.id);
      if (!row)
        throw Object.assign(new Error("Media unavailable"), { code: "42501" });
      const key = `${owner}:${row.object_path}:${request.variant}`;
      const cached = urls.get(key);
      if (cached && cached.url_expires_at - Date.now() > 15000)
        return { ...cached, server_time: Date.now() };
      const expires = Date.now() + 60000;
      const url = await sign(
        String(row.object_path),
        request.variant === "original" ? undefined : variants[request.variant],
      );
      const value = { id: request.id, url, url_expires_at: expires };
      urls.set(key, value);
      return { ...value, server_time: Date.now() };
    }),
  );
}
