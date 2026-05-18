"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import type { ProjectSnapshot, ProjectStorageMode, UserProject } from "./projectTypes";
import { createProject, deleteProject, listProjects } from "./projectStorage";

type Props = {
  ownerKey: string;
  isAuthenticated: boolean;
  currentSnapshot: ProjectSnapshot;
  onCreateProject: (project: UserProject) => void;
  onLoadProject: (project: UserProject) => void;
  onSkip: () => void;
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return date.toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" });
}

export default function ProjectStartDialog({
  ownerKey,
  isAuthenticated,
  currentSnapshot,
  onCreateProject,
  onLoadProject,
  onSkip,
}: Props) {
  const [projects, setProjects] = useState<UserProject[]>([]);
  const [mode, setMode] = useState<ProjectStorageMode>("local");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const canCreate = name.trim().length >= 2;

  const refresh = useCallback(async () => {
    setLoading(true);
    const result = await listProjects(ownerKey, isAuthenticated);
    setProjects(result.data);
    setMode(result.mode);
    setLoading(false);
  }, [ownerKey, isAuthenticated]);

  useEffect(() => {
    queueMicrotask(() => {
      void refresh();
    });
  }, [refresh]);

  const handleCreate = async () => {
    if (!canCreate) return;
    setSaving(true);
    const result = await createProject(
      ownerKey,
      {
        name: name.trim(),
        description: description.trim(),
        snapshot: currentSnapshot,
      },
      isAuthenticated,
    );
    setSaving(false);
    toast.success(result.mode === "remote" ? "Project created on backend" : "Project created locally");
    onCreateProject(result.data);
  };

  const handleDelete = async (projectId: string) => {
    const result = await deleteProject(ownerKey, projectId, isAuthenticated);
    setMode(result.mode);
    setProjects((prev) => prev.filter((project) => project.id !== projectId));
    toast.success("Project deleted");
  };

  return (
    <div className="absolute inset-0 z-[1400] flex items-center justify-center bg-[#020617]/72 px-4 backdrop-blur-md">
      <div className="w-full max-w-4xl overflow-hidden rounded-2xl border border-white/[0.1] bg-[#071120] shadow-2xl">
        <div className="grid min-h-[420px] md:grid-cols-[1.05fr_0.95fr]">
          <section className="border-b border-white/[0.08] p-5 md:border-b-0 md:border-r">
            <div className="mb-5">
              <p className="text-[0.65rem] font-bold uppercase tracking-wide text-cyan-300">Start workspace</p>
              <h2 className="mt-2 text-xl font-semibold text-slate-50">Create a project before using the map</h2>
              <p className="mt-2 max-w-md text-sm leading-6 text-slate-400">
                The project will keep the AOI, layers, selected datasets, time range, and analysis settings together.
              </p>
            </div>

            <div className="grid gap-3">
              <label className="grid gap-1.5">
                <span className="text-[0.66rem] font-semibold uppercase text-slate-500">Project name</span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="e.g. New Cairo vegetation analysis"
                  className="h-10 rounded-lg border border-white/[0.09] bg-[#020817]/80 px-3 text-sm text-slate-100 outline-none transition focus:border-cyan-400/45"
                />
              </label>

              <label className="grid gap-1.5">
                <span className="text-[0.66rem] font-semibold uppercase text-slate-500">Description</span>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="What area or analysis is this project for?"
                  rows={4}
                  className="resize-none rounded-lg border border-white/[0.09] bg-[#020817]/80 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-cyan-400/45"
                />
              </label>

              <button
                type="button"
                onClick={handleCreate}
                disabled={!canCreate || saving}
                className={`mt-1 h-10 rounded-lg text-sm font-bold transition ${
                  canCreate && !saving
                    ? "bg-cyan-400 text-[#03101d] hover:bg-cyan-300"
                    : "cursor-not-allowed bg-cyan-400/15 text-slate-500"
                }`}
              >
                {saving ? "Creating project..." : "Start new project"}
              </button>

              <button
                type="button"
                onClick={onSkip}
                className="h-9 rounded-lg border border-white/[0.08] bg-white/[0.03] text-xs font-semibold text-slate-400 transition hover:bg-white/[0.06] hover:text-slate-200"
              >
                Continue without project
              </button>

              <p className="text-[0.68rem] leading-5 text-slate-500">
                Storage mode: <span className="font-semibold text-slate-300">{mode === "remote" ? "Backend API" : "Local fallback"}</span>
                {!isAuthenticated ? " · login is required for backend persistence" : ""}
              </p>
            </div>
          </section>

          <section className="max-h-[520px] overflow-y-auto p-5 custom-scroll">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-[0.65rem] font-bold uppercase tracking-wide text-slate-500">Load existing</p>
                <p className="mt-1 text-xs text-slate-400">Resume a saved project instead.</p>
              </div>
              <button type="button" onClick={refresh} className="text-xs font-semibold text-cyan-300 hover:text-cyan-200">
                Refresh
              </button>
            </div>

            {loading ? (
              <div className="space-y-2">
                {[0, 1, 2].map((item) => (
                  <div key={item} className="h-20 animate-pulse rounded-xl bg-white/[0.04]" />
                ))}
              </div>
            ) : projects.length === 0 ? (
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-5 text-center">
                <p className="text-sm font-semibold text-slate-300">No saved projects yet</p>
                <p className="mt-1 text-xs text-slate-500">Create your first project from the form.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {projects.map((project) => (
                  <div
                    key={project.id}
                    className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-100">{project.name}</p>
                        <p className="mt-1 line-clamp-2 text-[0.68rem] leading-4 text-slate-500">
                          {project.description || "No description"}
                        </p>
                      </div>
                      <span className="shrink-0 text-[0.56rem] text-slate-600">{formatDate(project.updatedAt)}</span>
                    </div>
                    <div className="mt-3 flex gap-2 text-[0.6rem] text-slate-500">
                      <span>{project.snapshot.aoiGeometry?.type ?? "No AOI"}</span>
                      <span>{project.snapshot.selectedLayers.length} layers</span>
                      <span>{project.snapshot.selectedDatasets.length} datasets</span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => onLoadProject(project)}
                        className="h-8 rounded-lg border border-cyan-400/20 bg-cyan-400/10 text-[0.65rem] font-bold text-cyan-200 transition hover:bg-cyan-400/15"
                      >
                        Load
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(project.id)}
                        className="h-8 rounded-lg border border-red-400/20 bg-red-400/10 text-[0.65rem] font-bold text-red-200 transition hover:bg-red-400/15"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
