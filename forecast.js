(() => {
 const technical=typeof module!=='undefined'?require('./technical.js'):window.MMTechnical;
 const cache=new Map(),sig=z=>1/(1+Math.exp(-Math.max(-35,Math.min(35,z))));
 function evaluate(input,minutes){
  const data=input.slice(-20000),last=data.at(-1);if(!last||data.length<60)return {available:false,reason:'At least 60 verified closed candles are needed.'};
  const diffs=data.slice(1).map((r,i)=>r.timestamp-data[i].timestamp).sort((a,b)=>a-b),step=diffs[Math.floor(diffs.length/2)],h=minutes*60000/step;
  if(![5,10,30].includes(minutes)||!Number.isInteger(h)||h<1)return {available:false,reason:'Use 1- or 5-minute candles for 5/10-minute forecasts. Larger candles cannot resolve the requested future close.'};
  const key=[minutes,data.length,data[0].timestamp,last.timestamp,last.close,data.reduce((s,r)=>s+r.close+r.high+r.low+r.open+(r.volume||0),0)].join('|');if(cache.has(key))return cache.get(key);
  const features=new Map(),gaps=[0];for(let i=1;i<data.length;i++)gaps[i]=gaps[i-1]+(data[i].timestamp-data[i-1].timestamp===step?0:1);
  if(gaps.at(-1)!==gaps[data.length-technical.LOOKBACK])return {available:false,reason:'Recent price history contains gaps. Refresh a continuous sequence of closed candles.'};
  const contexts=technical.build(data),width=12;const feature=i=>contexts[i];
  let samples=[];for(let i=technical.LOOKBACK-1;i+h<data.length;i+=h){if(gaps[i+h]!==gaps[i]||gaps[i]!==gaps[i-technical.LOOKBACK+1])continue;const f=feature(i);if(f.atr<=0)continue;const delta=data[i+h].close-data[i].close;if(delta===0)continue;samples.push({index:i,end:i+h,x:f.x,y:delta>0?1:0,z:delta/f.atr});}
  samples=samples.slice(-1500);const split=Math.floor(samples.length*.7),test=samples.slice(split),train=samples.slice(0,split).filter(r=>r.end<test[0]?.index);
  if(train.length<60||test.length<30)return {available:false,reason:samples.length+' completed '+minutes+'-minute outcomes. Need 60 training and 30 chronological test examples. Gapped and unchanged outcomes excluded.'};
  const means=Array(width).fill(0),scales=Array(width).fill(1);for(let k=1;k<width;k++){means[k]=train.reduce((s,r)=>s+r.x[k],0)/train.length;scales[k]=Math.sqrt(train.reduce((s,r)=>s+(r.x[k]-means[k])**2,0)/train.length)||1;}
  const norm=x=>x.map((v,k)=>k?Math.max(-5,Math.min(5,(v-means[k])/scales[k])):1),prepared=samples.map(r=>({...r,x:norm(r.x)})),b=prepared.slice(split),a=prepared.slice(0,split).filter(r=>r.end<b[0].index);
  function fit(list,regression=false){const w=Array(width).fill(0);for(let it=0;it<160;it++){const g=Array(width).fill(0);for(const r of list){const raw=w.reduce((s,v,k)=>s+v*r.x[k],0),error=(regression?raw:sig(raw))-(regression?r.z:r.y);for(let k=0;k<width;k++)g[k]+=error*r.x[k];}for(let k=0;k<width;k++)w[k]-=(regression?.012:.08)*(g[k]/list.length+(k?.01*w[k]:0));}return x=>{const z=w.reduce((s,v,k)=>s+v*x[k],0);return regression?z:sig(z);};}
  const predict=fit(a),baseline=a.reduce((s,r)=>s+r.y,0)/a.length,brier=b.reduce((s,r)=>s+(predict(r.x)-r.y)**2,0)/b.length,baseBrier=b.reduce((s,r)=>s+(baseline-r.y)**2,0)/b.length;
  const current=feature(data.length-1),x=norm(current.x),available=brier<baseBrier,p=available?fit(prepared)(x):null;
  const regression=fit(a,true),sortedZ=a.map(r=>r.z).sort((x,y)=>x-y),median=sortedZ[Math.floor(sortedZ.length/2)],mae=b.reduce((s,r)=>s+Math.abs(regression(r.x)-r.z),0)/b.length,baseMae=b.reduce((s,r)=>s+Math.abs(median-r.z),0)/b.length;
  const change=fit(prepared,true)(x)*current.atr,movementOK=mae<baseMae&&Number.isFinite(change)&&last.close+change>0;
  const movement=movementOK?{available:true,change,percent:100*change/last.close,price:last.close+change,mae,baseline:baseMae}:{available:false,reason:'Price-change model did not beat the historical median baseline in chronological testing.'};
  const reason='Test: '+b.length+' · Brier '+brier.toFixed(3)+' / baseline '+baseBrier.toFixed(3)+'. '+(available?'Experimental '+minutes+'-minute estimate; not externally calibrated.':'Direction model did not beat the baseline. Probabilities withheld.');
  const result={version:technical.VERSION,issuedAt:last.timestamp+step,targetAt:last.timestamp+step+minutes*60000,baseline,available,up:p,down:p===null?null:1-p,n:samples.length,test:b.length,brier,baseBrier,reason,movement};if(cache.size>20)cache.clear();cache.set(key,result);return result;
 }
 const api={evaluate};if(typeof window!=='undefined')window.MMForecast=api;if(typeof module!=='undefined')module.exports=api;
})();
