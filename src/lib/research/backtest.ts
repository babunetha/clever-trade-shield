import type { DailyBar } from "@/lib/scanner/series";
import { atr, ema, rsi, rvol } from "@/lib/scanner/series";

export interface BacktestConfig {
  stopAtr?: number;
  targetR?: number;
  maxHoldBars?: number;
  minRsi?: number;
  maxRsi?: number;
  minRvol?: number;
  slippageBps?: number;
  feeBpsPerSide?: number;
  stampDutyBpsPerSide?: number;
}
export interface BacktestTrade {
  entryBar:number; exitBar:number; entry:number; exit:number;
  grossR:number; netR:number; costsR:number; rMultiple:number;
  reason:"TARGET"|"STOP"|"TIME";
}
export interface BacktestResult {
  trades:number; wins:number; losses:number; winRate:number; expectancyR:number;
  grossExpectancyR:number; profitFactor:number; maxDrawdownR:number; totalR:number;
  grossTotalR:number; totalCostsR:number; avgHoldBars:number;
}
const round=(n:number,d=3)=>Number(n.toFixed(d));

export function backtestTrendBreakout(bars:DailyBar[], config:BacktestConfig={}):BacktestResult {
  const stopAtr=config.stopAtr??1.2, targetR=config.targetR??1.5, maxHoldBars=config.maxHoldBars??10;
  const minRsi=config.minRsi??45, maxRsi=config.maxRsi??75, minRvol=config.minRvol??1.2;
  const slippage=(config.slippageBps??5)/10000, fee=(config.feeBpsPerSide??3)/10000, stamp=(config.stampDutyBpsPerSide??0)/10000;
  const trades:BacktestTrade[]=[]; let i=30;
  while(i<bars.length-1){
    const history=bars.slice(0,i+1), c=history.map(b=>b.close);
    const e10=ema(c,10),e30=ema(c,30),r=rsi(c,14),rv=rvol(history),a=atr(history,14),prev=bars[i-1]!,bar=bars[i]!;
    const signal=e10!==null&&e30!==null&&e10>e30&&r!==null&&r>=minRsi&&r<=maxRsi&&rv!==null&&rv>=minRvol&&a!==null&&bar.close>prev.close;
    if(!signal||a===null){i++;continue;}
    const rawEntry=bar.close,risk=Math.max(.05,a*stopAtr),stop=rawEntry-risk,target=rawEntry+risk*targetR;
    const entry=rawEntry*(1+slippage+fee); let exitBar=Math.min(i+maxHoldBars,bars.length-1),rawExit=bars[exitBar]!.close;
    let reason:BacktestTrade["reason"]="TIME";
    for(let j=i+1;j<=exitBar;j++){const next=bars[j]!;if(next.low<=stop){exitBar=j;rawExit=stop;reason="STOP";break;}if(next.high>=target){exitBar=j;rawExit=target;reason="TARGET";break;}}
    const exit=rawExit*(1-slippage-fee-stamp),grossR=(rawExit-rawEntry)/risk,netR=(exit-entry)/risk;
    trades.push({entryBar:i,exitBar,entry:round(entry,2),exit:round(exit,2),grossR:round(grossR),netR:round(netR),costsR:round(grossR-netR),rMultiple:round(netR),reason});
    i=exitBar+1;
  }
  const totalR=trades.reduce((s,t)=>s+t.netR,0),grossTotalR=trades.reduce((s,t)=>s+t.grossR,0),totalCostsR=trades.reduce((s,t)=>s+t.costsR,0);
  const wins=trades.filter(t=>t.netR>0).length,losses=trades.filter(t=>t.netR<0).length;
  const grossWin=trades.filter(t=>t.netR>0).reduce((s,t)=>s+t.netR,0),grossLoss=Math.abs(trades.filter(t=>t.netR<0).reduce((s,t)=>s+t.netR,0));
  let equity=0,peak=0,maxDrawdownR=0; for(const t of trades){equity+=t.netR;peak=Math.max(peak,equity);maxDrawdownR=Math.max(maxDrawdownR,peak-equity);}
  return {trades:trades.length,wins,losses,winRate:trades.length?round(wins/trades.length*100,1):0,expectancyR:trades.length?round(totalR/trades.length):0,grossExpectancyR:trades.length?round(grossTotalR/trades.length):0,profitFactor:grossLoss?round(grossWin/grossLoss,2):grossWin?99:0,maxDrawdownR:round(maxDrawdownR,2),totalR:round(totalR,2),grossTotalR:round(grossTotalR,2),totalCostsR:round(totalCostsR,2),avgHoldBars:trades.length?round(trades.reduce((s,t)=>s+t.exitBar-t.entryBar,0)/trades.length,1):0};
}

export interface WalkForwardResult { windows:Array<{train:BacktestResult;test:BacktestResult;trainEnd:number;testStart:number;testEnd:number}>; outOfSample:BacktestResult; stability:{profitableWindows:number;totalWindows:number;profitableRate:number}; }

export function walkForwardTrendBreakout(bars:DailyBar[], options:{trainBars?:number;testBars?:number;stepBars?:number;config?:BacktestConfig}={}):WalkForwardResult {
  const trainBars=options.trainBars??160,testBars=options.testBars??40,stepBars=options.stepBars??testBars,windows:WalkForwardResult["windows"]=[],allTest:DailyBar[]=[];
  for(let trainEnd=trainBars;trainEnd+testBars<=bars.length;trainEnd+=stepBars){
    const testSlice=bars.slice(trainEnd,trainEnd+testBars);
    windows.push({train:backtestTrendBreakout(bars.slice(0,trainEnd),options.config),test:backtestTrendBreakout(testSlice,options.config),trainEnd,testStart:trainEnd,testEnd:trainEnd+testBars});
    allTest.push(...testSlice);
  }
  const outOfSample=backtestTrendBreakout(allTest,options.config),profitableWindows=windows.filter(w=>w.test.totalR>0).length;
  return {windows,outOfSample,stability:{profitableWindows,totalWindows:windows.length,profitableRate:windows.length?round(profitableWindows/windows.length*100,1):0}};
}

export function researchScore(result:BacktestResult):number {
  if(!result.trades)return 0;
  const expectancy=Math.max(-1,Math.min(1,result.expectancyR)),dd=Math.min(30,result.maxDrawdownR*1.5),confidence=Math.min(20,result.trades*1.5);
  const win=Math.max(0,Math.min(30,(result.winRate-40)*.75)),pf=Math.max(0,Math.min(25,(result.profitFactor-1)*12.5));
  return Math.max(0,Math.min(100,Number((50+expectancy*20+win+pf+confidence-dd).toFixed(1))));
}
