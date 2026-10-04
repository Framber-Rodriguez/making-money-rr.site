// Copiar a la raíz de GitHub Pages. Solo valores públicos.
const MAKING_MONEY_API = 'https://making-money-api.vercel.app';
const HCAPTCHA_SITE_KEY = 'b9e64c2c-6c4a-479c-8616-5392b78a9f42';

(() => {
  const panel = document.createElement('section');
  panel.id='visualReview';
  panel.innerHTML = '<h3>Análisis visual con IA</h3><p>Al pulsar Analizar, la captura seleccionada y este contexto se envían al backend y a OpenAI. El resto de la pantalla no se comparte.</p><label>Contexto<textarea id="aiContext" maxlength="6000" placeholder="Qué deseas observar en el gráfico"></textarea></label><div id="aiChallenge"></div><button id="aiAnalyze" disabled>Analizar captura con IA</button><p id="aiStatus" role="status"></p><pre id="aiResult" style="white-space:pre-wrap"></pre>';
  document.querySelector('main').appendChild(panel);
  const button = panel.querySelector('#aiAnalyze'), status = panel.querySelector('#aiStatus');
  let token = '', widget;
  if (MAKING_MONEY_API.includes('REEMPLAZAR') || HCAPTCHA_SITE_KEY.includes('REEMPLAZAR')) {
    status.textContent = 'Configura la URL del backend y la Site Key pública de hCaptcha.';
    return;
  }
  const script = document.createElement('script');
  script.src = 'https://js.hcaptcha.com/1/api.js?render=explicit&onload=MMCaptchaReady';
  let registrationToken='',registrationWidget,captchaReady=false;
  window.MMRegisterCaptcha={token:()=>registrationToken,reset:()=>{registrationToken='';if(registrationWidget!==undefined)window.hcaptcha?.reset(registrationWidget);}};
  function renderRegistration(){if(registrationWidget!==undefined||!captchaReady||!window.hcaptcha||!document.getElementById('registerDialog').open)return;registrationWidget=window.hcaptcha.render(document.getElementById('registerChallenge'),{sitekey:HCAPTCHA_SITE_KEY,callback:v=>{registrationToken=v;},'expired-callback':()=>{registrationToken='';},'error-callback':()=>{registrationToken='';}});}
  window.addEventListener('mmregister',renderRegistration);
  window.MMCaptchaReady = () => { captchaReady=true;renderRegistration();widget = window.hcaptcha.render(panel.querySelector('#aiChallenge'), {
    sitekey: HCAPTCHA_SITE_KEY,
    callback: value => { token = value; button.disabled = false; },
    'expired-callback': () => { token = ''; button.disabled = true; },
    'error-callback': () => { token = ''; button.disabled = true; status.textContent = 'No se pudo completar la verificación.'; }
  }); };
  script.onerror = () => { status.textContent = 'No se pudo cargar hCaptcha.'; };
  document.head.appendChild(script);
  window.addEventListener('mmauth',()=>{button.disabled=window.MMAuth.signedIn()&&!token;});
  button.disabled=false;
  button.onclick = async () => {
    if(!window.MMAuth.require('aiAnalyze'))return;
    button.disabled = true;
    status.textContent = 'Analizando…';
    panel.querySelector('#aiResult').textContent = '';
    try {
      const shot = document.getElementById('shot');
      if (!shot || shot.hidden || !shot.naturalWidth) throw new Error('Captura o sube un gráfico primero.');
      const canvas = document.createElement('canvas');
      const ratio = Math.min(1, 1600 / Math.max(shot.naturalWidth, shot.naturalHeight));
      canvas.width = Math.round(shot.naturalWidth * ratio); canvas.height = Math.round(shot.naturalHeight * ratio);
      canvas.getContext('2d').drawImage(shot, 0, 0, canvas.width, canvas.height);
      const imageDataUrl = canvas.toDataURL('image/jpeg', 0.85);
      const context = panel.querySelector('#aiContext').value.trim();
      const prompt = `Activo: ${document.getElementById('asset').value || document.getElementById('pair').value}. Temporalidad: ${document.getElementById('tf').value}. ${context || 'Describe la estructura visible y escenarios condicionados.'}`;
      const response = await fetch(new URL('/api/analyze', MAKING_MONEY_API), {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...window.MMAuthHeaders?.() },
        body: JSON.stringify({ prompt, imageDataUrl, captchaToken: token })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo analizar.');
      panel.querySelector('#aiResult').textContent = data.analysis;
      status.textContent = 'Análisis completado. Revisa las observaciones antes de tomar decisiones.';
    } catch (error) { status.textContent = error.message; }
    finally { token = ''; window.hcaptcha.reset(widget); }
  };
})();

