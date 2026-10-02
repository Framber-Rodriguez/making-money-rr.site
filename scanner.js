/* Original, price-based structure scanner. No TradingView indicator code is used.
 * A pivot needs two closed candles on each side and is known only at i + 2.
 * BOS is the first close crossing a previously confirmed pivot level.
 * Historical outcomes use exact, non-overlapping 30-minute windows.
 */
const StructureScanner=(()=>{
 function states(data){
  let highs=[],lows=[],brokenHigh=-1,brokenLow=-1;const output=[];
  for(let i=0;i<data.length;i++){
   const j=i-2;
   if(j>=2){const range=data.slice(j-2,j+3);
    if(range.every((r,k)=>k===2||data[j].high>r.high))highs.push({price:data[j].high,index:j});
    if(range.every((r,k)=>k===2||data[j].low<r.low))lows.push({price:data[j].low,index:j});
   }
   const hi=highs.at(-1),lo=lows.at(-1),h0=highs.at(-2),l0=lows.at(-2);
   const trend=hi&&lo&&h0&&l0?(hi.price>h0.price&&lo.price>l0.price?'Bullish':hi.price<h0.price&&lo.price<l0.price?'Bearish':'Mixed'):'Unconfirmed';
   let bos=null,level=null;
   if(i&&hi&&hi.index!==brokenHigh&&data[i-1].close<=hi.price&&data[i].close>hi.price){bos='up';level=hi.price;brokenHigh=hi.index;}
   if(i&&lo&&lo.index!==brokenLow&&data[i-1].close>=lo.price&&data[i].close<lo.price){bos='down';level=lo.price;brokenLow=lo.index;}
   output.push({trend,high:hi?.price,low:lo?.price,highs:highs.length,lows:lows.length,bos,level});
  }return output;
 }
 function compute(data){
  if(!data||data.length<5)return null;
  const all=states(data),current=all.at(-1),diffs=data.slice(1).map((r,i)=>r.timestamp-data[i].timestamp).sort((a,b)=>a-b),step=diffs[Math.floor(diffs.length/2)],h=1800000/step;
  const totals={direction:{n:0,up:0,down:0,flat:0},retestUp:{n:0,yes:0},retestDown:{n:0,yes:0}};
  if(!Number.isInteger(h)||h<1)return {current,totals,horizonAvailable:false};
  let lastDirection=-Infinity,lastUp=-Infinity,lastDown=-Infinity;
  for(let i=4;i+h<data.length;i++){
   const future=data.slice(i+1,i+h+1);if(future.some((r,k)=>r.timestamp-data[i+k].timestamp!==step))continue;
   if(['Bullish','Bearish'].includes(current.trend)&&all[i].trend===current.trend&&i>=lastDirection+h){const d=data[i+h].close-data[i].close;totals.direction.n++;totals.direction[d>0?'up':d<0?'down':'flat']++;lastDirection=i;}
   const side=all[i].bos;if(!side)continue;const last=side==='up'?lastUp:lastDown;if(i<last+h)continue;
   const stats=totals[side==='up'?'retestUp':'retestDown'];stats.n++;const level=all[i].level;
   if(future.some(r=>r.low<=level&&r.high>=level))stats.yes++;
   if(side==='up')lastUp=i;else lastDown=i;
  }
  return {current,totals,horizonAvailable:true};
 }
 function rate(success,n){if(n<30)return '—';const p=success/n,z=1.96,den=1+z*z/n,center=(p+z*z/(2*n))/den,margin=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/den;return (p*100).toFixed(1)+'% · n='+n+' · 95% CI '+((center-margin)*100).toFixed(0)+'–'+((center+margin)*100).toFixed(0)+'%';}
 function clear(){for(const id of ['structureTrend','structureHighs','structureLows','structureHigh','structureLow','structureBOS','structureUp','structureDown','structureFlat','structureContinue','structureRetestUp','structureRetestDown'])document.getElementById(id).textContent='—';document.getElementById('structureStatus').textContent='Load closed-candle price history to scan market structure.';document.getElementById('structureSource').textContent='No current price source.';}
 function render(data,asset){const r=compute(data);if(!r)return clear();const set=(id,v)=>document.getElementById(id).textContent=v;const c=r.current,t=r.totals,d=t.direction;
  set('structureTrend',c.trend);set('structureHighs',String(c.highs));set('structureLows',String(c.lows));set('structureHigh',c.high===undefined?'—':c.high.toFixed(4));set('structureLow',c.low===undefined?'—':c.low.toFixed(4));set('structureBOS',c.bos==='up'?'Upward BOS':c.bos==='down'?'Downward BOS':'No new confirmed break');
  set('structureUp',rate(d.up,d.n));set('structureDown',rate(d.down,d.n));set('structureFlat',rate(d.flat,d.n));set('structureContinue',rate(c.trend==='Bullish'?d.up:d.down,d.n));set('structureRetestUp',rate(t.retestUp.yes,t.retestUp.n));set('structureRetestDown',rate(t.retestDown.yes,t.retestDown.n));
  set('structureSource',asset+' · '+data.length+' candles · '+new Date(data.at(-1).timestamp).toLocaleString());
  set('structureStatus',!r.horizonAvailable?'30-minute statistics require regular candles of 30 minutes or less.':d.n<30?'Insufficient comparable history: at least 30 non-overlapping outcomes are required for each percentage.':'Historical frequencies for the next 30 minutes. These are not calibrated predictions.');
 }
 return {states,compute,rate,render,clear};
})();
