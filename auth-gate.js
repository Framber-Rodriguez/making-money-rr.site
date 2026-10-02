(() => {
  let signed = false, ready = false, pending = '';
  const dialog = () => document.getElementById('loginDialog');
  function open(action = '') {
    pending = action;
    try { sessionStorage.setItem('mm-pending-analysis', action); } catch {}
    const d = dialog();
    if (d && !d.open) d.showModal();
    const feedback = document.getElementById('loginFeedback');
    if (feedback) feedback.textContent = ready ? '' : 'Connecting secure sign-in…';
    document.getElementById('modalEmail')?.focus();
  }
  window.MMAuth = {
    signedIn: () => signed,
    require(action) { if (signed) return true; open(action); return false; },
    open,
    setSession(next) {
      ready = true; signed = !!next;
      document.getElementById('profileEmail').textContent = next?.user?.email || 'Sign in to access analysis and your server archive.';
      document.getElementById('profileBadge').textContent = signed ? 'Signed in' : 'Guest';
      document.getElementById('navLogin').textContent = signed ? 'My profile' : 'Sign in';
      if (signed) {
        dialog()?.close();
        try { pending ||= sessionStorage.getItem('mm-pending-analysis') || ''; sessionStorage.removeItem('mm-pending-analysis'); } catch {}
        if (['monitor', 'analyze'].includes(pending)) setTimeout(() => document.getElementById('live').click(), 0);
        pending = '';
      } else window.MMstopAnalysis?.();
      window.dispatchEvent(new Event('mmauth'));
    }
  };
  // Stop analysis clicks before older handlers can fetch data or calculate signals.
  document.addEventListener('click', e => {
    const button = e.target.closest('button');
    const protectedIds = ['live','analyzeMarket','aiAnalyze','runBacktest','trainVisual'];
    if (button && protectedIds.includes(button.id) && !signed) {
      e.preventDefault(); e.stopImmediatePropagation();
      open(button.id === 'live' ? 'monitor' : button.id === 'analyzeMarket' ? 'analyze' : button.id);
    }
  }, true);
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('navLogin').onclick = () => signed ? document.getElementById('profile').scrollIntoView({behavior:'smooth'}) : open();
    document.getElementById('closeLogin').onclick = () => dialog().close();
    document.querySelectorAll('.mainNav a').forEach(link => link.addEventListener('click', () => {
      document.querySelectorAll('.mainNav a').forEach(x => x.removeAttribute('aria-current'));
      link.setAttribute('aria-current','page');
      const target = document.querySelector(link.getAttribute('href'));
      if (target?.tagName === 'DETAILS') target.open = true;
    }));
  });
})();
