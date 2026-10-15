import { useState } from "react";
import type { Row } from "../../types";
import { db, edge, signedMedia, upload } from "../../services/db";
import { useMutation, useQuery } from "../../services/hooks";
import { ErrorNotice, Pager, QueryState, text } from "../common/DataUI";

export function Avatar({ id }: { id?: string }) {
  const query = useQuery(`avatar:${id}`, async () =>
    id ? (await signedMedia([await db.get("media_assets", id)]))[0] : null,
  );
  return (
    <div>
      <ErrorNotice message={query.error} />
      {query.data && (
        <img
          className="w-20 h-20 object-cover rounded-2xl"
          alt="Avatar"
          src={text(query.data, "url")}
        />
      )}
    </div>
  );
}
export function MediaManager({
  target,
  kind,
  onChanged,
}: {
  target: Row;
  kind: "profile" | "avatar" | "photo";
  onChanged: () => void;
}) {
  const [page, setPage] = useState(0),
    [caption, setCaption] = useState("");
  const [notice, setNotice] = useState("");
  const mutation = useMutation();
  const query = useQuery(`media:${target.id}:${page}`, async () => {
    if (kind !== "photo") return { items: [], total: 0 };
    const result = await db.list("media_assets", { reportId: target.id, page });
    return { ...result, items: await signedMedia(result.items) };
  });
  const refresh = () => {
    query.refresh();
    onChanged();
  };
  return (
    <section className="border rounded-xl p-3 space-y-3">
      <h3 className="font-bold">
        {kind === "photo" ? "Foto laporan" : "Avatar"}
      </h3>
      {kind === "photo" && (
        <input
          aria-label="Caption foto"
          value={caption}
          placeholder="Caption foto"
          onChange={(e) => setCaption(e.target.value)}
          maxLength={500}
        />
      )}
      <label>
        Unggah JPG, PNG, WebP (maks. 5 MB)
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={mutation.pending}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file)
              void mutation.run(async () => {
                const result = await upload(file, kind, target, caption);
                setNotice(
                  result.cleanupPending
                    ? "Upload tersimpan. Pembersihan file lama belum selesai; gunakan Bersihkan Upload."
                    : "Upload tersimpan.",
                );
                refresh();
              });
            e.target.value = "";
          }}
        />
      </label>
      {kind !== "photo" && target.avatar_id != null && (
        <>
          <Avatar id={String(target.avatar_id)} />
          <button
            disabled={mutation.pending}
            onClick={() =>
              void mutation.run(async () => {
                await edge(
                  {
                    action: "delete-media",
                    assetId: target.avatar_id,
                    version: target.version,
                  },
                  true,
                );
                refresh();
              })
            }
          >
            Hapus avatar
          </button>
        </>
      )}
      <ErrorNotice message={mutation.error} />
      {notice && <p role="status">{notice}</p>}
      <QueryState query={query}>
        {query.data?.items.map((row) => (
          <article key={row.id}>
            <img
              src={text(row, "url")}
              alt={text(row, "caption") || "Dokumentasi belajar"}
              className="max-h-60 rounded-xl"
            />
            <p>{text(row, "caption")}</p>
            <button
              disabled={mutation.pending}
              onClick={() =>
                void mutation.run(async () => {
                  await edge({ action: "delete-media", assetId: row.id }, true);
                  refresh();
                })
              }
            >
              Hapus foto
            </button>
          </article>
        ))}
      </QueryState>
      {kind === "photo" && (
        <Pager page={page} total={query.data?.total || 0} onPage={setPage} />
      )}
      <button onClick={query.refresh}>Perbarui akses foto</button>
    </section>
  );
}
