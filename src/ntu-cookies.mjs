// This cookie jar exists only for one sync and never leaves the Worker.
export class CookieJar {
  entries = new Map();
  receive(headers, url) {
    for (const raw of headers.getSetCookie()) {
      const parts = raw.split(';'), pair = parts.shift(), at = pair.indexOf('=');
      if (at < 1) continue;
      const attrs = Object.fromEntries(parts.map(p => { const at = p.indexOf('='); return at < 0 ? [p.trim().toLowerCase(), true] : [p.slice(0, at).trim().toLowerCase(), p.slice(at + 1).trim()]; }));
      const domain = String(attrs.domain || url.hostname).replace(/^\./, '').toLowerCase(), hostOnly = !attrs.domain;
      if (url.hostname !== domain && !url.hostname.endsWith('.' + domain)) continue;
      const path = typeof attrs.path === 'string' && attrs.path.startsWith('/') ? attrs.path : url.pathname.slice(0, url.pathname.lastIndexOf('/') + 1);
      const key = JSON.stringify([domain, path, pair.slice(0, at)]);
      const expires = attrs['max-age'] !== undefined ? Date.now() + Number(attrs['max-age']) * 1000 : attrs.expires ? Date.parse(attrs.expires) : Infinity;
      if (!pair.slice(at + 1) || expires <= Date.now()) this.entries.delete(key);
      else this.entries.set(key, { domain, hostOnly, path, pair, expires });
    }
  }
  header(url) {
    return [...this.entries.values()].filter(c => c.expires > Date.now() && (c.hostOnly ? url.hostname === c.domain : url.hostname === c.domain || url.hostname.endsWith('.' + c.domain)) && (url.pathname === c.path || url.pathname.startsWith(c.path.endsWith('/') ? c.path : c.path + '/'))).sort((a, b) => b.path.length - a.path.length).map(c => c.pair).join('; ');
  }
  clear() { this.entries.clear(); }
}
