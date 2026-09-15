import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export function openDatabase(databasePath) {
  mkdirSync(path.dirname(databasePath), { recursive: true });
  const database = new DatabaseSync(databasePath);
  database.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS noise_samples (
      id TEXT PRIMARY KEY,
      sampled_at INTEGER NOT NULL UNIQUE,
      duration_seconds REAL NOT NULL,
      laeq REAL NOT NULL,
      peak REAL NOT NULL,
      floor REAL NOT NULL,
      calibration_offset REAL NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'macos-avfoundation',
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS noise_samples_sampled_at
      ON noise_samples(sampled_at DESC);
    CREATE TABLE IF NOT EXISTS monitor_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  const columns = new Set(database.prepare("PRAGMA table_info(noise_samples)").all().map((row) => row.name));
  if (!columns.has("audio_path")) database.exec("ALTER TABLE noise_samples ADD COLUMN audio_path TEXT");
  if (!columns.has("audio_mime")) database.exec("ALTER TABLE noise_samples ADD COLUMN audio_mime TEXT");
  if (!columns.has("audio_bytes")) database.exec("ALTER TABLE noise_samples ADD COLUMN audio_bytes INTEGER");
  return database;
}

export function setMonitorState(database, key, value, updatedAt = Date.now()) {
  database.prepare(`INSERT INTO monitor_state (key, value, updated_at)
    VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET
    value=excluded.value, updated_at=excluded.updated_at`).run(key, value, updatedAt);
}

export function getMonitorState(database) {
  return Object.fromEntries(
    database.prepare("SELECT key, value, updated_at FROM monitor_state").all()
      .map((row) => [row.key, { value: row.value, updatedAt: row.updated_at }]),
  );
}
