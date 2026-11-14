const storageKey = 'smartgym.pose-video-draft';
const storeName = 'videos';

type DraftPosition = { id: string; time: number; exerciseId: string };
type DraftFile = { id: string; file: File };

let database: Promise<IDBDatabase> | undefined;

function openDatabase() {
  database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('smartgym-pose', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(storeName, { keyPath: 'id' });
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        database = undefined;
      };
      resolve(db);
    };
    request.onerror = () => reject(request.error);
  }).catch(error => {
    database = undefined;
    throw error;
  });
  return database;
}

function readPosition(): DraftPosition | null {
  try {
    return JSON.parse(localStorage.getItem(storageKey) ?? 'null');
  } catch {
    return null;
  }
}

async function updateFiles(update: (store: IDBObjectStore) => void) {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
    update(transaction.objectStore(storeName));
  });
}

export async function savePoseVideoDraft(file: File, position: DraftPosition) {
  const previous = readPosition();
  localStorage.setItem(storageKey, JSON.stringify(position));
  try {
    await updateFiles(store => {
      if (previous) store.delete(previous.id);
      store.put({ id: position.id, file } satisfies DraftFile);
    });
  } catch (error) {
    if (readPosition()?.id === position.id) {
      if (previous) localStorage.setItem(storageKey, JSON.stringify(previous));
      else localStorage.removeItem(storageKey);
    }
    throw error;
  }
}

export function savePoseVideoPosition(position: DraftPosition) {
  if (readPosition()?.id !== position.id) return;
  try {
    localStorage.setItem(storageKey, JSON.stringify(position));
  } catch {
    // Playback can continue if browser storage becomes unavailable.
  }
}

export async function loadPoseVideoDraft() {
  const position = readPosition();
  if (!position) return null;
  const db = await openDatabase();
  const draft = await new Promise<DraftFile | undefined>((resolve, reject) => {
    const request = db.transaction(storeName).objectStore(storeName).get(position.id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const latest = readPosition();
  if (latest?.id !== position.id) return null;
  if (!draft) return null;
  return { ...latest, file: draft.file };
}

export async function clearPoseVideoDraft() {
  const position = readPosition();
  if (!position) return;
  try {
    localStorage.removeItem(storageKey);
    await updateFiles(store => store.delete(position.id));
  } catch {
    // Removing the pointer prevents restore even if database deletion fails.
  }
}
