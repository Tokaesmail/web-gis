// ─── leafletStore.ts ──────────────────────────────────────────────────────────
// كل بيانات الـ LeafletMap (غير الـ AOIs اللي في ./indexeddB) في IndexedDB:
//   kv            → آخر مكان/زوم للخريطة
//   imageOverlays → الصور الثابتة اللي المستخدم حطها على الخريطة
//   analysis      → (legacy) سجل التحليل الواحد القديم
//   analyses      → ✅ جديد: record مستقل لكل شكل (ownerId) والصور متخزنة Blob
//   analysisBlobs → ✅ جديد: الصور/النقاط الثقيلة بتاعة savedAnalyses بتاع المشروع (Blob) بالـ id
//   deletedIds    → "قبر" الـ ids اللي اتمسحت (عشان ما ترجعش من أي مصدر)

const DB_NAME = "gis_leaflet_map_v1";
const DB_VERSION = 3; // v2: store "analyses" | v3: store "analysisBlobs"

const STORES: { name: string; keyPath: string }[] = [
  { name: "kv", keyPath: "key" },
  { name: "imageOverlays", keyPath: "id" },
  { name: "analysis", keyPath: "key" },
  { name: "analyses", keyPath: "ownerId" },
  { name: "analysisBlobs", keyPath: "id" },
  { name: "deletedIds", keyPath: "id" },
];

const LEGACY_ANALYSES_KV_KEY = "analyses_v2"; // كان record واحد جوه kv

let persistRequested = false;
/** يطلب من المتصفح ما يمسحش الداتا لوحده (مرة واحدة في الجلسة) */
function requestPersistentStorage() {
  if (persistRequested) return;
  persistRequested = true;
  try {
    if (typeof navigator !== "undefined" && navigator.storage?.persist) {
      navigator.storage.persist().catch(() => {});
    }
  } catch (_) {}
}

function openDB(): Promise<IDBDatabase> {
  requestPersistentStorage();
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

async function kvDelete(key: string): Promise<void> {
  await run("kv", "readwrite", (s) => s.delete(key));
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

// ── التحليل (legacy single record) ───────────────────────────────────────────
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

// ── ✅ التحليلات: record مستقل لكل شكل + الصور Blob (مش base64) ──────────────
/** الحقول اللي بتشيل صور ضخمة (data URL) وبنحوّلها Blob وقت الحفظ */
const HEAVY_URL_FIELDS = ["dataUrl", "beforeUrl", "afterUrl"] as const;

export type OwnerAnalysisRecord = {
  ownerId: string;
  kind: StoredAnalysis["kind"];
  config: any;
  savedAt: number;
};

async function dataUrlToBlob(u: string): Promise<Blob> {
  const res = await fetch(u); // data: URL → Blob (native، من غير parsing يدوي)
  return res.blob();
}

function blobToDataUrl(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(b);
  });
}

async function packRecord(rec: OwnerAnalysisRecord): Promise<any> {
  const config = { ...(rec.config ?? {}) };
  const blobs: Record<string, Blob> = {};
  for (const f of HEAVY_URL_FIELDS) {
    const v = config[f];
    if (isDataUrl(v)) {
      try {
        blobs[f] = await dataUrlToBlob(v);
        delete config[f];
      } catch (_) {
        /* لو فشل التحويل نسيبه كنص زي ما هو */
      }
    }
  }
  return { ...rec, config, blobs };
}

async function unpackRecord(row: any): Promise<OwnerAnalysisRecord> {
  const config = { ...(row.config ?? {}) };
  if (row.blobs) {
    for (const [f, b] of Object.entries<Blob>(row.blobs)) {
      config[f] = await blobToDataUrl(b);
    }
  }
  return {
    ownerId: row.ownerId,
    kind: row.kind,
    config,
    savedAt: row.savedAt,
  };
}

/** يكتب (أو يحدّث) تحليلات الأشكال المحددة بس — من غير ما يلمس باقي التحليلات */
export async function analysesPutMany(
  records: Record<string, Omit<OwnerAnalysisRecord, "ownerId"> & { ownerId?: string }>,
): Promise<void> {
  const owners = Object.keys(records);
  if (!owners.length) return;
  // التحويل لـ Blob بيحصل برا الـ transaction (عشان ما تنتهيش بدري)
  const packed = await Promise.all(
    owners.map((o) =>
      packRecord({ ...(records[o] as OwnerAnalysisRecord), ownerId: o }),
    ),
  );
  await run("analyses", "readwrite", (s) => {
    for (const p of packed) s.put(p);
  });
}

