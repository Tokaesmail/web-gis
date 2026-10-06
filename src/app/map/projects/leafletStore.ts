// ─── leafletStore.ts ──────────────────────────────────────────────────────────
// كل بيانات الـ LeafletMap (غير الـ AOIs اللي في ./indexeddB) في IndexedDB:
//   kv            → آخر مكان/زوم للخريطة
//   imageOverlays → الصور الثابتة اللي المستخدم حطها على الخريطة
//   analysis      → التحليل الحالي المعروض (raster / points / superRes / swipe)
//   deletedIds    → "قبر" الـ ids اللي اتمسحت (عشان ما ترجعش من أي مصدر)

const DB_NAME = "gis_leaflet_map_v1";
const DB_VERSION = 1;

const STORES: { name: string; keyPath: string }[] = [
  { name: "kv", keyPath: "key" },
  { name: "imageOverlays", keyPath: "id" },
  { name: "analysis", keyPath: "key" },
  { name: "deletedIds", keyPath: "id" },
];

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of STORES) {
        if (!db.objectStoreNames.contains(s.name)) {
          db.createObjectStore(s.name, { keyPath: s.keyPath });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** بينفّذ عملية ويستنى الـ transaction تخلص فعلاً (oncomplete) قبل ما يرجّع النتيجة */
async function run<T = unknown>(
  store: string,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest | void,
): Promise<T> {
  const db = await openDB();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const s = tx.objectStore(store);
    let result: any;
    const req = fn(s);
    if (req) {
      req.onsuccess = () => {
        result = req.result;
      };
    }
    tx.oncomplete = () => {
      db.close();
      resolve(result as T);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error);
    };
  });
}

// ── kv (آخر مكان/زوم) ────────────────────────────────────────────────────────
export async function kvGet<T = any>(key: string): Promise<T | null> {
  const rec = await run<{ key: string; value: T } | undefined>(
    "kv",
    "readonly",
    (s) => s.get(key),
  );
  return rec ? rec.value : null;
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  await run("kv", "readwrite", (s) => s.put({ key, value }));
}

// ── الصور الثابتة ────────────────────────────────────────────────────────────
export type StoredImageOverlay = {
  id: string;
  name: string;
  src: string;
  bounds: [[number, number], [number, number]];
};

export async function imageOverlaysGetAll(): Promise<StoredImageOverlay[]> {
  return (
    (await run<StoredImageOverlay[]>("imageOverlays", "readonly", (s) =>
      s.getAll(),
    )) ?? []
  );
}

/** يستبدل كل الصور المتسيفة بالقائمة دي (قائمة فاضية = مسح الكل) */
export async function imageOverlaysReplaceAll(
  list: StoredImageOverlay[],
): Promise<void> {
  await run("imageOverlays", "readwrite", (s) => {
    s.clear();
    for (const it of list) s.put(it);
  });
}

export async function imageOverlaysClear(): Promise<void> {
  await run("imageOverlays", "readwrite", (s) => s.clear());
}

// ── التحليل ──────────────────────────────────────────────────────────────────
export type StoredAnalysis = {
  key: "current";
  kind: "raster" | "points" | "superRes" | "swipe";
  config: any;
  savedAt: number;
};

export async function analysisGet(): Promise<StoredAnalysis | null> {
  const rec = await run<StoredAnalysis | undefined>("analysis", "readonly", (s) =>
    s.get("current"),
  );
  return rec ?? null;
}

export async function analysisSet(
  rec: Omit<StoredAnalysis, "key"> & { key?: "current" },
): Promise<void> {
  await run("analysis", "readwrite", (s) => s.put({ ...rec, key: "current" }));
}

export async function analysisClear(): Promise<void> {
  await run("analysis", "readwrite", (s) => s.clear());
}

// ── قبر الـ ids المحذوفة ─────────────────────────────────────────────────────
export async function deletedIdsGetAll(): Promise<string[]> {
  const rows = await run<{ id: string }[]>("deletedIds", "readonly", (s) =>
    s.getAll(),
  );
  return (rows ?? []).map((r) => String(r.id));
}

export async function deletedIdsAdd(ids: string[]): Promise<void> {
  if (!ids.length) return;
  await run("deletedIds", "readwrite", (s) => {
    for (const id of ids) s.put({ id: String(id), at: Date.now() });
  });
}