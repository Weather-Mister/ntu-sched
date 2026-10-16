import { ApiError } from './security.mjs';
import { connection, limit, mergeCoolConnection } from './cool-store.mjs';
import { discoverCoolCalendar } from './cool-login.mjs';
import { CookieJar } from './ntu-cookies.mjs';
import { documentFrom } from './portfolio-html.mjs';

const COOL = 'https://cool.ntu.edu.tw';
export const ANNOUNCEMENT_INTERVAL = 120000;
function snapshot(row) {
  return { announcements: row?.value?.announcements || null, checkIntervalMs: ANNOUNCEMENT_INTERVAL };
}
export async function savedAnnouncements(env, studentId) { return snapshot(await connection(env, studentId)); }
const unavailable = () => new ApiError(502, 'cool_announcements_unavailable', 'COOL announcements could not be refreshed. Your saved announcements are still available.');
function sessionCookies(jar) {
  return [...jar.entries].filter(([, c]) => c.domain === 'cool.ntu.edu.tw')
    .map(([key, c]) => [key, { ...c, expires: Number.isFinite(c.expires) ? c.expires : null }]);
}
function restoreCookies(saved) {
  const jar = new CookieJar();
  for (const [key, c] of saved || []) if (c.domain === 'cool.ntu.edu.tw') jar.entries.set(key, {...c, expires: c.expires ?? Infinity});
  return jar;
}
export async function readAnnouncements(jar) {
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 45000);
  let calls = 0, bytes = 0;
  async function pages(path) {
    let url = new URL(path, COOL); const items = [], seen = new Set(), expectedPath = url.pathname;
    while (url) {
      if (url.origin !== COOL || url.username || url.password || url.pathname !== expectedPath || seen.has(url.href) || ++calls > 24) throw unavailable();
      seen.add(url.href);
      const response = await fetch(url, { headers: { Accept: 'application/json', Cookie: jar.header(url), 'User-Agent': 'Campus-Week/1.0' }, redirect: 'manual', signal: controller.signal });
      jar.receive(response.headers, url);
      if (response.status === 401 || response.status === 302 || response.status === 303) { await response.body?.cancel(); throw new ApiError(409, 'cool_session_expired', 'COOL session expired.'); }
      if (!response.ok) { await response.body?.cancel(); throw unavailable(); }
      const reader = response.body?.getReader(), decoder = new TextDecoder(); let text = '';
      if (!reader) throw unavailable();
      for (;;) { const part = await reader.read(); if (part.done) break; bytes += part.value.length; if (bytes > 6 * 1024 * 1024) { await reader.cancel(); throw unavailable(); } text += decoder.decode(part.value, {stream:true}); }
      text += decoder.decode(); let data;
      try { data = JSON.parse(text.replace(/^while\(1\);\s*/, '')); } catch { throw unavailable(); }
      if (!Array.isArray(data)) throw unavailable();
      items.push(...data);
      const next = (response.headers.get('Link') || '').split(',').find(part => /rel="next"/.test(part))?.match(/<([^>]+)>/)?.[1];
      url = next ? new URL(next, url) : null;
    }
    return items;
  }
  try {
    const courses = await pages('/api/v1/courses?enrollment_state=active&per_page=100');
    const names = new Map(courses.filter(c => /^\d+$/.test(String(c.id))).map(c => [String(c.id), String(c.name || c.course_code || 'NTU COOL').slice(0,400)]));
    const now = Date.now(), start = now - 90 * 86400000, items = new Map();
    const ids = [...names.keys()];
    for (let i = 0; i < ids.length; i += 20) {
      const query = new URLSearchParams({ start_date: new Date(start).toISOString(), end_date: new Date(now).toISOString(), active_only: 'true', per_page: '100' });
      for (const id of ids.slice(i,i+20)) query.append('context_codes[]', 'course_' + id);
      for (const entry of await pages('/api/v1/announcements?' + query)) {
        const courseId = /^course_(\d+)$/.exec(entry.context_code)?.[1], postedAt = entry.posted_at || entry.delayed_post_at;
        if (!names.has(courseId) || !/^\d+$/.test(String(entry.id)) || !Number.isFinite(Date.parse(postedAt)) || Date.parse(postedAt) < start || Date.parse(postedAt) > now || entry.published === false) continue;
        const doc = documentFrom('<html><body>' + String(entry.message || '').slice(0,200000) + '</body></html>');
        doc.querySelectorAll('script,style,iframe,object').forEach(n => n.remove());
        doc.querySelectorAll('p,div,br,li').forEach(n => n.append('\n'));
        const body = (doc.body.textContent || '').trim();
        items.set(courseId + ':' + entry.id, { id: courseId + ':' + entry.id, courseId, course: names.get(courseId), title: String(entry.title || 'Announcement').slice(0,1000), body: body.slice(0,12000), bodyTruncated: body.length > 12000, postedAt: new Date(postedAt).toISOString(), author: String(entry.author?.display_name || entry.user_name || '').slice(0,200), url: `${COOL}/courses/${courseId}/discussion_topics/${entry.id}` });
      }
    }
    return { items: [...items.values()].sort((a,b) => Date.parse(b.postedAt)-Date.parse(a.postedAt)), courses:[...names].map(([id,name])=>({id,name})), syncedAt: now, coursesChecked: names.size, lookbackDays: 90 };
  } catch (error) { if (error instanceof ApiError) throw error; throw unavailable(); }
  finally { clearTimeout(timeout); }
}
export async function syncAnnouncements(env, student, password, force = false) {
  const id = student.student_id, previous = await connection(env, id);
  if (!force && password === undefined && previous?.value.announcements && Date.now() - previous.value.announcements.syncedAt < ANNOUNCEMENT_INTERVAL) return snapshot(previous);
  if (password === undefined && previous?.value.announcementsReconnect) throw new ApiError(409, 'cool_credentials_required', 'Reconnect COOL with your myNTU password. Saved announcements remain available.');
  await limit(env,id,'announcements',12);
  let jar = restoreCookies(password === undefined ? previous?.value.announcementCookies : null), credentials;
  async function login() {
    credentials = password !== undefined ? {username:student.student_number,password} : previous?.value.password ? previous.value : (await connection(env,id,'timetable'))?.value || (await connection(env,id,'ntu_mail'))?.value;
    if (credentials?.username !== student.student_number || !credentials.password) throw new ApiError(409,'cool_credentials_required','Reconnect COOL with your myNTU password.');
    let cookies;
    await discoverCoolCalendar(student.student_number, credentials.password, { beforeCredentialSubmit: () => limit(env,id,'login',3), skipCalendar:true, onAuthenticated: authenticated => { cookies = sessionCookies(authenticated); } });
    jar.clear(); jar = restoreCookies(cookies);
  }
  try {
    const hadSession = !!jar.header(new URL(COOL + '/api/v1/courses'));
    if (!hadSession) await login();
    let announcements;
    try { announcements = await readAnnouncements(jar); }
    catch (error) { if (error.code !== 'cool_session_expired' || !hadSession) throw error; await login(); announcements = await readAnnouncements(jar); }
    const retained = password !== undefined ? {username:student.student_number,password} : {};
    await mergeCoolConnection(env,id,{...retained,announcements,announcementCookies:sessionCookies(jar),announcementsReconnect:false});
    return {announcements,checkIntervalMs:ANNOUNCEMENT_INTERVAL};
  } catch (error) {
    if (['cool_credentials_required','cool_verification_required'].includes(error.code)) await mergeCoolConnection(env,id,{announcementsReconnect:true});
    throw error;
  } finally { jar.clear(); if (credentials) credentials.password = ''; password = ''; }
}
