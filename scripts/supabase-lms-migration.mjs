// LMS-only preparation. Production cutover and source mutation are not actions.
// Sensitive records and credentials use the existing private encrypted evidence store.
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createClient} from '@supabase/supabase-js';
import {root,env,base,hash,read,save,emit,request,nativeQuery,targetState,targetApi,targetPsql,targetHttp,catalogQueries,permissionQuery,archiveCopies} from './supabase-full-migration.mjs';

const sourceRef=new URL(env.OLD_SUPABASE_URL).hostname.split('.')[0];
const target=targetState(),url=`https://${target.ref}.supabase.co`,origin='https://lms.daztore.web.id';
const stamp=new Date().toISOString().replaceAll(':','-');
const prefix='lms-readiness/'+stamp;
const q=s=>'"'+s.replaceAll('"','""')+'"';
const lit=s=>"'"+s.replaceAll("'","''")+"'";
const canonical=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
async function sourceSql(name,query){return nativeQuery(prefix+'/source-'+name+'.json',query)}
async function targetSql(name,query){return JSON.parse(await targetPsql(prefix+'/target-'+name,`SELECT coalesce(json_agg(t),'[]') FROM (${query}) t`,{readonly:true}))}
async function keys(){const values=read('target/api-keys.json');return {pub:values.find(k=>k.name==='anon')?.api_key,service:values.find(k=>k.name==='service_role')?.api_key}}
async function capture(side,tables){
  const query=tables.map(t=>`SELECT ${lit(t.schema)} AS schema,${lit(t.name)} AS name,coalesce((SELECT json_agg(r ORDER BY r) FROM (SELECT to_jsonb(x)::text AS r FROM ${q(t.schema)}.${q(t.name)} x) rows),'[]'::json) AS rows`).join(' UNION ALL ');
  return side==='source'?sourceSql('data',query):targetSql('data',query);
}
async function audit(){
  const tableQuery="SELECT n.nspname AS schema,c.relname AS name FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','private') AND left(c.relname,4)='lms_' AND left(c.relname,12)<>'lms_cutover_' AND c.relkind IN ('r','p') ORDER BY 1,2";
  const [st,tt]=await Promise.all([sourceSql('tables',tableQuery),targetSql('tables',tableQuery)]);
  if(!Array.isArray(st)||st.length<18||canonical(st)!==canonical(tt))throw new Error('LMS_TABLE_SET_MISMATCH');
  const [sourceData,targetData]=await Promise.all([capture('source',st),capture('target',tt)]);
  const comparisons=sourceData.map(s=>{const t=targetData.find(t=>t.schema===s.schema&&t.name===s.name);
    const primary=read('inventory/sql-constraints.json').find(c=>c.schema===s.schema&&c.table_name===s.name&&c.contype==='p');
    const columns=primary?.definition.match(/\((.+)\)/)?.[1].split(',').map(c=>c.trim().replaceAll('"',''));
    if(!columns?.length)throw new Error('LMS_PRIMARY_KEY_NOT_IDENTIFIED');
    const rowKey=r=>{const v=JSON.parse(r);return canonical(columns.map(c=>v[c]))};
    const sourceMap=new Map(s.rows.map(r=>[rowKey(r),r])),targetMap=new Map(t.rows.map(r=>[rowKey(r),r]));
    return {schema:s.schema,name:s.name,sourceRows:s.rows.length,targetRows:t.rows.length,equal:hash(s.rows.join('\n'))===hash(t.rows.join('\n')),sourceOnly:[...sourceMap.keys()].filter(k=>!targetMap.has(k)).length,targetOnly:[...targetMap.keys()].filter(k=>!sourceMap.has(k)).length,changed:[...sourceMap].filter(([k,r])=>targetMap.has(k)&&targetMap.get(k)!==r).length};});
  const authQuery="SELECT 'users' AS name,coalesce((SELECT json_agg(r ORDER BY r) FROM (SELECT to_jsonb(u)::text AS r FROM auth.users u) t),'[]'::json) AS rows UNION ALL SELECT 'identities',coalesce((SELECT json_agg(r ORDER BY r) FROM (SELECT to_jsonb(u)::text AS r FROM auth.identities u) t),'[]'::json)";
  const [sa,ta]=await Promise.all([sourceSql('auth',authQuery),targetSql('auth',authQuery)]);
  const lmsOwners=new Set(sourceData.flatMap(t=>t.rows.map(r=>JSON.parse(r))).flatMap(r=>[r.owner_id,r.user_id]).filter(Boolean));
  sourceData.find(t=>t.name==='lms_profiles')?.rows.forEach(r=>lmsOwners.add(JSON.parse(r).id));
  const auth=sa.map(s=>{const t=ta.find(t=>t.name===s.name),sr=s.rows.map(JSON.parse),tr=t.rows.map(JSON.parse);return {name:s.name,sourceRows:sr.length,targetRows:tr.length,exactRowsEqual:canonical(s.rows)===canonical(t.rows),lmsLinkedAccounts:s.name==='users'?sr.filter(u=>lmsOwners.has(u.id)).length:undefined,lmsCriticalFieldsEqual:sr.filter(u=>s.name==='users'?lmsOwners.has(u.id):lmsOwners.has(u.user_id)).every(u=>{const v=tr.find(v=>v.id===u.id);return v&&['id','user_id','encrypted_password','email','provider','provider_id','identity_data','email_confirmed_at','banned_until','deleted_at'].every(k=>canonical(u[k])===canonical(v[k]))})}});
  const references=sourceData.flatMap(t=>{const cols={};for(const row of t.rows)for(const [k,v] of Object.entries(JSON.parse(row)))if(canonical(v)?.includes(sourceRef))cols[k]=(cols[k]??0)+1;return Object.entries(cols).map(([column,rows])=>({schema:t.schema,table:t.name,column,rows}))});
  const config={};for(const [name,suffix] of [['auth','/config/auth'],['ssl','/ssl-enforcement'],['storage','/config/storage'],['functions','/functions'],['secrets','/secrets'],['realtime','/config/realtime']])config[name]=await targetApi(prefix+'/target-'+name+'.json',suffix);
  const custom=read('inventory/edge-secrets.json').filter(s=>!s.name.startsWith('SUPABASE_'));
  const runtime=await targetSql('runtime',"SELECT json_build_object('cron',(SELECT json_agg(t) FROM (SELECT jobid,jobname,schedule,active FROM cron.job WHERE jobname='lms-push-dispatch') t),'queue',(SELECT count(*) FROM net.http_request_queue),'vault',(SELECT json_agg(t) FROM (SELECT name,decrypted_secret FROM vault.decrypted_secrets WHERE name IN ('lms_push_function_url','lms_push_dispatch_secret')) t)) AS value");
  const v=runtime[0].value,recovered=read('inventory/edge-secret-values-recovered.json');
  const summary={at:new Date().toISOString(),source:sourceRef,target:target.ref,prefix,tables:comparisons,auth,usUrlReferences:references,
    authConfig:{siteUrl:config.auth.site_url,redirects:config.auth.uri_allow_list,signupDisabled:config.auth.disable_signup},ssl:config.ssl.currentConfig,
    storage:{features:config.storage.features,capabilities:config.storage.capabilities},
    functions:config.functions.filter(f=>['lesreport','push-dispatch'].includes(f.slug)).map(f=>({slug:f.slug,status:f.status,verify_jwt:f.verify_jwt})),
    customSecrets:custom.map(s=>({name:s.name,matches:config.secrets.some(t=>t.name===s.name&&t.value===s.value)})),
    cron:v.cron,queuedRequests:v.queue,vaultDispatchMatches:v.vault.find(s=>s.name==='lms_push_dispatch_secret')?.decrypted_secret===recovered.LMS_PUSH_DISPATCH_SECRET,vaultUrlMatches:v.vault.find(s=>s.name==='lms_push_function_url')?.decrypted_secret===url+'/functions/v1/push-dispatch'};
  save(prefix+'/summary.json',summary);save('lms-readiness/latest-audit.json',summary);emit('lms-audit',summary);
}

