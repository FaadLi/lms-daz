// Only an opaque device subscription ID is persisted, never credentials,
// endpoints, notification records, comment text or report tokens.
const database = 'lms-push-device-v1';
async function openBinding() {
  return new Promise<IDBDatabase>((resolve,reject) => {
    const request = indexedDB.open(database,1);
    request.onupgradeneeded = () => request.result.createObjectStore('binding');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Pengaturan notifikasi perangkat tidak tersedia.'));
  });
}
export async function readPushBinding(): Promise<string | undefined> {
  const db = await openBinding();
  try {
    return await new Promise((resolve,reject) => {
      const transaction = db.transaction('binding');
      const request = transaction.objectStore('binding').get('subscription');
      transaction.oncomplete = () => resolve(request.result as string | undefined);
      transaction.onerror = () => reject(new Error('Pengaturan notifikasi tidak dapat dibaca.'));
    });
  } finally { db.close(); }
}
let updates: Promise<void> = Promise.resolve();
export function writePushBinding(id?: string): Promise<void> {
  const change = async () => {
    const db = await openBinding();
    try {
      await new Promise<void>((resolve,reject) => {
        const transaction = db.transaction('binding','readwrite');
        const store = transaction.objectStore('binding');
        if (id) store.put(id,'subscription'); else store.delete('subscription');
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(new Error('Pengaturan notifikasi tidak dapat disimpan.'));
        transaction.onabort = () => reject(new Error('Pengaturan notifikasi dibatalkan.'));
      });
    } finally { db.close(); }
  };
  const result = updates.catch(() => {}).then(change);
  updates = result.catch(() => {});
  return result;
}
