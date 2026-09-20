import assert from "node:assert/strict";
import { mkdtemp, mkdir, stat, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pruneAudio, RECENT_AUDIO_WINDOW_MS } from "../lib/audio-retention.mjs";
import { openDatabase } from "../lib/database.mjs";

test("keeps the loudest five recordings plus every recording from the last 24 hours",async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),"noise-retention-"));
  const audioDirectory=path.join(root,"data","audio","2026","09");
  await mkdir(audioDirectory,{recursive:true});
  const database=openDatabase(path.join(root,"data","noise.sqlite"));
  const now=Date.UTC(2026,8,21,12);
  const insert=database.prepare(`INSERT INTO noise_samples
    (id,sampled_at,duration_seconds,laeq,peak,floor,calibration_offset,source,created_at,audio_path,audio_mime,audio_bytes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
  for(let index=0;index<7;index++){
    const relative=`data/audio/2026/09/old-${index}.m4a`;
    await writeFile(path.join(root,relative),Buffer.alloc(10));
    insert.run(`old-${index}`,now-RECENT_AUDIO_WINDOW_MS-3_600_000-index,60,-10-index*10,-5,-80,0,"test",now,relative,"audio/mp4",10);
  }
  const recentPath="data/audio/2026/09/recent.m4a";
  await writeFile(path.join(root,recentPath),Buffer.alloc(10));
  insert.run("recent",now-1_000,60,-90,-80,-100,0,"test",now,recentPath,"audio/mp4",10);
  const result=await pruneAudio(database,root,now);
  assert.equal(result.deletedFiles,2);
  assert.equal(database.prepare("SELECT count(*) AS count FROM noise_samples WHERE audio_path IS NOT NULL").get().count,6);
  assert.equal((await stat(path.join(root,recentPath))).size,10);
  assert.deepEqual(database.prepare("SELECT id FROM noise_samples WHERE audio_path IS NOT NULL ORDER BY id").all().map((row)=>row.id),["old-0","old-1","old-2","old-3","old-4","recent"]);
  database.close();
  await rm(root,{recursive:true,force:true});
});