async function media(){
  const {service}=await keys();const client=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  const rows=await targetSql('media-rows',"SELECT id,owner_id,object_path,kind,state,size_bytes,mime_type FROM public.lms_media_assets ORDER BY id");
  const manifest=read('storage/manifest.json').filter(o=>o.bucket==='lms_media');const results=[];
  for(const row of rows){
    const proof={kind:row.kind,state:row.state};
    const blob=await client.storage.from('lms_media').download(row.object_path);proof.downloadOk=!blob.error;
    if(blob.data){const bytes=Buffer.from(await blob.data.arrayBuffer());proof.bytes=bytes.length;proof.contentMatchesBackup=manifest.some(o=>o.path===row.object_path&&o.sha256===hash(bytes));proof.sizeMatches=bytes.length===row.size_bytes}
    const variants=[];for(const [variant,transform] of [['original',undefined],['avatar',{width:160,height:160,resize:'contain',quality:75}],['thumbnail',{width:640,height:480,resize:'contain',quality:75}]]){
      const signed=await client.storage.from('lms_media').createSignedUrl(row.object_path,60,transform?{transform}:undefined);
      if(signed.error){variants.push({variant,signing:false,status:signed.error.statusCode??signed.error.status});continue}
      const response=await fetch(signed.data.signedUrl,{signal:AbortSignal.timeout(20000)});const bytes=Buffer.from(await response.arrayBuffer());
      variants.push({variant,signing:true,status:response.status,image:response.headers.get('content-type')?.startsWith('image/'),bytes:bytes.length});
    }
    proof.variants=variants;results.push(proof);
  }
  const refs=await targetSql('media-relations',"SELECT 'profile' AS kind,count(*)::int AS referenced,count(*) FILTER (WHERE a.id IS NULL)::int AS missing FROM public.lms_profiles p LEFT JOIN public.lms_media_assets a ON a.id=p.avatar_id WHERE p.avatar_id IS NOT NULL UNION ALL SELECT 'child',count(*)::int,count(*) FILTER (WHERE a.id IS NULL)::int FROM public.lms_children c LEFT JOIN public.lms_media_assets a ON a.id=c.avatar_id WHERE c.avatar_id IS NOT NULL");
  const result={at:new Date().toISOString(),results,refs};save('lms-readiness/media.json',result);emit('lms-media',result);
}

async function configure(){
  const before=await targetApi(prefix+'/auth-before.json','/config/auth');
  const redirects=[...new Set([...before.uri_allow_list.split(',').filter(Boolean),origin,origin+'/'])].join(',');
  await targetApi(prefix+'/auth-update.json','/config/auth','PATCH',{site_url:origin,uri_allow_list:redirects});
  const ssl=await targetApi(prefix+'/ssl-before.json','/ssl-enforcement');
  if(!ssl.currentConfig.database)await targetApi(prefix+'/ssl-update.json','/ssl-enforcement','PUT',{requestedConfig:{database:true}});
  // User chose the existing plan and stored WebP variants; never request paid resizing.
  const after=await targetApi(prefix+'/storage-after.json','/config/storage');
  const sslAfter=await targetApi(prefix+'/ssl-after.json','/ssl-enforcement');
  const proof={at:new Date().toISOString(),authSiteUrl:origin,existingRedirectsPreserved:true,signupRemainsQuarantined:before.disable_signup===true,ssl:sslAfter.currentConfig,imageTransformationEnabled:after.features.imageTransformation.enabled,paidImageTransformNotRequested:true,planNotChanged:true};
  save('lms-readiness/configuration.json',proof);emit('lms-configured',proof);
}

