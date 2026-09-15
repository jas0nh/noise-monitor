import { decibelAverage, displayLevel, isCalibrated } from "/noise-metrics.js";

let selectedRange = "24h";
let liveAbort=null,liveContext=null,liveNextTime=0;
const $ = (id) => document.getElementById(id);
const format = (value, unit) => Number.isFinite(value) ? `${value.toFixed(1)} ${unit}` : "—";
const localDay = (time) => new Date(time).toLocaleDateString("sv-SE");

function aggregate(samples, range) {
  if (range === "24h") return samples.map((s) => ({ time:s.sampledAt,value:displayLevel(s,"laeq"),low:displayLevel(s,"floor"),high:displayLevel(s,"peak") }));
  const groups = Map.groupBy(samples, (sample) => localDay(sample.sampledAt));
  return [...groups].map(([day, items]) => ({
    time: new Date(`${day}T12:00:00`).getTime(),
    value: decibelAverage(items.map((s) => displayLevel(s,"laeq"))),
    low: Math.min(...items.map((s) => displayLevel(s,"floor"))),
    high: Math.max(...items.map((s) => displayLevel(s,"peak"))),
  }));
}

function drawChart(samples, range, unit) {
  const points = aggregate(samples, range);
  if (!points.length) { $("chart").innerHTML='<div class="empty"><div><strong>还没有声音样本</strong><span>本地服务已就绪，连接音频输入后会从这里开始绘制。</span></div></div>'; return; }
  const w=1000,h=330,p={l:42,r:24,t:24,b:28};
  const min=Math.floor(Math.min(...points.map((x)=>x.low),unit==="dBFS"?-80:30)/5)*5;
  const max=Math.ceil(Math.max(...points.map((x)=>x.high),unit==="dBFS"?0:80)/5)*5;
  const x=(i)=>p.l+i/Math.max(1,points.length-1)*(w-p.l-p.r);
  const y=(v)=>h-p.b-(v-min)/Math.max(1,max-min)*(h-p.t-p.b);
  const grid=[0,.25,.5,.75,1].map((r)=>{const v=min+(max-min)*r;return `<g><line x1="${p.l}" x2="${w-p.r}" y1="${y(v)}" y2="${y(v)}" stroke="#e8ded4"/><text x="0" y="${y(v)+4}" fill="#9b8c80" font-size="12">${Math.round(v)}</text></g>`}).join("");
  const ranges=range==="7d"?points.map((q,i)=>`<line x1="${x(i)}" x2="${x(i)}" y1="${y(q.low)}" y2="${y(q.high)}" stroke="#dfac7c" stroke-width="7" stroke-linecap="round" opacity=".7"/>`).join(""):"";
  const line=points.map((q,i)=>`${x(i)},${y(q.value)}`).join(" ");
  const dots=points.map((q,i)=>`<circle cx="${x(i)}" cy="${y(q.value)}" r="4.5" fill="#fffdf9" stroke="#b8683c" stroke-width="3"/>`).join("");
  $("chart").innerHTML=`<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="环境声音趋势图，单位 ${unit}">${grid}${ranges}<polyline points="${line}" fill="none" stroke="#b8683c" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>${dots}</svg>`;
}

function monitorMessage(monitor) {
  const state=monitor.last_status?.value;
  if (state==="ok") return ["ok","采集器正常"];
  if (state==="no_microphone_input") return ["error","未检测到麦克风输入"];
  if (state) return ["error",`采集异常：${state}`];
  return ["","等待采集器首次运行"];
}

function renderRecordings(samples) {
  const recordings=samples.filter((sample)=>sample.audioUrl).slice(-24).reverse();
  if(!recordings.length){$("recordingList").innerHTML='<p class="recording-empty">等待第一段录音</p>';return;}
  $("recordingList").innerHTML=recordings.map((sample)=>`<article class="recording-item"><div><strong>${new Date(sample.sampledAt).toLocaleString("zh-CN")}</strong><span>${Math.round((sample.audioBytes||0)/1024)} KB · ${Math.round(sample.durationSeconds)} 秒</span></div><audio controls preload="none" src="${sample.audioUrl}">浏览器不支持音频播放。</audio></article>`).join("");
}

function setLiveUi(active,status) {
  $("liveToggle").classList.toggle("active",active);
  $("liveToggle").textContent=active?"停止监听":"开始监听";
  $("liveStatus").textContent=status;
  if(!active){$("liveLevel").textContent="—";$("liveBar").style.width="0";}
}

