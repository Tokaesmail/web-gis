const DB_NAME = "MapOfflineDB";
const DB_VERSION = 2;
const STORE_NAME = "analyses";
const AOI_STORE = "aois";

export type AOIRecord = {
  id: string;
  name: string;
  tool: "polygon" | "rectangle" | "circle";
  coords: [number, number][]; // [lat, lng]
  areaHa: number;
  createdAt: string;
};

// 1. تعريف دالة openDB وبداخلها يتم إعداد request وتعيين onupgradeneeded
export function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    // التأكد من أن الكود يعمل في بيئة المتصفح فقط (Next.js SSR Guard)
    if (typeof window === "undefined" || !window.indexedDB) {
      return reject(new Error("IndexedDB is not available in SSR context"));
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(AOI_STORE)) {
        db.createObjectStore(AOI_STORE, { keyPath: "id" });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

// 2. دالة المساعدة للمعاملات (Transaction Helper)
function tx<T>(
  store: string,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T> | void
) {
  return openDB().then(
    (db) =>
      new Promise<T | undefined>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));

        t.oncomplete = () => {
          db.close();
          resolve(req ? (req as IDBRequest<T>).result : undefined);
        };
        t.onerror = () => {
          db.close();
          reject(t.error);
        };
      })
  );
}

// 3. الدوال المُصدرة للتعامل مع AOI
export const saveAOI = (aoi: AOIRecord) =>
  tx(AOI_STORE, "readwrite", (s) => s.put(aoi));

export const getAllAOIs = async () =>
  (await tx<AOIRecord[]>(AOI_STORE, "readonly", (s) => s.getAll())) ?? [];

export const deleteAOI = (id: string) =>
  tx(AOI_STORE, "readwrite", (s) => s.delete(id));

export const clearAllAOIs = () =>
  tx(AOI_STORE, "readwrite", (s) => s.clear());