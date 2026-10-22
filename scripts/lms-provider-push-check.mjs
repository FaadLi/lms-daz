// Optional real-provider proof using only a controlled, temporary browser/account.
// Never logs endpoint, subscription encryption keys, private links or credentials.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {chromium} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {base,save} from './supabase-full-migration.mjs';

export async function checkProviderPush({clientA,edge,query,childId,reportId,sessionA,email,password}){
  const profile=fs.mkdtempSync(path.join(base,'provider-push-browser-'));
  const context=await chromium.launchPersistentContext(profile,{channel:'chrome',headless:true,permissions:['notifications']});
  let registered=false;
  try{
    const page=await context.newPage();page.setDefaultTimeout(25000);
    await page.goto('https://lms.daztore.web.id');await page.evaluate(()=>navigator.serviceWorker.ready);
    await page.getByPlaceholder('nama@email.com').fill(email);await page.locator('input[type="password"]').fill(password);
    await page.getByRole('button',{name:'Masuk ke Dashboard',exact:true}).click();await page.getByRole('button',{name:/^Notifikasi/}).click();
    await page.getByRole('button',{name:'Aktifkan Notifikasi',exact:true}).click();
    try{await page.getByRole('button',{name:'Nonaktifkan Notifikasi',exact:true}).waitFor({timeout:45000})}catch{throw Error('BROWSER_PROVIDER_REGISTRATION_UNAVAILABLE')}
    registered=true;console.log('PASS real browser PushManager subscription registered through production LMS with existing VAPID');
    const devices=await clientA.from('lms_push_subscriptions').select('id,endpoint');if(devices.error)throw Error('PROVIDER_SUBSCRIPTION_READ_FAILED');assert.equal(devices.data.length,1);
    const endpointMatches=await page.evaluate(async endpoint=>(await(await navigator.serviceWorker.ready).pushManager.getSubscription())?.endpoint===endpoint,devices.data[0].endpoint);assert.ok(endpointMatches);
    const link=await edge({action:'issue-link',childId,reportId,days:1},sessionA);assert.equal(link.status,200);
    const commentId=randomUUID();const comment=await edge({action:'parent',token:link.data.token,operation:'comment',section:'comments',reportId,id:commentId,message:'Isolated provider delivery validation'});assert.equal(comment.status,200);
    let delivery,notification;const deadline=Date.now()+135000;
    while(Date.now()<deadline){
      const rows=await query(`select d.state,d.attempts,d.last_status,n.id from private.lms_push_deliveries d join public.lms_notifications n on n.id=d.notification_id where n.comment_id='${commentId}'::uuid and n.user_id='${sessionA.user.id}'::uuid`);delivery=rows[0];
      notification=await page.evaluate(async id=>(await(await navigator.serviceWorker.ready).getNotifications()).some(n=>n.data?.notificationId===id),delivery?.id);
      if(delivery?.state==='sent'&&notification)break;
      if(delivery?.state==='failed')throw Error('PROVIDER_REJECTED_TEST_SUBSCRIPTION');
      await new Promise(r=>setTimeout(r,2000));
    }
    assert.equal(delivery?.state,'sent');assert.ok([200,201,202].includes(delivery.last_status));assert.equal(notification,true);
    const proof={at:new Date().toISOString(),origin:'https://lms.daztore.web.id',realBrowserSubscription:true,existingVapid:true,providerStatus:delivery.last_status,attempts:delivery.attempts,schedulerDelivered:true,actualPushEventReceived:true,nativeNotificationObserved:true,controlledTestBrowser:true,userPhysicalDeviceTested:false};save('lms-cutover/provider-push.json',proof);console.log('PASS actual provider accepts encrypted Web Push and production service worker receives it and displays native notification');
  }catch(e){save('lms-cutover/provider-push.json',{at:new Date().toISOString(),registered,controlledTestBrowser:true,proven:false,reason:/^[A-Z_]+$/.test(e.message)?e.message:'PROVIDER_RECEIPT_NOT_PROVEN'});throw e}
  finally{
    const page=context.pages()[0];if(page)await page.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration('/');if(r){for(const n of await r.getNotifications())n.close();await(await r.pushManager.getSubscription())?.unsubscribe()}}).catch(()=>{});
    await context.close();const resolved=path.resolve(profile);if(!resolved.startsWith(path.resolve(base)+path.sep)||!path.basename(resolved).startsWith('provider-push-browser-'))throw Error('UNEXPECTED_BROWSER_PROFILE_PATH');fs.rmSync(resolved,{recursive:true,force:true});
  }
}
