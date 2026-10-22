// Read-only post-cutover check after the user's original-account/iPhone proof.
import {env,read,save,hash,nativeQuery,targetPsql} from './supabase-full-migration.mjs';
const s=read('lms-cutover/state.json');if(s.phase!=='active')throw Error('ACTIVE_CUTOVER_REQUIRED');
const prefix='lms-cutover/postcheck-'+new Date().toISOString().replaceAll(':','-');
const canonical=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
const lit=v=>"'"+v.replaceAll("'","''")+"'";
const ident=v=>'"'+v.replaceAll('"','""')+'"';
async function sourceRead(name,sql){const result=await nativeQuery(prefix+'/'+name+'.json',sql);if(!Array.isArray(result))throw Error('SOURCE_POSTCHECK_READ_FAILED');return result}
async function targetRead(name,sql){return JSON.parse(await targetPsql(prefix+'/'+name,`SELECT coalesce(json_agg(t),'[]') FROM (${sql}) t`,{readonly:true}))}
const frozen=read('lms-cutover/final-source-data.json').filter(t=>t.name!=='lms_request_limits');
const dataSql=frozen.map(t=>`SELECT ${lit(t.schema)} AS schema,${lit(t.name)} AS name,coalesce((SELECT json_agg(r ORDER BY r) FROM (SELECT to_jsonb(x)::text AS r FROM ${ident(t.schema)}.${ident(t.name)} x) t),'[]'::json) AS rows`).join(' UNION ALL ');
const [sourceData,targetData]=await Promise.all([sourceRead('source-data',dataSql),targetRead('target-data',dataSql)]);
if(canonical(sourceData)!==canonical(frozen))throw Error('FROZEN_SOURCE_LMS_CHANGED');
const sourceRuntime=await sourceRead('source-runtime',`SELECT
 (SELECT count(*) FROM cron.job WHERE jobname='lms-push-dispatch' AND active)::int AS active_jobs,
 (SELECT count(*) FROM cron.job_run_details WHERE jobid IN(SELECT jobid FROM cron.job WHERE jobname='lms-push-dispatch') AND start_time>${lit(s.frozenAt)}::timestamptz)::int AS cron_runs_after_freeze,
 (SELECT count(*) FROM net.http_request_queue WHERE url='https://zfpfccznrbotrvfqcdzh.supabase.co/functions/v1/push-dispatch')::int AS queued_dispatches,
 (SELECT active FROM private.lms_cutover_state WHERE singleton) AS frozen,
 (SELECT count(*) FROM pg_catalog.pg_trigger WHERE tgname IN('aaa_lms_cutover_write_fence','aaa_lms_cutover_truncate_fence') AND tgenabled='O')::int AS fence_triggers`);
const sr=sourceRuntime[0];if(sr.active_jobs||sr.cron_runs_after_freeze||sr.queued_dispatches||!sr.frozen||sr.fence_triggers!==42)throw Error('SOURCE_LMS_NOT_SAFELY_FROZEN');
const secretResponse=await fetch('https://api.supabase.com/v1/projects/zfpfccznrbotrvfqcdzh/secrets',{headers:{Authorization:`Bearer ${env.SUPABASE_ACCESS_TOKEN}`},signal:AbortSignal.timeout(20000)});
if(!secretResponse.ok)throw Error('SOURCE_MAINTENANCE_METADATA_UNAVAILABLE');const secretMetadata=await secretResponse.json();save(prefix+'/source-secret-metadata.json',secretMetadata);
if(!secretMetadata.some(v=>v.name==='LMS_MAINTENANCE'&&v.value===hash('1')))throw Error('SOURCE_EDGE_MAINTENANCE_NOT_ACTIVE');
const targetRuntime=await targetRead('target-runtime',`SELECT
 (SELECT count(*) FROM cron.job WHERE jobname='lms-push-dispatch')::int AS lms_jobs,
 (SELECT count(*) FROM cron.job WHERE jobname='lms-push-dispatch' AND active)::int AS active_jobs,
 (SELECT count(*) FROM cron.job_run_details WHERE jobid IN(SELECT jobid FROM cron.job WHERE jobname='lms-push-dispatch') AND start_time>=${lit(s.schedulerActivatedAt)}::timestamptz)::int AS runs_since_activation,
 (SELECT count(*) FROM cron.job_run_details WHERE jobid IN(SELECT jobid FROM cron.job WHERE jobname='lms-push-dispatch') AND start_time>=${lit(s.schedulerActivatedAt)}::timestamptz AND status='failed')::int AS failed_runs,
 (SELECT max(end_time) FROM cron.job_run_details WHERE jobid IN(SELECT jobid FROM cron.job WHERE jobname='lms-push-dispatch') AND status='succeeded') AS latest_cron_end,
 (SELECT count(*) FROM net._http_response WHERE created>=${lit(s.schedulerActivatedAt)}::timestamptz AND status_code=200 AND NOT timed_out AND error_msg IS NULL)::int AS edge_http_200,
 (SELECT count(*) FROM net._http_response WHERE created>=${lit(s.schedulerActivatedAt)}::timestamptz AND (status_code IS DISTINCT FROM 200 OR timed_out OR error_msg IS NOT NULL))::int AS edge_http_errors,
 (SELECT count(*) FROM private.lms_push_deliveries WHERE state IN('pending','sending'))::int AS pending_or_sending,
 (SELECT count(*) FROM (SELECT notification_id,subscription_id FROM private.lms_push_deliveries GROUP BY 1,2 HAVING count(*)>1) t)::int AS duplicate_delivery_pairs,
 (SELECT count(*) FROM auth.users)::int AS auth_users,
 (SELECT count(*) FROM auth.identities)::int AS auth_identities,
 (SELECT count(*) FROM storage.objects WHERE bucket_id='lms_media')::int AS lms_objects`);
