export function initLiveTimetable({ client, openLogin, onSessionExpired }) {
  const panel = document.querySelector('.schedule-panel');
  const controls = document.createElement('div'); controls.className = 'schedule-meta';
  const status = document.createElement('p'); status.className = 'micro'; status.id = 'timetable-sync-status'; status.setAttribute('role', 'status');
  const sync = document.createElement('button'); sync.className = 'secondary'; sync.type = 'button'; sync.id = 'timetable-sync'; sync.textContent = 'Sync timetable';
  const show = document.createElement('button'); show.className = 'text-button'; show.type = 'button'; show.textContent = 'Show live timetable'; show.hidden = true;
  controls.append(status, show, sync); panel.querySelector('.schedule-meta').after(controls);
  const notice = document.createElement('p'); notice.className = 'notice warning'; notice.hidden = true; notice.setAttribute('role', 'status'); controls.after(notice);
  const dialog = document.createElement('dialog'); dialog.id = 'timetable-connect-dialog';
  const heading = document.createElement('h2'); heading.textContent = 'Connect your timetable';
  const copy = document.createElement('p'); copy.textContent = 'ePortfolio uses your myNTU password. Campus Week encrypts it for automatic timetable checks.';
  const form = document.createElement('form');
  const label = document.createElement('label'); label.className = 'field-label'; label.htmlFor = 'timetable-password'; label.textContent = 'myNTU password';
  const password = document.createElement('input'); password.className = 'login-input'; password.id = 'timetable-password'; password.name = 'password'; password.type = 'password'; password.autocomplete = 'current-password'; password.required = true; password.maxLength = 1024;
  const submit = document.createElement('button'); submit.className = 'primary full'; submit.type = 'submit'; submit.textContent = 'Connect timetable';
  const cancel = document.createElement('button'); cancel.className = 'secondary full'; cancel.type = 'button'; cancel.textContent = 'Cancel';
  const formError = document.createElement('p'); formError.className = 'notice error'; formError.hidden = true; formError.setAttribute('role', 'status');
  form.append(label, password, submit, cancel, formError); dialog.append(heading, copy, form); document.body.append(dialog);
  let owner = null, epoch = 0, active = null, snapshot = null, lastAttempt = 0, needsPassword = false, liveDisplay = true, interval = 432000000;
  const time = value => new Intl.DateTimeFormat(undefined, { timeZone: 'Asia/Taipei', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(value);
  function display() {
    if (!snapshot) return;
    liveDisplay = true; show.hidden = true;
    window.dispatchEvent(new CustomEvent('campus-live-timetable', { detail: { timetable: snapshot } }));
  }
  function render() {
    sync.disabled = !!active; submit.disabled = !!active;
    sync.textContent = active ? 'Checking NTU…' : needsPassword ? 'Reconnect timetable' : snapshot ? 'Check for timetable changes' : 'Sync timetable';
    status.textContent = !owner ? 'Sign in to connect your live timetable.' : snapshot ? `Last checked ${time(snapshot.syncedAt)} · Taipei${snapshot.term ? ' · '+snapshot.term : ''} · Automatic check every 5 days` : 'Connect to load your classes from ePortfolio.';
    show.hidden = !snapshot || liveDisplay;
  }
  function apply(result) {
    snapshot = result.timetable; interval = result.checkIntervalMs || interval; needsPassword = result.connectionStatus === 'reconnect_required';
    if (snapshot && liveDisplay) display();
    if (needsPassword) { notice.textContent = 'Your saved timetable is available. Reconnect to resume automatic updates.'; notice.hidden = false; }
    else if (snapshot?.warnings?.length) { notice.textContent = snapshot.warnings.join(' '); notice.hidden = false; }
    render();
  }
  async function check(secret, force = false) {
    if (!owner) { openLogin(); return; }
    if (active) return;
    const version = epoch, controller = new AbortController(); active = controller; lastAttempt = Date.now(); notice.hidden = true; formError.hidden = true; render();
    try {
      const result = await client.syncTimetable(secret, controller.signal, force);
      if (epoch !== version) return;
      needsPassword = false; apply(result); if (dialog.open) dialog.close();
      if (result.changed && snapshot && !snapshot.warnings?.length) { notice.textContent = 'Your timetable is up to date.'; notice.className = 'notice'; notice.hidden = false; }
    } catch (error) {
      if (epoch !== version || error.name === 'AbortError') return;
      if (error.status === 401) { onSessionExpired?.(); return; }
      if (['timetable_credentials_required', 'timetable_verification_required'].includes(error.code)) needsPassword = true;
      notice.className = 'notice warning'; notice.textContent = error.message; notice.hidden = false;
      if (dialog.open) { formError.textContent = error.message; formError.hidden = false; }
      if (error.code === 'timetable_credentials_required' && !dialog.open) { formError.hidden = true; dialog.showModal(); }
    } finally { if (epoch === version) { active = null; render(); } }
  }
  sync.addEventListener('click', () => {
    if (!owner) { openLogin(); return; }
    liveDisplay = true;
    if (needsPassword) { formError.hidden = true; dialog.showModal(); } else check(undefined, true);
  });
  show.addEventListener('click', display);
  cancel.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { password.value = ''; });
  form.addEventListener('submit', event => { event.preventDefault(); if (!form.reportValidity()) return; const secret = password.value; password.value = ''; check(secret, true); });
  window.addEventListener('campus-timetable-source', event => { if (event.detail.source !== 'ntu') { liveDisplay = false; render(); } });
  function automaticCheck() {
    if (!owner || active || needsPassword || document.visibilityState === 'hidden' || navigator.onLine === false || Date.now() - lastAttempt < interval) return;
    if (!snapshot || Date.now() - snapshot.syncedAt >= interval) check();
  }
  setInterval(automaticCheck, 60000);
  window.addEventListener('focus', automaticCheck); window.addEventListener('online', automaticCheck); document.addEventListener('visibilitychange', automaticCheck);
  render();
  return {
    setAccount(account) {
      const next = account?.studentNumber || null;
      if (owner === next) return;
      const previous = owner; owner = next; epoch++; active?.abort(); active = null; snapshot = null; needsPassword = false; lastAttempt = 0; liveDisplay = true; notice.hidden = true; password.value = '';
      if (dialog.open) dialog.close();
      if (previous) window.dispatchEvent(new CustomEvent('campus-live-timetable-clear'));
      render(); if (!owner) return;
      const version = epoch;
      (async () => {
        try {
          const result = await client.timetable(); if (epoch !== version) return; apply(result);
          if (!needsPassword && (!snapshot || Date.now() - snapshot.syncedAt >= interval)) check();
        } catch (error) { if (epoch === version) { if (error.status === 401) onSessionExpired?.(); else { notice.textContent = error.message; notice.hidden = false; } } }
      })();
    }
  };
}
