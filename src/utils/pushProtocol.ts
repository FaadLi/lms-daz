const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export interface CommentPush {
  type: 'parent_comment';
  notificationId: string;
  childId: string;
  subscriptionId: string;
}
export function commentPush(value: unknown): CommentPush | undefined {
  if (!value || typeof value!=='object') return;
  const data = value as CommentPush;
  if (data.type==='parent_comment' && [data.notificationId,data.childId,data.subscriptionId].every(id => typeof id==='string' && uuid.test(id)))
    return {type:data.type,notificationId:data.notificationId,childId:data.childId,subscriptionId:data.subscriptionId};
}
export function commentRoute(childId: string, notificationId: string) {
  if (!uuid.test(childId) || !uuid.test(notificationId)) throw new Error('Notifikasi tidak valid.');
  return `/#/children/${childId}?tab=comments&notification=${notificationId}`;
}
export const notificationTitle = 'Komentar baru';
export const notificationBody = 'Ada komentar baru pada laporan belajar. Buka aplikasi untuk melihatnya.';
