import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
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

async function capture(){return await new Promise((resolve,reject)=>{const child=spawn(path.join(root,"scripts",".noise-capture"),["60"],{stdio:["ignore","pipe","pipe"]});let out="",err="";child.stdout.on("data",d=>out+=d);child.stderr.on("data",d=>err+=d);child.on("error",reject);child.on("close",code=>code===0?resolve(JSON.parse(out)):reject(new Error(err.trim()||`capture_exit_${code}`)))})}

try{
  if(!Number.isFinite(calibrationOffset)||Math.abs(calibrationOffset)>200)throw new Error("invalid_calibration_offset");
  const reading=await capture(); const sampledAt=Math.floor(Date.now()/3_600_000)*3_600_000;
  const sample={id:randomUUID(),sampledAt,durationSeconds:reading.durationSeconds,laeq:reading.laeq,peak:reading.peak,floor:reading.floor,calibrationOffset,source:"macos-avfoundation",createdAt:Date.now()};
  database.prepare(`INSERT INTO noise_samples (id,sampled_at,duration_seconds,laeq,peak,floor,calibration_offset,source,created_at) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(sampled_at) DO UPDATE SET duration_seconds=excluded.duration_seconds,laeq=excluded.laeq,peak=excluded.peak,floor=excluded.floor,calibration_offset=excluded.calibration_offset,source=excluded.source`).run(sample.id,sample.sampledAt,sample.durationSeconds,sample.laeq,sample.peak,sample.floor,sample.calibrationOffset,sample.source,sample.createdAt);
  setMonitorState(database,"last_status","ok"); setMonitorState(database,"last_sample_at",String(sampledAt));
  const displayed=sample.laeq+calibrationOffset;
  if(alertsEnabled&&calibrationOffset!==0&&displayed>=threshold){await mkdir(path.dirname(statePath),{recursive:true});let state={};try{state=JSON.parse(await readFile(statePath,"utf8"))}catch{};if(!state.lastSentAt||Date.now()-state.lastSentAt>=6*3_600_000){const message=`环境声音提醒：本地监测器在 ${new Date(sampledAt).toLocaleString("zh-CN")} 采样到估算 ${displayed.toFixed(1)} dB SPL，超过 ${threshold.toFixed(1)} dB 关注线。`;const delivery=await new Promise((resolve,reject)=>{const child=spawn("/Users/jason/.hermes/hermes-agent/venv/bin/hermes",["send","--to","weixin","--json",message],{stdio:["ignore","pipe","pipe"]});let out="",err="";child.stdout.on("data",d=>out+=d);child.stderr.on("data",d=>err+=d);child.on("close",code=>code===0?resolve(JSON.parse(out)):reject(new Error(err||out))) });if(delivery.success!==true||delivery.platform!=="weixin"||typeof delivery.chat_id!=="string"||!delivery.chat_id||typeof delivery.message_id!=="string"||!delivery.message_id||!String(delivery.note||"").includes("home channel"))throw new Error("hermes_delivery_unconfirmed");await writeFile(statePath,`${JSON.stringify({lastSentAt:Date.now(),messageId:delivery.message_id})}\n`,{mode:0o600})}}
  console.log(JSON.stringify({ok:true,sampledAt,laeq:sample.laeq}));
}catch(error){const status=String(error.message||"capture_error").split("\n")[0];setMonitorState(database,"last_status",status);setMonitorState(database,"last_error_at",String(Date.now()));console.error(status);process.exitCode=1}finally{database.close()}
