import {backtest,trainVisual,validateCandles} from './research.mjs';
import {emailCredentials} from './account-auth.mjs';
const API='https://making-money-api.vercel.app',el=id=>document.getElementById(id);
let config=null,auth=null,session=null,latest=null,archiveRows=[],archiveIdentity='',socket=null,retry=null,streamEpoch=0,delay=1000,running=false,streamState=null,visualIdentity='',historyBusy=false,cancelHistory=false,accountRole='member',accountProfile=null;
const status=(id,text)=>{if(el(id))el(id).textContent=text;};
const minutes=()=>({'1 minute':1,'5 minutes':5,'15 minutes':15,'30 minutes':30,'1 hour':60}[el('tf').value]);
const selection=()=>({symbol:el('pair').value,minutes:minutes()});
async function call(op,body,method='POST'){
 const url=new URL('/api/platform',API);url.searchParams.set('op',op);if(method==='GET'&&body)Object.entries(body).forEach(([k,v])=>url.searchParams.set(k,v));
 const response=await fetch(url,{method,headers:{...(body&&method==='POST'?{'Content-Type':'application/json'}:{}),...(session?{Authorization:'Bearer '+session.access_token}:{})},...(body&&method==='POST'?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(65000)});
 const data=await response.json();if(!response.ok)throw Error(data.error||'Service unavailable.');return data;
}
window.MMAuthHeaders=()=>session?{Authorization:'Bearer '+session.access_token}:{};
async function refreshAccount(){
 const identity=session?.user?.id;if(!identity){accountRole='member';return;}
 try{const a=await call('account',null,'GET');if(session?.user?.id!==identity)return;accountRole=a.role||'member';accountProfile=a.profile;paintProfile(a);window.MMAuth.setAccount(a);updateControls();status('accountStatus',a.email+' · '+(a.role==='owner'?'Owner access':('Plan: '+a.status)));}
 catch(e){if(session?.user?.id===identity){accountRole='member';status('accountStatus','Signed in. Account access could not be verified: '+e.message);}}
}
function paintProfile(account){
 el('profileForm').hidden=!session;
 const p=account.profile||{};el('profileFormTitle').textContent=p.complete?'Account details':'Complete your account';
 if(!el('profileForm').contains(document.activeElement)){
  el('firstName').value=p.first_name||'';el('lastName').value=p.last_name||'';el('alertEmail').value=p.alert_email||account.email||'';
  el('profileTimezone').value=p.timezone||Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';
 }
}
function current(){return window.MMMonitorState?.();}
function updateControls(){
 const signed=!!session;el('profileForm').hidden=!signed;el('loginForm').hidden=signed||!config?.auth;el('logout').hidden=!signed;el('checkBilling').hidden=!(signed&&accountRole==='owner');el('subscribePlan').hidden=el('managePlan').hidden=accountRole==='owner';
 for(const [id,key] of [['extendHistory','history'],['archivePrices','database'],['importHistory','history'],['loadArchive','database'],['saveVisual','database'],['enablePush','push'],['disablePush','push'],['loadNews','news'],['subscribePlan','billing'],['managePlan','billing']])el(id).disabled=!(signed&&config?.[key]&&(['subscribePlan','managePlan'].includes(id)||window.MMAuth.signedIn()));
}
function stopStream(){streamEpoch++;clearTimeout(retry);retry=null;if(socket){socket.onclose=null;socket.close();socket=null;}streamState=null;}
function startStream(){
 stopStream();if(!running||!window.MMAuth.signedIn())return;const state=current();if(!state?.active)return;
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
 latest=detail;status('backtestResult','Current feed ready: '+detail.rows.length+' closed candles. Run a simulation to include execution assumptions.');
 const key=detail.symbol+'|'+detail.minutes+'|'+detail.rows.at(-1).timestamp;
 if(visualIdentity!==key){visualIdentity=key;const defer=window.requestIdleCallback||((fn)=>setTimeout(fn,1000));defer(()=>{
  if(latest!==detail||!window.MMAuth.signedIn())return;try{const model=trainVisual(detail.rows,detail.minutes);const output={...model,weights:undefined};status('visualResult',model.reason+' '+(model.brier===undefined?'':'Test Brier '+model.brier.toFixed(3)+' / baseline '+model.baseline.toFixed(3)+'. ')+(model.up==null?'':'Experimental higher-close estimate '+(model.up*100).toFixed(1)+'%. '));
   localStorage.setItem('making-money-visual-'+detail.symbol+'-'+detail.minutes,JSON.stringify(model));
  }catch(e){status('visualResult',e.message);}
 },0);}
}
function selectedData(){const s=selection();if(archiveRows.length&&archiveIdentity===s.symbol+'|'+s.minutes)return archiveRows;if(!latest||latest.symbol!==s.symbol||latest.minutes!==s.minutes)throw Error('Wait for verified prices for this market/timeframe.');return latest.rows;}
function formatReport(report){
 const rate=v=>v==null?'No trades':v.toFixed(1)+'%';
 return 'Sample: '+new Date(report.coverage.from).toLocaleDateString()+' – '+new Date(report.coverage.to).toLocaleDateString()+' · '+report.coverage.candles+' candles. '+report.all.trades+' simulated trades · net win rate '+rate(report.all.winRate)+' · net P/L '+report.all.netPnl.toFixed(2)+' · maximum closed-trade drawdown '+report.all.maxDrawdown.toFixed(2)+' (quote currency, one unit). Last 30% holdout: '+report.holdout.trades+' trades, '+rate(report.holdout.winRate)+'. Skipped incomplete/gapped horizons: '+report.skipped+'. '+report.limitations;
}
function task(id,fn){el(id).addEventListener('click',async()=>{if(!['subscribePlan','managePlan'].includes(id)&&!window.MMAuth.require(id))return;if(!session){window.MMAuth.open();return;}const button=el(id);button.disabled=true;try{await fn();}catch(e){status(['subscribePlan','managePlan'].includes(id)?'billingFeedback':'serviceFeedback',e.message);}finally{updateControls();if(['runBacktest','trainVisual'].includes(id))button.disabled=false;}});}
async function loadHistory(s=selection(),full=false){
 const data=[];let offset=0;
 for(let i=0;i<(full?60:4);i++){if(!window.MMAuth.signedIn())break;const r=await call('history',{...s,offset,recent:true},'GET');data.push(...r.candles);status('archiveProgress','Loading archive: '+data.length+' candles…');if(r.next===null)break;offset=r.next;}
 data.sort((a,b)=>a.timestamp-b.timestamp);
 if(!data.length){status('archiveProgress','No archived candles yet. Expand history to download provider data.');return;}
 validateCandles(data);if(selection().symbol!==s.symbol||minutes()!==s.minutes)return;
 archiveRows=data;archiveIdentity=s.symbol+'|'+s.minutes;window.MMsetEvaluationHistory?.(s.symbol,s.minutes,data);
 status('archiveProgress','Loaded '+data.length+' archived candles · '+new Date(data[0].timestamp).toLocaleDateString()+' – '+new Date(data.at(-1).timestamp).toLocaleDateString()+'. Directional evaluation uses up to 20,000 newest candles; backtesting uses this loaded archive.');
}
async function expandHistory(s=selection()){
 if(historyBusy){status('serviceFeedback','A history import is already running.');return;}historyBusy=true;cancelHistory=false;el('cancelHistory').hidden=false;
 const key='mm-import-'+s.symbol+'-'+s.minutes;let count=0;
 try{
  for(let page=0;page<3&&!cancelHistory;page++){
   if(!session||!window.MMAuth.signedIn()||selection().symbol!==s.symbol||minutes()!==s.minutes)break;
   const before=localStorage.getItem(key);status('archiveProgress','Importing page '+(page+1)+' of 3 for '+s.symbol+'…');
   const r=await call('import',{...s,...(before?{before}:{})});count+=r.saved;
   if(r.before)localStorage.setItem(key,r.before);
   status('archiveProgress',count+' candles saved · oldest requested: '+(r.before||r.requestedFrom)+'.');
   if(r.complete)break;
  }
  await loadHistory(s);
 }finally{historyBusy=false;el('cancelHistory').hidden=true;updateControls();}
}
async function prepareHistory(){
 const s=selection(),key='mm-expanded-'+s.symbol+'-'+s.minutes;
 try{
  if(el('autoHistory').checked&&Date.now()-Number(localStorage.getItem(key)||0)>86400000){localStorage.setItem(key,String(Date.now()));await expandHistory(s);}
  else await loadHistory(s);
 }catch(e){status('archiveProgress','History expansion paused: '+e.message+' Current feed remains separate. Use Expand history to retry.');}
}
async function boot(){
 el('enginePanel').hidden=false;
 task('runBacktest',async()=>{const report=backtest(selectedData(),{minutes:minutes(),costsBps:Number(el('testCosts').value),slippageBps:Number(el('testSlippage').value)});status('backtestResult',formatReport(report));});
 task('trainVisual',async()=>{const model=trainVisual(selectedData(),minutes());status('visualResult',model.reason+' Training '+(model.train||0)+' · test '+(model.test||0)+'. '+(model.brier===undefined?'':'Brier '+model.brier.toFixed(3)+' / baseline '+model.baseline.toFixed(3)+'. ')+ (model.scope||'Generated chart pixels only.'));localStorage.setItem('making-money-visual-'+selection().symbol+'-'+minutes(),JSON.stringify(model));});
 task('archivePrices',async()=>{const r=await call('archive',selection());status('serviceFeedback','Saved '+r.saved+' provider candles to the server archive.');});
 task('importHistory',async()=>{
  const s=selection(),key='mm-import-'+s.symbol+'-'+s.minutes,before=localStorage.getItem(key),r=await call('import',{...s,...(before?{before}:{})});
  if(r.before)localStorage.setItem(key,r.before);status('archiveProgress',r.saved+' candles saved this page · reached '+(r.before||r.requestedFrom)+'. '+(r.complete?'Five-year date boundary reached. Verify missing bars before interpreting results.':'More pages required; click again to continue. Each page uses provider credits.'));
 });
 task('loadArchive',async()=>{await loadHistory(selection(),true);});
 task('extendHistory',async()=>{await expandHistory();});
 el('cancelHistory').onclick=()=>{cancelHistory=true;status('archiveProgress','Stopping after the current provider request…');};
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
 for(const op of [['subscribePlan','checkout'],['managePlan','portal']])task(op[0],async()=>{status('billingFeedback','Opening secure billing…');const r=await call(op[1],{});const url=new URL(r.url);if(url.protocol!=='https:'||!['checkout.stripe.com','billing.stripe.com'].includes(url.hostname))throw Error('Invalid billing destination.');window.location.assign(url.href);});
 el('checkBilling').onclick=async()=>{el('checkBilling').disabled=true;status('billingFeedback','Checking production payment setup…');try{const r=await call('billing-status',null,'GET');status('billingFeedback',r.message);}catch(e){status('billingFeedback',e.message);}finally{el('checkBilling').disabled=false;}};
 async function sendLogin(form,input,feedback){
  const button=form.querySelector('button[type="submit"]');button.disabled=true;
  try{if(!auth)throw Error('Secure sign-in is not ready. Please try again shortly.');
   const value=input.value.trim();if(form.id!=='registerForm'&&!value.includes('@')){const r=await call('owner-login',{username:value});status(feedback,r.message);return;}
   if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))throw Error('Enter a valid email address or your assigned username.');
   const registering=form.id==='registerForm';const fields=registering?{first_name:el('registerFirstName').value,last_name:el('registerLastName').value,alert_email:el('registerAlertEmail').value,timezone:el('registerTimezone').value}:null;const {error}=await auth.auth.signInWithOtp(emailCredentials(value,fields,location.origin+location.pathname));
   if(error){const code=error.code||'';throw Error(code==='over_email_send_rate_limit'||error.status===429?'Too many email requests. Wait a few minutes before requesting a fresh link.':code==='email_address_not_authorized'?'Email delivery is restricted by the authentication provider. The owner must configure production email delivery.':code==='otp_disabled'||code==='user_not_found'?'Use Create account first if this email is not registered.':'Could not send the secure link ('+(code||error.status||'email service')+'). Check your email or retry in a minute.');}
   status(feedback,registering?'Check your inbox and spam folder. Confirm your email with the newest link to activate your account. Your details will appear in My profile.':'Check your inbox and spam folder. Open the newest sign-in link once to enter your account.');
  }catch(e){status(feedback,e.message);}finally{button.disabled=false;}
 }
 el('registerForm').addEventListener('submit',e=>{e.preventDefault();sendLogin(e.currentTarget,el('registerEmail'),'registerFeedback');});
 el('loginForm').addEventListener('submit',e=>{e.preventDefault();sendLogin(e.currentTarget,el('accountEmail'),'accountStatus');});
 el('modalLoginForm').addEventListener('submit',e=>{e.preventDefault();sendLogin(e.currentTarget,el('modalEmail'),'loginFeedback');});
 const zones=Intl.supportedValuesOf?Intl.supportedValuesOf('timeZone'):['UTC'];const localZone=Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';
 for(const id of ['profileTimezone','registerTimezone']){el(id).replaceChildren(...[...new Set(['UTC',localZone,...zones])].map(zone=>{const o=document.createElement('option');o.value=o.textContent=zone;return o;}));el(id).value=localZone;}
 el('profileForm').addEventListener('submit',async e=>{e.preventDefault();const button=el('saveProfile');button.disabled=true;status('profileFeedback','Saving…');try{await call('profile',{first_name:el('firstName').value,last_name:el('lastName').value,alert_email:el('alertEmail').value,timezone:el('profileTimezone').value});await refreshAccount();status('profileFeedback','Account details saved.');}catch(err){status('profileFeedback',err.message);}finally{button.disabled=false;}});
 el('logout').onclick=async()=>{await auth?.auth.signOut();session=null;accountRole='member';window.MMAuth.setSession(null);updateControls();stopStream();status('accountStatus','Signed out.');};
 try{el('autoHistory').checked=localStorage.getItem('mm-auto-history')!=='false';}catch{}
 el('autoHistory').onchange=()=>{try{localStorage.setItem('mm-auto-history',String(el('autoHistory').checked));}catch{}};
 window.addEventListener('mmprices',e=>{if(window.MMAuth.signedIn())receive(e.detail);});
 window.addEventListener('mmstart',()=>{running=true;latest=null;archiveRows=[];status('backtestResult','Waiting for the selected market’s closed candles.');status('visualResult','Waiting for enough verified chart history.');if(config)startStream();if(session&&config?.history)prepareHistory();});
 window.addEventListener('mmstop',()=>{running=false;latest=null;archiveRows=[];stopStream();status('streamStatus','Stream stopped.');});
 window.addEventListener('pagehide',stopStream);
 window.addEventListener('mmaccess',()=>{if(!window.MMAuth.signedIn())stopStream();});
 setInterval(()=>{if(session)refreshAccount();},60000);window.addEventListener('focus',()=>{if(session)refreshAccount();});
 const initial=current();if(initial?.rows?.length)receive(initial);running=!!initial?.active;
 try{
  config=await call('config',null,'GET');
  status('billingAvailability',config.billing?'Sign in to access secure subscription checkout.':'Subscription checkout is awaiting payment-service setup. No payment can be taken yet.');
  status('servicesStatus','Server archive: '+(config.database?'configured':'setup required')+' · background alerts: '+(config.push?'configured':'setup required')+' · news: '+(config.news?'configured':'setup required')+' · subscriptions: '+(config.billing?'configured':'setup required')+'.');
  status('accountStatus',config.auth?'Sign in to analyze markets and use server features.':'Accounts and server history are awaiting service setup. Live analysis and local research remain available.');
  if(config.auth){const {createClient}=await import('https://esm.sh/@supabase/supabase-js@2.57.4');auth=createClient(config.public.supabaseUrl,config.public.supabaseKey);const {data,error:sessionError}=await auth.auth.getSession();session=data.session;if(sessionError){window.MMAuth.open('','login');status('loginFeedback','This sign-in link is invalid or expired. Request a new one.');}
   auth.auth.onAuthStateChange((_event,next)=>{session=next;if(!next)accountRole='member';window.MMAuth.setSession(next);updateControls();startStream();status('accountStatus',session?'Signed in: '+session.user.email:'Signed out.');if(next)setTimeout(refreshAccount,0);});
   if(session)await refreshAccount();
  }
  window.MMAuth.setSession(session);if(session)await refreshAccount();updateControls();startStream();
 }catch(e){status('servicesStatus','Server feature status unavailable: '+e.message);updateControls();startStream();}
}
boot();
