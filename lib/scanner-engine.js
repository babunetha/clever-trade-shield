import { config } from "hatchable";

const MASTER_URL="https://images.dhan.co/api-data/api-scrip-master.csv";
const QUOTE_URL="https://api.dhan.co/v2/marketfeed/quote";
const HIST_URL="https://api.dhan.co/v2/charts/intraday";
const DAILY_URL="https://api.dhan.co/v2/charts/historical";
const MAX_CANDIDATES=80;
const QUOTE_BATCH_SIZE=500;
const HIST_CONCURRENCY=5;
const RETRYABLE_STATUS=new Set([408,425,429,500,502,503,504]);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function dhanFetch(url,opts={},attempts=3){
  let last=null;
  for(let attempt=0;attempt<attempts;attempt++){
    try{
      const r=await fetch(url,opts);
      if(r.ok||!RETRYABLE_STATUS.has(r.status)||attempt===attempts-1)return r;
      last=r;
    }catch(e){last=e}
    await sleep(350*(2**attempt)+Math.floor(Math.random()*150));
  }
  if(last&&typeof last.status==="number")return last;
  throw last||Error("Dhan request failed");
}

const n=(v,d=null)=>Number.isFinite(Number(v))?Number(v):d;
const avg=a=>a.length?a.reduce((x,y)=>x+n(y,0),0)/a.length:null;
function round(v,p=3){const k=10**p;return Math.round(v*k)/k}
function ema(a,p){if(a.length<p)return null;const k=2/(p+1);let e=avg(a.slice(0,p));for(let i=p;i<a.length;i++)e=a[i]*k+e*(1-k);return e}
function sma(a,p){return a.length<p?null:avg(a.slice(-p))}
function rsi(a,p=14){if(a.length<=p)return null;let g=0,l=0;for(let i=a.length-p;i<a.length;i++){const d=a[i]-a[i-1];if(d>0)g+=d;else l-=d}return l===0?100:100-100/(1+g/l)}
function macd(a){const e12=ema(a,12),e26=ema(a,26);return e12==null||e26==null?null:e12-e26}
function atr(h,l,c,p=14){if(c.length<=p)return null;let s=0;for(let i=c.length-p;i<c.length;i++)s+=Math.max(h[i]-l[i],Math.abs(h[i]-c[i-1]),Math.abs(l[i]-c[i-1]));return s/p}
function researchBacktest(d,{stopAtr=1.2,maxHold=10,slippageBps=5,feeBpsPerSide=3,stampBps=0}={}){
 const c=(d.close||[]).map(Number),h=(d.high||[]).map(Number),l=(d.low||[]).map(Number),v=(d.volume||[]).map(Number),trades=[];
 const slip=slippageBps/10000,fee=feeBpsPerSide/10000,stamp=stampBps/10000;
 for(let i=30;i<c.length-1;){const e10=ema(c.slice(0,i+1),10),e30=ema(c.slice(0,i+1),30),r=rsi(c.slice(0,i+1)),rv=(v[i]||0)/(avg(v.slice(Math.max(0,i-20),i))||1),a=atr(h.slice(0,i+1),l.slice(0,i+1),c.slice(0,i+1));
  if(e10==null||e30==null||r==null||a==null||!(e10>e30&&r>=45&&r<=75&&rv>=1.2&&c[i]>c[i-1])){i++;continue}
  const rawEntry=c[i],risk=Math.max(.05,a*stopAtr),stop=rawEntry-risk;
  const priorHigh20=Math.max(...h.slice(Math.max(0,i-20),i)),priorHigh60=Math.max(...h.slice(Math.max(0,i-60),i)),support=Math.min(...l.slice(Math.max(0,i-20),i));
  const measuredMove=rawEntry+Math.max(0,priorHigh20-support),atrTarget=rawEntry+a*2;
  const targetCandidates=[priorHigh20,priorHigh60,measuredMove,atrTarget].filter(x=>Number.isFinite(x)&&x>rawEntry).sort((x,y)=>x-y);
  const target=targetCandidates.find(x=>(x-rawEntry)/risk>=1.5);
  if(!target){i++;continue}
  let exitBar=Math.min(i+maxHold,c.length-1),rawExit=c[exitBar],reason="TIME";
  for(let j=i+1;j<=exitBar;j++){if(l[j]<=stop){exitBar=j;rawExit=stop;reason="STOP";break}if(h[j]>=target){exitBar=j;rawExit=target;reason="TARGET";break}}
  const entry=rawEntry*(1+slip+fee),exit=rawExit*(1-slip-fee-stamp),gross=(rawExit-rawEntry)/risk,net=(exit-entry)/risk;
  const targetMethod=target===priorHigh20?"RESISTANCE20":target===priorHigh60?"RESISTANCE60":target===measuredMove?"MEASURED_MOVE":"ATR";
  trades.push({entryBar:i,exitBar,netR:round(net),grossR:round(gross),reason,targetMethod});i=exitBar+1;
 }
 const total=trades.reduce((s,t)=>s+t.netR,0),grossTotal=trades.reduce((s,t)=>s+t.grossR,0),costs=grossTotal-total,wins=trades.filter(t=>t.netR>0).length,losses=trades.filter(t=>t.netR<0).length,gw=trades.filter(t=>t.netR>0).reduce((s,t)=>s+t.netR,0),gl=Math.abs(trades.filter(t=>t.netR<0).reduce((s,t)=>s+t.netR,0));
 let eq=0,peak=0,dd=0;for(const t of trades){eq+=t.netR;peak=Math.max(peak,eq);dd=Math.max(dd,peak-eq)}
 return {trades:trades.length,wins,losses,winRate:trades.length?round(wins/trades.length*100,1):0,expectancyR:trades.length?round(total/trades.length):0,grossExpectancyR:trades.length?round(grossTotal/trades.length):0,profitFactor:gl?round(gw/gl,2):gw?99:0,maxDrawdownR:round(dd,2),totalR:round(total,2),grossTotalR:round(grossTotal,2),totalCostsR:round(costs,2),avgHoldBars:trades.length?round(trades.reduce((s,t)=>s+t.exitBar-t.entryBar,0)/trades.length,1):0};
}
function walkForward(d){const train=160,test=40,windows=[];for(let end=train;end+test<=d.close.length;end+=test){const x={open:d.open.slice(end,end+test),high:d.high.slice(end,end+test),low:d.low.slice(end,end+test),close:d.close.slice(end,end+test),volume:d.volume.slice(end,end+test)};windows.push(researchBacktest(x))}const profitable=windows.filter(x=>x.totalR>0).length;return {outOfSample:researchBacktest(d),stability:{profitableWindows:profitable,totalWindows:windows.length,profitableRate:windows.length?round(profitable/windows.length*100,1):0}}}
function researchScore(r){if(!r.trades)return 0;const expectancy=Math.max(-1,Math.min(1,r.expectancyR)),dd=Math.min(30,r.maxDrawdownR*1.5),confidence=Math.min(20,r.trades*1.5),win=Math.max(0,Math.min(30,(r.winRate-40)*.75)),pf=Math.max(0,Math.min(25,(r.profitFactor-1)*12.5));return Math.max(0,Math.min(100,round(50+expectancy*20+win+pf+confidence-dd,1)))}
function vwap(h,l,c,v){let pv=0,vol=0;for(let i=0;i<c.length;i++){const q=n(v[i],0);pv+=((h[i]+l[i]+c[i])/3)*q;vol+=q}return vol?pv/vol:null}
function sessionVwap(h,l,c,v,timestamps){if(!Array.isArray(timestamps)||!timestamps.length)return vwap(h,l,c,v);const last=Number(timestamps.at(-1));if(!Number.isFinite(last))return vwap(h,l,c,v);const day=new Date(last*1000).toISOString().slice(0,10);let pv=0,vol=0;for(let i=0;i<c.length;i++){const ts=Number(timestamps[i]);if(!Number.isFinite(ts)||new Date(ts*1000).toISOString().slice(0,10)!==day)continue;const q=n(v[i],0);pv+=((h[i]+l[i]+c[i])/3)*q;vol+=q}return vol?pv/vol:null}
function weekly(d){const out=[];for(let i=0;i<d.close.length;i++){const dt=new Date((d.timestamp?.[i]||0)*1000);if(!Number.isFinite(dt.getTime()))continue;const key=dt.getUTCFullYear()+"-"+Math.floor((dt.getUTCDate()+6-dt.getUTCDay())/7);let w=out.at(-1);if(!w||w.key!==key){w={key,o:d.open[i],h:d.high[i],l:d.low[i],c:d.close[i],v:n(d.volume[i],0)};out.push(w)}else{w.h=Math.max(w.h,d.high[i]);w.l=Math.min(w.l,d.low[i]);w.c=d.close[i];w.v+=n(d.volume[i],0)}}return out}
function vcp(h,l,v){if(h.length<20)return {ok:false,ratio:null,volumeRatio:null};const rr=[];for(let i=1;i<h.length;i++)rr.push((h[i]-l[i])/Math.max(l[i],.01));const recent=avg(rr.slice(-5)),base=avg(rr.slice(-15,-5)),vr=avg(v.slice(-5))/(avg(v.slice(-15,-5))||1);return {ok:recent!=null&&base!=null&&recent<base*.8&&vr<.9,ratio:base?recent/base:null,volumeRatio:vr}}
async function headers(){const token=await config.get("DHAN_ACCESS_TOKEN"),clientId=await config.get("DHAN_CLIENT_ID");if(!token||!clientId)throw Error("Dhan credentials are not configured");return {"Accept":"application/json","Content-Type":"application/json","access-token":token,"client-id":clientId}}
async function universe(){const r=await fetch(MASTER_URL);if(!r.ok)throw Error("Dhan instrument master unavailable");const lines=(await r.text()).split(/\r?\n/);const head=(lines.shift()||"").split(",");const ix={ex:head.indexOf("SEM_EXM_EXCH_ID"),seg:head.indexOf("SEM_SEGMENT"),id:head.indexOf("SEM_SMST_SECURITY_ID"),inst:head.indexOf("SEM_INSTRUMENT_NAME"),sym:head.indexOf("SEM_TRADING_SYMBOL"),custom:head.indexOf("SEM_CUSTOM_SYMBOL"),series:head.indexOf("SEM_SERIES")};const eq=[],fno=new Set();for(const line of lines){if(!line)continue;const p=line.split(",");const ex=p[ix.ex],seg=p[ix.seg],id=p[ix.id],inst=p[ix.inst],sym=p[ix.sym],series=p[ix.series];if(!id||!sym)continue;if(seg==="D"&&ex==="NSE"&&(inst==="FUTSTK"||inst==="OPTSTK"))fno.add(sym.split("-")[0]);if(seg==="E"&&(ex==="NSE"||ex==="BSE")&&inst==="EQUITY"&&(!series||series==="EQ"))eq.push({exchange:ex,securityId:id,symbol:sym,customSymbol:p[ix.custom],series,fno:false})}for(const x of eq)x.fno=fno.has(x.symbol);const seen=new Set();return eq.filter(x=>{const k=x.exchange+"|"+x.securityId;if(seen.has(k))return false;seen.add(k);return true})}
async function quotes(items,h){
  const merged={NSE_EQ:{},BSE_EQ:{}};
  for(let i=0;i<items.length;i+=QUOTE_BATCH_SIZE){
    const batch=items.slice(i,i+QUOTE_BATCH_SIZE),g={NSE_EQ:[],BSE_EQ:[]};
    for(const x of batch){const k=x.exchange==="NSE"?"NSE_EQ":"BSE_EQ";g[k].push(Number(x.securityId))}
    const r=await dhanFetch(QUOTE_URL,{method:"POST",headers:h,body:JSON.stringify(g)});
    const j=await r.json().catch(()=>({}));
    if(!r.ok)throw Error("Dhan quote request failed");
    for(const k of ["NSE_EQ","BSE_EQ"]){for(const [id,v] of Object.entries(j.data?.[k]||{}))merged[k][id]=v}
  }
  return merged;
}
async function hist(x,h,days){const end=new Date(),start=new Date(end.getTime()-days*86400000);const body={securityId:String(x.securityId),exchangeSegment:x.exchange==="NSE"?"NSE_EQ":"BSE_EQ",instrument:"EQUITY",interval:"5",oi:false,fromDate:start.toISOString().slice(0,10)+" 09:15:00",toDate:end.toISOString().slice(0,10)+" 15:30:00"};const r=await dhanFetch(HIST_URL,{method:"POST",headers:h,body:JSON.stringify(body)});if(!r.ok)return null;return await r.json().catch(()=>null)}
async function daily(x,h){const end=new Date(),start=new Date(end.getTime()-420*86400000);const body={securityId:String(x.securityId),exchangeSegment:x.exchange==="NSE"?"NSE_EQ":"BSE_EQ",instrument:"EQUITY",expiryCode:0,oi:false,fromDate:start.toISOString().slice(0,10),toDate:end.toISOString().slice(0,10)};const r=await dhanFetch(DAILY_URL,{method:"POST",headers:h,body:JSON.stringify(body)});if(!r.ok)return null;return await r.json().catch(()=>null)}
function score(x,q,di,mi,mode){const dc=(di.close||[]).map(Number).filter(Number.isFinite),dh=(di.high||[]).map(Number),dl=(di.low||[]).map(Number),dv=(di.volume||[]).map(Number);const mc=(mi.close||[]).map(Number).filter(Number.isFinite),mh=(mi.high||[]).map(Number),ml=(mi.low||[]).map(Number),mv=(mi.volume||[]).map(Number);if(mc.length<60)return null;const useIntraday=mode==="intraday"||dc.length<60;const tc=useIntraday?mc:dc,th=useIntraday?mh:dh,tl=useIntraday?ml:dl,tv=useIntraday?mv:dv;const research=researchBacktest({open:(useIntraday?(mi.open||[]):(di.open||[])).slice(0,-1),high:th.slice(0,-1),low:tl.slice(0,-1),close:tc.slice(0,-1),volume:tv.slice(0,-1)}),wf=useIntraday?researchBacktest({open:(mi.open||[]).slice(0,-1),high:mh.slice(0,-1),low:ml.slice(0,-1),close:mc.slice(0,-1),volume:mv.slice(0,-1)}):walkForward({open:(di.open||[]).slice(0,-1),high:dh.slice(0,-1),low:dl.slice(0,-1),close:dc.slice(0,-1),volume:dv.slice(0,-1)});const close=n(q.last_price,tc.at(-1)),e10=ema(tc,10),e30=ema(tc,30),r=rsi(tc),m=macd(tc),w=useIntraday?sessionVwap(th,tl,tc,tv,mi.timestamp):vwap(th,tl,tc,tv),a=atr(th,tl,tc),v=vcp(tc.slice(-60).map((z,i)=>th[Math.max(0,th.length-60+i)]||z),tl.slice(-60),tv.slice(-60));const wks=useIntraday?[]:weekly(di),wk=wks.at(-1),prev=wks.at(-2);const oneM=dc.length>=22?close/dc[Math.max(0,dc.length-22)]-1:null,threeM=dc.length>=66?close/dc[Math.max(0,dc.length-66)]-1:null,high52=dc.length?Math.max(...dc.slice(-252)):null,near52=high52?close/high52:null,tight=Math.max(...tc.slice(-3))/Math.max(.01,Math.min(...tc.slice(-3)))<=1.07;const volRatio=(tv.at(-1)||0)/(avg(tv.slice(-20))||1),weeklyBreak=!!(wk&&prev&&wk.c>prev.h&&wk.v>(avg(wks.slice(-21,-1).map(z=>z.v))||1)),strong=!useIntraday&&close>(sma(dc,50)||0)&&(sma(dc,50)||0)>(sma(dc,200)||0),momentum=!useIntraday&&oneM!=null&&threeM!=null&&oneM>=.20&&threeM>=.30,up20Tight=!useIntraday&&oneM!=null&&oneM>=.20&&tight,nearBreak=!useIntraday&&near52!=null&&near52>=.90&&near52<=.95,intradayBull=close>e10&&e10>e30&&close>w&&(r==null||r>=55&&r<=75)&&(m==null||m>0)&&volRatio>=1.2,bearish=tc.at(-1)<tc.at(-2)&&tc.at(-1)<=(useIntraday?(mi.open||[]).at(-1):(di.open||[]).at(-1));const checks={intraday:intradayBull,momentum,strong,vcp:v.ok,weeklyBreak,up20Tight,nearBreak,bearish};let score=Object.values(checks).filter(Boolean).length,status="WATCH";if(mode==="bearish")status=checks.bearish?"BEARISH_SETUP":"NO_MATCH";else if(mode==="intraday")status=score>=3&&intradayBull&&!bearish?"INTRADAY_CANDIDATE":score>=2&&!bearish?"WATCH":"NO_MATCH";else if(mode==="options")status=x.fno&&!bearish&&score>=3&&(intradayBull||momentum||weeklyBreak||up20Tight||nearBreak)?"OPTIONS_UNDERLYING":"NO_MATCH";else status=score>=3&&!bearish&&(momentum||weeklyBreak||up20Tight||nearBreak||v.ok)?"EQUITY_CANDIDATE":score>=2&&!bearish?"WATCH":"NO_MATCH";const tradedValue=Math.max(0,n(q.volume,0)*close);
  const avgVol20=Math.max(1,avg(tv.slice(-20))||0);
  const relativeVolume=volRatio;
  const relativeVolumeClass=relativeVolume>=2.5?"EXCEPTIONAL":relativeVolume>=1.5?"STRONG":relativeVolume>=0.8?"NORMAL":"WEAK";
  const liquidityScore=Math.min(100,round(Math.min(55,Math.log10(Math.max(1,tradedValue/1e6))*18)+Math.min(25,relativeVolume*10)+(close>=20?20:0),1));
  const executionQuality=liquidityScore;
  const executionStatus=tradedValue>=50000000&&relativeVolume>=0.8?"PASS":tradedValue>=10000000&&relativeVolume>=0.6?"PASS":"FAIL";
  const extensionPct=vwapValue=>vwapValue?((close-vwapValue)/vwapValue)*100:0;
  const extensionFromVwap=extensionPct(w);
  const extensionState=Math.abs(extensionFromVwap)>=8?"HIGHLY_EXTENDED":Math.abs(extensionFromVwap)>=4?"EXTENDED":"NORMAL";
  const marketScore=Math.min(100,round(40+(intradayBull?30:0)+(close>w?15:0)+Math.min(15,volRatio*5),1));const recentHigh20=th.length>20?Math.max(...th.slice(-21,-1)):null,recentLow20=tl.length>20?Math.min(...tl.slice(-21,-1)):null,recentHigh60=th.length>60?Math.max(...th.slice(-61,-1)):null;
return {symbol:x.symbol,exchange:x.exchange,securityId:x.securityId,customSymbol:x.customSymbol,fno:x.fno,ltp:close,changePct:n(q.net_change),volume:n(q.volume),score,marketScore,checks,status,tradedValue,relativeVolumeClass,liquidityScore,executionQuality,executionStatus,extensionFromVwap,extensionState,oneMonthPct:oneM*100,threeMonthPct:threeM*100,near52Pct:near52*100,rsi14:r,ema10:e10,ema30:e30,vwap:w,atr14:a,volRatio,vcp,weeklyBreak,strong,momentum,up20Tight,nearBreak,intradayBull,bearishEngulfing:bearish,recentHigh20,recentLow20,recentHigh60,research:{...research,score:researchScore(research)},walkForward:wf}}
export async function runScanner({mode="equity",limit=20}={}){const safeMode=String(mode).toLowerCase(),safeLimit=Math.min(40,Math.max(5,n(limit,20))),h=await headers(),u=await universe(),nse=u.filter(x=>x.exchange==="NSE"),qdata=await quotes(nse,h),candidates=[];for(const x of nse){const k=x.exchange==="NSE"?"NSE_EQ":"BSE_EQ",q=qdata?.[k]?.[String(x.securityId)];if(q?.last_price){const px=n(q.last_price,0),sym=String(x.symbol||"").toUpperCase();if(px>=20&&!sym.includes("ETF")&&!sym.includes("BEES"))candidates.push({...x,q})}}candidates.sort((a,b)=>n(b.q.volume,0)-n(a.q.volume,0));const results=[];
  // Stage 2: rank the full live NSE quote universe by liquidity before expensive historical analysis.
  candidates.sort((a,b)=>n(b.q.volume,0)-n(a.q.volume,0));
  const work=candidates.slice(0,MAX_CANDIDATES);
  for(let i=0;i<work.length;i+=HIST_CONCURRENCY){
    const batch=work.slice(i,i+HIST_CONCURRENCY);
    const scored=await Promise.all(batch.map(async x=>{try{if(safeMode==="intraday"){const mi=await hist(x,h,2);if(!mi?.close?.length)return null;return score(x,x.q,{close:[],high:[],low:[],open:[],volume:[]},mi,safeMode)}const [di,mi]=await Promise.all([daily(x,h),hist(x,h,12)]);if(!di?.close?.length||!mi?.close?.length)return null;return score(x,x.q,di,mi,safeMode)}catch{return null}}));
    for(const s of scored)if(s)results.push(s);
  }
  results.sort((a,b)=>b.score-a.score||n(b.volRatio,0)-n(a.volRatio,0));const filtered=safeMode==="bearish"?results.filter(x=>x.status==="BEARISH_SETUP"):results.filter(x=>x.status!=="NO_MATCH");return {ok:true,mode:safeMode,generatedAt:new Date().toISOString(),universeSize:u.length,quoted:candidates.length,liquidityPool:work.length,analyzed:results.length,returned:Math.min(safeLimit,filtered.length),methodology:{chartinkProfiles:["intraday momentum","20%/1M + 30%/3M","strong trend","VCP","bearish engulfing","weekly breakout","20%/30d + tightness","5-10% below 52W high"],dhanValidation:true,ai:false,optionsUnderlying:"NSE F&O eligibility from Dhan instrument master"},results:filtered.slice(0,safeLimit),buyCandidates:filtered.filter(x=>/CANDIDATE|UNDERLYING/.test(x.status)).slice(0,10),watch:filtered.filter(x=>x.status==="WATCH").slice(0,10),avoid:results.filter(x=>x.status==="NO_MATCH").slice(0,10)}}