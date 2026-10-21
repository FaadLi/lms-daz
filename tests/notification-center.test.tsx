// @vitest-environment jsdom
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { act,cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react';
import { NotificationCenter } from '../src/components/admin/NotificationCenter';
import { DataCacheProvider } from '../src/services/queryCache';
import { enablePush } from '../src/services/push';
import { playNotificationSound } from '../src/services/notificationSound';

const state=vi.hoisted(()=>({
  feed:{unread:0,items:[] as {id:string;child_id:string;title:string;body:string;created_at:string;read_at:null|string}[]},
  event:undefined as undefined | ((payload:{eventType:string;new:Record<string,string>})=>void),
  call:vi.fn(),
  filters:[] as {event:string;filter:string}[],
}));
vi.mock('../src/services/db',()=>({call:state.call,errorMessage:(error:Error)=>error.message}));
vi.mock('../src/services/push',()=>({pushSupport:()=>undefined,syncPushDevice:vi.fn(async()=>false),enablePush:vi.fn(async()=>{}),disablePush:vi.fn(async()=>{})}));
vi.mock('../src/services/notificationSound',()=>({clearNotificationSound:vi.fn(),playNotificationSound:vi.fn(),unlockNotificationSound:vi.fn()}));
vi.mock('../src/services/pushBinding',()=>({readPushBinding:vi.fn(async()=>'33333333-3333-4333-8333-333333333333')}));
vi.mock('../src/services/supabase',()=>({client:()=>({
  channel:()=>{const channel={on:(_type:unknown,filter:{event:string;filter:string},callback:typeof state.event)=>{state.filters.push(filter);state.event=callback;return channel;},subscribe:()=>channel};return channel;},
  removeChannel:vi.fn(async()=>{}),
})}));
const id='11111111-1111-4111-8111-111111111111',child='22222222-2222-4222-8222-222222222222';
const item={id,child_id:child,title:'Komentar baru',body:'Buka aplikasi untuk melihatnya.',created_at:new Date().toISOString(),read_at:null};
const tree=(user='A',path='/dashboard')=><DataCacheProvider scope={user}><NotificationCenter userId={user} path={path} /></DataCacheProvider>;
beforeEach(()=>{
  state.feed={unread:0,items:[]};state.event=undefined;state.filters=[];
  state.call.mockImplementation(async(name:string)=>name==='lms_notification_feed'?state.feed:true);
  localStorage.clear();window.location.hash='/dashboard';
  Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});
  Object.defineProperty(navigator,'serviceWorker',{configurable:true,value:new EventTarget()});
});
afterEach(()=>{cleanup();vi.clearAllMocks();});
describe('teacher Notification Center',()=>{
  it('updates unread from a parent event, routes to Comments, marks read and deduplicates realtime/push sound',async()=>{
    const view=render(tree());
    fireEvent.click(screen.getByRole('button',{name:'Notifikasi'}));
    await screen.findByText('Belum ada notifikasi.');
    expect(state.filters).toEqual([expect.objectContaining({event:'INSERT',filter:'user_id=eq.A'}),expect.objectContaining({event:'UPDATE',filter:'user_id=eq.A'})]);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(localStorage.getItem('lms-notification-sound:v1:A')).toBe('true');
    state.feed={unread:1,items:[item]};
    await act(async()=>state.event!({eventType:'INSERT',new:{id,child_id:child}}));
    await screen.findByRole('button',{name:'Notifikasi, 1 belum dibaca'});
    await act(async()=>{
      state.event!({eventType:'INSERT',new:{id,child_id:child}});
      navigator.serviceWorker.dispatchEvent(new MessageEvent('message',{data:{type:'LMS_COMMENT_PUSH',payload:{type:'parent_comment',notificationId:id,childId:child,subscriptionId:'33333333-3333-4333-8333-333333333333'}}}));
      await Promise.resolve();
    });
    expect(playNotificationSound).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button',{name:/Tandai dibaca/}));
    await waitFor(()=>expect(state.call).toHaveBeenCalledWith('lms_mark_notification_read',{p_id:id}));
    fireEvent.click(screen.getByRole('button',{name:/Komentar baru Buka aplikasi/}));
    expect(window.location.hash).toBe(`#/children/${child}?tab=comments&notification=${id}`);
    view.rerender(tree('A',window.location.hash.slice(1)));
    await waitFor(()=>expect(state.call).toHaveBeenCalledWith('lms_mark_notification_read',{p_id:id}));
  });
  it('requests permission only on enable interaction and a denial leaves the application usable',async()=>{
    vi.mocked(enablePush).mockRejectedValueOnce(new Error('Izin notifikasi belum diberikan.'));
    render(tree());await waitFor(()=>expect(state.call).toHaveBeenCalled());
    expect(enablePush).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button',{name:'Notifikasi'}));
    fireEvent.click(screen.getByRole('button',{name:'Aktifkan Notifikasi'}));
    await screen.findByText('Izin notifikasi belum diberikan.');
    expect(enablePush).toHaveBeenCalledWith('A');
    expect(screen.getByRole('button',{name:'Notifikasi'})).toBeTruthy();
  });
  it('does not display prior account notifications or reuse its sound preference after switching',async()=>{
    state.feed={unread:1,items:[item]};localStorage.setItem('lms-notification-sound:v1:A','true');
    const view=render(tree());await screen.findByRole('button',{name:'Notifikasi, 1 belum dibaca'});
    state.feed={unread:0,items:[]};view.rerender(tree('B'));
    await screen.findByRole('button',{name:'Notifikasi'});
    fireEvent.click(screen.getByRole('button',{name:'Notifikasi'}));
    await screen.findByText('Belum ada notifikasi.');
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
    expect(screen.queryByText(item.body)).toBeNull();
  });
});
