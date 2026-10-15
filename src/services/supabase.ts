import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export function validatePublicKey(value: string): boolean {
  if (value.startsWith("sb_secret_")) return false;
  if (value.startsWith("sb_publishable_")) return true;
  try {
    const payload = JSON.parse(
      atob(value.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
    );
    return payload.role === "anon";
  } catch {
    return false;
  }
}

export const configurationError =
  !url || !key
    ? "Konfigurasi Supabase belum tersedia. Isi VITE_SUPABASE_URL dan VITE_SUPABASE_PUBLISHABLE_KEY."
    : !validatePublicKey(key) || !/^https?:\/\//.test(url)
      ? "Konfigurasi Supabase tidak valid. Frontend hanya boleh memakai publishable/anon key."
      : null;

export const supabase = configurationError
  ? null
  : createClient(url!, key!, {
      db: { retry: false, timeout: 15000 },
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });

export function client() {
  if (!supabase) throw new Error(configurationError!);
  return supabase;
}
