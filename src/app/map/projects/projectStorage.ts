"use client";

import {
  readLocalProjectsdb,
  writeLocalProjectsdb,
  deleteLocalProject,
} from "./ProjectDataBaseFront";

import { stashHeavyAnalyses, isDataUrl } from "./leafletStore";

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

/** حقول الصور/النقاط الضخمة — بتتخزن في leafletStore (Blob) مش جوه المشروع */
const HEAVY_ANALYSIS_FIELDS = ["dataUrl", "beforeUrl", "afterUrl", "points"];

/** نسخة خفيفة من الـ snapshot: من غير الصور base64. ده اللي بيتكتب في المشروع / الباك. */
export function slimSnapshot(
  snap: UserProject["snapshot"],
  onlyIds?: Set<string> // لو متحدد: نشيل ثقيل الـ analyses دي بس (اللي اتخزنت فعلاً)
): UserProject["snapshot"] {
  if (!snap) return snap;
  const saved = (snap as any).savedAnalyses;
  if (!Array.isArray(saved)) return snap;
  return {
    ...snap,
    savedAnalyses: saved.map((a: any) => {
      if (!a || typeof a !== "object") return a;
      if (onlyIds && !onlyIds.has(String(a.id))) return a; // ما اتخزنش → سيبه كامل
      const copy: any = { ...a };
      for (const f of HEAVY_ANALYSIS_FIELDS) {
        if (f === "points" || isDataUrl(copy[f])) delete copy[f];
      }
      if (isDataUrl(copy.tileUrl)) delete copy.tileUrl;
      return copy;
    }),
  } as UserProject["snapshot"];
}

/** توقيع رخيص للـ snapshot الخفيف — عشان ما نحفظش لو ما اتغيرش حاجة */
export function snapshotSignature(snap: UserProject["snapshot"]): string {
  try {
    return JSON.stringify(slimSnapshot(snap));
  } catch {
    return String(Date.now());
  }
}

/** يخزّن الصور في IndexedDB (Blob) ويشيلها من الـ snapshot — لو التخزين فشل، الـ snapshot بيفضل كامل */
async function prepareSnapshot(
  snapshot: UserProject["snapshot"]
): Promise<UserProject["snapshot"]> {
  const saved = (snapshot as any)?.savedAnalyses;
  if (!Array.isArray(saved)) return snapshot;
  let safe = new Set<string>();
  try {
    safe = await stashHeavyAnalyses(saved);
  } catch (e) {
    console.warn("stash failed, keeping full snapshot", e);
  }
  return slimSnapshot(snapshot, safe);
}

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
            body: JSON.stringify({
              ...draft,
              snapshot: await prepareSnapshot(draft.snapshot),
            }),
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

    snapshot: await prepareSnapshot(draft.snapshot),

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

  // ✅ بنحفظ metadata بس: الصور والتحليلات الثقيلة عند اليوزر (leafletStore)
  const updated = {
    ...project,
    snapshot: await prepareSnapshot(project.snapshot),
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