// Real web-push runtime/encryption smoke, without sending a network notification.
// @deno-types="npm:@types/web-push@3.6.4"
import webpush from 'npm:web-push@3.6.7';
import { createECDH,createDecipheriv,hkdfSync,randomBytes } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { pushPayload,type PushDelivery } from './push.ts';

Deno.test('Web Push library runs on Deno and encrypts a decryptable generic payload with VAPID',()=>{
  const recipient=createECDH('prime256v1');recipient.generateKeys();
  const auth=randomBytes(16),publicKey=recipient.getPublicKey();
  const vapid=webpush.generateVAPIDKeys();
  webpush.setVapidDetails('https://example.test',vapid.publicKey,vapid.privateKey);
  const delivery={notification_id:'11111111-1111-4111-8111-111111111111',child_id:'22222222-2222-4222-8222-222222222222',subscription_id:'33333333-3333-4333-8333-333333333333'} as PushDelivery;
  const payload=pushPayload(delivery);
  const request=webpush.generateRequestDetails({endpoint:'https://fcm.googleapis.com/fcm/send/test',keys:{p256dh:publicKey.toString('base64url'),auth:auth.toString('base64url')}},payload,{TTL:3600,topic:delivery.notification_id.replaceAll('-','')});
  const assert=(condition:boolean)=>{if(!condition)throw new Error('Web Push crypto assertion failed');};
  assert(String(request.headers.Authorization).startsWith('vapid t='));
  const body=Buffer.from(request.body!);
  assert(!body.toString().includes('parent_comment'));
  const salt=body.subarray(0,16),serverKey=body.subarray(21,21+body[20]);
  const shared=recipient.computeSecret(serverKey);
  const info=Buffer.concat([Buffer.from('WebPush: info\0'),publicKey,serverKey]);
  const ikm=hkdfSync('sha256',shared,auth,info,32);
  const cek=hkdfSync('sha256',ikm,salt,'Content-Encoding: aes128gcm\0',16);
  const nonce=hkdfSync('sha256',ikm,salt,'Content-Encoding: nonce\0',12);
  const encrypted=body.subarray(21+body[20]);
  const decrypt=createDecipheriv('aes-128-gcm',Buffer.from(cek),Buffer.from(nonce));
  decrypt.setAuthTag(encrypted.subarray(-16));
  const plain=Buffer.concat([decrypt.update(encrypted.subarray(0,-16)),decrypt.final()]);
  assert(plain[plain.length-1]===2 && plain.subarray(0,-1).toString()===payload);
});
