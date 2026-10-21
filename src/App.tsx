import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { client, configurationError, supabase } from "./services/supabase";
import { errorMessage } from "./services/db";
import { LoginView } from "./components/auth/LoginView";
import { AdminWorkspace } from "./components/admin/AdminWorkspace";
import { ParentPortal } from "./components/parent/ParentPortal";
import { ErrorNotice } from "./components/common/DataUI";
import { DraftProvider } from "./services/useDraft";
import { DataCacheProvider, clearPrivateData } from './services/queryCache';

function route() {
  const hash = window.location.hash.slice(1) || "/dashboard";
  const match = hash.match(/^\/(?:report|preview)\/([A-Za-z0-9_-]+)$/);
  return {
    hash,
    token:
      match?.[1] ||
      new URLSearchParams(window.location.search).get("token") ||
      "",
  };
}
export default function App() {
  const [current, setCurrent] = useState(route),
    [session, setSession] = useState<Session | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  useEffect(() => {
    const change = () => setCurrent(route());
    window.addEventListener("hashchange", change);
    window.addEventListener("popstate", change);
    return () => {
      window.removeEventListener("hashchange", change);
      window.removeEventListener("popstate", change);
    };
  }, []);
  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    let active = true;
    let generation = 0;
    let cacheUser: string | undefined;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, next) => {
      const request = ++generation;
      if (!active) return;
      if (cacheUser !== next?.user.id) { clearPrivateData(); cacheUser = next?.user.id; }
      setError("");
      if (!next) {
        setSession(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      // Leave the Auth callback before requesting verification to avoid its lock.
      queueMicrotask(() => {
        client()
          .auth.getUser()
          .then(({ data, error }) => {
            if (!active || request !== generation) return;
            if (error) throw error;
            if (data.user?.id !== next.user.id)
              throw new Error("Session berubah. Masuk kembali.");
            setSession(next);
            setLoading(false);
          })
          .catch((error) => {
            if (active && request === generation) {
              setError(errorMessage(error));
              setSession(null);
              setLoading(false);
            }
          });
      });
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);
  if (configurationError)
    return (
      <main className="p-6">
        <ErrorNotice message={configurationError} />
      </main>
    );
  if (current.token)
    return <ParentPortal key={current.token} token={current.token} />;
  if (loading)
    return (
      <main
        className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-slate-500"
        role="status"
      >
        <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 mb-3 animate-pulse">
          <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>
        <p className="text-sm font-semibold text-slate-700">
          Memverifikasi sesi Les Report…
        </p>
      </main>
    );
  if (error)
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white border border-slate-200 rounded-3xl p-6 max-w-sm w-full text-center space-y-4 shadow-xl">
          <ErrorNotice message={error} />
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="w-full px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors cursor-pointer"
          >
            Muat Ulang Halaman
          </button>
        </div>
      </main>
    );
  if (!session) return <LoginView />;
  return (
    <DataCacheProvider key={session.user.id} scope={session.user.id}>
    <DraftProvider userId={session.user.id}>
      <AdminWorkspace
        key={session.user.id}
        user={session.user}
        path={current.hash}
      />
    </DraftProvider>
    </DataCacheProvider>
  );
}
