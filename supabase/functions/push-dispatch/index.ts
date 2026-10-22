import { createClient } from 'npm:@supabase/supabase-js@2.117.3';
// @deno-types="npm:@types/web-push@3.6.4"
import webpush from 'npm:web-push@3.6.7';
import { dispatchPush, trustedDispatcher, type PushDelivery } from '../_shared/push.ts';

Deno.serve(async request => {
  const headers = { 'Content-Type':'application/json','Cache-Control':'no-store' };
  const response = (status: number, body: unknown) => new Response(JSON.stringify(body),{status,headers});
  if (request.method!=='POST') return response(405,{error:'POST required'});
  if (request.headers.has('origin') || !(await trustedDispatcher(request.headers.get('x-lms-push-secret'),Deno.env.get('LMS_PUSH_DISPATCH_SECRET'))))
    return response(401,{error:'Backend authorization required'});
  // Never claim a delivery while the migration maintenance gate is enabled.
  if (Deno.env.get('LMS_MAINTENANCE')==='1') return response(503,{error:'LMS maintenance'});
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  const subject = Deno.env.get('VAPID_SUBJECT');
  if (!publicKey || !privateKey || !subject) return response(503,{error:'Push is not configured'});
  try {
    // Validate before claiming any delivery: configuration errors leave the outbox intact.
    webpush.setVapidDetails(subject,publicKey,privateKey);
    const admin = createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{
      db:{retry:false,timeout:15000},auth:{persistSession:false,autoRefreshToken:false},
    });
    const {data,error} = await admin.rpc('lms_claim_push',{p_limit:25});
    if (error) throw new Error('Claim failed');
    const counts = await dispatchPush(data as PushDelivery[],async (delivery,payload) => {
      const details = webpush.generateRequestDetails({endpoint:delivery.endpoint,keys:{p256dh:delivery.p256dh,auth:delivery.auth}},payload,{
        TTL:3600,urgency:'normal',topic:delivery.notification_id.replaceAll('-',''),
      });
      const result = await fetch(details.endpoint,{
        method:'POST',headers:details.headers as Record<string,string>,
        body:new Uint8Array(details.body!),redirect:'error',signal:AbortSignal.timeout(8000),
      });
      await result.body?.cancel();
      return result.status;
    },async (delivery,status) => {
      const {error} = await admin.rpc('lms_finish_push',{p_id:delivery.id,p_lease:delivery.lease_id,p_status:status});
      if (error) throw new Error('Completion failed');
    });
    console.info(JSON.stringify({action:'push-dispatch',claimed:data.length,...counts}));
    return response(200,counts);
  } catch {
    // Never log endpoints, encryption keys, headers, payload or library exceptions.
    console.error(JSON.stringify({action:'push-dispatch',status:503}));
    return response(503,{error:'Push dispatch unavailable'});
  }
});
