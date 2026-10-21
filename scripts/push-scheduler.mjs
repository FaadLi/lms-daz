import { readFileSync,writeFileSync,mkdirSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { createHash,randomBytes } from 'node:crypto';

const config={...parseEnv(readFileSync('.env.local','utf8')),...process.env};
const origin=new URL(config.VITE_SUPABASE_URL).origin;
const ref=new URL(origin).hostname.match(/^([a-z0-9]{20})\.supabase\.co$/)?.[1];
if(!ref||!config.SUPABASE_ACCESS_TOKEN)throw new Error('Missing or invalid project configuration');
const endpoint=`${origin}/functions/v1/push-dispatch`;
const fingerprint=value=>createHash('sha256').update(value).digest('hex');
let stage='audit';
async function api(path,body,method=body?'POST':'GET'){
  const response=await fetch(`https://api.supabase.com/v1/projects/${ref}${path}`,{
    method,headers:{Authorization:`Bearer ${config.SUPABASE_ACCESS_TOKEN}`,'Content-Type':'application/json'},
    ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(45000),
  });
  if(!response.ok)throw new Error(`Management HTTP ${response.status}`);
  const text=await response.text();
  return text?JSON.parse(text):undefined;
}
const query=(text,parameters)=>api('/database/query',{query:text,...(parameters?{parameters}:{})});
const secretMetadata=()=>api('/secrets'); // This endpoint returns SHA-256 digests in its `value` field.
async function dataApiIsolation(){
  const result={};
  for(const [schema,table]of [['net','http_request_queue'],['vault','decrypted_secrets'],['cron','job']]){
    const response=await fetch(`${origin}/rest/v1/${table}?select=id&limit=0`,{headers:{apikey:config.VITE_SUPABASE_PUBLISHABLE_KEY,'Accept-Profile':schema},signal:AbortSignal.timeout(15000)});
    const body=await response.json();
    result[schema]=response.status===406&&body.code==='PGRST106';
    if(!result[schema])throw new Error('Internal schema is exposed through the Data API');
  }
  return result;
}
async function vaultStatus(metadata){
  const rows=await query("select name,length(decrypted_secret) secret_length,encode(extensions.digest(decrypted_secret,'sha256'),'hex') fingerprint from vault.decrypted_secrets where name in ('lms_push_function_url','lms_push_dispatch_secret')");
  const dispatch=rows.find(row=>row.name==='lms_push_dispatch_secret');
  return {
    functionUrlPresent:rows.some(row=>row.name==='lms_push_function_url'),
    functionUrlMatchesProject:rows.some(row=>row.name==='lms_push_function_url'&&row.fingerprint===fingerprint(endpoint)),
    dispatchPresent:!!dispatch,
    dispatchMatchesEdge:!!dispatch&&dispatch.fingerprint===metadata.find(row=>row.name==='LMS_PUSH_DISPATCH_SECRET')?.value,
  };
}
async function snapshot(){
  const data=await query(`select
    md5(coalesce((select string_agg(pg_get_functiondef(p.oid),'' order by n.nspname,p.proname,p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.proname like 'lms\\_%' escape '\\'),'')) functions,
    md5(coalesce((select string_agg(row_to_json(p)::text,'' order by schemaname,tablename,policyname) from pg_policies p where schemaname in ('public','private') and tablename like 'lms\\_%' escape '\\'),'')) policies,
    md5(coalesce((select string_agg(c.relname||':'||c.relrowsecurity||':'||a.attname||':'||format_type(a.atttypid,a.atttypmod)||':'||a.attnotnull,'' order by c.relname,a.attnum) from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped where n.nspname in ('public','private') and c.relname like 'lms\\_%' escape '\\' and c.relkind='r'),'')) columns`);
  return data[0];
}
async function jobStatus(){
  const exists=(await query("select to_regclass('cron.job') is not null ready"))[0].ready;
  if(!exists)return [];
  return query("select jobid,jobname,schedule,active,username,database,position('vault.decrypted_secrets' in command)>0 uses_vault,position('x-lms-push-secret' in command)>0 dispatch_header from cron.job where jobname='lms-push-dispatch'");
}
async function setup(){
  stage='verify internal API isolation';
  const isolation=await dataApiIsolation();
  stage='read Edge secret metadata';
  const before=await secretMetadata();
  for(const name of ['VAPID_PUBLIC_KEY','VAPID_PRIVATE_KEY','VAPID_SUBJECT'])
    if(!before.some(row=>row.name===name))throw new Error('VAPID prerequisite missing');
  const schemaBefore=await snapshot();
  let dispatch=config.LMS_PUSH_DISPATCH_SECRET;
  if(process.argv.includes('--rotate-dispatch-secret')){
    dispatch=randomBytes(32).toString('base64url');
    stage='synchronize Edge dispatch secret';
    await api('/secrets',[{name:'LMS_PUSH_DISPATCH_SECRET',value:dispatch}]);
  }else if(!dispatch){
    const status=await vaultStatus(before);
    if(!status.dispatchMatchesEdge)throw new Error('Matching original dispatch value is required; do not copy an API digest');
    // Keep a working existing secret untouched when rerunning setup.
  }
  stage='verify Edge metadata';
  const after=await secretMetadata();
  if(dispatch&&after.find(row=>row.name==='LMS_PUSH_DISPATCH_SECRET')?.value!==fingerprint(dispatch))
    throw new Error('Edge secret fingerprint mismatch');
  const vapidUnchanged=['VAPID_PUBLIC_KEY','VAPID_PRIVATE_KEY','VAPID_SUBJECT'].every(name=>before.find(row=>row.name===name)?.value===after.find(row=>row.name===name)?.value);
  if(!vapidUnchanged)throw new Error('VAPID changed during setup; stop for review');
  stage='configure Vault';
  const entries=[['lms_push_function_url',endpoint],...(dispatch?[['lms_push_dispatch_secret',dispatch]]:[])];
  for(const [name,value]of entries){
    const rows=await query('select id from vault.secrets where name=$1',[name]);
    if(rows.length>1)throw new Error('Duplicate Vault configuration');
    if(rows.length)await query('select vault.update_secret($1::uuid,$2::text)',[rows[0].id,value]);
    else await query('select vault.create_secret($1::text,$2::text,$3::text)',[value,name,'LMS Web Push scheduler configuration']);
  }
  const vault=await vaultStatus(after);
  if(!vault.dispatchMatchesEdge||!vault.functionUrlMatchesProject)throw new Error('Vault configuration mismatch');
  // No secret is interpolated into SQL, source, cron command, stdout or files.
  dispatch=undefined;
  const script=readFileSync('supabase/setup/push_dispatch.sql','utf8');
  stage='configure scheduler';await query(script);
  const first=await jobStatus();
  stage='verify repeat setup';await query(script);
  const second=await jobStatus();
  if(first.length!==1||second.length!==1||first[0].jobid!==second[0].jobid||!second[0].active)
    throw new Error('Scheduler setup was not idempotent');
  const schemaAfter=await snapshot();
  const unchanged=JSON.stringify(schemaBefore)===JSON.stringify(schemaAfter);
  if(!unchanged)throw new Error('Unexpected LMS schema, RLS or function change');
  return {project:ref,vault,vapidUnchanged,schemaRlsFunctionsUnchanged:unchanged,idempotentJobId:second[0].jobid,jobs:second,dataApiIsolation:isolation};
}
async function audit(){
  const metadata=await secretMetadata();
  return {project:ref,edgeSecrets:Object.fromEntries(['VAPID_PUBLIC_KEY','VAPID_PRIVATE_KEY','VAPID_SUBJECT','LMS_PUSH_DISPATCH_SECRET'].map(name=>[name,metadata.some(row=>row.name===name)])),vault:await vaultStatus(metadata),jobs:await jobStatus(),dataApiIsolation:await dataApiIsolation(),outbox:await query('select state,count(*)::integer count from private.lms_push_deliveries group by state'),deviceCount:(await query('select count(*)::integer count from public.lms_push_subscriptions'))[0].count};
}
async function logs(){
  const frame=(await query(`select
    to_char((clock_timestamp()-interval '30 minutes') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') started,
    to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') ended`))[0];
  const runtimeSql=`select timestamp,severity_text,
    nullIf(extract(event_message,'"claimed":([0-9]+)'),'') claimed,
    nullIf(extract(event_message,'"accepted":([0-9]+)'),'') accepted,
    nullIf(extract(event_message,'"failed":([0-9]+)'),'') failed,
    nullIf(extract(event_message,'"status":([0-9]+)'),'') status
    from logs where source='function_logs' and event_message like '%"action":"push-dispatch"%'
    order by timestamp desc limit 20`;
  const params=new URLSearchParams({sql:runtimeSql,iso_timestamp_start:frame.started,iso_timestamp_end:frame.ended});
  const runtime=await api(`/analytics/endpoints/logs?${params}`);
  if(runtime.error)throw new Error('Runtime log query failed');
  return {
    runtime:runtime.result,
    scheduler:await query("select runid,status,start_time,end_time from cron.job_run_details where jobid in(select jobid from cron.job where jobname='lms-push-dispatch') order by runid desc limit 8"),
    http:await query('select id,status_code,timed_out,error_msg is not null has_error,created from net._http_response order by id desc limit 8'),
    outbox:await query('select state,count(*)::integer count from private.lms_push_deliveries group by state'),
  };
}
try{
  const mode=process.argv.includes('--setup')?'setup':process.argv.includes('--logs')?'logs':'audit';
  stage=mode;
  const result=mode==='setup'?await setup():mode==='logs'?await logs():await audit();
  mkdirSync('supabase/.temp',{recursive:true});
  writeFileSync(`supabase/.temp/push-scheduler-${mode}.json`,JSON.stringify(result,null,2));
  console.log(JSON.stringify(result));
}catch(error){
  // Never serialize API errors/SQL parameters or credential-bearing request objects.
  const http=/^Management HTTP (\d{3})$/.exec(error instanceof Error?error.message:'');
  console.error(JSON.stringify({ok:false,stage,...(http?{http:Number(http[1])}:{})}));process.exitCode=1;
}
