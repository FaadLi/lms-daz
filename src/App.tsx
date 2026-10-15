import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { client, configurationError, supabase } from "./services/supabase";
import { errorMessage } from "./services/db";
import { LoginView } from "./components/auth/LoginView";
import { AdminWorkspace } from "./components/admin/AdminWorkspace";
import { ParentPortal } from "./components/parent/ParentPortal";
import { ErrorNotice } from "./components/common/DataUI";

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
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, next) => {
      const request = ++generation;
      if (!active) return;
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
      <main className="p-6" role="status">
        Memverifikasi session…
      </main>
    );
  if (error)
    return (
      <main className="p-6">
        <ErrorNotice message={error} />
        <button onClick={() => window.location.reload()}>Coba lagi</button>
      </main>
    );
  if (!session) return <LoginView />;
  return (
    <AdminWorkspace
      key={session.user.id}
      user={session.user}
      path={current.hash}
    />
  );
}
