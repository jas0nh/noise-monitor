import { rm } from "node:fs/promises";
import path from "node:path";

export const RECENT_AUDIO_WINDOW_MS = 24 * 60 * 60 * 1000;
export const LOUD_AUDIO_LIMIT = 5;

export async function pruneAudio(database, root, now = Date.now()) {
  const topRows = database.prepare(`SELECT id FROM noise_samples
    ORDER BY laeq DESC, sampled_at DESC LIMIT ?`).all(LOUD_AUDIO_LIMIT);
  const topIds = new Set(topRows.map((row) => row.id));
  const cutoff = now - RECENT_AUDIO_WINDOW_MS;
  const candidates = database.prepare(`SELECT id, audio_path, audio_bytes FROM noise_samples
    WHERE audio_path IS NOT NULL AND sampled_at < ?`).all(cutoff)
    .filter((row) => !topIds.has(row.id));
  const audioRoot = path.join(root, "data", "audio");
  let deletedFiles = 0, deletedBytes = 0;
  const clearAudio = database.prepare(`UPDATE noise_samples SET
    audio_path = NULL, audio_mime = NULL, audio_bytes = NULL WHERE id = ?`);
  for (const row of candidates) {
    const resolved = path.resolve(root, row.audio_path);
    if (!resolved.startsWith(`${audioRoot}${path.sep}`)) continue;
    await rm(resolved, { force: true });
    clearAudio.run(row.id);
    deletedFiles += 1;
    deletedBytes += row.audio_bytes || 0;
  }
  return { deletedFiles, deletedBytes, cutoff, retainedTopIds: [...topIds] };
}
