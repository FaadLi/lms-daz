import { PGlite } from '@electric-sql/pglite';
import { readFileSync,readdirSync } from 'node:fs';
import { afterAll,beforeAll,describe,expect,it } from 'vitest';

const a='11111111-1111-4111-8111-111111111111', b='22222222-2222-4222-8222-222222222222';
const child='44444444-4444-4444-8444-444444444444', parent='33333333-3333-4333-8333-333333333333';
const comment='88888888-8888-4888-8888-888888888888';
const endpoint=(id:string)=>`https://fcm.googleapis.com/fcm/send/${id}`;
const hash='f'.repeat(64);
let db:PGlite, notification:string, device:string;
const json=(value:unknown)=>`'${JSON.stringify(value).replaceAll("'","''")}'::jsonb`;
async function user(id:string){await db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false)`);}
async function service(){await db.exec('reset role;set role service_role');}
async function rpc<T=unknown>(name:string,args=''):Promise<T>{return(await db.query<{value:T}>(`select public.${name}(${args}) value`)).rows[0].value;}
async function subscriptions(id:string){return rpc<string>('lms_save_push_subscription',`'${endpoint(id)}','${'B'.repeat(87)}','${'A'.repeat(22)}'`);}
async function parentComment(id=comment,message='Private parent message'){
  await service();return rpc('lms_parent_request',`'${hash}','comment','comments',0,'${message}','${id}'`);
}
beforeAll(async()=>{
  db=new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    create schema auth;create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated,anon,service_role;grant execute on function auth.uid() to authenticated,anon,service_role;
    create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated;grant select,insert on storage.objects to authenticated;
    insert into auth.users values('${a}'),('${b}');`);
  for(const file of readdirSync('supabase/migrations').filter(name=>name.endsWith('.sql')).sort())
    await db.exec(readFileSync(`supabase/migrations/${file}`,'utf8'));
  await user(a);
  await rpc('lms_save_record',`'lms_profiles',${json({id:a,name:'Teacher'})}`);
  await rpc('lms_save_record',`'lms_parents',${json({id:parent,full_name:'Parent',whatsapp_number:'6281234567890'})}`);
  await rpc('lms_save_record',`'lms_children',${json({id:child,parent_id:parent,relationship:'Wali',full_name:'Child',nickname:'Child',birth_date:'2018-01-01',gender:'P',grade_level:'SD',start_date:'2026-10-14'})}`);
  device=await subscriptions('device-a');await subscriptions('device-b');
  await service();
  await rpc('lms_issue_report_link',`'${a}','${child}',null,'${hash}',now()+interval '1 day'`);
},30000);
afterAll(async()=>{await db?.close();});
describe('parent comment notifications and durable Web Push outbox',()=>{
  it('creates exactly one safe recipient notification, two device deliveries and no teacher-reply notification',async()=>{
    await parentComment();await parentComment();
    await user(a);
    const feed=await rpc<{unread:number;items:{id:string;child_id:string;body:string}[]}>('lms_notification_feed');
    expect(feed.unread).toBe(1);expect(feed.items).toHaveLength(1);notification=feed.items[0].id;
    expect(feed.items[0].child_id).toBe(child);expect(feed.items[0].body).not.toContain('Private parent message');
    expect(await subscriptions('device-a')).toBe(device);
    await rpc('lms_comment_teacher',`'${child}',null,'Reply','99999999-9999-4999-8999-999999999999'`);
    expect((await rpc<{unread:number}>('lms_notification_feed')).unread).toBe(1);
    await expect(parentComment(comment,'Changed payload')).rejects.toMatchObject({code:'PT409'});
    await db.exec('reset role');
    expect((await db.query<{count:number}>('select count(*)::integer count from private.lms_push_deliveries')).rows[0].count).toBe(2);
  });
  it('enforces RLS, RPC grants, subscription uniqueness and trusted endpoint validation',async()=>{
    await user(b);
    expect((await rpc<{items:unknown[]}>('lms_notification_feed')).items).toEqual([]);
    expect((await db.query('select * from public.lms_push_subscriptions')).rows).toEqual([]);
    expect(await rpc('lms_mark_notification_read',`'${notification}'`)).toBe(false);
    await expect(subscriptions('device-a')).rejects.toMatchObject({code:'42501'});
    await expect(rpc('lms_claim_push')).rejects.toMatchObject({code:'42501'});
    await expect(rpc('lms_save_push_subscription',`'https://127.0.0.1/ssrf','${'B'.repeat(87)}','${'A'.repeat(22)}'`)).rejects.toMatchObject({code:'22023'});
    await expect(db.exec(`insert into public.lms_notifications(user_id,comment_id,child_id) values('${b}','${comment}','${child}')`)).rejects.toMatchObject({code:'42501'});
    await db.exec('reset role;set role anon');
    await expect(rpc('lms_save_push_subscription',`'${endpoint('anon')}','${'B'.repeat(87)}','${'A'.repeat(22)}'`)).rejects.toMatchObject({code:'42501'});
  });
  it('claims exclusively, never resends a completed device and bounds temporary failures',async()=>{
    await service();
    type Delivery={id:string;lease_id:string;subscription_id:string};
    const first=await rpc<Delivery[]>('lms_claim_push');expect(first).toHaveLength(2);
    expect(await rpc('lms_claim_push')).toEqual([]);
    await db.exec(`reset role;update private.lms_push_deliveries set leased_until=now()-interval '1 second' where id='${first[0].id}'`);
    await service();const recovered=await rpc<Delivery[]>('lms_claim_push');expect(recovered).toHaveLength(1);
    expect(recovered[0].lease_id).not.toBe(first[0].lease_id);
    await rpc('lms_finish_push',`'${first[0].id}','${first[0].lease_id}',201`); // stale acknowledgement ignored
    await rpc('lms_finish_push',`'${recovered[0].id}','${recovered[0].lease_id}',201`);
    await rpc('lms_finish_push',`'${first[1].id}','${first[0].lease_id}',201`); // wrong lease ignored
    await rpc('lms_finish_push',`'${first[1].id}','${first[1].lease_id}',503`);
    expect(await rpc('lms_claim_push')).toEqual([]);
    for(let attempt=2;attempt<=3;attempt++){
      await db.exec(`reset role;update private.lms_push_deliveries set next_attempt_at=now()-interval '1 second' where state='pending'`);
      await service();const retry=await rpc<Delivery[]>('lms_claim_push');expect(retry).toHaveLength(1);
      await rpc('lms_finish_push',`'${retry[0].id}','${retry[0].lease_id}',429`);
    }
    expect(await rpc('lms_claim_push')).toEqual([]);
    await db.exec('reset role');
    expect((await db.query<{state:string;attempts:number}>('select state,attempts from private.lms_push_deliveries order by attempts')).rows).toEqual([{state:'sent',attempts:2},{state:'failed',attempts:3}]);
  });
  it('removes expired endpoints on 410 but retains the notification, and synchronizes read states',async()=>{
    await parentComment('77777777-7777-4777-8777-777777777777');
    await service();
    const deliveries=await rpc<{id:string;lease_id:string}[]>('lms_claim_push');
    for(const item of deliveries)await rpc('lms_finish_push',`'${item.id}','${item.lease_id}',410`);
    await user(a);
    expect((await db.query('select id from public.lms_push_subscriptions')).rows).toEqual([]);
    expect((await rpc<{unread:number}>('lms_notification_feed')).unread).toBe(2);
    expect(await rpc('lms_mark_notification_read',`'${notification}'`)).toBe(true);
    expect((await db.query<{read_by_teacher_at:string}>(`select read_by_teacher_at from public.lms_comments where id='${comment}'`)).rows[0].read_by_teacher_at).toBeTruthy();
    await rpc('lms_read_comments',`'${child}'`);
    expect((await rpc<{unread:number}>('lms_notification_feed')).unread).toBe(0);
  });
  it('rolls back notifications with failed comments and keeps expiry/revocation authorization',async()=>{
    // A rolled-back comment transaction must never leave a notification behind.
    await db.exec('reset role;begin');
    await db.exec(`insert into public.lms_comments(id,owner_id,child_id,report_link_id,message)
      select '66666666-6666-4666-8666-666666666666','${a}','${child}',id,'Rolled back' from private.lms_report_links where token_hash='${hash}'`);
    await db.exec('rollback');
    await user(a);expect((await rpc<{items:unknown[]}>('lms_notification_feed')).items).toHaveLength(2);
    await db.exec(`reset role;update private.lms_report_links set revoked_at=now() where token_hash='${hash}'`);
    await expect(parentComment('66666666-6666-4666-8666-666666666666')).rejects.toMatchObject({code:'42501'});
    await user(a);expect((await rpc<{items:unknown[]}>('lms_notification_feed')).items).toHaveLength(2);
    await db.exec(`reset role;update private.lms_report_links set revoked_at=null,expires_at=now()-interval '1 second' where token_hash='${hash}'`);
    await expect(parentComment('66666666-6666-4666-8666-666666666666')).rejects.toMatchObject({code:'42501'});
  });
});
