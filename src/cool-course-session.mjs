import { ApiError } from './security.mjs';
import { connection, limit, mergeCoolConnection } from './cool-store.mjs';
import { discoverCoolCalendar } from './cool-login.mjs';
import { sessionCookies, restoreCookies } from './cool-announcements.mjs';

const COOL_COURSES = new URL('https://cool.ntu.edu.tw/api/v1/courses');

export async function withCoolCourseSession(env, student, operation, read) {
  const id = student.student_id;
  const needsConnection = () => new ApiError(409, 'cool_credentials_required', 'Connect or reconnect NTU COOL in Campus Week Settings.');
  await limit(env, id, operation, 20);
  const previous = await connection(env, id);
  if (previous?.value.announcementsReconnect || previous?.status === 'reconnect_required') throw needsConnection();
  let jar = restoreCookies(previous?.value.announcementCookies), credentials;

  async function login() {
    credentials = previous?.value.password ? previous.value : (await connection(env, id, 'timetable'))?.value || (await connection(env, id, 'ntu_mail'))?.value;
    if (credentials?.username !== student.student_number || !credentials.password) throw needsConnection();
    let cookies;
    await discoverCoolCalendar(student.student_number, credentials.password, {
      skipCalendar: true,
      beforeCredentialSubmit: () => limit(env, id, 'login', 3),
      onAuthenticated: authenticated => { cookies = sessionCookies(authenticated); }
    });
    jar.clear();
    jar = restoreCookies(cookies);
  }

  try {
    const hadSession = !!jar.header(COOL_COURSES);
    if (!hadSession) await login();
    let result;
    try { result = await read(jar); }
    catch (error) {
      if (error.code !== 'cool_session_expired' || !hadSession) throw error;
      await login();
      result = await read(jar);
    }
    // Save only the encrypted provider session. Course content stays in the response.
    await mergeCoolConnection(env, id, { announcementCookies: sessionCookies(jar) });
    return result;
  } catch (error) {
    if (['cool_credentials_required', 'cool_verification_required'].includes(error.code)) {
      await mergeCoolConnection(env, id, { announcementsReconnect: true });
    }
    throw error;
  } finally {
    jar.clear();
    if (credentials) credentials.password = '';
  }
}
