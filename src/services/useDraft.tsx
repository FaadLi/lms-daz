import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { DraftStore, draftKey, type DraftOptions } from "./drafts";

const DraftUser = createContext<string | undefined>(undefined);
export function DraftProvider({
  userId,
  children,
}: {
  userId: string;
  children: ReactNode;
}) {
  return <DraftUser.Provider value={userId}>{children}</DraftUser.Provider>;
}
export function useDraft(
  options: Omit<DraftOptions, "userId"> & { enabled?: boolean },
) {
  const userId = useContext(DraftUser);
  const key = draftKey({
    ...options,
    userId: options.enabled === false ? undefined : userId,
  });
  // A form identity/schema/base change creates a fresh store; ordinary rerenders
  // retain its defaults and pending debounce without resetting typed values.
  const base = `${options.schema}:${options.baseVersion}:${options.baseUpdatedAt}`;
  const store = useMemo(
    () =>
      new DraftStore({
        ...options,
        userId: options.enabled === false ? undefined : userId,
      }),
    // Identity/base deliberately own store lifetime; defaults are a snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, base],
  );
  const state = useSyncExternalStore(
    store.subscribe,
    store.snapshot,
    store.snapshot,
  );
  useEffect(() => store.mount(), [store]);
  return {
    ...state,
    set: store.set,
    flush: store.flush,
    clear: store.clear,
    resolve: store.resolve,
  };
}
export type DraftHandle = ReturnType<typeof useDraft>;