async function build(){
  const k=await keys(),secrets=read('inventory/edge-secret-values-recovered.json');
  const directory=path.join(base,'lms-builds',stamp);fs.mkdirSync(directory,{recursive:true});
  const child=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'build','--outDir',directory],{env:{...process.env,VITE_SUPABASE_URL:url,VITE_SUPABASE_PUBLISHABLE_KEY:k.pub,VITE_VAPID_PUBLIC_KEY:secrets.VAPID_PUBLIC_KEY,VITE_LMS_STORED_MEDIA_VARIANTS:'1'},windowsHide:true,stdio:['ignore','pipe','pipe']});
  const chunks=[];child.stdout.on('data',b=>chunks.push(b));child.stderr.on('data',b=>chunks.push(b));const status=await new Promise((resolve,reject)=>{child.on('close',resolve);child.on('error',reject)});
  save(prefix+'/build.log',Buffer.concat(chunks));if(status!==0)throw new Error('LMS_CANDIDATE_BUILD_FAILED');
  const html=fs.readFileSync(path.join(directory,'index.html'),'utf8');const script=html.match(/src="([^"]+\.js)"/)?.[1];if(!script)throw new Error('LMS_CANDIDATE_SCRIPT_MISSING');
  const code=fs.readFileSync(path.join(directory,script),'utf8');
  if(!code.includes(target.ref)||code.includes(sourceRef)||code.includes(k.service)||code.includes(env.SUPABASE_ACCESS_TOKEN))throw new Error('LMS_CANDIDATE_CONFIGURATION_INVALID');
  const proof={at:new Date().toISOString(),directory,script,sha256:hash(code),targetRef:target.ref,sourceRefAbsent:true,serverCredentialsAbsent:true,deployed:false};save('lms-readiness/candidate.json',proof);emit('lms-candidate',proof);
}
async function validate(realProduction=false){
  const k=await keys(),candidate=read('lms-readiness/candidate.json');
  if(candidate.targetRef!==target.ref)throw new Error('CANDIDATE_TARGET_MISMATCH');
  if(realProduction){
    if(!process.argv.includes('--approved-production'))throw new Error('EXPLICIT_PRODUCTION_SMOKE_APPROVAL_REQUIRED');
    const response=await fetch(origin+'/',{cache:'no-store',signal:AbortSignal.timeout(15000)});const html=await response.text();const asset=html.match(/src="([^"]+\.js)"/)?.[1];
    if(!asset)throw new Error('PRODUCTION_BUNDLE_NOT_FOUND');const js=await(await fetch(new URL(asset,origin),{cache:'no-store',signal:AbortSignal.timeout(15000)})).text();
    if(hash(js)!==candidate.sha256||!js.includes(target.ref)||js.includes(sourceRef))throw new Error('REFUSING_TEST_OF_UNPROMOTED_PRODUCTION');
  }
  const child=spawn(process.execPath,['scripts/validate-live.mjs','--browser'],{env:{...process.env,VITE_SUPABASE_URL:url,VITE_SUPABASE_PUBLISHABLE_KEY:k.pub,SUPABASE_ACCESS_TOKEN:env.SUPABASE_ACCESS_TOKEN,SUPABASE_PROJECT_REF:target.ref,SUPABASE_DB_PASSWORD:target.password,LMS_MIGRATION_CANDIDATE_DIR:realProduction?'':candidate.directory,LMS_PRODUCTION_SMOKE:realProduction?'1':'0',LMS_STORED_VARIANTS:'1'},windowsHide:true,stdio:['ignore','pipe','pipe']});
  const chunks=[];child.stdout.on('data',b=>chunks.push(b));child.stderr.on('data',b=>chunks.push(b));const status=await new Promise((resolve,reject)=>{child.on('close',resolve);child.on('error',reject)});
  const output=Buffer.concat(chunks).toString();save(prefix+'/validation.log',output);
  const proof={at:new Date().toISOString(),status,checks:output.split(/\r?\n/).filter(l=>l.startsWith('PASS ')),candidateServedAtProductionOrigin:!realProduction,productionDeploymentUnchanged:!realProduction};
  save('lms-readiness/validation.json',proof);emit('lms-validation',proof);if(status!==0)throw new Error('LMS_VALIDATION_FAILED');
}
async function deployGuards(){
  const work=path.join(base,'lms-functions',stamp);fs.mkdirSync(path.join(work,'supabase'),{recursive:true});
  fs.cpSync(path.join(root,'supabase/functions'),path.join(work,'supabase/functions'),{recursive:true});
  fs.copyFileSync(path.join(root,'supabase/config.toml'),path.join(work,'supabase/config.toml'));
  for(const slug of ['lesreport','push-dispatch']){
    const child=spawn(process.execPath,[path.join(root,'node_modules/supabase/dist/supabase.js'),'functions','deploy',slug,'--project-ref',target.ref,'--use-api','--workdir',work],{env:{...process.env,SUPABASE_ACCESS_TOKEN:env.SUPABASE_ACCESS_TOKEN},windowsHide:true,stdio:['ignore','pipe','pipe']});
    const out=[];child.stdout.on('data',b=>out.push(b));child.stderr.on('data',b=>out.push(b));const status=await new Promise((resolve,reject)=>{child.on('close',resolve);child.on('error',reject)});save(prefix+'/deploy-'+slug+'.log',Buffer.concat(out));if(status!==0)throw new Error('LMS_GUARD_DEPLOY_FAILED');
  }
  await targetApi(prefix+'/maintenance-off.json','/secrets','POST',[{name:'LMS_MAINTENANCE',value:'0'},{name:'LMS_STORED_MEDIA_VARIANTS',value:'1'}]);
  const functions=await targetApi(prefix+'/functions-after.json','/functions');const proof={at:new Date().toISOString(),sourceNotDeployed:true,maintenanceEnabled:false,functions:functions.filter(f=>['lesreport','push-dispatch'].includes(f.slug)).map(f=>({slug:f.slug,verify_jwt:f.verify_jwt,status:f.status}))};
  save('lms-readiness/guards-deployed.json',proof);emit('lms-guards-deployed',proof);
}
async function verifyGuards(){
  const k=await keys(),dispatch=read('inventory/edge-secret-values-recovered.json').LMS_PUSH_DISPATCH_SECRET;
  const before=await targetSql('queue-before',"SELECT count(*) AS deliveries,count(*) FILTER (WHERE state IN ('pending','sending'))::int AS claimable,md5(coalesce(string_agg(to_jsonb(d)::text,'' ORDER BY id),'')) AS digest FROM private.lms_push_deliveries d");
  if(before[0].claimable!==0)throw new Error('REFUSING_DISPATCHER_TEST_WITH_CLAIMABLE_DELIVERIES');
  let lesreport,push;
  try{
    await targetApi(prefix+'/maintenance-on-test.json','/secrets','POST',[{name:'LMS_MAINTENANCE',value:'1'}]);
    // Only the maintenance response is exercised; the gate precedes claiming work.
    for(let attempt=0;attempt<8;attempt++){
      const a=await fetch(url+'/functions/v1/lesreport',{method:'POST',headers:{Origin:origin,apikey:k.pub,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(15000)});lesreport=a.status;await a.body?.cancel();
      // Do not send dispatcher credentials until its deployed source guard is verified.
      if(lesreport===503)break;await new Promise(r=>setTimeout(r,2000));
    }
    if(lesreport!==503)throw new Error('LMS_MAINTENANCE_PROPAGATION_FAILED');
    const b=await fetch(url+'/functions/v1/push-dispatch',{method:'POST',headers:{'x-lms-push-secret':dispatch},signal:AbortSignal.timeout(15000)});push=b.status;await b.body?.cancel();
    if(push!==503)throw new Error('PUSH_MAINTENANCE_GUARD_FAILED');
  }finally{await targetApi(prefix+'/maintenance-off-test.json','/secrets','POST',[{name:'LMS_MAINTENANCE',value:'0'}])}
  for(let attempt=0;attempt<8;attempt++){
    const response=await fetch(url+'/functions/v1/lesreport',{method:'POST',headers:{Origin:origin,apikey:k.pub,'Content-Type':'application/json'},body:JSON.stringify({action:'issue-link'}),signal:AbortSignal.timeout(15000)});
    const status=response.status;await response.body?.cancel();if(status===401)break;if(attempt===7)throw new Error('MAINTENANCE_OFF_NOT_CONFIRMED');await new Promise(r=>setTimeout(r,2000));
  }
  const after=await targetSql('queue-after',"SELECT count(*) AS deliveries,count(*) FILTER (WHERE state IN ('pending','sending'))::int AS claimable,md5(coalesce(string_agg(to_jsonb(d)::text,'' ORDER BY id),'')) AS digest FROM private.lms_push_deliveries d");
  if(canonical(before)!==canonical(after))throw new Error('PUSH_QUEUE_CHANGED_DURING_GUARD_TEST');
  const ssl=await targetApi(prefix+'/ssl-final.json','/ssl-enforcement');
  const proof={at:new Date().toISOString(),lesreport,push,deliveryQueueUnchanged:true,maintenanceDisabledAfterTest:true,cronNotEnabled:true,ssl};save('lms-readiness/maintenance-edge-test.json',proof);emit('lms-maintenance-tested',proof);
}
async function testSqlFence(){
  const text=fs.readFileSync(path.join(root,'supabase/setup/lms_cutover_freeze.sql'),'utf8');
  const body=text.split('-- BEGIN LMS FENCE BODY')[1]?.split('-- END LMS FENCE BODY')[0]?.replace(/^.*also exercised.*\r?\n/,'');
  if(!body||!body.includes('CREATE OR REPLACE FUNCTION private.lms_cutover_fence'))throw new Error('FENCE_BODY_NOT_FOUND');
  const test=`BEGIN; SET LOCAL lock_timeout='10s'; SET LOCAL statement_timeout='60s';
    ${body}\n${body}
    DO $test$ BEGIN
      BEGIN UPDATE public.lms_profiles SET name=name; RAISE EXCEPTION 'PROFILE_FENCE_MISSING'; EXCEPTION WHEN SQLSTATE '55000' THEN IF SQLERRM NOT LIKE 'LMS_MAINTENANCE:%' THEN RAISE; END IF; END;
      BEGIN TRUNCATE private.lms_request_limits; RAISE EXCEPTION 'TRUNCATE_FENCE_MISSING'; EXCEPTION WHEN SQLSTATE '55000' THEN IF SQLERRM NOT LIKE 'LMS_MAINTENANCE:%' THEN RAISE; END IF; END;
      BEGIN UPDATE storage.buckets SET public=public WHERE id='lms_media'; RAISE EXCEPTION 'BUCKET_FENCE_MISSING'; EXCEPTION WHEN SQLSTATE '55000' THEN IF SQLERRM NOT LIKE 'LMS_MAINTENANCE:%' THEN RAISE; END IF; END;
      BEGIN UPDATE storage.objects SET metadata=metadata WHERE bucket_id='lms_media'; RAISE EXCEPTION 'OBJECT_FENCE_MISSING'; EXCEPTION WHEN SQLSTATE '55000' THEN IF SQLERRM NOT LIKE 'LMS_MAINTENANCE:%' THEN RAISE; END IF; END;
    END $test$;
    SELECT json_build_object('passed',true,'triggers',(SELECT count(*) FROM pg_catalog.pg_trigger WHERE tgname IN ('aaa_lms_cutover_write_fence','aaa_lms_cutover_truncate_fence')),'policies',(SELECT count(*) FROM pg_catalog.pg_policies WHERE policyname LIKE 'lms_cutover_no_%'));
    ROLLBACK;`;
  const output=await targetPsql(prefix+'/sql-fence-rollback-test',test);
  const after=await targetSql('sql-fence-clean',"SELECT to_regclass('private.lms_cutover_state') IS NULL AS control_absent,NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE tgname IN ('aaa_lms_cutover_write_fence','aaa_lms_cutover_truncate_fence')) AS triggers_absent,NOT EXISTS(SELECT 1 FROM pg_catalog.pg_policies WHERE policyname LIKE 'lms_cutover_no_%') AS policies_absent");
  if(!after.every(r=>Object.values(r).every(v=>v===true)))throw new Error('FENCE_TEST_NOT_ROLLED_BACK');
  const proof={at:new Date().toISOString(),sqlAppliedTwiceInRollbackTransaction:true,profileWritesBlocked:true,truncateBlocked:true,lmsStorageWritesBlocked:true,sourceUntouched:true,allTestDdlRolledBack:true};save('lms-readiness/maintenance-sql-test.json',proof);emit('lms-sql-fence-tested',proof);
}
async function prepareCutover(){
  const current=read('lms-readiness/latest-audit.json'),k=await keys(),secrets=read('inventory/edge-secret-values-recovered.json');
  const account=env.CLOUDFLARE_ACCOUNT_ID.match(/[a-f0-9]{32}/)?.[0];
  const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/pages/projects/lms-daz`,{headers:{Authorization:`Bearer ${env.CLOUDFLARE_API_TOKEN}`},signal:AbortSignal.timeout(20000)});
  const cloudflare=await response.json();save(prefix+'/cloudflare-lms-current.json',cloudflare);
  if(!response.ok||!cloudflare.success)throw new Error('LMS_PAGES_CONFIGURATION_UNAVAILABLE');
  const pages=cloudflare.result;
  if(!pages||!pages.domains.includes('lms.daztore.web.id'))throw new Error('LMS_PAGES_PROJECT_NOT_VERIFIED');
  const existing=pages.deployment_configs.production.env_vars;
  const values={VITE_SUPABASE_URL:url,VITE_SUPABASE_PUBLISHABLE_KEY:k.pub,VITE_VAPID_PUBLIC_KEY:secrets.VAPID_PUBLIC_KEY,VITE_LMS_STORED_MEDIA_VARIANTS:'1',SUPABASE_PROJECT_REF:target.ref,SUPABASE_DB_PASSWORD:target.password};
  const proposed={...existing};for(const [name,value] of Object.entries(values))proposed[name]={...(existing[name]??{type:'plain_text'}),value};
  save('lms-readiness/cloudflare-env-proposed.json',{project:'lms-daz',environment:'production',deployment_configs:{production:{env_vars:proposed}}});
  const maintenanceDirectory=path.join(base,'lms-maintenance-candidate');fs.mkdirSync(maintenanceDirectory,{recursive:true});
  fs.writeFileSync(path.join(maintenanceDirectory,'index.html'),'<!doctype html><html lang="id"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pemeliharaan LMS</title><main><h1>LMS sedang dalam pemeliharaan</h1><p>Penyimpanan sementara dihentikan untuk pemindahan server. Simpan pekerjaan yang belum selesai dan buka ulang aplikasi setelah pemeliharaan selesai.</p></main></html>');
  fs.writeFileSync(path.join(maintenanceDirectory,'_headers'),'/*\n  Cache-Control: no-store\n  Referrer-Policy: no-referrer\n  X-Content-Type-Options: nosniff\n  Content-Security-Policy: default-src \'none\'; frame-ancestors \'none\'\n');
  fs.writeFileSync(path.join(maintenanceDirectory,'_redirects'),'/* /index.html 200\n');
  const sourceData=read(current.prefix+'/source-data.json'),targetData=JSON.parse(await targetPsql(prefix+'/sync-target-data',`SELECT coalesce(json_agg(t),'[]') FROM (${sourceData.map(t=>`SELECT ${lit(t.schema)} AS schema,${lit(t.name)} AS name,coalesce((SELECT json_agg(r ORDER BY r) FROM (SELECT to_jsonb(x)::text AS r FROM ${q(t.schema)}.${q(t.name)} x) rows),'[]'::json) AS rows`).join(' UNION ALL ')}) t`,{readonly:true}));
  const tables=sourceData.map(s=>{const t=targetData.find(t=>t.schema===s.schema&&t.name===s.name);return {schema:s.schema,name:s.name,sourceRows:s.rows.length,targetRows:t.rows.length,equal:canonical(s.rows)===canonical(t.rows),runtimeOnly:s.name==='lms_request_limits'}});
  const sourceMaintenanceRelease=await prepareSourceMaintenance();
  const publicResponse=await fetch(origin+'/',{cache:'no-store',signal:AbortSignal.timeout(15000)});const html=await publicResponse.text();const asset=html.match(/src="([^"]+\.js)"/)?.[1];if(!asset)throw new Error('CURRENT_PRODUCTION_ASSET_NOT_FOUND');
  const productionJs=await(await fetch(new URL(asset,origin),{cache:'no-store',signal:AbortSignal.timeout(15000)})).text();
  const plan={at:new Date().toISOString(),source:sourceRef,target:target.ref,dryRun:true,sourceSnapshotAt:current.at,freezeRequired:true,fullRestoreForbidden:true,nonLmsTablesExcluded:true,authScope:'Only LMS-linked accounts/identities; preserve shared/non-LMS users and target sessions. Re-login into target JWT namespace.',storageScope:'lms_media only: version/hash/owner based delta, preserve originals, backfill and validate 3 bounded private WebP variants for every new ready asset before promotion; never blanket delete or overwrite.',sourceMaintenanceRelease,production:{branch:pages.production_branch,rollbackDeploymentId:pages.canonical_deployment?.id,stillUsesUs:productionJs.includes(sourceRef),usesTarget:productionJs.includes(target.ref)},tables,conflictRule:'Re-read both sides after approved freeze; compare with captured target baseline. Preserve target-only/newer changes; abort on competing updates/deletes until reconciled. No DELETE or TRUNCATE is generated.',sequenceRule:'Inspect LMS audit sequence and shared Auth sequence; never decrease counters. Preserve non-LMS sequences.',runtimeRule:'Request limits are per-project runtime state, not business data. IP keys are salted with the project server key and are not portable. Archive US windows; preserve target windows and do not replay stale US IP counters or replace the table.',otherAppsBlockCutover:false};
  save('lms-readiness/final-sync-plan.json',plan);emit('lms-cutover-prepared',{...plan,environmentKeys:Object.keys(values),cloudflareProductionUnchanged:true,existingAccessTokenPreserved:true});
}
async function prepareSourceMaintenance(){
  const {open}=await import('./supabase-full-migration.mjs');
  const directory=path.join(base,'lms-functions','source-maintenance-verified');
  fs.mkdirSync(path.join(directory,'supabase/functions'),{recursive:true});
  const manifest=read('functions/source-manifest.json').filter(f=>f.path.startsWith('supabase/functions/'));
  const files=[];
  for(const item of manifest){
    const original=open(fs.readFileSync(path.join(base,'functions/source',item.path+'.enc')));
    if(hash(original)!==item.sha256)throw new Error('DEPLOYED_SOURCE_CHECKSUM_MISMATCH');
    let content=original;
    if(item.path.endsWith('/lesreport/index.ts')){
      const text=original.toString().replaceAll('\r\n','\n'),anchor='  stage = "request";\n  if (request.method !== "POST")';
      if(!text.includes(anchor)||text.includes('LMS_MAINTENANCE'))throw new Error('SOURCE_LESREPORT_GUARD_ANCHOR_MISMATCH');
      content=Buffer.from(text.replace(anchor,'  if (Deno.env.get("LMS_MAINTENANCE") === "1") return respond({error:"LMS maintenance"},503);\n'+anchor));
    }else if(item.path.endsWith('/push-dispatch/index.ts')){
      const text=original.toString().replaceAll('\r\n','\n'),anchor="  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY');";
      if(!text.includes(anchor)||text.includes('LMS_MAINTENANCE'))throw new Error('SOURCE_PUSH_GUARD_ANCHOR_MISMATCH');
      content=Buffer.from(text.replace(anchor,"  if (Deno.env.get('LMS_MAINTENANCE')==='1') return response(503,{error:'LMS maintenance'});\n"+anchor));
    }
    const destination=path.resolve(directory,item.path);
    if(!destination.startsWith(path.resolve(directory)+path.sep))throw new Error('SOURCE_RELEASE_PATH_INVALID');
    fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,content);
    files.push({path:item.path,originalSha256:item.sha256,releaseSha256:hash(content),maintenanceOnlyPatch:!original.equals(content)});
  }
  fs.writeFileSync(path.join(directory,'supabase/functions/deno.json'),'{"nodeModulesDir":"auto"}\n');
  fs.writeFileSync(path.join(directory,'supabase/config.toml'),'project_id="lms-source-maintenance"\n[functions.lesreport]\nverify_jwt=false\n[functions.push-dispatch]\nverify_jwt=false\n');
  const child=spawn(process.execPath,[path.join(root,'node_modules/deno/bin.cjs'),'check','--config',path.join(directory,'supabase/functions/deno.json'),path.join(directory,'supabase/functions/lesreport/index.ts'),path.join(directory,'supabase/functions/push-dispatch/index.ts')],{windowsHide:true,stdio:['ignore','pipe','pipe']});
  const output=[];child.stdout.on('data',b=>output.push(b));child.stderr.on('data',b=>output.push(b));const status=await new Promise((resolve,reject)=>{child.on('close',resolve);child.on('error',reject)});
  save(prefix+'/source-maintenance-typecheck.log',Buffer.concat(output));if(status!==0)throw new Error('SOURCE_MAINTENANCE_TYPECHECK_FAILED');
  save('lms-readiness/source-maintenance-release.json',{at:new Date().toISOString(),directory,files,typecheckPassed:true,deployed:false,source:'verified encrypted deployed-source backup; only maintenance guards patched'});
  return directory;
}
async function security(){
  const checks=[];
  for(const [name,column] of [['tables','name'],['columns','table_name'],['constraints','table_name'],['indexes','tablename'],['policies','tablename'],['functions','proname'],['triggers','table_name'],['publication_tables','tablename']]){
    const query=`SELECT * FROM (${catalogQueries[name]}) x WHERE left(${q(column)},4)='lms_' AND left(${q(column)},12)<>'lms_cutover_'${name==='triggers'?" AND tgname NOT IN ('aaa_lms_cutover_write_fence','aaa_lms_cutover_truncate_fence')":''}`;
    const [sourceRows,targetRows]=await Promise.all([sourceSql('catalog-'+name,query),targetSql('catalog-'+name,query)]);
    const clean=rows=>rows.map(r=>{const v={...r};for(const k of ['bytes','estimated_rows','acl'])delete v[k];return canonical(v)}).sort();
    checks.push({catalog:name,source:sourceRows.length,target:targetRows.length,equal:canonical(clean(sourceRows))===canonical(clean(targetRows))});
  }
  const query=`SELECT * FROM (${permissionQuery}) x WHERE left(name,4)='lms_' AND left(name,12)<>'lms_cutover_'`;
  const [sourcePerms,targetPerms]=await Promise.all([sourceSql('effective-permissions',query),targetSql('effective-permissions',query)]);
  checks.push({catalog:'effective-permissions',source:sourcePerms.length,target:targetPerms.length,equal:canonical(sourcePerms)===canonical(targetPerms)});
  const cron=await sourceSql('cron-final',"SELECT jobname,schedule,active FROM cron.job WHERE jobname='lms-push-dispatch'");
  const recovered=read('inventory/edge-secret-values-recovered.json');const crypto=await import('node:crypto');const pair=crypto.createECDH('prime256v1');pair.setPrivateKey(Buffer.from(recovered.VAPID_PRIVATE_KEY,'base64url'));
  const proof={at:new Date().toISOString(),checks,vapidPairMatches:pair.getPublicKey().equals(Buffer.from(recovered.VAPID_PUBLIC_KEY,'base64url')),sourceCron:cron};save('lms-readiness/security.json',proof);emit('lms-security',proof);if(checks.some(c=>!c.equal))throw new Error('LMS_SECURITY_CATALOG_MISMATCH');
}
async function preservation(){
  // Integrity guard only; no application tests, source reads, or non-LMS writes.
  const sections=archiveCopies().filter(s=>s.schema==='public'&&!s.name.startsWith('lms_'));
  const marker='__PRESERVE_'+stamp+'__';
  const script="SET LOCAL TIME ZONE 'UTC'; SET LOCAL DateStyle=ISO; SET LOCAL IntervalStyle=postgres; SET LOCAL extra_float_digits=3;\n"+sections.map((s,i)=>`\\echo ${marker}${i}\nCOPY (SELECT ${s.columnSql} FROM ${q(s.schema)}.${q(s.name)}) TO STDOUT;`).join('\n')+`\n\\echo ${marker}END\n`;
  const output=await targetPsql(prefix+'/preservation-copy',script,{readonly:true});const actual=new Map();let current;
  for(const line of output.split(/\r?\n/)){if(line.startsWith(marker)){current=line.slice(marker.length);if(current!=='END')actual.set(Number(current),[])}else if(current!==undefined&&current!=='END'&&line!=='')actual.get(Number(current)).push(line)}
  const fingerprint=rows=>hash([...rows].sort().join('\n'));const checks=sections.map((s,i)=>({schema:s.schema,name:s.name,equal:fingerprint(s.rows)===fingerprint(actual.get(i)??[])}));
  const proof={at:new Date().toISOString(),tables:checks.length,unchangedFromRestoredSnapshot:checks.filter(c=>c.equal).length,applicationTestsRun:false,nonLmsWritesIssued:false,checks};save('lms-readiness/non-lms-preservation.json',proof);emit('non-lms-preservation',{tables:proof.tables,unchanged:proof.unchangedFromRestoredSnapshot,nonLmsWritesIssued:false});
}
async function variants(){
  const {createVariantEncoder,variantObjectPath}=await import('./image-variant-tools.mjs');
  const {createHmac}=await import('node:crypto');
  await targetPsql(prefix+'/variant-policy',fs.readFileSync(path.join(root,'supabase/setup/lms_media_variants.sql'),'utf8'));
  const k=await keys(),admin=createClient(url,k.service,{auth:{persistSession:false,autoRefreshToken:false}});
  const rest=await targetApi(prefix+'/target-rest-for-owner-token.json','/postgrest');
  let signing=rest.jwt_secret;
  if(typeof signing==='string'&&signing.trim().startsWith('{')){const jwks=JSON.parse(signing);const oct=jwks.keys?.find(k=>k.kty==='oct');if(!oct?.k)throw new Error('TARGET_OWNER_SIGNING_KEY_UNAVAILABLE');signing=Buffer.from(oct.k,'base64url')}
  if(!signing||signing.length<24)throw new Error('TARGET_OWNER_SIGNING_KEY_UNAVAILABLE');
  const rows=await targetSql('variant-sources',"SELECT id,owner_id,object_path,kind,state,size_bytes,mime_type FROM public.lms_media_assets WHERE state='ready' ORDER BY id");
  const manifest=read('storage/manifest.json').filter(o=>o.bucket==='lms_media');const encoder=await createVariantEncoder();const results=[];
  try{for(const row of rows){
    const downloaded=await admin.storage.from('lms_media').download(row.object_path);if(downloaded.error||!downloaded.data)throw new Error('ORIGINAL_MEDIA_UNAVAILABLE');
    const bytes=Buffer.from(await downloaded.data.arrayBuffer());
    if(!manifest.some(o=>o.path===row.object_path&&o.sha256===hash(bytes)))throw new Error('ORIGINAL_MEDIA_CHANGED_SINCE_BACKUP');
    const variants=await encoder.encode(bytes,row.mime_type);const now=Math.floor(Date.now()/1000);
    // Owner-scoped, 90-second JWT remains in memory; no user login/session/password changes.
    const header=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
    const payload=Buffer.from(JSON.stringify({iss:url+'/auth/v1',aud:'authenticated',role:'authenticated',sub:row.owner_id,iat:now,exp:now+90})).toString('base64url');
    const signed=header+'.'+payload,token=signed+'.'+createHmac('sha256',signing).update(signed).digest('base64url');
    const owner=createClient(url,k.pub,{global:{headers:{Authorization:'Bearer '+token}},auth:{persistSession:false,autoRefreshToken:false}});
    for(const [variant,file] of Object.entries(variants)){
      const objectPath=variantObjectPath(row.object_path,variant);
      const old=await admin.storage.from('lms_media').download(objectPath);
      if(old.data){if(hash(Buffer.from(await old.data.arrayBuffer()))!==hash(file.bytes))throw new Error('EXISTING_VARIANT_CONFLICT')}
      else{
        const uploaded=await owner.storage.from('lms_media').upload(objectPath,file.bytes,{contentType:'image/webp',upsert:false,cacheControl:'60'});
        if(uploaded.error){save(prefix+'/variant-upload-error.json',{code:uploaded.error.statusCode,message:uploaded.error.message});throw new Error('OWNER_VARIANT_UPLOAD_FAILED')}
      }
      save(prefix+'/variants/'+row.id+'/'+variant+'.webp',file.bytes);
      results.push({assetId:row.id,kind:row.kind,variant,originalBytes:bytes.length,bytes:file.bytes.length,width:file.width,height:file.height,sha256:hash(file.bytes),objectPath});
    }
  }}finally{await encoder.close()}
  const ownership=await targetSql('variant-ownership',"SELECT count(*)::int AS objects,count(*) FILTER(WHERE o.owner_id=a.owner_id::text)::int AS owned FROM storage.objects o JOIN public.lms_media_assets a ON o.name IN (a.object_path||'.lms-v1-avatar.webp',a.object_path||'.lms-v1-thumbnail.webp',a.object_path||'.lms-v1-detail.webp') WHERE o.bucket_id='lms_media'");
  if(ownership[0].objects!==results.length||ownership[0].owned!==results.length)throw new Error('VARIANT_OWNERSHIP_MISMATCH');
  const proof={at:new Date().toISOString(),originals:rows.length,variants:results.length,originalsPreserved:true,ownership:ownership[0],results};save('lms-readiness/variants.json',proof);emit('lms-variants',{...proof,results:results.map(({objectPath,sha256,assetId,...r})=>r)});
}
async function verifyVariants(){
  const {createVariantEncoder}=await import('./image-variant-tools.mjs');
  const proof=read('lms-readiness/variants.json'),k=await keys();const client=createClient(url,k.service,{auth:{persistSession:false,autoRefreshToken:false}});const decoder=await createVariantEncoder();
  const results=[];
  try{for(const file of proof.results){
    const signed=await client.storage.from('lms_media').createSignedUrl(file.objectPath,60);if(signed.error)throw new Error('VARIANT_SIGN_FAILED');
    const parsed=new URL(signed.data.signedUrl),token=parsed.searchParams.get('token');const claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url'));
    const response=await fetch(parsed,{signal:AbortSignal.timeout(15000)});const bytes=Buffer.from(await response.arrayBuffer());if(!response.ok||hash(bytes)!==file.sha256)throw new Error('VARIANT_READBACK_MISMATCH');
    const rendered=await decoder.decode(bytes);if(rendered.width!==file.width||rendered.height!==file.height||claims.exp-claims.iat!==60)throw new Error('VARIANT_RENDER_OR_TTL_FAILED');
    results.push({variant:file.variant,bytes:bytes.length,width:rendered.width,height:rendered.height,signatureSeconds:claims.exp-claims.iat,readbackMatches:true});
  }}finally{await decoder.close()}
  // Read the encrypted original catalog through the shared crypto helper.
  const {open}=await import('./supabase-full-migration.mjs');const catalog=JSON.parse(open(fs.readFileSync(path.join(base,'restore/storage-catalog.stdout.enc'))).toString()).filter(o=>o.bucket_id==='lms_media');
  const current=await targetSql('original-media-metadata',"SELECT id,bucket_id,name,owner,owner_id,metadata,user_metadata,version FROM storage.objects WHERE bucket_id='lms_media' AND name NOT LIKE '%.lms-v1-%.webp' ORDER BY bucket_id,name");
  const originalsUnchanged=canonical(current)===canonical(catalog);if(!originalsUnchanged)throw new Error('ORIGINAL_STORAGE_METADATA_CHANGED');
  const sample=client.storage.from('lms_media').getPublicUrl(proof.results[0].objectPath).data.publicUrl;
  const denied=await fetch(sample,{signal:AbortSignal.timeout(15000)});await denied.body?.cancel();if(denied.ok)throw new Error('PRIVATE_VARIANT_PUBLICLY_ACCESSIBLE');
  const totals=Object.fromEntries(['avatar','thumbnail','detail'].map(v=>[v,results.filter(r=>r.variant===v).reduce((n,r)=>n+r.bytes,0)]));
  const summary={at:new Date().toISOString(),variants:results.length,originalsUnchanged,privatePublicEndpointDenied:true,allRendered:true,allChecksumsMatch:true,totals,results};save('lms-readiness/variant-verification.json',summary);emit('lms-variants-verified',summary);
}
async function notifications(){
  const {createServer}=await import('node:http');const candidate=read('lms-readiness/candidate.json'),k=await keys();
  const guard=await targetSql('notification-guard',"SELECT (SELECT count(*) FROM cron.job WHERE jobname='lms-push-dispatch' AND active)::int AS active_jobs,(SELECT count(*) FROM private.lms_push_deliveries WHERE state IN ('pending','sending'))::int AS claimable");
  if(guard[0].active_jobs||guard[0].claimable)throw new Error('NOTIFICATION_TEST_REQUIRES_QUARANTINED_EMPTY_OUTBOX');
  const server=createServer((request,response)=>{
    const pathname=new URL(request.url,'http://127.0.0.1:3000').pathname;
    const file=path.resolve(candidate.directory,'.'+(pathname==='/'?'/index.html':decodeURIComponent(pathname)));
    if(!file.startsWith(path.resolve(candidate.directory)+path.sep)){response.writeHead(403);response.end();return}
    try{const bytes=fs.readFileSync(file),type={'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'}[path.extname(file)]??'application/octet-stream';response.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'});response.end(bytes)}catch{response.writeHead(404);response.end()}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(3000,'127.0.0.1',resolve)});
  try{
    const child=spawn(process.execPath,['scripts/validate-live.mjs','--notifications'],{env:{...process.env,VITE_SUPABASE_URL:url,VITE_SUPABASE_PUBLISHABLE_KEY:k.pub,SUPABASE_ACCESS_TOKEN:env.SUPABASE_ACCESS_TOKEN,LMS_STORED_VARIANTS:'1'},windowsHide:true,stdio:['ignore','pipe','pipe']});
    const chunks=[];child.stdout.on('data',b=>chunks.push(b));child.stderr.on('data',b=>chunks.push(b));const status=await new Promise((resolve,reject)=>{child.on('close',resolve);child.on('error',reject)});
    const output=Buffer.concat(chunks).toString();save(prefix+'/validation.log',output);
    const proof={at:new Date().toISOString(),status,checks:output.split(/\r?\n/).filter(l=>l.startsWith('PASS ')),realProviderNotContacted:true,cronNotEnabled:true};save('lms-readiness/notifications.json',proof);emit('lms-notifications',proof);if(status!==0)throw new Error('LMS_NOTIFICATION_TEST_FAILED');
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
}
async function finalStatus(){
  const original=read('inventory/edge-secrets.json');
  const sourceSecrets=await request(prefix+'/source-secrets-final.json',`/v1/projects/${sourceRef}/secrets`);
  const sourceFunctions=await request(prefix+'/source-functions-final.json',`/v1/projects/${sourceRef}/functions`);
  const sourceCron=await sourceSql('cron-status',"SELECT jobname,schedule,active FROM cron.job WHERE jobname='lms-push-dispatch'");
  const beforeFunctions=read('inventory/functions.json');
  const sourceAuth=await request(prefix+'/source-auth-final.json',`/v1/projects/${sourceRef}/config/auth`);
  const flags=await targetApi(prefix+'/target-final-secret-metadata.json','/secrets');
  const targetRuntime=await targetSql('runtime-final',"SELECT (SELECT count(*) FROM cron.job WHERE jobname='lms-push-dispatch' AND active)::int AS active_jobs,(SELECT count(*) FROM net.http_request_queue)::int AS queued_requests,(SELECT count(*) FROM private.lms_push_deliveries WHERE state IN ('pending','sending'))::int AS claimable");
  const proof={at:new Date().toISOString(),sourceCustomSecretsUnchanged:original.filter(s=>!s.name.startsWith('SUPABASE_')).every(s=>sourceSecrets.some(t=>t.name===s.name&&t.value===s.value)),sourceLmsFunctionsUnchanged:beforeFunctions.filter(f=>['lesreport','push-dispatch'].includes(f.slug)).every(f=>sourceFunctions.some(t=>t.slug===f.slug&&t.version===f.version&&t.verify_jwt===f.verify_jwt)),sourceAuthConfigUnchanged:canonical(sourceAuth)===canonical(read('inventory/auth.json')),sourceCron,targetRuntime,maintenanceOff:flags.some(s=>s.name==='LMS_MAINTENANCE'&&s.value===hash('0')),storedVariantsOn:flags.some(s=>s.name==='LMS_STORED_MEDIA_VARIANTS'&&s.value===hash('1'))};save('lms-readiness/final-status.json',proof);emit('lms-final-status',proof);
}

const action=process.argv[2];
if(action==='diagnose'){
  const {open}=await import('./supabase-full-migration.mjs');
  const files=fs.readdirSync(path.join(base,'lms-readiness')).map(d=>path.join(base,'lms-readiness',d,'validation.log.enc')).filter(f=>fs.existsSync(f)).sort();
  const file=files.at(-1);let log=open(fs.readFileSync(file)).toString();
  for(const value of Object.values(env).filter(v=>v.length>8))log=log.replaceAll(value,'[redacted]');
  const lines=log.split(/\r?\n/),index=lines.findIndex(l=>l.startsWith('FAIL'));
  emit('lms-validation-diagnostic',{errors:lines.slice(index,index+14).map(l=>l.replace(/https?:\/\/\S+/g,'[url]').replace(/eyJ[A-Za-z0-9_.-]+/g,'[token]').replace(/[-\w.+]+@[-\w.]+/g,'[email]'))});process.exit(0);
}
try{if(action==='audit')await audit();else if(action==='media')await media();else if(action==='configure')await configure();else if(action==='build')await build();else if(action==='validate')await validate();else if(action==='production-smoke')await validate(true);else if(action==='deploy-guards')await deployGuards();else if(action==='verify-guards')await verifyGuards();else if(action==='test-sql-fence')await testSqlFence();else if(action==='prepare-cutover')await prepareCutover();else if(action==='security')await security();else if(action==='preservation')await preservation();else if(action==='variants')await variants();else if(action==='verify-variants')await verifyVariants();else if(action==='notifications')await notifications();else if(action==='final-status')await finalStatus();else throw new Error('UNKNOWN_LMS_ACTION')}
catch(e){save(prefix+'/error.json',{name:e.name,message:e.message});emit('lms-stopped',{reason:/^[A-Z_]+$/.test(e.message)?e.message:'LMS_OPERATION_FAILED'});process.exitCode=1}
