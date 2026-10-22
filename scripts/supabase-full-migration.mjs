// Whole-project migration evidence. Source access is strictly read-only.
// Sensitive artifacts are encrypted outside the checkout with an AES-256-GCM
// key wrapped by Windows DPAPI (CurrentUser). No credentials are logged.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { parseEnv } from 'node:util';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = process.cwd();
const env = parseEnv(fs.readFileSync(path.join(root, '.env.migration.local'), 'utf8'));
const required = ['SUPABASE_ACCESS_TOKEN', 'SUPABASE_ORG_ID', 'OLD_PROJECT_REF',
  'OLD_DB_PASSWORD', 'OLD_SUPABASE_URL', 'OLD_SUPABASE_SECRET_KEY'];
if (required.some(k => !env[k])) throw new Error('MISSING_CREDENTIAL_FIELDS');
const ref = env.OLD_PROJECT_REF.match(/(?:\/project\/|^)([a-z0-9]{20})(?:\/|$)/)?.[1];
if (!ref || new URL(env.OLD_SUPABASE_URL).hostname !== `${ref}.supabase.co`) throw new Error('SOURCE_IDENTITY_MISMATCH');
const base = path.join(os.homedir(), '.codex', 'private', 'supabase-migrations', `${ref}-singapore`);
if (base.startsWith(root + path.sep)) throw new Error('BACKUP_MUST_BE_OUTSIDE_REPOSITORY');
fs.mkdirSync(base, { recursive: true });
function ps(script, input = '') {
  return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand',
    Buffer.from(script, 'utf16le').toString('base64')], { input, encoding: 'utf8', windowsHide: true, stdio: ['pipe','pipe','pipe'] }).trim();
}
const sid = ps('[Security.Principal.WindowsIdentity]::GetCurrent().User.Value');
execFileSync('icacls.exe', [base, '/inheritance:r', '/grant:r', `*${sid}:(OI)(CI)F`], { windowsHide: true, stdio: 'pipe' });
function dpapi(bytes, operation) {
  return Buffer.from(ps(`Add-Type -AssemblyName System.Security; $b=[Convert]::FromBase64String([Console]::In.ReadToEnd().Trim()); $r=[Security.Cryptography.ProtectedData]::${operation}($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($r))`, bytes.toString('base64')), 'base64');
}
const keyPath = path.join(base, 'backup-key.dpapi');
let key;
if (fs.existsSync(keyPath)) key = dpapi(fs.readFileSync(keyPath), 'Unprotect');
else { key = crypto.randomBytes(32); fs.writeFileSync(keyPath, dpapi(key, 'Protect'), { flag: 'wx' }); }
if (key.length !== 32) throw new Error('BACKUP_KEY_INVALID');
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
function seal(bytes) {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([c.update(bytes), c.final()]);
  return Buffer.concat([Buffer.from('SBDZ1'), iv, c.getAuthTag(), body]);
}
function open(bytes) {
  if (bytes.subarray(0,5).toString() !== 'SBDZ1') throw new Error('BACKUP_FORMAT_INVALID');
  const d = crypto.createDecipheriv('aes-256-gcm', key, bytes.subarray(5,17));
  d.setAuthTag(bytes.subarray(17,33));
  return Buffer.concat([d.update(bytes.subarray(33)), d.final()]);
}
function atomic(file, bytes) {
  const temp = `${file}.${crypto.randomUUID()}.part`;
  fs.mkdirSync(path.dirname(file), {recursive:true});
  fs.writeFileSync(temp, bytes); fs.renameSync(temp, file);
}
const ledgerPath = path.join(base, 'artifact-manifest.json.enc');
let ledger = fs.existsSync(ledgerPath) ? JSON.parse(open(fs.readFileSync(ledgerPath))) : {};
function save(name, data) {
  const bytes = Buffer.isBuffer(data) ? data : Buffer.from(typeof data === 'string' ? data : JSON.stringify(data));
  const encrypted = seal(bytes), file = path.join(base, name + '.enc');
  atomic(file, encrypted);
  if (hash(open(fs.readFileSync(file))) !== hash(bytes)) throw new Error('BACKUP_READBACK_FAILED');
  const lockPath=ledgerPath+'.lock';let fd;
  for(let i=0;i<200;i++) {
    try{fd=fs.openSync(lockPath,'wx');break}catch(e){
      if(e.code!=='EEXIST')throw e;
      const age=Date.now()-fs.statSync(lockPath).mtimeMs;
      if(age>60000)throw new Error('BACKUP_MANIFEST_LOCK_REQUIRES_REVIEW');
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,25);
    }
  }
  if(fd===undefined)throw new Error('BACKUP_MANIFEST_BUSY');
  try {
    ledger=fs.existsSync(ledgerPath)?JSON.parse(open(fs.readFileSync(ledgerPath))):{};
    ledger[name] = { bytes: bytes.length, sha256: hash(bytes), encryptedSha256: hash(encrypted), verifiedAt: new Date().toISOString() };
    atomic(ledgerPath, seal(Buffer.from(JSON.stringify(ledger))));
  } finally {fs.closeSync(fd);fs.unlinkSync(lockPath)}
  return ledger[name];
}
function read(name) { return JSON.parse(open(fs.readFileSync(path.join(base, name + '.enc')))); }
const emit = (event, details = {}) => console.log(JSON.stringify({event,...details}));
async function request(name, endpoint, {query, origin = 'https://api.supabase.com', storage = false, raw = false} = {}) {
  // The only POST allowed here is a read-only SQL query. No source updates.
  const options = {method: query ? 'POST' : 'GET', headers: storage
    ? {apikey: env.OLD_SUPABASE_SECRET_KEY}
    : {Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`}, signal: AbortSignal.timeout(120000)};
  if (query) {
    if (origin !== 'https://api.supabase.com' || endpoint !== `/v1/projects/${ref}/database/query`) throw new Error('WRITE_FORBIDDEN');
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify({query, read_only: true});
  }
  try {
    const r = await fetch(origin + endpoint, options), bytes = Buffer.from(await r.arrayBuffer());
    save(name, bytes);
    if (!r.ok) { emit('request-unavailable', {name, status:r.status}); return null; }
    const data = raw ? bytes : JSON.parse(bytes.toString());
    emit('request-backed-up', {name, status:r.status, bytes:bytes.length});
    return data;
  } catch(e) {
    save(`${name}.error`, {type:e.name, code:e.cause?.code});
    emit('request-failed', {name, type:e.name, code:e.cause?.code}); return null;
  }
}
const sql = (name, query) => request(`inventory/sql-${name}.json`, `/v1/projects/${ref}/database/query`, {query});
async function nativeQuery(name, query) {
  const pools=read('inventory/pooler.json'),pool=pools.find(p=>p.pool_mode==='session')??pools[0];
  const child=spawn('C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe',['-X','--no-password','-A','-t','-q','-b','--set=ON_ERROR_STOP=1'],{
    env:{...process.env,PGHOST:pool.db_host,PGPORT:'5432',PGUSER:pool.db_user,PGDATABASE:pool.db_name,
      PGPASSWORD:env.OLD_DB_PASSWORD,PGSSLMODE:'require',PGCONNECT_TIMEOUT:'20'},windowsHide:true,stdio:['pipe','pipe','pipe']});
  const out=[],err=[];child.stdout.on('data',b=>out.push(b));child.stderr.on('data',b=>err.push(b));child.stdin.on('error',()=>{});
  child.stdin.end(`BEGIN READ ONLY; SET LOCAL statement_timeout='60s'; SELECT coalesce(json_agg(result),'[]'::json) FROM (${query}) result; COMMIT;`);
  const status=await new Promise((resolve,reject)=>{child.on('close',resolve);child.on('error',reject)});
  const stderr=Buffer.concat(err);if(stderr.length)save(`${name}.stderr`,stderr);
  if(status!==0){emit('native-query-failed',{name,status});return null}
  const bytes=Buffer.concat(out);save(name,bytes);emit('native-query-backed-up',{name,bytes:bytes.length});return JSON.parse(bytes.toString());
}
const nsFilter = "n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp%'";
const catalogQueries = {
  version: 'SELECT pg_catalog.version() AS version, pg_catalog.current_database() AS database, pg_catalog.pg_database_size(pg_catalog.current_database())::text AS database_bytes, current_user AS current_user',
  schemas: `SELECT n.nspname AS schema, pg_catalog.pg_get_userbyid(n.nspowner) AS owner,n.nspacl::text AS acl FROM pg_catalog.pg_namespace n WHERE ${nsFilter} ORDER BY 1`,
  tables: `SELECT n.nspname AS schema,c.relname AS name,c.relkind,c.reltuples::bigint AS estimated_rows,c.relrowsecurity AS rls,c.relforcerowsecurity AS force_rls,c.relacl::text AS acl,pg_catalog.pg_get_userbyid(c.relowner) AS owner,pg_catalog.pg_total_relation_size(c.oid)::text AS bytes FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE ${nsFilter} AND c.relkind IN ('r','p','v','m','f','S') ORDER BY 1,2`,
  columns: `SELECT n.nspname AS schema,c.relname AS table_name,a.attname,pg_catalog.format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull,a.attidentity,a.attgenerated,pg_catalog.pg_get_expr(d.adbin,d.adrelid) AS default_expr FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class c ON c.oid=a.attrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum WHERE ${nsFilter} AND c.relkind IN ('r','p','v','m','f') AND a.attnum>0 AND NOT a.attisdropped ORDER BY 1,2,a.attnum`,
  constraints: `SELECT n.nspname AS schema,c.relname AS table_name,k.conname,k.contype,k.convalidated,pg_catalog.pg_get_constraintdef(k.oid,true) AS definition FROM pg_catalog.pg_constraint k JOIN pg_catalog.pg_namespace n ON n.oid=k.connamespace LEFT JOIN pg_catalog.pg_class c ON c.oid=k.conrelid WHERE ${nsFilter} ORDER BY 1,2,3`,
  indexes: "SELECT schemaname,tablename,indexname,indexdef FROM pg_catalog.pg_indexes WHERE schemaname NOT IN ('pg_catalog','information_schema') ORDER BY 1,2,3",
  policies: "SELECT * FROM pg_catalog.pg_policies ORDER BY schemaname,tablename,policyname",
  functions: `SELECT n.nspname AS schema,p.proname,p.prokind,pg_catalog.pg_get_function_identity_arguments(p.oid) AS arguments,p.prosecdef,p.proconfig,p.proacl::text AS acl,pg_catalog.pg_get_userbyid(p.proowner) AS owner,CASE WHEN p.prokind<>'a' THEN pg_catalog.pg_get_functiondef(p.oid) END AS definition FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE ${nsFilter} ORDER BY 1,2,4`,
  triggers: `SELECT n.nspname AS schema,c.relname AS table_name,t.tgname,t.tgenabled,pg_catalog.pg_get_triggerdef(t.oid,true) AS definition FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE ${nsFilter} AND NOT t.tgisinternal ORDER BY 1,2,3`,
  views: "SELECT schemaname,viewname,viewowner,definition FROM pg_catalog.pg_views WHERE schemaname NOT IN ('pg_catalog','information_schema') ORDER BY 1,2",
  extensions: "SELECT e.extname,e.extversion,n.nspname AS schema FROM pg_catalog.pg_extension e JOIN pg_catalog.pg_namespace n ON n.oid=e.extnamespace ORDER BY 1",
  roles: 'SELECT rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls,rolconnlimit,rolconfig,rolvaliduntil FROM pg_catalog.pg_roles ORDER BY rolname',
  memberships: 'SELECT pg_catalog.pg_get_userbyid(roleid) AS role,pg_catalog.pg_get_userbyid(member) AS member,admin_option FROM pg_catalog.pg_auth_members ORDER BY 1,2',
  default_acl: 'SELECT pg_catalog.pg_get_userbyid(a.defaclrole) AS role,n.nspname AS schema,a.defaclobjtype,a.defaclacl::text AS acl FROM pg_catalog.pg_default_acl a LEFT JOIN pg_catalog.pg_namespace n ON n.oid=a.defaclnamespace ORDER BY 1,2,3',
  settings: 'SELECT s.setdatabase,d.datname,pg_catalog.pg_get_userbyid(s.setrole) AS role,s.setconfig FROM pg_catalog.pg_db_role_setting s LEFT JOIN pg_catalog.pg_database d ON d.oid=s.setdatabase',
  publications: 'SELECT * FROM pg_catalog.pg_publication',
  publication_tables: 'SELECT * FROM pg_catalog.pg_publication_tables ORDER BY pubname,schemaname,tablename',
  foreign_servers: 'SELECT s.srvname,w.fdwname,s.srvoptions FROM pg_catalog.pg_foreign_server s JOIN pg_catalog.pg_foreign_data_wrapper w ON w.oid=s.srvfdw',
  event_triggers: 'SELECT evtname,evtevent,evtenabled,evtfoid::regprocedure::text AS function,evttags FROM pg_catalog.pg_event_trigger',
  replication_slots: 'SELECT slot_name,plugin,slot_type,database,active FROM pg_catalog.pg_replication_slots',
};
const permissionQuery=`WITH objects AS (
 SELECT 'schema'::text AS kind,n.nspname AS schema,n.nspname AS name,NULL::text AS arguments,n.nspowner AS owner_oid,coalesce(n.nspacl,pg_catalog.acldefault('n',n.nspowner)) AS acl FROM pg_catalog.pg_namespace n WHERE n.nspname IN ('public','private','supabase_migrations')
 UNION ALL SELECT CASE WHEN c.relkind='S' THEN 'sequence' ELSE 'table' END,n.nspname,c.relname,NULL,c.relowner,coalesce(c.relacl,pg_catalog.acldefault(CASE WHEN c.relkind='S' THEN 'S'::char ELSE 'r'::char END::"char",c.relowner)) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','private','supabase_migrations') AND c.relkind IN ('r','p','v','m','S')
 UNION ALL SELECT 'function',n.nspname,p.proname,pg_catalog.pg_get_function_identity_arguments(p.oid),p.proowner,coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner)) FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','private','supabase_migrations')
 UNION ALL SELECT 'type',n.nspname,t.typname,NULL,t.typowner,coalesce(t.typacl,pg_catalog.acldefault('T',t.typowner)) FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname IN ('public','private','supabase_migrations') AND t.typtype IN ('e','d')
 ) SELECT kind,schema,name,arguments,pg_catalog.pg_get_userbyid(owner_oid) AS owner,coalesce((SELECT json_agg(g ORDER BY g.grantee,g.privilege,g.grantable) FROM (SELECT CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee) END AS grantee,pg_catalog.pg_get_userbyid(a.grantor) AS grantor,a.privilege_type AS privilege,a.is_grantable AS grantable FROM pg_catalog.aclexplode(objects.acl) a) g),'[]'::json) AS grants FROM objects ORDER BY kind,schema,name,arguments`;
function targetState() {
  const t=read('target/credentials.json');
  if(!/^[a-z0-9]{20}$/.test(t.ref)||t.ref===ref||t.name!=='db-daz'||t.region!=='ap-southeast-1')throw new Error('TARGET_NOT_VERIFIED');
  return t;
}
async function targetApi(name, suffix, method='GET',body) {
  const t=targetState();
  const r=await fetch(`https://api.supabase.com/v1/projects/${t.ref}${suffix}`,{method,
    headers:{Authorization:`Bearer ${env.SUPABASE_ACCESS_TOKEN}`,'Content-Type':'application/json'},
    body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(120000)});
  const bytes=Buffer.from(await r.arrayBuffer());save(name,bytes);
  if(!r.ok){emit('target-api-failed',{name,status:r.status});throw new Error('TARGET_API_FAILED')}
  emit('target-api-complete',{name,status:r.status});return bytes.length?JSON.parse(bytes.toString()):null;
}
async function targetPsql(name, sqlText, {readonly=false}={}) {
  const t=targetState();
  const pools=ledger['target/pooler.json']?read('target/pooler.json'):await targetApi('target/pooler.json','/config/database/pooler');
  const p=pools.find(p=>p.pool_mode==='session')??pools[0];
  const child=spawn('C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe',['-X','--no-password','-A','-t','-q','-b','--set=ON_ERROR_STOP=1'],{
    env:{...process.env,PGHOST:p.db_host,PGPORT:'5432',PGUSER:p.db_user,PGDATABASE:p.db_name,PGPASSWORD:t.password,PGSSLMODE:'require',PGCONNECT_TIMEOUT:'20'},
    windowsHide:true,stdio:['pipe','pipe','pipe']});
  const out=[],err=[];child.stdout.on('data',b=>out.push(b));child.stderr.on('data',b=>err.push(b));child.stdin.on('error',()=>{});
  child.stdin.end("SET application_name='db-daz-migration';\n"+(readonly?`BEGIN READ ONLY; SET LOCAL statement_timeout='120s'; ${sqlText}; COMMIT;`:sqlText));
  const status=await new Promise((resolve,reject)=>{child.on('close',resolve);child.on('error',reject)});
  save(name+'.stdout',Buffer.concat(out));if(err.length)save(name+'.stderr',Buffer.concat(err));
  if(status!==0){emit('target-sql-failed',{name,status});throw new Error('TARGET_SQL_FAILED')}
  emit('target-sql-complete',{name});return Buffer.concat(out).toString().trim();
}
async function targetHttp(name, suffix, {method='GET',body,headers={},raw=false}={}) {
  const t=targetState();
  const keys=ledger['target/api-keys.json']?read('target/api-keys.json'):await targetApi('target/api-keys.json','/api-keys?reveal=true');
  const service=keys.find(k=>k.name==='service_role'&&k.api_key)?.api_key??keys.find(k=>k.type==='secret'&&k.api_key)?.api_key;
  if(!service)throw new Error('TARGET_SERVICE_KEY_UNAVAILABLE');
  const r=await fetch(`https://${t.ref}.supabase.co${suffix}`,{method,headers:{apikey:service,...(service.startsWith('eyJ')?{Authorization:`Bearer ${service}`} :{}),...(Buffer.isBuffer(body)?{}:{'Content-Type':'application/json'}),...headers},
    body:body===undefined?undefined:Buffer.isBuffer(body)?body:JSON.stringify(body),signal:AbortSignal.timeout(120000)});
  const bytes=Buffer.from(await r.arrayBuffer());save(name,bytes);
  if(!r.ok){emit('target-http-failed',{name,status:r.status});throw new Error('TARGET_HTTP_FAILED')}
  return raw?bytes:bytes.length?JSON.parse(bytes.toString()):null;
}
async function extractArchive(args) {
  const archive=open(fs.readFileSync(path.join(base,'database/full.dump.enc')));
  if(hash(archive)!==ledger['database/full.dump'].sha256)throw new Error('CHECKSUM_MISMATCH');
  const child=spawn('C:\\Program Files\\PostgreSQL\\17\\bin\\pg_restore.exe',[...args,'--file=-'],{windowsHide:true,stdio:['pipe','pipe','pipe']});
  const out=[],err=[];child.stdout.on('data',b=>out.push(b));child.stderr.on('data',b=>err.push(b));child.stdin.on('error',()=>{});child.stdin.end(archive);
  const status=await new Promise((resolve,reject)=>{child.on('close',resolve);child.on('error',reject)});
  if(status!==0){save('restore/extract-error.log',Buffer.concat(err));throw new Error('ARCHIVE_EXTRACTION_FAILED')}
  return Buffer.concat(out).toString();
}
function archiveCopies() {
  const data=open(fs.readFileSync(path.join(base,'database/data-all.sql.enc'))).toString();
  const sections=[];let current=null;
  for(const line of data.split(/\r?\n/)) {
    if(current){if(line==='\\.'){sections.push(current);current=null}else current.rows.push(line);continue}
    const m=line.match(/^COPY "([^"]+)"\."([^"]+)" \((.+)\) FROM stdin;$/);
    if(m)current={schema:m[1],name:m[2],columnSql:m[3],columns:m[3].split(', ').map(c=>c.slice(1,-1)),rows:[]};
  }
  if(current)throw new Error('INCOMPLETE_ARCHIVE_COPY_SECTION');return sections;
}
async function compareData() {
  const sections=archiveCopies().filter(s=>['public','private','auth','supabase_migrations'].includes(s.schema)&&s.name!=='schema_migrations'||s.schema==='supabase_migrations');
  if(sections.length<30||!sections.some(s=>s.schema==='auth'&&s.name==='users')||!sections.some(s=>s.schema==='public'&&s.name==='mikrotik_users'))throw new Error('ARCHIVE_COPY_PARSER_INCOMPLETE');
  const quote=s=>'"'+s.replaceAll('"','""')+'"';
  const marker='__DAZ_COPY_'+crypto.randomBytes(12).toString('hex')+'__';
  const script="SET TIME ZONE 'UTC'; SET DateStyle=ISO; SET IntervalStyle=postgres; SET extra_float_digits=3;\n"+
    sections.map((s,i)=>`\\echo ${marker}${i}\nCOPY (SELECT ${s.columnSql} FROM ${quote(s.schema)}.${quote(s.name)}) TO STDOUT;`).join('\n')+`\n\\echo ${marker}END\n`;
  const output=await targetPsql('verification/target-copy-data',script,{readonly:false});
  const rowsByIndex=new Map();let current;
  for(const line of output.split(/\r?\n/)) {
    if(line.startsWith(marker)){current=line.slice(marker.length);if(current!=='END')rowsByIndex.set(Number(current),[])}
    else if(current!==undefined&&current!=='END'&&line!=='')rowsByIndex.get(Number(current)).push(line);
  }
  const result=sections.map((s,i)=>{
    const targetRows=rowsByIndex.get(i);if(!targetRows)throw new Error('TARGET_COPY_SECTION_MISSING');
    const fingerprint=rows=>hash(Buffer.from([...rows].sort().join('\n')));
    return {schema:s.schema,name:s.name,sourceRows:s.rows.length,targetRows:targetRows.length,
      sourceSha256:fingerprint(s.rows),targetSha256:fingerprint(targetRows),equal:fingerprint(s.rows)===fingerprint(targetRows)};
  });
  save('verification/data-comparison.json',result);
  emit('data-compared',{tables:result.length,equal:result.filter(t=>t.equal).length,differences:result.filter(t=>!t.equal)});
  return {sections,rowsByIndex,result};
}
async function cleanupFixtures(fixture) {
  if(!fixture.users?.length)return;
  const original=archiveCopies().find(s=>s.schema==='auth'&&s.name==='users');
  const oldIds=new Set(original.rows.map(r=>r.split('\t')[original.columns.indexOf('id')]));
  if(fixture.users.some(u=>oldIds.has(u.id)||!u.email.startsWith('migration-'+fixture.id+'-')))throw new Error('FIXTURE_CLEANUP_SCOPE_MISMATCH');
  const ids=fixture.users.map(u=>"'"+u.id+"'::uuid");
  await targetPsql('verification/fixture-cleanup',`BEGIN;
    DELETE FROM public.lms_notifications WHERE id='${fixture.notification}'; DELETE FROM public.lms_comments WHERE id='${fixture.comment}';
    DELETE FROM public.lms_children WHERE id='${fixture.child}'; DELETE FROM public.lms_parents WHERE id='${fixture.parent}';
    ${fixture.subject?`DELETE FROM public.lms_subjects WHERE id='${fixture.subject}';`:''}
    DELETE FROM public.faqs WHERE id='${fixture.faq}'; DELETE FROM public.admin_users WHERE id IN (${ids.join(',')});
    DELETE FROM public.lms_profiles WHERE id IN (${ids.join(',')}); DELETE FROM private.lms_audit_logs WHERE owner_id IN (${ids.join(',')}); COMMIT;`);
  for(const user of fixture.users)await targetHttp('verification/auth-delete-'+user.id+'.json','/auth/v1/admin/users/'+user.id,{method:'DELETE'});
  fixture.cleaned=true;save('verification/fixtures.json',fixture);
  emit('fixtures-cleaned',{users:fixture.users.length});
}
async function inventory() {
  const projects = await request('inventory/projects.json', '/v1/projects');
  const source = projects?.find(p => p.id === ref);
  if (!source || source.region !== 'us-east-1') throw new Error('SOURCE_PROJECT_NOT_VERIFIED');
  const org = source.organization_id;
  if (!env.SUPABASE_ORG_ID.includes(org)) throw new Error('ORGANIZATION_MISMATCH');
  emit('source-verified', {ref, name:source.name, region:source.region, status:source.status, targetName:'db-daz', envTargetName:env.NEW_PROJECT_NAME});
  const endpoints = [
    ['organization', `/v1/organizations/${org}`],
    ['entitlements', `/v1/organizations/${org}/entitlements`],
    ['project', `/v1/projects/${ref}`],
    ['auth', `/v1/projects/${ref}/config/auth`],
    ['rest', `/v1/projects/${ref}/postgrest`],
    ['storage-config', `/v1/projects/${ref}/config/storage`],
    ['realtime', `/v1/projects/${ref}/config/realtime`],
    ['postgres', `/v1/projects/${ref}/config/database/postgres`],
    ['pooler', `/v1/projects/${ref}/config/database/pooler`],
    ['functions', `/v1/projects/${ref}/functions`],
    ['edge-secrets', `/v1/projects/${ref}/secrets`],
    ['vault-root-key', `/v1/projects/${ref}/pgsodium`],
    ['backups', `/v1/projects/${ref}/database/backups`],
    ['sso', `/v1/projects/${ref}/config/auth/sso/providers`],
    ['third-party-auth', `/v1/projects/${ref}/config/auth/third-party-auth`],
    ['signing-keys', `/v1/projects/${ref}/config/auth/signing-keys`],
    ['network-restrictions', `/v1/projects/${ref}/network-restrictions`],
    ['ssl-enforcement', `/v1/projects/${ref}/ssl-enforcement`],
    ['addons', `/v1/projects/${ref}/billing/addons`],
  ];
  // Sequential requests avoid Management API connection/rate-limit bursts.
  const configs = {};
  for (const [name, endpoint] of endpoints) configs[name] = await request(`inventory/${name}.json`, endpoint);
  const buckets = await request('inventory/storage-buckets.json', '/storage/v1/bucket', {origin:env.OLD_SUPABASE_URL, storage:true});
  const catalogs = {};
  for (const [name, query] of Object.entries(catalogQueries)) catalogs[name] = await sql(name, query);
  const tables = catalogs.tables?.filter(t => ['r','p'].includes(t.relkind)) || [];
  const quote = s => '"' + s.replaceAll('"','""') + '"';
  const counts = [];
  for (let i=0; i<tables.length; i+=25) {
    const part = tables.slice(i,i+25);
    const query = part.map(t => `SELECT '${t.schema.replaceAll("'","''")}'::text AS schema,'${t.name.replaceAll("'","''")}'::text AS name,count(*)::text AS rows FROM ${quote(t.schema)}.${quote(t.name)}`).join(' UNION ALL ');
    const rows = await sql(`counts-${i}`, query); if (rows) counts.push(...rows);
  }
  save('inventory/table-counts.json', counts);
  for (const [name, query] of Object.entries({
    migrations:'SELECT * FROM supabase_migrations.schema_migrations ORDER BY version',
    cron:'SELECT * FROM cron.job ORDER BY jobid',
    vault:'SELECT id,name,description,secret,key_id,nonce,created_at,updated_at FROM vault.secrets ORDER BY id',
    vault_decryption:'SELECT id,name,pg_catalog.octet_length(decrypted_secret) AS decrypted_bytes FROM vault.decrypted_secrets ORDER BY id',
    auth_providers:'SELECT provider,count(*)::text AS identities FROM auth.identities GROUP BY provider ORDER BY provider',
    storage_objects:'SELECT * FROM storage.objects ORDER BY bucket_id,name',
  })) await sql(name, query);
  for (const f of configs.functions || []) await request(`functions/${f.slug}.bundle`, `/v1/projects/${ref}/functions/${encodeURIComponent(f.slug)}/body`, {raw:true});
  const summary = {capturedAt:new Date().toISOString(),ref,sourceName:source.name,sourceRegion:source.region,organization:org,
    targetName:'db-daz',targetRegion:'ap-southeast-1',envTargetName:env.NEW_PROJECT_NAME,
    targetExists:projects.some(p=>p.name==='db-daz'&&p.organization_id===org),
    organizationInfo:configs.organization,
    schemas:catalogs.schemas?.map(s=>s.schema), tables:tables.length,tableCounts:counts,
    extensions:catalogs.extensions, functions:configs.functions?.map(f=>({slug:f.slug,status:f.status,version:f.version,verify_jwt:f.verify_jwt})),
    edgeSecretNames:configs['edge-secrets']?.map(s=>s.name),buckets:buckets?.map(b=>({id:b.id,name:b.name,public:b.public,file_size_limit:b.file_size_limit,allowed_mime_types:b.allowed_mime_types})),
    vaultRootKeyResponseAvailable:Boolean(configs['vault-root-key']),backupArtifacts:Object.keys(ledger).length};
  save('inventory/summary.json', summary);
  atomic(path.join(base,'summary.sanitized.json'),Buffer.from(JSON.stringify(summary,null,2)));
  emit('inventory-complete',{base,schemas:summary.schemas,tables:tables.length,functions:summary.functions,edgeSecretNames:summary.edgeSecretNames,buckets:summary.buckets,targetExists:summary.targetExists,organizationInfo:summary.organizationInfo});
}
async function main() {
  const action=process.argv[2];
  if(action==='ssh-readiness') {
    const results=[];
    for(const host of ['100.92.203.33','ptkpp','147.93.80.87']) {
      const output=await new Promise((resolve,reject)=>{
        const child=spawn('ssh.exe',['-vvv','-o','BatchMode=yes','-o','ConnectTimeout=8','-o','ConnectionAttempts=1','-o','StrictHostKeyChecking=yes','-T',host,'true'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
        const chunks=[];child.stdout.on('data',b=>chunks.push(b));child.stderr.on('data',b=>chunks.push(b));
        const timer=setTimeout(()=>child.kill(),20000);
        child.on('error',e=>{clearTimeout(timer);reject(e)});child.on('close',status=>{clearTimeout(timer);resolve({status,text:Buffer.concat(chunks).toString()})});
      });
      save('readiness/ssh-'+host+'.log',output.text);
      const lines=output.text.split(/\r?\n/);
      results.push({host,status:output.status,tcpEstablished:/Connection established/.test(output.text),
        serverBanner:lines.find(l=>/Remote protocol version/.test(l))?.replace(/^debug\d: /,''),
        methods:lines.filter(l=>/Authentications that can continue:/.test(l)).map(l=>l.split('continue: ')[1]),
        offeredKeys:lines.filter(l=>/Offering public key:/.test(l)).map(l=>({type:l.match(/\b(RSA|ED25519|ECDSA)\b/)?.[1],fingerprint:l.match(/SHA256:[A-Za-z0-9+/]+/)?.[0]})),
        serverAcceptedKey:/Server accepts key:/.test(output.text),agentUnavailable:/unable to connect to pipe|agent.*No such file|ssh_get_authentication_socket.*No such file/i.test(output.text),
        outcome:/Permission denied/.test(output.text)?'authentication-denied':/Connection reset/.test(output.text)?'connection-reset':output.status===0?'authenticated-readonly-command':'other',
        resetBeforeServerBanner:/Connection reset/.test(output.text)&&!/Remote protocol version/.test(output.text)});
    }
    save('readiness/ssh-summary.json',{at:new Date().toISOString(),results});emit('ssh-readiness',{results});return;
  }
  if(action==='evidence-review') {
    const get=n=>ledger[n]?read(n):null;
    const comparisons=get('verification/data-comparison.json'),checks=get('verification/functional-checks.json');
    const storage=get('restore/storage-completed.json'),functions=get('restore/functions-completed.json');
    const roles=get('inventory/sql-roles.json'),targetRoles=get('verification/catalog-roles.json');
    const differences=(source,target,key)=>source?.flatMap(s=>{const t=target?.find(v=>key(v)===key(s));return !t?[{object:key(s),missing:true}]:Object.keys(s).filter(k=>JSON.stringify(s[k])!==JSON.stringify(t[k])).map(k=>({object:key(s),field:k,source:/config|password|secret/i.test(k)?'redacted':s[k],target:/config|password|secret/i.test(k)?'redacted':t[k]}))});
    emit('saved-evidence',{data:{tables:comparisons?.length,equal:comparisons?.filter(c=>c.equal).length},checks,
      storage,functions,configuration:get('target/configuration-completed.json'),schema:get('verification/schema-comparison.json'),
      roleDifferences:differences(roles,targetRoles,r=>r.rolname),
      newMemberships:get('verification/catalog-memberships.json')?.filter(t=>!get('inventory/sql-memberships.json')?.some(s=>JSON.stringify(s)===JSON.stringify(t))),
      buckets:get('inventory/storage-buckets.json')?.map(b=>({id:b.id,public:b.public,file_size_limit:b.file_size_limit,allowed_mime_types:b.allowed_mime_types})),
      storageProofFields:storage?Object.keys(storage):[],manifestFields:Object.keys(get('storage/manifest.json')?.[0]??{}),
      counts:get('inventory/table-counts.json'),sequenceSnapshot:get('inventory/sequence-state.json'),
      configCaptureShapes:Object.fromEntries(['sso','third-party-auth','signing-keys','network-restrictions','ssl-enforcement','addons','storage-config','realtime','postgres','rest'].map(n=>[n,{keys:Object.keys(get('inventory/'+n+'.json')??{}),error:Boolean(get('inventory/'+n+'.json')?.message)}]))});return;
  }
  if(action==='readiness-assessment') {
    const result={at:new Date().toISOString(),source:ref,target:targetState().ref,configs:[]};
    for(const [name,suffix] of [['auth','/config/auth'],['rest','/postgrest'],['storage-config','/config/storage'],['realtime','/config/realtime'],['postgres','/config/database/postgres'],['network-restrictions','/network-restrictions'],['ssl-enforcement','/ssl-enforcement'],['sso','/config/auth/sso/providers'],['third-party-auth','/config/auth/third-party-auth'],['signing-keys','/config/auth/signing-keys'],['addons','/billing/addons']]) {
      const source=read('inventory/'+name+'.json');let target;
      try{target=await targetApi('readiness/target-'+name+'.json',suffix)}catch{result.configs.push({name,unavailable:true});continue}
      const differingKeys=[...new Set([...Object.keys(source??{}),...Object.keys(target??{})])].filter(k=>JSON.stringify(source?.[k])!==JSON.stringify(target?.[k]));
      result.configs.push({name,sourceError:Boolean(source?.message),differingKeys,equal:!differingKeys.length});
    }
    const funcs=await targetApi('readiness/target-functions.json','/functions');
    result.functions=read('inventory/functions.json').map(s=>({slug:s.slug,active:funcs.some(t=>t.slug===s.slug&&t.status==='ACTIVE'),jwtFlagMatches:funcs.some(t=>t.slug===s.slug&&t.verify_jwt===s.verify_jwt)}));
    const metadata=await targetApi('readiness/target-secret-metadata.json','/secrets');
    result.customSecrets=read('inventory/edge-secrets.json').filter(s=>!s.name.startsWith('SUPABASE_')).map(s=>({name:s.name,digestMatches:metadata.some(t=>t.name===s.name&&t.value===s.value)}));
    const rootKey=await targetApi('readiness/target-vault-root-key.json','/pgsodium');result.vaultRootKeyMatches=JSON.stringify(rootKey)===JSON.stringify(read('inventory/vault-root-key.json'));
    const runtimeQuery="SELECT json_build_object('cron',(SELECT coalesce(json_agg(t),'[]') FROM (SELECT jobid,jobname,schedule,active FROM cron.job ORDER BY jobid) t),'queue',(SELECT count(*) FROM net.http_request_queue),'vault',(SELECT coalesce(json_agg(t),'[]') FROM (SELECT name,decrypted_secret FROM vault.decrypted_secrets ORDER BY name) t))";
    const runtime=JSON.parse(await targetPsql('readiness/target-runtime',runtimeQuery,{readonly:true}));
    const secrets=read('inventory/edge-secret-values-recovered.json');
    result.runtime={cron:runtime.cron,queue:runtime.queue,vaultNames:runtime.vault.map(v=>v.name),dispatchMatches:runtime.vault.find(v=>v.name==='lms_push_dispatch_secret')?.decrypted_secret===secrets.LMS_PUSH_DISPATCH_SECRET,urlMatches:runtime.vault.find(v=>v.name==='lms_push_function_url')?.decrypted_secret===`https://${targetState().ref}.supabase.co/functions/v1/push-dispatch`};
    const sequenceQuery="SELECT schemaname,sequencename,start_value,min_value,max_value,increment_by,cycle,cache_size,last_value FROM pg_catalog.pg_sequences ORDER BY 1,2";
    const sequences=JSON.parse(await targetPsql('readiness/target-sequences',`SELECT coalesce(json_agg(t),'[]') FROM (${sequenceQuery}) t`,{readonly:true}));
    const old=read('inventory/sequence-state.json');result.sequences=old.map(s=>({schema:s.schemaname,name:s.sequencename,sourceSnapshot:s.last_value,target:sequences.find(t=>t.schemaname===s.schemaname&&t.sequencename===s.sequencename)?.last_value,equal:JSON.stringify(s)===JSON.stringify(sequences.find(t=>t.schemaname===s.schemaname&&t.sequencename===s.sequencename))}));
    const tables=read('inventory/sql-tables.json'),permissions=read('inventory/effective-permissions.json');
    result.mikrotik=tables.filter(t=>['mikrotik_users','mikrotik_bayar_tagihan'].includes(t.name)).map(t=>({...t,grants:permissions.find(p=>p.kind==='table'&&p.schema==='public'&&p.name===t.name)?.grants}));
    result.mikrotikDependencies={functions:read('inventory/sql-functions.json').filter(f=>/mikrotik_users|mikrotik_bayar_tagihan/.test(f.definition??'')).map(f=>({schema:f.schema,name:f.proname})),triggers:read('inventory/sql-triggers.json').filter(t=>JSON.stringify(t).includes('mikrotik')),constraints:read('inventory/sql-constraints.json').filter(t=>JSON.stringify(t).includes('mikrotik'))};
    const functions=read('inventory/sql-functions.json');result.outboundFunctions=functions.filter(f=>/net\.http|http_post|http_get|dblink|https?:\/\//i.test(f.definition??'')).map(f=>({schema:f.schema,name:f.proname}));
    const storage=await targetHttp('readiness/target-storage-buckets.json','/storage/v1/bucket');result.storageBucketConfigsMatch=read('inventory/storage-buckets.json').every(s=>storage.some(t=>['id','public','file_size_limit','allowed_mime_types'].every(k=>JSON.stringify(s[k])===JSON.stringify(t[k]))));
    const sourceObjects=await nativeQuery('readiness/source-storage-metadata.json','SELECT id,bucket_id,name,version,owner_id,metadata FROM storage.objects ORDER BY bucket_id,name');
    const oldObjects=read('inventory/sql-storage_objects.json');
    result.sourceStorageDrift=sourceObjects?{snapshotObjects:oldObjects.length,currentObjects:sourceObjects.length,changed:sourceObjects.filter(s=>!oldObjects.some(t=>t.bucket_id===s.bucket_id&&t.name===s.name&&t.version===s.version&&JSON.stringify(t.metadata)===JSON.stringify(s.metadata))).length,removed:oldObjects.filter(s=>!sourceObjects.some(t=>t.bucket_id===s.bucket_id&&t.name===s.name)).length}:null;
    save('readiness/assessment.json',result);emit('readiness-assessment',result);return;
  }
  if(action==='consumer-logs') {
    const end=new Date(),start=new Date(end.getTime()-24*60*60*1000);
    const query="SELECT log_attributes['request.path'] AS path,log_attributes['request.headers.referer'] AS referer,log_attributes['request.headers.user_agent'] AS agent,count() AS events FROM logs WHERE source='edge_logs' GROUP BY path,referer,agent ORDER BY events DESC LIMIT 200";
    const params=new URLSearchParams({sql:query,iso_timestamp_start:start.toISOString(),iso_timestamp_end:end.toISOString()});
    const response=await request('readiness/source-consumer-logs.json',`/v1/projects/${ref}/analytics/endpoints/logs?${params}`);
    const rows=Array.isArray(response)?response:response?.result;
    const summary={start:start.toISOString(),end:end.toISOString(),responseKeys:Object.keys(response??{}),queryError:Boolean(response?.error),groups:Array.isArray(rows)?rows.map(r=>({resource:r.path?.startsWith('/rest/v1/')?r.path.split('?')[0].split('/').slice(0,4).join('/'):/^\/(auth|storage|functions|realtime)\//.test(r.path??'')?r.path.split('/')[1]:'other',origin:(()=>{try{return new URL(r.referer).origin}catch{return null}})(),events:r.events})):null};
    save('readiness/source-consumer-summary.json',summary);emit('consumer-logs',summary);return;
  }
  if(action==='readiness-details') {
    const leafDifferences=(a,b,p='')=>{if(JSON.stringify(a)===JSON.stringify(b))return [];if(a&&b&&typeof a==='object'&&typeof b==='object')return [...new Set([...Object.keys(a),...Object.keys(b)])].flatMap(k=>leafDifferences(a[k],b[k],p?p+'.'+k:k));return [{field:p,source:typeof a==='boolean'||typeof a==='number'?a:typeof a,target:typeof b==='boolean'||typeof b==='number'?b:typeof b}]};
    const configDetails={};for(const n of ['storage-config','ssl-enforcement','signing-keys'])configDetails[n]=leafDifferences(read('inventory/'+n+'.json'),read('readiness/target-'+n+'.json'));
    const auth=read('inventory/auth.json'),oldObjects=read('inventory/sql-storage_objects.json');
    const references=[],storageIdReferences=[];
    for(const section of archiveCopies().filter(s=>['public','private'].includes(s.schema)))for(let c=0;c<section.columns.length;c++){
      const values=section.rows.map(r=>r.split('\t')[c]);
      const urls=values.filter(v=>v?.includes(ref));if(urls.length)references.push({schema:section.schema,table:section.name,column:section.columns[c],rows:urls.length});
      const ids=values.filter(v=>oldObjects.some(o=>v?.includes(o.id)));if(ids.length)storageIdReferences.push({schema:section.schema,table:section.name,column:section.columns[c],rows:ids.length});
    }
    const sshReset=open(fs.readFileSync(path.join(base,'readiness/ssh-147.93.80.87.log.enc'))).toString().split(/\r?\n/).filter(l=>/kex:|KEXINIT|SSH2_MSG|Connection reset|kex_exchange/.test(l)).slice(-8);
    const counts=read('inventory/table-counts.json');const tables=read('inventory/sql-tables.json');
    emit('readiness-details',{configDetails,auth:{disable_signup:auth.disable_signup,site_url:auth.site_url,uri_allow_list:auth.uri_allow_list,emailProvider:auth.external_email_enabled,smtpConfigured:Boolean(auth.smtp_host),hooksEnabled:Object.entries(auth).filter(([k,v])=>k.startsWith('hook_')&&k.endsWith('_enabled')&&v===true).map(([k])=>k)},embeddedUsProjectReferences:references,embeddedStorageObjectUuidReferences:storageIdReferences,sshResetStage:sshReset,
      tableGroups:['public','private','auth'].map(schema=>({schema,tables:tables.filter(t=>t.schema===schema&&['r','p'].includes(t.relkind)).length,rows:counts.filter(t=>t.schema===schema).reduce((sum,t)=>sum+Number(t.rows),0)})),
      userFunctionsWithUrl:read('inventory/sql-functions.json').filter(f=>['public','private'].includes(f.schema)&&/https?:\/\//.test(f.definition??'')).map(f=>({schema:f.schema,name:f.proname})),
      webhookTriggers:read('inventory/sql-triggers.json').filter(t=>/supabase_functions|http_request|net\.http/.test(t.definition??'')).map(t=>({schema:t.schema,table:t.table_name,name:t.tgname})),
      storageAggregate:read('storage/manifest.json').reduce((o,f)=>{o[f.bucket]??={files:0,bytes:0};o[f.bucket].files++;o[f.bucket].bytes+=f.size;return o},{})});return;
  }
  if(action==='mikrotik-logs') {
    const end=new Date(),start=new Date(end.getTime()-24*60*60*1000);
    const query="SELECT log_attributes['request.path'] AS path,log_attributes['request.headers.referer'] AS referer,log_attributes['request.headers.user_agent'] AS agent,count() AS events FROM logs WHERE source='edge_logs' AND positionCaseInsensitive(log_attributes['request.path'],'mikrotik')>0 GROUP BY path,referer,agent ORDER BY events DESC LIMIT 100";
    const params=new URLSearchParams({sql:query,iso_timestamp_start:start.toISOString(),iso_timestamp_end:end.toISOString()});
    const response=await request('readiness/source-mikrotik-logs.json',`/v1/projects/${ref}/analytics/endpoints/logs?${params}`);
    const rows=response?.result;const summary={start:start.toISOString(),end:end.toISOString(),queryError:Boolean(response?.error),groups:Array.isArray(rows)?rows.map(r=>({table:r.path?.split('?')[0].split('/')[3],origin:(()=>{try{return new URL(r.referer).origin}catch{return null}})(),agentFamily:/mikrotik|routeros/i.test(r.agent??'')?'routeros':/mozilla/i.test(r.agent??'')?'browser':r.agent?'other':'absent',events:r.events})):null};
    save('readiness/source-mikrotik-summary.json',summary);emit('mikrotik-logs',summary);return;
  }
  if(action==='public-consumers') {
    const pages=read('inventory/cloudflare-pages-recheck.json').result;
    const sites=[...pages.map(p=>({name:p.name,url:'https://'+(p.domains.find(d=>!d.endsWith('.pages.dev'))??p.domains[0])})),{name:'daztore',url:'https://daztore.web.id'}];
    const results=[];
    for(const site of sites){
      const result={...site,files:0,bytes:0,projectRefs:[],mikrotikLiteral:false,limitedToInitialScripts:true};
      try{
        const r=await fetch(site.url,{signal:AbortSignal.timeout(15000)});result.status=r.status;const html=await r.text();save('readiness/public-'+site.name+'-html',html);
        const scripts=[...html.matchAll(/<script[^>]+src=["']([^"']+)["']/g)].map(m=>new URL(m[1],site.url).href).filter(u=>new URL(u).origin===new URL(site.url).origin).slice(0,12);
        const contents=[html];for(const [index,url] of scripts.entries()){
          const response=await fetch(url,{signal:AbortSignal.timeout(15000)});if(!response.ok||Number(response.headers.get('content-length')??0)>2500000){result.skippedLargeOrFailed=true;continue}
          const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>2500000||result.bytes+bytes.length>6000000){result.skippedLargeOrFailed=true;continue}
          save('readiness/public-'+site.name+'-script-'+index,bytes);contents.push(bytes.toString());result.files++;result.bytes+=bytes.length;
        }
        result.projectRefs=[...new Set(contents.flatMap(c=>[...c.matchAll(/([a-z0-9]{20})\.supabase\.co/g)].map(m=>m[1])))];result.mikrotikLiteral=contents.some(c=>/mikrotik_users|mikrotik_bayar_tagihan/.test(c));
      }catch(e){result.error=e.name}
      results.push(result);emit('public-consumer',result);
    }
    save('readiness/public-consumers.json',{at:new Date().toISOString(),results});return;
  }
  if(action==='platform-readiness') {
    const result={at:new Date().toISOString(),platform:[]};
    for(const [name,suffix] of [['custom-hostname','/custom-hostname'],['vanity-subdomain','/vanity-subdomain'],['branches','/branches'],['disk','/config/disk']]) {
      const states=[];
      for(const [label,project] of [['source',ref],['target',targetState().ref]]){
        const response=await fetch(`https://api.supabase.com/v1/projects/${project}${suffix}`,{headers:{Authorization:`Bearer ${env.SUPABASE_ACCESS_TOKEN}`},signal:AbortSignal.timeout(20000)});
        const bytes=Buffer.from(await response.arrayBuffer());save('readiness/'+label+'-'+name+'.json',bytes);
        let data;try{data=JSON.parse(bytes.toString())}catch{data=null}
        states.push({label,status:response.status,items:Array.isArray(data)?data.length:undefined,keys:Object.keys(data??{}),data});
      }
      result.platform.push({name,equal:JSON.stringify(states[0].data)===JSON.stringify(states[1].data),states:states.map(({data,...s})=>s)});
    }
    const sourceAuth=await request('readiness/source-auth-current.json',`/v1/projects/${ref}/config/auth`);
    result.sourceAuthChangedFields=sourceAuth?Object.keys(sourceAuth).filter(k=>JSON.stringify(sourceAuth[k])!==JSON.stringify(read('inventory/auth.json')[k])):null;
    const sourceSecrets=await request('readiness/source-secret-metadata.json',`/v1/projects/${ref}/secrets`);
    result.sourceCustomSecretsUnchanged=sourceSecrets?read('inventory/edge-secrets.json').filter(s=>!s.name.startsWith('SUPABASE_')).every(s=>sourceSecrets.some(t=>t.name===s.name&&s.value===t.value)):null;
    const cron=await nativeQuery('readiness/source-cron-current.json','SELECT jobid,jobname,schedule,active,command FROM cron.job ORDER BY jobid');
    const oldCron=read('inventory/sql-cron.json');result.sourceCron=cron?.map(j=>({id:j.jobid,name:j.jobname,schedule:j.schedule,active:j.active,commandUnchanged:oldCron.some(s=>s.jobid===j.jobid&&s.command===j.command)}));
    const current=JSON.parse(await targetPsql('readiness/target-storage-catalog',"SELECT coalesce(json_agg(t),'[]') FROM (SELECT id,bucket_id,name,owner,owner_id,metadata,user_metadata,version FROM storage.objects ORDER BY bucket_id,name) t",{readonly:true}));
    const proven=JSON.parse(open(fs.readFileSync(path.join(base,'restore/storage-catalog.stdout.enc'))).toString());
    const canonical=v=>{if(v===null||typeof v!=='object')return JSON.stringify(v);if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}'};
    result.targetStorageUnchangedSincePhysicalChecksumProof=canonical(current)===canonical(proven);
    result.jwtKeys=Object.fromEntries(['source','target'].map(label=>[label,(read(label==='source'?'inventory/signing-keys.json':'readiness/target-signing-keys.json').keys??[]).map(k=>({algorithm:k.algorithm,status:k.status}))]));
    // All DB queries above are explicitly read-only; no remediation is executed.
    save('readiness/platform-assessment.json',result);emit('platform-readiness',result);return;
  }
  if(action==='verify-function-source') {
    const workdir=path.join(base,'function-target-audit-work');fs.mkdirSync(workdir,{recursive:true});
    const child=spawn(process.execPath,[path.join(root,'node_modules/supabase/dist/supabase.js'),'functions','download','--project-ref',targetState().ref,'--use-api','--workdir',workdir],{env:{...process.env,SUPABASE_ACCESS_TOKEN:env.SUPABASE_ACCESS_TOKEN},windowsHide:true,stdio:['ignore','pipe','pipe']});
    const out=[];child.stdout.on('data',b=>out.push(b));child.stderr.on('data',b=>out.push(b));const status=await new Promise((resolve,reject)=>{child.on('close',resolve);child.on('error',reject)});
    save('readiness/target-function-download.log',Buffer.concat(out));if(status!==0)throw new Error('FUNCTION_AUDIT_DOWNLOAD_FAILED');
    const source=read('functions/source-manifest.json').filter(f=>f.path.startsWith('supabase/functions/')&&/\.(ts|js|json)$/.test(f.path));
    const result=source.map(s=>{const file=path.join(workdir,s.path);if(!fs.existsSync(file))return {path:s.path,missing:true};const bytes=fs.readFileSync(file);save('readiness/target-function-source/'+s.path,bytes);return {path:s.path,equal:hash(bytes)===s.sha256}});
    save('readiness/function-source-comparison.json',{at:new Date().toISOString(),result});emit('function-source-comparison',{result});return;
  }
  if(action==='report-safety') {
    const values=Object.entries(env).filter(([k,v])=>/PASSWORD|TOKEN|PRIVATE_KEY|SECRET_KEY|PUBLISHABLE_KEY/.test(k)&&v.length>12).map(([,v])=>v);
    for(const [k,v] of Object.entries(read('inventory/edge-secret-values-recovered.json')))if(!['ALLOWED_ORIGINS','SUPABASE_URL'].includes(k)&&typeof v==='string'&&v.length>12)values.push(v);
    values.push(targetState().password,read('inventory/vault-root-key.json').root_key);
    for(const item of read('target/api-keys.json'))if(item.api_key)values.push(item.api_key);
    const files=['scripts/lms-cutover-postcheck.mjs','scripts/supabase-lms-cutover.mjs','scripts/lms-cutover-browser-check.mjs','scripts/lms-provider-push-check.mjs','scripts/notification-check.mjs','supabase/setup/lms_cutover_target_freeze.sql','scripts/supabase-full-migration.mjs','scripts/supabase-lms-migration.mjs','scripts/image-variant-tools.mjs','scripts/validate-live.mjs','scripts/report-browser-check.mjs','docs/SUPABASE_FULL_MIGRATION.md','docs/SUPABASE_FULL_MIGRATION_ARCHIVE_2026-10-22.md','src/services/db.ts','src/services/images.ts','src/components/common/PrivateImage.tsx','supabase/functions/lesreport/index.ts','supabase/functions/push-dispatch/index.ts','supabase/functions/_shared/media.ts','supabase/functions/_shared/mediaVariants.ts','supabase/setup/lms_cutover_freeze.sql','supabase/setup/lms_cutover_unfreeze.sql','supabase/setup/lms_media_variants.sql','.env.example','tests/images.test.ts','tests/media-cache.test.ts','tests/private-image-variants.test.tsx'];
    for(const file of files){const content=fs.readFileSync(path.join(root,file),'utf8');if(values.some(v=>typeof v==='string'&&v.length>12&&content.includes(v))){
      const fields=[...Object.entries(env),...Object.entries(read('inventory/edge-secret-values-recovered.json'))].filter(([,v])=>typeof v==='string'&&v.length>12&&values.includes(v)&&content.includes(v)).map(([k])=>k);
      emit('literal-scan-match',{file,fieldNames:fields});throw new Error('CREDENTIAL_LITERAL_FOUND');
    }if(content.split(/\r?\n/).some(l=>/[ \t]+$/.test(l)))throw new Error('TRAILING_WHITESPACE_FOUND')}
    emit('report-safety',{files,credentialLiteralScanPassed:true,newFileWhitespacePassed:true});return;
  }
  if(action==='inventory') return inventory();
  if(action==='verify-backups') {
    for(const [name,m] of Object.entries(ledger)) {
      const encrypted=fs.readFileSync(path.join(base,name+'.enc'));
      if(hash(encrypted)!==m.encryptedSha256 || hash(open(encrypted))!==m.sha256) {emit('checksum-mismatch',{name});throw new Error('CHECKSUM_MISMATCH')}
    }
    emit('encrypted-artifacts-verified',{artifacts:Object.keys(ledger).length,base}); return;
  }
  if(action==='audit-backup-ledger'||action==='reconcile-backup-ledger') {
    const files=[];
    function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,e.name);if(e.isDirectory())walk(f);else if(e.isFile()&&f.endsWith('.enc')&&f!==ledgerPath)files.push(f)}}
    walk(base);const missing=[],mismatched=[];
    for(const f of files){const name=path.relative(base,f).split(path.sep).join('/').slice(0,-4),encrypted=fs.readFileSync(f),plain=open(encrypted);
      const m=ledger[name];if(!m)missing.push(name);else if(m.sha256!==hash(plain)||m.encryptedSha256!==hash(encrypted))mismatched.push(name)}
    emit('backup-ledger-audit',{files:files.length,listed:Object.keys(ledger).length,missing,mismatched,allGcmTagsValid:true});
    if(action==='reconcile-backup-ledger') {
      // The initial parallel capture superseded the original PostgREST 404
      // with the corrected endpoint's 200 response. No other mismatch is allowed.
      if(mismatched.some(n=>n!=='inventory/rest.json'))throw new Error('UNEXPECTED_BACKUP_MISMATCH');
      for(const name of [...missing,...mismatched])save(name,open(fs.readFileSync(path.join(base,name+'.enc'))));
      emit('backup-ledger-reconciled',{recoveredMissing:missing.length,replacedKnownSuperseded:mismatched});
    }return;
  }
  if(action==='summary') { emit('summary',read('inventory/summary.json')); return; }
  if(action==='details') {
    const get=name=>{try{return read(name)}catch{return null}};
    const summary=get('inventory/summary.json');
    const auth=get('inventory/auth.json');
    const vault=get('inventory/sql-vault.json');
    const cron=get('inventory/sql-cron.json');
    const secrets=get('inventory/edge-secrets.json');
    emit('details',{version:get('inventory/sql-version.json'),organization:get('inventory/organization.json'),
      tables:summary?.tableCounts,extensions:summary?.extensions,
      cron:Array.isArray(cron)?cron.map(j=>({id:j.jobid,name:j.jobname,active:j.active,schedule:j.schedule,commandBytes:j.command?.length})):null,
      vault:Array.isArray(vault)?vault.map(s=>({id:s.id,name:s.name})):null,
      vaultDecryption:get('inventory/sql-vault_decryption.json'),
      secretMetadata:Array.isArray(secrets)?secrets.map(s=>({name:s.name,digestOnly:/^[a-f0-9]{64}$/i.test(s.value??'')})):null,
      auth:auth?{site_url:auth.site_url,uri_allow_list:auth.uri_allow_list,providers:Object.entries(auth).filter(([k,v])=>/external_.*_enabled$/.test(k)&&v===true).map(([k])=>k),smtpConfigured:Boolean(auth.smtp_host),smtpPasswordPresent:Boolean(auth.smtp_pass),hookNames:Object.entries(auth).filter(([k,v])=>/hook_.*_enabled$/.test(k)&&v===true).map(([k])=>k)}:null,
      rootKeyFields:Object.keys(get('inventory/vault-root-key.json')??{}),backups:get('inventory/backups.json')}); return;
  }
  if(action==='diagnose') {
    const name=process.argv[3];if(!name||name.includes('..')||!/^[-a-zA-Z0-9_/\.]+$/.test(name))throw new Error('INVALID_ARTIFACT_NAME');
    let content=open(fs.readFileSync(path.join(base,name+'.enc'))).toString();
    for(const v of Object.values(env).filter(v=>v.length>8))content=content.replaceAll(v,'[redacted]');
    const errors=content.split('\n').filter(l=>/^(ERROR|WARNING|NOTICE|FATAL|STATEMENT):|server closed|SSL connection|connection to server|\"code\":|\"message\":/.test(l)||/^CREATE (?:SCHEMA|EXTENSION) /.test(l)).map(l=>l.replace(/'(?:[^']|'')*'/g,"'[redacted]'"));
    emit('diagnostic',{name,errors:errors.slice(0,30)});return;
  }
  if(action==='storage-ownership') {
    const m=read('storage/manifest.json');emit('storage-ownership',{files:m.length,ownerColumnSet:m.filter(o=>o.owner!==null).length,ownerIdColumnSet:m.filter(o=>o.owner_id!==null).length,
      ownerIdsInAuth:m.filter(o=>o.owner_id).length,byBucket:[...new Set(m.map(o=>o.bucket))].map(b=>({bucket:b,owned:m.filter(o=>o.bucket===b&&o.owner_id).length})),metadataOnlyFolders:m.filter(o=>o.size===0).length});return;
  }
  if(action==='target-status') {
    const result=await targetPsql('target/status',"SELECT coalesce(json_agg(t),'[]') FROM (SELECT a.pid,a.application_name,a.state,a.wait_event_type,a.wait_event,pg_catalog.pg_blocking_pids(a.pid) AS blocking,split_part(a.query,' ',1) AS command,extract(epoch from(now()-a.query_start))::int AS seconds FROM pg_catalog.pg_stat_activity a WHERE a.usename='postgres' AND a.pid<>pg_backend_pid()) t",{readonly:true});emit('target-status',{activity:JSON.parse(result)});return;
  }
  if(action==='vault-capabilities') {
    const result=await targetPsql('target/vault-capabilities',"SELECT json_build_object('insert',has_table_privilege(current_user,'vault.secrets','INSERT'),'update',has_table_privilege(current_user,'vault.secrets','UPDATE'),'delete',has_table_privilege(current_user,'vault.secrets','DELETE'),'owner',(SELECT pg_catalog.pg_get_userbyid(relowner) FROM pg_catalog.pg_class WHERE oid='vault.secrets'::regclass))",{readonly:true});
    const functions=read('inventory/sql-functions.json').filter(f=>f.schema==='vault'&&['create_secret','update_secret'].includes(f.proname)).map(f=>({name:f.proname,arguments:f.arguments,securityDefiner:f.prosecdef}));
    emit('vault-capabilities',{permissions:JSON.parse(result),functions});return;
  }
  if(action==='cleanup-orphan-restore') {
    const pid=Number(process.argv[3]);if(!Number.isInteger(pid)||pid<=0)throw new Error('INVALID_BACKEND_ID');
    const result=await targetPsql('target/orphan-cleanup',`SELECT coalesce(json_agg(t),'[]') FROM (SELECT pid,pg_catalog.pg_terminate_backend(pid) AS terminated FROM pg_catalog.pg_stat_activity WHERE pid=${pid} AND usename='postgres' AND state='idle in transaction' AND query_start<now()-interval '60 seconds' AND split_part(query,' ',1)='ALTER') t`);
    emit('target-orphan-cleanup',{result:JSON.parse(result)});return;
  }
  if(action==='cloudflare-check') {
    for(const name of ['token','pages']) {
      const j=read(`inventory/cloudflare-${name}.json`);emit('cloudflare-error',{name,errors:j.errors?.map(e=>({code:e.code,message:e.message}))});
    }
    const account=env.CLOUDFLARE_ACCOUNT_ID.match(/[a-f0-9]{32}/)?.[0];
    for(const [name,suffix] of [['account-token',`/accounts/${account}/tokens/verify`],['pages',`/accounts/${account}/pages/projects`]]) {
      const r=await fetch('https://api.cloudflare.com/client/v4'+suffix,{headers:{Authorization:`Bearer ${env.CLOUDFLARE_API_TOKEN}`},signal:AbortSignal.timeout(30000)});
      const j=await r.json();save(`inventory/cloudflare-${name}-recheck.json`,j);
      emit('cloudflare-recheck',{name,status:r.status,success:j.success,errors:j.errors?.map(e=>({code:e.code,message:e.message})),
        projects:Array.isArray(j.result)?j.result.map(p=>({name:p.name,domains:p.domains,sourceType:p.source?.type,environments:Object.fromEntries(Object.entries(p.deployment_configs??{}).map(([stage,c])=>[stage,{keys:Object.keys(c.env_vars??{}),sourceProjectKeys:Object.entries(c.env_vars??{}).filter(([,v])=>String(v.value??'').includes(ref)).map(([k])=>k)}]))})):undefined});
    }return;
  }
  if(action==='configure-target') {
    if(!ledger['restore/database-completed.json'])throw new Error('DATABASE_RESTORE_REQUIRED');
    const original=read('inventory/edge-secrets.json'),recovered=read('inventory/edge-secret-values-recovered.json');
    const custom=original.filter(s=>!s.name.startsWith('SUPABASE_'));
    const missing=custom.filter(s=>!recovered[s.name]||hash(recovered[s.name])!==s.value).map(s=>s.name);
    if(missing.length){emit('custom-secrets-missing',{names:missing});throw new Error('CUSTOM_EDGE_SECRETS_REQUIRED')}
    const ecdh=crypto.createECDH('prime256v1');ecdh.setPrivateKey(Buffer.from(recovered.VAPID_PRIVATE_KEY,'base64url'));
    if(!crypto.timingSafeEqual(ecdh.getPublicKey(),Buffer.from(recovered.VAPID_PUBLIC_KEY,'base64url')))throw new Error('VAPID_KEY_PAIR_MISMATCH');
    await targetApi('target/edge-secrets-set-response.json','/secrets','POST',custom.map(s=>({name:s.name,value:recovered[s.name]})));
    const targetSecrets=await targetApi('target/edge-secrets-verification.json','/secrets');
    if(custom.some(s=>!targetSecrets.some(t=>t.name===s.name&&t.value===s.value)))throw new Error('TARGET_SECRET_DIGEST_MISMATCH');
    const spec=JSON.parse(fs.readFileSync(path.join(root,'supabase/.temp/management-openapi.json')));
    const oldAuth=read('inventory/auth.json');
    const currentAuth=await targetApi('target/auth-before-update.json','/config/auth');
    const authFields=Object.keys(spec.components.schemas.UpdateAuthConfigBody.properties);
    const authBody=Object.fromEntries(Object.entries(oldAuth).filter(([k,v])=>authFields.includes(k)&&v!==null&&JSON.stringify(v)!==JSON.stringify(currentAuth[k])));
    if(!oldAuth.smtp_host)for(const k of Object.keys(authBody))if(k.startsWith('smtp_')||k==='rate_limit_email_sent')delete authBody[k];
    for(const k of Object.keys(authBody))if(k.startsWith('hook_')&&!Object.entries(oldAuth).some(([n,v])=>n.startsWith(k.replace(/_(uri|secrets|enabled)$/,''))&&n.endsWith('_enabled')&&v===true))delete authBody[k];
    // Public signup is quarantined during staging; admin-created test fixtures
    // and existing-user password login remain possible without outbound mail.
    authBody.disable_signup=true;
    await targetApi('target/auth-update-response.json','/config/auth','PATCH',authBody);
    const oldRest=read('inventory/rest.json');
    const restSchema=spec.paths['/v1/projects/{ref}/postgrest'].patch.requestBody.content['application/json'].schema.$ref.split('/').pop();
    const restFields=Object.keys(spec.components.schemas[restSchema].properties);
    await targetApi('target/rest-update-response.json','/postgrest','PATCH',Object.fromEntries(Object.entries(oldRest).filter(([k,v])=>restFields.includes(k)&&v!==null)));
    const realtime=read('inventory/realtime.json');
    const realtimeFields=Object.keys(spec.components.schemas.UpdateRealtimeConfigBody.properties);
    await targetApi('target/realtime-update-response.json','/config/realtime','PATCH',Object.fromEntries(Object.entries(realtime).filter(([k,v])=>realtimeFields.includes(k)&&v!==null)));
    await targetApi('target/api-keys.json','/api-keys?reveal=true');
    const vault=JSON.parse(await targetPsql('target/vault-values',"SELECT coalesce(json_agg(t),'[]') FROM (SELECT id,name,decrypted_secret FROM vault.decrypted_secrets ORDER BY name) t",{readonly:true}));
    if(vault.find(s=>s.name==='lms_push_dispatch_secret')?.decrypted_secret!==recovered.LMS_PUSH_DISPATCH_SECRET||vault.find(s=>s.name==='lms_push_function_url')?.decrypted_secret!==`https://${targetState().ref}.supabase.co/functions/v1/push-dispatch`)throw new Error('TARGET_VAULT_CONFIG_MISMATCH');
    save('target/configuration-completed.json',{at:new Date().toISOString(),customSecrets:custom.map(s=>s.name),vapidPairMatches:true,vaultMatches:true,signupQuarantined:true});
    emit('target-configured',{customSecrets:custom.map(s=>s.name),vapidPairMatches:true,vaultMatches:true,signupQuarantined:true});return;
  }
  if(action==='restore-storage') {
    if(!ledger['restore/database-completed.json'])throw new Error('DATABASE_RESTORE_REQUIRED');
    const {createClient}=await import('@supabase/supabase-js');
    const keys=await targetApi('target/api-keys.json','/api-keys?reveal=true');
    const service=keys.find(k=>k.name==='service_role')?.api_key??keys.find(k=>k.type==='secret')?.api_key;
    const publicKey=keys.find(k=>k.type==='publishable')?.api_key??keys.find(k=>k.name==='anon')?.api_key;
    if(!service||!publicKey)throw new Error('TARGET_KEYS_REQUIRED');
    const url=`https://${targetState().ref}.supabase.co`;
    const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
    const admin=createClient(url,service,options),ownerClients=new Map();
    const manifest=read('storage/manifest.json'),sourceObjects=read('inventory/sql-storage_objects.json'),buckets=read('inventory/storage-buckets.json');
    if(buckets.some(b=>b.owner||b.owner_id))throw new Error('BUCKET_OWNERSHIP_REQUIRES_REVIEW');
    const mediaState=JSON.parse(await targetPsql('restore/storage-media-baseline',"SELECT coalesce(json_agg(t),'[]') FROM (SELECT id,object_path,state FROM public.lms_media_assets) t",{readonly:true}));
    const quote=v=>"'"+String(v).replaceAll("'","''")+"'";
    const restoreStates=()=>mediaState.map(m=>`UPDATE public.lms_media_assets SET state=${quote(m.state)} WHERE id=${quote(m.id)}::uuid;`).join('\n');
    save('restore/storage-media-baseline.json',mediaState);
    try {
      const listed=await admin.storage.listBuckets();if(listed.error)throw new Error('TARGET_BUCKET_LIST_FAILED');
      for(const b of buckets) {
        const existing=listed.data.find(x=>x.id===b.id);
        const expected={public:b.public,fileSizeLimit:b.file_size_limit,allowedMimeTypes:b.allowed_mime_types};
        if(!existing) {
          const r=await admin.storage.createBucket(b.id,expected);
          if(r.error){save('restore/storage-bucket-error.json',r.error);throw new Error('TARGET_BUCKET_CREATE_FAILED')}
        } else if(existing.public!==b.public||Number(existing.file_size_limit)!==Number(b.file_size_limit)||JSON.stringify(existing.allowed_mime_types)!==JSON.stringify(b.allowed_mime_types))throw new Error('TARGET_BUCKET_CONFIG_MISMATCH');
      }
      for(const owner of [...new Set(manifest.map(o=>o.owner_id||o.owner).filter(Boolean))]) {
        const user=await admin.auth.admin.getUserById(owner);
        if(user.error||!user.data.user?.email)throw new Error('STORAGE_OWNER_ACCOUNT_UNAVAILABLE');
        const generated=await admin.auth.admin.generateLink({type:'magiclink',email:user.data.user.email});
        if(generated.error||!generated.data.properties?.hashed_token)throw new Error('TARGET_OWNER_LINK_FAILED');
        const client=createClient(url,publicKey,{auth:{...options.auth,storageKey:'migration-'+owner}});
        const verified=await client.auth.verifyOtp({token_hash:generated.data.properties.hashed_token,type:'magiclink'});
        if(verified.error||verified.data.user?.id!==owner)throw new Error('TARGET_OWNER_LOGIN_FAILED');
        ownerClients.set(owner,client);
        emit('storage-owner-session-ready',{ownerFingerprint:hash(owner).slice(0,12)});
      }
      const needPending=manifest.filter(o=>o.bucket==='lms_media'&&(o.owner_id||o.owner)).map(o=>o.path);
      if(needPending.length)await targetPsql('restore/media-upload-preparation',`BEGIN; SET LOCAL session_replication_role=replica; UPDATE public.lms_media_assets SET state='pending' WHERE object_path IN (${needPending.map(quote).join(',')}); COMMIT;`);
      for(const o of manifest) {
        const bytes=open(fs.readFileSync(path.join(base,o.artifact+'.enc')));
        if(hash(bytes)!==o.sha256||bytes.length!==o.size)throw new Error('STORAGE_BACKUP_CHECKSUM_MISMATCH');
        const itemId=o.artifact.split('/').pop(),checkpoint=`restore/storage/${itemId}.json`;
        const existing=await admin.storage.from(o.bucket).download(o.path);
        if(!existing.error) {
          const present=Buffer.from(await existing.data.arrayBuffer());
          if(hash(present)!==o.sha256)throw new Error('EXISTING_TARGET_OBJECT_CONTENT_MISMATCH');
          emit('storage-file-resumed',{itemId});
        } else {
          // Download errors are not permission to overwrite; query metadata to
          // distinguish absence from an existing but unreadable/incomplete object.
          const q=`SELECT count(*)::int FROM storage.objects WHERE bucket_id=${quote(o.bucket)} AND name=${quote(o.path)}`;
          const count=Number(await targetPsql('restore/storage-presence-check',q,{readonly:true}));
          if(count!==0)throw new Error('EXISTING_TARGET_OBJECT_UNREADABLE');
          const source=sourceObjects.find(s=>s.bucket_id===o.bucket&&s.name===o.path);
          const client=ownerClients.get(o.owner_id||o.owner)??admin;
          const cacheControl=source.metadata?.cacheControl?.match(/max-age=(\d+)/)?.[1]??'3600';
          const result=await client.storage.from(o.bucket).upload(o.path,bytes,{contentType:o.mime||'application/octet-stream',cacheControl,
            upsert:false,metadata:source.user_metadata??undefined});
          if(result.error){save('restore/storage-upload-error.json',result.error);emit('storage-upload-failed',{itemId,status:result.error.statusCode});throw new Error('STORAGE_UPLOAD_FAILED')}
          const downloaded=await admin.storage.from(o.bucket).download(o.path);
          if(downloaded.error||hash(Buffer.from(await downloaded.data.arrayBuffer()))!==o.sha256)throw new Error('TARGET_STORAGE_CHECKSUM_MISMATCH');
          save(checkpoint,{sha256:o.sha256,size:o.size,verifiedAt:new Date().toISOString()});emit('storage-file-restored',{itemId,bytes:o.size});
        }
      }
    } finally {
      await targetPsql('restore/media-state-cleanup',`BEGIN; SET LOCAL session_replication_role=replica; ${restoreStates()} COMMIT;`);
      for(const client of ownerClients.values()) {const r=await client.auth.signOut({scope:'local'});if(r.error)save('restore/owner-signout-error.json',r.error)}
    }
    const actual=JSON.parse(await targetPsql('restore/storage-catalog',"SELECT coalesce(json_agg(t),'[]') FROM (SELECT id,bucket_id,name,owner,owner_id,metadata,user_metadata,version FROM storage.objects ORDER BY bucket_id,name) t",{readonly:true}));
    if(actual.length!==manifest.length)throw new Error('TARGET_STORAGE_COUNT_MISMATCH');
    const differences=[];
    for(const o of manifest) {
      const t=actual.find(t=>t.bucket_id===o.bucket&&t.name===o.path);
      if(!t||t.owner!==o.owner||t.owner_id!==o.owner_id||Number(t.metadata?.size)!==o.size||t.metadata?.mimetype!==o.mime)differences.push(o.artifact.split('/').pop());
    }
    if(differences.length){save('restore/storage-differences.json',differences);throw new Error('TARGET_STORAGE_METADATA_MISMATCH')}
    const result={files:manifest.length,bytes:manifest.reduce((n,o)=>n+o.size,0),ownersPreserved:true,contentChecksumsMatch:true,
      storageObjectUuidsRegenerated:manifest.filter(o=>actual.find(t=>t.bucket_id===o.bucket&&t.name===o.path).id!==o.id).length,at:new Date().toISOString()};
    save('restore/storage-completed.json',result);emit('storage-restored',result);return;
  }
  if(action==='deploy-functions') {
    if(!ledger['target/configuration-completed.json'])throw new Error('TARGET_CONFIGURATION_REQUIRED');
    const t=targetState(),functions=read('inventory/functions.json'),workdir=path.join(base,'function-source-work');
    for(const f of functions)if(!fs.existsSync(path.join(workdir,'supabase','functions',f.slug,'index.ts')))throw new Error('FUNCTION_SOURCE_MISSING');
    fs.writeFileSync(path.join(workdir,'supabase','config.toml'),`project_id = "db-daz"\n`+functions.map(f=>`\n[functions.${f.slug}]\nverify_jwt = ${Boolean(f.verify_jwt)}\n`).join(''));
    const denoSource=path.join(root,'supabase/functions/deno.json');
    if(fs.existsSync(denoSource))fs.copyFileSync(denoSource,path.join(workdir,'supabase/functions/deno.json'));
    const child=spawn(process.execPath,[path.join(root,'node_modules/supabase/dist/supabase.js'),'functions','deploy','--project-ref',t.ref,'--use-api','--workdir',workdir],{
      env:{...process.env,SUPABASE_ACCESS_TOKEN:env.SUPABASE_ACCESS_TOKEN},windowsHide:true,stdio:['ignore','pipe','pipe']});
    const out=[];child.stdout.on('data',b=>out.push(b));child.stderr.on('data',b=>out.push(b));
    const status=await new Promise((resolve,reject)=>{child.on('close',resolve);child.on('error',reject)});
    save('restore/function-deployment.log',Buffer.concat(out));
    if(status!==0){emit('function-deployment-failed',{status});throw new Error('FUNCTION_DEPLOYMENT_FAILED')}
    const actual=await targetApi('target/functions-verification.json','/functions');
    if(actual.length!==functions.length||functions.some(f=>!actual.some(t=>t.slug===f.slug&&t.verify_jwt===f.verify_jwt&&t.status==='ACTIVE')))throw new Error('FUNCTION_METADATA_MISMATCH');
    const proof={functions:actual.map(f=>({slug:f.slug,status:f.status,verify_jwt:f.verify_jwt})),at:new Date().toISOString()};
    save('restore/functions-completed.json',proof);emit('functions-deployed',proof);return;
  }
  if(action==='compare-data') {await compareData();return}
  if(action==='compare-schema') {
    const strictSchemas=['public','private','supabase_migrations'];
    const comparisons=[];
    const originalPermissions=read('inventory/effective-permissions.json'),actualPermissions=read('verification/effective-permissions.json');
    if(originalPermissions.length<50||JSON.stringify(originalPermissions)!==JSON.stringify(actualPermissions))throw new Error('EFFECTIVE_PERMISSIONS_NOT_VERIFIED');
    const canonical=value=>JSON.stringify(value,Object.keys(value).sort());
    for(const name of ['schemas','tables','columns','constraints','indexes','policies','functions','triggers','views','roles','memberships','default_acl','extensions','publications','publication_tables','foreign_servers']) {
      const source=read(`inventory/sql-${name}.json`);
      const target=await targetApi(`verification/catalog-${name}.json`,'/database/query','POST',{read_only:true,query:catalogQueries[name]});
      if(!Array.isArray(source)||!Array.isArray(target))throw new Error('CATALOG_CAPTURE_INCOMPLETE');
      function cleaned(rows,strict) {
        return rows.filter(r=>!strict||strictSchemas.includes(r.schema??r.schemaname)||['roles','memberships','extensions','publications','publication_tables','foreign_servers'].includes(name))
          .map(r=>{const v={...r};for(const k of ['estimated_rows','bytes','oid','pubowner'])delete v[k];if(['schemas','tables','functions'].includes(name))delete v.acl;return canonical(v)}).sort();
      }
      const s=cleaned(source,true),t=cleaned(target,true),sourceSet=new Set(s),targetSet=new Set(t);
      const missing=s.filter(r=>!targetSet.has(r)),extra=t.filter(r=>!sourceSet.has(r));
      const result={catalog:name,sourceCount:s.length,targetCount:t.length,equal:missing.length===0&&extra.length===0,missing,extra};
      comparisons.push(result);emit('catalog-compared',{catalog:name,sourceCount:s.length,targetCount:t.length,equal:result.equal,differences:missing.length+extra.length});
    }
    save('verification/schema-comparison.json',comparisons);
    const sourcePolicies=read('inventory/sql-policies.json').filter(p=>['auth','storage'].includes(p.schemaname)),targetPolicies=read('verification/catalog-policies.json').filter(p=>['auth','storage'].includes(p.schemaname));
    const managedPolicyProof={source:sourcePolicies.length,target:targetPolicies.length,equal:JSON.stringify(sourcePolicies)===JSON.stringify(targetPolicies)};
    save('verification/managed-policies.json',managedPolicyProof);emit('managed-policies-compared',managedPolicyProof);
    emit('schema-comparison-complete',{catalogs:comparisons.length,equal:comparisons.filter(c=>c.equal).length,differing:comparisons.filter(c=>!c.equal).map(c=>c.catalog)});return;
  }
  if(action==='schema-difference-details') {
    for(const name of ['schemas','tables','functions']) {
      const source=read(`inventory/sql-${name}.json`).filter(r=>['public','private','supabase_migrations'].includes(r.schema));
      const target=read(`verification/catalog-${name}.json`);
      const changes=[];
      for(const s of source){const t=target.find(t=>t.schema===s.schema&&(name==='schemas'||name==='functions'?name==='schemas'||t.proname===s.proname&&t.arguments===s.arguments:t.name===s.name));if(!t)continue;
        const keys=Object.keys(s).filter(k=>!['estimated_rows','bytes'].includes(k)&&JSON.stringify(s[k])!==JSON.stringify(t[k]));
        if(keys.length)changes.push({object:s.schema+'.'+(s.name??s.proname??''),fields:keys,
          sourceAcl:s.acl,targetAcl:t.acl,sourceOwner:s.owner,targetOwner:t.owner,
          definitionEqualAfterNewlineNormalization:s.definition&&s.definition.replaceAll('\r\n','\n')===t.definition?.replaceAll('\r\n','\n')});
      }emit('schema-change-details',{catalog:name,changes});
    }
    const roles=read('inventory/sql-roles.json'),targetRoles=read('verification/catalog-roles.json');
    emit('platform-differences',{missingRoles:roles.filter(s=>!targetRoles.some(t=>t.rolname===s.rolname)).map(r=>r.rolname),sourceExtensions:read('inventory/sql-extensions.json'),targetExtensions:read('verification/catalog-extensions.json'),sourcePublications:read('inventory/sql-publications.json'),sourcePublicationTables:read('inventory/sql-publication_tables.json')});return;
  }
  if(action==='test-shapes') {
    const names=['admin_users','faqs','mikrotik_users','mikrotik_bayar_tagihan','lms_notifications'];
    emit('test-shapes',{columns:read('inventory/sql-columns.json').filter(c=>c.schema==='public'&&names.includes(c.table_name)),
      mikrotikPolicies:read('inventory/sql-policies.json').filter(p=>p.tablename?.startsWith('mikrotik_')),
      mikrotikTriggers:read('inventory/sql-triggers.json').filter(t=>t.table_name?.startsWith('mikrotik_')).map(t=>({table:t.table_name,name:t.tgname,definition:t.definition})),
      mikrotikFunctionDependencies:read('inventory/sql-functions.json').filter(f=>/mikrotik_users|mikrotik_bayar_tagihan/.test(f.definition??'')).map(f=>({schema:f.schema,name:f.proname}))});return;
  }
  if(action==='check-diagnostics') {
    for(const name of Object.keys(ledger).filter(n=>n.startsWith('verification/check-error-')))emit('check-diagnostic',{name,...read(name)});
    for(const name of ['verification/http-test-edge-runtime.json','verification/http-push-dispatch-unauthorized.json'])if(ledger[name]){const r=read(name);emit('http-diagnostic',{name,status:r.status})}
    return;
  }
  if(action==='restore-permissions-realtime') {
    const original=await nativeQuery('inventory/effective-permissions.json',permissionQuery);
    const current=JSON.parse(await targetPsql('target/effective-permissions',`SELECT json_agg(t) FROM (${permissionQuery}) t`,{readonly:true}));
    if(!original||original.length!==current.length)throw new Error('PERMISSION_OBJECT_SET_MISMATCH');
    const quote=s=>'"'+s.replaceAll('"','""')+'"',role=s=>s==='PUBLIC'?'PUBLIC':quote(s),lit=s=>"'"+s.replaceAll("'","''")+"'";
    const identity=o=>o.kind+' '+o.schema+'.'+o.name+' '+(o.arguments??'');
    const statements=[];
    for(const o of original) {
      const t=current.find(t=>identity(t)===identity(o));if(!t||t.owner!==o.owner)throw new Error('PERMISSION_OWNER_MISMATCH');
      if(o.grants.some(g=>g.grantor!==o.owner))throw new Error('NONOWNER_GRANTOR_REQUIRES_REVIEW');
      const object=`${o.kind.toUpperCase()} ${o.kind==='schema'?quote(o.name):quote(o.schema)+'.'+quote(o.name)}${o.kind==='function'?'('+o.arguments+')':''}`;
      const roles=[...new Set(['PUBLIC',...o.grants.map(g=>g.grantee),...t.grants.map(g=>g.grantee)])];
      statements.push(`REVOKE ALL PRIVILEGES ON ${object} FROM ${roles.map(role).join(',')};`);
      const groups=new Map();for(const g of o.grants){const key=g.grantee+'|'+g.grantable;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(g)}
      for(const grants of groups.values())statements.push(`GRANT ${grants.map(g=>g.privilege).join(',')} ON ${object} TO ${role(grants[0].grantee)}${grants[0].grantable?' WITH GRANT OPTION':''};`);
    }
    const columnAcl=await nativeQuery('inventory/column-privileges.json',"SELECT n.nspname AS schema,c.relname AS name,a.attname,a.attacl::text FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class c ON c.oid=a.attrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','private','supabase_migrations') AND a.attacl IS NOT NULL");
    if(columnAcl?.length)throw new Error('COLUMN_PRIVILEGES_REQUIRE_REVIEW');
    const pubs=read('inventory/sql-publications.json'),targetPubs=read('verification/catalog-publications.json'),members=read('inventory/sql-publication_tables.json'),targetMembers=read('verification/catalog-publication_tables.json');
    for(const p of pubs) {
      if(!targetPubs.some(t=>t.pubname===p.pubname)) {
        const actions=['insert','update','delete','truncate'].filter(a=>p['pub'+a]).join(',');
        statements.push(`CREATE PUBLICATION ${quote(p.pubname)}${p.puballtables?' FOR ALL TABLES':''} WITH (publish=${lit(actions)},publish_via_partition_root=${p.pubviaroot});`);
      }
      if(p.puballtables)continue;
      for(const m of members.filter(m=>m.pubname===p.pubname&&['public','private'].includes(m.schemaname))) {
        if(!targetMembers.some(t=>t.pubname===m.pubname&&t.schemaname===m.schemaname&&t.tablename===m.tablename)) {
          const columns=m.attnames.slice(1,-1).split(',').map(quote).join(',');
          statements.push(`ALTER PUBLICATION ${quote(p.pubname)} ADD TABLE ONLY ${quote(m.schemaname)}.${quote(m.tablename)} (${columns})${m.rowfilter?' WHERE ('+m.rowfilter+')':''};`);
        }
      }
    }
    await targetPsql('restore/permissions-realtime',`BEGIN;\n${statements.join('\n')}\nCOMMIT;`);
    const actual=JSON.parse(await targetPsql('verification/effective-permissions',`SELECT json_agg(t) FROM (${permissionQuery}) t`,{readonly:true}));
    save('verification/effective-permissions.json',actual);
    if(JSON.stringify(original)!==JSON.stringify(actual))throw new Error('EFFECTIVE_PERMISSION_MISMATCH');
    emit('permissions-restored',{objects:original.length,exactEffectiveGrants:true,columnPrivileges:0,sourcePublications:pubs.map(p=>p.pubname)});return;
  }
  if(action==='verify-relations') {
    const definitions=JSON.parse(await targetPsql('verification/fk-definitions',"SELECT coalesce(json_agg(t),'[]') FROM (SELECT k.conname,n.nspname AS schema,c.relname AS table_name,pn.nspname AS parent_schema,p.relname AS parent_table,ARRAY(SELECT a.attname FROM unnest(k.conkey) WITH ORDINALITY x(num,ord) JOIN pg_catalog.pg_attribute a ON a.attrelid=k.conrelid AND a.attnum=x.num ORDER BY ord) AS child_columns,ARRAY(SELECT a.attname FROM unnest(k.confkey) WITH ORDINALITY x(num,ord) JOIN pg_catalog.pg_attribute a ON a.attrelid=k.confrelid AND a.attnum=x.num ORDER BY ord) AS parent_columns FROM pg_catalog.pg_constraint k JOIN pg_catalog.pg_class c ON c.oid=k.conrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace JOIN pg_catalog.pg_class p ON p.oid=k.confrelid JOIN pg_catalog.pg_namespace pn ON pn.oid=p.relnamespace WHERE k.contype='f' AND n.nspname IN ('public','private','auth','supabase_migrations')) t",{readonly:true}));
    const q=s=>'"'+s.replaceAll('"','""')+'"',lit=s=>"'"+s.replaceAll("'","''")+"'";
    const checks=definitions.map(d=>`SELECT ${lit(d.schema+'.'+d.table_name+'.'+d.conname)} AS constraint_name,count(*)::int AS orphans FROM ${q(d.schema)}.${q(d.table_name)} c WHERE ${d.child_columns.map(c=>`c.${q(c)} IS NOT NULL`).join(' AND ')} AND NOT EXISTS (SELECT 1 FROM ${q(d.parent_schema)}.${q(d.parent_table)} p WHERE ${d.child_columns.map((c,i)=>`c.${q(c)}=p.${q(d.parent_columns[i])}`).join(' AND ')})`);
    const result=JSON.parse(await targetPsql('verification/fk-checks',`SELECT json_agg(t) FROM (${checks.join(' UNION ALL ')}) t`,{readonly:true}));
    save('verification/relations.json',result);emit('relations-verified',{constraints:result.length,orphans:result.reduce((n,c)=>n+c.orphans,0)});
    if(result.some(c=>c.orphans))throw new Error('FOREIGN_KEY_ORPHANS_FOUND');return;
  }
  if(action==='functional-checks') {
    if(!ledger['verification/effective-permissions.json']||!ledger['restore/functions-completed.json'])throw new Error('SECURITY_AND_FUNCTION_RESTORE_REQUIRED');
    const {createClient}=await import('@supabase/supabase-js');
    const keys=read('target/api-keys.json'),url=`https://${targetState().ref}.supabase.co`;
    const service=keys.find(k=>k.name==='service_role')?.api_key??keys.find(k=>k.type==='secret')?.api_key;
    const pub=keys.find(k=>k.type==='publishable')?.api_key??keys.find(k=>k.name==='anon')?.api_key;
    const anonJwt=keys.find(k=>k.name==='anon')?.api_key;
    const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
    const admin=createClient(url,service,options),anonymous=createClient(url,pub,options);
    if(ledger['verification/fixtures.json']&&!read('verification/fixtures.json').cleaned)await cleanupFixtures(read('verification/fixtures.json'));
    const fixture={id:crypto.randomUUID(),users:[],subject:null,faq:crypto.randomUUID(),parent:crypto.randomUUID(),child:crypto.randomUUID(),comment:crypto.randomUUID(),notification:crypto.randomUUID()};
    save('verification/fixtures.json',fixture);
    const results=[],clients=[];let channel;
    const expect=(condition,reason)=>{if(!condition)throw new Error(reason)};
    const only=process.argv[3]?.split(',');
    const check=async(name,fn)=>{if(only&&!only.includes(name)&&name!=='auth-password-login')return;try{await fn();results.push({name,passed:true});emit('check-passed',{name})}catch(e){save('verification/check-error-'+name+'.json',{type:e.name,reason:/^[A-Z_]+$/.test(e.message)?e.message:'CHECK_ERROR'});results.push({name,passed:false});emit('check-failed',{name})}};
    try {
      await check('auth-password-login',async()=>{
        for(let i=0;i<2;i++) {
          const password=crypto.randomBytes(32).toString('base64url'),email=`migration-${fixture.id}-${i}@example.com`;
          const created=await admin.auth.admin.createUser({email,password,email_confirm:true});
          if(created.error){save('verification/auth-create-error.json',created.error);throw new Error('FIXTURE_AUTH_CREATE_FAILED')}
          const user={id:created.data.user.id,email};fixture.users.push(user);save('verification/fixtures.json',fixture);
          const client=createClient(url,pub,{auth:{...options.auth,storageKey:'migration-test-'+i}});
          const login=await client.auth.signInWithPassword({email,password});
          if(login.error){save('verification/auth-login-error.json',login.error);throw new Error('FIXTURE_PASSWORD_LOGIN_FAILED')}
          expect(login.data.user.id===user.id,'AUTH_USER_ID_MISMATCH');clients.push(client);
          const profile=await client.from('lms_profiles').insert({id:user.id,name:'Migration fixture '+i});
          if(profile.error){save('verification/profile-insert-error.json',profile.error);throw new Error('FIXTURE_PROFILE_INSERT_FAILED')}
        }
        await targetPsql('verification/fixture-admin',`INSERT INTO public.admin_users(id,email,is_active) VALUES ('${fixture.users[0].id}','${fixture.users[0].email}',true);`);
      });
      if(clients.length===2) {
        const [a,b]=clients;
        await check('lms-crud-rls-version',async()=>{
          fixture.subject=crypto.randomUUID();save('verification/fixtures.json',fixture);
          let r=await a.rpc('lms_save_record',{p_table:'lms_subjects',p_data:{id:fixture.subject,name:'Migration '+fixture.id},p_version:null});
          if(r.error){save('verification/lms-create-error.json',r.error);throw new Error('LMS_CREATE_FAILED')}
          fixture.subject=r.data.id;save('verification/fixtures.json',fixture);
          expect(Boolean(fixture.subject),'LMS_SUBJECT_ID_MISSING');
          const hidden=await b.from('lms_subjects').select('id').eq('id',fixture.subject);expect(!hidden.error&&hidden.data.length===0,'CROSS_OWNER_READ_ALLOWED');
          const denied=await b.rpc('lms_save_record',{p_table:'lms_subjects',p_data:{id:fixture.subject,name:'Cross owner'},p_version:r.data.version});expect(Boolean(denied.error),'CROSS_OWNER_WRITE_ALLOWED');
          const originalVersion=r.data.version;
          r=await a.rpc('lms_save_record',{p_table:'lms_subjects',p_data:{id:fixture.subject,name:'Migration updated '+fixture.id},p_version:originalVersion});
          if(r.error){save('verification/lms-update-error.json',r.error);throw new Error('LMS_UPDATE_FAILED')}
          const stale=await a.rpc('lms_save_record',{p_table:'lms_subjects',p_data:{id:fixture.subject,name:'Stale'},p_version:originalVersion});expect(stale.status===409,'VERSION_CONFLICT_NOT_409');
          const removed=await a.rpc('lms_delete_record',{p_table:'lms_subjects',p_id:fixture.subject,p_version:r.data.version});expect(!removed.error,'LMS_DELETE_FAILED');
          const absent=await a.from('lms_subjects').select('id').eq('id',fixture.subject);expect(!absent.error&&absent.data.length===0,'LMS_DELETE_NOT_VISIBLE');
          const anon=await anonymous.from('lms_subjects').select('id',{head:true});expect(Boolean(anon.error),'ANONYMOUS_LMS_READ_ALLOWED');
          const privateRpc=await anonymous.rpc('lms_claim_push',{p_limit:1});expect(Boolean(privateRpc.error),'ANONYMOUS_DISPATCH_RPC_ALLOWED');
        });
        await check('landing-admin-crud-rls',async()=>{
          let r=await a.from('faqs').insert({id:fixture.faq,slug:'migration-'+fixture.id,question:'Migration fixture',answer:'Fixture'}).select('id').single();
          if(r.error){save('verification/landing-create-error.json',r.error);throw new Error('LANDING_ADMIN_INSERT_FAILED')}
          const blocked=await b.from('faqs').update({question:'Unauthorized'}).eq('id',fixture.faq).select('id');expect(!blocked.error&&blocked.data.length===0,'NONADMIN_LANDING_WRITE_ALLOWED');
          r=await a.from('faqs').update({question:'Migration updated'}).eq('id',fixture.faq).select('id').single();expect(!r.error,'LANDING_UPDATE_FAILED');
          const read=await anonymous.from('faqs').select('id').eq('id',fixture.faq);expect(!read.error&&read.data.length===1,'PUBLIC_CATALOG_READ_FAILED');
          r=await a.from('faqs').delete().eq('id',fixture.faq).select('id').single();expect(!r.error,'LANDING_DELETE_FAILED');
        });
        await check('realtime-lms-notification',async()=>{
          let resolveEvent,resolveReady;const event=new Promise(resolve=>{resolveEvent=resolve}),ready=new Promise(resolve=>{resolveReady=resolve});
          channel=a.channel('migration-'+fixture.id).on('system',{},payload=>{save('verification/realtime-system.json',payload);emit('realtime-system',{status:payload.status,extension:payload.extension});if(payload.status==='ok'&&payload.extension==='postgres_changes')resolveReady(true)}).on('postgres_changes',{event:'INSERT',schema:'public',table:'lms_notifications',filter:'user_id=eq.'+fixture.users[0].id},payload=>{save('verification/realtime-event.json',payload);if(payload.new.id===fixture.notification)resolveEvent(true)});
          const subscribed=new Promise((resolve,reject)=>channel.subscribe((status,error)=>{if(status==='SUBSCRIBED')resolve(true);else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT')reject(new Error('REALTIME_SUBSCRIBE_FAILED'))}));
          await Promise.race([subscribed,new Promise((_,reject)=>setTimeout(()=>reject(new Error('REALTIME_SUBSCRIBE_TIMEOUT')),25000))]);
          expect(await Promise.race([ready,new Promise(resolve=>setTimeout(()=>resolve(false),25000))]),'REALTIME_CDC_NOT_READY');
          const owner=fixture.users[0].id;
          await targetPsql('verification/realtime-fixture',`BEGIN;
            INSERT INTO public.lms_parents(id,owner_id,full_name,whatsapp_number) VALUES ('${fixture.parent}','${owner}','Migration parent','6281234500000');
            INSERT INTO public.lms_children(id,owner_id,parent_id,relationship,full_name,nickname,birth_date,gender,grade_level,start_date) VALUES ('${fixture.child}','${owner}','${fixture.parent}','Ibu','Migration child','Migration','2018-01-01','L','1','2026-01-01');
            INSERT INTO public.lms_comments(id,owner_id,child_id,sender_user_id,message) VALUES ('${fixture.comment}','${owner}','${fixture.child}','${owner}','Migration fixture');
            INSERT INTO public.lms_notifications(id,user_id,comment_id,child_id) VALUES ('${fixture.notification}','${owner}','${fixture.comment}','${fixture.child}'); COMMIT;`);
          expect(await Promise.race([event,new Promise(resolve=>setTimeout(()=>resolve(false),20000))]),'REALTIME_EVENT_NOT_RECEIVED');
        });
      }
      await check('mikrotik-database-crud',async()=>{
        const userId=crypto.randomUUID(),paymentId=crypto.randomUUID();
        const constraint=read('inventory/sql-constraints.json').find(c=>c.schema==='public'&&c.table_name==='mikrotik_users'&&c.definition?.includes('role'));
        const role=constraint?.definition.match(/'([^']+)'/)?.[1]??'user';
        await targetPsql('verification/mikrotik-fixture',`BEGIN; SET LOCAL ROLE service_role;
          INSERT INTO public.mikrotik_users(id,username,role,tagihan,tanggal_tagihan) VALUES ('${userId}','migration-${fixture.id}','${role.replaceAll("'","''")}',10000,'2026-10-22');
          INSERT INTO public.mikrotik_bayar_tagihan(id,mikrotik_user_id,bayar,tanggal_bayar,keterangan) VALUES ('${paymentId}','${userId}',1000,'2026-10-22','Migration fixture');
          UPDATE public.mikrotik_bayar_tagihan SET bayar=2000 WHERE id='${paymentId}';
          DO $test$ BEGIN IF NOT EXISTS (SELECT 1 FROM public.mikrotik_bayar_tagihan WHERE id='${paymentId}' AND bayar=2000) THEN RAISE EXCEPTION 'MIKROTIK_CRUD_FAILED'; END IF; END $test$;
          DELETE FROM public.mikrotik_bayar_tagihan WHERE id='${paymentId}'; DELETE FROM public.mikrotik_users WHERE id='${userId}'; ROLLBACK;`);
      });
      for(const [name,suffix,init,expected] of [
        ['cors-known','/functions/v1/lesreport',{method:'OPTIONS',headers:{Origin:'https://lms.daztore.web.id','Access-Control-Request-Method':'POST'}},204],
        ['cors-unknown','/functions/v1/lesreport',{method:'OPTIONS',headers:{Origin:'https://migration-denied.invalid','Access-Control-Request-Method':'POST'}},403],
        ['push-dispatch-unauthorized','/functions/v1/push-dispatch',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'},401],
        ['test-edge-runtime','/functions/v1/test-edge',{method:'POST',headers:{apikey:pub,Authorization:'Bearer '+anonJwt,'Content-Type':'application/json'},body:JSON.stringify({name:'migration'})},200],
      ])await check(name,async()=>{const r=await fetch(url+suffix,{...init,signal:AbortSignal.timeout(30000)});save('verification/http-'+name+'.json',{status:r.status,allowOrigin:r.headers.get('access-control-allow-origin'),body:await r.text()});expect(r.status===expected,'HTTP_STATUS_MISMATCH')});
      await check('storage-private-denial',async()=>{
        const o=read('storage/manifest.json').find(o=>o.bucket==='lms_media');
        const r=await anonymous.storage.from(o.bucket).download(o.path);expect(Boolean(r.error),'ANONYMOUS_PRIVATE_OBJECT_READ_ALLOWED');
      });
    } finally {
      if(channel&&clients[0])await clients[0].removeChannel(channel);
      for(const client of clients)await client.auth.signOut({scope:'local'});
      save('verification/functional-checks.json',{at:new Date().toISOString(),results,fixtureCleanup:false,realPushNotDispatched:true});
      await cleanupFixtures(fixture);
    }
    save('verification/functional-checks.json',{at:new Date().toISOString(),results,fixtureCleanup:true,realPushNotDispatched:true});
    emit('functional-checks-complete',{checks:results.length,passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).map(r=>r.name),fixtureCleanup:true});
    if(results.some(r=>!r.passed))throw new Error('FUNCTIONAL_CHECKS_HAVE_FAILURES');return;
  }
  if(action==='cleanup-fixtures') {await cleanupFixtures(read('verification/fixtures.json'));return}
  if(action==='restore-auth-verification-state') {
    // Reconcile only the new target's Auth state changed by ownership-preserving
    // magic-link sign-in. Original users/identities must still have their IDs.
    const {sections,rowsByIndex,result}=await compareData();
    const changed=result.filter(r=>!r.equal&&r.schema==='auth');
    const allowed=['users','identities','sessions','refresh_tokens','mfa_amr_claims','one_time_tokens','flow_state','audit_log_entries'];
    if(changed.some(r=>!allowed.includes(r.name)))throw new Error('UNEXPECTED_AUTH_VERIFICATION_DIFFERENCE');
    const quote=s=>'"'+s.replaceAll('"','""')+'"';const statements=[];
    for(const diff of changed) {
      const i=sections.findIndex(s=>s.schema==='auth'&&s.name===diff.name),s=sections[i];
      const keyConstraint=read('inventory/sql-constraints.json').find(k=>k.schema==='auth'&&k.table_name===s.name&&k.contype==='p');
      const pk=keyConstraint?.definition.match(/^PRIMARY KEY \((.+)\)$/)?.[1].split(', ').map(k=>k.replaceAll('"',''));
      if(!pk?.length||pk.some(k=>!s.columns.includes(k)))throw new Error('AUTH_PRIMARY_KEY_REQUIRES_REVIEW');
      const sourceKeys=new Set(s.rows.map(r=>pk.map(k=>r.split('\t')[s.columns.indexOf(k)]).join('\t')));
      const actualKeys=new Set(rowsByIndex.get(i).map(r=>pk.map(k=>r.split('\t')[s.columns.indexOf(k)]).join('\t')));
      if(['users','identities'].includes(s.name)&&([...sourceKeys].some(k=>!actualKeys.has(k))||[...actualKeys].some(k=>!sourceKeys.has(k))))throw new Error('ORIGINAL_AUTH_IDENTITY_CHANGED');
      if(s.name==='users') {
        const keyOf=r=>pk.map(k=>r.split('\t')[s.columns.indexOf(k)]).join('\t');
        const originals=new Map(s.rows.map(r=>[keyOf(r),r.split('\t')])),changedColumns=new Set();
        for(const row of rowsByIndex.get(i)){const old=originals.get(keyOf(row)),current=row.split('\t');s.columns.forEach((c,n)=>{if(old[n]!==current[n])changedColumns.add(c)})}
        if([...changedColumns].some(c=>!['last_sign_in_at','recovery_token','recovery_sent_at','confirmation_token','confirmation_sent_at','updated_at'].includes(c)))throw new Error('UNEXPECTED_ORIGINAL_AUTH_USER_CHANGE');
        emit('auth-runtime-fields-reconciled',{columns:[...changedColumns],passwordHashesUnchanged:true});
      }
      const temp='migration_auth_'+i,join=pk.map(k=>`t.${quote(k)} IS NOT DISTINCT FROM s.${quote(k)}`).join(' AND ');
      statements.push(`CREATE TEMP TABLE ${temp} ON COMMIT DROP AS SELECT * FROM auth.${quote(s.name)} WITH NO DATA;\nCOPY ${temp} (${s.columnSql}) FROM stdin;\n${s.rows.length?s.rows.join('\n')+'\n':''}\\.\n`);
      const mutable=s.columns.filter(c=>!pk.includes(c));
      if(mutable.length)statements.push(`UPDATE auth.${quote(s.name)} t SET (${mutable.map(quote).join(',')})=(${mutable.map(c=>'s.'+quote(c)).join(',')}) FROM ${temp} s WHERE ${join};`);
      if(!['users','identities'].includes(s.name))statements.push(`DELETE FROM auth.${quote(s.name)} t WHERE NOT EXISTS (SELECT 1 FROM ${temp} s WHERE ${join});\nINSERT INTO auth.${quote(s.name)} (${s.columnSql}) SELECT ${s.columns.map(c=>'s.'+quote(c)).join(',')} FROM ${temp} s WHERE NOT EXISTS (SELECT 1 FROM auth.${quote(s.name)} t WHERE ${join});`);
    }
    await targetPsql('verification/auth-state-reconciliation',`BEGIN; SET LOCAL session_replication_role=replica;\n${statements.join('\n')}\nCOMMIT;`);
    const after=await compareData();
    if(after.result.some(t=>!t.equal))throw new Error('DATA_COMPARISON_HAS_DIFFERENCES');
    emit('auth-verification-state-restored',{tablesReconciled:changed.map(t=>t.name),allDataTablesEqual:after.result.length});return;
  }
  if(action==='integrations') {
    await request('inventory/rest.json',`/v1/projects/${ref}/postgrest`);
    const vault=await nativeQuery('inventory/vault-plaintext.json','SELECT id,name,description,decrypted_secret,created_at,updated_at FROM vault.decrypted_secrets ORDER BY id');
    const metadata=read('inventory/edge-secrets.json'),matches={},secretValues={};
    const candidates=[];
    for(const directory of [root,path.join(path.dirname(root),'landing_page'),path.join(path.dirname(root),'landing')]) {
      for(const file of fs.readdirSync(directory,{withFileTypes:true}).filter(f=>f.isFile()&&/^\.env(?:\.|$)/.test(f.name))) {
        const filePath=path.join(directory,file.name);
        try{for(const [k,v] of Object.entries(parseEnv(fs.readFileSync(filePath,'utf8'))))if(v)candidates.push({key:k,value:v,source:filePath})}catch{}
      }
    }
    for(const v of vault||[])candidates.push({key:v.name,value:v.decrypted_secret,source:'source Vault'});
    for(const m of metadata) {
      const candidate=candidates.find(c=>hash(c.value)===m.value);
      matches[m.name]=candidate?{available:true,source:candidate.source,key:candidate.key}:{available:false};
      if(candidate)secretValues[m.name]=candidate.value;
    }
    save('inventory/edge-secret-values-recovered.json',secretValues);save('inventory/edge-secret-recovery-status.json',matches);
    emit('edge-secret-recovery',{matches});
    if(env.CLOUDFLARE_API_TOKEN&&env.CLOUDFLARE_ACCOUNT_ID) {
      const account=env.CLOUDFLARE_ACCOUNT_ID.match(/[a-f0-9]{32}/)?.[0];
      if(!account)throw new Error('INVALID_CLOUDFLARE_ACCOUNT_ID');
      const cfHeaders={Authorization:`Bearer ${env.CLOUDFLARE_API_TOKEN}`};
      for(const [name,endpoint] of [['token','/user/tokens/verify'],['pages',`/accounts/${account}/pages/projects?per_page=100`],['workers',`/accounts/${account}/workers/scripts`],['zones',`/zones?account.id=${account}&per_page=50`]]) {
        try{
          const r=await fetch('https://api.cloudflare.com/client/v4'+endpoint,{headers:cfHeaders,signal:AbortSignal.timeout(30000)});
          const j=await r.json();save(`inventory/cloudflare-${name}.json`,j);
          emit('cloudflare-inventory',{name,status:r.status,success:j.success,count:Array.isArray(j.result)?j.result.length:undefined});
          if(name==='pages'&&Array.isArray(j.result)) {
            const summary=j.result.map(p=>({name:p.name,domains:p.domains,subdomain:p.subdomain,
              build:p.build_config,environments:Object.fromEntries(Object.entries(p.deployment_configs??{}).map(([stage,c])=>[stage,{keys:Object.keys(c.env_vars??{}),sourceProjectKeys:Object.entries(c.env_vars??{}).filter(([,v])=>String(v.value??'').includes(ref)).map(([k])=>k)}]))}));
            save('inventory/cloudflare-pages-summary.json',summary);emit('cloudflare-pages',{projects:summary});
          }
        }catch(e){emit('cloudflare-unavailable',{name,type:e.name})}
      }
    }
    await nativeQuery('inventory/sequence-state.json',"SELECT schemaname,sequencename,start_value,min_value,max_value,increment_by,cycle,cache_size,last_value FROM pg_catalog.pg_sequences ORDER BY 1,2");
    return;
  }
  if(action==='backup-storage') {
    const buckets=read('inventory/storage-buckets.json');
    const objects=read('inventory/sql-storage_objects.json');
    if(!Array.isArray(buckets)||!Array.isArray(objects))throw new Error('STORAGE_INVENTORY_UNAVAILABLE');
    const manifest=[];
    for(const o of objects) {
      const itemId=hash(Buffer.from(o.bucket_id+'\0'+o.name)),artifact=`storage/objects/${itemId}`;
      let bytes;
      if(ledger[artifact]) {
        bytes=open(fs.readFileSync(path.join(base,artifact+'.enc')));
        if(hash(bytes)!==ledger[artifact].sha256)throw new Error('CHECKSUM_MISMATCH');
      } else {
        const endpoint='/storage/v1/object/authenticated/'+encodeURIComponent(o.bucket_id)+'/'+o.name.split('/').map(encodeURIComponent).join('/');
        const r=await fetch(env.OLD_SUPABASE_URL+endpoint,{headers:{apikey:env.OLD_SUPABASE_SECRET_KEY},signal:AbortSignal.timeout(120000)});
        if(!r.ok){emit('storage-download-failed',{itemId,status:r.status});throw new Error('STORAGE_BACKUP_INCOMPLETE')}
        bytes=Buffer.from(await r.arrayBuffer());save(artifact,bytes);
      }
      const expected=Number(o.metadata?.size);
      if(Number.isFinite(expected)&&expected!==bytes.length)throw new Error('STORAGE_SIZE_MISMATCH');
      manifest.push({id:o.id,bucket:o.bucket_id,path:o.name,owner:o.owner,owner_id:o.owner_id,
        mime:o.metadata?.mimetype,size:bytes.length,sha256:hash(bytes),version:o.version,updated_at:o.updated_at,artifact});
      emit('storage-file-backed-up',{itemId,bytes:bytes.length});
    }
    save('storage/manifest.json',manifest);
    const summary=buckets.map(b=>({bucket:b.id,public:b.public,files:manifest.filter(o=>o.bucket===b.id).length,bytes:manifest.filter(o=>o.bucket===b.id).reduce((a,o)=>a+o.size,0)}));
    save('storage/summary.json',summary);emit('storage-backup-complete',{buckets:summary,files:manifest.length,bytes:manifest.reduce((a,o)=>a+o.size,0)});return;
  }
  if(action==='backup-function-source') {
    const workdir=path.join(base,'function-source-work');fs.mkdirSync(workdir,{recursive:true});
    const child=spawn(process.execPath,[path.join(root,'node_modules/supabase/dist/supabase.js'),'functions','download','--project-ref',ref,'--use-api','--workdir',workdir],{
      env:{...process.env,SUPABASE_ACCESS_TOKEN:env.SUPABASE_ACCESS_TOKEN},windowsHide:true,stdio:['ignore','pipe','pipe']});
    const out=[];child.stdout.on('data',b=>out.push(b));child.stderr.on('data',b=>out.push(b));
    const status=await new Promise((resolve,reject)=>{child.on('close',resolve);child.on('error',reject)});
    save('functions/download-source.log',Buffer.concat(out));
    if(status!==0){emit('function-source-download-failed',{status});throw new Error('FUNCTION_SOURCE_DOWNLOAD_FAILED')}
    const list=[];
    function walk(dir) {for(const ent of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,ent.name);if(ent.isDirectory())walk(file);else if(ent.isFile())list.push(file)}}
    walk(workdir);
    const manifest=[];
    for(const file of list) {
      const relative=path.relative(workdir,file).split(path.sep).join('/'),bytes=fs.readFileSync(file);
      save('functions/source/'+relative,bytes);
      const content=bytes.toString('utf8');
      manifest.push({path:relative,bytes:bytes.length,sha256:hash(bytes),envNames:[...content.matchAll(/Deno\.env\.get\(["']([^"']+)["']\)/g)].map(m=>m[1]),
        fetchCalls:(content.match(/\bfetch\s*\(/g)||[]).length,intervals:(content.match(/\bsetInterval\s*\(/g)||[]).length});
    }
    save('functions/source-manifest.json',manifest);emit('function-source-backed-up',{files:manifest});
    // The private working directory is kept for a later CLI deployment. It is
    // ACL-restricted and never a backup substitute; encrypted copies are verified.
    return;
  }
  if(action==='create-target') {
    // Creation is allowed only on the already-free organization, with an active
    // free slot; this command never upgrades a plan or adds paid compute/addons.
    if(!ledger['database/full.dump']||!ledger['storage/manifest.json'])throw new Error('VALIDATED_BACKUPS_REQUIRED_FIRST');
    const original=read('inventory/summary.json'),org=original.organization;
    const organization=await request('target/preflight-organization.json',`/v1/organizations/${org}`);
    const projects=await request('target/preflight-projects.json','/v1/projects');
    if(organization?.plan!=='free')throw new Error('PAID_PROJECT_REQUIRES_APPROVAL');
    const candidates=projects?.filter(p=>p.organization_id===org&&p.name==='db-daz')??[];
    if(candidates.length>1)throw new Error('DUPLICATE_TARGET_NAMES_REQUIRE_REVIEW');
    let state=ledger['target/credentials.json']?read('target/credentials.json'):null;
    if(candidates.length) {
      const target=candidates[0];
      if(target.id===ref||target.region!=='ap-southeast-1')throw new Error('TARGET_IDENTITY_MISMATCH');
      if(!state?.password)throw new Error('EXISTING_TARGET_PASSWORD_REQUIRED');
      if(state.ref&&state.ref!==target.id)throw new Error('TARGET_CHECKPOINT_MISMATCH');
      state.ref=target.id;save('target/credentials.json',state);
      emit('target-exists',{ref:target.id,name:target.name,region:target.region,status:target.status});return;
    }
    if(projects.filter(p=>p.status!=='INACTIVE').length>=2)throw new Error('FREE_SLOT_NOT_VERIFIED');
    state??={name:'db-daz',region:'ap-southeast-1',organization:org,password:crypto.randomBytes(48).toString('base64url'),createdAt:new Date().toISOString()};
    save('target/credentials.json',state);
    const r=await fetch('https://api.supabase.com/v1/projects',{method:'POST',headers:{Authorization:`Bearer ${env.SUPABASE_ACCESS_TOKEN}`,'Content-Type':'application/json'},
      body:JSON.stringify({name:'db-daz',organization_slug:org,region:'ap-southeast-1',db_pass:state.password}),signal:AbortSignal.timeout(120000)});
    const data=await r.json();save('target/create-response.json',data);
    if(!r.ok){emit('target-create-failed',{status:r.status});throw new Error('TARGET_CREATION_FAILED')}
    if(data.id===ref||data.name!=='db-daz'||data.region!=='ap-southeast-1')throw new Error('CREATED_TARGET_IDENTITY_MISMATCH');
    state.ref=data.id;save('target/credentials.json',state);
    emit('target-created',{ref:data.id,name:data.name,region:data.region,status:data.status,plan:organization.plan,passwordStoredEncrypted:true});return;
  }
  if(action==='prepare-restore') {
    const project=await targetApi('target/identity.json','');
    if(project.region!=='ap-southeast-1'||project.name!=='db-daz'||project.organization_id!==read('inventory/summary.json').organization)throw new Error('TARGET_IDENTITY_MISMATCH');
    if(project.status!=='ACTIVE_HEALTHY')throw new Error('TARGET_NOT_READY');
    await targetApi('target/pooler.json','/config/database/pooler');
    const baselineQuery="SELECT json_build_object('public_relations',(SELECT count(*) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','private','supabase_migrations') AND c.relkind IN ('r','p','v','m','S')),'auth_users',(SELECT count(*) FROM auth.users),'storage_objects',(SELECT count(*) FROM storage.objects),'storage_buckets',(SELECT count(*) FROM storage.buckets),'vault_secrets',(SELECT count(*) FROM vault.secrets))";
    const baseline=JSON.parse(await targetPsql('target/baseline',baselineQuery,{readonly:true}));save('target/baseline.json',baseline);
    if(Object.values(baseline).some(v=>v!==0))throw new Error('TARGET_NOT_EMPTY_RESTORE_FORBIDDEN');
    const tables=await targetApi('target/managed-table-shapes.json','/database/query','POST',{read_only:true,query:"SELECT table_schema,table_name,column_name,udt_name,is_nullable,column_default FROM information_schema.columns WHERE table_schema IN ('auth','storage','vault','cron') ORDER BY table_schema,table_name,ordinal_position"});
    const source=read('inventory/sql-columns.json');
    const missing=source.filter(c=>['auth','vault'].includes(c.schema)&&!tables.some(t=>t.table_schema===c.schema&&t.table_name===c.table_name&&t.column_name===c.attname));
    const targetExtra=tables.filter(c=>['auth','vault'].includes(c.table_schema)&&!source.some(s=>s.schema===c.table_schema&&s.table_name===c.table_name&&s.attname===c.column_name));
    const plan={target:project.id,baseline,missingSourceManagedColumns:missing.map(c=>`${c.schema}.${c.table_name}.${c.attname}`),
      targetExtraManagedColumns:targetExtra.map(c=>({column:`${c.table_schema}.${c.table_name}.${c.column_name}`,nullable:c.is_nullable,defaultPresent:c.column_default!==null})),
      userSchemas:['public','private','supabase_migrations'],excludedData:['auth.schema_migrations','storage.* (Storage API)','realtime.* (platform-owned, no source messages/subscriptions)','cron.job (recreated inactive)','net.http_request_queue (quarantined)'],
      managedCustomTriggers:read('inventory/sql-triggers.json').filter(t=>['auth','storage'].includes(t.schema)).map(t=>({schema:t.schema,table:t.table_name,name:t.tgname})),
      managedPolicies:read('inventory/sql-policies.json').filter(p=>['auth','storage'].includes(p.schemaname)).map(p=>({schema:p.schemaname,table:p.tablename,name:p.policyname})),
      customRoles:read('inventory/sql-roles.json').filter(r=>!/^pg_|^supabase_|^(anon|authenticated|authenticator|cli_login_.*|dashboard_user|pgbouncer|postgres|service_role|pgsodium_keyholder|pgsodium_keyiduser|pgsodium_keymaker|pgtle_admin)$/.test(r.rolname)).map(r=>r.rolname)};
    save('restore/plan.json',plan);emit('restore-plan',plan);return;
  }
  if(action==='build-restore') {
    const plan=read('restore/plan.json');
    if(plan.missingSourceManagedColumns.length||plan.targetExtraManagedColumns.some(c=>c.nullable!=='YES'&&!c.defaultPresent)||plan.customRoles.length)throw new Error('RESTORE_PLAN_REQUIRES_REVIEW');
    const toc=open(fs.readFileSync(path.join(base,'database/archive-toc.txt.enc'))).toString();
    // pg_restore --schema filters omit namespace-independent SCHEMA/ACL TOC
    // entries. Select those explicitly alongside every user-schema object.
    const schemaList=toc.split('\n').filter(l=>/^\d+;/.test(l)&&/ (public|private|supabase_migrations)(?: |$)/.test(l));
    const schemaListPath=path.join(base,'restore-schema.list');fs.writeFileSync(schemaListPath,schemaList.join('\n')+'\n');
    let schema=await extractArchive(['--schema-only','--use-list='+schemaListPath]);
    schema=schema.replace(/^CREATE SCHEMA /gm,'CREATE SCHEMA IF NOT EXISTS ')
      .replace(/^ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin"[^\n]*$/gm,'-- Platform-owned default privilege managed on target.');
    if(/^CREATE (?:EVENT TRIGGER|PUBLICATION)/m.test(schema))throw new Error('PLATFORM_OBJECT_IN_USER_SCHEMA_REQUIRES_REVIEW');
    const selected=[],excluded=[];
    for(const line of toc.split('\n')) {
      const m=line.match(/^\d+; \d+ \d+ (TABLE DATA|SEQUENCE SET) ([^ ]+) ([^ ]+)/);if(!m)continue;
      const [,kind,namespace,name]=m;
      const include=['public','private','auth','supabase_migrations','vault','cron','net'].includes(namespace)
        &&namespace!=='cron'&&!['auth.schema_migrations','net.http_request_queue','vault.secrets'].includes(namespace+'.'+name);
      (include?selected:excluded).push({kind,schema:namespace,name,line});
    }
    if(!selected.some(t=>t.schema==='auth'&&t.name==='users'))throw new Error('REQUIRED_ARCHIVE_DATA_MISSING');
    const listPath=path.join(base,'restore-data.list');fs.writeFileSync(listPath,selected.map(t=>t.line).join('\n')+'\n');
    const data=await extractArchive(['--data-only','--use-list='+listPath]);
    const quote=s=>'"'+s.replaceAll('"','""')+'"',literal=v=>v===null?'NULL':typeof v==='boolean'?(v?'true':'false'):"'"+String(v).replaceAll("'","''")+"'";
    const policies=read('inventory/sql-policies.json').filter(p=>['auth','storage'].includes(p.schemaname));
    function roleNames(value) {
      if(Array.isArray(value))return value;
      if(typeof value==='string'&&/^\{[a-zA-Z0-9_,]+\}$/.test(value))return value.slice(1,-1).split(',');
      throw new Error('POLICY_ROLE_FORMAT_REQUIRES_REVIEW');
    }
    const policySql=policies.map(p=>`CREATE POLICY ${quote(p.policyname)} ON ${quote(p.schemaname)}.${quote(p.tablename)} AS ${p.permissive} FOR ${p.cmd} TO ${roleNames(p.roles).map(quote).join(', ')}${p.qual?' USING ('+p.qual+')':''}${p.with_check?' WITH CHECK ('+p.with_check+')':''};`).join('\n');
    const cron=read('inventory/sql-cron.json');
    if(!Array.isArray(cron))throw new Error('CRON_INVENTORY_UNAVAILABLE');
    const cronSql=cron.map(j=>`DO $cron_restore$ DECLARE restored_id bigint; BEGIN restored_id:=cron.schedule(${literal(j.jobname)},${literal(j.schedule)},${literal(j.command)}); IF restored_id<>${Number(j.jobid)} THEN RAISE EXCEPTION 'CRON_ID_MISMATCH'; END IF; PERFORM cron.alter_job(restored_id,active:=false); END $cron_restore$;`).join('\n');
    const vault=read('inventory/vault-plaintext.json');
    const vaultReferences=read('inventory/sql-functions.json').filter(f=>vault.some(v=>f.definition?.includes(v.id)));
    if(vaultReferences.length||cron.some(j=>vault.some(v=>j.command.includes(v.id))))throw new Error('VAULT_UUID_REFERENCE_REQUIRES_REVIEW');
    // Supabase permits Vault writes only through its security-definer functions.
    // Secret values/names are retained; Vault row UUIDs/timestamps are regenerated.
    const vaultSql=vault.map(v=>`SELECT vault.create_secret(${literal(v.name==='lms_push_function_url'?`https://${targetState().ref}.supabase.co/functions/v1/push-dispatch`:v.decrypted_secret)},${literal(v.name)},${literal(v.description)});`).join('\n');
    const transaction=`BEGIN;\nSET LOCAL lock_timeout='10s';\nCREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;\nCREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;\n${schema}\nSET LOCAL session_replication_role = replica;\n${data}\n${cronSql}\nSET LOCAL session_replication_role = origin;\n${vaultSql}\nSET LOCAL search_path=public,extensions,pg_catalog;\n${policySql}\nDO $migration_guard$ BEGIN IF EXISTS (SELECT 1 FROM cron.job WHERE active) OR EXISTS (SELECT 1 FROM net.http_request_queue) THEN RAISE EXCEPTION 'STAGING_OUTBOUND_NOT_QUARANTINED'; END IF; END $migration_guard$;\nCOMMIT;\n`;
    save('restore/database-transaction.sql',transaction);
    const result={sqlBytes:Buffer.byteLength(transaction),selectedData:selected.map(({line,...v})=>v),excludedData:excluded.map(({line,...v})=>v),
      policies:policies.length,cronJobs:cron.length,cronAllInactive:true,storageViaApi:true,vaultWriteMethod:'vault.create_secret',vaultUuidRegenerated:true,vaultUuidReferencesInFunctionsOrCron:0};
    save('restore/selection.json',result);emit('restore-built',{sqlBytes:result.sqlBytes,selectedDataEntries:selected.length,excludedDataEntries:excluded.length,policies:result.policies,cronJobs:result.cronJobs,cronAllInactive:true,vaultUuidRegenerated:true,cronHistoryArchivedOnly:true});return;
  }
  if(action==='restore-database') {
    if(ledger['restore/database-completed.json']){emit('restore-already-completed',read('restore/database-completed.json'));return}
    const baseline=JSON.parse(await targetPsql('target/freshness-recheck',"SELECT json_build_object('tables',(SELECT count(*) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','private','supabase_migrations') AND c.relkind IN ('r','p')),'users',(SELECT count(*) FROM auth.users),'vault',(SELECT count(*) FROM vault.secrets),'objects',(SELECT count(*) FROM storage.objects))",{readonly:true}));
    if(Object.values(baseline).some(v=>v!==0))throw new Error('TARGET_NOT_EMPTY_RESTORE_FORBIDDEN');
    const oldRoot=read('inventory/vault-root-key.json');
    let newRoot=await targetApi('target/root-key-verification.json','/pgsodium');
    if(newRoot.root_key!==oldRoot.root_key) {
      await targetApi('target/root-key-copy-response.json','/pgsodium','PUT',oldRoot);
      newRoot=await targetApi('target/root-key-verification.json','/pgsodium');
      // Updating the root key restarts database services. Never start a restore
      // in the short interval before that restart has taken effect.
      await new Promise(resolve=>setTimeout(resolve,15000));
    }
    if(newRoot.root_key!==oldRoot.root_key)throw new Error('VAULT_ROOT_KEY_MISMATCH');
    const transaction=open(fs.readFileSync(path.join(base,'restore/database-transaction.sql.enc'))).toString();
    await targetPsql('restore/database-transaction',transaction);
    const proof=JSON.parse(await targetPsql('restore/staging-guard',"SELECT json_build_object('cron_jobs',(SELECT count(*) FROM cron.job),'active_cron',(SELECT count(*) FROM cron.job WHERE active),'queued_network_requests',(SELECT count(*) FROM net.http_request_queue),'vault_decryptable',(SELECT count(*) FROM vault.decrypted_secrets),'auth_users',(SELECT count(*) FROM auth.users),'migrations',(SELECT count(*) FROM supabase_migrations.schema_migrations))",{readonly:true}));
    if(proof.active_cron!==0||proof.queued_network_requests!==0)throw new Error('STAGING_OUTBOUND_NOT_QUARANTINED');
    const completed={...proof,completedAt:new Date().toISOString(),target:targetState().ref};save('restore/database-completed.json',completed);emit('database-restored',completed);return;
  }
  if(action==='backup-database') {
    const pools=read('inventory/pooler.json');
    const pool=pools.find(p=>p.pool_mode==='session')??pools[0];
    if(!pool) throw new Error('NO_VERIFIED_POOLER');
    // Management API reports transaction port 6543. Backups use the documented
    // session pooler port 5432 to preserve SETs and the dump snapshot session.
    const pgEnv={...process.env,PGHOST:pool.db_host,PGPORT:'5432',PGUSER:pool.db_user,
      PGDATABASE:pool.db_name,PGPASSWORD:env.OLD_DB_PASSWORD,PGSSLMODE:'require',PGCONNECT_TIMEOUT:'20'};
    async function pg(binary,args,input) {
      const child=spawn(path.join('C:\\Program Files\\PostgreSQL\\17\\bin',binary+'.exe'),args,{env:pgEnv,windowsHide:true,stdio:['pipe','pipe','pipe']});
      const out=[],err=[];let size=0;
      child.stdout.on('data',b=>{size+=b.length;if(size>1024*1024*1024)child.kill();else out.push(b)});
      child.stderr.on('data',b=>err.push(b));
      child.stdin.on('error',()=>{});child.stdin.end(input);
      const code=await new Promise((resolve,reject)=>{child.on('close',resolve);child.on('error',reject)});
      const stderr=Buffer.concat(err);if(stderr.length)save(`database/${binary}-last-stderr.txt`,stderr);
      if(code!==0) {emit('postgres-operation-failed',{binary,code,stderrBytes:stderr.length});throw new Error('POSTGRES_BACKUP_FAILED')}
      return Buffer.concat(out);
    }
    let archive;
    if(ledger['database/full.dump']) {
      archive=open(fs.readFileSync(path.join(base,'database/full.dump.enc')));
      if(hash(archive)!==ledger['database/full.dump'].sha256)throw new Error('CHECKSUM_MISMATCH');
      emit('backup-resumed',{artifact:'database/full.dump',bytes:archive.length});
    } else {
      archive=await pg('pg_dump',['--format=custom','--quote-all-identifiers','--lock-wait-timeout=10s','--no-password']);
      save('database/full.dump',archive);emit('database-archive-backed-up',{bytes:archive.length});
    }
    const toc=await pg('pg_restore',['--list'],archive);save('database/archive-toc.txt',toc);
    save('database/schema-all.sql',await pg('pg_restore',['--schema-only','--file=-'],archive));
    save('database/data-all.sql',await pg('pg_restore',['--data-only','--file=-'],archive));
    save('database/roles.sql',await pg('pg_dumpall',['--roles-only','--no-role-passwords','--quote-all-identifiers','--no-password']));
    emit('database-backup-complete',{archiveBytes:archive.length,tocEntries:toc.toString().split('\n').filter(l=>/^\d+;/.test(l)).length,
      rolesIncludePasswords:false,snapshot:'single pg_dump archive; schema/data extracted from the same snapshot',base});return;
  }
  throw new Error('USE_INVENTORY_OR_VERIFY_BACKUPS_OR_SUMMARY');
}
export {root,env,base,hash,open,read,save,emit,request,nativeQuery,targetState,targetApi,targetPsql,targetHttp,catalogQueries,permissionQuery,archiveCopies};
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{emit('stopped',{reason:/^[A-Z_]+$/.test(e.message)?e.message:'UNEXPECTED_ERROR',type:e.name,code:e.code});process.exitCode=1;});
