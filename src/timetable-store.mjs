import { ApiError, decryptAuthorization, encryptAuthorization, digest } from './security.mjs';
import { courseIdentity } from '../public/course-model.mjs';
import { readNtuTimetable } from './ntu-timetable.mjs';

export const TIMETABLE_INTERVAL = 5 * 24 * 60 * 60 * 1000;
async function connection(env, studentId, provider = 'timetable') {
  return env.DB.prepare('SELECT provider, status, verified_at, encrypted_authorization FROM student_connections WHERE student_id = ? AND provider = ?').bind(studentId, provider).first();
}
async function authorization(env, studentId, provider, row) {
  if (!row) return null;
  try { return await decryptAuthorization(env.NTU_CREDENTIAL_KEY, studentId, provider, row.encrypted_authorization); }
  catch { throw new ApiError(503, 'authorization_unavailable', 'Your saved NTU connection could not be opened. Please reconnect your account.'); }
}
async function publicTimetable(value, status) {
  const timetable = value?.timetable ? {...value.timetable, sessions:await Promise.all(value.timetable.sessions.map(async session => ({...session,courseId:await digest(courseIdentity(value.timetable,session))})))} : null;
  return {timetable,courseOverrides:value?.courseOverrides || {},connectionStatus:status || 'not_connected',checkIntervalMs:TIMETABLE_INTERVAL};
}
export async function savedTimetable(env, studentId) {
  const row = await connection(env, studentId);
  return publicTimetable(await authorization(env,studentId,'timetable',row),row?.status);
}
// Both importer and personal edits merge against the latest encrypted record.
async function updateRecord(env, studentId, transform, verifiedAt) {
  for (let attempt=0;attempt<5;attempt++) {
    const row=await connection(env,studentId),value=await authorization(env,studentId,'timetable',row);
    const next=await transform(value),encrypted=await encryptAuthorization(env.NTU_CREDENTIAL_KEY,studentId,'timetable',next);
    const status=verifiedAt === undefined ? row?.status || 'authorized' : 'authorized';
    const result=row
      ?await env.DB.prepare("UPDATE student_connections SET encrypted_authorization=?,status=?,verified_at=? WHERE student_id=? AND provider='timetable' AND encrypted_authorization=?").bind(encrypted,status,verifiedAt ?? row.verified_at,studentId,row.encrypted_authorization).run()
      :await env.DB.prepare("INSERT OR IGNORE INTO student_connections(student_id,provider,encrypted_authorization,status,verified_at) VALUES(?,'timetable',?,'authorized',?)").bind(studentId,encrypted,verifiedAt ?? 0).run();
    if(Number(result.meta?.changes)>0)return publicTimetable(next,status);
  }
  throw new ApiError(409,'course_busy','Your timetable is updating. Please try again.');
}
export async function changeCourseDetails(env,studentId,courseId,body) {
  const invalid=()=>new ApiError(400,'invalid_course_details','Check the lesson name, room and description.');
  if(!/^[A-Za-z0-9_-]{43}$/.test(courseId)||!Number.isSafeInteger(body.version)||body.version<0||Object.keys(body).some(k=>!['version','language','name','room','description','reset'].includes(k)))throw invalid();
  if(body.reset !== undefined && (body.reset !== true || Object.keys(body).some(k=>!['version','reset'].includes(k))))throw invalid();
  if(!body.reset){
    if(!['en','zh'].includes(body.language)||!['name','room','description'].some(k=>Object.hasOwn(body,k)))throw invalid();
    for(const [key,max]of [['name',160],['room',200],['description',1000]]){
      const v=body[key];if(v === undefined || v === null)continue;
      if(typeof v!=='string'||Array.from(v.trim()).length>max||/[\x00-\x08\x0b-\x1f\x7f]/.test(v)||key!=='description'&&/[\r\n]/.test(v))throw invalid();
    }
  }
  return updateRecord(env,studentId,async value=>{
    if(!value?.timetable)throw new ApiError(404,'course_not_found','This class is no longer in your timetable.');
    const ids=await Promise.all(value.timetable.sessions.map(s=>digest(courseIdentity(value.timetable,s))));
    if(!ids.includes(courseId))throw new ApiError(404,'course_not_found','This class is no longer in your timetable.');
    const previous=value.courseOverrides?.[courseId];
    if((previous?.version || 0)!==body.version)throw new ApiError(409,'course_changed','These details changed on another device. Reopen this lesson to load the latest details.');
    if(!previous&&Object.keys(value.courseOverrides || {}).length>=1000)throw new ApiError(409,'course_details_full','There are too many saved lesson customizations.');
    const next=body.reset ? {nameEn:null,nameZh:null,room:null,description:null} : {...previous};
    if(!body.reset)for(const key of ['name','room','description'])if(Object.hasOwn(body,key))next[key==='name'?(body.language==='en'?'nameEn':'nameZh'):key]=body[key]===null || key==='name'&&!body[key].trim()?null:body[key].trim();
    next.version=body.version+1;
    return {...value,courseOverrides:{...value.courseOverrides,[courseId]:next}};
  });
}
export async function syncTimetable(env, student, password, force = false) {
  const previous = await connection(env, student.student_id);
  const retained = await authorization(env, student.student_id, 'timetable', previous);
  if (!force && password === undefined && retained?.timetable && previous.status === 'authorized' && Date.now() - previous.verified_at < 60000) return {...await publicTimetable(retained,'authorized'),changed:false};
  if (password === undefined && previous?.status === 'reconnect_required') throw new ApiError(409, 'timetable_credentials_required', 'Reconnect your timetable with your myNTU password. Your saved classes are still available.');
  const mail = password === undefined && !retained ? await connection(env, student.student_id, 'ntu_mail') : null;
  const credentials = password === undefined ? retained || await authorization(env, student.student_id, 'ntu_mail', mail) : { username: student.student_number, password };
  if (!credentials || credentials.username !== student.student_number || typeof credentials.password !== 'string' || !credentials.password) throw new ApiError(409, 'timetable_credentials_required', 'Enter your myNTU password to connect your timetable.');
  // Count credential submissions, not public redirect/layout failures.
  async function beforeCredentialSubmit() {
    const bucket = Math.floor(Date.now() / 600000), key = `timetable:${student.student_id}:${bucket}`;
    const limit = await env.DB.prepare('INSERT INTO login_limits(key, attempts, expires_at) VALUES(?, 1, ?) ON CONFLICT(key) DO UPDATE SET attempts = attempts + 1 RETURNING attempts').bind(key, (bucket + 1) * 600).first();
    if (limit.attempts > 3) {
      const error = new ApiError(429, 'timetable_try_later', 'Timetable sign-in attempts are temporarily paused. Your account is still signed in.');
      error.retryAfterSeconds = Math.max(1, Math.ceil(((bucket + 1) * 600000 - Date.now()) / 1000));
      throw error;
    }
  }
  try {
    const timetable = await readNtuTimetable(student.student_number, credentials.password, { beforeCredentialSubmit });
    const changed = JSON.stringify(timetable.sessions) !== JSON.stringify(retained?.timetable?.sessions) || timetable.term !== retained?.timetable?.term;
    timetable.changedAt = changed ? timetable.syncedAt : retained.timetable.changedAt || retained.timetable.syncedAt;
    const saved=await updateRecord(env,student.student_id,current=>({...current,username:student.student_number,password:credentials.password,timetable}),timetable.syncedAt);
    return {...saved,changed};
  } catch (error) {
    if (previous && ['timetable_credentials_required', 'timetable_verification_required'].includes(error.code)) await env.DB.prepare("UPDATE student_connections SET status = 'reconnect_required' WHERE student_id = ? AND provider = 'timetable'").bind(student.student_id).run();
    throw error;
  } finally { credentials.password = ''; password = ''; }
}

export async function refreshDueTimetables(env) {
  // Bound each cron batch and rotate by oldest success; a rejected password stops
  // background attempts until the owner reconnects. Never discard a saved version.
  const due = await env.DB.prepare("SELECT u.id AS student_id, u.student_number FROM students u JOIN student_connections c ON c.student_id = u.id WHERE c.provider = 'timetable' AND c.status = 'authorized' AND c.verified_at < ? ORDER BY c.verified_at LIMIT 10").bind(Date.now() - TIMETABLE_INTERVAL).all();
  for (const student of due.results) {
    try { await syncTimetable(env, student); } catch { /* Provider details and authorization never enter logs. */ }
  }
}
