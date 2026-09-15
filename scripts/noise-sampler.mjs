import { spawn } from "node:child_process";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { openDatabase, setMonitorState } from "../lib/database.mjs";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const databasePath=process.env.NOISE_DB_PATH||path.join(root,"data","noise.sqlite");
const calibrationOffset=Number(process.env.NOISE_CALIBRATION_OFFSET||0);
const threshold=Number(process.env.NOISE_ALERT_THRESHOLD||65);
const alertsEnabled=process.env.NOISE_ALERTS_ENABLED==="1";
const statePath=path.join(root,"data","alert-state.json");
const database=openDatabase(databasePath);

async function run(command,args,timeoutMs=30_000){return await new Promise((resolve,reject)=>{const child=spawn(command,args,{stdio:["ignore","pipe","pipe"]});let out="",err="",timedOut=false;const timer=setTimeout(()=>{timedOut=true;child.kill("SIGTERM");setTimeout(()=>child.kill("SIGKILL"),2_000).unref()},timeoutMs);child.stdout.on("data",d=>out+=d);child.stderr.on("data",d=>err+=d);child.on("error",error=>{clearTimeout(timer);reject(error)});child.on("close",code=>{clearTimeout(timer);if(timedOut)reject(new Error(`${path.basename(command)}_timeout`));else if(code===0)resolve(out);else reject(new Error(err.trim()||out.trim()||`${path.basename(command)}_exit_${code}`))})})}
async function capture(outputPath){return JSON.parse(await run(path.join(root,"build","NoiseCapture.app","Contents","MacOS","NoiseCapture"),["60",outputPath],90_000))}

try{
  if(!Number.isFinite(calibrationOffset)||Math.abs(calibrationOffset)>200)throw new Error("invalid_calibration_offset");
  const sampledAt=Math.floor(Date.now()/3_600_000)*3_600_000;
  const date=new Date(sampledAt),year=String(date.getFullYear()),month=String(date.getMonth()+1).padStart(2,"0");
  const audioDirectory=path.join(root,"data","audio",year,month),stem=new Date(sampledAt).toISOString().replaceAll(":","-");
  const temporaryPath=path.join(audioDirectory,`${stem}.caf`),audioPath=path.join(audioDirectory,`${stem}.m4a`);
  await mkdir(audioDirectory,{recursive:true});
  let reading;
  try{reading=await capture(temporaryPath);await run("/usr/bin/afconvert",["-f","m4af","-d","aac","-b","64000",temporaryPath,audioPath]);}finally{await rm(temporaryPath,{force:true})}
  const audioBytes=(await stat(audioPath)).size;
  const sample={id:randomUUID(),sampledAt,durationSeconds:reading.durationSeconds,laeq:reading.laeq,peak:reading.peak,floor:reading.floor,calibrationOffset,source:"macos-avfoundation",createdAt:Date.now(),audioPath:path.relative(root,audioPath),audioMime:"audio/mp4",audioBytes};
  const existing=database.prepare("SELECT audio_path FROM noise_samples WHERE sampled_at = ?").get(sampledAt);
  database.prepare(`INSERT INTO noise_samples (id,sampled_at,duration_seconds,laeq,peak,floor,calibration_offset,source,created_at,audio_path,audio_mime,audio_bytes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(sampled_at) DO UPDATE SET duration_seconds=excluded.duration_seconds,laeq=excluded.laeq,peak=excluded.peak,floor=excluded.floor,calibration_offset=excluded.calibration_offset,source=excluded.source,audio_path=excluded.audio_path,audio_mime=excluded.audio_mime,audio_bytes=excluded.audio_bytes`).run(sample.id,sample.sampledAt,sample.durationSeconds,sample.laeq,sample.peak,sample.floor,sample.calibrationOffset,sample.source,sample.createdAt,sample.audioPath,sample.audioMime,sample.audioBytes);
  if(existing?.audio_path&&existing.audio_path!==sample.audioPath)await rm(path.join(root,existing.audio_path),{force:true});
  setMonitorState(database,"last_status","ok"); setMonitorState(database,"last_sample_at",String(sampledAt));
  const displayed=sample.laeq+calibrationOffset;
  if(alertsEnabled&&calibrationOffset!==0&&displayed>=threshold){await mkdir(path.dirname(statePath),{recursive:true});let state={};try{state=JSON.parse(await readFile(statePath,"utf8"))}catch{};if(!state.lastSentAt||Date.now()-state.lastSentAt>=6*3_600_000){const message=`环境声音提醒：本地监测器在 ${new Date(sampledAt).toLocaleString("zh-CN")} 采样到估算 ${displayed.toFixed(1)} dB SPL，超过 ${threshold.toFixed(1)} dB 关注线。`;const delivery=await new Promise((resolve,reject)=>{const child=spawn("/Users/jason/.hermes/hermes-agent/venv/bin/hermes",["send","--to","weixin","--json",message],{stdio:["ignore","pipe","pipe"]});let out="",err="";child.stdout.on("data",d=>out+=d);child.stderr.on("data",d=>err+=d);child.on("close",code=>code===0?resolve(JSON.parse(out)):reject(new Error(err||out))) });if(delivery.success!==true||delivery.platform!=="weixin"||typeof delivery.chat_id!=="string"||!delivery.chat_id||typeof delivery.message_id!=="string"||!delivery.message_id||!String(delivery.note||"").includes("home channel"))throw new Error("hermes_delivery_unconfirmed");await writeFile(statePath,`${JSON.stringify({lastSentAt:Date.now(),messageId:delivery.message_id})}\n`,{mode:0o600})}}
  console.log(JSON.stringify({ok:true,sampledAt,laeq:sample.laeq,audioPath:sample.audioPath,audioBytes}));
}catch(error){const status=String(error.message||"capture_error").split("\n")[0];setMonitorState(database,"last_status",status);setMonitorState(database,"last_error_at",String(Date.now()));console.error(status);process.exitCode=1}finally{database.close()}
