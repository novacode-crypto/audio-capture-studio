// Biblioteca local en IndexedDB (compartida por offscreen, popup y side panel: mismo origen).
import type { RecordingRecord } from '../shared/types';

const DB_NAME = 'acs-library';
const STORE = 'recordings';
let dbp: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const s = req.result.createObjectStore(STORE, { keyPath: 'id' });
      s.createIndex('createdAt', 'createdAt');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('No se pudo abrir IndexedDB'));
  });
  return dbp;
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const r = fn(t.objectStore(STORE));
        t.oncomplete = () => resolve(r.result);
        t.onerror = () => reject(t.error ?? new Error('Error de IndexedDB'));
        t.onabort = () => reject(t.error ?? new Error('Transaccion abortada (espacio insuficiente?)'));
      }),
  );
}

export const putRecording = (r: RecordingRecord) => tx('readwrite', (s) => s.put(r));
export const getRecording = (id: string) => tx<RecordingRecord | undefined>('readonly', (s) => s.get(id));
export const deleteRecording = (id: string) => tx('readwrite', (s) => s.delete(id));
export const clearRecordings = () => tx('readwrite', (s) => s.clear());

export async function listRecordings(): Promise<RecordingRecord[]> {
  const all = await tx<RecordingRecord[]>('readonly', (s) => s.getAll());
  return all.sort((a, b) => b.createdAt - a.createdAt || b.index - a.index);
}

export async function updateRecording(id: string, patch: Partial<RecordingRecord>): Promise<void> {
  const cur = await getRecording(id);
  if (!cur) throw new Error('La grabacion ya no existe');
  await putRecording({ ...cur, ...patch, id: cur.id });
}

export interface StorageUsage {
  used: number;
  count: number;
  quota: number | null;
  browserUsage: number | null;
}

export async function storageUsage(list?: RecordingRecord[]): Promise<StorageUsage> {
  const all = list ?? (await listRecordings());
  const est = navigator.storage?.estimate ? await navigator.storage.estimate() : null;
  return {
    used: all.reduce((n, r) => n + r.size, 0),
    count: all.length,
    quota: est?.quota ?? null,
    browserUsage: est?.usage ?? null,
  };
}
