import assert from 'node:assert/strict';
import { randomBytes,createECDH,randomUUID } from 'node:crypto';
import { chromium } from '@playwright/test';
import { mkdirSync,mkdtempSync,rmSync,writeFileSync } from 'node:fs';
import { resolve,join,sep } from 'node:path';

export async function checkNotifications({clientA,clientB,admin,edge,rpc:runRpc,query,childId,reportId,sessionA,url,email,emailB,password}) {
  const browserOrigin=process.env.LMS_PRODUCTION_SMOKE==='1'?'https://lms.daztore.web.id':'http://127.0.0.1:3000';
  const rpc=async(client,name,args)=>{
    try{return await runRpc(client,name,args);}catch{throw new Error(`Notification validation RPC ${name} failed`);}
  };
  const key=createECDH('prime256v1');key.generateKeys();
  const keys={p_p256dh:key.getPublicKey().toString('base64url'),p_auth:randomBytes(16).toString('base64url')};
  const endpoints=[1,2].map(index=>`https://fcm.googleapis.com/fcm/send/lms-validation-${randomUUID()}-${index}`);
  const devices=[];
  for(const endpoint of endpoints)devices.push(await rpc(clientA,'lms_save_push_subscription',{...keys,p_endpoint:endpoint}));
  assert.equal(await rpc(clientA,'lms_save_push_subscription',{...keys,p_endpoint:endpoints[0]}),devices[0]);
  assert.equal((await clientB.rpc('lms_save_push_subscription',{...keys,p_endpoint:endpoints[0]})).error?.code,'42501');
  assert.deepEqual((await clientB.from('lms_push_subscriptions').select('id')).data,[]);
  assert.equal((await clientA.rpc('lms_claim_push')).error?.code,'42501');
  const issued=await edge({action:'issue-link',childId,reportId,days:1},sessionA);assert.equal(issued.status,200);
  const comment=async(id=randomUUID(),message='Private validation comment')=>{
    const response=await edge({action:'parent',token:issued.data.token,operation:'comment',section:'comments',reportId,id,message});
    assert.equal(response.status,200);return id;
  };
  const id=await comment();await comment(id);
  let feed=await rpc(clientA,'lms_notification_feed');assert.equal(feed.unread,1);assert.equal(feed.items.length,1);
  assert.equal(feed.items[0].comment_id,id);assert.equal(feed.items[0].child_id,childId);
  assert.ok(!JSON.stringify(feed).includes('Private validation comment'));
  assert.equal((await rpc(clientB,'lms_notification_feed')).unread,0);
  assert.equal(await rpc(clientB,'lms_mark_notification_read',{p_id:feed.items[0].id}),false);
  const otherPending=await query(`select count(*)::integer count from private.lms_push_deliveries d join public.lms_notifications n on n.id=d.notification_id where n.user_id<>'${sessionA.user.id}'::uuid and d.state in ('pending','sending')`);
  assert.equal(otherPending[0].count,0,'Do not claim delivery work belonging to real users during validation');
  const claim=await rpc(admin,'lms_claim_push',{p_limit:25});
  const jobs=claim.filter(job=>devices.includes(job.subscription_id));assert.equal(jobs.length,2);
  assert.deepEqual(await rpc(admin,'lms_claim_push',{p_limit:25}),[]);
  for(let index=0;index<jobs.length;index++)await rpc(admin,'lms_finish_push',{p_id:jobs[index].id,p_lease:jobs[index].lease_id,p_status:index===0?201:410});
  assert.equal((await rpc(clientA,'lms_notification_feed')).unread,1);
  const remaining=(await clientA.from('lms_push_subscriptions').select('id')).data;
  assert.equal(remaining.length,1);
  const deviceId=remaining[0].id;
  const dispatch=await fetch(`${url}/functions/v1/push-dispatch`,{method:'POST',headers:{Authorization:`Bearer ${sessionA.access_token}`,'Content-Type':'application/json'},body:'{}'});
  assert.equal(dispatch.status,401);
  console.log('PASS hosted notification idempotency, two-device outbox, RLS, lease completion and backend-only dispatcher');

  const root=resolve('supabase/.temp');mkdirSync(root,{recursive:true});
  const profile=mkdtempSync(join(root,'push-browser-'));
  const context=await chromium.launchPersistentContext(profile,{channel:'chrome',headless:true,viewport:{width:1280,height:900},permissions:['notifications']});
  const page=await context.newPage();let browserErrors=0;
  page.on('pageerror',()=>browserErrors++);page.setDefaultTimeout(30000);
  const evidence={browserErrors:0,checks:[],realDevicePushTested:false};
  try {
    const cdp=await context.newCDPSession(page);let registrationId;
    cdp.on('ServiceWorker.workerRegistrationUpdated',event=>{
      for(const registration of event.registrations)if(registration.scopeURL===browserOrigin+'/')registrationId=registration.registrationId;
    });
    await cdp.send('ServiceWorker.enable');
    await page.goto(browserOrigin);await page.evaluate(()=>navigator.serviceWorker.ready);
    const login=async(email)=>{
      await page.getByPlaceholder('nama@email.com').fill(email);
      await page.getByPlaceholder('••••••••').fill(password);
      await page.getByRole('button',{name:'Masuk ke Dashboard',exact:true}).click();
      await page.getByRole('button',{name:/^Notifikasi/}).waitFor();
    };
    await login(email);
    console.log('PASS notification browser verified teacher login');
    await page.getByRole('button',{name:'Notifikasi, 1 belum dibaca',exact:true}).waitFor();
    await page.getByRole('button',{name:/^Notifikasi/}).click();
    await page.getByRole('button',{name:/Komentar baru Ada komentar baru/}).click();
    await page.getByRole('heading',{name:'Komentar & Komunikasi Orang Tua'}).waitFor();
    await page.waitForFunction(()=>location.hash.includes('tab=comments'));
    await page.getByRole('button',{name:'Notifikasi',exact:true}).waitFor();
    assert.equal((await rpc(clientA,'lms_notification_feed')).unread,0);
    console.log('PASS notification browser route and read state');
    evidence.checks.push('real Auth, unread badge, notification route to Comments and read synchronization');
    await page.getByRole('button',{name:'Notifikasi',exact:true}).click();
    await page.getByRole('checkbox').check();
    await page.getByRole('button',{name:'Tutup notifikasi',exact:true}).click();
    await page.bringToFront();
    const next=await comment();
    await page.getByRole('button',{name:'Notifikasi, 1 belum dibaca',exact:true}).waitFor();
    feed=await rpc(clientA,'lms_notification_feed');
    const notice=feed.items.find(item=>item.comment_id===next);
    assert.ok(notice);
    console.log('PASS notification browser receives live Realtime comment');
    evidence.checks.push('Realtime updates active teacher without frequent polling');
    await page.evaluate(async(id)=>{
      await new Promise((resolve,reject)=>{
        const request=indexedDB.open('lms-push-device-v1',1);
        request.onupgradeneeded=()=>request.result.createObjectStore('binding');
        request.onsuccess=()=>{
          const db=request.result,tx=db.transaction('binding','readwrite');tx.objectStore('binding').put(id,'subscription');
          tx.oncomplete=()=>{db.close();resolve();};tx.onerror=reject;
        };request.onerror=reject;
      });
    },deviceId);
    assert.ok(registrationId,'Controlling service worker registered');
    const payload={type:'parent_comment',notificationId:notice.id,childId,subscriptionId:deviceId};
    await cdp.send('ServiceWorker.deliverPushMessage',{origin:browserOrigin,registrationId,data:JSON.stringify(payload)});
    let notification=[];
    // Poll from Node: this Playwright version treats an async waitForFunction
    // predicate's Promise as truthy before the async condition has resolved.
    for(let attempt=0;attempt<50;attempt++) {
      notification=await page.evaluate(async()=> (await(await navigator.serviceWorker.ready).getNotifications()).map(item=>({title:item.title,body:item.body,data:item.data})));
      if(notification.length)break;
      await page.waitForTimeout(100);
    }
    assert.equal(notification.length,1,'Native notification displayed by the actual service worker');
    assert.equal(notification[0].title,'Komentar baru');assert.ok(!JSON.stringify(notification).includes('Private validation comment'));
    await cdp.send('ServiceWorker.deliverPushMessage',{origin:browserOrigin,registrationId,data:JSON.stringify(payload)});
    assert.ok(await page.evaluate(async()=>(await(await navigator.serviceWorker.ready).getNotifications()).length)<=1);
    evidence.checks.push('Chrome injected PushEvent displays generic OS notification and repeated event coalesces');
    await page.getByRole('button',{name:'Keluar',exact:true}).click();
    await page.getByPlaceholder('nama@email.com').waitFor();
    assert.equal(await page.evaluate(async()=>(await(await navigator.serviceWorker.ready).getNotifications()).length),0);
    await login(emailB);
    await page.setViewportSize({width:390,height:844});
    await page.getByRole('button',{name:'Notifikasi',exact:true}).click();await page.getByText('Belum ada notifikasi.').waitFor();
    const panel=await page.getByRole('region',{name:'Pusat notifikasi'}).boundingBox();
    assert.ok(panel.x>=0&&panel.x+panel.width<=390,'Mobile notification panel fits the viewport');
    await cdp.send('ServiceWorker.deliverPushMessage',{origin:browserOrigin,registrationId,data:JSON.stringify(payload)});
    await page.waitForTimeout(500);
    assert.equal(await page.evaluate(async()=>(await(await navigator.serviceWorker.ready).getNotifications()).length),0);
    evidence.checks.push('logout clears notifications, mobile panel fits and account B rejects late account A push');
    const cacheUrls=await page.evaluate(async()=> (await Promise.all((await caches.keys()).map(async name=>(await(await caches.open(name)).keys()).map(request=>request.url)))).flat());
    assert.ok(cacheUrls.every(value=>value.startsWith(browserOrigin+'/')&&!value.includes('token=')&&!value.includes('supabase')));
    evidence.browserErrors=browserErrors;assert.equal(browserErrors,0);
    writeFileSync('supabase/.temp/notification-check.json',JSON.stringify(evidence,null,2));
    console.log('PASS hosted notification browser, Realtime, injected Chrome PushEvent, account switch and private cache regression');
  } finally {
    await context.close();
    const target=resolve(profile);
    if(!target.startsWith(root+sep))throw new Error('Unexpected temporary profile path');
    rmSync(target,{recursive:true,force:true});
  }
  await rpc(clientA,'lms_revoke_report_link',{p_child:childId});
  const denied=await edge({action:'parent',token:issued.data.token,operation:'comment',section:'comments',reportId,id:randomUUID(),message:'Denied'});
  assert.equal(denied.status,403);
  await query(`update private.lms_report_links set revoked_at=null,expires_at=now()-interval '1 minute' where child_id='${childId}'::uuid`);
  assert.equal((await edge({action:'parent',token:issued.data.token,operation:'comment',section:'comments',reportId,id:randomUUID(),message:'Expired'})).status,403);
}
