export type MediaVariant = "avatar" | "thumbnail" | "detail" | "original";
export interface MediaRequest {
  id: string;
  variant: MediaVariant;
}
export interface SignedAsset {
  id: string;
  url: string;
  url_expires_at: number;
  server_time?: number;
  width?: number;
  height?: number;
}
export type MediaLoader = (requests: MediaRequest[]) => Promise<SignedAsset[]>;
type Entry = {
  value?: SignedAsset;
  promise?: Promise<SignedAsset>;
  resolve?: (value: SignedAsset) => void;
  reject?: (error: unknown) => void;
};
type Bucket = {
  entries: Map<string, Entry>;
  queue: Map<string, MediaRequest>;
  scheduled: boolean;
  valid: boolean;
};
const scopes = new Map<string, Bucket>();
export function clearAllMedia() {
  for (const scope of [...scopes.keys()]) clearMediaScope(scope);
}
const key = (request: MediaRequest) => `${request.id}:${request.variant}`;
export function clearMediaScope(scope: string) {
  const bucket = scopes.get(scope);
  if (bucket) {
    bucket.valid = false;
    for (const entry of bucket.entries.values())
      entry.reject?.(new Error("Session berubah."));
  }
  scopes.delete(scope);
}
export function invalidateMedia(scope?: string, id?: string) {
  for (const [name, bucket] of scopes) {
    if (scope && name !== scope) continue;
    for (const [entryKey, entry] of bucket.entries)
      if (!id || entryKey.startsWith(`${id}:`)) {
        entry.reject?.(new Error("Foto berubah."));
        bucket.entries.delete(entryKey);
        bucket.queue.delete(entryKey);
      }
  }
}
export function mediaUrls(
  scope: string,
  requests: MediaRequest[],
  loader: MediaLoader,
): Promise<SignedAsset[]> {
  let bucket = scopes.get(scope);
  if (!bucket) {
    bucket = {
      entries: new Map(),
      queue: new Map(),
      scheduled: false,
      valid: true,
    };
    scopes.set(scope, bucket);
  }
  const target = bucket;
  for (const [entryKey, entry] of target.entries)
    if (entry.value && entry.value.url_expires_at <= Date.now())
      target.entries.delete(entryKey);
  if (target.entries.size > 512)
    for (const [entryKey, entry] of target.entries) {
      if (entry.value) target.entries.delete(entryKey);
      if (target.entries.size <= 256) break;
    }
  const results = requests.map((request) => {
    const entryKey = key(request);
    const prior = target.entries.get(entryKey);
    if (prior?.value && prior.value.url_expires_at - Date.now() > 15_000)
      return Promise.resolve(prior.value);
    if (prior?.promise) return prior.promise;
    const entry: Entry = {};
    entry.promise = new Promise<SignedAsset>((resolve, reject) => {
      entry.resolve = resolve;
      entry.reject = reject;
    });
    target.entries.set(entryKey, entry);
    target.queue.set(entryKey, request);
    return entry.promise;
  });
  if (!target.scheduled && target.queue.size) {
    target.scheduled = true;
    // Coalesce all avatars/photos mounted in the same turn into bounded requests.
    queueMicrotask(async () => {
      const pending = [...target.queue.entries()];
      target.queue.clear();
      target.scheduled = false;
      for (let offset = 0; offset < pending.length; offset += 20) {
        const batch = pending.slice(offset, offset + 20);
        const entries = batch.map(([entryKey]) => target.entries.get(entryKey));
        try {
          const started = Date.now();
          const values = await loader(batch.map(([, request]) => request));
          batch.forEach(([entryKey, request], index) => {
            const entry = entries[index];
            if (
              !entry ||
              !target.valid ||
              target.entries.get(entryKey) !== entry
            )
              return;
            let value = values[index];
            // Use remaining server TTL, never the client's clock offset. Starting
            // before the request conservatively subtracts the whole round trip.
            if (value && Number.isFinite(value.server_time))
              value = {
                ...value,
                url_expires_at:
                  started +
                  Math.min(
                    60000,
                    Math.max(0, value.url_expires_at - value.server_time!),
                  ) -
                  1000,
              };
            if (
              !value ||
              value.id !== request.id ||
              value.url_expires_at <= Date.now()
            )
              throw new Error("Foto tidak dapat diakses.");
            entry.resolve?.(value);
            target.entries.set(entryKey, { value });
          });
        } catch (error) {
          batch.forEach(([entryKey], index) => {
            entries[index]?.reject?.(error);
            if (target.entries.get(entryKey) === entries[index])
              target.entries.delete(entryKey);
          });
        }
      }
    });
  }
  return Promise.all(results);
}