/** هل في سجل legacy (record واحد فيه كل التحليلات) محتاج ينقل؟ بينقله مرة واحدة */
async function migrateLegacyAnalyses(): Promise<void> {
  try {
    const legacy = await kvGet<Record<string, any>>(LEGACY_ANALYSES_KV_KEY);
    if (!legacy) return;
    const entries = Object.entries(legacy).filter(([, v]) => v?.kind);
    if (entries.length) {
      const existing = new Set(
        (await run<any[]>("analyses", "readonly", (s) => s.getAllKeys())) ?? [],
      );
      const toMove: Record<string, any> = {};
      for (const [owner, v] of entries) {
        if (!existing.has(owner)) toMove[owner] = { ...v, ownerId: owner };
      }
      await analysesPutMany(toMove);
    }
    await kvDelete(LEGACY_ANALYSES_KV_KEY);
  } catch (e) {
    console.warn("legacy analyses migration failed", e);
  }
}

/** كل التحليلات المتسيفة: ownerId → { kind, config, savedAt, ownerId } */
export async function analysesGetAll(): Promise<Record<string, any>> {
  await migrateLegacyAnalyses();
  const rows =
    (await run<any[]>("analyses", "readonly", (s) => s.getAll())) ?? [];
  const out: Record<string, any> = {};
  for (const row of rows) {
    try {
      out[row.ownerId] = await unpackRecord(row);
    } catch (e) {
      console.warn("analysis unpack failed", row?.ownerId, e);
    }
  }
  return out;
}

export async function analysesDeleteMany(owners: string[]): Promise<void> {
  if (!owners.length) return;
  await run("analyses", "readwrite", (s) => {
    for (const o of owners) s.delete(o);
  });
}

export async function analysesClearAll(): Promise<void> {
  await run("analyses", "readwrite", (s) => s.clear());
  try {
    await kvDelete(LEGACY_ANALYSES_KV_KEY);
  } catch (_) {}
}

// ── ✅ صور savedAnalyses بتاعة المشروع (بالـ analysis.id) ─────────────────────
// المشروع (والباك) بياخد metadata بس، والصور بتتخزن هنا Blob وبترجع وقت فتح المشروع.
/** data: أو blob: — الاتنين ما ينفعش يتخزنوا كنص (blob: بيموت بعد الريفريش) */
export const isDataUrl = (v: unknown): v is string =>
  typeof v === "string" && (v.startsWith("data:") || v.startsWith("blob:"));

export function analysisHasHeavy(a: any): boolean {
  if (!a || typeof a !== "object") return false;
  if (Array.isArray(a.points) && a.points.length) return true;
  return HEAVY_URL_FIELDS.some((f) => isDataUrl(a[f]));
}

/** يخزّن ثقيل كل analysis (اللي لسه ما اتخزنش) ويرجّع ids اللي بقت آمنة تتشال من المشروع */
export async function stashHeavyAnalyses(list: any[]): Promise<Set<string>> {
  const safe = new Set<string>();
  const heavy = list.filter((a) => a?.id && analysisHasHeavy(a));
  if (!heavy.length) return safe;
  const existing = new Set<string>(
    ((await run<IDBValidKey[]>("analysisBlobs", "readonly", (s) =>
      s.getAllKeys(),
    )) ?? []).map(String),
  );
  const rows: any[] = [];
  for (const a of heavy) {
    const id = String(a.id);
    if (existing.has(id)) {
      safe.add(id);
      continue;
    }
    try {
      const blobs: Record<string, Blob> = {};
      for (const f of HEAVY_URL_FIELDS) {
        if (isDataUrl(a[f])) blobs[f] = await dataUrlToBlob(a[f]);
      }
      rows.push({
        id,
        blobs,
        points: Array.isArray(a.points) ? a.points : undefined,
        savedAt: Date.now(),
      });
    } catch (e) {
      console.warn("stash heavy analysis failed", id, e); // مش هنشيله من المشروع
    }
  }
  if (rows.length) {
    await run("analysisBlobs", "readwrite", (s) => {
      for (const r of rows) s.put(r);
    });
    rows.forEach((r) => safe.add(r.id));
  }
  return safe;
}

/** يرجّع الصور/النقاط الناقصة لكل analysis من الـ IndexedDB (لو موجودة) */
export async function hydrateAnalyses(list: any[]): Promise<any[]> {
  return Promise.all(
    (list ?? []).map(async (a) => {
      if (!a?.id) return a;
      const needs =
        !a.dataUrl && !a.beforeUrl && !a.afterUrl && !(a.points?.length);
      if (!needs) return a;
      try {
        const row = await run<any>("analysisBlobs", "readonly", (s) =>
          s.get(String(a.id)),
        );
        if (!row) return a;
        const out = { ...a };
        for (const [f, b] of Object.entries<Blob>(row.blobs ?? {})) {
          out[f] = await blobToDataUrl(b);
        }
        if (row.points) out.points = row.points;
        return out;
      } catch (e) {
        console.warn("hydrate analysis failed", a.id, e);
        return a;
      }
    }),
  );
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