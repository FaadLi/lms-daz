import { client } from './supabase';
import { call } from './db';
import { writePushBinding } from './pushBinding';
import { clearPushNotifications } from './pushWorker';

let owner: string | undefined;
let generation = 0;
export function pushSupport(): string | undefined {
  if (!window.isSecureContext || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window))
    return 'Browser ini belum mendukung notifikasi push. Notification Center tetap tersedia.';
  const appleMobile = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform==='MacIntel' && navigator.maxTouchPoints>1);
  if (appleMobile && !window.matchMedia('(display-mode: standalone)').matches && !(navigator as Navigator & {standalone?:boolean}).standalone)
    return 'Di iPhone/iPad, gunakan iOS 16.4+ lalu tambahkan aplikasi ke Layar Utama dan buka dari sana.';
}
export function resetPushSession(userId?: string, unsubscribe = true) {
  owner = userId;
  generation++;
  void writePushBinding().catch(() => {});
  const current = generation;
  if ('serviceWorker' in navigator)
    void navigator.serviceWorker.getRegistration('/').then(async registration => {
      if (!registration) return;
      await clearPushNotifications(registration);
      if (!userId && unsubscribe && generation===current) await (await registration.pushManager.getSubscription())?.unsubscribe();
    }).catch(() => {});
}
async function registration() {
  const registration = await navigator.serviceWorker.getRegistration('/');
  if (!registration?.active) throw new Error('Service worker belum siap. Buka aplikasi PWA saat terhubung, lalu coba lagi.');
  return registration;
}
export async function syncPushDevice(userId: string): Promise<boolean> {
  const current = generation;
  if (pushSupport() || owner!==userId) return false;
  const device = await registration();
  const subscription = await device.pushManager.getSubscription();
  if (!subscription) return false;
  const id = await call<string | null>('lms_get_push_subscription',{p_endpoint:subscription.endpoint});
  if (generation!==current || owner!==userId) return false;
  if (!id || Notification.permission!=='granted') {
    await writePushBinding();
    // A different account never adopts the previous account's endpoint.
    await subscription.unsubscribe();
    return false;
  }
  await writePushBinding(id);
  return true;
}
function applicationKey(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(value.length/4)*4,'='));
  return Uint8Array.from(binary,character => character.charCodeAt(0));
}
export async function enablePush(userId: string) {
  const unsupported = pushSupport();
  if (unsupported) throw new Error(unsupported);
  const key = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
  if (!key || !/^[A-Za-z0-9_-]{87}$/.test(key)) throw new Error('Notifikasi push belum dikonfigurasi oleh pengelola.');
  const current = generation;
  // Must happen directly from the click, before any awaited network/SW work.
  const permission = await Notification.requestPermission();
  if (permission!=='granted') throw new Error('Izin notifikasi belum diberikan. Ubah izin situs di pengaturan browser untuk mengaktifkannya.');
  if (owner!==userId || generation!==current) throw new Error('Session berubah. Coba lagi.');
  const device = await registration();
  let subscription = await device.pushManager.getSubscription();
  if (subscription) {
    const id = await call<string | null>('lms_get_push_subscription',{p_endpoint:subscription.endpoint});
    if (!id) { await subscription.unsubscribe(); subscription=null; }
  }
  subscription ??= await device.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:applicationKey(key)});
  try {
    const data = subscription.toJSON();
    const id = await call<string>('lms_save_push_subscription',{
      p_endpoint:subscription.endpoint,p_p256dh:data.keys?.p256dh,p_auth:data.keys?.auth,
    });
    if (owner!==userId || generation!==current) {
      await subscription.unsubscribe();
      throw new Error('Session berubah. Aktifkan notifikasi pada akun saat ini.');
    }
    await writePushBinding(id);
  } catch (error) {
    await subscription.unsubscribe().catch(() => false);
    throw error;
  }
}
export async function disablePush() {
  await writePushBinding().catch(() => {});
  if (!('serviceWorker' in navigator)) return;
  const device = await navigator.serviceWorker.getRegistration('/');
  if (!device) return;
  await clearPushNotifications(device);
  const subscription = await device.pushManager.getSubscription();
  if (!subscription) return;
  try { await call('lms_remove_push_subscription',{p_endpoint:subscription.endpoint}); }
  finally { await subscription.unsubscribe(); }
}
export async function signOutWithPush() {
  resetPushSession(undefined,false);
  // An offline/expired-session cleanup must not trap the user in their account.
  // Local binding is removed first; unsubscribed endpoints are removed on 410.
  await disablePush().catch(() => {});
  const {error} = await client().auth.signOut();
  if (error) throw error;
}
