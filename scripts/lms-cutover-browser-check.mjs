// Read-only production/PWA transition proof in an isolated browser profile.
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {read,save} from './supabase-full-migration.mjs';
const origin='https://lms.daztore.web.id',source='zfpfccznrbotrvfqcdzh',target='zfhrzehocewhflytfbyl';
const state=read('lms-cutover/state.json');assert.equal(state.phase,'active');
const owner=JSON.parse(read('lms-cutover/final-source-data.json').find(t=>t.name==='lms_profiles').rows[0]).id;
const draftKey=`lms_draft:v1:${owner}:subjects:new`,draft=JSON.stringify({cutoverFixture:true,values:{name:'Preserve pending local draft'}});
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  const context=await browser.newContext();
  await context.addInitScript(({draftKey,draft,source})=>{
    if(location.origin!=='https://lms.daztore.web.id'||localStorage.getItem('cutover-fixture-seeded'))return;
    // This is a deliberately invalid local fixture, never a copied production JWT.
    localStorage.setItem(`sb-${source}-auth-token`,JSON.stringify({access_token:'expired-local-fixture',refresh_token:'expired-local-fixture',expires_at:1}));
    localStorage.setItem(draftKey,draft);localStorage.setItem('cutover-fixture-seeded','1');
  },{draftKey,draft,source});
  const page=await context.newPage(),requests=[],errors=[];
  context.on('request',r=>requests.push(r.url()));page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(20000);
  const response=await page.goto(origin);assert.equal(response.status(),200);
  await page.getByPlaceholder('nama@email.com').waitFor();
  await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller);await page.getByPlaceholder('nama@email.com').waitFor();
  const proof=await page.evaluate(async({draftKey,target})=>({draft:localStorage.getItem(draftKey),targetSession:localStorage.getItem(`sb-${target}-auth-token`),controller:navigator.serviceWorker.controller?.scriptURL,cacheUrls:(await Promise.all((await caches.keys()).map(async k=>(await(await caches.open(k)).keys()).map(r=>r.url)))).flat()}),{draftKey,target});
  assert.equal(proof.draft,draft);assert.equal(proof.targetSession,null);assert.equal(proof.controller,origin+'/sw.js');assert.equal(errors.length,0);
  assert.ok(!requests.some(u=>u.includes(source+'.supabase.co')));assert.ok(proof.cacheUrls.every(u=>!u.includes('supabase.co')&&!u.includes('token=')));
  const manifest=await(await context.request.get(origin+'/manifest.webmanifest')).json();assert.equal(manifest.display,'standalone');assert.equal(manifest.start_url,'/');
  const worker=await context.request.get(origin+'/sw.js'),workerSource=await worker.text();assert.ok(workerSource.includes(state.candidate.script.split('/').at(-1)));assert.ok(/no-cache|no-store/.test(worker.headers()['cache-control']));assert.ok(/no-cache|no-store/.test(response.headers()['cache-control']));
  const summary={at:new Date().toISOString(),origin,oldUsSessionIgnored:true,reloginShown:true,localDraftPreserved:true,productionServiceWorkerControlsPage:true,workerPrecacheMatchesPromotedBundle:true,privateApiAbsentFromCaches:true,noUsRequests:true,browserErrors:0,actualOldWorkerUpgradeNotSimulated:true};
  save('lms-cutover/production-pwa-transition.json',summary);console.log(JSON.stringify({event:'cutover-pwa-transition-passed',...summary}));await context.close();
}finally{await browser.close()}
