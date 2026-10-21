import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { QueryClient } from "@tanstack/react-query";
import { clearAllMedia, clearMediaScope } from "./mediaCache";

export function createDataClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 20 * 60_000, networkMode: "always" },
      mutations: { retry: false },
    },
  });
}
type Scope = {
  id: string;
  mediaScope: string;
  parent: boolean;
  client: QueryClient;
};
const CacheContext = createContext<Scope | null>(null);
const active = new Set<Scope>();
export function DataCacheProvider({
  scope,
  parent = false,
  children,
}: {
  scope: string;
  parent?: boolean;
  children: ReactNode;
}) {
  return (
    <ScopeCache key={scope} scope={scope} parent={parent}>
      {children}
    </ScopeCache>
  );
}
function ScopeCache({
  scope,
  parent,
  children,
}: {
  scope: string;
  parent: boolean;
  children: ReactNode;
}) {
  const [state] = useState<Scope>(() => ({
    id: scope,
    mediaScope: `${scope}:${crypto.randomUUID()}`,
    parent,
    client: createDataClient(),
  }));
  useEffect(() => {
    state.client.mount();
    active.add(state);
    return () => {
      active.delete(state);
      state.client.unmount();
      state.client.clear();
      clearMediaScope(state.mediaScope);
    };
  }, [state]);
  return (
    <CacheContext.Provider value={state}>{children}</CacheContext.Provider>
  );
}
export const useDataScope = () => useContext(CacheContext);
export function queryEntity(key: string): string {
  const part = key.split(":")[0];
  if (part === "dashboard" && key.includes(":")) return key.split(":")[1];
  if (part === "edit-latest") return key.split(":")[1].split("/")[0];
  return (
    (
      {
        profile: "profiles",
        child: "children",
        templates: "report_templates",
        "schedule-subjects": "subjects",
        "draft-subjects": "subjects",
        "report-selected-subjects": "subjects",
        "report-active-subjects": "subjects",
        "report-schedule": "schedules",
        progress: "lesson_reports",
        "report-media": "lesson_reports",
        avatar: "media_urls",
        image: "media_urls",
        media: "media_assets",
        link: "report_links",
        transactions: "payment_transactions",
      } as Record<string, string>
    )[part] || part
  );
}
export function staleTimeFor(key: string): number {
  if (key.startsWith("edit-latest:") || key.startsWith("parent:")) return 0;
  if (key.startsWith("dashboard:")) return 60_000;
  return (
    (
      {
        subjects: 900_000,
        report_templates: 600_000,
        profiles: 300_000,
        children: 180_000,
        schedules: 60_000,
        attendance: 60_000,
        lesson_reports: 60_000,
        dashboard: 60_000,
        media_assets: 60_000,
        media_urls: 0,
        invoices: 0,
        payment_transactions: 0,
        comments: 0,
        notifications: 0,
        report_links: 0,
      } as Record<string, number>
    )[queryEntity(key)] ?? 0
  );
}
export async function invalidateData(entities: string[]) {
  for (const scope of active) {
    if (scope.parent) continue;
    const predicate = (query: { queryKey: readonly unknown[] }) =>
      query.queryKey[0] === scope.id &&
      entities.includes(String(query.queryKey[1]));
    await scope.client.cancelQueries({ predicate });
    // Start before the caller's existing refresh; cancelRefetch:false deduplicates both.
    void scope.client.invalidateQueries(
      { predicate },
      { cancelRefetch: false },
    );
  }
}
export function clearPrivateData() {
  for (const scope of active) {
    scope.client.clear();
    clearMediaScope(scope.mediaScope);
  }
  clearAllMedia();
}
