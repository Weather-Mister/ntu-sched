import { ApiError } from './security.mjs';

const validId = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
function scope(options={}) {
  const shared=options.personal===true;
  return {table:shared?'personal_manual_tasks':'manual_tasks',maxText:shared?500:140,id:shared?value=>typeof value==='string'&&value.length>0&&value.length<=120&&!/[\x00-\x1f\x7f]/.test(value):validId};
}
const columns = 'id, text, done, version, created_at, updated_at, deleted_at';
const data = row => ({ id: row.id, text: row.text, done: row.done === 1, version: row.version, createdAt: row.created_at, updatedAt: row.updated_at, deleted: row.deleted_at !== null });
const invalid = () => new ApiError(400, 'invalid_task', 'Use a task of 1–140 characters and a valid task ID.');
const missing = () => new ApiError(404, 'task_not_found', 'This task is no longer available. Refresh your tasks.');
const conflict = () => new ApiError(409, 'task_changed', 'This task changed on another device. Refresh your tasks and try again.');
const full = () => new ApiError(409, 'tasks_full', 'You can save up to 500 tasks. Remove an old task before adding another.');

async function find(env, studentId, id, table) {
  return env.DB.prepare(`SELECT ${columns} FROM ${table} WHERE student_id = ? AND id = ?`).bind(studentId, id).first();
}
export async function listTasks(env, studentId, options) {
  const {table}=scope(options);
  const result = await env.DB.prepare(`SELECT ${columns} FROM ${table} WHERE student_id = ? AND deleted_at IS NULL ORDER BY created_at DESC, id DESC LIMIT 500`).bind(studentId).all();
  return result.results.map(data);
}
export async function createTask(env, studentId, body, options) {
  const {table,maxText,id:validTaskId}=scope(options);
  if (Object.keys(body).some(k => !['id', 'text'].includes(k)) || !validTaskId(body.id) || typeof body.text !== 'string') throw invalid();
  const text = body.text.trim();
  if (!text || Array.from(text).length > maxText || /[\x00-\x1f\x7f]/.test(text)) throw invalid();
  const timestamp = Date.now();
  // The client keeps this UUID for retries if an acknowledgement is lost.
  // A repeated create cannot duplicate a task or overwrite a later completion.
  await env.DB.prepare(`INSERT OR IGNORE INTO ${table}(student_id, id, text, created_at, updated_at) SELECT ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM ${table} WHERE student_id = ? AND deleted_at IS NULL) < 500`)
    .bind(studentId, body.id, text, timestamp, timestamp, studentId).run();
  const row = await find(env, studentId, body.id, table);
  if (!row) throw full();
  if (row.text !== text || row.deleted_at !== null) throw conflict();
  return data(row);
}
export async function changeTask(env, studentId, id, body, remove = false, options) {
  const {table,id:validTaskId}=scope(options);
  if (!validTaskId(id) || Object.keys(body).some(k => !(remove ? ['version'] : ['version', 'done', 'deleted']).includes(k)) || !Number.isSafeInteger(body.version) || body.version < 1) throw invalid();
  if (!remove && (Object.hasOwn(body, 'done') === Object.hasOwn(body, 'deleted') || Object.hasOwn(body, 'done') && typeof body.done !== 'boolean' || Object.hasOwn(body, 'deleted') && body.deleted !== false)) throw invalid();
  const current = await find(env, studentId, id, table);
  if (!current) throw missing();
  if (current.version !== body.version) throw conflict();
  const restore = !remove && body.deleted === false;
  if (!restore && current.deleted_at !== null) throw missing();
  const timestamp = Date.now();
  const row = await env.DB.prepare(`UPDATE ${table} SET done = ?, deleted_at = ?, updated_at = ?, version = version + 1 WHERE student_id = ? AND id = ? AND version = ? ${restore ? `AND (deleted_at IS NULL OR (SELECT COUNT(*) FROM ${table} WHERE student_id = ? AND deleted_at IS NULL) < 500)` : ''} RETURNING ${columns}`)
    .bind(remove || restore ? current.done : Number(body.done), remove ? timestamp : null, timestamp, studentId, id, body.version, ...(restore ? [studentId] : [])).first();
  if (!row) {
    const latest = await find(env, studentId, id, table);
    if (restore && latest?.version === body.version) throw full();
    throw conflict();
  }
  return data(row);
}
