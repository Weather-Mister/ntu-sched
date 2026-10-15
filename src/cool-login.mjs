import { ApiError } from './security.mjs';
import { documentFrom } from './portfolio-html.mjs';
import { CookieJar } from './ntu-cookies.mjs';
import { calendarUrl } from './cool-calendar.mjs';

const COOL = 'https://cool.ntu.edu.tw', ADFS = 'https://adfs.ntu.edu.tw';
const pathOf = url => url.pathname.replace(/\/+$/, '') || '/';
function allowed(url) {
  return url.protocol === 'https:' && !url.username && !url.password && !url.port &&
    (url.origin === ADFS && pathOf(url) === '/adfs/ls' || url.origin === COOL && ['/', '/login/saml', '/login/saml/callback', '/calendar', '/api/v1/users/self/profile'].includes(pathOf(url)));
}
const stopped = () => new ApiError(502, 'cool_login_redirect', 'COOL returned an unexpected sign-in destination. Your timetable and saved homework have not changed.');
function challenge(doc) { return !!doc.querySelector('input[autocomplete="one-time-code"],input[name*="captcha" i],iframe[src*="recaptcha"],iframe[src*="challenges.cloudflare.com"]') || /verify you are human|checking your browser/i.test(doc.title || ''); }
export async function discoverCoolCalendar(studentNumber, password, { beforeCredentialSubmit, onAuthenticated, skipCalendar = false } = {}) {
  const jar = new CookieJar(), controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 60000);
  let requests = 0, bytes = 0;
  async function request(destination, initial = {}) {
    let url = new URL(destination), method = initial.method || 'GET', body = initial.body;
    for (;;) {
      if (!allowed(url) || ++requests > 18) throw stopped();
      const headers = new Headers({ 'User-Agent': 'Campus-Week/1.0', Accept: initial.json ? 'application/json' : 'text/html,application/xhtml+xml' });
      const cookie = jar.header(url); if (cookie) headers.set('Cookie', cookie);
      if (method === 'POST') { headers.set('Content-Type', 'application/x-www-form-urlencoded'); headers.set('Origin', initial.source.origin); headers.set('Referer', initial.source.href); }
      const response = await fetch(url, { method, body, headers, redirect: 'manual', signal: controller.signal });
      jar.receive(response.headers, url);
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('Location'); await response.body?.cancel(); if (!location) throw stopped();
        const next = new URL(location, url);
        if (!allowed(next) || method === 'POST' && [307, 308].includes(response.status) && next.origin !== url.origin) throw stopped();
        if (response.status === 303 || method === 'POST' && [301, 302].includes(response.status)) { method = 'GET'; body = undefined; }
        url = next; continue;
      }
      if (!response.ok) { await response.body?.cancel(); throw new ApiError(502, 'cool_login_unavailable', 'NTU COOL sign-in is temporarily unavailable. Your timetable and saved homework are still available.'); }
      const reader = response.body?.getReader(), decoder = new TextDecoder(); let text = '', size = 0;
      if (!reader) throw stopped();
      for (;;) { const next = await reader.read(); if (next.done) break; bytes += next.value.length; size += next.value.length; if (size > 2 * 1024 * 1024 || bytes > 8 * 1024 * 1024) { await reader.cancel(); throw stopped(); } text += decoder.decode(next.value, { stream: true }); }
      text += decoder.decode();
      return { url, text, doc: initial.json ? null : documentFrom(text) };
    }
  }
  try {
    let page = await request(COOL + '/login/saml');
    if (challenge(page.doc)) throw new ApiError(409, 'cool_verification_required', 'NTU COOL requires additional verification. Your timetable and saved homework are still available.');
    const user = page.doc.querySelector('#ContentPlaceHolder1_UsernameTextBox'), pass = page.doc.querySelector('#ContentPlaceHolder1_PasswordTextBox'), submit = page.doc.querySelector('#ContentPlaceHolder1_SubmitButton');
    const form = pass?.closest('form');
    if (!user || !pass || !submit || user.closest('form') !== form || page.url.origin !== ADFS || pathOf(page.url) !== '/adfs/ls' || (form.getAttribute('method') || '').toLowerCase() !== 'post' || pass.getAttribute('type') !== 'password') throw new ApiError(502, 'cool_login_layout', 'NTU changed its COOL sign-in page. No password was submitted.');
    const target = new URL(form.getAttribute('action') || page.url.href, page.url);
    if (target.origin !== ADFS || pathOf(target) !== '/adfs/ls' || !allowed(target)) throw stopped();
    const fields = new URLSearchParams([...form.querySelectorAll('input[name]')].filter(n => !n.hasAttribute('disabled') && (n.getAttribute('type') === 'hidden' || n === submit)).map(n => [n.getAttribute('name'), n.getAttribute('value') || '']));
    if (!user.getAttribute('name') || !pass.getAttribute('name')) throw stopped();
    await beforeCredentialSubmit?.();
    fields.set(user.getAttribute('name'), studentNumber); fields.set(pass.getAttribute('name'), password);
    try { page = await request(target, { method: 'POST', body: fields, source: page.url }); }
    finally { fields.set(pass.getAttribute('name'), ''); password = ''; }
    for (let step = 0; step < 6; step++) {
      if (challenge(page.doc)) throw new ApiError(409, 'cool_verification_required', 'NTU COOL requires additional verification. Your timetable and saved homework are still available.');
      if (page.doc.querySelector('input[type="password"]')) throw new ApiError(409, 'cool_credentials_required', 'COOL did not accept the saved password. Reconnect with your myNTU password.');
      if (page.url.origin === COOL && !pathOf(page.url).startsWith('/login')) break;
      const forms = [...page.doc.querySelectorAll('form')].filter(f => f.querySelector('input[name="SAMLResponse"]'));
      if (forms.length !== 1) throw stopped();
      const callback = new URL(forms[0].getAttribute('action') || page.url.href, page.url);
      if (callback.origin !== COOL || !['/login/saml', '/login/saml/callback'].includes(pathOf(callback)) || !allowed(callback) || forms[0].getAttribute('method')?.toLowerCase() !== 'post') throw stopped();
      const controls = [...forms[0].querySelectorAll('input[name]')];
      if (!controls.length || controls.some(n => n.getAttribute('type')?.toLowerCase() !== 'hidden' || !['SAMLResponse', 'RelayState'].includes(n.getAttribute('name')))) throw stopped();
      const data = new URLSearchParams(controls.map(n => [n.getAttribute('name'), n.getAttribute('value') || '']));
      try { page = await request(callback, { method: 'POST', body: data, source: page.url }); }
      finally { for (const key of data.keys()) data.set(key, ''); }
    }
    if (page.url.origin !== COOL || pathOf(page.url).startsWith('/login')) throw stopped();
    // Confirm the provider identity before keeping the personal calendar link.
    const profile = await request(COOL + '/api/v1/users/self/profile', { json: true });
    let identity; try { identity = JSON.parse(profile.text.replace(/^while\(1\);\s*/, '')).login_id; } catch { throw stopped(); }
    if (typeof identity !== 'string' || identity.trim().toLowerCase().replace(/@ntu\.edu\.tw$/, '').replace(/^ntu\\/, '') !== studentNumber) throw new ApiError(502, 'cool_identity_mismatch', 'COOL could not verify that this calendar belongs to your Campus Week account. No connection was saved.');
    if (onAuthenticated) await onAuthenticated(jar);
    if (skipCalendar) return;
    page = await request(COOL + '/calendar');
    if (page.url.origin !== COOL || pathOf(page.url) !== '/calendar') throw stopped();
    const feeds = [...page.doc.querySelectorAll('#calendar-feed-url-input,input[value],a[href]')].flatMap(n => {
      const raw = n.getAttribute('value') || n.getAttribute('href');
      try { return [calendarUrl(new URL(raw || '', page.url).href)]; } catch { return []; }
    });
    const unique = [...new Set(feeds)];
    if (unique.length !== 1) throw new ApiError(502, 'cool_calendar_discovery', 'COOL signed in, but its personal calendar link could not be found. Your timetable and saved homework have not changed.');
    return unique[0];
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(502, 'cool_login_unavailable', 'Could not complete the COOL connection. Your timetable and saved homework are still available.');
  } finally { password = ''; jar.clear(); clearTimeout(timeout); }
}
