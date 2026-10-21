import { useCallback,useEffect,useRef,useState } from 'react';
import { Bell,Check,Volume2,X } from 'lucide-react';
import { client } from '../../services/supabase';
import { call,errorMessage } from '../../services/db';
import { useMutation,useQuery } from '../../services/hooks';
import { invalidateData } from '../../services/queryCache';
import { enablePush,disablePush,pushSupport,syncPushDevice } from '../../services/push';
import { clearNotificationSound,playNotificationSound,unlockNotificationSound } from '../../services/notificationSound';
import { commentPush,commentRoute } from '../../utils/pushProtocol';
import { readPushBinding } from '../../services/pushBinding';
import { ErrorNotice } from '../common/DataUI';

interface Notice { id:string; child_id:string; title:string; body:string; created_at:string; read_at:string|null }
interface Feed { unread:number; items:Notice[] }
export function NotificationCenter({userId,path}:{userId:string;path:string}) {
  const [open,setOpen] = useState(false);
  const [subscribed,setSubscribed] = useState(false);
  const [deviceError,setDeviceError] = useState('');
  const [devicePending,setDevicePending] = useState(false);
  const deviceLock = useRef(false);
  const [toast,setToast] = useState<Pick<Notice,'id'|'child_id'> | null>(null);
  const soundKey = `lms-notification-sound:v1:${userId}`;
  const [sound,setSound] = useState(() => {try {return localStorage.getItem(soundKey)==='true';} catch {return false;} });
  const soundRef = useRef(sound); soundRef.current=sound;
  const seen = useRef(new Set<string>());
  const initialized = useRef(false);
  const alive = useRef(true);
  const panel = useRef<HTMLDivElement>(null);
  const mutation = useMutation();
  const query = useQuery<Feed>('notifications:recent',() => call('lms_notification_feed'),{
    refetchInterval:() => document.visibilityState==='visible'?60_000:false,
  });
  const announce = useCallback((id:string,childId:string) => {
    if (!alive.current || seen.current.has(id)) return;
    seen.current.add(id);
    if (seen.current.size>200) seen.current.delete(seen.current.values().next().value!);
    if (document.visibilityState==='visible') {
      setToast({id,child_id:childId});
      if (soundRef.current) playNotificationSound();
    }
  },[]);
  useEffect(() => {
    alive.current=true;
    const change = (event:{eventType:string;new:Record<string,unknown>}) => {
        if (!alive.current) return;
        if (event.eventType==='INSERT') announce(String(event.new.id),String(event.new.child_id));
        void invalidateData(['notifications','comments','dashboard']);
    };
    const channel = client().channel(`lms-notifications:${userId}`)
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'lms_notifications',filter:`user_id=eq.${userId}`},change)
      .on('postgres_changes',{event:'UPDATE',schema:'public',table:'lms_notifications',filter:`user_id=eq.${userId}`},change)
      .subscribe();
    const message = (event:MessageEvent) => {
      if (event.data?.type==='LMS_PUSH_EXPIRED') {setSubscribed(false);return;}
      const data = event.data?.type==='LMS_COMMENT_PUSH' && commentPush(event.data.payload);
      if (data) void readPushBinding().then(binding => {
        if (!alive.current || binding!==data.subscriptionId) return;
        announce(data.notificationId,data.childId);
        void invalidateData(['notifications','comments','dashboard']);
      }).catch(() => {});
    };
    navigator.serviceWorker?.addEventListener('message',message);
    void syncPushDevice(userId).then(enabled => {if(alive.current)setSubscribed(enabled);}).catch(() => {});
    return () => {
      alive.current=false;
      void client().removeChannel(channel);
      navigator.serviceWorker?.removeEventListener('message',message);
      clearNotificationSound();
    };
  },[userId,announce]);
  useEffect(() => {
    if (!query.data) return;
    if (!initialized.current) {
      for (const item of query.data.items) seen.current.add(item.id);
      initialized.current=true;
    } else for (const item of query.data.items) {
      if (!item.read_at) announce(item.id,item.child_id);
    }
  },[query.data,announce]);
  useEffect(() => {
    if (!sound) return;
    const unlock = () => unlockNotificationSound();
    window.addEventListener('pointerdown',unlock,{once:true});
    window.addEventListener('keydown',unlock,{once:true});
    return () => {window.removeEventListener('pointerdown',unlock);window.removeEventListener('keydown',unlock);};
  },[sound]);
  useEffect(() => {
    const close = (event:KeyboardEvent) => {if(event.key==='Escape')setOpen(false);};
    const outside = (event:PointerEvent) => {if(panel.current&&!panel.current.contains(event.target as Node))setOpen(false);};
    window.addEventListener('keydown',close);window.addEventListener('pointerdown',outside);
    return () => {window.removeEventListener('keydown',close);window.removeEventListener('pointerdown',outside);};
  },[]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null),7000);
    return () => clearTimeout(timer);
  },[toast]);
  useEffect(() => {
    const id = new URLSearchParams(path.split('?')[1]||'').get('notification');
    if (id && /^[a-f0-9-]{36}$/i.test(id)) void call('lms_mark_notification_read',{p_id:id}).catch(() => {});
  },[path]);
  const read = (id:string) => call('lms_mark_notification_read',{p_id:id});
  const visit = (item:Pick<Notice,'id'|'child_id'>) => {
    window.location.hash=commentRoute(item.child_id,item.id).split('#')[1];
    setOpen(false);setToast(null);
  };
  const unsupported = pushSupport();
  const changeDevice = async () => {
    if(deviceLock.current)return;
    deviceLock.current=true;setDevicePending(true);setDeviceError('');
    try {
      if(subscribed){try{await disablePush();}finally{if(alive.current)setSubscribed(false);}}
      else {await enablePush(userId);if(alive.current)setSubscribed(true);}
    } catch(error) {if(alive.current)setDeviceError(errorMessage(error));}
    finally {deviceLock.current=false;if(alive.current)setDevicePending(false);}
  };
  const unread = query.data?.unread || 0;
  return <div ref={panel} className="relative">
    <button type="button" aria-label={`Notifikasi${unread?`, ${unread} belum dibaca`:''}`} aria-expanded={open}
      onClick={() => {setOpen(!open);if(!open)query.refresh();}}
      className="relative p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 cursor-pointer">
      <Bell className="w-5 h-5" />
      {unread>0&&<span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-rose-600 text-white text-2xs font-bold">{unread>99?'99+':unread}</span>}
    </button>
    {open&&<section aria-label="Pusat notifikasi" className="fixed top-16 left-4 right-4 sm:absolute sm:top-full sm:left-auto sm:right-0 sm:mt-2 sm:w-88 rounded-2xl border border-slate-200 bg-white shadow-xl z-50 p-4 space-y-3">
      <div className="flex items-center justify-between"><h2 className="font-bold text-sm">Notifikasi</h2><button type="button" aria-label="Tutup notifikasi" onClick={()=>setOpen(false)} className="p-1 cursor-pointer"><X className="w-4 h-4" /></button></div>
      <ErrorNotice message={query.error||mutation.error||deviceError} />
      <div className="max-h-72 overflow-y-auto space-y-2">
        {!query.data&&query.loading&&<p className="text-xs text-slate-500" role="status">Memuat notifikasi...</p>}
        {query.data?.items.length===0&&<p className="text-xs text-slate-500 py-4 text-center">Belum ada notifikasi.</p>}
        {query.data?.items.map(item=><article key={item.id} className={`rounded-xl p-3 border ${item.read_at?'border-slate-100':'bg-indigo-50 border-indigo-100'}`}>
          <button type="button" onClick={()=>visit(item)} className="text-left w-full cursor-pointer">
            <strong className="text-xs block">{item.title}</strong><p className="text-xs text-slate-600 mt-1">{item.body}</p>
            <time className="text-2xs text-slate-400" dateTime={item.created_at}>{new Date(item.created_at).toLocaleString('id-ID',{dateStyle:'short',timeStyle:'short'})}</time>
          </button>
          {!item.read_at&&<button type="button" disabled={mutation.pending} onClick={()=>void mutation.run(()=>read(item.id))} className="mt-1 flex items-center gap-1 text-2xs font-semibold text-indigo-700 cursor-pointer"><Check className="w-3 h-3" />Tandai dibaca</button>}
        </article>)}
      </div>
      <div className="border-t border-slate-100 pt-3 space-y-2 text-xs">
        {unsupported&&<p className="text-slate-500">{unsupported}</p>}
        <button type="button" disabled={devicePending||!!unsupported} onClick={()=>void changeDevice()} className="px-3 py-2 rounded-lg bg-indigo-50 text-indigo-700 font-semibold disabled:opacity-50 cursor-pointer">{subscribed?'Nonaktifkan Notifikasi':'Aktifkan Notifikasi'}</button>
        {!unsupported&&typeof Notification!=='undefined'&&Notification.permission==='denied'&&<p className="text-slate-500">Izin browser diblokir. Aktifkan melalui pengaturan izin situs.</p>}
        <label className="flex items-center gap-2 text-slate-600"><Volume2 className="w-4 h-4" /><input type="checkbox" checked={sound} onChange={event=>{
          const enabled=event.target.checked;setSound(enabled);if(enabled)unlockNotificationSound();
          try{localStorage.setItem(soundKey,String(enabled));}catch{setDeviceError('Preferensi suara hanya berlaku selama sesi ini.');}
        }} />Suara Notifikasi: {sound?'Aktif':'Nonaktif'}</label>
        <p className="text-2xs text-slate-400">Suara saat aplikasi ditutup mengikuti pengaturan perangkat.</p>
      </div>
    </section>}
    {toast&&<div role="status" className="fixed top-20 right-4 left-4 sm:left-auto sm:w-80 bg-white border border-indigo-200 shadow-lg rounded-xl p-3 text-xs z-50 flex items-center gap-3">
      <button type="button" onClick={()=>visit(toast)} className="flex-1 text-left cursor-pointer"><strong>Komentar baru</strong><span className="block text-slate-500">Buka tab Komentar untuk melihatnya.</span></button>
      <button type="button" aria-label="Tutup pemberitahuan" onClick={()=>setToast(null)} className="cursor-pointer"><X className="w-4 h-4" /></button>
    </div>}
  </div>;
}
