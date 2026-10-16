import { ApiError, digest, encryptionKey, encryptAuthorization, normalizeStudentNumber, randomToken, readJson } from './security.mjs';
import { verifyNtuMail } from './ntu-mail.mjs';
import { savedTimetable, syncTimetable, refreshDueTimetables, changeCourseDetails, saveStudentExamPlan, saveStudentSectionOptions } from './timetable-store.mjs';
import { savedCoolCalendar, syncCoolCalendar, refreshDueCoolCalendars, limit } from './cool-store.mjs';
import { listTasks, createTask, changeTask } from './manual-tasks.mjs';
import { listEvents, createEvent, changeEvent } from './custom-events.mjs';
import {listCustomExams,createCustomExam,changeCustomExam} from './custom-exams.mjs';
import { listMail, readMail, attachment, sendMail, checkSend, withMailbox, refreshMailNotifications } from './mail-store.mjs';
import { mailReference } from './mail-content.mjs';
import { translateMail } from './mail-translation.mjs';
import {reviseDraft} from './mail-compose-ai.mjs';
import {saveComposeDraft,listComposeDrafts,deleteComposeDraft,uploadComposePart,removeComposeFile,queueComposeMail,listComposeJobs,changeComposeJob,processDueComposeJobs} from './mail-composer-store.mjs';
import { pushConfiguration, subscribe, testPushDelivery } from './mail-push.mjs';
import { savedAnnouncements, syncAnnouncements } from './cool-announcements.mjs';
import {readPreferences,savePreferences,readHanziWidget} from './student-preferences.mjs';
import { readNtuCourseExams, syllabusUrl, matchImportedCourse } from './ntu-course-exams.mjs';
import { searchNtuCourses, resolveNtuCourse } from './ntu-course-catalog.mjs';
import {coolPlanForStudent} from './cool-course-plan.mjs';
import {preferredExamPlan} from './exam-plan.mjs';
const COOKIE = '__Host-campus_week';
const SESSION_SECONDS = 30 * 24 * 3600;
const now = () => Math.floor(Date.now() / 1000);
const cookie = (token, maxAge = SESSION_SECONDS) => `${COOKIE}=${token}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
function json(value, status = 200, additional = {}) {
  return Response.json(value, { status, headers: {
    'Cache-Control': 'no-store, private',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    ...additional
  }});
}
function rawSession(request) {
  const matches = (request.headers.get('Cookie') || '').split(';').map(v => v.trim()).filter(v => v.startsWith(COOKIE + '='));
  if (matches.length !== 1) return null;
  const token = matches[0].slice(COOKIE.length + 1);
  return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}
function sameOrigin(request, env) {
  let expected; try { expected = new URL(env.APP_ORIGIN); } catch { throw new ApiError(503, 'configuration_required', 'Campus Week is not configured yet.'); }
  const url = new URL(request.url);
  if (expected.origin !== url.origin || expected.pathname !== '/' || expected.search || expected.hash || url.protocol !== 'https:') throw new ApiError(503, 'configuration_required', 'Campus Week must use its configured HTTPS address.');
  const origin = request.headers.get('Origin');
  if (origin && origin !== expected.origin || request.headers.get('Sec-Fetch-Site') === 'cross-site') throw new ApiError(403, 'origin_rejected', 'Open Campus Week directly to use this action.');
  if (!['GET', 'HEAD'].includes(request.method) && origin !== expected.origin) throw new ApiError(403, 'origin_rejected', 'Open Campus Week directly to use this action.');
}
async function session(request, env, requireCsrf = false) {
  const token = rawSession(request);
  if (!token) throw new ApiError(401, 'login_required', 'Sign in to Campus Week.');
  const tokenHash = await digest(token);
  const row = await env.DB.prepare('SELECT s.token_hash, s.student_id, s.csrf_token, s.expires_at, u.student_number FROM sessions s JOIN students u ON u.id = s.student_id WHERE s.token_hash = ? AND s.expires_at > ?').bind(tokenHash, now()).first();
  if (!row) throw new ApiError(401, 'login_required', 'Your Campus Week session has expired. Sign in again.');
  if (requireCsrf && request.headers.get('X-CSRF-Token') !== row.csrf_token) throw new ApiError(403, 'csrf_required', 'Refresh Campus Week before trying this action.');
  return row;
}
async function rateLimit(request, env, studentNumber) {
  const window = 600, bucket = Math.floor(now() / window);
  // The IP comes from Cloudflare, never X-Forwarded-For supplied by a client.
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  const limits = [[`ip:${ip}`, 20], [`student:${studentNumber}`, 10]];
  const results = await env.DB.batch(await Promise.all(limits.map(async ([identity]) => {
    const key = await digest(`${env.NTU_CREDENTIAL_KEY}:login:${identity}:${bucket}`);
    return env.DB.prepare('INSERT INTO login_limits(key, attempts, expires_at) VALUES(?, 1, ?) ON CONFLICT(key) DO UPDATE SET attempts = attempts + 1 RETURNING attempts').bind(key, (bucket + 1) * window);
  })));
  if (results.some((result, i) => result.results[0].attempts > limits[i][1])) throw new ApiError(429, 'try_later', 'Too many sign-in attempts. Please try again in ten minutes.');
}
async function login(request, env) {
  if (env.NTU_LOGIN_ENABLED !== 'true') throw new ApiError(503, 'login_not_enabled', 'NTU sign-in is not available yet.');
  await encryptionKey(env.NTU_CREDENTIAL_KEY);
  const body = await readJson(request);
  if (Object.keys(body).some(key => !['studentNumber', 'password'].includes(key))) throw new ApiError(400, 'invalid_request', 'Only student number and password are accepted.');
  const studentNumber = normalizeStudentNumber(body.studentNumber);
  if (typeof body.password !== 'string' || !body.password || body.password.length > 1024 || /[\r\n\0]/.test(body.password)) throw new ApiError(400, 'invalid_password', 'Enter your NTU Mail password.');
  await rateLimit(request, env, studentNumber);
  const verified = await verifyNtuMail(studentNumber, body.password);
  const studentIdCandidate = crypto.randomUUID();
  const results = await env.DB.batch([
    env.DB.prepare('INSERT OR IGNORE INTO students(id, student_number, created_at) VALUES(?, ?, ?)').bind(studentIdCandidate, studentNumber, now()),
    env.DB.prepare('SELECT id, student_number FROM students WHERE student_number = ?').bind(studentNumber)
  ]);
  const student = results[1].results[0];
  const authorization = await encryptAuthorization(env.NTU_CREDENTIAL_KEY, student.id, 'ntu_mail', { username: verified.username, password: body.password });
  body.password = '';
  const token = randomToken(), tokenHash = await digest(token), csrf = randomToken(), expiresAt = now() + SESSION_SECONDS;
  const statements = [
    env.DB.prepare("INSERT INTO student_connections(student_id, provider, encrypted_authorization, status, verified_at) VALUES(?, 'ntu_mail', ?, 'authorized', ?) ON CONFLICT(student_id, provider) DO UPDATE SET encrypted_authorization = excluded.encrypted_authorization, status = excluded.status, verified_at = excluded.verified_at").bind(student.id, authorization, verified.verifiedAt),
    env.DB.prepare('INSERT INTO sessions(token_hash, student_id, csrf_token, created_at, expires_at) VALUES(?, ?, ?, ?, ?)').bind(tokenHash, student.id, csrf, now(), expiresAt)
  ];
  const previous = rawSession(request);
  if (previous) statements.push(env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await digest(previous)));
  await env.DB.batch(statements);
  await env.DB.prepare('UPDATE mail_state SET upstream=NULL,next_check=0,failures=0,last_error=NULL WHERE student_id=?').bind(student.id).run();
  return json({ studentNumber: student.student_number, csrfToken: csrf, expiresAt, connections: { ntuMail: 'authorized', cool: 'not_connected', timetable: 'not_connected' } }, 200, { 'Set-Cookie': cookie(token) });
}
async function connections(env, studentId) {
  const result = await env.DB.prepare('SELECT provider, status, verified_at FROM student_connections WHERE student_id = ? ORDER BY provider').bind(studentId).all();
  const byProvider = new Map(result.results.map(row => [row.provider, row]));
  return ['ntu_mail', 'cool', 'timetable'].map(provider => ({ provider, status: byProvider.get(provider)?.status || 'not_connected', verifiedAt: byProvider.get(provider)?.verified_at || null, syncReady: ['timetable', 'cool'].includes(provider) && byProvider.get(provider)?.status === 'authorized', lastSyncedAt: ['timetable', 'cool'].includes(provider) ? byProvider.get(provider)?.verified_at || null : null }));
}
export default {
  async fetch(request, env) {
    try {
      const path = new URL(request.url).pathname;
      if (!path.startsWith('/api/')) return env.ASSETS ? env.ASSETS.fetch(request) : json({ error: { code: 'not_found', message: 'Not found.' } }, 404);
      sameOrigin(request, env);
      const authorizationStorageReady = typeof env.NTU_CREDENTIAL_KEY === 'string' && /^[0-9a-f]{64}$/i.test(env.NTU_CREDENTIAL_KEY);
      // Report only the setup issue, never the secret or any part of its value.
      const authorizationStorageIssue = authorizationStorageReady ? null : env.NTU_CREDENTIAL_KEY ? 'invalid_format' : 'missing';
      const loginEnabled = env.NTU_LOGIN_ENABLED === 'true' && authorizationStorageReady && !!env.DB;
      if (request.method === 'GET' && path === '/api/ntu/status') return json({ available: true, mode: 'accounts', loginEnabled, authorizationStorageReady, authorizationStorageIssue, timetableSyncReady: true, coolCalendarReady: true, announcementsSyncReady: true, liveSyncReady: false });
      if (request.method === 'GET' && path === '/api/health') return json({ service: 'campus-week', stage: 'accounts-timetable-and-calendar', loginEnabled, authorizationStorageReady, authorizationStorageIssue, databaseBound: !!env.DB, timetableSyncReady: true, coolCalendarReady: true, announcementsSyncReady: true, liveSyncReady: false });
      if (!env.DB) throw new ApiError(503, 'configuration_required', 'Campus Week database is not configured yet.');
      if (path === '/api/auth/login' && request.method === 'POST') return await login(request, env);
      if (path === '/api/auth/me' && request.method === 'GET') {
        const current = await session(request, env);
        return json({ studentNumber: current.student_number, csrfToken: current.csrf_token, expiresAt: current.expires_at });
      }
      if (path === '/api/connections' && request.method === 'GET') {
        const current = await session(request, env);
        return json({ connections: await connections(env, current.student_id) });
      }
      if(path==='/api/preferences'){
        const current=await session(request,env,request.method!=='GET'),owner={studentNumber:current.student_number};
        if(request.method==='GET')return json({...owner,...await readPreferences(env,current)});
        if(request.method==='PATCH')return json({...owner,...await savePreferences(env,current,await readJson(request))});
      }
      if(path==='/api/widgets/hanzi'&&request.method==='GET'){
        const current=await session(request,env);return json({studentNumber:current.student_number,...await readHanziWidget(env,current,new URL(request.url).searchParams.get('username'))});
      }
      if (path.startsWith('/api/mail/')) {
        const current=await session(request,env,request.method!=='GET'),url=new URL(request.url),owner={studentNumber:current.student_number};
        if(path==='/api/mail/ai'&&request.method==='POST')return json({...owner,...await reviseDraft(env,current,await readJson(request,400000))});
        if(path==='/api/mail/drafts'&&request.method==='GET')return json({...owner,...await listComposeDrafts(env,current,url.searchParams.get('id'))});
        if(path==='/api/mail/drafts'&&request.method==='POST')return json({...owner,...await saveComposeDraft(env,current,await readJson(request,400000))});
        if(path==='/api/mail/drafts'&&request.method==='DELETE')return json({...owner,...await deleteComposeDraft(env,current,await readJson(request))});
        if(path==='/api/mail/drafts/attachment'&&request.method==='POST')return json({...owner,...await uploadComposePart(env,current,await readJson(request,370000))});
        if(path==='/api/mail/drafts/attachment'&&request.method==='DELETE')return json({...owner,...await removeComposeFile(env,current,await readJson(request))});
        if(path==='/api/mail/outbox'&&request.method==='GET')return json({...owner,...await listComposeJobs(env,current)});
        if(path==='/api/mail/outbox'&&request.method==='POST')return json({...owner,...await queueComposeMail(env,current,await readJson(request))});
        if(path==='/api/mail/outbox/action'&&request.method==='POST')return json({...owner,...await changeComposeJob(env,current,await readJson(request))});
        if(path==='/api/mail/list'&&request.method==='GET')return json({...owner,...await listMail(env,current,url)});
        if(path==='/api/mail/message'&&request.method==='GET')return json({...owner,...await readMail(env,current,url)});
        if(path==='/api/mail/attachment'&&request.method==='GET')return await attachment(env,current,url);
        if(path==='/api/mail/translate'&&request.method==='POST')return json({...owner,...await translateMail(env,current,await readJson(request))});
        if(path==='/api/mail/send'&&request.method==='POST')return json({...owner,...await sendMail(env,current,await readJson(request,220000))});
        if(path==='/api/mail/send/check'&&request.method==='POST')return json({...owner,...await checkSend(env,current,(await readJson(request)).id)});
        if(path==='/api/mail/action'&&request.method==='POST'){
          const body=await readJson(request);
          if(!['read','unread','star','unstar','archive','trash','read-all'].includes(body.action))throw new ApiError(400,'invalid_mail','Invalid mail action.');
          const ref=body.action==='read-all'?null:mailReference(body.mailbox,body.uid);
          await withMailbox(env,current,async s=>{
            if(body.action==='read-all')await s.ajax('mark',{_mbox:'INBOX',_uid:'*',_flag:'read',_folders:'cur'},true);
            else if(['archive','trash'].includes(body.action))await s.ajax('move',{_mbox:ref.mailbox,_uid:ref.uid,_target_mbox:s.folders[body.action==='archive'?'archive':'trash']},true);
            else await s.ajax('mark',{_mbox:ref.mailbox,_uid:ref.uid,_flag:{read:'read',unread:'unread',star:'flagged',unstar:'unflagged'}[body.action]},true);
            await env.DB.prepare('UPDATE mail_state SET inbox_at=0 WHERE student_id=?').bind(current.student_id).run();
          });return json({...owner,ok:true});
        }
        if(path==='/api/mail/push'&&request.method==='GET'){
          const state=await env.DB.prepare('SELECT checked_at,next_check,last_error,failures FROM mail_state WHERE student_id=?').bind(current.student_id).first();
          const devices=await env.DB.prepare('SELECT id,created_at FROM mail_push WHERE student_id=?').bind(current.student_id).all();
          return json({...owner,publicKey:(await pushConfiguration(env)).publicKey,devices:devices.results,state:state||null});
        }
        if(path==='/api/mail/push'&&request.method==='POST')return json({...owner,...await subscribe(env,current,await readJson(request))});
        if(path==='/api/mail/push/test'&&request.method==='POST')return json({...owner,...await testPushDelivery(env,current,(await readJson(request)).id)});
        if(path==='/api/mail/push'&&request.method==='DELETE'){
          const body=await readJson(request);if(typeof body.id!=='string')throw new ApiError(400,'invalid_push','Choose a notification device.');
          await env.DB.prepare('DELETE FROM mail_push WHERE student_id=? AND id=?').bind(current.student_id,body.id).run();return json({...owner,enabled:false});
        }
        throw new ApiError(404,'not_found','This mail action is not available.');
      }
      if (path === '/api/events' || path.startsWith('/api/events/')) {
        const current=await session(request,env,request.method!=='GET'),owner={studentNumber:current.student_number};
        if(new URL(request.url).search)throw new ApiError(400,'invalid_event','Event requests do not accept query parameters.');
        if(path==='/api/events'&&request.method==='GET')return json({...owner,events:await listEvents(env,current.student_id)});
        if(path==='/api/events'&&request.method==='POST')return json({...owner,event:await createEvent(env,current.student_id,await readJson(request))},201);
        const id=/^\/api\/events\/([^/]+)$/.exec(path)?.[1];
        if(id&&['PATCH','DELETE'].includes(request.method))return json({...owner,event:await changeEvent(env,current.student_id,id,await readJson(request),request.method==='DELETE')});
        throw new ApiError(404,'not_found','This event action is not available.');
      }
      if (path === '/api/custom-exams' || path.startsWith('/api/custom-exams/')) {
        const current=await session(request,env,request.method!=='GET'),owner={studentNumber:current.student_number};
        if(new URL(request.url).search)throw new ApiError(400,'invalid_custom_exam','Custom exam requests do not accept query parameters.');
        if(path==='/api/custom-exams'&&request.method==='GET')return json({...owner,exams:await listCustomExams(env,current.student_id)});
        if(path==='/api/custom-exams'&&request.method==='POST')return json({...owner,exam:await createCustomExam(env,current.student_id,await readJson(request,4000))},201);
        const id=/^\/api\/custom-exams\/([^/]+)$/.exec(path)?.[1];
        if(id&&['PATCH','DELETE'].includes(request.method))return json({...owner,exam:await changeCustomExam(env,current.student_id,id,await readJson(request,4000),request.method==='DELETE')});
        throw new ApiError(404,'not_found','This custom exam action is not available.');
      }
      if (path === '/api/tasks' || path.startsWith('/api/tasks/')) {
        const current = await session(request, env, request.method !== 'GET');
        const owner = { studentNumber: current.student_number };
        // Ownership always comes from the authenticated session, never a URL or body ID.
        if (new URL(request.url).search) throw new ApiError(400, 'invalid_task', 'Task requests do not accept query parameters.');
        if (path === '/api/tasks' && request.method === 'GET') return json({ ...owner, tasks: await listTasks(env, current.student_id) });
        if (path === '/api/tasks' && request.method === 'POST') return json({ ...owner, task: await createTask(env, current.student_id, await readJson(request)) }, 201);
        const id = /^\/api\/tasks\/([^/]+)$/.exec(path)?.[1];
        if (id && ['PATCH', 'DELETE'].includes(request.method)) return json({ ...owner, task: await changeTask(env, current.student_id, id, await readJson(request), request.method === 'DELETE') });
        throw new ApiError(404, 'not_found', 'This task action is not available.');
      }
      if (path.startsWith('/api/timetable/courses/') && request.method === 'PATCH') {
        const current=await session(request,env,true),courseId=path.slice('/api/timetable/courses/'.length);
        const body=await readJson(request,12000);
        if(body.offeringSerial!=null)await limit(env,current.student_id,'exam-catalog',30);
        return json({studentNumber:current.student_number,...await changeCourseDetails(env,current.student_id,courseId,body)});
      }
      // Read-only NTU Course Information lab: no grade data, credentials or persistence.
      if(path==='/api/exams/cool-preview'&&request.method==='POST'){
        const current=await session(request,env,true),body=await readJson(request,2000);
        if(new URL(request.url).search||Object.keys(body).some(k=>!['courseId','serial'].includes(k))||
          !/^[A-Za-z0-9_-]{43}$/.test(body.courseId||'')||!/^\d{4,6}$/.test(body.serial||''))
          throw new ApiError(400,'invalid_exam_lookup','Choose an imported course and its catalog section.');
        const {timetable}=await savedTimetable(env,current.student_id);
        const rows=timetable?.sessions.filter(c=>c.courseId===body.courseId)||[];
        if(!timetable?.term||!rows.length)throw new ApiError(404,'exam_course_missing','Choose a course from your own imported timetable.');
        await limit(env,current.student_id,'exam-catalog',30);
        const candidates=await searchNtuCourses(timetable.term,rows[0]);
        const resolution=resolveNtuCourse(timetable,rows,candidates,{serial:body.serial});
        const plan=await coolPlanForStudent(env,current,resolution.selected);
        return json({studentNumber:current.student_number,plan});
      }
      if (path === '/api/exams/resolve' && request.method === 'GET' || ['/api/exams/plan','/api/exams/options'].includes(path)&&request.method==='POST') {
        const optionsOnly=path==='/api/exams/options',coolFirst=path!=='/api/exams/resolve',current=await session(request,env,coolFirst);
        let search=new URL(request.url).searchParams,force=false;
        if(coolFirst){
          const body=await readJson(request,2000);
          const keys=path==='/api/exams/plan'?['courseId','serial','force']:['courseId','serial'];
          if(new URL(request.url).search||Object.keys(body).some(k=>!keys.includes(k))||typeof body.courseId!=='string'||body.serial!==undefined&&typeof body.serial!=='string'||body.force!==undefined&&typeof body.force!=='boolean')
            throw new ApiError(400,'invalid_exam_lookup','Choose a course from your imported timetable.');
          force=body.force===true;
          search=new URLSearchParams(Object.fromEntries(Object.entries(body).filter(([key])=>key!=='force')));
        }
        if([...search.keys()].some(k=>!['courseId','serial'].includes(k)) || search.getAll('courseId').length!==1 ||
          !/^[A-Za-z0-9_-]{43}$/.test(search.get('courseId')||'') ||
          search.has('serial')&&(search.getAll('serial').length!==1||!/^\d{4,6}$/.test(search.get('serial'))))
          throw new ApiError(400,'invalid_exam_lookup','Choose a course from your imported timetable.');
        const saved=await savedTimetable(env,current.student_id),timetable=saved.timetable;
        if(!timetable?.term)throw new ApiError(409,'exam_timetable_missing','Sync your NTU timetable first.');
        const rows=timetable.sessions.filter(s=>s.courseId===search.get('courseId'));
        if(!rows.length)throw new ApiError(404,'exam_course_missing','Choose a course from your own imported timetable.');
        const savedOffering=saved.courseOverrides?.[search.get('courseId')]?.examOffering;
        const selection=savedOffering?.serial||'',courseId=search.get('courseId');
        if(path==='/api/exams/plan'&&!force){
          const cached=saved.examPlans?.[courseId];
          if(cached?.result)return json({studentNumber:current.student_number,...cached.result,savedAt:cached.savedAt});
        }
        if(optionsOnly){
          const cached=saved.sectionOptions?.[courseId];
          if(cached)return json({studentNumber:current.student_number,selected:cached.selected,
            matching:cached.matching,candidates:cached.candidates,savedAt:cached.savedAt});
        }
        const bucket=Math.floor(Date.now()/600000);
        const counter=await env.DB.prepare('INSERT INTO login_limits(key,attempts,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=attempts+1 RETURNING attempts')
          .bind('exam-resolve:'+current.student_id+':'+bucket,(bucket+1)*600).first();
        if(counter.attempts>30)throw new ApiError(429,'exam_try_later','Please retry the syllabus lookup in a few minutes.');
        const candidates=await searchNtuCourses(timetable.term,rows[0]);
        // Optional account-owned COOL evidence already fetched by normal announcement sync.
        // It is never returned, and public catalog requests never receive credentials.
        let coolIds=[];
        try {
          const snapshot=(await savedAnnouncements(env,current.student_id)).announcements;
          if(snapshot&&Date.now()-snapshot.syncedAt<86400000)
            coolIds=[...new Set([...(snapshot.courses||[]).map(c=>String(c.id)),...(snapshot.items||[]).map(c=>String(c.courseId))])];
        } catch { /* Public lookup still works without a COOL connection. */ }
        const resolution=resolveNtuCourse(timetable,rows,candidates,{serial:search.get('serial')||(!optionsOnly&&savedOffering?.serial)||undefined,coolIds});
        let course=null;
        if(resolution.selected&&!optionsOnly){
          course=coolFirst?await preferredExamPlan(env,current,timetable,resolution.selected):await readNtuCourseExams(resolution.selected.sourceUrl);
          if(!coolFirst&&matchImportedCourse(timetable,{code:resolution.selected.courseCode,serial:resolution.selected.serial,section:resolution.selected.section},course).status!=='matched-identifiers')
            throw new ApiError(502,'exam_catalog_changed','The syllabus and catalog metadata disagree. No dates were imported.');
        }
        const {coolId:unused,...selected}=resolution.selected||{};
        const sections={selected:resolution.selected?selected:null,matching:resolution.matching,
          candidates:resolution.candidates.map(({coolId,...c})=>c)};
        const result={...sections,course};
        if(path==='/api/exams/plan'){
          // Atomically save the exam plan and its section choices. Neither requires
          // an upstream query again once the student's encrypted snapshot exists.
          await saveStudentExamPlan(env,current.student_id,courseId,timetable.term,selection,result,sections);
        }else if(optionsOnly)await saveStudentSectionOptions(env,current.student_id,courseId,timetable.term,sections);
        return json({studentNumber:current.student_number,...result});
      }
      if (path === '/api/exams/preview' && request.method === 'GET') {
        const current = await session(request, env), search = new URL(request.url).searchParams;
        if ([...search.keys()].some(k => !['source', 'courseId', 'serial', 'section', 'code'].includes(k)) ||
            search.getAll('source').length !== 1 || search.getAll('courseId').length !== 1 ||
            (search.has('serial') && (search.getAll('serial').length !== 1 || !/^\d{4,6}$/.test(search.get('serial')))) ||
            (search.has('section') && (search.getAll('section').length !== 1 || !/^[A-Za-z0-9]{1,4}$/.test(search.get('section')))) ||
            (search.has('code') && (search.getAll('code').length !== 1 || !/^[A-Za-z0-9 -]{3,24}$/.test(search.get('code')))) ||
            !/^[A-Za-z0-9_-]{43}$/.test(search.get('courseId') || ''))
          throw new ApiError(400, 'invalid_exam_preview', 'Choose a class and an official NTU syllabus link.');
        const source = syllabusUrl(search.get('source'));
        const saved = await savedTimetable(env, current.student_id);
        if (!saved.timetable?.term) throw new ApiError(409, 'exam_timetable_missing', 'Sync your NTU timetable first to identify the semester.');
        if (!new URL(source).pathname.includes('/courses/' + saved.timetable.term + '/'))
          throw new ApiError(409,'exam_wrong_term','The syllabus belongs to another semester.');
        const matches = saved.timetable.sessions.filter(item => item.courseId === search.get('courseId'));
        if (!matches.length) throw new ApiError(404,'exam_course_missing','Choose a course from your own imported timetable.');
        for(const field of ['serial','section','code'])if(search.has(field)&&matches[0][field]&&
          search.get(field).normalize('NFKC').replace(/[\s-]/g,'').toUpperCase()!==String(matches[0][field]).normalize('NFKC').replace(/[\s-]/g,'').toUpperCase())
          throw new ApiError(409,'exam_identifier_conflict','Manual hints cannot replace identifiers already imported from NTU.');
        const ident = {...matches[0], ...(search.has('serial') ? {serial:search.get('serial')} : {}), ...(search.has('section') ? {section:search.get('section')} : {}), ...(search.has('code') ? {code:search.get('code')} : {})}, bucket = Math.floor(Date.now()/600000);
        const counter = await env.DB.prepare('INSERT INTO login_limits(key,attempts,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=attempts+1 RETURNING attempts')
          .bind('exam-preview:' + current.student_id + ':' + bucket,(bucket+1)*600).first();
        if(counter.attempts > 8) throw new ApiError(429, 'exam_try_later', 'Please retry the syllabus check in a few minutes.');
        const course = await readNtuCourseExams(source);
        return json({studentNumber:current.student_number,course,
          matching:{...matchImportedCourse(saved.timetable, ident, course),identifierSource:search.has('serial')||search.has('section')||search.has('code')?'student-entered':'imported'},
          imported:{title:ident.titleEn || ident.title || ident.titleZh,code:ident.code || '',serial:ident.serial || null,section:ident.section || null}});
      }
      if (path === '/api/timetable' && request.method === 'GET') {
        const current = await session(request, env);
        return json({studentNumber:current.student_number,...await savedTimetable(env, current.student_id)});
      }
      if (path === '/api/timetable/sync' && request.method === 'POST') {
        const current = await session(request, env, true);
        const body = await readJson(request);
        if (Object.keys(body).some(key => !['password', 'force'].includes(key)) || body.force !== undefined && typeof body.force !== 'boolean' || body.password !== undefined && (typeof body.password !== 'string' || !body.password || body.password.length > 1024 || /[\r\n\0]/.test(body.password))) throw new ApiError(400, 'invalid_request', 'Enter your myNTU password, or use your saved connection.');
        try { return json({studentNumber:current.student_number,...await syncTimetable(env, current, body.password, body.force === true)}); }
        finally { body.password = ''; }
      }
      if (path === '/api/cool/announcements' && request.method === 'GET') {
        const current = await session(request, env);
        return json({studentNumber:current.student_number,...await savedAnnouncements(env,current.student_id)});
      }
      if (path === '/api/cool/announcements/sync' && request.method === 'POST') {
        const current = await session(request,env,true), body = await readJson(request);
        if (Object.keys(body).some(key => !['password','force'].includes(key)) || body.force !== undefined && typeof body.force !== 'boolean' || body.password !== undefined && (typeof body.password !== 'string' || !body.password || body.password.length > 1024 || /[\r\n\0]/.test(body.password))) throw new ApiError(400,'invalid_request','Use your saved COOL connection or enter your myNTU password.');
        try { return json({studentNumber:current.student_number,...await syncAnnouncements(env,current,body.password,body.force === true)}); }
        finally { body.password = ''; }
      }
      if (path === '/api/cool/calendar' && request.method === 'GET') {
        const current = await session(request, env);
        return json(await savedCoolCalendar(env, current.student_id));
      }
      if (path === '/api/cool/calendar/sync' && request.method === 'POST') {
        const current = await session(request, env, true), body = await readJson(request);
        if (Object.keys(body).some(key => !['password', 'force'].includes(key)) || body.force !== undefined && typeof body.force !== 'boolean' || body.password !== undefined && (typeof body.password !== 'string' || !body.password || body.password.length > 1024 || /[\r\n\0]/.test(body.password))) throw new ApiError(400, 'invalid_request', 'Use your saved COOL connection, or enter your myNTU password.');
        try { return json(await syncCoolCalendar(env, current, body.password, body.force === true)); }
        finally { body.password = ''; }
      }
      if (path === '/api/auth/logout' && request.method === 'POST') {
        const current = await session(request, env, true);
        await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(current.token_hash).run();
        return json({ signedOut: true }, 200, { 'Set-Cookie': cookie('', 0) });
      }
      if (path === '/api/auth/logout-all' && request.method === 'POST') {
        const current = await session(request, env, true);
        await env.DB.prepare('DELETE FROM sessions WHERE student_id = ?').bind(current.student_id).run();
        return json({ signedOut: true }, 200, { 'Set-Cookie': cookie('', 0) });
      }
      throw new ApiError(404, 'not_found', 'This Campus Week API route is not available yet.');
    } catch (error) {
      if (error instanceof ApiError) return json({ error: { code: error.code, message: error.message, ...(error.retryAfterSeconds ? { retryAfterSeconds: error.retryAfterSeconds } : {}) } }, error.status, error.retryAfterSeconds ? { 'Retry-After': String(error.retryAfterSeconds) } : {});
      // Provider bodies, passwords, cookies and raw exceptions never enter logs or responses.
      return json({ error: { code: 'temporarily_unavailable', message: 'Campus Week is temporarily unavailable. Please retry.' } }, 503);
    }
  },
  async scheduled(_event, env, ctx) {
    // Independent tasks must not block incoming-mail notifications when an
    // unrelated scheduled send or synchronization fails or takes too long.
    ctx.waitUntil(env.DB.batch([
      env.DB.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(now()),
      env.DB.prepare('DELETE FROM login_limits WHERE expires_at <= ?').bind(now())
    ]));
    ctx.waitUntil(processDueComposeJobs(env));
    ctx.waitUntil(refreshMailNotifications(env));
    if(!_event.cron||new Date(_event.scheduledTime||Date.now()).getUTCMinutes()===15){
      ctx.waitUntil(refreshDueTimetables(env));
      ctx.waitUntil(refreshDueCoolCalendars(env));
    }
  }
};

