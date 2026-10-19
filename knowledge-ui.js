(() => {
 const $=id=>document.getElementById(id),format=n=>Number(n).toLocaleString(undefined,{maximumFractionDigits:4});
 function clear(){for(const id of ['technicalTrend','technicalIndicators','technicalLevels','technicalPatterns','learningJournal','learningState'])$(id).textContent='Waiting for verified closed candles.';$('learningMetrics').replaceChildren();}
 function render(rows){if(!window.MMAuth.signedIn()){clear();return;}const c=window.MMTechnical.analyze(rows);if(!c.available){$('technicalTrend').textContent=c.reason;return;}
  $('technicalTrend').textContent=c.trend+' · EMA 20 / 50';
  $('technicalIndicators').textContent='RSI 14: '+c.rsi.toFixed(1)+' · MACD: '+format(c.macd)+' · ATR 14: '+format(c.atr)+' · Bollinger bands: '+format(c.bands.lower)+' – '+format(c.bands.upper)+'. '+(c.volumeRatio===null?'Volume confirmation unavailable.':'Relative volume: '+c.volumeRatio.toFixed(2)+'×.');
  $('technicalLevels').textContent='Support: '+format(c.support)+' · Resistance: '+format(c.resistance)+'. Rolling 20-candle levels.';
  $('technicalPatterns').replaceChildren();if(!c.patterns.length)$('technicalPatterns').textContent='No pattern matched the current rules.';
  for(const p of c.patterns){const item=document.createElement('li');item.textContent=p.name+' · '+(p.side===1?'Bullish':p.side===-1?'Bearish':'Neutral')+' · '+(p.confirmed?'Rule matched':'Awaiting confirmation')+(p.level===null?'':' · level '+format(p.level));$('technicalPatterns').append(item);}
 }
 window.addEventListener('mmprices',e=>render(e.detail.rows));window.addEventListener('mmstop',clear);window.addEventListener('mmpricesinvalid',clear);window.addEventListener('mmsession',clear);
 window.addEventListener('mmlearning',e=>{
  if(!window.MMAuth.signedIn())return;
  const report=e.detail,m=report.metrics||{n:0,pending:0,missing:0,flat:0};
  $('learningJournal').textContent='Server forecast journal · '+m.n+' scored outcomes · '+m.pending+' pending · '+m.missing+' missing · '+m.flat+' unchanged. '+(m.n?'Brier: '+m.brier.toFixed(3)+' / baseline '+m.baselineBrier.toFixed(3)+'. ':'Only predictions issued before their outcome are counted. ');
  const stamp=report.lastAttemptAt||report.updatedAt;
  $('learningState').textContent=(report.state==='historical_only'?'Historical evaluation only; current prices are not verified.':report.state==='monitoring'?'Monitoring with recent closed candles.':report.state==='not_started'?'No saved technical evaluation yet. Start monitoring to create one.':'Waiting for provider history.')+(stamp?' Last evaluation: '+new Date(stamp).toLocaleString()+'. ':' ')+(report.feed?.status==='archive_only'?'Provider refresh unavailable; using archived candles.':'');
  $('learningMetrics').replaceChildren();
  for(const h of [5,10,30]){
   const p=report.performance?.horizons?.[h],li=document.createElement('li');
   const trend=p?.improvement==='observed_improvement'?'Observed improvement; future performance is uncertain.':p?.improvement==='not_demonstrated'?'Improvement not demonstrated.':'Insufficient forward results to measure improvement.';
   li.textContent=h+' min · '+(p?.n?p.n+' non-overlapping outcomes · Direction accuracy: '+(p.accuracy*100).toFixed(1)+'% · Baseline: '+(p.baselineAccuracy*100).toFixed(1)+'%. ':'No scored forward outcomes. ')+trend;$('learningMetrics').append(li);
  }
 });
 let coverage=null;
 const stateLabel=m=>m.state==='queued'?'Queued':m.state==='waiting_for_history'?'Provider history unavailable':m.state==='monitoring'?'Recent history saved':m.state==='historical_only'?'Historical data only':'Not started';
 function paintCoverage(){
  const host=$('marketCoverageRows');host.replaceChildren();if(!coverage||!window.MMAuth.signedIn())return;
  const selected=$('pair').value,canonical=selected==='OANDA:XAUUSD'?'XAUUSD':selected;
  $('selectedMarketCoverage').textContent=coverage.markets.some(m=>m.symbol===canonical)?'Selected market has an automatic price-feed mapping. Actual access depends on the provider.':'Selected symbol is chart-only for automatic learning. A compatible licensed price feed is required.';
  for(const market of coverage.markets){
   for(const m of market.timeframes.length?market.timeframes:[{state:'not_started',interval:coverage.defaultInterval}]){
    const tr=document.createElement('tr');if(market.symbol===canonical)tr.className='selectedMarket';
    const scores=[5,10,30].map(h=>{const p=m.performance?.horizons?.[h];return h+'m: '+(p?.n?(p.accuracy*100).toFixed(1)+'% (n='+p.n+')':'—');}).join(' / ');
    for(const text of [market.providerSymbol+' · '+m.interval+'m',stateLabel(m)+(m.feed?.issue?.reason?' · '+m.feed.issue.reason:''),m.lastCandle?new Date(m.lastCandle).toLocaleString():'—',scores]){const td=document.createElement('td');td.textContent=text;tr.append(td);}host.append(tr);
   }
  }
  const evaluated=coverage.markets.filter(m=>m.timeframes.some(t=>t.lastAttemptAt)).length;
  $('marketCoverageStatus').textContent='Compatible markets: '+coverage.markets.length+' · Markets with a saved evaluation: '+evaluated+'. A saved evaluation does not establish prediction accuracy.';
 }
 window.addEventListener('mmcoverage',e=>{if(!window.MMAuth.signedIn())return;coverage=e.detail;paintCoverage();});
 $('pair').addEventListener('change',paintCoverage);
 window.addEventListener('mmsession',()=>{coverage=null;$('marketCoverageRows').replaceChildren();$('selectedMarketCoverage').textContent='';$('marketCoverageStatus').textContent='Sign in to check saved market coverage.';});
 clear();
})();
