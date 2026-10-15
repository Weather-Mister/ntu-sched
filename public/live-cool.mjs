export function initLiveCool({ panel, client, openLogin, onSessionExpired, language = () => 'en' }) {
  function node(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; }
  const toolbar = node('div', 'schedule-toolbar'), heading = node('div'); heading.append(node('p', 'eyebrow', 'NTU COOL / YOUR COURSES'), node('h2', '', 'Your COOL feed'));
  const refresh = node('button', 'secondary', 'Connect COOL'); refresh.type = 'button'; refresh.id = 'cool-refresh'; toolbar.append(heading, refresh);
  const tabs = node('div', 'cool-tabs'); tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', 'COOL feed');
  const assignmentTab = node('button', 'active', 'Homework & events'), announcementTab = node('button', '', 'Announcements');
  for (const [tab, id] of [[assignmentTab, 'assignments'], [announcementTab, 'announcements']]) { tab.id = 'cool-'+id+'-tab'; tab.type = 'button'; tab.setAttribute('role', 'tab'); tab.setAttribute('aria-controls', 'cool-list'); tabs.append(tab); }
  const meta = node('p', 'micro'), copy = node('p', 'micro', 'Homework and events connect automatically through your saved NTU login. Dates come from the COOL calendar; check submission status in COOL.');
  const notice = node('p', 'notice warning'); notice.id = 'cool-notice'; notice.hidden = true; notice.setAttribute('role', 'status');
  const filters = node('div', 'cool-filters'), course = node('select', 'login-input'), search = node('input', 'login-input'); course.setAttribute('aria-label', 'Filter calendar items by course'); search.type = 'search'; search.setAttribute('aria-label', 'Search homework and events'); search.placeholder = 'Search homework and events'; filters.append(course, search);
  const list = node('div', 'cool-list'); list.id = 'cool-list'; list.setAttribute('role', 'tabpanel'); list.tabIndex = 0;
  panel.replaceChildren(toolbar, tabs, meta, copy, notice, filters, list);
  const dialog = node('dialog', 'wide-dialog'); dialog.id = 'cool-connect-dialog';
  const form = node('form'), label = node('label', 'field-label', 'myNTU password'), password = node('input', 'login-input'); password.type = 'password'; password.id = 'cool-password'; password.name = 'password'; password.autocomplete = 'current-password'; password.required = true; password.maxLength = 1024; label.htmlFor = password.id;
  const submit = node('button', 'primary full', 'Reconnect COOL'), cancel = node('button', 'secondary full', 'Cancel'), errorText = node('p', 'notice error'); submit.type = 'submit'; cancel.type = 'button'; errorText.hidden = true; errorText.setAttribute('role', 'status');
  form.append(label, password, submit, cancel, errorText); dialog.append(node('h2', '', 'Connect NTU COOL'), node('p', '', 'Use your myNTU password if it differs from your NTU Mail password. Campus Week retrieves your personal calendar automatically and encrypts the saved connection.'), form); document.body.append(dialog);
  let owner = null, epoch = 0, active = null, calendar = null, needsPassword = false, tab = 'assignments', lastAttempt = 0, retryAt = 0, interval = 300000, restored = false, refreshOnOpen = false;
  const format = (date, allDay = false) => new Intl.DateTimeFormat(language() === 'zh-TW' ? 'zh-TW' : 'en-GB', { timeZone: 'Asia/Taipei', year: 'numeric', month: 'short', day: 'numeric', ...(allDay ? {} : { hour: '2-digit', minute: '2-digit' }) }).format(new Date(allDay ? date+'T12:00:00+08:00' : date));
  function upcoming() { return (calendar?.assignments || []).filter(a => Date.parse(a.dueAt) >= Date.now()); }
  function render() {
    const items = upcoming(), isAssignments = tab === 'assignments';
    refresh.disabled = !!active || Date.now() < retryAt; submit.disabled = refresh.disabled;
    refresh.textContent = active ? calendar ? 'Refreshing COOL…' : 'Connecting COOL…' : needsPassword ? 'Reconnect COOL' : calendar ? 'Refresh COOL' : 'Connect COOL';
    meta.textContent = !owner ? 'Sign in to connect your COOL homework.' : calendar ? `${items.length} upcoming calendar item(s) · Last checked ${format(calendar.syncedAt)} Taipei · Checks on opening and every 5 minutes while open · Background checks run hourly` : 'Your personal COOL calendar will be found through your NTU login.';
    for (const [button, selected] of [[assignmentTab, isAssignments], [announcementTab, !isAssignments]]) { button.classList.toggle('active', selected); button.setAttribute('aria-selected', String(selected)); button.tabIndex = selected ? 0 : -1; }
    list.setAttribute('aria-labelledby', isAssignments ? assignmentTab.id : announcementTab.id);
    filters.hidden = !isAssignments || !calendar; list.replaceChildren();
    if (!isAssignments) { list.append(node('p', 'cool-empty', 'Announcements are not part of the calendar feed. The separate announcement connection is coming next.')); return; }
    const selected = course.value || '', names = new Map(items.map(a => [a.courseId || a.course, a.course])); course.replaceChildren(); const all = node('option', '', 'All courses'); all.value = ''; course.append(all);
    for (const [id, name] of names) { const option = node('option', '', name); option.value = id; option.dataset.originalContent = ''; course.append(option); } course.value = names.has(selected) ? selected : '';
    if (!calendar) { list.append(node('p', 'cool-empty', active ? 'Connecting your personal COOL calendar…' : 'Your homework will appear here after COOL connects.')); return; }
    const query = search.value.trim().toLowerCase(), visible = items.filter(a => (!course.value || (a.courseId || a.course) === course.value) && `${a.title} ${a.course}`.toLowerCase().includes(query));
    if (!visible.length) list.append(node('p', 'cool-empty', items.length ? 'No calendar items match these filters.' : 'No upcoming dated items in your COOL calendar.'));
    for (const item of visible) {
      const article = node('article', 'cool-item'), detail = node('div', 'cool-detail'), name = node('p', 'eyebrow', item.course), title = node('h3', '', item.title);
      name.dataset.originalContent = ''; title.dataset.originalContent = '';
      const isEvent = item.kind === 'event', when = isEvent ? 'Starts' : 'Due';
      detail.append(name, title, node('p', 'micro', isEvent ? 'Calendar event' : 'Assignment'), node('p', 'cool-due', item.allDay ? `${when} ${format(item.date, true)} · All day · Taipei` : `${when} ${format(item.dueAt)} · Taipei`)); article.append(detail);
      try { const url = new URL(item.url); if (url.origin === 'https://cool.ntu.edu.tw' && !url.username && !url.password) { const link = node('a', 'cool-open', 'Open in COOL ↗'); link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer'; article.append(link); } } catch {}
      list.append(article);
    }
  }
  function apply(result) { calendar = result.calendar; interval = result.checkIntervalMs || interval; needsPassword = result.connectionStatus === 'reconnect_required'; notice.hidden = !calendar?.warnings?.length && !needsPassword; notice.textContent = needsPassword ? 'Reconnect COOL to resume updates. Your saved homework is still available.' : (calendar?.warnings || []).join(' '); render(); }
  async function check(secret, force = false) {
    if (!owner) { openLogin(); return; } if (active || Date.now() < retryAt) return;
    const version = epoch, controller = new AbortController(); active = controller; refreshOnOpen = false; lastAttempt = Date.now(); notice.hidden = errorText.hidden = true; render();
    try {
      const result = await client.syncCoolCalendar(secret, controller.signal, force); if (version !== epoch) return;
      apply(result); if (dialog.open) dialog.close();
    } catch (error) {
      if (version !== epoch || error.name === 'AbortError') return;
      if (error.status === 401) { onSessionExpired?.(); return; }
      needsPassword = ['cool_credentials_required', 'cool_verification_required', 'cool_calendar_reconnect'].includes(error.code);
      notice.hidden = false; notice.textContent = error.message;
      if (error.code === 'cool_try_later') { const wait = Math.min(600, Math.max(1, error.retryAfterSeconds || 60)) * 1000; retryAt = Date.now() + wait; notice.textContent += ` Checks resume at ${format(retryAt)} Taipei.`; setTimeout(() => { if (version === epoch) render(); }, wait); }
      if (dialog.open) { errorText.textContent = notice.textContent; errorText.hidden = false; }
      if (error.code === 'cool_credentials_required' && !dialog.open) dialog.showModal();
    } finally { if (version === epoch) { active = null; render(); } }
  }
  refresh.addEventListener('click', () => { if (!owner) openLogin(); else if (needsPassword) { errorText.hidden = true; dialog.showModal(); } else check(undefined, true); });
  cancel.addEventListener('click', () => dialog.close()); dialog.addEventListener('close', () => { password.value = ''; });
  form.addEventListener('submit', event => { event.preventDefault(); if (!form.reportValidity()) return; const secret = password.value; password.value = ''; check(secret, true); });
  for (const [button, next] of [[assignmentTab, 'assignments'], [announcementTab, 'announcements']]) button.addEventListener('click', () => { tab = next; render(); });
  tabs.addEventListener('keydown', event => { if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return; event.preventDefault(); tab = event.key === 'Home' ? 'assignments' : event.key === 'End' ? 'announcements' : tab === 'assignments' ? 'announcements' : 'assignments'; render(); (tab === 'assignments' ? assignmentTab : announcementTab).focus(); });
  search.addEventListener('input', render); course.addEventListener('change', render); window.addEventListener('campus-language-change', render);
  function automaticCheck() { if (!owner || !restored || active || needsPassword || Date.now() < retryAt || document.visibilityState === 'hidden' || navigator.onLine === false || Date.now() - lastAttempt < interval) return; if (refreshOnOpen) check(undefined, true); else if (!calendar || Date.now() - calendar.syncedAt >= interval) check(); else render(); }
  setInterval(automaticCheck, 60000); document.addEventListener('visibilitychange', automaticCheck); window.addEventListener('focus', automaticCheck); window.addEventListener('online', automaticCheck);
  render();
  return { setAccount(account) {
    const next = account?.studentNumber || null; if (owner === next) return;
    owner = next; epoch++; active?.abort(); active = null; calendar = null; needsPassword = false; lastAttempt = retryAt = 0; restored = false; refreshOnOpen = !!owner; search.value = ''; course.value = ''; notice.hidden = true; password.value = ''; if (dialog.open) dialog.close(); render(); if (!owner) return;
    const version = epoch;
    (async () => { try { const result = await client.coolCalendar(); if (version !== epoch) return; restored = true; if (!calendar || result.calendar?.syncedAt > calendar.syncedAt) apply(result); automaticCheck(); } catch (error) { if (version === epoch) { if (error.status === 401) onSessionExpired?.(); else { notice.hidden = false; notice.textContent = error.message; } } } })();
  } };
}
