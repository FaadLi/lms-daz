import type { DraftHandle } from "../../services/useDraft";

export function DraftNotice({ draft }: { draft: DraftHandle }) {
  return (
    <div className="space-y-1 text-xs" aria-live="polite">
      {draft.conflict ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2 text-amber-900">
          <p>
            Data server sudah berubah sejak draft dibuat. Pilih input yang ingin
            digunakan sebelum menyimpan.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => draft.resolve(true)}
              className="font-semibold underline cursor-pointer"
            >
              Pertahankan input draft
            </button>
            <button
              type="button"
              onClick={() => draft.resolve(false)}
              className="font-semibold underline cursor-pointer"
            >
              Gunakan data terbaru
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3 text-slate-500">
          {draft.saved && (
            <span>
              {draft.restored ? "Draft dipulihkan · " : ""}Draft tersimpan
            </span>
          )}
          {(draft.saved || draft.restored) && (
            <button
              type="button"
              onClick={() => draft.clear()}
              className="underline cursor-pointer"
            >
              Buang draft
            </button>
          )}
        </div>
      )}
      {draft.error && (
        <p role="alert" className="text-amber-800">
          {draft.error}
        </p>
      )}
    </div>
  );
}
