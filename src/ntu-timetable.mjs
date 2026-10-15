import { CookieJar } from './ntu-cookies.mjs';
import { ApiError } from './security.mjs';
import { documentFrom, parsePortfolioTimetable, combineNames } from './portfolio-html.mjs';
import { portfolioLanguageUrl } from './portfolio-language.mjs';

export const TIMETABLE_URL = 'https://portal.aca.ntu.edu.tw/eportfolio/course-overview';
const LOGIN_ORIGIN = 'https://web2.cc.ntu.edu.tw';
const PORTAL_ORIGIN = 'https://portal.aca.ntu.edu.tw';
const canonicalPath = url => url.pathname.replace(/\/+$/, '') || '/';
function allowed(url) {
  return url.protocol === 'https:' && !url.username && !url.password && !url.port &&
    ((url.origin === PORTAL_ORIGIN && ['/eportfolio', '/eportfolio/course-overview', '/eportfolio/basic-info', '/eportfolio/login-sso', '/sso-gateway/login', '/sso-gateway/sso-callback'].includes(canonicalPath(url))) ||
     (url.origin === LOGIN_ORIGIN && url.pathname.startsWith('/p/s/login2/')));
}
function stopped(url) {
  // Only known public route segments enter the owner's error message. Never
  // include query strings, fragments, user info, tickets or a provider body.
  let route = '';
  if (url?.hostname === new URL(PORTAL_ORIGIN).hostname) {
    const parts = url.pathname.split('/').filter(Boolean);
    if (['eportfolio', 'sso-gateway'].includes(parts[0])) route = ` (${url.protocol}//${url.hostname}/${parts[0]}${parts[1] && /^[a-z-]{1,32}$/.test(parts[1]) ? '/'+parts[1] : ''})`;
  } else if (url?.hostname === new URL(LOGIN_ORIGIN).hostname) route = ` (${url.protocol}//${url.hostname}/p/s/login2)`;
  const error = new ApiError(502, 'timetable_redirect', `NTU returned an unexpected sign-in destination${route}. Your saved timetable has not changed.`);
  return error;
}

