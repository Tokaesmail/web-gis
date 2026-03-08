// app/api/universities/route.ts
import { NextResponse } from "next/server";
import fs   from "fs";
import path from "path";

const BREAK_COLORS: Record<string, { fill: string; stroke: string }> = {
  "0-5":   { fill: "#22c55e", stroke: "#16a34a" },
  "5-10":  { fill: "#f59e0b", stroke: "#d97706" },
  "10-15": { fill: "#ef4444", stroke: "#dc2626" },
};

export async function GET() {
  try {
    // جرب المسارين المحتملين
    const paths = [
      path.join(process.cwd(), "public", "data", "universities.geojson"),
      path.join(process.cwd(), "src", "app", "api", "universities", "universities.geojson"),
      path.join(process.cwd(), "universities.geojson"),
    ];

    let raw: string | null = null;
    let usedPath = "";

    for (const p of paths) {
      if (fs.existsSync(p)) {
        raw = fs.readFileSync(p, "utf-8");
        usedPath = p;
        break;
      }
    }

    if (!raw) {
      console.error("GeoJSON file not found. Tried:", paths);
      return NextResponse.json({ error: "universities.geojson not found", tried: paths }, { status: 404 });
    }

    const geojson = JSON.parse(raw);
    console.log("Loaded from:", usedPath, "| Features:", geojson.features?.length);

    // أضف الألوان على كل feature
    geojson.features = geojson.features.map((f: any) => {
      const from  = f.properties?.FromBreak ?? 0;
      const to    = f.properties?.ToBreak   ?? 5;
      const key   = `${from}-${to}`;
      const color = BREAK_COLORS[key] ?? { fill: "#94a3b8", stroke: "#64748b" };
      return {
        ...f,
        properties: {
          ...f.properties,
          _fillColor:   color.fill,
          _strokeColor: color.stroke,
          _layerType:   "university",
        },
      };
    });

    return NextResponse.json(geojson, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err: any) {
    console.error("Universities API error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}