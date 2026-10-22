// Explicitly approved Phase 3 executor. No full restore or non-LMS writes.
// Credentials, raw records, CLI logs and rollback configuration stay encrypted.
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createClient} from '@supabase/supabase-js';
import {root,env,base,hash,open,read,save,emit,nativeQuery,targetState,targetApi,targetPsql,archiveCopies} from './supabase-full-migration.mjs';

const source='zfpfccznrbotrvfqcdzh',target=targetState(),origin='https://lms.daztore.web.id';
if(new URL(env.OLD_SUPABASE_URL).hostname!==source+'.supabase.co'||target.ref!=='zfhrzehocewhflytfbyl')throw Error('PROJECT_IDENTITY_MISMATCH');
if(!process.argv.includes('--approved-phase3'))throw Error('PHASE3_APPROVAL_REQUIRED');
const action=process.argv[2],stamp=new Date().toISOString().replaceAll(':','-');
const prefix='lms-cutover/'+stamp;
const canonical=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
const ident=s=>'"'+s.replaceAll('"','""')+'"';
const lit=s=>"'"+s.replaceAll("'","''")+"'";
const stateName='lms-cutover/state.json';
function state(){return read(stateName)}
function progress(fields){const s={...state(),...fields,updatedAt:new Date().toISOString()};save(stateName,s);return s}
function requirePhase(phase){if(state().phase!==phase)throw Error('CUTOVER_CHECKPOINT_REQUIRED')}
async function run(name,args,{command=process.execPath,cwd=root,extraEnv={}}={}){
  const child=spawn(command,args,{cwd,env:{...process.env,...extraEnv},windowsHide:true,stdio:['ignore','pipe','pipe']});
  const chunks=[];child.stdout.on('data',b=>chunks.push(b));child.stderr.on('data',b=>chunks.push(b));
  const status=await new Promise((resolve,reject)=>{child.on('close',resolve);child.on('error',reject)});
  const bytes=Buffer.concat(chunks);save(prefix+'/'+name+'.log',bytes);
  if(status!==0)throw Error(name.toUpperCase().replaceAll('-','_')+'_FAILED');
  emit('cutover-command-complete',{name});return bytes.toString();
}
async function srcApi(name,suffix,method='GET',body){
  if(method!=='GET'&&!(suffix==='/secrets'&&method==='POST'&&body.length===1&&body[0].name==='LMS_MAINTENANCE'&&['0','1'].includes(body[0].value)))throw Error('SOURCE_API_SCOPE_REJECTED');
  const r=await fetch(`https://api.supabase.com/v1/projects/${source}${suffix}`,{method,headers:{Authorization:`Bearer ${env.SUPABASE_ACCESS_TOKEN}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(120000)});
  const bytes=Buffer.from(await r.arrayBuffer());save(prefix+'/'+name+'.json',bytes);if(!r.ok)throw Error('SOURCE_API_FAILED');return bytes.length?JSON.parse(bytes.toString()):null;
}
async function srcSql(name,sql,{freeze=false,proof=false}={}){
  // Only the reviewed SQL freeze file and non-persistent fence probes are admitted.
  if(!freeze&&!proof)throw Error('SOURCE_SQL_SCOPE_REJECTED');
  if(freeze&&sql!==fs.readFileSync(path.join(root,'supabase/setup/lms_cutover_freeze.sql'),'utf8'))throw Error('SOURCE_FREEZE_CHECKSUM_MISMATCH');
  const pools=read('inventory/pooler.json'),p=pools.find(p=>p.pool_mode==='session')??pools[0];
  const child=spawn('C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe',['-X','--no-password','-A','-t','-q','-b','--set=ON_ERROR_STOP=1','--set=LMS_CUTOVER_APPROVED=true'],{env:{...process.env,PGHOST:p.db_host,PGPORT:'5432',PGUSER:p.db_user,PGDATABASE:p.db_name,PGPASSWORD:env.OLD_DB_PASSWORD,PGSSLMODE:'require',PGCONNECT_TIMEOUT:'20'},windowsHide:true,stdio:['pipe','pipe','pipe']});
  const out=[],err=[];child.stdout.on('data',b=>out.push(b));child.stderr.on('data',b=>err.push(b));child.stdin.on('error',()=>{});
  child.stdin.end("SET application_name='lms-approved-cutover';\n"+sql);
  const status=await new Promise((resolve,reject)=>{child.on('close',resolve);child.on('error',reject)});
  save(prefix+'/'+name+'.stdout',Buffer.concat(out));save(prefix+'/'+name+'.stderr',Buffer.concat(err));if(status!==0)throw Error('SOURCE_SQL_FAILED');emit('cutover-source-sql-complete',{name});return Buffer.concat(out).toString();
}
async function srcRead(name,sql){const v=await nativeQuery(prefix+'/'+name+'.json',sql);if(!Array.isArray(v))throw Error('SOURCE_READ_FAILED');return v}
async function tgtRead(name,sql){return JSON.parse(await targetPsql(prefix+'/'+name,`SELECT coalesce(json_agg(t),'[]') FROM (${sql}) t`,{readonly:true}))}
async function cf(name,method='GET',body){
  const account=env.CLOUDFLARE_ACCOUNT_ID.match(/[a-f0-9]{32}/)?.[0];if(!account)throw Error('CF_ACCOUNT_INVALID');
  const r=await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/pages/projects/lms-daz`,{method,headers:{Authorization:`Bearer ${env.CLOUDFLARE_API_TOKEN}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(45000)});
  const bytes=Buffer.from(await r.arrayBuffer());save(prefix+'/'+name+'.json',bytes);let data;try{data=JSON.parse(bytes)}catch{throw Error('CF_RESPONSE_INVALID')}
  if(!r.ok||!data.success)throw Error('CF_API_FAILED');if(!data.result?.domains?.includes('lms.daztore.web.id'))throw Error('CF_DOMAIN_MISMATCH');return data.result;
}
async function targetBaseline(){
  const sections=archiveCopies().filter(s=>s.schema==='public'&&!s.name.startsWith('lms_'));
  const sql=sections.map(s=>`SELECT ${lit(s.name)} AS name,coalesce((SELECT json_agg(r ORDER BY r) FROM (SELECT to_jsonb(x)::text AS r FROM public.${ident(s.name)} x) t),'[]'::json) AS rows`).join(' UNION ALL ');
  const rows=await tgtRead('non-lms-baseline',sql);const storage=await tgtRead('non-lms-storage',"SELECT to_jsonb(o)::text AS row FROM storage.objects o WHERE bucket_id<>'lms_media' ORDER BY bucket_id,name");
  return {tables:rows.map(t=>({name:t.name,count:t.rows.length,sha256:hash(t.rows.join('\n'))})),storageSha256:hash(canonical(storage)),storageCount:storage.length};
}
function auditOkay(a){
  if(a.source!==source||a.target!==target.ref||a.tables.length!==20||a.tables.filter(t=>t.name!=='lms_request_limits').some(t=>!t.equal)||a.auth.some(t=>!t.lmsCriticalFieldsEqual)||a.usUrlReferences.length||a.customSecrets.some(s=>!s.matches)||!a.vaultDispatchMatches||!a.vaultUrlMatches)throw Error('LMS_FINAL_COMPARISON_REQUIRES_RECONCILIATION');
}
async function preflight(){
  if(fs.existsSync(path.join(base,stateName+'.enc')))throw Error('EXISTING_CUTOVER_CHECKPOINT_MUST_NOT_BE_OVERWRITTEN');
  const a=read('lms-readiness/latest-audit.json');auditOkay(a);if(Date.now()-Date.parse(a.at)>15*60e3)throw Error('FRESH_AUDIT_REQUIRED');
  if(a.cron.some(j=>j.active)||a.queuedRequests)throw Error('TARGET_NOT_QUARANTINED');
  const c=read('lms-readiness/candidate.json'),release=read('lms-readiness/source-maintenance-release.json');
  if(!release.typecheckPassed||hash(fs.readFileSync(path.join(c.directory,c.script)))!==c.sha256)throw Error('RELEASE_CHECKSUM_INVALID');
  for(const f of release.files)if(hash(fs.readFileSync(path.join(release.directory,f.path)))!==f.releaseSha256)throw Error('SOURCE_RELEASE_CHECKSUM_INVALID');
  const code=fs.readFileSync(path.join(c.directory,c.script),'utf8'),keys=read('target/api-keys.json');
  if(!code.includes(target.ref)||code.includes(source)||keys.filter(k=>k.name==='service_role').some(k=>code.includes(k.api_key))||code.includes(env.SUPABASE_ACCESS_TOKEN))throw Error('CANDIDATE_CREDENTIAL_CHECK_FAILED');
  const validation=read('lms-readiness/validation.json');if(validation.status!==0||validation.checks.length<30)throw Error('CANDIDATE_VALIDATION_REQUIRED');
  const pages=await cf('pages-before');if(pages.production_branch!=='main'||!pages.canonical_deployment?.id)throw Error('PAGES_ROLLBACK_CHECKPOINT_MISSING');
  const secrets=read('inventory/edge-secret-values-recovered.json');
  if(pages.deployment_configs.production.env_vars.VITE_VAPID_PUBLIC_KEY?.value!==secrets.VAPID_PUBLIC_KEY)throw Error('VAPID_KEY_MISMATCH');
  const funcs=await srcApi('source-functions-before','/functions'),original=read('inventory/functions.json');
  if(original.filter(f=>['lesreport','push-dispatch'].includes(f.slug)).some(f=>!funcs.some(t=>t.slug===f.slug&&t.version===f.version&&t.verify_jwt===f.verify_jwt)))throw Error('SOURCE_FUNCTION_DRIFT');
  const sql="SELECT (SELECT count(*) FROM private.lms_push_deliveries WHERE state IN ('pending','sending'))::int AS claimable,(SELECT count(*) FROM public.lms_media_assets WHERE state='pending')::int AS pending_uploads";
  const sourceRuntime=await srcRead('source-runtime-before',sql),targetRuntime=await tgtRead('target-runtime-before',sql);
  if(sourceRuntime[0].claimable||targetRuntime[0].claimable||sourceRuntime[0].pending_uploads||targetRuntime[0].pending_uploads)throw Error('INFLIGHT_LMS_WORK_REQUIRES_DRAIN');
  save('lms-cutover/checkpoint-pages.json',pages);save('lms-cutover/checkpoint-audit.json',a);save('lms-cutover/checkpoint-target-preservation.json',await targetBaseline());
  save('lms-cutover/checkpoint-source-data.json',read(a.prefix+'/source-data.json'));save('lms-cutover/checkpoint-source-auth.json',read(a.prefix+'/source-auth.json'));
  save('lms-cutover/checkpoint-target-data.json',JSON.parse(open(fs.readFileSync(path.join(base,a.prefix,'target-data.stdout.enc')))));
  save('lms-cutover/checkpoint-source-functions.json',funcs);save('lms-cutover/checkpoint-source-secrets.json',await srcApi('source-secrets-before','/secrets'));
  const checkpoint={startedAt:new Date().toISOString(),phase:'preflight-passed',source,target:target.ref,checkpointPrefix:prefix,rollbackDeployment:pages.canonical_deployment.id,productionBranch:pages.production_branch,candidate:c,freezeSqlSha256:hash(fs.readFileSync('supabase/setup/lms_cutover_freeze.sql')),sourceMaintenanceDirectory:release.directory};save(stateName,checkpoint);
  emit('cutover-preflight-passed',{at:checkpoint.startedAt,businessRows:a.tables.filter(t=>t.name!=='lms_request_limits').reduce((n,t)=>n+t.sourceRows,0),rollbackDeployment:checkpoint.rollbackDeployment,targetCronInactive:true});
}
async function edgeMaintenanceProof(){
  const secret=read('inventory/edge-secret-values-recovered.json').LMS_PUSH_DISPATCH_SECRET;
  for(const slug of ['lesreport','push-dispatch']){
    let okay=false;
    for(let i=0;i<15;i++){
      const r=await fetch(env.OLD_SUPABASE_URL+'/functions/v1/'+slug,{method:'POST',headers:slug==='lesreport'?{Origin:origin,apikey:env.OLD_PUBLISHABLE_KEY,'Content-Type':'application/json'}:{'x-lms-push-secret':secret},body:slug==='lesreport'?JSON.stringify({action:'issue-link'}):undefined,signal:AbortSignal.timeout(15000)});
      const text=await r.text();save(prefix+'/source-maintenance-'+slug+'-'+i+'.json',{status:r.status,body:text});
      if(r.status===503&&/LMS maintenance/.test(text)){okay=true;break}await new Promise(r=>setTimeout(r,2000));
    }
    if(!okay)throw Error('SOURCE_EDGE_MAINTENANCE_UNPROVEN');
  }
}
async function freeze(){
  requirePhase('preflight-passed');const s=state();
  if(hash(fs.readFileSync('supabase/setup/lms_cutover_freeze.sql'))!==s.freezeSqlSha256)throw Error('REVIEWED_FREEZE_SQL_CHANGED');
  progress({phase:'source-maintenance-started',maintenanceStartedAt:new Date().toISOString()});
  await srcApi('source-maintenance-on','/secrets','POST',[{name:'LMS_MAINTENANCE',value:'1'}]);
  for(const slug of ['lesreport','push-dispatch'])await run('source-deploy-'+slug,[path.join(root,'node_modules/supabase/dist/supabase.js'),'functions','deploy',slug,'--project-ref',source,'--use-api','--workdir',s.sourceMaintenanceDirectory],{extraEnv:{SUPABASE_ACCESS_TOKEN:env.SUPABASE_ACCESS_TOKEN}});
  await edgeMaintenanceProof();
  await srcSql('freeze-applied',fs.readFileSync('supabase/setup/lms_cutover_freeze.sql','utf8'),{freeze:true});
  progress({phase:'source-frozen',frozenAt:new Date().toISOString(),freezePrefix:prefix});
  await verifyFence();
}
async function verifyFence(){
  if(!['source-frozen','sync-verified','deployed','smoke-passed','active'].includes(state().phase))throw Error('SOURCE_NOT_FROZEN');
  const tables=read('lms-cutover/checkpoint-audit.json').tables;
  const gate=await srcRead('source-fence-catalog',"SELECT (SELECT active FROM private.lms_cutover_state WHERE singleton) AS frozen,(SELECT count(*) FROM pg_catalog.pg_trigger WHERE tgname IN ('aaa_lms_cutover_write_fence','aaa_lms_cutover_truncate_fence') AND tgenabled='O')::int AS triggers,(SELECT count(*) FROM pg_catalog.pg_policies WHERE policyname IN ('lms_cutover_no_insert','lms_cutover_no_update','lms_cutover_no_delete'))::int AS policies,(SELECT count(*) FROM cron.job WHERE jobname='lms-push-dispatch' AND active)::int AS active_lms_jobs,(SELECT count(*) FROM private.lms_push_deliveries WHERE state='sending')::int AS sending");
  if(!gate[0].frozen||gate[0].triggers!==tables.length*2+2||gate[0].policies!==3||gate[0].active_lms_jobs||gate[0].sending)throw Error('SOURCE_FENCE_INCOMPLETE');
  const probes=tables.map(t=>`DO $probe$ DECLARE col text; BEGIN SELECT attname INTO col FROM pg_catalog.pg_attribute WHERE attrelid=${lit(t.schema+'.'+t.name)}::regclass AND attnum>0 AND NOT attisdropped AND attidentity='' AND attgenerated='' ORDER BY attnum LIMIT 1; BEGIN EXECUTE format('UPDATE %I.%I SET %I=%I WHERE ctid=(SELECT ctid FROM %I.%I LIMIT 1)',${lit(t.schema)},${lit(t.name)},col,col,${lit(t.schema)},${lit(t.name)}); RAISE EXCEPTION 'LMS_FENCE_MISSING'; EXCEPTION WHEN SQLSTATE '55000' THEN NULL; END; END $probe$;`).join('\n');
  const storage="DO $probe$ BEGIN BEGIN UPDATE storage.objects SET name=name WHERE ctid=(SELECT ctid FROM storage.objects WHERE bucket_id='lms_media' LIMIT 1); RAISE EXCEPTION 'STORAGE_FENCE_MISSING'; EXCEPTION WHEN SQLSTATE '55000' THEN NULL; END; END $probe$;";
  await srcSql('source-fence-probes','BEGIN; SET LOCAL statement_timeout=\'30s\';\n'+probes+'\n'+storage+'\nROLLBACK;',{proof:true});
  await edgeMaintenanceProof();
  const proof={at:new Date().toISOString(),tables:tables.length,writeProbesPassed:tables.length,storageWriteBlocked:true,triggers:gate[0].triggers,storagePolicies:3,sourceLmsCronInactive:true,edge503:true};save('lms-cutover/freeze-proof.json',proof);emit('cutover-source-frozen',proof);
}
async function finalSync(){
  requirePhase('source-frozen');await verifyFence();
  await run('final-audit',['scripts/supabase-lms-migration.mjs','audit']);const a=read('lms-readiness/latest-audit.json');auditOkay(a);
  // A verified no-op is the safest delta when all business rows already match.
  // Any business/Auth divergence deliberately stops before Pages/environment writes.
  const objectsSql="SELECT id,bucket_id,name,owner,owner_id,metadata,user_metadata,version,updated_at FROM storage.objects WHERE bucket_id='lms_media' ORDER BY name";
  const [so,to]=await Promise.all([srcRead('source-storage-final',objectsSql),tgtRead('target-storage-final',objectsSql)]);
  const k=read('target/api-keys.json').find(k=>k.name==='service_role').api_key;
  const client=createClient(`https://${target.ref}.supabase.co`,k,{auth:{persistSession:false,autoRefreshToken:false}}),manifest=[];
  const variant=read('lms-readiness/variants.json');
  for(const o of so){
    const counterpart=to.find(t=>t.name===o.name);if(!counterpart||counterpart.owner_id!==o.owner_id)throw Error('STORAGE_OWNER_OR_PATH_MISMATCH');
    const r=await fetch(env.OLD_SUPABASE_URL+'/storage/v1/object/authenticated/lms_media/'+o.name.split('/').map(encodeURIComponent).join('/'),{headers:{apikey:env.OLD_SUPABASE_SECRET_KEY},signal:AbortSignal.timeout(120000)});if(!r.ok)throw Error('FINAL_STORAGE_BACKUP_FAILED');const bytes=Buffer.from(await r.arrayBuffer());
    save(prefix+'/storage-originals/'+hash(o.name),bytes);
    const download=await client.storage.from('lms_media').download(o.name);if(download.error)throw Error('TARGET_ORIGINAL_UNAVAILABLE');const tb=Buffer.from(await download.data.arrayBuffer());
    if(hash(bytes)!==hash(tb)||Number(o.metadata?.size)!==bytes.length||Number(counterpart.metadata?.size)!==bytes.length)throw Error('ORIGINAL_CONTENT_MISMATCH');
    manifest.push({name:o.name,owner:o.owner_id,sourceVersion:o.version,targetVersion:counterpart.version,sha256:hash(bytes),bytes:bytes.length});
  }
  for(const v of variant.results){const o=to.find(o=>o.name===v.objectPath),asset=read(a.prefix+'/source-data.json').find(t=>t.name==='lms_media_assets').rows.map(JSON.parse).find(t=>t.id===v.assetId);if(!o||!asset||o.owner_id!==asset.owner_id)throw Error('VARIANT_OWNER_MISMATCH');const d=await client.storage.from('lms_media').download(v.objectPath);if(d.error||hash(Buffer.from(await d.data.arrayBuffer()))!==v.sha256)throw Error('VARIANT_CONTENT_MISMATCH')}
  if(so.length*3!==variant.results.length||to.length!==so.length+variant.results.length)throw Error('LMS_STORAGE_SET_RECONCILIATION_REQUIRED');
  save(prefix+'/storage-final-manifest.json',manifest);
  const baseline=await targetBaseline();if(canonical(baseline)!==canonical(read('lms-cutover/checkpoint-target-preservation.json')))throw Error('NON_LMS_TARGET_CHANGED');
  const sequences=await Promise.all([srcRead('source-sequence-final',"SELECT schemaname,sequencename,last_value FROM pg_catalog.pg_sequences WHERE schemaname IN ('public','private') AND sequencename LIKE 'lms_%' ORDER BY 1,2"),tgtRead('target-sequence-final',"SELECT schemaname,sequencename,last_value FROM pg_catalog.pg_sequences WHERE schemaname IN ('public','private') AND sequencename LIKE 'lms_%' ORDER BY 1,2")]);
  if(sequences[0].some(s=>!sequences[1].some(t=>t.schemaname===s.schemaname&&t.sequencename===s.sequencename&&Number(t.last_value)>=Number(s.last_value))))throw Error('LMS_SEQUENCE_ADVANCE_REQUIRED');
  save('lms-cutover/final-source-data.json',read(a.prefix+'/source-data.json'));save('lms-cutover/final-source-auth.json',read(a.prefix+'/source-auth.json'));save('lms-cutover/final-storage-manifest.json',manifest);
  const proof={at:new Date().toISOString(),auditAt:a.at,auditPrefix:a.prefix,businessTables:19,businessRows:a.tables.filter(t=>t.name!=='lms_request_limits').reduce((n,t)=>n+t.sourceRows,0),businessChecksumsEqual:true,auth:a.auth,originals:so.length,variants:variant.results.length,targetObjects:to.length,originalBytes:manifest.reduce((n,o)=>n+o.bytes,0),runtimeLimiterPreserved:true,deltaRowsWritten:0,nonLmsPreserved:true,sequenceCountersSafe:true,fullRestorePerformed:false,backupPrefix:prefix};
  save('lms-cutover/final-sync-proof.json',proof);progress({phase:'sync-verified',syncAt:proof.at,finalSyncPrefix:prefix});emit('cutover-final-sync-verified',proof);
}
async function deploy(){
  requirePhase('sync-verified');await verifyFence();const s=state();
  if(Date.now()-Date.parse(s.syncAt)>20*60e3)throw Error('FINAL_SYNC_CHECKPOINT_STALE');
  const pages=await cf('pages-before-patch');if(pages.canonical_deployment.id!==s.rollbackDeployment)throw Error('PAGES_CHANGED_DURING_MAINTENANCE');
  const c=s.candidate;if(hash(fs.readFileSync(path.join(c.directory,c.script)))!==c.sha256)throw Error('CANDIDATE_CHANGED');
  const k=read('target/api-keys.json').find(k=>k.name==='anon').api_key,secrets=read('inventory/edge-secret-values-recovered.json');
  const values={VITE_SUPABASE_URL:`https://${target.ref}.supabase.co`,VITE_SUPABASE_PUBLISHABLE_KEY:k,VITE_VAPID_PUBLIC_KEY:secrets.VAPID_PUBLIC_KEY,VITE_LMS_STORED_MEDIA_VARIANTS:'1',SUPABASE_PROJECT_REF:target.ref,SUPABASE_DB_PASSWORD:target.password};
  const vars={...pages.deployment_configs.production.env_vars};for(const [name,value] of Object.entries(values))vars[name]={...(vars[name]??{type:'plain_text'}),value};
  const updated=await cf('pages-env-patched','PATCH',{deployment_configs:{production:{env_vars:vars}}});
  if(Object.entries(values).some(([n,v])=>updated.deployment_configs.production.env_vars[n]?.value!==v))throw Error('CF_ENV_VERIFICATION_FAILED');
  progress({phase:'deploying',pagesEnvUpdatedAt:new Date().toISOString()});
  const npmCli=path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
  await run('pages-production-deploy',[npmCli,'exec','--yes','--package=wrangler@4.151.3','--','wrangler','pages','deploy',c.directory,'--project-name=lms-daz','--branch=main','--commit-dirty=true','--commit-message=LMS Singapore controlled cutover'],{cwd:c.directory,extraEnv:{CLOUDFLARE_API_TOKEN:env.CLOUDFLARE_API_TOKEN,CLOUDFLARE_ACCOUNT_ID:env.CLOUDFLARE_ACCOUNT_ID.match(/[a-f0-9]{32}/)[0],WRANGLER_SEND_METRICS:'false',CI:'true'}});
  const after=await cf('pages-after-deploy');const dep=after.canonical_deployment;if(dep.id===s.rollbackDeployment||dep.environment!=='production'||dep.latest_stage?.status!=='success')throw Error('CF_DEPLOYMENT_NOT_PROMOTED');
  let valid=false;
  for(let i=0;i<15;i++){const r=await fetch(origin+'/?cutover='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(20000)});const html=await r.text();const script=html.match(/src="([^"]+\.js)"/)?.[1];if(script){const bytes=Buffer.from(await(await fetch(new URL(script,origin),{cache:'no-store',signal:AbortSignal.timeout(20000)})).arrayBuffer());const js=bytes.toString();if(hash(bytes)===c.sha256&&js.includes(target.ref)&&!js.includes(source)){valid=true;break}}await new Promise(r=>setTimeout(r,2000))}
  if(!valid)throw Error('PRODUCTION_TARGET_BUNDLE_NOT_CONFIRMED');
  const proof={at:new Date().toISOString(),deploymentId:dep.id,url:dep.url,productionDomain:origin,branch:dep.deployment_trigger?.metadata?.branch??'main',bundleSha256:c.sha256,sourceRefAbsent:true,targetRef:target.ref,oldVapidPreserved:true,environmentKeys:Object.keys(vars),privilegedCredentialsInBundle:false};save('lms-cutover/deployment-proof.json',proof);progress({phase:'deployed',deployedAt:proof.at,deploymentId:dep.id});emit('cutover-production-deployed',proof);
}
async function smoke(){requirePhase('deployed');await run('production-smoke',['scripts/supabase-lms-migration.mjs','production-smoke','--approved-production']);const proof=read('lms-readiness/validation.json');if(proof.status||proof.candidateServedAtProductionOrigin||proof.checks.length<30)throw Error('PRODUCTION_SMOKE_FAILED');save('lms-cutover/production-smoke.json',proof);progress({phase:'smoke-passed',smokeAt:proof.at});emit('cutover-production-smoke-passed',{at:proof.at,checks:proof.checks.length})}
function validationEnv(){return {VITE_SUPABASE_URL:`https://${target.ref}.supabase.co`,VITE_SUPABASE_PUBLISHABLE_KEY:read('target/api-keys.json').find(k=>k.name==='anon').api_key,SUPABASE_ACCESS_TOKEN:env.SUPABASE_ACCESS_TOKEN,SUPABASE_PROJECT_REF:target.ref,SUPABASE_DB_PASSWORD:target.password,LMS_STORED_VARIANTS:'1',LMS_PRODUCTION_SMOKE:'1'}}
async function notifications(){
  requirePhase('smoke-passed');
  const guard=await tgtRead('notification-guard',"SELECT (SELECT count(*) FROM cron.job WHERE jobname='lms-push-dispatch' AND active)::int AS active_jobs,(SELECT count(*) FROM private.lms_push_deliveries WHERE state IN ('pending','sending'))::int AS claimable");
  if(guard[0].active_jobs||guard[0].claimable)throw Error('NOTIFICATION_TEST_REQUIRES_EMPTY_QUARANTINED_OUTBOX');
  const output=await run('production-notifications',['scripts/validate-live.mjs','--notifications'],{extraEnv:validationEnv()});
  const proof={at:new Date().toISOString(),origin,checks:output.split(/\r?\n/).filter(l=>l.startsWith('PASS ')),realProviderTested:false,serviceWorkerFromProduction:true,fixturesCleaned:output.includes('PASS temporary validation data cleaned')};
  save('lms-cutover/production-notifications.json',proof);progress({productionNotificationsAt:proof.at});emit('cutover-production-notifications-passed',{at:proof.at,checks:proof.checks.length,providerDeviceReceiptUnproven:true});
}
async function activate(){
  requirePhase('smoke-passed');if(!state().productionNotificationsAt)throw Error('PRODUCTION_NOTIFICATIONS_REQUIRED');await verifyFence();
  const flags=await targetApi(prefix+'/target-secrets.json','/secrets'),original=read('inventory/edge-secrets.json').filter(s=>!s.name.startsWith('SUPABASE_'));
  if(original.some(s=>!flags.some(t=>t.name===s.name&&t.value===s.value))||!flags.some(s=>s.name==='LMS_MAINTENANCE'&&s.value===hash('0')))throw Error('TARGET_PUSH_SECRET_OR_MAINTENANCE_INVALID');
  const runtime=await tgtRead('activation-runtime',"SELECT (SELECT count(*) FROM cron.job WHERE jobname='lms-push-dispatch')::int AS jobs,(SELECT count(*) FROM cron.job WHERE jobname='lms-push-dispatch' AND active)::int AS active,(SELECT count(*) FROM private.lms_push_deliveries WHERE state IN ('pending','sending'))::int AS claimable,(SELECT count(*) FROM public.lms_push_subscriptions WHERE user_id IS NULL OR endpoint NOT LIKE 'https://%' OR p256dh='' OR auth='')::int AS invalid_subscriptions,(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='lms_push_function_url') AS dispatch_url,(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='lms_push_dispatch_secret') AS dispatch_secret");
  const r=runtime[0],secret=read('inventory/edge-secret-values-recovered.json').LMS_PUSH_DISPATCH_SECRET;
  if(r.jobs!==1||r.active||r.invalid_subscriptions||r.dispatch_url!==`https://${target.ref}.supabase.co/functions/v1/push-dispatch`||r.dispatch_secret!==secret)throw Error('TARGET_SCHEDULER_VALIDATION_FAILED');
  if(r.claimable)throw Error('LIVE_OUTBOX_APPEARED_BEFORE_DISPATCHER_PROBE');
  const response=await fetch(r.dispatch_url,{method:'POST',headers:{'x-lms-push-secret':secret},signal:AbortSignal.timeout(30000)});const body=await response.json();save(prefix+'/dispatcher-empty-probe.json',{status:response.status,body});
  if(response.status!==200||body.accepted!==0||body.failed!==0)throw Error('LIVE_DISPATCHER_ENDPOINT_FAILED');
  await targetPsql(prefix+'/enable-target-cron',"BEGIN; DO $guard$ BEGIN IF (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='lms_push_function_url') IS DISTINCT FROM 'https://zfhrzehocewhflytfbyl.supabase.co/functions/v1/push-dispatch' THEN RAISE EXCEPTION 'Target identity mismatch'; END IF; IF (SELECT count(*) FROM cron.job WHERE jobname='lms-push-dispatch')<>1 THEN RAISE EXCEPTION 'Ambiguous LMS cron'; END IF; END $guard$; SELECT cron.alter_job(jobid,active:=true) FROM cron.job WHERE jobname='lms-push-dispatch'; COMMIT;");
  progress({phase:'active',schedulerActivatedAt:new Date().toISOString()});emit('cutover-singapore-scheduler-enabled',{at:state().schedulerActivatedAt,sourceDispatcherInactive:true,sameVapid:true});
}
async function schedulerSmoke(){
  requirePhase('active');
  const output=await run('production-scheduler',['scripts/validate-live.mjs','--scheduler'],{extraEnv:validationEnv()});
  const evidence=JSON.parse(fs.readFileSync('supabase/.temp/push-scheduler-check.json','utf8'));
  const proof={at:new Date().toISOString(),checks:output.split(/\r?\n/).filter(l=>l.startsWith('PASS ')),evidence,providerDeviceReceiptProven:false};save('lms-cutover/production-scheduler.json',proof);progress({schedulerValidatedAt:proof.at});emit('cutover-scheduler-path-passed',{at:proof.at,ticks:evidence.successfulCronTicks,pgNetToEdge200:true,realDeviceReceiptUnproven:true});
}
async function pinRelease(){
  requirePhase('active');const pages=await cf('pages-before-pin');if(pages.canonical_deployment.id!==state().deploymentId)throw Error('PRODUCTION_CHANGED_BEFORE_PIN');
  // The validated release was uploaded from the dirty local checkout. Until its
  // source is published to main, an automatic Git build could regress this release.
  save('lms-cutover/pages-source-before-pin.json',pages.source);
  const sourceConfig={...pages.source,config:{...pages.source.config,production_deployments_enabled:false}};
  const updated=await cf('pages-release-pinned','PATCH',{source:sourceConfig});
  if(updated.source.config.production_deployments_enabled!==false||updated.canonical_deployment.id!==state().deploymentId)throw Error('PRODUCTION_PIN_FAILED');
  const proof={at:new Date().toISOString(),productionAutoDeployEnabled:false,previewConfigurationPreserved:updated.source.config.preview_deployment_setting===pages.source.config.preview_deployment_setting,productionDeploymentUnchanged:true,reason:'Protect validated local release until corresponding source is published to main; manual Pages deployments remain available.'};save('lms-cutover/production-release-pin.json',proof);progress({productionAutoDeployPaused:true});emit('cutover-production-release-pinned',proof);
}
async function providerPush(){
  requirePhase('active');const cron=await srcRead('source-provider-guard',"SELECT count(*)::int AS active FROM cron.job WHERE jobname='lms-push-dispatch' AND active");if(cron[0].active)throw Error('SOURCE_DISPATCHER_STILL_ACTIVE');
  await run('production-provider-push',['scripts/validate-live.mjs','--provider-push'],{extraEnv:validationEnv()});progress({providerPushValidatedAt:new Date().toISOString()});emit('cutover-provider-push-passed',{realProvider:true,controlledBrowser:true,userPhysicalDeviceTested:false});
}
async function finalStatus(){
  requirePhase('active');
  if(!state().schedulerValidatedAt)throw Error('SCHEDULER_RUNTIME_PROOF_REQUIRED');
  await verifyFence();
  const preserved=await targetBaseline();if(canonical(preserved)!==canonical(read('lms-cutover/checkpoint-target-preservation.json')))throw Error('NON_LMS_PRESERVATION_FAILED');
  const sourceSecrets=await srcApi('source-final-secrets','/secrets'),beforeSecrets=read('lms-cutover/checkpoint-source-secrets.json');
  const sourceCustomUnchanged=beforeSecrets.every(s=>sourceSecrets.some(t=>t.name===s.name&&t.value===s.value));if(!sourceCustomUnchanged)throw Error('SOURCE_EXISTING_SECRET_CHANGED');
  const funcs=await srcApi('source-final-functions','/functions'),before=read('lms-cutover/checkpoint-source-functions.json');
  const nonLmsFunctions=[];
  for(const f of before.filter(f=>!['lesreport','push-dispatch'].includes(f.slug))){
    const current=funcs.find(t=>t.slug===f.slug);
    if(!current||current.verify_jwt!==f.verify_jwt||current.status!=='ACTIVE'||current.updated_at!==f.updated_at)throw Error('NON_LMS_SOURCE_FUNCTION_CHANGED');
    // Setting a project Edge secret increments runtime versions of other
    // functions too. Confirm original source bytes, without invoking that app.
    let sourceBytesUnchanged=true;
    if(current.version!==f.version){
      const dir=path.join(base,'lms-functions','source-preservation-'+stamp);fs.mkdirSync(dir,{recursive:true});
      await run('source-preservation-download-'+f.slug,[path.join(root,'node_modules/supabase/dist/supabase.js'),'functions','download',f.slug,'--project-ref',source,'--use-api','--workdir',dir],{extraEnv:{SUPABASE_ACCESS_TOKEN:env.SUPABASE_ACCESS_TOKEN}});
      const manifest=read('functions/source-manifest.json').filter(m=>m.path.startsWith('supabase/functions/'+f.slug+'/'));
      sourceBytesUnchanged=manifest.length>0&&manifest.every(m=>fs.existsSync(path.join(dir,m.path))&&hash(fs.readFileSync(path.join(dir,m.path)))===m.sha256);
      if(!sourceBytesUnchanged)throw Error('NON_LMS_SOURCE_BYTES_CHANGED');
    }
    nonLmsFunctions.push({slug:f.slug,versionBefore:f.version,versionAfter:current.version,updatedAtUnchanged:true,jwtUnchanged:true,sourceBytesUnchanged,applicationInvoked:false});
  }
  save('lms-cutover/source-non-lms-function-preservation.json',nonLmsFunctions);
  const sourceCron=await srcRead('source-final-cron','SELECT jobid,jobname,schedule,active,command FROM cron.job ORDER BY jobid');
  const originalCron=read('inventory/sql-cron.json');
  if(originalCron.filter(j=>j.jobname!=='lms-push-dispatch').some(j=>!sourceCron.some(t=>canonical(t)===canonical(Object.fromEntries(Object.entries(j).filter(([k])=>['jobid','jobname','schedule','active','command'].includes(k)))))))throw Error('NON_LMS_SOURCE_CRON_CHANGED');
  const sourceAuth=await srcApi('source-final-auth','/config/auth');if(canonical(sourceAuth)!==canonical(read('inventory/auth.json')))throw Error('SOURCE_AUTH_PLATFORM_CHANGED');
  const runtime=await tgtRead('target-final-runtime',"SELECT (SELECT count(*) FROM cron.job WHERE jobname='lms-push-dispatch' AND active)::int AS active_lms_jobs,(SELECT count(*) FROM private.lms_push_deliveries WHERE state IN ('pending','sending'))::int AS claimable,(SELECT count(*) FROM auth.users)::int AS auth_users,(SELECT count(*) FROM auth.identities)::int AS auth_identities,(SELECT count(*) FROM storage.objects WHERE bucket_id='lms_media')::int AS lms_objects");
  if(runtime[0].active_lms_jobs!==1||sourceCron.some(j=>j.jobname==='lms-push-dispatch'&&j.active))throw Error('DISPATCHER_SINGLETON_FAILED');
  const pages=await cf('pages-final');if(pages.canonical_deployment.id!==state().deploymentId)throw Error('PRODUCTION_DEPLOYMENT_CHANGED');
  const projects=await Promise.all([srcApi('source-project-final',''),targetApi(prefix+'/target-project-final.json','')]);
  let provider;try{provider=read('lms-cutover/provider-push.json')}catch{}
  const proof={at:new Date().toISOString(),production:origin,deploymentId:state().deploymentId,targetRef:target.ref,sourceProjectStatus:projects[0].status,targetProjectStatus:projects[1].status,sourceLmsFrozen:true,sourceLmsCronInactive:true,targetLmsCronActive:true,sourceExistingSecretsUnchanged:sourceCustomUnchanged,sourceNonLmsFunctionsUnchanged:true,sourceNonLmsCronUnchanged:true,sourceAuthConfigUnchanged:true,targetNonLmsTablesUnchanged:preserved.tables.length,targetNonLmsObjectsUnchanged:preserved.storageCount,targetRuntime:runtime[0],rollbackDeployment:state().rollbackDeployment,rollbackRequiresReconciliation:true,realProviderDeliveryProven:provider?.nativeNotificationObserved===true,controlledBrowserReceiptProven:provider?.actualPushEventReceived===true,userPhysicalDeviceTested:false,productionAutoDeployPaused:state().productionAutoDeployPaused===true};
  save('lms-cutover/final-status.json',proof);progress({finalVerifiedAt:proof.at});emit('cutover-final-status',proof);
}

try{if(action==='preflight')await preflight();else if(action==='freeze')await freeze();else if(action==='verify-fence')await verifyFence();else if(action==='final-sync')await finalSync();else if(action==='deploy')await deploy();else if(action==='smoke')await smoke();else if(action==='notifications')await notifications();else if(action==='activate')await activate();else if(action==='scheduler-smoke')await schedulerSmoke();else if(action==='pin-release')await pinRelease();else if(action==='provider-push')await providerPush();else if(action==='final-status')await finalStatus();else throw Error('UNKNOWN_CUTOVER_ACTION')}
catch(e){save(prefix+'/error.json',{name:e.name,message:e.message});emit('cutover-stopped',{reason:/^[A-Z0-9_]+$/.test(e.message)?e.message:'CUTOVER_OPERATION_FAILED',checkpoint:(()=>{try{return state().phase}catch{return 'not-started'}})()});process.exitCode=1}
