/// <reference lib="webworker" />
import { readPushBinding } from './pushBinding';
import { commentPush,commentRoute,notificationBody,notificationTitle } from '../utils/pushProtocol';

export async function receivePush(scope: ServiceWorkerGlobalScope, value: unknown) {
  const data = commentPush(value);
  if (!data || await readPushBinding()!==data.subscriptionId) return;
  const clients = await scope.clients.matchAll({type:'window',includeUncontrolled:true});
  const foreground = clients.some(client => (client as WindowClient).visibilityState==='visible' && (client as WindowClient).focused);
  // Always display a user-visible notification (also required by Safari).
  // Stable tag + renotify:false coalesce uncertain-delivery retries.
  const options: NotificationOptions & {renotify:boolean} = {
    body:notificationBody,icon:'/icons/pwa-192.png',badge:'/icons/pwa-192.png',
    tag:`lms-comment-${data.subscriptionId}-${data.notificationId}`,renotify:false,
    silent:foreground,data,
  };
  await scope.registration.showNotification(notificationTitle,options);
  for (const client of clients) client.postMessage({type:'LMS_COMMENT_PUSH',payload:data});
}

export async function clickPush(scope: ServiceWorkerGlobalScope, notification: Notification) {
  notification.close();
  const data = commentPush(notification.data);
  if (!data || await readPushBinding()!==data.subscriptionId) return;
  const target = new URL(commentRoute(data.childId,data.notificationId),scope.location.origin);
  const clients = await scope.clients.matchAll({type:'window',includeUncontrolled:true});
  const existing = clients.find(client => {
    const url = new URL(client.url);
    return url.origin===target.origin && !url.searchParams.has('token') && !url.hash.match(/^#\/(report|preview)\//);
  }) as WindowClient | undefined;
  if (existing) { existing.postMessage({type:'LMS_OPEN_COMMENT',payload:data}); await existing.focus(); }
  else await scope.clients.openWindow(target.href);
}

export async function clearPushNotifications(registration: ServiceWorkerRegistration) {
  const notifications = await registration.getNotifications();
  for (const notification of notifications)
    if (notification.tag.startsWith('lms-comment-')) notification.close();
}
