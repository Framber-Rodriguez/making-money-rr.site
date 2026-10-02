import {backtest,trainVisual,validateCandles} from './research.mjs';
const API='https://making-money-api.vercel.app',el=id=>document.getElementById(id);
let config=null,auth=null,session=null,latest=null,archiveRows=[],archiveIdentity='',socket=null,retry=null,streamEpoch=0,delay=1000,running=false,streamState=null,visualIdentity='';
const status=(id,text)=>{if(el(id))el(id).textContent=text;};
const minutes=()=>({'1 minute':1,'5 minutes':5,'15 minutes':15,'30 minutes':30,'1 hour':60}[el('tf').value]);
const selection=()=>({symbol:el('pair').value,minutes:minutes()});
async function call(op,body,method='POST'){
 const url=new URL('/api/platform',API);url.searchParams.set('op',op);if(method==='GET'&&body)Object.entries(body).forEach(([k,v])=>url.searchParams.set(k,v));
 const response=await fetch(url,{method,headers:{...(body&&method==='POST'?{'Content-Type':'application/json'}:{}),...(session?{Authorization:'Bearer '+session.access_token}:{})},...(body&&method==='POST'?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(65000)});
 const data=await response.json();if(!response.ok)throw Error(data.error||'Service unavailable.');return data;
}
function current(){return window.MMMonitorState?.();}
function updateControls(){
 const signed=!!session;el('loginForm').hidden=!config?.auth;el('logout').hidden=!signed;
 for(const [id,key] of [['archivePrices','database'],['importHistory','history'],['loadArchive','database'],['saveVisual','database'],['enablePush','push'],['disablePush','push'],['loadNews','news'],['subscribePlan','billing'],['managePlan','billing']])el(id).disabled=!(signed&&config?.[key]);
}
function stopStream(){streamEpoch++;clearTimeout(retry);retry=null;if(socket){socket.onclose=null;socket.close();socket=null;}streamState=null;}
function startStream(){
 stopStream();if(!running)return;const state=current();if(!state?.active)return;
 const crypto={XBTUSD:'BTC/USD',ETHUSD:'ETH/USD',SOLUSD:'SOL/USD'}[state.symbol];
 if(!crypto&&(!config?.websocket?.twelve||!session)){status('streamStatus','Closed-candle REST monitoring active. This market’s streaming requires sign-in and provider WebSocket access.');return;}
 const epoch=streamEpoch;delay=1000;streamState=state;
 const connect=()=>{
  if(epoch!==streamEpoch||!running)return;
  status('streamStatus','Connecting price stream…');socket=new WebSocket(crypto?'wss://ws.kraken.com/v2':API.replace('https:','wss:')+'/api/ws');
  socket.onopen=()=>{delay=1000;socket.send(JSON.stringify(crypto?{method:'subscribe',params:{channel:'ohlc',symbol:[crypto],interval:state.minutes}}:{symbol:state.symbol,token:session.access_token}));};
  const pending=new Map();
  socket.onmessage=e=>{if(epoch!==streamEpoch)return;try{
   const message=JSON.parse(e.data);if(message.type==='error'){status('streamStatus',message.message);return;}
   if(message.success===false){status('streamStatus','Stream subscription unavailable. REST fallback remains active.');socket.close();return;}
   if(crypto&&message.channel==='ohlc'){
    for(const r of message.data||[]){if(r.symbol!==crypto||r.interval!==state.minutes)continue;const row={timestamp:Date.parse(r.interval_begin),open:Number(r.open),high:Number(r.high),low:Number(r.low),close:Number(r.close),volume:Number(r.volume)};
     if(['timestamp','open','high','low','close'].some(k=>!Number.isFinite(row[k])))continue;
     pending.set(row.timestamp,row);
     status('streamStatus','Kraken WebSocket · '+crypto+' · latest candle price '+row.close.toFixed(4)+' · '+new Date().toLocaleTimeString()+'. Signals use closed candles only.');
    }
    const closed=[...pending.values()].filter(r=>r.timestamp+state.minutes*60000<=Date.now()).sort((a,b)=>a.timestamp-b.timestamp);
    if(closed.length)window.MMacceptStreamCandles?.(state.symbol,state.minutes,closed);
    for(const timestamp of pending.keys())if(timestamp+state.minutes*60000<Date.now()-state.minutes*60000)pending.delete(timestamp);
   }else if(message.type==='tick')status('streamStatus','Twelve Data WebSocket · '+state.symbol+' · '+Number(message.price).toFixed(4)+' · '+new Date(message.timestamp).toLocaleTimeString()+'. Closed candles refresh separately.');
  }catch{}};
  socket.onerror=()=>status('streamStatus','Stream interrupted. REST monitoring remains available.');
  socket.onclose=()=>{if(epoch!==streamEpoch||!running)return;status('streamStatus','Stream disconnected; reconnecting. REST monitoring remains available.');retry=setTimeout(connect,delay);delay=Math.min(delay*2,30000);};
 };
 connect();
}
function receive(detail){
 latest=detail;archiveRows=[];status('backtestResult','Current feed ready: '+detail.rows.length+' closed candles. Run a simulation to include execution assumptions.');
 const key=detail.symbol+'|'+detail.minutes+'|'+detail.rows.at(-1).timestamp;
 if(visualIdentity!==key){visualIdentity=key;setTimeout(()=>{
  if(latest!==detail)return;try{const model=trainVisual(detail.rows,detail.minutes);const output={...model,weights:undefined};status('visualResult',model.reason+' '+(model.brier===undefined?'':'Test Brier '+model.brier.toFixed(3)+' / baseline '+model.baseline.toFixed(3)+'. ')+(model.up==null?'':'Experimental higher-close estimate '+(model.up*100).toFixed(1)+'%. '));
   localStorage.setItem('making-money-visual-'+detail.symbol+'-'+detail.minutes,JSON.stringify(model));
  }catch(e){status('visualResult',e.message);}
 },0);}
}
function selectedData(){const s=selection();if(archiveRows.length&&archiveIdentity===s.symbol+'|'+s.minutes)return archiveRows;if(!latest||latest.symbol!==s.symbol||latest.minutes!==s.minutes)throw Error('Wait for verified prices for this market/timeframe.');return latest.rows;}
function formatReport(report){
 const rate=v=>v==null?'No trades':v.toFixed(1)+'%';
 return 'Sample: '+new Date(report.coverage.from).toLocaleDateString()+' – '+new Date(report.coverage.to).toLocaleDateString()+' · '+report.coverage.candles+' candles. '+report.all.trades+' simulated trades · net win rate '+rate(report.all.winRate)+' · net P/L '+report.all.netPnl.toFixed(2)+' · maximum closed-trade drawdown '+report.all.maxDrawdown.toFixed(2)+' (quote currency, one unit). Last 30% holdout: '+report.holdout.trades+' trades, '+rate(report.holdout.winRate)+'. Skipped incomplete/gapped horizons: '+report.skipped+'. '+report.limitations;
}
function task(id,fn){el(id).addEventListener('click',async()=>{const button=el(id);button.disabled=true;try{await fn();}catch(e){status('serviceFeedback',e.message);}finally{updateControls();if(['runBacktest','trainVisual'].includes(id))button.disabled=false;}});}
async function boot(){
 el('enginePanel').hidden=false;
 task('runBacktest',async()=>{const report=backtest(selectedData(),{minutes:minutes(),costsBps:Number(el('testCosts').value),slippageBps:Number(el('testSlippage').value)});status('backtestResult',formatReport(report));});
 task('trainVisual',async()=>{const model=trainVisual(selectedData(),minutes());status('visualResult',model.reason+' Training '+(model.train||0)+' · test '+(model.test||0)+'. '+(model.brier===undefined?'':'Brier '+model.brier.toFixed(3)+' / baseline '+model.baseline.toFixed(3)+'. ')+ (model.scope||'Generated chart pixels only.'));localStorage.setItem('making-money-visual-'+selection().symbol+'-'+minutes(),JSON.stringify(model));});
 task('archivePrices',async()=>{const r=await call('archive',selection());status('serviceFeedback','Saved '+r.saved+' provider candles to the server archive.');});
 task('importHistory',async()=>{
  const s=selection(),key='mm-import-'+s.symbol+'-'+s.minutes,before=localStorage.getItem(key),r=await call('import',{...s,...(before?{before}:{})});
  if(r.before)localStorage.setItem(key,r.before);status('archiveProgress',r.saved+' candles saved this page · reached '+(r.before||r.requestedFrom)+'. '+(r.complete?'Five-year date boundary reached. Verify missing bars before interpreting results.':'More pages required; click again to continue. Each page uses provider credits.'));
 });
 task('loadArchive',async()=>{
  const s=selection(),data=[];let offset=0;
  // Bounded to 300,000 candles: sufficient for five years of 15/30-minute history.
  for(let i=0;i<60;i++){const r=await call('history',{...s,offset},'GET');data.push(...r.candles);status('archiveProgress','Loaded '+data.length+' archive candles…');if(r.next===null)break;offset=r.next;}
  validateCandles(data);archiveRows=data;archiveIdentity=s.symbol+'|'+s.minutes;status('archiveProgress','Loaded '+data.length+' archived candles for research. Limited to 300,000 per load; verify the date range. Live prices remain separate.');
 });
 task('saveVisual',async()=>{const r=await call('model',selection());status('serviceFeedback','Provider-derived pixel model stored in your server account. '+r.reason);});
 task('loadNews',async()=>{
  const r=await call('news',selection(),'GET');status('newsResult',(r.meanSentiment==null?'No sentiment score for a matched asset entity.':'Matched-entity sentiment '+r.meanSentiment.toFixed(2)+' on a −1 to +1 scale. ')+r.scope);
  el('newsList').replaceChildren(...r.articles.map(a=>{const li=document.createElement('li'),link=document.createElement('a');link.textContent=a.title;if(a.url){link.href=a.url;link.target='_blank';link.rel='noopener noreferrer';}li.append(link,document.createTextNode(' · '+a.source+' · '+new Date(a.publishedAt).toLocaleString()));return li;}));
 });
 task('enablePush',async()=>{
  if(!('serviceWorker' in navigator)||!('PushManager' in window))throw Error('This browser does not support background Web Push. On iPhone, install the site on the Home Screen and open it there.');
  const registration=await navigator.serviceWorker.register('./sw.js',{scope:'./'});await navigator.serviceWorker.ready;
  const permission=await Notification.requestPermission();if(permission!=='granted')throw Error('Notification permission was not granted.');
  const base64=config.public.vapidKey.replace(/-/g,'+').replace(/_/g,'/'),key=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));
  const subscription=await registration.pushManager.getSubscription()||await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
  await call('push',{...selection(),subscription:subscription.toJSON(),enabled:true});status('serviceFeedback','Background alerts enabled for the selected market/timeframe. Delivery is best effort, checked on the server schedule.');
 });
 task('disablePush',async()=>{await call('push',{...selection(),enabled:false});status('serviceFeedback','Background alerts disabled for this market/timeframe.');});
 for(const op of [['subscribePlan','checkout'],['managePlan','portal']])task(op[0],async()=>{const r=await call(op[1],{});const url=new URL(r.url);if(url.protocol!=='https:'||!['checkout.stripe.com','billing.stripe.com'].includes(url.hostname))throw Error('Invalid billing destination.');window.location.assign(url.href);});
 el('loginForm').addEventListener('submit',async e=>{e.preventDefault();try{if(!auth)throw Error('Accounts not configured.');const {error}=await auth.auth.signInWithOtp({email:el('accountEmail').value,emailOptions:undefined,options:{emailRedirectTo:location.origin+location.pathname}});if(error)throw Error('Sign-in email could not be sent.');status('accountStatus','Check your email for the secure sign-in link.');}catch(e){status('accountStatus',e.message);}});
 el('logout').onclick=async()=>{await auth?.auth.signOut();session=null;updateControls();startStream();status('accountStatus','Signed out.');};
 window.addEventListener('mmprices',e=>receive(e.detail));
 window.addEventListener('mmstart',()=>{running=true;latest=null;archiveRows=[];status('backtestResult','Waiting for the selected market’s closed candles.');status('visualResult','Waiting for enough verified chart history.');if(config)startStream();});
 window.addEventListener('mmstop',()=>{running=false;latest=null;archiveRows=[];stopStream();status('streamStatus','Stream stopped.');});
 window.addEventListener('pagehide',stopStream);
 const initial=current();if(initial?.rows?.length)receive(initial);running=!!initial?.active;
 try{
  config=await call('config',null,'GET');
  status('servicesStatus','Server archive: '+(config.database?'configured':'setup required')+' · background alerts: '+(config.push?'configured':'setup required')+' · news: '+(config.news?'configured':'setup required')+' · subscriptions: '+(config.billing?'configured':'setup required')+'.');
  status('accountStatus',config.auth?'Sign in to use server features.':'Accounts and server history are awaiting service setup. Live analysis and local research remain available.');
  if(config.auth){const {createClient}=await import('https://esm.sh/@supabase/supabase-js@2.57.4');auth=createClient(config.public.supabaseUrl,config.public.supabaseKey);const {data}=await auth.auth.getSession();session=data.session;
   auth.auth.onAuthStateChange((_event,next)=>{session=next;updateControls();startStream();status('accountStatus',session?'Signed in: '+session.user.email:'Signed out.');});
   if(session){const a=await call('account',null,'GET');status('accountStatus',a.email+' · Plan: '+a.status);}
  }
  updateControls();startStream();
 }catch(e){status('servicesStatus','Server feature status unavailable: '+e.message);updateControls();startStream();}
}
boot();
