import { afterEach,describe,expect,it,vi } from 'vitest';
import { allowedPushEndpoint,dispatchPush,pushPayload,trustedDispatcher,type PushDelivery } from '../supabase/functions/_shared/push';
import { commentPush,commentRoute } from '../src/utils/pushProtocol';
import { receivePush,clickPush } from '../src/services/pushWorker';
import { readPushBinding } from '../src/services/pushBinding';
vi.mock('../src/services/pushBinding',()=>({readPushBinding:vi.fn()}));
const notice='11111111-1111-4111-8111-111111111111';
const child='22222222-2222-4222-8222-222222222222';
const subscription='33333333-3333-4333-8333-333333333333';
const data={type:'parent_comment' as const,notificationId:notice,childId:child,subscriptionId:subscription};
const delivery:PushDelivery={id:notice,lease_id:notice,notification_id:notice,child_id:child,subscription_id:subscription,endpoint:'https://fcm.googleapis.com/fcm/send/device',p256dh:'encryption-key',auth:'encryption-auth'};
afterEach(()=>vi.resetAllMocks());
function worker(foreground=true){
  const message=vi.fn(), focus=vi.fn(),navigate=vi.fn(),showNotification=vi.fn();
  const client={url:'https://example.test/#/dashboard',focused:foreground,visibilityState:foreground?'visible':'hidden',postMessage:message,focus,navigate};
  const scope={registration:{showNotification},location:{origin:'https://example.test'},clients:{matchAll:vi.fn(async()=>[client]),openWindow:vi.fn()}};
  return{scope:scope as unknown as ServiceWorkerGlobalScope,showNotification,message,focus,navigate,openWindow:scope.clients.openWindow};
}
describe('trusted backend Web Push dispatcher',()=>{
  it('requires a distinct backend secret and rejects browser credentials and arbitrary URLs',async()=>{
    const secret='a'.repeat(43);
    expect(await trustedDispatcher(secret,secret)).toBe(true);
    expect(await trustedDispatcher('Bearer user-jwt',secret)).toBe(false);
    expect(await trustedDispatcher(secret)).toBe(false);
    for(const endpoint of ['http://fcm.googleapis.com/a','https://localhost/a','https://127.0.0.1/a','https://fcm.googleapis.com.evil.test/a','https://user@fcm.googleapis.com/a','https://fcm.googleapis.com:8443/a'])
      expect(allowedPushEndpoint(endpoint)).toBe(false);
    expect(allowedPushEndpoint(delivery.endpoint)).toBe(true);
    expect(allowedPushEndpoint('https://web.push.apple.com/device')).toBe(true);
  });
  it('contains only fixed event/opaque routing IDs, without sensitive payload fields',()=>{
    const malicious={...delivery,message:'PRIVATE',token:'SECRET',url:'https://evil.test'};
    expect(JSON.parse(pushPayload(malicious))).toEqual(data);
    expect(commentRoute(child,notice)).toBe(`/#/children/${child}?tab=comments&notification=${notice}`);
    expect(commentPush({...data,url:'https://evil.test',token:'PRIVATE'})).toEqual(data);
    expect(commentPush({...data,childId:'../report/token'})).toBeUndefined();
  });
  it('reports independent results for multiple devices, bounds concurrency and records transient failures for DB retry',async()=>{
    let active=0,max=0;
    const send=vi.fn(async(item:PushDelivery)=>{
      active++;max=Math.max(max,active);await Promise.resolve();active--;
      if(item.id==='timeout')throw new Error('provider exception with endpoint');
      return item.id==='expired'?410:201;
    });
    const finish=vi.fn(async()=>{});
    const jobs=Array.from({length:12},(_,index)=>({...delivery,id:index===0?'timeout':index===1?'expired':String(index)}));
    expect(await dispatchPush(jobs,send,finish)).toEqual({accepted:10,failed:2});
    expect(max).toBeLessThanOrEqual(5);expect(finish).toHaveBeenCalledTimes(12);
    expect(finish).toHaveBeenCalledWith(jobs[0],0);expect(finish).toHaveBeenCalledWith(jobs[1],410);
    await dispatchPush([{...delivery,endpoint:'https://127.0.0.1/'}],send,finish);
    expect(send).toHaveBeenCalledTimes(12);
  });
});
describe('existing service worker Web Push integration',()=>{
  it('shows generic background notification, uses a stable retry tag and sends a foreground update without sensitive content',async()=>{
    vi.mocked(readPushBinding).mockResolvedValue(subscription);
    const w=worker(false);
    await receivePush(w.scope,data);await receivePush(w.scope,data);
    expect(w.showNotification).toHaveBeenCalledWith('Komentar baru',expect.objectContaining({body:expect.not.stringContaining('PRIVATE'),silent:false,renotify:false,data,tag:`lms-comment-${subscription}-${notice}`}));
    expect(w.message).toHaveBeenCalledWith({type:'LMS_COMMENT_PUSH',payload:data});
    const visible=worker();await receivePush(visible.scope,data);
    expect(visible.showNotification).toHaveBeenCalledWith('Komentar baru',expect.objectContaining({silent:true}));
  });
  it('suppresses stale account and logged-out messages/clicks before display or navigation',async()=>{
    const w=worker();
    vi.mocked(readPushBinding).mockResolvedValue('different-device');
    await receivePush(w.scope,data);
    const notification={data,close:vi.fn()} as unknown as Notification;
    await clickPush(w.scope,notification);
    expect(w.showNotification).not.toHaveBeenCalled();expect(w.message).not.toHaveBeenCalled();expect(w.openWindow).not.toHaveBeenCalled();
    vi.mocked(readPushBinding).mockResolvedValue(undefined);await receivePush(w.scope,data);
    expect(w.showNotification).not.toHaveBeenCalled();
  });
  it('focuses and routes the existing app without a forced reload; opens a safe URL when closed',async()=>{
    vi.mocked(readPushBinding).mockResolvedValue(subscription);
    const w=worker();const notification={data,close:vi.fn()} as unknown as Notification;
    await clickPush(w.scope,notification);
    expect(w.message).toHaveBeenCalledWith({type:'LMS_OPEN_COMMENT',payload:data});expect(w.focus).toHaveBeenCalledOnce();expect(w.navigate).not.toHaveBeenCalled();
    vi.mocked(w.scope.clients.matchAll).mockResolvedValue([]);
    await clickPush(w.scope,notification);
    expect(w.openWindow).toHaveBeenCalledWith(`https://example.test${commentRoute(child,notice)}`);
    vi.mocked(w.scope.clients.matchAll).mockResolvedValue([{url:'https://example.test/?token=private-parent-token'} as Client]);
    await clickPush(w.scope,notification);
    expect(w.openWindow).toHaveBeenCalledTimes(2); // do not reuse a query-token parent portal
    expect(w.focus).toHaveBeenCalledTimes(1);
  });
});
