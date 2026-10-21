/// <reference lib="webworker" />
import { setCacheNameDetails } from "workbox-core";
import {
  precache,
  matchPrecache,
  cleanupOutdatedCaches,
} from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { mayServeShell, mayServeStatic } from "./utils/pwaPolicy";
import { clickPush, receivePush } from './services/pushWorker';
import { writePushBinding } from './services/pushBinding';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: { url: string; revision: string | null }[];
};
setCacheNameDetails({ prefix: "lms-shell", suffix: "v1" });
precache(self.__WB_MANIFEST);
cleanupOutdatedCaches();
// Only build-time public files are cached. Everything else falls through to
// network, including all Supabase/Auth/Storage/Edge requests and signed URLs.
registerRoute(
  ({ request, url }) => mayServeStatic(request, url, self.location.origin),
  async ({ request }) => (await matchPrecache(request.url)) || fetch(request),
);
registerRoute(
  ({ request, url }) => mayServeShell(request, url, self.location.origin),
  async () => (await matchPrecache("/index.html")) || Response.error(),
);
self.addEventListener("message", (event) => {
  if (event.data?.type === "LMS_ACTIVATE_UPDATE") void self.skipWaiting();
});
self.addEventListener('push', event => {
  let data: unknown;
  try { data = event.data?.json(); } catch { return; }
  event.waitUntil(receivePush(self,data).catch(() => {}));
});
self.addEventListener('notificationclick', event => {
  event.waitUntil(clickPush(self,event.notification).catch(() => {}));
});
self.addEventListener('pushsubscriptionchange', event => {
  (event as ExtendableEvent).waitUntil((async () => {
    await writePushBinding();
    for (const client of await self.clients.matchAll({type:'window'})) client.postMessage({type:'LMS_PUSH_EXPIRED'});
  })().catch(() => {}));
});
// No automatic skipWaiting or clientsClaim: an update requires an explicit,
// draft-flushing reload in each tab. No background sync or request replay.
