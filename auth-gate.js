(() => {
 let signed=false,ready=false,pending='',access=null,expires=0,lastAllowed=false;
 const $=id=>document.getElementById(id),allowed=()=>signed&&!!access?.allowed&&(!expires||performance.now()<expires);
 const dialog=()=>$('loginDialog');
 function profile(){const d=$('profileDialog');if(!d.open)d.showModal();$('appMenu').open=false;}
 function open(action='',mode='register'){window.MMLoginMode=mode;$('loginTitle').textContent=mode==='register'?'Create your account':'Sign in / Login';$('loginDescription').textContent=mode==='register'?'Enter your email. After verifying it, complete your name and account details.':'Use the email you registered with. We will send a secure link to enter your account.';pending=action;try{sessionStorage.setItem('mm-pending-analysis',action);}catch{}if(!dialog().open)dialog().showModal();$('loginFeedback').textContent=ready?'':'Connecting secure sign-in…';$('appMenu').open=false;}
 function paint(){
  const active=allowed(),owner=signed&&access?.role==='owner';document.body.classList.toggle('analysisAccess',active);
  if(lastAllowed&&!active)window.MMstopAnalysis?.();lastAllowed=active;
  const seconds=expires?Math.max(0,Math.ceil((expires-performance.now())/1000)):0;
  const label=!signed?'Sign in for a 15-minute trial':!access?'Verifying access…':access.status==='profile_required'?'Complete your account':owner?'Owner · full access':access.status==='subscribed'?'Subscription active':active?'Trial · '+Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0')+' remaining':'Trial ended · subscription required';
  $('accessStatus').textContent=label;$('profileAccess').textContent=label;
  $('accessTitle').textContent=signed?'Your trial has ended':'Explore markets. Sign in for analysis.';
  $('accessDescription').textContent=signed?'Subscribe to restore analysis, research and alerts. Your account stays signed in.':'Start a single 15-minute trial after verified sign-in. Subscribe to continue afterward.';
  if(signed&&!access){$('accessTitle').textContent='Checking your account';$('accessDescription').textContent='Analysis stays hidden until the server verifies access.';}
  if(access?.status==='profile_required'){$('accessTitle').textContent='Complete your account';$('accessDescription').textContent='Save your name and contact details to start your trial.';}
  $('accessAction').textContent=access?.status==='profile_required'?'Complete account':signed?'View subscription':'Create account';
  $('profileBadge').textContent=owner?'Owner':signed?'Signed in':'Guest';$('ownerAccess').hidden=!owner;
  window.dispatchEvent(new Event('mmaccess'));
 }
 window.MMAuth={signedIn:allowed,hasSession:()=>signed,open,openProfile:profile,
  require(action){if(allowed())return true;if(signed){profile();return false;}open(action);return false;},
  setAccount(account){access=account.access||null;expires=access?.trialEndsAt?performance.now()+Math.max(0,access.trialEndsAt-access.serverNow):0;
   const owner=signed&&account.role==='owner';$('profileUsername').hidden=!owner;$('profileUsername').textContent=owner?'Username: '+account.username:'';
   $('billingAvailability').textContent=access?.billingReady?'Secure subscription checkout is available.':'Subscription checkout is awaiting payment-service setup. No payment can be taken yet.';paint();if(account.access?.status==='profile_required')profile();
   if(allowed()&&pending){const action=pending;pending='';try{sessionStorage.removeItem('mm-pending-analysis');}catch{}if(['monitor','analyze'].includes(action))setTimeout(()=>$('live').click(),0);}
  },
  setSession(next){const changed=signed!==!!next;ready=true;signed=!!next;if(changed||!signed){access=null;expires=0;}
   $('profileEmail').textContent=next?.user?.email||'Sign in to access analysis and your server archive.';$('navLogin').textContent=signed?'My profile':'Sign in / Login';$('navCreate').hidden=signed;
   if(signed){dialog()?.close();try{pending ||= sessionStorage.getItem('mm-pending-analysis')||'';}catch{}}else{$('profileUsername').hidden=true;window.MMstopAnalysis?.();}paint();window.dispatchEvent(new Event('mmauth'));
  }
 };
 document.addEventListener('click',e=>{const b=e.target.closest('button');if(b&&['live','analyzeMarket','aiAnalyze','runBacktest','trainVisual','exportHistory'].includes(b.id)&&!allowed()){e.preventDefault();e.stopImmediatePropagation();window.MMAuth.require(b.id==='live'?'monitor':b.id==='analyzeMarket'?'analyze':b.id);}},true);
 document.addEventListener('DOMContentLoaded',()=>{
  $('navLogin').onclick=()=>signed?profile():open('','login');$('navCreate').onclick=()=>open('','register');$('chooseRegister').onclick=()=>open(pending,'register');$('chooseLogin').onclick=()=>open(pending,'login');$('menuProfile').onclick=profile;$('closeProfile').onclick=()=>$('profileDialog').close();$('closeLogin').onclick=()=>dialog().close();$('accessAction').onclick=()=>signed?profile():open('monitor');
  document.querySelectorAll('.mainNav a').forEach(link=>link.addEventListener('click',e=>{$('appMenu').open=false;const target=document.querySelector(link.getAttribute('href'));if(target?.closest('[data-benefit]')&&!allowed()){e.preventDefault();window.MMAuth.require('research');return;}if(target?.tagName==='DETAILS')target.open=true;}));paint();setInterval(()=>{if(signed&&access?.trialEndsAt)paint();},1000);
 });
})();
