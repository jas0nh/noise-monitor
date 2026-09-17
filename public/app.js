import { decibelAverage, displayLevel, isCalibrated } from "/noise-metrics.js";

let selectedRange = "24h";
let liveAbort=null,liveContext=null,liveNextTime=0;
const $ = (id) => document.getElementById(id);
const format = (value, unit) => Number.isFinite(value) ? `${value.toFixed(1)} ${unit}` : "—";
const localDay = (time) => new Date(time).toLocaleDateString("sv-SE");

function aggregate(samples, range) {
  if (range === "24h") return samples.map((s) => ({ time:s.sampledAt,value:displayLevel(s,"laeq"),low:displayLevel(s,"floor"),high:displayLevel(s,"peak"),count:1 }));
  const groups = Map.groupBy(samples, (sample) => localDay(sample.sampledAt));
  return [...groups].map(([, items]) => ({
    time: items.reduce((total,item)=>total+item.sampledAt,0)/items.length,
    value: decibelAverage(items.map((s) => displayLevel(s,"laeq"))),
    low: Math.min(...items.map((s) => displayLevel(s,"floor"))),
    high: Math.max(...items.map((s) => displayLevel(s,"peak"))),
    count: items.length,
  }));
}

function niceScale(points, unit) {
  const values=points.map((point)=>point.value).filter(Number.isFinite);
  let low=Math.min(...values),high=Math.max(...values);
  const minimumSpan=20,center=(low+high)/2;
  if(high-low<minimumSpan){low=center-minimumSpan/2;high=center+minimumSpan/2;}
  low-=3;high+=3;
  if(unit==="dBFS"){low=Math.max(-100,low);high=Math.min(0,high);}
  const rawStep=(high-low)/4;
  const step=[2,5,10,20,25].find((candidate)=>candidate>=rawStep)||50;
  return {min:Math.floor(low/step)*step,max:Math.ceil(high/step)*step,step};
}

function timeDomain(range,now) {
  const duration=range==="24h"?86_400_000:range==="7d"?7*86_400_000:30*86_400_000;
  const end=new Date(now);
  if(range==="24h"){
    end.setMinutes(0,0,0);
    end.setHours(end.getHours()+1);
  }else end.setHours(24,0,0,0);
  return [end.getTime()-duration,end.getTime()];
}

function timeTicks(range,start,end) {
  const count=range==="7d"?7:6;
  return Array.from({length:count+1},(_,index)=>start+(end-start)*index/count);
}

function tickLines(time,range,index,ticks) {
  const date=new Date(time);
  if(range==="24h"){
    const hour=date.toLocaleTimeString("zh-CN",{hour:"2-digit",minute:"2-digit",hour12:false});
    const previous=index>0?new Date(ticks[index-1]):null;
    const changedDay=previous&&localDay(previous.getTime())!==localDay(time);
    return index===0||index===ticks.length-1||changedDay?[`${date.getMonth()+1}/${date.getDate()}`,hour]:[hour];
  }
  return [`${date.getMonth()+1}/${date.getDate()}`];
}

