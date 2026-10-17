import { flushAllDrafts } from "./drafts";
import { hasPendingMutation } from "./network";

export async function applyPwaUpdate(
  registration: ServiceWorkerRegistration,
  reload = () => window.location.reload(),
) {
  if (hasPendingMutation())
    throw new Error(
      "Tunggu penyimpanan atau upload selesai sebelum memperbarui aplikasi.",
    );
  if (!flushAllDrafts())
    throw new Error(
      "Draft belum tersimpan. Periksa penyimpanan perangkat sebelum memperbarui aplikasi.",
    );
  const worker = registration.waiting;
  if (worker) {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        worker.removeEventListener("statechange", change);
        reject(new Error("Pembaruan belum siap. Coba lagi."));
      }, 15000);
      const change = () => {
        if (worker.state === "activated") {
          clearTimeout(timeout);
          worker.removeEventListener("statechange", change);
          resolve();
        } else if (worker.state === "redundant") {
          clearTimeout(timeout);
          worker.removeEventListener("statechange", change);
          reject(new Error("Pembaruan gagal. Coba lagi saat terhubung."));
        }
      };
      worker.addEventListener("statechange", change);
      worker.postMessage({ type: "LMS_ACTIVATE_UPDATE" });
    });
  }
  // Capture typing that happened during worker activation; another tab never
  // forces this tab to reload or interrupt a request in progress.
  if (hasPendingMutation() || !flushAllDrafts())
    throw new Error(
      "Selesaikan penyimpanan draft/transaksi lalu tekan Perbarui lagi.",
    );
  reload();
}

export function registerPwa(
  onUpdate: (registration: ServiceWorkerRegistration) => void,
  onError: () => void,
) {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return () => {};
  let stopped = false;
  let registration: ServiceWorkerRegistration | undefined;
  const check = () => {
    if (!stopped && navigator.onLine && document.visibilityState === "visible")
      void registration?.update().catch(() => {});
  };
  const controllerChange = () => {
    if (registration && !stopped) onUpdate(registration);
  };
  navigator.serviceWorker.addEventListener(
    "controllerchange",
    controllerChange,
  );
  navigator.serviceWorker
    .register("/sw.js", { scope: "/", updateViaCache: "none" })
    .then((result) => {
      if (stopped) return;
      registration = result;
      if (result.waiting) onUpdate(result);
      result.addEventListener("updatefound", () => {
        const installing = result.installing;
        installing?.addEventListener("statechange", () => {
          if (
            !stopped &&
            installing.state === "installed" &&
            navigator.serviceWorker.controller
          )
            onUpdate(result);
        });
      });
      check();
    })
    .catch(() => {
      if (!stopped) onError();
    });
  const timer = setInterval(check, 30 * 60 * 1000);
  window.addEventListener("online", check);
  document.addEventListener("visibilitychange", check);
  return () => {
    stopped = true;
    clearInterval(timer);
    window.removeEventListener("online", check);
    document.removeEventListener("visibilitychange", check);
    navigator.serviceWorker.removeEventListener(
      "controllerchange",
      controllerChange,
    );
  };
}
