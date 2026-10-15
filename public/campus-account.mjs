// Import this module in Campus Week when the saved frontend is available.
// Serve frontend and /api on the same HTTPS origin. GitHub can own the source.
export class CampusAccount {
  current = null;
  async request(path, options = {}) {
    const activeAccount = this.current;
    const headers = new Headers(options.headers);
    if (options.body) headers.set('Content-Type', 'application/json');
    if (options.method && !['GET', 'HEAD'].includes(options.method) && this.current?.csrfToken) headers.set('X-CSRF-Token', this.current.csrfToken);
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
  async tasks() { return this.request('tasks'); }
  async events() { return this.request('events'); }
  async createEvent(id,values) { return this.request('events',{method:'POST',body:JSON.stringify({id,...values})}); }
  async changeEvent(id,version,values) { return this.request('events/'+encodeURIComponent(id),{method:'PATCH',body:JSON.stringify({version,...values})}); }
  async removeEvent(id,version) { return this.request('events/'+encodeURIComponent(id),{method:'DELETE',body:JSON.stringify({version})}); }
  async createTask(id, text) { return this.request('tasks', { method: 'POST', body: JSON.stringify({ id, text }) }); }
  async changeTask(id, version, change) { return this.request('tasks/' + encodeURIComponent(id), { method: 'PATCH', body: JSON.stringify({ version, ...change }) }); }
  async removeTask(id, version) { return this.request('tasks/' + encodeURIComponent(id), { method: 'DELETE', body: JSON.stringify({ version }) }); }
  async timetable() { return this.request('timetable'); }
  async syncTimetable(password, signal, force = false) {
    return this.request('timetable/sync', { method: 'POST', signal, body: JSON.stringify(password === undefined ? { force } : { password, force }) });
  }
  async changeCourseDetails(id,details) { return this.request('timetable/courses/'+encodeURIComponent(id),{method:'PATCH',body:JSON.stringify(details)}); }
  async coolCalendar() { return this.request('cool/calendar'); }
  async syncCoolCalendar(password, signal, force = false) {
    return this.request('cool/calendar/sync', { method: 'POST', signal, body: JSON.stringify(password === undefined ? { force } : { password, force }) });
  }
  async coolAnnouncements() { return this.request('cool/announcements'); }
  async syncCoolAnnouncements(password, signal, force = false) {
    return this.request('cool/announcements/sync', {method:'POST',signal,body:JSON.stringify(password === undefined ? {force} : {password,force})});
  }
  async logout(allDevices = false) {
    await this.request(allDevices ? 'auth/logout-all' : 'auth/logout', { method: 'POST' });
    this.current = null;
  }
}

