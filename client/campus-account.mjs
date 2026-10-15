// Import this module in Campus Week when the saved frontend is available.
// Serve frontend and /api on the same HTTPS origin. GitHub can own the source.
export class CampusAccount {
  current = null;
  async request(path, options = {}) {
    const activeAccount = this.current;
    const headers = new Headers(options.headers);
    if (options.body) headers.set('Content-Type', 'application/json');
    if (options.method === 'POST' && this.current?.csrfToken) headers.set('X-CSRF-Token', this.current.csrfToken);
    const response = await fetch(`/api/${path}`, { ...options, headers, credentials: 'same-origin', cache: 'no-store' });
    const result = await response.json();
    if (!response.ok) {
      if (response.status === 401 && this.current === activeAccount) this.current = null;
      const error = new Error(result.error?.message || 'Campus Week could not complete this request.');
      error.code = result.error?.code; error.status = response.status; error.retryAfterSeconds = result.error?.retryAfterSeconds; throw error;
    }
    return result;
  }
  async restore() {
    try { return this.current = await this.request('auth/me'); }
    catch (error) { if (error.status === 401) return null; throw error; }
  }
  async login(studentNumber, password, signal) {
    return this.current = await this.request('auth/login', { method: 'POST', signal, body: JSON.stringify({ studentNumber, password }) });
  }
  async connections() { return (await this.request('connections')).connections; }
  async timetable() { return this.request('timetable'); }
  async syncTimetable(password, signal, force = false) {
    return this.request('timetable/sync', { method: 'POST', signal, body: JSON.stringify(password === undefined ? { force } : { password, force }) });
  }
  async coolCalendar() { return this.request('cool/calendar'); }
  async syncCoolCalendar(password, signal, force = false) {
    return this.request('cool/calendar/sync', { method: 'POST', signal, body: JSON.stringify(password === undefined ? { force } : { password, force }) });
  }
  async logout(allDevices = false) {
    await this.request(allDevices ? 'auth/logout-all' : 'auth/logout', { method: 'POST' });
    this.current = null;
  }
}