const tr=targetRuntime[0];if(tr.lms_jobs!==1||tr.active_jobs!==1||tr.failed_runs||tr.edge_http_errors||tr.pending_or_sending||tr.duplicate_delivery_pairs||!tr.edge_http_200)throw Error('TARGET_OUTBOX_OR_SCHEDULER_NEEDS_DIAGNOSIS');
const newDeliveries=await targetRead('target-postcutover-deliveries',`SELECT d.state,d.attempts,d.last_status,d.finished_at,n.created_at AS notification_created_at FROM private.lms_push_deliveries d JOIN public.lms_notifications n ON n.id=d.notification_id WHERE n.created_at>=${lit(s.deployedAt)}::timestamptz ORDER BY n.created_at,d.subscription_id`);
if(newDeliveries.some(d=>d.state!=='sent'||d.attempts!==1||![200,201,202].includes(d.last_status)))throw Error('POSTCUTOVER_DELIVERY_REQUIRES_REVIEW');
const changes=frozen.map(t=>{
 const current=targetData.find(v=>v.schema===t.schema&&v.name===t.name);
 const keyDef=read('inventory/sql-constraints.json').find(c=>c.schema===t.schema&&c.table_name===t.name&&c.contype==='p');
 const cols=keyDef.definition.match(/\((.+)\)/)[1].split(',').map(c=>c.trim().replaceAll('"',''));
 const key=r=>canonical(cols.map(c=>JSON.parse(r)[c]));const before=new Map(t.rows.map(r=>[key(r),r])),after=new Map(current.rows.map(r=>[key(r),r]));
 return {schema:t.schema,name:t.name,sourceRows:t.rows.length,targetRows:current.rows.length,added:[...after.keys()].filter(k=>!before.has(k)).length,removed:[...before.keys()].filter(k=>!after.has(k)).length,changed:[...after].filter(([k,v])=>before.has(k)&&before.get(k)!==v).length};
});
const proof={at:new Date().toISOString(),userConfirmation:{originalAccountLogin:true,iphonePwaReceivedParentCommentPush:true,source:'User confirmation after production cutover',operatorPhysicalDeviceTested:false},source:sr,sourceBusinessUnchangedSinceFreeze:true,sourceOutboxUnchangedSinceFreeze:true,sourceMaintenanceFlagOn:true,target:tr,postcutoverDeliveries:newDeliveries,newDeliveryCount:newDeliveries.length,allNewDeliveriesSingleAttempt:true,duplicateDeliveryPairs:0,sourceBusinessRows:frozen.reduce((n,t)=>n+t.rows.length,0),targetBusinessRows:changes.reduce((n,t)=>n+t.targetRows,0),changes,readOnly:true,noReconciliationOrRollbackPerformed:true};
save('lms-cutover/live-postcheck.json',proof);
save('lms-cutover/state.json',{...s,updatedAt:proof.at,finalVerifiedAt:proof.at,userOriginalLoginConfirmed:true,userIphonePushConfirmed:true});
const previous=read('lms-cutover/final-status.json');save('lms-cutover/final-status.json',{...previous,at:proof.at,userPhysicalDeviceConfirmed:true,userConfirmationSource:'User: original account login and iPhone PWA parent-comment push successful',sourceLmsCronRunsAfterFreeze:0,duplicateDeliveryPairs:0,postCutoverDeliveryCount:newDeliveries.length,targetRuntime:{active_lms_jobs:tr.active_jobs,claimable:tr.pending_or_sending,auth_users:tr.auth_users,auth_identities:tr.auth_identities,lms_objects:tr.lms_objects}});
console.log(JSON.stringify({event:'cutover-live-postcheck-passed',...proof}));
