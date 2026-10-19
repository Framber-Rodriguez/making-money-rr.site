// Remember browser monitoring intent per account, never authentication or prices.
(() => {
 const $=id=>document.getElementById(id),key=id=>'mm-monitor-v1:'+id;
 let attemptedFor=null;
 const user=()=>window.MMAuth?.userId?.();
 function save(active){
  const id=user();if(!id)return;
  try{localStorage.setItem(key(id),JSON.stringify({active,pair:$('pair').value,timeframe:$('tf').value}));}catch{}
 }
 window.addEventListener('mmstart',()=>{attemptedFor=user();save(true);});
 window.addEventListener('mmstop',event=>{if(event.detail?.remember!==false&&!window.MMRestoringMonitor)save(false);});
 window.addEventListener('mmaccess',()=>{
  const id=user();if(!id||!window.MMAuth?.signedIn()||attemptedFor===id||window.MMRestoringMonitor)return;
  attemptedFor=id;
  try{
   const saved=JSON.parse(localStorage.getItem(key(id))||'null');
   if(saved?.active!==true||$('live').disabled)return;
   if(![...$('pair').options].some(o=>o.value===saved.pair)||![...$('tf').options].some(o=>o.value===saved.timeframe))return;
   window.MMRestoringMonitor=true;
   $('pair').value=saved.pair;$('tf').value=saved.timeframe;
   $('pair').dispatchEvent(new Event('change'));$('tf').dispatchEvent(new Event('change'));
   $('live').click();
  }catch{}finally{window.MMRestoringMonitor=false;}
 });
 // Safari may restore the page from its back/forward cache after pagehide cleanup.
 window.addEventListener('pageshow',event=>{
  if(!event.persisted)return;attemptedFor=null;
  window.dispatchEvent(new Event('mmaccess'));
 });
})();