function drawChart(samples, range, unit, generatedAt=Date.now()) {
  const points = aggregate(samples, range);
  if (!points.length) { $("chart").innerHTML='<div class="empty"><div><strong>还没有声音样本</strong><span>本地服务已就绪，连接音频输入后会从这里开始绘制。</span></div></div>'; return; }
  const w=1000,h=390,p={l:68,r:34,t:28,b:58};
  const {min,max,step}=niceScale(points,unit),[start,end]=timeDomain(range,generatedAt);
  const x=(time)=>p.l+(time-start)/(end-start)*(w-p.l-p.r);
  const y=(v)=>h-p.b-(v-min)/Math.max(1,max-min)*(h-p.t-p.b);
  const yTicks=[];for(let value=min;value<=max+.001;value+=step)yTicks.push(value);
  const horizontalGrid=yTicks.map((value)=>`<g><line class="grid-line" x1="${p.l}" x2="${w-p.r}" y1="${y(value)}" y2="${y(value)}"/><text class="axis-label y-label" x="${p.l-12}" y="${y(value)+4}">${value}</text></g>`).join("");
  const ticks=timeTicks(range,start,end);
  const verticalGrid=ticks.map((time,index)=>{const lines=tickLines(time,range,index,ticks),anchor=index===0?"start":index===ticks.length-1?"end":"middle";return `<g><line class="time-guide" x1="${x(time)}" x2="${x(time)}" y1="${p.t}" y2="${h-p.b}"/><text class="axis-label x-label" text-anchor="${anchor}" x="${x(time)}" y="${h-p.b+24}">${lines.map((line,lineIndex)=>`<tspan x="${x(time)}" dy="${lineIndex?15:0}">${line}</tspan>`).join("")}</text></g>`}).join("");
  const cadence=range==="24h"?3_600_000:86_400_000;
  let pathData="",previous=null;points.forEach((point)=>{const command=!previous||point.time-previous.time>cadence*2.5?"M":"L";pathData+=`${command}${x(point.time).toFixed(1)},${y(point.value).toFixed(1)} `;previous=point;});
  const ranges=points.map((point)=>`<line class="range-mark" x1="${x(point.time)}" x2="${x(point.time)}" y1="${y(Math.max(min,point.low))}" y2="${y(Math.min(max,point.high))}"/>`).join("");
  const dots=points.map((point,index)=>`<g class="chart-point" tabindex="0" data-index="${index}" aria-label="${new Date(point.time).toLocaleString("zh-CN")}，平均 ${point.value.toFixed(1)} ${unit}"><circle class="point-hit" cx="${x(point.time)}" cy="${y(point.value)}" r="14"/><circle class="point-dot" cx="${x(point.time)}" cy="${y(point.value)}" r="4.5"/></g>`).join("");
  const latest=points.at(-1),latestLabel=`<text class="latest-label" x="${Math.min(w-p.r-4,x(latest.time)+11)}" y="${Math.max(p.t+12,y(latest.value)-10)}">${latest.value.toFixed(1)}</text>`;
  $("chart").innerHTML=`<div id="chartTooltip" class="chart-tooltip" hidden></div><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="环境声音趋势图，横轴为时间，纵轴单位 ${unit}">${horizontalGrid}${verticalGrid}<line class="axis-line" x1="${p.l}" x2="${p.l}" y1="${p.t}" y2="${h-p.b}"/><line class="axis-line" x1="${p.l}" x2="${w-p.r}" y1="${h-p.b}" y2="${h-p.b}"/><text class="axis-title" transform="translate(17 ${h/2}) rotate(-90)">声音水平 · ${unit}</text>${ranges}<path class="trend-line" d="${pathData.trim()}"/>${dots}${latestLabel}</svg>`;
  const tooltip=$("chartTooltip");
  const showTooltip=(index,target)=>{const point=points[index],date=new Date(point.time),rect=target.getBoundingClientRect(),chartRect=$("chart").getBoundingClientRect();tooltip.innerHTML=`<strong>${range==="24h"?date.toLocaleString("zh-CN"):date.toLocaleDateString("zh-CN")}</strong><span>平均 ${point.value.toFixed(1)} ${unit}</span><span>范围 ${point.low.toFixed(1)}–${point.high.toFixed(1)} ${unit}${point.count>1?` · ${point.count} 条样本`:""}</span>`;tooltip.hidden=false;tooltip.style.left=`${Math.min(chartRect.width-190,Math.max(8,rect.left-chartRect.left-70))}px`;tooltip.style.top=`${Math.max(4,rect.top-chartRect.top-84)}px`;};
  $("chart").querySelectorAll(".chart-point").forEach((target)=>{target.addEventListener("pointerenter",()=>showTooltip(Number(target.dataset.index),target));target.addEventListener("focus",()=>showTooltip(Number(target.dataset.index),target));target.addEventListener("pointerleave",()=>tooltip.hidden=true);target.addEventListener("blur",()=>tooltip.hidden=true);});
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
    drawChart(data.samples,selectedRange,unit,data.generatedAt);
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
