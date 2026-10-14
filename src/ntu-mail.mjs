import { ApiError } from './security.mjs';

// The same Roundcube form flow used by the personal NTU Mail clients.
// This stage verifies ownership only. It neither lists nor changes mail.
const ROOT = new URL('https://wmail1.cc.ntu.edu.tw/rc/');
const MAX_RESPONSE = 2 * 1024 * 1024;
const entity = value => value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
export function roundcubeEnvironment(html) {
  const marker = 'rcmail.set_env('; let start = html.indexOf(marker);
  if (start < 0) return {};
  start += marker.length; let depth = 0, quoted = false, escaped = false;
  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (quoted) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === '"') quoted = false; continue; }
    if (c === '"') quoted = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) { try { return JSON.parse(html.slice(start, i + 1)); } catch { return {}; } }
  }
  return {};
}
async function boundedText(response) {
  if (Number(response.headers.get('Content-Length')) > MAX_RESPONSE) { await response.body?.cancel(); throw new ApiError(502, 'ntu_unavailable', 'NTU Mail returned an unsupported response.'); }
  const reader = response.body?.getReader(); if (!reader) return '';
  const decoder = new TextDecoder(); let size = 0, text = '';
  while (true) {
    const next = await reader.read(); if (next.done) return text + decoder.decode();
    size += next.value.length;
    if (size > MAX_RESPONSE) { await reader.cancel(); throw new ApiError(502, 'ntu_unavailable', 'NTU Mail returned an unsupported response.'); }
    text += decoder.decode(next.value, { stream: true });
  }
}
export async function verifyNtuMail(studentNumber, password) {
  const cookies = new Map();
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), 20000);
  const request = async (path, initial = {}) => {
    let url = new URL(path, ROOT), method = initial.method || 'GET', body = initial.body;
    for (let redirects = 0; redirects < 5; redirects++) {
      if (url.origin !== ROOT.origin || !url.pathname.startsWith(ROOT.pathname)) throw new ApiError(502, 'ntu_unavailable', 'NTU Mail returned an unexpected redirect.');
      const headers = new Headers(initial.headers);
      if (cookies.size) headers.set('Cookie', [...cookies].map(([k, v]) => `${k}=${v}`).join('; '));
      const response = await fetch(url, { method, body, headers, redirect: 'manual', signal: controller.signal });
      for (const raw of response.headers.getSetCookie()) {
        const [pair] = raw.split(';'); const split = pair.indexOf('=');
        if (split > 0) { const key = pair.slice(0, split), value = pair.slice(split + 1); if (value) cookies.set(key, value); else cookies.delete(key); }
      }
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('Location'); await response.body?.cancel();
        if (!location) throw new ApiError(502, 'ntu_unavailable', 'NTU Mail returned an incomplete redirect.');
        url = new URL(location, url);
        if (response.status === 303 || ([301, 302].includes(response.status) && method === 'POST')) { method = 'GET'; body = undefined; }
        continue;
      }
      if (!response.ok) { await response.body?.cancel(); throw new ApiError(502, 'ntu_unavailable', 'NTU Mail is temporarily unavailable.'); }
      return boundedText(response);
    }
    throw new ApiError(502, 'ntu_unavailable', 'NTU Mail returned too many redirects.');
  };
  try {
    const page = await request('index.php'), fields = {};
    for (const match of page.matchAll(/<input\b[^>]*>/gi)) {
      const attrs = Object.fromEntries([...match[0].matchAll(/([\w-]+)\s*=\s*["']([^"']*)["']/g)].map(m => [m[1].toLowerCase(), entity(m[2])]));
      if (attrs.type === 'hidden' && attrs.name) fields[attrs.name] = attrs.value || '';
    }
    if (!fields._token) throw new ApiError(502, 'ntu_unavailable', 'NTU Mail sign-in is temporarily unavailable.');
    const form = new URLSearchParams({ ...fields, _task: 'login', _action: 'login', _user: studentNumber, _pass: password, _timezone: 'Asia/Taipei', _url: '' });
    const result = await request('?_task=login', { method: 'POST', body: form, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    const env = roundcubeEnvironment(result);
    if (env.task !== 'mail' || typeof env.request_token !== 'string' || !env.request_token) throw new ApiError(401, 'invalid_credentials', 'NTU sign-in failed. Check your student number and NTU Mail password.');
    if (typeof env.username === 'string' && env.username.split('@')[0].toLowerCase() !== studentNumber) throw new ApiError(401, 'invalid_credentials', 'NTU could not confirm this student account.');
    return { username: studentNumber, verifiedAt: Date.now() };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(502, 'ntu_unavailable', 'Could not reach NTU Mail. Please retry.');
  } finally { clearTimeout(deadline); cookies.clear(); }
}
