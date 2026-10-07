// app/api/elevation/route.ts
// ─── Elevation proxy with multi-provider fallback, retry on 429, and caching ──
// Providers (tried in order):
//   1. Open-Meteo      (up to 100 coords / request)
//   2. OpenTopoData    (SRTM 30m, up to 100 coords / request, ~1 req/sec)
//   3. Open-Elevation  (last resort — public server is often rate-limited)
//
// Request body : { locations: [{ latitude, longitude }, ...], provider?: string }
//   - provider (optional): "open-meteo" | "opentopodata" | "open-elevation".
//     When set, ONLY that source is used (no fallback). The client uses this to
//     keep a whole calculation on one DEM and to switch sources between runs.
// Response body: { results: [{ latitude, longitude, elevation | null }, ...],
//                  provider, providers }
//   - elevation is null where no data exists (ocean / outside DEM coverage);
//     the client must skip those points instead of treating them as 0 m.
//   - providers lists every data source that contributed to this response.

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

type Loc = { latitude: number; longitude: number };
type Elev = number | null;

const MAX_POINTS = 100;
const RETRIES_PER_PROVIDER = 2;

// ── tiny in-memory cache (per server instance) ───────────────────────────────
const CACHE = new Map<string, number>(); // key includes the provider
const CACHE_MAX = 50_000;
const keyOf = (provider: string, l: Loc) =>
  `${provider}|${l.latitude.toFixed(5)},${l.longitude.toFixed(5)}`;

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

class HttpError extends Error {
  status: number;
  retryAfter?: number;
  constructor(status: number, message: string, retryAfter?: number) {
    super(message);
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

// fetch with timeout + retry/backoff on 429 / 5xx
async function fetchJson(url: string, init: RequestInit = {}): Promise<any> {
  let lastErr: HttpError | null = null;

  for (let attempt = 0; attempt <= RETRIES_PER_PROVIDER; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15_000);

    try {
      const res = await fetch(url, {
        ...init,
        signal: ctrl.signal,
        cache: "no-store",
        headers: { Accept: "application/json", ...(init.headers ?? {}) },
      });
      clearTimeout(timer);

      if (res.ok) return await res.json();

      const ra = Number(res.headers.get("retry-after"));
      lastErr = new HttpError(
        res.status,
        `${new URL(url).host} returned ${res.status}`,
        Number.isFinite(ra) && ra > 0 ? ra : undefined
      );

      const retriable = res.status === 429 || res.status >= 500;
      if (!retriable || attempt === RETRIES_PER_PROVIDER) throw lastErr;

      const wait = lastErr.retryAfter
        ? Math.min(lastErr.retryAfter * 1000, 5000)
        : 800 * 2 ** attempt; // 0.8s, 1.6s
      await sleep(wait);
    } catch (e: any) {
      clearTimeout(timer);
      if (e instanceof HttpError) {
        lastErr = e;
        if (e.status !== 429 && e.status < 500) throw e;
        if (attempt === RETRIES_PER_PROVIDER) throw e;
      } else {
        // network error / timeout
        lastErr = new HttpError(504, e?.message ?? "Network error");
        if (attempt === RETRIES_PER_PROVIDER) throw lastErr;
        await sleep(800 * 2 ** attempt);
      }
    }
  }

  throw lastErr ?? new HttpError(500, "Unknown fetch error");
}

// ── providers ────────────────────────────────────────────────────────────────
async function fromOpenMeteo(locs: Loc[]): Promise<Elev[]> {
  const lat = locs.map(l => l.latitude.toFixed(6)).join(",");
  const lng = locs.map(l => l.longitude.toFixed(6)).join(",");
  const data = await fetchJson(
    `https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lng}`
  );
  const arr: any[] = data?.elevation;
  if (!Array.isArray(arr) || arr.length !== locs.length) {
    throw new HttpError(502, "Open-Meteo returned unexpected data");
  }
  return arr.map(v => (typeof v === "number" && Number.isFinite(v) ? v : null));
}

async function fromOpenTopoData(locs: Loc[]): Promise<Elev[]> {
  const q = locs.map(l => `${l.latitude.toFixed(6)},${l.longitude.toFixed(6)}`).join("|");
  const data = await fetchJson(
    `https://api.opentopodata.org/v1/srtm30m?locations=${encodeURIComponent(q)}`
  );
  const arr: any[] = data?.results;
  if (!Array.isArray(arr) || arr.length !== locs.length) {
    throw new HttpError(502, "OpenTopoData returned unexpected data");
  }
  return arr.map(r =>
    typeof r?.elevation === "number" && Number.isFinite(r.elevation) ? r.elevation : null
  );
}

async function fromOpenElevation(locs: Loc[]): Promise<Elev[]> {
  const data = await fetchJson("https://api.open-elevation.com/api/v1/lookup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ locations: locs }),
  });
  const arr: any[] = data?.results;
  if (!Array.isArray(arr) || arr.length !== locs.length) {
    throw new HttpError(502, "Open-Elevation returned unexpected data");
  }
  return arr.map(r =>
    typeof r?.elevation === "number" && Number.isFinite(r.elevation) ? r.elevation : null
  );
}

