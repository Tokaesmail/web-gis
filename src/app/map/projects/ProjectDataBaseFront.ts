import { UserProject } from "./projectTypes";

function openProjectDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const projectDb: IDBOpenDBRequest = indexedDB.open(
      "gis_user_projects_v1",
      1
    );

    projectDb.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains("projects")) {
        db.createObjectStore("projects", {
          keyPath: "id",
        });
      }
    };

    projectDb.onsuccess = () => {
      resolve(projectDb.result);
    };

    projectDb.onerror = () => {
      reject(projectDb.error);
    };
  });
}

export async function readLocalProjectsdb(): Promise<UserProject[]> {
  const db = await openProjectDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction("projects", "readonly");

    const store = transaction.objectStore("projects");

    const request = store.getAll();

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

export async function writeLocalProjectsdb(
  projects: UserProject[]
): Promise<void> {
  const db = await openProjectDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction("projects", "readwrite");

    const store = transaction.objectStore("projects");

    for (const project of projects) {
      store.put(project);
    }

    transaction.oncomplete = () => {
      resolve();
    };

    transaction.onerror = () => {
      reject(transaction.error);
    };
  });
}

export async function deleteLocalProject(projectId: string): Promise<void> {
  const db = await openProjectDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction("projects", "readwrite");

    const store = transaction.objectStore("projects");

    const request = store.delete(projectId);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

