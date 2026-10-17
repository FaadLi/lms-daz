import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "./db";
import { mutationStarted, mutationFinished, requireOnline } from "./network";

export function useQuery<T>(
  key: string,
  loader: () => Promise<T>,
): { data?: T; error?: string; loading: boolean; refresh: () => void } {
  const load = useRef(loader);
  load.current = loader;
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{
    key: string;
    data?: T;
    error?: string;
    loading: boolean;
  }>({ key, loading: true });
  useEffect(() => {
    let active = true;
    setState({ key, loading: true });
    load
      .current()
      .then((data) => {
        if (active) setState({ key, data, loading: false });
      })
      .catch((error) => {
        if (active)
          setState({ key, error: errorMessage(error), loading: false });
      });
    return () => {
      active = false;
    };
  }, [key, revision]);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  return {
    ...(state.key === key
      ? state
      : { loading: true, data: undefined, error: undefined }),
    refresh,
  };
}

export function useMutation() {
  const lock = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const run = async (action: () => Promise<unknown>) => {
    if (lock.current) return false;
    lock.current = true;
    setPending(true);
    setError("");
    mutationStarted();
    try {
      requireOnline();
      await action();
      return true;
    } catch (error) {
      setError(errorMessage(error));
      return false;
    } finally {
      mutationFinished();
      lock.current = false;
      setPending(false);
    }
  };
  return { pending, error, run };
}