const PROVIDERS: { name: string; fn: (l: Loc[]) => Promise<Elev[]> }[] = [
  { name: "open-meteo", fn: fromOpenMeteo },
  { name: "opentopodata", fn: fromOpenTopoData },
  { name: "open-elevation", fn: fromOpenElevation },
];

// ── handler ──────────────────────────────────────────────────────────────────

// Fetch one provider for the whole batch, using its cached values where we have them.
async function runProvider(
  p: { name: string; fn: (l: Loc[]) => Promise<Elev[]> },
  locs: Loc[],
): Promise<Elev[]> {
  const out: Elev[] = locs.map(l => CACHE.get(keyOf(p.name, l)) ?? null);
  const missingIdx = out.map((v, i) => (v === null ? i : -1)).filter(i => i >= 0);

  if (missingIdx.length) {
    const fetched = await p.fn(missingIdx.map(i => locs[i]));
    fetched.forEach((v, k) => {
      const idx = missingIdx[k];
      out[idx] = v;
      if (v !== null) {
        if (CACHE.size >= CACHE_MAX) CACHE.clear();
        CACHE.set(keyOf(p.name, locs[idx]), v);
      }
    });
  }
  return out;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const raw: any[] = Array.isArray(body?.locations) ? body.locations : [];

    const locs: Loc[] = raw
      .map(l => ({
        latitude: typeof l?.latitude === "number" || typeof l?.latitude === "string" ? Number(l.latitude) : NaN,
        longitude: typeof l?.longitude === "number" || typeof l?.longitude === "string" ? Number(l.longitude) : NaN,
      }))
      .filter(
        l =>
          Number.isFinite(l.latitude) && Number.isFinite(l.longitude) &&
          Math.abs(l.latitude) <= 90 && Math.abs(l.longitude) <= 180
      );

    if (!locs.length || locs.length !== raw.length) {
      return NextResponse.json(
        { error: "Body must be { locations: [{ latitude, longitude }, ...] } with valid numbers" },
        { status: 400 }
      );
    }
    if (locs.length > MAX_POINTS) {
      return NextResponse.json(
        { error: `Too many points (${locs.length}). Max ${MAX_POINTS} per request.` },
        { status: 400 }
      );
    }

    // forced provider → no fallback; otherwise try them in order
    const forced = typeof body?.provider === "string" ? body.provider : null;
    let list = PROVIDERS;
    if (forced) {
      list = PROVIDERS.filter(p => p.name === forced);
      if (!list.length) {
        return NextResponse.json({ error: `Unknown provider "${forced}"` }, { status: 400 });
      }
    }

    let lastErr: HttpError | null = null;

    for (const p of list) {
      try {
        const out = await runProvider(p, locs);
        return NextResponse.json({
          provider: p.name,
          providers: [p.name],
          results: locs.map((l, i) => ({
            latitude: l.latitude,
            longitude: l.longitude,
            elevation: out[i], // null = no data
          })),
        });
      } catch (e: any) {
        lastErr = e instanceof HttpError ? e : new HttpError(500, e?.message ?? "Provider error");
        console.warn(`[elevation] ${p.name} failed: ${lastErr.message}`);
      }
    }

    const status = lastErr?.status === 429 ? 429 : 502;
    return NextResponse.json(
      { error: `Elevation provider failed: ${lastErr?.message ?? "unknown"}` },
      {
        status,
        headers: status === 429 ? { "Retry-After": String(lastErr?.retryAfter ?? 5) } : undefined,
      }
    );
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Proxy error" }, { status: 500 });
  }
}