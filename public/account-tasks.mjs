// Shared account task state for themes. No task text or account IDs enter browser storage.
export class AccountTasks {
  constructor(client, { onChange = () => {}, onSessionExpired = () => {} } = {}) {
    this.client = client; this.onChange = onChange; this.onSessionExpired = onSessionExpired;
    this.epoch = 0; this.revision = 0; this.current = null;
    this.state = { items: [], ready: false, loading: false, saving: false, error: null, undo: null };
  }
  emit() { this.onChange(this.state); }
  bind(current) {
    this.epoch++; this.revision++; this.current = current; this.pendingAdd = null;
    this.state = { items: [], ready: false, loading: false, saving: false, error: null, undo: null };
    this.emit();
    if (current) void this.refresh();
  }
  valid(epoch, error) { return !!this.current && this.epoch === epoch && (this.client.current === this.current || error?.status === 401 && !this.client.current); }
  owner(result) {
    // Another tab may have changed the shared login cookie. Never render that student's tasks.
    if (result.studentNumber !== this.current.studentNumber) throw Object.assign(new Error('Account changed. Sign in again.'), { code: 'account_changed' });
    return result;
  }
  fail(error, phase) {
    if (error.status === 401 || error.code === 'account_changed') { this.bind(null); this.onSessionExpired(); return; }
    this.state.error = { code: error.code, phase }; this.emit();
  }
  async refresh() {
    if (!this.current || this.state.loading || this.state.saving) return;
    const epoch = this.epoch, revision = this.revision;
    this.state.loading = true; this.emit();
    try {
      const result = await this.client.tasks();
      if (!this.valid(epoch) || revision !== this.revision) return;
      this.state.items = this.owner(result).tasks; this.state.ready = true; this.state.error = null;
    } catch (error) { if (this.valid(epoch, error) && revision === this.revision) this.fail(error, 'load'); }
    finally { if (this.valid(epoch)) { this.state.loading = false; this.emit(); } }
  }
  async write(action, apply) {
    if (!this.current || !this.state.ready || this.state.saving || this.client.current !== this.current) return false;
    const epoch = this.epoch; this.revision++;
    this.state.saving = true; this.state.error = null; this.emit();
    let refresh = false;
    try {
      const result = await action();
      if (!this.valid(epoch)) return false;
      apply(this.owner(result).task); this.emit(); return true;
    } catch (error) {
      if (this.valid(epoch, error)) { this.fail(error, 'save'); refresh = ['task_changed', 'task_not_found'].includes(error.code); }
      return false;
    } finally {
      if (this.valid(epoch)) {
        this.state.saving = false; this.emit();
        if (refresh) { const error = this.state.error; await this.refresh(); if (this.valid(epoch)) { this.state.error = error; this.emit(); } }
      }
    }
  }
  async add(text) {
    text = text.trim(); if (!text) return false;
    if (!this.pendingAdd || this.pendingAdd.text !== text) this.pendingAdd = { id: crypto.randomUUID(), text };
    const pending = this.pendingAdd;
    return this.write(() => this.client.createTask(pending.id, pending.text), task => {
      this.state.items = [task, ...this.state.items.filter(item => item.id !== task.id)]; this.pendingAdd = null;
    });
  }
  setDone(task, done) {
    return this.write(() => this.client.changeTask(task.id, task.version, { done }), saved => {
      this.state.items = this.state.items.map(item => item.id === saved.id ? saved : item);
    });
  }
  remove(task) {
    return this.write(() => this.client.removeTask(task.id, task.version), saved => {
      this.state.items = this.state.items.filter(item => item.id !== saved.id); this.state.undo = saved;
    });
  }
  undo() {
    const task = this.state.undo; if (!task) return false;
    return this.write(() => this.client.changeTask(task.id, task.version, { deleted: false }), saved => {
      this.state.items = [saved, ...this.state.items.filter(item => item.id !== saved.id)]
        .sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id)); this.state.undo = null;
    });
  }
}
