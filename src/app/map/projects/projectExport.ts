// ─── projectExport.ts ─────────────────────────────────────────────────────────
// Export / Import لمشروع كامل كملف .geosense (JSON مضغوط gzip) على جهاز اليوزر.
// ده النسخة الاحتياطية لو المتصفح مسح الـ IndexedDB، وبينقل المشروع بين الأجهزة.
import { analysesGetAll, analysesPutMany } from "./leafletStore";
import type { UserProject } from "./projectTypes";

const MAGIC = "geosense-project";

async function gzip(text: string): Promise<Blob> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Response(stream).blob();
}

async function gunzip(file: Blob): Promise<string> {
  const head = new Uint8Array(await file.slice(0, 2).arrayBuffer());
  const isGzip = head[0] === 0x1f && head[1] === 0x8b;
  if (!isGzip) return file.text();
  const stream = file.stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}

/** ينزّل ملف <اسم المشروع>.geosense فيه المشروع + تحليلات أشكاله */
export async function exportProjectFile(project: UserProject): Promise<void> {
  // snapshot كامل (بالصور) — المُستدعي بيبعت الحالة الحالية من الذاكرة
  const snapshot: any = project.snapshot;
  const ids = new Set<string>(
    (snapshot?.drawnFeatures ?? [])
      .map((f: any) => f?.properties?.id)
      .filter(Boolean)
      .map(String),
  );
  const all = await analysesGetAll();
  const analyses: Record<string, any> = {};
  for (const [owner, rec] of Object.entries(all)) {
    if (ids.has(owner)) analyses[owner] = rec;
  }

  const payload = {
    magic: MAGIC,
    version: 1,
    exportedAt: new Date().toISOString(),
    project: { ...project, snapshot },
    analyses,
  };
  const blob = await gzip(JSON.stringify(payload));
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(project.name || "project").replace(/[\\/:*?"<>|]+/g, "_")}.geosense`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** يقرا ملف .geosense، يرجّع تحليلاته للـ IndexedDB، ويرجّع المشروع للمُستدعي يسجّله (createProject) */
export async function importProjectFile(file: File): Promise<UserProject> {
  const data = JSON.parse(await gunzip(file));
  if (data?.magic !== MAGIC || !data?.project) {
    throw new Error("Invalid .geosense file");
  }
  if (data.analyses && Object.keys(data.analyses).length) {
    await analysesPutMany(data.analyses);
  }
  return data.project as UserProject;
}