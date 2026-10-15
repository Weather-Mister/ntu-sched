const encoder = new TextEncoder();
export class ApiError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
export function base64url(bytes) {
  let binary = '';
  for (let offset=0; offset<bytes.length; offset+=32768) binary += String.fromCharCode(...bytes.subarray(offset,offset+32768));
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}
export function randomToken() { return base64url(crypto.getRandomValues(new Uint8Array(32))); }
export async function digest(value) {
  return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))));
}
export async function encryptionKey(secret) {
  if (typeof secret !== 'string' || !/^[0-9a-f]{64}$/i.test(secret)) throw new ApiError(503, 'configuration_required', 'Campus Week login is not configured yet.');
  return crypto.subtle.importKey('raw', Uint8Array.from(secret.match(/../g), pair => parseInt(pair, 16)), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}
export async function encryptAuthorization(secret, studentId, provider, value) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const additionalData = encoder.encode(`campus-week:v1:${studentId}:${provider}`);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData }, await encryptionKey(secret), encoder.encode(JSON.stringify(value)));
  return JSON.stringify({ version: 1, iv: base64url(iv), data: base64url(new Uint8Array(encrypted)) });
}
function decode64(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid encrypted record.');
  return Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0));
}
export async function decryptAuthorization(secret, studentId, provider, record) {
  const { version, iv, data } = JSON.parse(record);
  if (version !== 1) throw new Error('Unsupported encrypted record.');
  const value = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode64(iv), additionalData: encoder.encode(`campus-week:v1:${studentId}:${provider}`) }, await encryptionKey(secret), decode64(data));
  return JSON.parse(new TextDecoder().decode(value));
}
export function normalizeStudentNumber(value) {
  if (typeof value !== 'string') throw new ApiError(400, 'invalid_student_number', 'Enter your NTU student number.');
  const number = value.trim().toLowerCase();
  if (!/^[a-z]\d{8}$/.test(number)) throw new ApiError(400, 'invalid_student_number', 'Use your NTU student number, such as b12345678.');
  return number;
}
export async function readJson(request, limit = 4096) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') || '')) throw new ApiError(415, 'json_required', 'Send a JSON request.');
  if (Number(request.headers.get('Content-Length')) > limit) throw new ApiError(413, 'request_too_large', 'The request is too large.');
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, 'invalid_request', 'Enter your login details.');
  const chunks = []; let size = 0;
  while (true) {
    const next = await reader.read(); if (next.done) break;
    size += next.value.byteLength;
    if (size > limit) { await reader.cancel(); throw new ApiError(413, 'request_too_large', 'The request is too large.'); }
    chunks.push(next.value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  let result; try { result = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new ApiError(400, 'invalid_json', 'Send a valid JSON request.'); }
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw new ApiError(400, 'invalid_json', 'Send a valid JSON object.');
  return result;
}
