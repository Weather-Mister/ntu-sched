import { ApiError } from './security.mjs';
import { parseHTML } from 'linkedom';
class MailError extends ApiError {
    constructor(status, message, code = 'ntu_unavailable'){
        super(status, code, message);
    }
}
const ROOT = 'https://wmail1.cc.ntu.edu.tw/rc/';
const MAX_RAW = 2 * 1024 * 1024;
function plainText(value) {
    return parseHTML('<html><body>' + value + '</body></html>').document.body.textContent;
}
export function parseRoundcubeCommands(source) {
    if (typeof source !== 'string' || source.length > 4 * 1024 * 1024) throw new MailError(502, 'NTU returned an invalid mailbox response.');
    const commands = [];
    let p = 0;
    const whitespace = ()=>{
        while(/\s/.test(source[p] || '') && p < source.length)p++;
    };
    const value = ()=>{
        whitespace();
        const start = p;
        let depth = 0, quoted = false, escaped = false;
        for(; p < source.length; p++){
            const c = source[p];
            if (quoted) {
                if (escaped) escaped = false;
                else if (c === '\\') escaped = true;
                else if (c === '"') quoted = false;
                continue;
            }
            if (c === '"') {
                quoted = true;
                continue;
            }
            if (c === '{' || c === '[') depth++;
            else if (c === '}' || c === ']') depth--;
            else if (depth === 0 && (c === ',' || c === ')')) break;
        }
        if (quoted || depth !== 0) throw new Error('Malformed JSON');
        return JSON.parse(source.slice(start, p));
    };
    try {
        while(p < source.length){
            whitespace();
            if (p === source.length) break;
            const m = /^this\.([a-zA-Z_][\w]*)\(/.exec(source.slice(p));
            if (!m) throw new Error('Non-data command');
            p += m[0].length;
            const args = [];
            whitespace();
            if (source[p] !== ')') for(;;){
                args.push(value());
                whitespace();
                if (source[p] === ')') break;
                if (source[p++] !== ',') throw new Error('Invalid separator');
            }
            if (source[p++] !== ')') throw new Error('Invalid ending');
            whitespace();
            if (source[p++] !== ';') throw new Error('Invalid terminator');
            commands.push({
                name: m[1],
                args
            });
        }
    } catch  {
        throw new MailError(502, 'NTU returned an unsupported mailbox response.');
    }
    return commands;
}
export function roundcubeEnvironment(html) {
    const marker = 'rcmail.set_env(';
    const start = html.indexOf(marker);
    if (start < 0) return {};
    let p = start + marker.length, depth = 0, quoted = false, escaped = false;
    for(let i = p; i < html.length; i++){
        const c = html[i];
        if (quoted) {
            if (escaped) escaped = false;
            else if (c === '\\') escaped = true;
            else if (c === '"') quoted = false;
            continue;
        }
        if (c === '"') quoted = true;
        else if (c === '{') depth++;
        else if (c === '}' && --depth === 0) {
            try {
                return JSON.parse(html.slice(p, i + 1));
            } catch  {
                return {};
            }
        }
    }
    return {};
}
function cleanText(value) {
    return plainText(String(value ?? '')).replace(/&#x([0-9a-f]+);/gi, (_, s)=>String.fromCodePoint(Math.min(parseInt(s, 16), 0x10ffff))).replace(/&#039;|&apos;/g, "'").trim();
}
function metadataAddress(html) {
    const text = cleanText(html), title = String(html || '').match(/\btitle=["']([^"']+)["']/i)?.[1];
    const email = (cleanText(title || '').match(/[^\s<>"']+@[^\s<>"']+/) || text.match(/[^\s<>"']+@[^\s<>"']+/))?.[0];
    return email && email !== text ? `${text} <${email}>` : text;
}
export function ntuDate(value, now = Date.now()) {
    const html = String(value || ''), text = cleanText(html.match(/\btitle=["']([^"']+)["']/i)?.[1] || html);
    let s = text;
    const local = new Date(now + 8 * 3600000).toISOString().slice(0, 10);
    if (/^today\b/i.test(s)) s = s.replace(/^today\s*,?\s*/i, local + ' ');
    if (/^yesterday\b/i.test(s)) s = s.replace(/^yesterday\s*,?\s*/i, new Date(now + 8 * 3600000 - 86400000).toISOString().slice(0, 10) + ' ');
    if (/^\d\d?:\d\d/.test(s)) s = local + ' ' + s;
    const weekday = s.match(/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)\s+(\d{1,2}:\d{2}(?::\d{2})?)/i);
    if (weekday) {
        const names = [
            'sun',
            'mon',
            'tue',
            'wed',
            'thu',
            'fri',
            'sat'
        ], today = new Date(now + 8 * 3600000).getUTCDay(), delta = (today - names.indexOf(weekday[1].toLowerCase()) + 7) % 7;
        s = new Date(now + 8 * 3600000 - delta * 86400000).toISOString().slice(0, 10) + ' ' + weekday[2];
    }
    const iso = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (iso) s = `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}T${iso[4].padStart(2, '0')}:${iso[5]}:${iso[6] || '00'}+08:00`;
    const parsed = Date.parse(s);
    return Number.isFinite(parsed) ? parsed : 0;
}
export function rawMessageId(raw) {
    const text = new TextDecoder().decode(raw.subarray(0, 65536)).split(/\r?\n\r?\n/, 1)[0].replace(/\r?\n[ \t]+/g, ' ');
    return (text.match(/^Message-ID:[ \t]*([^\r\n]*)/mi)?.[1] || '').trim().replace(/^<|>$/g, '');
}
function validFolder(folder) {
    if (typeof folder !== 'string' || !folder || folder.length > 200 || /[\r\n\0]/.test(folder)) throw new MailError(400, 'Invalid NTU folder.');
    return folder;
}
export class Roundcube {
    credentials;
    cookies = new Map();
    env = {};
    folders = {
        sent: 'Sent',
        drafts: 'Drafts',
        trash: 'Trash',
        junk: 'Junk',
        archive: 'Archive'
    };
    last = Date.now();
    chain = Promise.resolve();
    closed = false;
    constructor(credentials){
        this.credentials = credentials;
    }
    close() {
        this.closed = true;
        this.cookies.clear();
        this.credentials.password = '';
    }
    serial(work) {
        const pending = this.chain.catch(()=>{}).then(()=>{
            if (this.closed) throw new MailError(401, 'Reconnect NTU Mail.', 'reauthorize');
            return work();
        });
        this.chain = pending.catch(()=>{});
        return pending;
    }
    async fetch(path, init = {}, limit = 4 * 1024 * 1024) {
        let url = new URL(path, ROOT);
        if (url.origin !== new URL(ROOT).origin || !url.pathname.startsWith('/rc/')) throw new MailError(400, 'Invalid NTU request.');
        let method = init.method || 'GET', body = init.body;
        for(let redirects = 0; redirects < 5; redirects++){
            const headers = new Headers(init.headers);
            if (this.cookies.size) headers.set('Cookie', [
                ...this.cookies
            ].map(([k, v])=>k + '=' + v).join('; '));
            headers.set('User-Agent', 'Eren-Mail/1.0');
            let r;
            try {
                r = await fetch(url, {
                    ...init,
                    method,
                    body,
                    headers,
                    redirect: 'manual',
                    signal: AbortSignal.timeout(20000)
                });
            } catch  {
                throw new MailError(502, 'Could not reach NTU Mail. Please retry.', 'ntu_unavailable');
            }
            for (const cookie of r.headers.getSetCookie()){
                const pair = cookie.split(';', 1)[0], at = pair.indexOf('=');
                if (at > 0) {
                    const key = pair.slice(0, at), value = pair.slice(at + 1);
                    if (value) this.cookies.set(key, value);
                    else this.cookies.delete(key);
                }
            }
            if ([
                301,
                302,
                303,
                307,
                308
            ].includes(r.status)) {
                const location = r.headers.get('location');
                await r.body?.cancel();
                if (!location) throw new MailError(502, 'NTU returned an incomplete redirect.');
                const target = new URL(location, url);
                if (target.origin !== new URL(ROOT).origin || !target.pathname.startsWith('/rc/')) throw new MailError(502, 'NTU returned an unexpected redirect.');
                url = target;
                if (r.status === 303 || [
                    301,
                    302
                ].includes(r.status) && method === 'POST') {
                    method = 'GET';
                    body = undefined;
                }
                continue;
            }
            if (!r.ok) {
                await r.body?.cancel();
                throw new MailError(r.status === 404 ? 404 : 502, r.status === 404 ? 'Message no longer exists in NTU Mail.' : 'NTU Mail is temporarily unavailable.', 'ntu_unavailable');
            }
            if (limit === -1) return r;
            const length = Number(r.headers.get('content-length'));
            if (length > limit) {
                await r.body?.cancel();
                throw new MailError(413, 'This NTU message is over the download limit.');
            }
            const reader = r.body?.getReader(), chunks = [];
            let size = 0;
            if (reader) try {
                for(;;){
                    const { done, value } = await reader.read();
                    if (done) break;
                    size += value.length;
                    if (size > limit) {
                        await reader.cancel();
                        throw new MailError(413, 'This NTU message is over the download limit.');
                    }
                    chunks.push(value);
                }
            } finally{
                reader.releaseLock();
            }
            const bytes = new Uint8Array(size);
            let offset = 0;
            for (const chunk of chunks){
                bytes.set(chunk, offset);
                offset += chunk.length;
            }
            this.last = Date.now();
            return new Response(bytes, {
                status: r.status,
                headers: r.headers
            });
        }
        throw new MailError(502, 'NTU returned too many redirects.');
    }
    async login() {
        const page = await (await this.fetch('index.php')).text(), inputs = {};
        for (const tag of page.matchAll(/<input\b[^>]*>/gi)){
            const attrs = Object.fromEntries([
                ...tag[0].matchAll(/([\w-]+)\s*=\s*["']([^"']*)["']/g)
            ].map((m)=>[
                    m[1].toLowerCase(),
                    cleanText(m[2])
                ]));
            if (attrs.type === 'hidden' && attrs.name) inputs[attrs.name] = attrs.value || '';
        }
        if (!inputs._token) throw new MailError(502, 'NTU sign-in is temporarily unavailable.');
        const data = new URLSearchParams({
            ...inputs,
            _task: 'login',
            _action: 'login',
            _user: this.credentials.username,
            _pass: this.credentials.password,
            _timezone: 'Asia/Taipei',
            _url: ''
        });
        const html = await (await this.fetch('?_task=login', {
            method: 'POST',
            body: data,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        })).text();
        this.env = roundcubeEnvironment(html);
        if (this.env.task !== 'mail' || !this.env.request_token)
            // A saved, previously verified connection can receive a transient
            // login page instead of a mailbox on its first request. Do not
            // claim the Campus Week user needs to sign in again.
            throw new MailError(502, 'NTU Mail did not confirm its session. Please retry Mail.', 'ntu_login_unconfirmed');
        if (this.env.username && String(this.env.username).split('@')[0].toLowerCase() !== this.credentials.username) throw new MailError(401, 'NTU returned another account.', 'reauthorize');
        for (const [key, names] of Object.entries({
            sent: [
                'sent_mailbox',
                'sent_mbox'
            ],
            drafts: [
                'drafts_mailbox',
                'drafts_mbox'
            ],
            trash: [
                'trash_mailbox',
                'trash_mbox'
            ],
            junk: [
                'junk_mailbox',
                'junk_mbox'
            ],
            archive: [
                'archive_mailbox',
                'archive_mbox'
            ]
        }))for (const name of names)if (this.env[name]) {
            this.folders[key] = validFolder(this.env[name]);
            break;
        }
    }
    async ajax(action, params = {}, post = false, task = 'mail') {
        const fields = {
            _task: task,
            _action: action,
            _remote: '1',
            _token: this.env.request_token,
            ...params
        };
        const headers = {
            'X-Requested-With': 'XMLHttpRequest',
            'X-Roundcube-Request': this.env.request_token,
            ...post ? {
                'Content-Type': 'application/x-www-form-urlencoded'
            } : {}
        };
        const r = await this.fetch(post ? '?' + new URLSearchParams({
            _task: task,
            _action: action
        }) : '?' + new URLSearchParams(fields), {
            method: post ? 'POST' : 'GET',
            headers,
            ...post ? {
                body: new URLSearchParams(fields)
            } : {}
        });
        let data;
        try {
            data = await r.json();
        } catch  {
            throw new MailError(502, 'NTU returned an unsupported mailbox response.');
        }
        if (data.action !== action) throw new MailError(401, 'NTU session expired. Reconnect NTU Mail.', 'ntu_session_expired');
        const commands = parseRoundcubeCommands(data.exec || '');
        if (commands.some((c)=>c.name === 'display_message' && c.args[1] === 'error')) throw new MailError(502, 'NTU could not complete this mail action.', 'ntu_action_failed');
        if (data.env) this.env = {
            ...this.env,
            ...data.env
        };
        for (const c of commands)if (c.name === 'set_env' && c.args[0] && typeof c.args[0] === 'object') this.env = {
            ...this.env,
            ...c.args[0]
        };
        return {
            env: data.env || {},
            commands
        };
    }
    async list(folder, page = 1, q = '', filter = '', scope = 'base', headers = 'subject,from,to,text') {
        validFolder(folder);
        page = Math.max(1, Math.min(1000, Math.floor(page) || 1));
        let result;
        if (q || filter) {
            result = await this.ajax('search', {
                _mbox: folder,
                _q: q,
                _filter: filter || 'ALL',
                _scope: scope,
                _headers: headers
            });
            if (page > 1) result = await this.ajax('list', {
                _mbox: folder,
                _page: String(page),
                _search: this.env.search_request || ''
            });
        } else result = await this.ajax('list', {
            _mbox: folder,
            _page: String(page)
        });
        const rows = result.commands.filter((c)=>c.name === 'add_message_row').map((c)=>({
                uid: String(c.args[0]),
                columns: c.args[1] || {},
                flags: c.args[2] || {}
            }));
        return {
            rows,
            hasMore: page < Number(result.env.pagecount || this.env.pagecount || 1),
            count: Number(result.env.messagecount ?? this.env.messagecount ?? 0)
        };
    }
    async raw(ref) {
        const params = new URLSearchParams({
            _task: 'mail',
            _action: 'viewsource',
            _mbox: validFolder(ref.mailbox),
            _uid: ref.uid,
            _save: '1',
            _token: this.env.request_token
        });
        const r = await this.fetch('?' + params, {}, MAX_RAW);
        const bytes = new Uint8Array(await r.arrayBuffer());
        const head = new TextDecoder().decode(bytes.subarray(0, 4000));
        if (!/^[A-Za-z][\w-]*\s*:/m.test(head) || /rcmail\.set_env\(/.test(head)) throw new MailError(404, 'Message no longer exists in NTU Mail.');
        return bytes;
    }
    async find(folder, messageId) {
        const expected = String(messageId || '').trim().replace(/^<|>$/g, '');
        if (!expected || expected.length > 1000 || /[\r\n\0]/.test(expected)) return [];
        const matches = [];
        let page = 1;
        do {
            const list = await this.list(folder, page, expected, '', 'base', 'text');
            for (const row of list.rows){
                if (!/^\d{1,15}$/.test(row.uid)) continue;
                const bytes = await this.raw({
                    mailbox: folder,
                    uid: row.uid
                });
                if (rawMessageId(bytes) === expected) matches.push(row);
            }
            if (!list.hasMore) break;
        }while (++page <= 5)
        return matches;
    }
    async newestUid(folder) {
        const list = await this.list(folder, 1, '', 'UID 4294967295:*', 'base', '');
        return list.rows.reduce((highest, row)=>Math.max(highest, Number(row.uid)), 0);
    }
    async newerMessages(folder, after) {
        if (!Number.isInteger(after) || after < 0 || after >= 4294967295) throw new MailError(400, 'Invalid NTU folder position.');
        const rows = [];
        let page = 1;
        do {
            const list = await this.list(folder, page, '', `UID ${after + 1}:*`, 'base', '');
            rows.push(...list.rows.filter((row)=>ntuUid(row.uid) > after));
            if (!list.hasMore) return rows;
        }while (++page <= 10)
        throw new MailError(409, 'NTU received many new messages. Refresh to confirm this move.');
    }
    async ensureFolder(folder) {
        if (Object.hasOwn(this.env.mailboxes || {}, folder)) return;
        const fields = {
            _task: 'settings',
            _action: 'save-folder',
            _name: folder,
            _parent: '',
            _mbox: '',
            _type: 'mail',
            _framed: '1',
            _token: this.env.request_token
        };
        await this.fetch('?_task=settings&_action=save-folder', {
            method: 'POST',
            body: new URLSearchParams(fields),
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });
        const html = await (await this.fetch('?_task=mail')).text(), env = roundcubeEnvironment(html);
        if (env.task !== 'mail' || !Object.hasOwn(env.mailboxes || {}, folder)) throw new MailError(502, 'NTU could not create the destination folder. Please retry.', 'ntu_action_failed');
        this.env = {
            ...this.env,
            ...env
        };
    }
}
export function roundcubeFormInputs(html) {
    const inputs = {};
    for (const tag of html.matchAll(/<input\b[^>]*>/gi)){
        const attrs = Object.fromEntries([
            ...tag[0].matchAll(/([\w-]+)\s*=\s*["']([^"']*)["']/g)
        ].map((m)=>[
                m[1].toLowerCase(),
                cleanText(m[2])
            ]));
        if (attrs.name && attrs.type === 'hidden') inputs[attrs.name] = attrs.value || '';
    }
    return inputs;
}
export function roundcubeSendResult(html) {
    const commands = [];
    for (const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)){
        const source = script[1];
        const pattern = /(?:parent\.)?rcmail\.(sent_successfully|display_message)\(/g;
        let m;
        while(m = pattern.exec(source)){
            let p = pattern.lastIndex, quoted = false, escaped = false, depth = 0;
            for(; p < source.length; p++){
                const c = source[p];
                if (quoted) {
                    if (escaped) escaped = false;
                    else if (c === '\\') escaped = true;
                    else if (c === '"') quoted = false;
                    continue;
                }
                if (c === '"') quoted = true;
                else if (c === '{' || c === '[' || c === '(') depth++;
                else if (c === '}' || c === ']') depth--;
                else if (c === ')') {
                    if (depth === 0) break;
                    depth--;
                }
            }
            if (source[p] !== ')' || source[p + 1] !== ';') continue;
            try {
                commands.push(...parseRoundcubeCommands('this.' + m[1] + '(' + source.slice(pattern.lastIndex, p) + ');'));
            } catch  {}
            pattern.lastIndex = p + 2;
        }
    }
    return {
        accepted: commands.some((c)=>c.name === 'sent_successfully' && c.args[0] === 'confirmation'),
        rejected: commands.some((c)=>c.name === 'display_message' && c.args[1] === 'error'),
        warning: commands.some((c)=>c.name === 'sent_successfully' && c.args[3])
    };
}