async function startLiveMonitor() {
  liveAbort=new AbortController();
  liveContext=new AudioContext({latencyHint:"interactive"});
  await liveContext.resume();liveNextTime=liveContext.currentTime+.08;
  setLiveUi(true,"正在连接实时音频…");
  try{
    const response=await fetch("/api/live",{signal:liveAbort.signal,cache:"no-store"});
    if(!response.ok){const error=await response.json().catch(()=>({}));throw new Error(error.error||`HTTP ${response.status}`);}
    const reader=response.body.getReader();let pending=new Uint8Array(),sampleRate=null;
    setLiveUi(true,"监听中 · 关闭后不会保留这段实时音频");
    while(true){const {done,value}=await reader.read();if(done)break;const merged=new Uint8Array(pending.length+value.length);merged.set(pending);merged.set(value,pending.length);pending=merged;
      if(sampleRate===null){if(pending.length<8)continue;if(new TextDecoder().decode(pending.slice(0,4))!=="NMON")throw new Error("invalid_audio_stream");sampleRate=new DataView(pending.buffer,pending.byteOffset+4,4).getUint32(0,true);pending=pending.slice(8);}
      const byteLength=pending.length-pending.length%4;if(!byteLength)continue;const view=new DataView(pending.buffer,pending.byteOffset,byteLength),samples=new Float32Array(byteLength/4);let energy=0;
      for(let i=0;i<samples.length;i++){const value=view.getFloat32(i*4,true);samples[i]=value;energy+=value*value;}
      pending=pending.slice(byteLength);const db=20*Math.log10(Math.max(Math.sqrt(energy/samples.length),.000001));$("liveLevel").textContent=db.toFixed(1);$("liveBar").style.width=`${Math.max(0,Math.min(100,(db+80)/.8))}%`;
      const buffer=liveContext.createBuffer(1,samples.length,sampleRate);buffer.copyToChannel(samples,0);const source=liveContext.createBufferSource();source.buffer=buffer;source.connect(liveContext.destination);liveNextTime=Math.max(liveNextTime,liveContext.currentTime+.04);source.start(liveNextTime);liveNextTime+=buffer.duration;
    }
  }catch(error){if(error.name!=="AbortError")setLiveUi(false,error.message==="live_monitor_busy"?"已有其他浏览器正在监听":"监听失败，请重试");}
  finally{if(liveAbort){liveAbort=null;if(liveContext){await liveContext.close().catch(()=>{});liveContext=null;}if($("liveToggle").classList.contains("active"))setLiveUi(false,"实时监听已结束");}}
}

function stopLiveMonitor(){if(liveAbort){liveAbort.abort();liveAbort=null;}if(liveContext){liveContext.close().catch(()=>{});liveContext=null;}setLiveUi(false,"当前未连接");}

async function refresh() {
  try {
    const response=await fetch(`/api/noise?range=${selectedRange}`,{cache:"no-store"});
    if(!response.ok) throw new Error(`HTTP ${response.status}`);
    const data=await response.json();
    const latest=data.latest;
    const calibrated=latest&&isCalibrated(latest.calibrationOffset);
    const unit=calibrated?"dB SPL":"dBFS";
    const latestValue=latest?displayLevel(latest,"laeq"):null;
    const average=decibelAverage(data.samples.map((s)=>displayLevel(s,"laeq")));
    $("latestValue").textContent=Number.isFinite(latestValue)?latestValue.toFixed(1):"—";
    $("latestUnit").textContent=unit;
    $("latestTime").textContent=latest?new Date(latest.sampledAt).toLocaleString("zh-CN"):"等待采集器写入数据";
    $("peakValue").textContent=latest?format(displayLevel(latest,"peak"),unit):"—";
    $("averageValue").textContent=format(average,unit);
    $("sourceValue").textContent=latest?.source||"未连接";
    $("measurementTitle").textContent=calibrated?"已校准 · 估算 dB SPL":"未校准 · 相对声级 dBFS";
    $("measurementBody").textContent=calibrated?`当前应用 ${latest.calibrationOffset>0?"+":""}${latest.calibrationOffset.toFixed(1)} dB 校准偏移；用于家庭趋势观察，不替代专业声级计。`:"当前数据只用于比较同一设备、同一位置的相对变化；未校准时不会触发绝对声压阈值告警。";
    const [statusClass,statusText]=monitorMessage(data.monitor); $("statusDot").className=statusClass; $("serviceState").textContent=statusText;
    drawChart(data.samples,selectedRange,unit);
    renderRecordings(data.samples);
    $("sampleCount").textContent=`${data.samples.length} 条样本 · ${unit}`;
    $("rangeStart").textContent=data.samples.length?new Date(data.samples[0].sampledAt).toLocaleDateString("zh-CN"):"暂无数据";
    $("rangeEnd").textContent=data.samples.length?new Date(data.samples.at(-1).sampledAt).toLocaleDateString("zh-CN"):"—";
  } catch(error) { $("statusDot").className="error"; $("serviceState").textContent="本地服务不可用"; $("chart").innerHTML=`<div class="empty"><div><strong>无法读取数据</strong><span>${error.message}</span></div></div>`; }
}

document.querySelectorAll("[data-range]").forEach((button)=>button.addEventListener("click",()=>{selectedRange=button.dataset.range;document.querySelectorAll("[data-range]").forEach((item)=>item.classList.toggle("active",item===button));refresh()}));
$("liveToggle").addEventListener("click",()=>liveAbort?stopLiveMonitor():startLiveMonitor());
window.addEventListener("pagehide",stopLiveMonitor);
refresh(); setInterval(refresh,60_000);
