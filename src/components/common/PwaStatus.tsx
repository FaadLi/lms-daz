import { useEffect, useState } from "react";
import { applyPwaUpdate, registerPwa } from "../../services/pwa";
interface InstallEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
export function PwaStatus() {
  const [offline, setOffline] = useState(!navigator.onLine);
  const [install, setInstall] = useState<InstallEvent>();
  const [update, setUpdate] = useState<ServiceWorkerRegistration>();
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const connection = () => setOffline(!navigator.onLine);
    const offer = (event: Event) => {
      event.preventDefault();
      setInstall(event as InstallEvent);
    };
    const installed = () => setInstall(undefined);
    window.addEventListener("online", connection);
    window.addEventListener("offline", connection);
    window.addEventListener("beforeinstallprompt", offer);
    window.addEventListener("appinstalled", installed);
    const stop = registerPwa(setUpdate, () =>
      setError("PWA belum dapat diaktifkan. Coba muat ulang saat terhubung."),
    );
    return () => {
      stop();
      window.removeEventListener("online", connection);
      window.removeEventListener("offline", connection);
      window.removeEventListener("beforeinstallprompt", offer);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);
  if (!offline && !install && !update && !error) return null;
  return (
    <aside
      aria-label="Status aplikasi"
      className="fixed z-[60] bottom-24 md:bottom-4 left-3 right-3 mx-auto max-w-xl rounded-xl border border-indigo-200 bg-white p-3 shadow-lg text-xs space-y-2"
      aria-live="polite"
    >
      {offline && (
        <p className="text-amber-800">
          Offline · Penyimpanan ke Supabase tidak tersedia. Draft form yang
          didukung tetap tersimpan lokal.
        </p>
      )}
      {error && (
        <p role="alert" className="text-amber-800">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        {update && (
          <>
            <span>Versi baru tersedia.</span>
            <button
              type="button"
              disabled={updating}
              className="font-semibold text-indigo-700 underline cursor-pointer disabled:opacity-50"
              onClick={async () => {
                setUpdating(true);
                setError("");
                try {
                  await applyPwaUpdate(update);
                } catch (cause) {
                  setError(
                    cause instanceof Error ? cause.message : "Pembaruan gagal.",
                  );
                } finally {
                  setUpdating(false);
                }
              }}
            >
              {updating ? "Menyimpan draft..." : "Perbarui aplikasi"}
            </button>
          </>
        )}
        {install && (
          <button
            type="button"
            className="font-semibold text-indigo-700 underline cursor-pointer"
            onClick={async () => {
              const offer = install;
              setInstall(undefined);
              try {
                await offer.prompt();
                await offer.userChoice;
              } catch {
                setError(
                  "Pemasangan belum selesai. Gunakan menu instal aplikasi pada browser.",
                );
              }
            }}
          >
            Pasang aplikasi
          </button>
        )}
      </div>
    </aside>
  );
}
