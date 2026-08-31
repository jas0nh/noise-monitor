import { createReadStream, existsSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getMonitorState, openDatabase } from "./lib/database.mjs";
import { rangeStart, RANGES } from "./lib/noise-metrics.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const publicRoot = path.join(root, "public");
const databasePath = process.env.NOISE_DB_PATH || path.join(root, "data", "noise.sqlite");
const host = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT || 17302);
const database = openDatabase(databasePath);

const mime = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".svg", "image/svg+xml"],
]);

function json(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(body));
}

function noiseSnapshot(range) {
  const selectedRange = Object.hasOwn(RANGES, range) ? range : "24h";
  const now = Date.now();
  const rows = database.prepare(`SELECT id, sampled_at, duration_seconds,
    laeq, peak, floor, calibration_offset, source
    FROM noise_samples WHERE sampled_at >= ? ORDER BY sampled_at ASC`)
    .all(rangeStart(selectedRange, now));
  const samples = rows.map((row) => ({
    id: row.id,
    sampledAt: row.sampled_at,
    durationSeconds: row.duration_seconds,
    laeq: row.laeq,
    peak: row.peak,
    floor: row.floor,
    calibrationOffset: row.calibration_offset,
    source: row.source,
  }));
  return {
    range: selectedRange,
    generatedAt: now,
    latest: samples.at(-1) ?? database.prepare(`SELECT id, sampled_at AS sampledAt,
      duration_seconds AS durationSeconds, laeq, peak, floor,
      calibration_offset AS calibrationOffset, source
      FROM noise_samples ORDER BY sampled_at DESC LIMIT 1`).get() ?? null,
    samples,
    monitor: getMonitorState(database),
  };
}

const server = createServer((request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" }); response.end(); return;
  }
  if (url.pathname === "/api/health") {
    json(response, 200, { ok: true, service: "noise-monitor", monitor: getMonitorState(database) }); return;
  }
  if (url.pathname === "/api/noise") {
    json(response, 200, noiseSnapshot(url.searchParams.get("range") || "24h")); return;
  }

  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const resolved = path.resolve(publicRoot, `.${pathname}`);
  if (!resolved.startsWith(`${publicRoot}${path.sep}`) || !existsSync(resolved)) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }); response.end("Not found"); return;
  }
  response.writeHead(200, {
    "Content-Type": mime.get(path.extname(resolved)) || "application/octet-stream",
    "Cache-Control": pathname === "/index.html" ? "no-cache" : "public, max-age=3600",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  });
  if (request.method === "HEAD") response.end(); else createReadStream(resolved).pipe(response);
});

server.listen(port, host, () => {
  console.log(`Noise Monitor listening on http://${host}:${port}`);
  console.log(`SQLite: ${databasePath}`);
});

const shutdown = () => server.close(() => { database.close(); process.exit(0); });
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
