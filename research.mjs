export const STRATEGY='breakout20-sma20-atr14-v1';
export function validateCandles(rows,max=300000){
 if(!Array.isArray(rows)||rows.length<30||rows.length>max)throw Error('30–'+max+' chronological candles required.');
 for(let i=0;i<rows.length;i++){const r=rows[i];if(!Number.isFinite(r.timestamp)||['open','high','low','close'].some(k=>!Number.isFinite(r[k])||r[k]<=0)||r.low>Math.min(r.open,r.close)||r.high<Math.max(r.open,r.close)||r.high<r.low||(i&&r.timestamp<=rows[i-1].timestamp))throw Error('Invalid candle history.');}
 return rows;
}
export function signalAt(rows,i){
 if(i<29)return {side:'Wait'};
 const w=rows.slice(i-20,i+1),last=w.at(-1),prior=w.slice(0,-1);
 const mean=a=>a.reduce((s,r)=>s+r.close,0)/a.length;
 const up=last.close>Math.max(...prior.map(r=>r.high))&&mean(w.slice(1))>mean(prior);
 const down=last.close<Math.min(...prior.map(r=>r.low))&&mean(w.slice(1))<mean(prior);
 const atr=rows.slice(i-13,i+1).reduce((s,r,j)=>{const p=rows[i-14+j].close;return s+Math.max(r.high-r.low,Math.abs(r.high-p),Math.abs(r.low-p));},0)/14;
 return {side:up?'Buy':down?'Sell':'Wait',atr};
}
export function backtest(input,options={}){
 const rows=validateCandles(input),minutes=Number(options.minutes||15),step=minutes*60000,horizon=1800000;
 const costsBps=Number(options.costsBps??10),slippageBps=Number(options.slippageBps??2);
 if(![1,5,15,30].includes(minutes))throw Error('Use 1, 5, 15 or 30-minute candles for a 30-minute trade horizon.');
 if(!Number.isFinite(costsBps)||costsBps<0||costsBps>1000||!Number.isFinite(slippageBps)||slippageBps<0||slippageBps>1000)throw Error('Invalid costs/slippage.');
 const trades=[];let skipped=0,nextEligible=29;
 for(let i=29;i+1<rows.length;i++){
  if(i<nextEligible)continue;const s=signalAt(rows,i);if(s.side==='Wait'||!(s.atr>0))continue;
  const start=i+1,end=start+horizon/step-1;
  if(end>=rows.length){skipped++;continue;}
  let regular=true;for(let j=i+1;j<=end;j++)if(rows[j].timestamp-rows[j-1].timestamp!==step)regular=false;
  if(!regular){skipped++;continue;}
  const sign=s.side==='Buy'?1:-1,entry=rows[start].open*(1+sign*slippageBps/10000);
  const stop=entry-sign*s.atr,target=entry+sign*2*s.atr;
  if(stop<=0||target<=0){skipped++;continue;}
  let exit=rows[end].close,reason='30-minute expiry',exitIndex=end;
  for(let j=start;j<=end;j++){
   const r=rows[j],stopHit=sign===1?r.low<=stop:r.high>=stop,targetHit=sign===1?r.high>=target:r.low<=target;
   if(stopHit){exit=sign===1?Math.min(stop,r.open):Math.max(stop,r.open);reason=targetHit?'Stop (ambiguous candle; conservative)':'Stop';exitIndex=j;break;}
   if(targetHit){exit=target;reason='Target';exitIndex=j;break;}
  }
  exit*=1-sign*slippageBps/10000;
  const pnl=sign*(exit-entry)-entry*costsBps/10000;
  trades.push({side:s.side,signalTime:rows[i].timestamp,entryTime:rows[start].timestamp,exitTime:rows[exitIndex].timestamp+step,entry,exit,stop,target,pnl,returnPct:100*pnl/entry,reason});
  nextEligible=exitIndex+1;
 }
 const summarize=list=>{
  let equity=0,peak=0,maxDrawdown=0;const curve=[];
  for(const t of list){equity+=t.pnl;peak=Math.max(peak,equity);maxDrawdown=Math.max(maxDrawdown,peak-equity);curve.push({time:t.exitTime,equity});}
  const wins=list.filter(t=>t.pnl>0),loss=list.filter(t=>t.pnl<0),grossWin=wins.reduce((s,t)=>s+t.pnl,0),grossLoss=-loss.reduce((s,t)=>s+t.pnl,0);
  return {trades:list.length,wins:wins.length,losses:loss.length,winRate:list.length?100*wins.length/list.length:null,netPnl:equity,maxDrawdown,profitFactor:grossLoss?grossWin/grossLoss:null,curve};
 };
 const cutoff=rows[Math.floor(rows.length*.7)].timestamp;
 return {strategy:STRATEGY,minutes,costsBps,slippageBps,units:1,coverage:{from:rows[0].timestamp,to:rows.at(-1).timestamp+step,candles:rows.length},skipped,all:summarize(trades),holdout:summarize(trades.filter(t=>t.entryTime>=cutoff&&t.signalTime>=cutoff)),cutoff,trades:trades.slice(-300),limitations:'Fixed rules, no optimization. One unit, no leverage. OHLC cannot resolve intrabar order; stop wins ties. Fees/slippage are assumptions; financing, borrow, tax and liquidity are excluded. Last 30% is chronological holdout; no statistical guarantee.'};
}
// Rasterize only the past 20 candles: 20 x 16 pixels. Colors encode candle direction.
export function chartPixels(rows,i){
 const w=rows.slice(i-19,i+1),low=Math.min(...w.map(r=>r.low)),high=Math.max(...w.map(r=>r.high)),span=high-low||1,pixels=Array(320).fill(0);
 const y=p=>Math.max(0,Math.min(15,Math.round((high-p)/span*15)));
 w.forEach((r,x)=>{const sign=r.close>=r.open?1:-1;for(let k=y(r.high);k<=y(r.low);k++)pixels[k*20+x]=sign*.35;for(let k=Math.min(y(r.open),y(r.close));k<=Math.max(y(r.open),y(r.close));k++)pixels[k*20+x]=sign;});
 return pixels;
}
export function trainVisual(input,minutes=15){
 const rows=validateCandles(input,30000),step=minutes*60000,h=1800000/step;
 if(![1,5,15,30].includes(minutes))return {available:false,reason:'Hourly candles cannot label a 30-minute outcome.'};
 const split=Math.floor(rows.length*.7),train=[],test=[];
 for(let i=29;i+h<rows.length;i+=Math.max(h,20)){
  let regular=true;for(let j=i-19;j<=i+h;j++)if(j>0&&rows[j].timestamp-rows[j-1].timestamp!==step)regular=false;
  const delta=rows[i+h].close-rows[i].close;if(!regular||!delta)continue;
  const r={x:chartPixels(rows,i),y:delta>0?1:0,time:rows[i].timestamp};
  if(i+h<split)train.push(r);else if(i-19>=split)test.push(r);
 }
 if(train.length<60||test.length<30)return {available:false,reason:'Need at least 60 training and 30 purged test images; found '+train.length+' / '+test.length+'.',train:train.length,test:test.length};
 const w=Array(321).fill(0),sig=v=>1/(1+Math.exp(-Math.max(-30,Math.min(30,v))));
 const predict=x=>sig(w[0]+x.reduce((s,v,k)=>s+v*w[k+1],0));
 for(let epoch=0;epoch<100;epoch++){const g=Array(321).fill(0);for(const r of train){const e=predict(r.x)-r.y;g[0]+=e;r.x.forEach((v,k)=>g[k+1]+=e*v);}w.forEach((v,k)=>w[k]-=.1*(g[k]/train.length+(k?.08*v:0)));}
 const base=train.reduce((s,r)=>s+r.y,0)/train.length,brier=test.reduce((s,r)=>s+(predict(r.x)-r.y)**2,0)/test.length,baseline=test.reduce((s,r)=>s+(base-r.y)**2,0)/test.length;
 const available=brier<baseline;
 return {available,reason:available?'Experimental pixel classifier beat the training-frequency baseline on this holdout.':'Pixel classifier did not beat the baseline; probability withheld.',train:train.length,test:test.length,brier,baseline,up:available?predict(chartPixels(rows,rows.length-1)):null,weights:w,trainedThrough:train.at(-1).time,version:'pixels20x16-logistic-v1',scope:'Generated candle images from this feed only. Not a neural network or arbitrary screenshot recognizer. Labels use completed +30-minute outcomes; overlapping image windows are purged from test.'};
}
