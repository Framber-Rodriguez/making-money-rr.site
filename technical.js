/* Original causal OHLC rules. Patterns are hypotheses, never win probabilities. */
(() => {
 const VERSION='technical-context-v1',LOOKBACK=60;
 const mean=a=>a.reduce((s,v)=>s+v,0)/a.length;
 function ema(values,n){let v=values[0];return values.map((x,i)=>v=i?x*2/(n+1)+v*(1-2/(n+1)):x);}
 function build(rows){
  const closes=rows.map(r=>r.close),e12=ema(closes,12),e26=ema(closes,26),e20=ema(closes,20),e50=ema(closes,50),macd=e12.map((v,i)=>v-e26[i]),ms=ema(macd,9);
  let gain=0,loss=0,atr=0;return rows.map((r,i)=>{
   const delta=i?r.close-rows[i-1].close:0,tr=i?Math.max(r.high-r.low,Math.abs(r.high-rows[i-1].close),Math.abs(r.low-rows[i-1].close)):r.high-r.low;
   if(i<=14){gain+=Math.max(delta,0)/14;loss+=Math.max(-delta,0)/14;if(i)atr+=tr/14;}else{gain=(gain*13+Math.max(delta,0))/14;loss=(loss*13+Math.max(-delta,0))/14;atr=(atr*13+tr)/14;}
   if(i<LOOKBACK-1)return null;
   const a=atr||1,slice=rows.slice(i-19,i+1),avg=mean(slice.map(v=>v.close)),std=Math.sqrt(mean(slice.map(v=>(v.close-avg)**2))),prior=rows.slice(i-20,i),hi=Math.max(...prior.map(v=>v.high)),lo=Math.min(...prior.map(v=>v.low));
   const rsi=gain===0&&loss===0?50:loss===0?100:100-100/(1+gain/loss),patterns=detect(rows,i,a,hi,lo);
   const vv=prior.map(v=>v.volume),volumeKnown=Number.isFinite(r.volume)&&r.volume>0&&vv.every(v=>Number.isFinite(v)&&v>0),volumeRatio=volumeKnown?r.volume/mean(vv):null;
   const net=patterns.filter(p=>p.confirmed).reduce((s,p)=>s+p.side,0),position=std?(r.close-avg)/(2*std):0;
   return {atr,ema20:e20[i],ema50:e50[i],rsi,macd:macd[i],histogram:macd[i]-ms[i],bands:{upper:avg+2*std,lower:avg-2*std,middle:avg},support:lo,resistance:hi,volumeRatio,patterns,
    x:[1,(r.close-rows[i-3].close)/a,(r.close-e20[i])/a,(e20[i]-e50[i])/a,(rsi-50)/50,(macd[i]-ms[i])/a,position,(hi-r.close)/a,(r.close-lo)/a,Math.max(-3,Math.min(3,net)),volumeRatio===null?0:Math.log(volumeRatio),volumeKnown?1:0]};
  });
 }
 function detect(rows,i,atr,hi,lo){
  const out=[],r=rows[i],p=rows[i-1],q=rows[i-2],body=Math.abs(r.close-r.open),range=r.high-r.low,upper=r.high-Math.max(r.open,r.close),lower=Math.min(r.open,r.close)-r.low,trend=r.close-rows[i-10].close;
  const add=(name,side,confirmed=true,level=null)=>out.push({name,side,confirmed,level});
  if(range>0&&body<=range*.1)add('Doji',0);
  if(body>range*.1&&lower>=body*2&&upper<=body*.5&&trend<0)add('Hammer',1,r.close>r.open);
  if(body>range*.1&&upper>=body*2&&lower<=body*.5&&trend>0)add('Shooting star',-1,r.close<r.open);
  if(p.close<p.open&&r.close>r.open&&r.open<=p.close&&r.close>=p.open)add('Bullish engulfing',1);
  if(p.close>p.open&&r.close<r.open&&r.open>=p.close&&r.close<=p.open)add('Bearish engulfing',-1);
  if(r.high<p.high&&r.low>p.low)add('Inside bar',0,false);
  if(q.close<q.open&&Math.abs(p.close-p.open)<Math.abs(q.close-q.open)*.35&&r.close>r.open&&r.close>(q.open+q.close)/2)add('Morning star',1);
  if(q.close>q.open&&Math.abs(p.close-p.open)<Math.abs(q.close-q.open)*.35&&r.close<r.open&&r.close<(q.open+q.close)/2)add('Evening star',-1);
  if(r.close>hi)add('Resistance breakout',1,true,hi);if(r.close<lo)add('Support breakout',-1,true,lo);
  // A pivot is known only AFTER its two right-hand candles close.
  const tops=[],bottoms=[];for(let j=Math.max(2,i-58);j<=i-2;j++){
   if([j-2,j-1,j+1,j+2].every(k=>rows[j].high>rows[k].high))tops.push({j,v:rows[j].high});
   if([j-2,j-1,j+1,j+2].every(k=>rows[j].low<rows[k].low))bottoms.push({j,v:rows[j].low});
  }
  function reversals(points,side){const two=points.slice(-2);if(two.length===2&&two[1].j-two[0].j>=5&&Math.abs(two[0].v-two[1].v)<=atr*.7){const between=rows.slice(two[0].j,two[1].j+1),level=side<0?Math.min(...between.map(v=>v.low)):Math.max(...between.map(v=>v.high));add(side<0?'Double top':'Double bottom',side,side<0?r.close<level:r.close>level,level);}
   const t=points.slice(-3);if(t.length===3&&t[1].j-t[0].j>=3&&t[2].j-t[1].j>=3&&Math.abs(t[0].v-t[2].v)<=atr&&side*(t[1].v-t[0].v)<-atr&&side*(t[1].v-t[2].v)<-atr){const mid=rows.slice(t[0].j,t[2].j+1),level=side<0?Math.min(...mid.map(v=>v.low)):Math.max(...mid.map(v=>v.high));add(side<0?'Head and shoulders':'Inverse head and shoulders',side,side<0?r.close<level:r.close>level,level);}}
  reversals(tops,-1);reversals(bottoms,1);
  const t=tops.slice(-2),b=bottoms.slice(-2);if(t.length===2&&b.length===2){const ts=(t[1].v-t[0].v)/(t[1].j-t[0].j),bs=(b[1].v-b[0].v)/(b[1].j-b[0].j),u=t[1].v+ts*(i-t[1].j),l=b[1].v+bs*(i-b[1].j);
   if(u>l&&ts<-atr*.015&&bs>atr*.015)add('Symmetrical triangle',r.close>u?1:r.close<l?-1:0,r.close>u||r.close<l,r.close>u?u:l);
   if(ts*bs>0&&Math.abs(ts-bs)<atr*.03)add(ts>0?'Ascending channel':'Descending channel',Math.sign(ts),false);
  }
  return out;
 }
 function analyze(rows){if(rows.length<LOOKBACK)return {available:false,reason:'At least 60 closed candles are needed for technical context.'};const history=rows.slice(-300),step=history.at(-1).timestamp-history.at(-2).timestamp;if(step<=0||history.slice(-LOOKBACK+1).some((r,k)=>r.timestamp-history[history.length-LOOKBACK+k].timestamp!==step))return {available:false,reason:'Technical context paused: recent candles have gaps.'};const s=build(history).at(-1);return {available:true,version:VERSION,...s,x:undefined,trend:s.ema20>s.ema50?'Uptrend':s.ema20<s.ema50?'Downtrend':'Range'};}
 const api={VERSION,LOOKBACK,build,analyze};if(typeof window!=='undefined')window.MMTechnical=api;if(typeof module!=='undefined')module.exports=api;
})();
