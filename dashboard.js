(() => {
 const $=id=>document.getElementById(id);
 function summarize(data,evaluate){
  const outcomes=[],markers=[];let nextEligible=0;
  for(let i=29;i<data.length;i++){
   const e=evaluate(data.slice(0,i+1));if(e.side==='Wait')continue;
   markers.push({time:Math.floor(data[i].timestamp/1000),position:e.side==='Buy'?'belowBar':'aboveBar',color:e.side==='Buy'?'#3be5af':'#ff7a8a',shape:e.side==='Buy'?'arrowUp':'arrowDown',text:e.side+' setup'});
   if(i<nextEligible)continue;
   const end=data[i].timestamp+1800000,j=data.findIndex((r,k)=>k>i&&r.timestamp>=end);
   if(j<0||data[j].timestamp!==end)continue;
   const gaps=data.slice(i+1,j+1).map((r,k)=>r.timestamp-data[i+k].timestamp);if(gaps.some(g=>g!==gaps[0]))continue;
   const delta=(data[j].close-data[i].close)*(e.side==='Buy'?1:-1);
   outcomes.push({side:e.side,delta,entryTime:data[i].timestamp,exitTime:end});nextEligible=j+1;
  }
  return {outcomes,markers};
 }
 let chart,series,markerPlugin,identity='',latest=null;
 function clear(){latest=null;$('observedTrend').textContent='Waiting for verified prices';$('signalHistory').textContent='No verified history loaded.';$('localHistoryStatus').textContent='Local history is stored only in this browser.';$('analysisChart').hidden=true;}
 function render(data,evaluate,asset,timeframe){
  latest={data,evaluate,asset,timeframe};const summary=summarize(data,evaluate),last=data.at(-1);
  const avg=n=>data.slice(-n).reduce((s,r)=>s+r.close,0)/n;
  $('observedTrend').textContent=data.length<50?'Insufficient history':last.close>avg(20)&&avg(20)>avg(50)?'Bullish price alignment':last.close<avg(20)&&avg(20)<avg(50)?'Bearish price alignment':'Mixed / range';
  $('trendExplanation').textContent='Observed close versus 20- and 50-candle averages. Describes recent prices; does not predict the next 30 minutes.';
  const wins=summary.outcomes.filter(x=>x.delta>0).length,flat=summary.outcomes.filter(x=>x.delta===0).length,n=summary.outcomes.length;
  $('signalHistory').textContent=n<30?'Insufficient sample: '+n+' completed, non-overlapping signals; at least 30 required.':(100*wins/n).toFixed(1)+'% moved in signal direction at +30 min · '+n+' signals · '+flat+' unchanged. In-sample descriptive rate, not trade win rate. Costs, execution and stop/target paths excluded.';
  $('historyRange').textContent=data.length+' closed candles · '+new Date(data[0].timestamp).toLocaleString()+' – '+new Date(last.timestamp).toLocaleString()+'. This is the available sample, not a five-year backtest.';
  if(window.LightweightCharts){
   $('analysisChart').hidden=false;
   if(!chart){chart=LightweightCharts.createChart($('analysisChart'),{autoSize:true,height:350,layout:{background:{color:'#0a1421'},textColor:'#b6c5d8',attributionLogo:true},grid:{vertLines:{color:'#182738'},horzLines:{color:'#182738'}},timeScale:{timeVisible:true}});series=chart.addSeries(LightweightCharts.CandlestickSeries,{upColor:'#3be5af',downColor:'#ff7a8a',borderVisible:false,wickUpColor:'#3be5af',wickDownColor:'#ff7a8a'});markerPlugin=LightweightCharts.createSeriesMarkers(series,[]);}
   const key=asset+'|'+timeframe,view=data.slice(-300).map(r=>({time:Math.floor(r.timestamp/1000),open:r.open,high:r.high,low:r.low,close:r.close}));series.setData(view);markerPlugin.setMarkers(summary.markers.filter(r=>r.time>=view[0].time));if(identity!==key){identity=key;chart.timeScale().fitContent();}
   $('chart').hidden=true;
  }
  saveHistory(asset,timeframe,data);
 }
 let dbPromise;
 function database(){if(!dbPromise)dbPromise=new Promise((resolve,reject)=>{if(!window.indexedDB)return reject(Error('Unavailable'));const request=indexedDB.open('making-money-history',1);request.onupgradeneeded=()=>request.result.createObjectStore('candles',{keyPath:'key'});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});return dbPromise;}
 async function saveHistory(asset,timeframe,data){try{const db=await database(),key=asset+'|'+timeframe;const tx=db.transaction('candles','readwrite'),s=tx.objectStore('candles'),r=s.get(key);r.onsuccess=()=>{const map=new Map((r.result?.data||[]).map(x=>[x.timestamp,x]));for(const x of data)map.set(x.timestamp,x);const merged=[...map.values()].sort((a,b)=>a.timestamp-b.timestamp).slice(-10000);s.put({key,data:merged,savedAt:Date.now()});tx.oncomplete=()=>{$('localHistoryStatus').textContent='Saved '+merged.length+' candles locally for '+asset+' · '+timeframe+'. Up to 10,000 per market/timeframe; no server archive yet.';};};tx.onerror=()=>{$('localHistoryStatus').textContent='Local history could not be saved.';};}catch{$('localHistoryStatus').textContent='Local storage unavailable; live analysis still works.';}}
 function init(){
  let watch=[];try{const raw=JSON.parse(localStorage.getItem('making-money-watchlist')||'[]');if(Array.isArray(raw))watch=raw.filter(x=>typeof x==='string'&&[...$('pair').options].some(o=>o.value===x)).slice(0,12);}catch{}
  function paint(){const host=$('watchlist');host.replaceChildren();for(const symbol of watch){const row=document.createElement('div'),open=document.createElement('button'),remove=document.createElement('button');open.textContent=[...$('pair').options].find(o=>o.value===symbol)?.textContent||symbol;open.onclick=()=>{$('pair').value=symbol;$('pair').dispatchEvent(new Event('change'));};remove.textContent='×';remove.setAttribute('aria-label','Remove '+open.textContent);remove.onclick=()=>{watch=watch.filter(x=>x!==symbol);persist();paint();};row.append(open,remove);host.append(row);}if(!watch.length)host.textContent='Save a market to return to it quickly.';}
  function persist(){try{localStorage.setItem('making-money-watchlist',JSON.stringify(watch));}catch{$('watchlist').textContent='This browser cannot save your list.';}}
  $('saveMarket').onclick=()=>{const symbol=$('pair').value;if(!watch.includes(symbol)&&watch.length<12)watch.push(symbol);persist();paint();};paint();
  $('exportHistory').onclick=()=>{if(!latest)return;const d=latest.data,blob=new Blob(['time,open,high,low,close\n'+d.map(r=>[new Date(r.timestamp).toISOString(),r.open,r.high,r.low,r.close].join(',')).join('\n')],{type:'text/csv'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='making-money-history.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  for(const id of ['pair','tf','asset'])$(id).addEventListener('change',clear);
  let acknowledged=false;try{acknowledged=localStorage.getItem('making-money-notice-v1')==='seen';}catch{}$('riskNotice').hidden=acknowledged;$('acknowledgeRisk').onclick=()=>{try{localStorage.setItem('making-money-notice-v1','seen');}catch{}$('riskNotice').hidden=true;};
 }
 window.MMDashboard={summarize,render,clear,init};
})();