function forms(document) { return [...document.querySelectorAll('form')]; }
function inputs(form) { return [...form.querySelectorAll('input[name]')].filter(n => !n.hasAttribute('disabled')); }
function fields(form) {
  return new URLSearchParams(inputs(form).filter(n => ['hidden', 'submit'].includes((n.getAttribute('type') || '').toLowerCase())).map(n => [n.getAttribute('name'), n.getAttribute('value') || '']));
}
function target(form, url) {
  const destination = new URL(form.getAttribute('action') || url.href, url);
  if (!allowed(destination)) throw stopped(destination);
  return destination;
}
function challenge(document) {
  return !!document.querySelector('input[autocomplete="one-time-code"],input[name*="captcha" i],iframe[src*="recaptcha"],iframe[src*="challenges.cloudflare.com"]') || /verify you are human|checking your browser/i.test(document.title || '');
}
function navigation(document, url) {
  const refresh = document.querySelector('meta[http-equiv="refresh" i]')?.getAttribute('content');
  const meta = refresh?.match(/^\s*\d+\s*;\s*url\s*=\s*["']?([^"']+?)["']?\s*$/i)?.[1];
  if (meta) return new URL(meta, url);
  // Recognize a literal navigation only. Never execute provider JavaScript.
  for (const script of document.querySelectorAll('script:not([src])')) {
    const match = script.textContent.match(/^\s*(?:window\.)?location(?:\.href)?\s*=\s*(["'])([^"'\r\n]+)\1\s*;?\s*$/) || script.textContent.match(/^\s*(?:window\.)?location\.(?:replace|assign)\(\s*(["'])([^"'\r\n]+)\1\s*\)\s*;?\s*$/);
    if (match) return new URL(match[2], url);
  }
  return null;
}

export async function readNtuTimetable(studentNumber, password, { beforeCredentialSubmit } = {}) {
  const jar = new CookieJar(), controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), 60000);
  let requests = 0, bytes = 0;
  async function request(destination, initial = {}) {
    let url = new URL(destination), method = initial.method || 'GET', body = initial.body;
    for (;;) {
      if (!allowed(url)) throw stopped(url);
      if (++requests > 24) throw new ApiError(502, 'timetable_redirect_loop', 'NTU sign-in did not finish within the supported number of steps. Your saved timetable has not changed.');
      const headers = new Headers({ 'User-Agent': 'Campus-Week/1.0', Accept: 'text/html,application/xhtml+xml' });
      const cookie = jar.header(url); if (cookie) headers.set('Cookie', cookie);
      if (method === 'POST') { headers.set('Content-Type', 'application/x-www-form-urlencoded'); headers.set('Origin', initial.source.origin); headers.set('Referer', initial.source.href); }
      const response = await fetch(url, { method, body, headers, redirect: 'manual', signal: controller.signal });
      jar.receive(response.headers, url);
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('Location'); await response.body?.cancel();
        if (!location) throw stopped();
        const next = new URL(location, url);
        if (!allowed(next) || (method === 'POST' && [307, 308].includes(response.status) && next.origin !== url.origin)) throw stopped(next);
        if (response.status === 303 || method === 'POST' && [301, 302].includes(response.status)) { method = 'GET'; body = undefined; }
        url = next; continue;
      }
      if (!response.ok) { await response.body?.cancel(); throw new ApiError(502, 'timetable_unavailable', 'NTU ePortfolio is temporarily unavailable. Your saved timetable has not changed.'); }
      const reader = response.body?.getReader(); let html = '', pageBytes = 0; const decoder = new TextDecoder();
      if (reader) for (;;) {
        const chunk = await reader.read(); if (chunk.done) break;
        bytes += chunk.value.length; pageBytes += chunk.value.length;
        if (pageBytes > 2 * 1024 * 1024 || bytes > 8 * 1024 * 1024) { await reader.cancel(); throw stopped(); }
        html += decoder.decode(chunk.value, { stream: true });
      }
      html += decoder.decode();
      return { html, url, document: documentFrom(html) };
    }
  }
  async function advance(page) {
    if (challenge(page.document)) throw new ApiError(409, 'timetable_verification_required', 'NTU requires an additional verification step. Open ePortfolio directly to check your account.');
    const next = navigation(page.document, page.url);
    if (next) return request(next);
    const candidates = forms(page.document).filter(form => inputs(form).length && inputs(form).every(n => (n.getAttribute('type') || '').toLowerCase() === 'hidden'));
    if (candidates.length !== 1) return null;
    const form = candidates[0], destination = target(form, page.url), method = (form.getAttribute('method') || 'get').toUpperCase();
    const callback = destination.origin === PORTAL_ORIGIN && ['/sso-gateway/sso-callback', '/eportfolio/login-sso'].includes(canonicalPath(destination));
    if (method !== 'POST' || !callback) return null;
    return request(destination, { method, body: fields(form), source: page.url });
  }
  try {
    let page = await request(TIMETABLE_URL);
    for (let i = 0; i < 5 && !page.document.querySelector('input[type="password"]'); i++) { const next = await advance(page); if (!next) break; page = next; }
    if (challenge(page.document)) throw new ApiError(409, 'timetable_verification_required', 'NTU requires an additional verification step. Open ePortfolio directly to check your account.');
    const passwordForms = forms(page.document).filter(f => f.querySelector('input[type="password"]'));
    const form = passwordForms.length === 1 ? passwordForms[0] : null;
    const destination = form ? target(form, page.url) : null;
    if (!form || page.url.origin !== LOGIN_ORIGIN || destination.origin !== LOGIN_ORIGIN || destination.pathname !== '/p/s/login2/p1.php' || (form.getAttribute('method') || '').toLowerCase() !== 'post' || form.querySelectorAll('input[name="user"]').length !== 1 || form.querySelectorAll('input[type="password"][name="pass"]').length !== 1) throw new ApiError(502, 'timetable_login_layout', 'NTU changed its timetable sign-in page. No credentials were submitted.');
    await beforeCredentialSubmit?.();
    const data = fields(form); data.set('user', studentNumber); data.set('pass', password);
    page = await request(destination, { method: 'POST', body: data, source: page.url });
    data.set('pass', ''); password = '';
    for (let i = 0; i < 8; i++) {
      if (challenge(page.document)) throw new ApiError(409, 'timetable_verification_required', 'NTU requires an additional verification step. Open ePortfolio directly to check your account.');
      if (page.document.querySelector('input[type="password"]')) throw new ApiError(409, 'timetable_credentials_required', 'ePortfolio did not accept the saved password. Enter your myNTU password to connect your timetable.');
      // SSO may land on basic-info. Do not follow profile forms or actions;
      // go directly to the one read-only page this connector imports.
      if (page.url.origin === PORTAL_ORIGIN && ['/eportfolio', '/eportfolio/basic-info', '/eportfolio/course-overview'].includes(canonicalPath(page.url))) break;
      const next = await advance(page); if (!next) break; page = next;
    }
    page = await request(TIMETABLE_URL);
    if (page.url.origin !== PORTAL_ORIGIN || canonicalPath(page.url) !== '/eportfolio/course-overview' || page.document.querySelector('input[type="password"]')) throw new ApiError(409, 'timetable_credentials_required', 'NTU did not complete ePortfolio sign-in. Enter your myNTU password to connect your timetable.');
    const result = parsePortfolioTimetable(page.html);
    // ePortfolio may use a DIV, button or anchor for its language control.
    // Read only a literal, same-origin course-overview destination declared by
    // that control. We do not execute its JavaScript or invent translations.
    for (const language of ['en', 'zh']) {
      if (!result.sessions.some(s => language === 'en' ? !s.titleEn : !s.titleZh)) continue;
      const alternate = portfolioLanguageUrl(page.document, page.url, language);
      if (!alternate) continue;
      try {
        const view = await request(alternate);
        if (view.url.origin === PORTAL_ORIGIN && canonicalPath(view.url) === '/eportfolio/course-overview') {
          result.sessions = combineNames(result.sessions, parsePortfolioTimetable(view.html).sessions);
        }
      } catch { /* Keep the valid saved timetable when a translation view is unavailable. */ }
    }
    return { ...result, syncedAt: Date.now(), sourceUrl: TIMETABLE_URL };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(502, 'timetable_unavailable', 'Could not complete the ePortfolio connection. Your saved timetable has not changed.');
  } finally { clearTimeout(deadline); jar.clear(); password = ''; }
}
