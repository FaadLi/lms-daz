// @vitest-environment jsdom
import { beforeEach,afterEach,describe,expect,it,vi } from 'vitest';
import { disablePush,enablePush,resetPushSession,signOutWithPush,syncPushDevice } from '../src/services/push';
import { writePushBinding } from '../src/services/pushBinding';
import { call } from '../src/services/db';
const state=vi.hoisted(()=>({signOut:vi.fn(async()=>({error:null}))}));
vi.mock('../src/services/db',()=>({call:vi.fn()}));
vi.mock('../src/services/supabase',()=>({client:()=>({auth:{signOut:state.signOut}})}));
vi.mock('../src/services/pushBinding',()=>({writePushBinding:vi.fn(async()=>{})}));
vi.mock('../src/services/pushWorker',()=>({clearPushNotifications:vi.fn(async()=>{})}));
const subscription={endpoint:'https://fcm.googleapis.com/fcm/send/test',toJSON:()=>({keys:{p256dh:'B'.repeat(87),auth:'A'.repeat(22)}}),unsubscribe:vi.fn(async()=>true)};
const device={active:{},pushManager:{getSubscription:vi.fn(async()=>null as typeof subscription|null),subscribe:vi.fn(async()=>subscription)}};
let permission:ReturnType<typeof vi.fn>;
beforeEach(async()=>{
  vi.stubEnv('VITE_VAPID_PUBLIC_KEY','B'.repeat(87));
  vi.stubGlobal('PushManager',function(){});
  permission=vi.fn(async()=>'granted');
  vi.stubGlobal('Notification',{permission:'granted',requestPermission:permission});
  Object.defineProperty(window,'isSecureContext',{configurable:true,value:true});
  Object.defineProperty(navigator,'serviceWorker',{configurable:true,value:{getRegistration:vi.fn(async()=>device)}});
  device.pushManager.getSubscription.mockResolvedValue(null);
  vi.mocked(call).mockResolvedValue('33333333-3333-4333-8333-333333333333');
  resetPushSession('A');await Promise.resolve();
});
afterEach(()=>{vi.clearAllMocks();vi.unstubAllEnvs();vi.unstubAllGlobals();});
describe('per-device authenticated push lifecycle',()=>{
  it('does not request permission on load and requests it synchronously from explicit enable',async()=>{
    expect(await syncPushDevice('A')).toBe(false);expect(permission).not.toHaveBeenCalled();
    const enable=enablePush('A');expect(permission).toHaveBeenCalledOnce();await enable;
    expect(call).toHaveBeenCalledWith('lms_save_push_subscription',{p_endpoint:subscription.endpoint,p_p256dh:'B'.repeat(87),p_auth:'A'.repeat(22)});
    expect(writePushBinding).toHaveBeenCalledWith('33333333-3333-4333-8333-333333333333');
  });
  it('a permission denial creates no subscription and no backend mutation',async()=>{
    permission.mockResolvedValue('denied');
    await expect(enablePush('A')).rejects.toThrow('Izin notifikasi belum diberikan');
    expect(device.pushManager.subscribe).not.toHaveBeenCalled();expect(call).not.toHaveBeenCalled();
  });
  it('disables locally even if backend cleanup fails, and does not block logout',async()=>{
    device.pushManager.getSubscription.mockResolvedValue(subscription);
    vi.mocked(call).mockRejectedValue(new Error('offline'));
    await expect(disablePush()).rejects.toThrow('offline');expect(subscription.unsubscribe).toHaveBeenCalledOnce();
    await signOutWithPush();expect(state.signOut).toHaveBeenCalledOnce();
    expect(writePushBinding).toHaveBeenCalledWith();
  });
  it('cannot bind a late enable response to a different account',async()=>{
    let finish!:(id:string)=>void;
    const pending=new Promise<string>(resolve=>{finish=resolve;});
    vi.mocked(call).mockReturnValue(pending);
    const enable=enablePush('A');
    await vi.waitFor(()=>expect(call).toHaveBeenCalledWith('lms_save_push_subscription',expect.anything()));
    resetPushSession('B');finish('33333333-3333-4333-8333-333333333333');
    await expect(enable).rejects.toThrow('Session berubah');
    expect(writePushBinding).not.toHaveBeenCalledWith('33333333-3333-4333-8333-333333333333');
    expect(subscription.unsubscribe).toHaveBeenCalled();
  });
});
