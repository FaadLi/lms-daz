export interface PushDelivery {
  id: string;
  lease_id: string;
  notification_id: string;
  child_id: string;
  subscription_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export function allowedPushEndpoint(endpoint: string) {
  try {
    const url = new URL(endpoint);
    return url.protocol === 'https:' && !url.port && !url.username && !url.password && !url.hash &&
      /^(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|([a-z0-9-]+\.)?push\.apple\.com|([a-z0-9-]+\.)?notify\.windows\.com)$/.test(url.hostname);
  } catch { return false; }
}

export function pushPayload(delivery: PushDelivery) {
  // Deliberately no name, comment, raw report token, user JWT or supplied URL.
  return JSON.stringify({
    type: 'parent_comment',
    notificationId: delivery.notification_id,
    childId: delivery.child_id,
    subscriptionId: delivery.subscription_id,
  });
}

export async function trustedDispatcher(provided: string | null, expected?: string) {
  if (!expected || expected.length < 32 || !provided || provided.length > 256) return false;
  const digest = async (value: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  const [a,b] = await Promise.all([digest(provided),digest(expected)]);
  let difference = 0;
  for (let i=0;i<a.length;i++) difference |= a[i]^b[i];
  return difference===0;
}

export async function dispatchPush(
  deliveries: PushDelivery[],
  send: (delivery: PushDelivery, payload: string) => Promise<number>,
  finish: (delivery: PushDelivery, status: number) => Promise<void>,
) {
  let accepted = 0;
  let failed = 0;
  // Bounded concurrent requests; the DB lease makes overlapping invocations safe.
  for (let offset=0;offset<deliveries.length;offset+=5) {
    await Promise.all(deliveries.slice(offset,offset+5).map(async delivery => {
      let status = 400;
      if (allowedPushEndpoint(delivery.endpoint)) {
        try { status = await send(delivery,pushPayload(delivery)); }
        catch { status = 0; }
      }
      await finish(delivery,status);
      if (status>=200 && status<300) accepted++; else failed++;
    }));
  }
  return { accepted,failed };
}
