import assert from 'node:assert/strict';
import { createECDH,randomBytes,randomUUID } from 'node:crypto';
import { mkdirSync,writeFileSync } from 'node:fs';

export async function checkPushScheduler({client,query,rpc,ownerId,childId}) {
  const [{jobid}]=await query("select jobid from cron.job where jobname='lms-push-dispatch' and active");
  const commentSent=randomUUID(),commentRead=randomUUID(),hash=randomBytes(32).toString('hex');
  const key=createECDH('prime256v1');key.generateKeys();
  const device=await rpc(client,'lms_save_push_subscription',{
    p_endpoint:`https://fcm.googleapis.com/fcm/send/lms-scheduler-validation-${randomUUID()}`,
    p_p256dh:key.getPublicKey().toString('base64url'),p_auth:randomBytes(16).toString('base64url'),
  });
  // One transaction prevents the cron worker from seeing an unread synthetic
  // endpoint. The only committed pending fixture has already been read and is
  // discarded by the existing worker without contacting a push provider.
  const seed=await query(`begin;
    select set_config('request.jwt.claim.sub','${ownerId}',true);
    do $fixture$ declare claims jsonb; n uuid; d uuid; lease uuid; begin
      if exists(select 1 from private.lms_push_deliveries d join public.lms_notifications n on n.id=d.notification_id where n.user_id<>'${ownerId}'::uuid and d.state in ('pending','sending')) then
        raise exception 'Refusing to claim work belonging to other users';
      end if;
      perform public.lms_issue_report_link('${ownerId}','${childId}',null,'${hash}',now()+interval '1 day');
      perform public.lms_parent_request('${hash}','comment','comments',0,'Scheduler validation','${commentSent}');
      perform public.lms_parent_request('${hash}','comment','comments',0,'Scheduler validation','${commentSent}');
      if (select count(*) from public.lms_notifications where comment_id='${commentSent}')<>1 then raise exception 'Duplicate notification'; end if;
      select id into n from public.lms_notifications where comment_id='${commentSent}';
      claims:=public.lms_claim_push(25);
      if jsonb_array_length(claims)<>1 or claims->0->>'notification_id'<>n::text or claims->0->>'subscription_id'<>'${device}' then raise exception 'Unexpected claim; rollback validation'; end if;
      d:=(claims->0->>'id')::uuid;lease:=(claims->0->>'lease_id')::uuid;
      -- Simulated HTTP 201 acknowledgement tests the real completion RPC.
      perform public.lms_finish_push(d,lease,201);
      perform public.lms_parent_request('${hash}','comment','comments',0,'Scheduler validation','${commentSent}');
      if public.lms_claim_push(25)<>'[]'::jsonb then raise exception 'Successful delivery was reclaimed'; end if;
      perform public.lms_parent_request('${hash}','comment','comments',0,'Scheduler validation read','${commentRead}');
      select id into n from public.lms_notifications where comment_id='${commentRead}';
      if not public.lms_mark_notification_read(n) then raise exception 'Unable to mark fixture read'; end if;
    end $fixture$;
    commit;
    select clock_timestamp()::text started;
  `);
  const started=seed[0].started;
  const literal=value=>`'${value.replaceAll("'","''")}'`;
  const evidence={jobId:jobid,commentReplayNotifications:1,acknowledgement:'simulated HTTP 201 via existing RPC',providerPushTested:false};
  console.log('PASS parent comment replay creates one notification; completed delivery cannot be reclaimed');
  let runs=[],responses=[],outbox=[];
  const deadline=Date.now()+180000;
  while(Date.now()<deadline){
    runs=await query(`select runid,status,start_time,end_time from cron.job_run_details where jobid=${jobid} and start_time>=${literal(started)}::timestamptz and end_time is not null order by runid`);
    outbox=await query(`select n.comment_id,d.state,d.attempts,d.last_status from private.lms_push_deliveries d join public.lms_notifications n on n.id=d.notification_id where n.comment_id in ('${commentSent}','${commentRead}')`);
    responses=await query(`select id,status_code,timed_out,error_msg is not null has_error,created,
      case when content like '{%' then (content::jsonb->>'accepted')::integer end accepted,
      case when content like '{%' then (content::jsonb->>'failed')::integer end failed
      from net._http_response where created>=${literal(started)}::timestamptz order by id limit 10`);
    if(runs.some(row=>row.status==='failed'))throw new Error('Cron execution failed');
    const discarded=outbox.find(row=>row.comment_id===commentRead);
    if(runs.length>=2&&discarded?.state==='failed'&&responses.some(row=>row.status_code===200&&!row.timed_out&&!row.has_error))break;
    await new Promise(resolve=>setTimeout(resolve,5000));
  }
  assert.ok(runs.length>=2,'Two actual scheduler ticks observed');
  assert.ok(runs.every(row=>row.status==='succeeded'));
  const sent=outbox.find(row=>row.comment_id===commentSent),discarded=outbox.find(row=>row.comment_id===commentRead);
  assert.equal(sent.state,'sent');assert.equal(sent.attempts,1);assert.equal(sent.last_status,201);
  assert.equal(discarded.state,'failed');assert.equal(discarded.attempts,0);
  assert.ok(responses.some(row=>row.status_code===200&&row.accepted===0&&row.failed===0&&!row.has_error&&!row.timed_out),'pg_net reached the actual Edge worker with Vault authorization');
  const counts=await query(`select comment_id,count(*)::integer count from public.lms_notifications where comment_id in ('${commentSent}','${commentRead}') group by comment_id`);
  assert.ok(counts.length===2&&counts.every(row=>row.count===1));
  evidence.successfulCronTicks=runs.length;
  evidence.schedulerRuns=runs;
  evidence.httpResponses=responses;
  evidence.sentAttemptsAfterSchedulerTicks=sent.attempts;
  evidence.readFixtureDiscardedWithoutProviderRequest=true;
  evidence.deviceCountBeforeCleanup=(await query(`select count(*)::integer count from public.lms_push_subscriptions where user_id='${ownerId}'`))[0].count;
  mkdirSync('supabase/.temp',{recursive:true});
  writeFileSync('supabase/.temp/push-scheduler-check.json',JSON.stringify(evidence,null,2));
  console.log('PASS real cron -> pg_net -> push-dispatch HTTP 200; success stays sent across scheduler ticks; read fixture never contacts provider');
}
