import { useCallback, useRef, useState } from "react";
import { useQuery as useCachedQuery } from "@tanstack/react-query";
import { errorMessage } from "./db";
import { mutationStarted, mutationFinished, requireOnline } from "./network";
import {
  createDataClient,
  queryEntity,
  staleTimeFor,
  useDataScope,
} from "./queryCache";

export function useQuery<T>(
  key: string,
  loader: () => Promise<T>,
  options: {
    enabled?: boolean;
    refetchInterval?:
      number | ((query: { state: { data: T | undefined } }) => number | false);
  } = {},
): { data?: T; error?: string; loading: boolean; refresh: () => void } {
  const load = useRef(loader);
  load.current = loader;
  const scope = useDataScope();
  const [isolated] = useState(createDataClient);
  const cache = scope?.client || isolated;
  const entity = queryEntity(key);
  const guarded = scope?.parent || key.startsWith("edit-latest:");
  const query = useCachedQuery(
    {
      queryKey: [scope?.id || "isolated", entity, key],
      queryFn: () => load.current(),
      staleTime: staleTimeFor(key),
      gcTime: scope ? (scope.parent ? 0 : 20 * 60_000) : 0,
      enabled: options.enabled,
      refetchOnMount: guarded ? "always" : true,
      refetchInterval:
        options.refetchInterval ?? (scope?.parent ? 45_000 : false),
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
    cache,
  );
  const refresh = useCallback(() => {
    void cache.invalidateQueries(
      { queryKey: [scope?.id || "isolated", entity, key], exact: true },
      { cancelRefetch: false },
    );
  }, [cache, scope?.id, entity, key]);
  return {
    data:
      query.isError || (guarded && query.isFetching) ? undefined : query.data,
    error: query.error ? errorMessage(query.error) : undefined,
    loading:
      options.enabled !== false &&
      (query.isPending || (!!guarded && query.isFetching)),
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
