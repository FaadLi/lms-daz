import { useState } from "react";
import type { Row } from "../../types";
import { db, edge, signedMedia, upload } from "../../services/db";
import { useMutation, useQuery } from "../../services/hooks";
import { useDraft } from "../../services/useDraft";
import { DraftNotice } from "../common/DraftNotice";
import { ErrorNotice, Pager, QueryState, text } from "../common/DataUI";
import {
  Camera,
  Upload,
  Trash2,
  Loader2,
  RefreshCw,
  Image as ImageIcon,
  CheckCircle2,
} from "lucide-react";

export function Avatar({ id, name }: { id?: string; name?: string }) {
  const query = useQuery(`avatar:${id}`, async () =>
    id ? (await signedMedia([await db.get("media_assets", id)]))[0] : null,
  );

  if (query.loading && id) {
    return (
      <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-400 animate-pulse">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (query.data) {
    return (
      <img
        className="w-16 h-16 sm:w-20 sm:h-20 object-cover rounded-2xl border-2 border-white shadow-md"
        alt={name ? `Foto ${name}` : "Avatar"}
        src={text(query.data, "url")}
      />
    );
  }

  const initials = (name || "U")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-700 text-white font-bold text-lg sm:text-xl flex items-center justify-center border-2 border-white shadow-md">
      {initials}
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
  const [page, setPage] = useState(0);
  const draft = useDraft({ form: `media-caption/${kind}/${target.id}`, schema: "caption-v1", defaults: { caption: "" }, enabled: kind === "photo" });
  const caption = String(draft.values.caption);
  const [notice, setNotice] = useState("");
  const mutation = useMutation();

  const query = useQuery(`media:${target.id}:${page}`, async () => {
    if (kind !== "photo") return { items: [], total: 0 };
    const result = await db.list("media_assets", {
      reportId: target.id,
      page,
    });
    return { ...result, items: await signedMedia(result.items) };
  });

  const refresh = () => {
    query.refresh();
    onChanged();
  };

  return (
    <section className="bg-white border border-slate-200/80 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
            <Camera className="w-4 h-4" />
          </div>
          <h3 className="text-sm font-bold text-slate-900">
            {kind === "photo" ? "Foto Dokumentasi Belajar" : "Foto Profil"}
          </h3>
        </div>
        {kind === "photo" && (
          <button
            type="button"
            onClick={query.refresh}
            className="text-xs font-medium text-slate-500 hover:text-indigo-600 flex items-center gap-1 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Perbarui URL
          </button>
        )}
      </div>

      {kind === "photo" && (
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Keterangan Foto (opsional)
          </label>
          <input
            aria-label="Caption foto"
            value={caption}
            placeholder="Contoh: Belajar berhitung dengan balok angka…"
            onChange={(e) => draft.set({ caption: e.target.value })}
            maxLength={500}
            className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs text-slate-900 bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500 transition-colors shadow-2xs"
          />
        </div>
      )}

      {/* Upload button box */}
      {kind === "photo" && <DraftNotice draft={draft} />}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <label className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl transition-colors cursor-pointer shadow-2xs">
          <Upload className="w-4 h-4" />
          <span>
            {mutation.pending ? "Mengunggah…" : "Pilih & Unggah Foto"}
          </span>
          <input
            type="file"
            className="hidden"
            accept="image/jpeg,image/png,image/webp"
            disabled={mutation.pending}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file)
                void mutation.run(async () => {
                  const result = await upload(file, kind, target, caption);
                  setNotice(
                    result.cleanupPending
                      ? "Foto tersimpan. Pembersihan file lama dijadwalkan."
                      : "Foto berhasil diunggah!",
                  );
                  draft.clear();
                  refresh();
                });
              e.target.value = "";
            }}
          />
        </label>
        <span className="text-2xs text-slate-400">
          Format: JPG, PNG, WebP (maksimal 5 MB)
        </span>
      </div>

      {kind !== "photo" && target.avatar_id != null && (
        <div className="flex items-center gap-4 pt-2">
          <Avatar id={String(target.avatar_id)} />
          <button
            type="button"
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
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Hapus Foto
          </button>
        </div>
      )}

      <ErrorNotice message={mutation.error} />

      {notice && (
        <div
          role="status"
          className="flex items-center gap-2 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-2.5"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {kind === "photo" && (
        <QueryState query={query}>
          {query.data?.items.length === 0 ? (
            <div className="text-center py-6 border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
              <ImageIcon className="w-8 h-8 text-slate-300 mx-auto mb-1.5" />
              <p className="text-xs text-slate-500">
                Belum ada foto dokumentasi untuk laporan ini.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {query.data?.items.map((row) => (
                <article
                  key={row.id}
                  className="group relative bg-slate-50 border border-slate-200 rounded-xl overflow-hidden shadow-2xs"
                >
                  <img
                    src={text(row, "url")}
                    alt={text(row, "caption") || "Dokumentasi belajar"}
                    className="w-full h-44 object-cover"
                  />
                  <div className="p-2.5">
                    <p className="text-xs text-slate-700 font-medium line-clamp-2">
                      {text(row, "caption") || "Tanpa keterangan"}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={mutation.pending}
                    onClick={() =>
                      void mutation.run(async () => {
                        await edge(
                          { action: "delete-media", assetId: row.id },
                          true,
                        );
                        refresh();
                      })
                    }
                    className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 hover:bg-rose-600 text-white transition-colors cursor-pointer"
                    title="Hapus foto"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </article>
              ))}
            </div>
          )}
        </QueryState>
      )}

      {kind === "photo" && (
        <Pager page={page} total={query.data?.total || 0} onPage={setPage} />
      )}
    </section>
  );
}
