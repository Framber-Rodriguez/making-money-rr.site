(() => {
 const $=id=>document.getElementById(id),format=n=>Number(n).toLocaleString(undefined,{maximumFractionDigits:4});
 function clear(){for(const id of ['technicalTrend','technicalIndicators','technicalLevels','technicalPatterns','learningJournal'])$(id).textContent='Waiting for verified closed candles.';}
 function render(rows){if(!window.MMAuth.signedIn()){clear();return;}const c=window.MMTechnical.analyze(rows);if(!c.available){$('technicalTrend').textContent=c.reason;return;}
  $('technicalTrend').textContent=c.trend+' · EMA 20 / 50';
  $('technicalIndicators').textContent='RSI 14: '+c.rsi.toFixed(1)+' · MACD: '+format(c.macd)+' · ATR 14: '+format(c.atr)+' · Bollinger bands: '+format(c.bands.lower)+' – '+format(c.bands.upper)+'. '+(c.volumeRatio===null?'Volume confirmation unavailable.':'Relative volume: '+c.volumeRatio.toFixed(2)+'×.');
  $('technicalLevels').textContent='Support: '+format(c.support)+' · Resistance: '+format(c.resistance)+'. Rolling 20-candle levels.';
  $('technicalPatterns').replaceChildren();if(!c.patterns.length)$('technicalPatterns').textContent='No pattern matched the current rules.';
  for(const p of c.patterns){const item=document.createElement('li');item.textContent=p.name+' · '+(p.side===1?'Bullish':p.side===-1?'Bearish':'Neutral')+' · '+(p.confirmed?'Rule matched':'Awaiting confirmation')+(p.level===null?'':' · level '+format(p.level));$('technicalPatterns').append(item);}
 }
 window.addEventListener('mmprices',e=>render(e.detail.rows));window.addEventListener('mmstop',clear);window.addEventListener('mmsession',clear);
 window.addEventListener('mmlearning',e=>{if(!window.MMAuth.signedIn())return;const m=e.detail.metrics;$('learningJournal').textContent='Server forecast journal · '+m.n+' scored outcomes · '+m.pending+' pending · '+m.missing+' missing · '+m.flat+' unchanged. '+(m.n?'Brier: '+m.brier.toFixed(3)+' / baseline '+m.baselineBrier.toFixed(3)+'. ':'Only predictions issued before their outcome are counted. ');});
 clear();
})();
