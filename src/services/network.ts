let mutations = 0;
export const hasPendingMutation = () => mutations > 0;
export function mutationStarted() {
  mutations++;
  window.dispatchEvent(new Event("lms:mutation"));
}
export function mutationFinished() {
  mutations--;
  window.dispatchEvent(new Event("lms:mutation"));
}
export function requireOnline() {
  if (typeof navigator !== "undefined" && navigator.onLine === false)
    throw new Error(
      "Sedang offline. Permintaan belum dikirim ke Supabase. Hubungkan internet lalu coba lagi.",
    );
}
