// Foreground-only polling, with saved data shown before the opening refresh.
export class AccountAnnouncements {
  constructor(client, onChange, onExpired, { document: doc = document, window: win = window, navigator: nav = navigator, now = Date.now, setTimer = setInterval } = {}) {
    Object.assign(this,{client,onChange,onExpired,doc,win,nav,now});
    this.epoch = 0; this.owner = null; this.items = null; this.error = null; this.busy = false; this.lastAttempt = null; this.retryAt = 0;
    setTimer(() => this.check(), 1000);
    doc.addEventListener('visibilitychange', () => this.check());
    win.addEventListener('focus', () => this.check());
    win.addEventListener('online', () => this.check());
  }
  active() { return this.doc.visibilityState === 'visible' && this.doc.hasFocus() && this.nav.onLine !== false; }
  async bind(owner) {
    const epoch = ++this.epoch;
    this.owner = owner; this.items = null; this.error = null; this.busy = false; this.loading = !!owner; this.lastAttempt = null; this.retryAt = 0;
    this.onChange();
    if (!owner) return;
    try {
      const result = await this.client.coolAnnouncements();
      if (epoch !== this.epoch) return;
      if (result.studentNumber !== owner.studentNumber) { this.onExpired(); return; }
      this.items = result.announcements;
    } catch (error) {
      if (epoch !== this.epoch) return;
      this.error = error;
      if (error.status === 401) { this.onExpired(); return; }
    } finally { if (epoch === this.epoch) { this.loading = false; this.onChange(); this.check(); } }
  }
  check() {
    if (!this.owner || this.loading || this.busy || !this.active() || this.now() < this.retryAt || this.error?.code === 'cool_credentials_required' || this.error?.code === 'cool_verification_required') return;
    if (this.lastAttempt === null || this.now() - this.lastAttempt >= 120000) void this.refresh();
  }
  async refresh() {
    if (!this.owner || this.busy || this.loading) return;
    const epoch = this.epoch, owner = this.owner;
    this.busy = true; this.error = null; this.lastAttempt = this.now(); this.onChange();
    try {
      const result = await this.client.syncCoolAnnouncements(undefined,undefined,true);
      if (epoch !== this.epoch) return;
      if (result.studentNumber !== owner.studentNumber) { this.onExpired(); return; }
      this.items = result.announcements;
    } catch (error) {
      if (epoch !== this.epoch) return;
      this.error = error; this.retryAt = this.now() + Math.max(120000,(error.retryAfterSeconds || 0)*1000);
      if (error.status === 401) this.onExpired();
    } finally { if (epoch === this.epoch) { this.busy = false; this.onChange(); } }
  }
}
