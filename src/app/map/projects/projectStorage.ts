"use client";

import {
  readLocalProjectsdb,
  writeLocalProjectsdb,
  deleteLocalProject,
} from "./ProjectDataBaseFront";

import type {
  ProjectDraft,
  ProjectStorageMode,
  UserProject,
} from "./projectTypes";

type ProjectResult<T> = {
  data: T;
  mode: ProjectStorageMode;
};

type RemoteProjectPayload = Partial<UserProject> & {
  _id?: string;
  created_at?: string;
  updated_at?: string;
  data?: UserProject["snapshot"];
  projectData?: UserProject["snapshot"];
};

function emptySnapshot(): UserProject["snapshot"] {
  const today = new Date().toISOString().slice(0, 10);

  return {
    aoiGeometry: null,
    selectedLayers: [],
    uploadedGeoJsonMap: {},
    selectedDatasets: [],
    timeRange: {
      from: today,
      to: today,
    },
    analysisSettings: {
      activePanel: "overview",
      captureTarget: "small",
    },
  };
}

async function requestJson<T>(
  url: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const payload = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(
      payload?.message ?? `Request failed with ${res.status}`
    );
  }

  return (payload?.data ?? payload) as T;
}

function normalizeProject(
  raw: RemoteProjectPayload,
  ownerKey: string
): UserProject {
  const now = new Date().toISOString();

  return {
    id: String(
      raw?.id ??
        raw?._id ??
        crypto.randomUUID()
    ),

    name: String(raw?.name ?? "Untitled project"),

    description: String(
      raw?.description ?? ""
    ),

    ownerKey: String(
      raw?.ownerKey ?? ownerKey
    ),

    createdAt: String(
      raw?.createdAt ??
        raw?.created_at ??
        now
    ),

    updatedAt: String(
      raw?.updatedAt ??
        raw?.updated_at ??
        now
    ),

    snapshot:
      raw?.snapshot ??
      raw?.data ??
      raw?.projectData ??
      emptySnapshot(),
  };
}

export async function listProjects(
  ownerKey: string,
  canUseRemote: boolean
): Promise<ProjectResult<UserProject[]>> {

  console.log("CAN USE REMOTE:", canUseRemote);

  if (canUseRemote) {
    try {
      const payload = await requestJson<
        RemoteProjectPayload[] | {
          projects?: RemoteProjectPayload[];
        }
      >(
        "/api/gis/projects",
        {
          cache: "no-store",
        }
      );

      const rows = Array.isArray(payload)
        ? payload
        : payload?.projects ?? [];

      return {
        data: rows.map((item) =>
          normalizeProject(item, ownerKey)
        ),
        mode: "remote",
      };

    } catch {
      // fallback to IndexedDB
    }
  }

  return {
    data: await readLocalProjectsdb(),
    mode: "local",
  };
}

export async function createProject(
  ownerKey: string,
  draft: ProjectDraft,
  canUseRemote: boolean
): Promise<ProjectResult<UserProject>> {

  if (canUseRemote) {
    try {
      const created =
        await requestJson<RemoteProjectPayload>(
          "/api/gis/projects",
          {
            method: "POST",
            body: JSON.stringify(draft),
          }
        );

      return {
        data: normalizeProject(
          created,
          ownerKey
        ),
        mode: "remote",
      };

    } catch {
      // fallback to IndexedDB
    }
  }

  const now = new Date().toISOString();

  const project: UserProject = {
    id: crypto.randomUUID(),

    // اسم/معرف صاحب المشروع
    ownerKey,

    name: draft.name,

    description: draft.description,

    snapshot: draft.snapshot,

    createdAt: now,

    updatedAt: now,
  };

  const projects =
    await readLocalProjectsdb();

  projects.unshift(project);

  await writeLocalProjectsdb(projects);

  return {
    data: project,
    mode: "local",
  };
}

export async function updateProject(
  ownerKey: string,
  project: UserProject,
  canUseRemote: boolean
): Promise<ProjectResult<UserProject>> {

  const updated = {
    ...project,
    updatedAt: new Date().toISOString(),
  };

  if (canUseRemote) {
    try {
      const saved =
        await requestJson<RemoteProjectPayload>(
          `/api/gis/projects/${encodeURIComponent(
            project.id
          )}`,
          {
            method: "PUT",
            body: JSON.stringify(updated),
          }
        );
        console.log("🔥 REMOTE PROJECT SAVED:", saved);

      return {
        data: normalizeProject(
          saved,
          ownerKey
        ),
        mode: "remote",
      };

    } catch(error) {
        console.warn(
    "Remote save failed, saving to IndexedDB:",
    error
  );
    }
  }

 const projects = await readLocalProjectsdb();

const updatedProjects = projects.some(
  (item) => item.id === project.id
)
  ? projects.map((item) =>
      item.id === project.id ? updated : item
    )
  : [...projects, updated];

await writeLocalProjectsdb(updatedProjects);

console.log("🔥 SAVED TO INDEXEDDB:", updated);

return {
  data: updated,
  mode: "local",
};
}

export async function deleteProject(
  ownerKey: string,
  projectId: string,
  canUseRemote: boolean
): Promise<ProjectResult<string>> {

  if (canUseRemote) {
    try {
      await requestJson(
        `/api/gis/projects/${encodeURIComponent(projectId)}`,
        {
          method: "DELETE",
        }
      );

      return {
        data: projectId,
        mode: "remote",
      };

    } catch {
      // fallback to IndexedDB
    }
  }

  await deleteLocalProject(projectId);

  return {
    data: projectId,
    mode: "local",
  };
}