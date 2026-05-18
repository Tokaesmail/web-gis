"use client";

import type { ProjectDraft, ProjectStorageMode, UserProject } from "./projectTypes";

const STORAGE_PREFIX = "gis_user_projects_v1";

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

function storageKey(ownerKey: string) {
  return `${STORAGE_PREFIX}:${ownerKey || "guest"}`;
}

function readLocalProjects(ownerKey: string): UserProject[] {
  try {
    const raw = localStorage.getItem(storageKey(ownerKey));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalProjects(ownerKey: string, projects: UserProject[]) {
  localStorage.setItem(storageKey(ownerKey), JSON.stringify(projects));
}

function emptySnapshot(): UserProject["snapshot"] {
  const today = new Date().toISOString().slice(0, 10);
  return {
    aoiGeometry: null,
    selectedLayers: [],
    uploadedGeoJsonMap: {},
    selectedDatasets: [],
    timeRange: { from: today, to: today },
    analysisSettings: { activePanel: "overview", captureTarget: "small" },
  };
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(payload?.message ?? `Request failed with ${res.status}`);
  }
  return (payload?.data ?? payload) as T;
}

function normalizeProject(raw: RemoteProjectPayload, ownerKey: string): UserProject {
  const now = new Date().toISOString();
  return {
    id: String(raw?.id ?? raw?._id ?? crypto.randomUUID()),
    name: String(raw?.name ?? "Untitled project"),
    description: String(raw?.description ?? ""),
    ownerKey: String(raw?.ownerKey ?? ownerKey),
    createdAt: String(raw?.createdAt ?? raw?.created_at ?? now),
    updatedAt: String(raw?.updatedAt ?? raw?.updated_at ?? now),
    snapshot: raw?.snapshot ?? raw?.data ?? raw?.projectData ?? emptySnapshot(),
  };
}

export async function listProjects(ownerKey: string, canUseRemote: boolean): Promise<ProjectResult<UserProject[]>> {
  if (canUseRemote) {
    try {
      const payload = await requestJson<RemoteProjectPayload[] | { projects?: RemoteProjectPayload[] }>("/api/gis/projects", { cache: "no-store" });
      const rows = Array.isArray(payload) ? payload : payload?.projects ?? [];
      return { data: rows.map((item) => normalizeProject(item, ownerKey)), mode: "remote" };
    } catch {
      // Fall back to local project persistence while the backend endpoint is unavailable.
    }
  }
  return { data: readLocalProjects(ownerKey), mode: "local" };
}

export async function createProject(
  ownerKey: string,
  draft: ProjectDraft,
  canUseRemote: boolean,
): Promise<ProjectResult<UserProject>> {
  if (canUseRemote) {
    try {
      const created = await requestJson<RemoteProjectPayload>("/api/gis/projects", {
        method: "POST",
        body: JSON.stringify(draft),
      });
      return { data: normalizeProject(created, ownerKey), mode: "remote" };
    } catch {
      // Keep the workflow usable without a projects backend.
    }
  }

  const now = new Date().toISOString();
  const project: UserProject = {
    id: crypto.randomUUID(),
    ownerKey,
    name: draft.name,
    description: draft.description,
    snapshot: draft.snapshot,
    createdAt: now,
    updatedAt: now,
  };
  const projects = [project, ...readLocalProjects(ownerKey)];
  writeLocalProjects(ownerKey, projects);
  return { data: project, mode: "local" };
}

export async function updateProject(
  ownerKey: string,
  project: UserProject,
  canUseRemote: boolean,
): Promise<ProjectResult<UserProject>> {
  const updated = { ...project, updatedAt: new Date().toISOString() };
  if (canUseRemote) {
    try {
      const saved = await requestJson<RemoteProjectPayload>(`/api/gis/projects/${encodeURIComponent(project.id)}`, {
        method: "PUT",
        body: JSON.stringify(updated),
      });
      return { data: normalizeProject(saved, ownerKey), mode: "remote" };
    } catch {
      // Local fallback covers demos and offline work.
    }
  }

  const projects = readLocalProjects(ownerKey).map((item) => (item.id === project.id ? updated : item));
  writeLocalProjects(ownerKey, projects);
  return { data: updated, mode: "local" };
}

export async function deleteProject(
  ownerKey: string,
  projectId: string,
  canUseRemote: boolean,
): Promise<ProjectResult<string>> {
  if (canUseRemote) {
    try {
      await requestJson(`/api/gis/projects/${encodeURIComponent(projectId)}`, { method: "DELETE" });
      return { data: projectId, mode: "remote" };
    } catch {
      // Continue with local delete when the remote endpoint is missing.
    }
  }

  writeLocalProjects(ownerKey, readLocalProjects(ownerKey).filter((item) => item.id !== projectId));
  return { data: projectId, mode: "local" };
}
