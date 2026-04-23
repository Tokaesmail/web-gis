"use client";

// ─── useMapDB.ts ───────────────────────────────────────────────────────────────
// Hook لحفظ وقراءة الـ captures في IndexedDB (قاعدة بيانات المتصفح)
//
// ليه IndexedDB؟
//   localStorage → نص فقط، حد أقصى 5MB
//   IndexedDB    → Blobs مباشرة، مئات MB، أسرع بكتير

import { useCallback } from "react";
import { LatLngPoint, CaptureMetadata } from "./mapTypes_proxy";

const DB_NAME = "MapCapturesDB";
const STORE = "captures";

// ─── فتح الـ DB ───────────────────────────────────────────────────────────────
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE))
        db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
    };
    req.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result);
    req.onerror = (e) => reject((e.target as IDBOpenDBRequest).error);
  });
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useMapDB() {
  // ① حفظ Blobs + الإحداثيات → يرجع id
  const saveCapture = useCallback(
    async (
      smallBlob: Blob,
      largeBlob: Blob,
      coordinates: LatLngPoint[],
      metadata: CaptureMetadata,
    ): Promise<number> => {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const req = db
          .transaction(STORE, "readwrite")
          .objectStore(STORE)
          .add({ smallBlob, largeBlob, coordinates, metadata, createdAt: Date.now() });
        req.onsuccess = (e) =>
          resolve((e.target as IDBRequest).result as number);
        req.onerror = (e) => reject((e.target as IDBRequest).error);
      });
    },
    [],
  );

  // ② جيب record بالـ id
  const getCapture = useCallback(async (id: number) => {
    const db = await openDB();
    return new Promise<any>((resolve, reject) => {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).get(id);
      req.onsuccess = (e) => resolve((e.target as IDBRequest).result ?? null);
      req.onerror = (e) => reject((e.target as IDBRequest).error);
    });
  }, []);

  // ③ جيب كل الـ records
  const getAllCaptures = useCallback(async () => {
    const db = await openDB();
    return new Promise<any[]>((resolve, reject) => {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
      req.onsuccess = (e) => resolve((e.target as IDBRequest).result ?? []);
      req.onerror = (e) => reject((e.target as IDBRequest).error);
    });
  }, []);

  // ④ امسح record
  const deleteCapture = useCallback(async (id: number): Promise<void> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const req = db
        .transaction(STORE, "readwrite")
        .objectStore(STORE)
        .delete(id);
      req.onsuccess = () => resolve();
      req.onerror = (e) => reject((e.target as IDBRequest).error);
    });
  }, []);

  // ⑤ Blob → URL مؤقت للعرض في <img src="">
  // مهم: استدعي URL.revokeObjectURL(url) لما تخلصي منه
  const blobToUrl = useCallback((blob: Blob) => URL.createObjectURL(blob), []);

  return { saveCapture, getCapture, getAllCaptures, deleteCapture, blobToUrl };
}
