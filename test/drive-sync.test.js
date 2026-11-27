'use strict';

// Google Drive sync, end to end with two simulated devices (computer + phone) talking to
// one fake Google Drive. Runs the real js_sync.html + js_sync_drive.html in a VM per device.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('vm');
const { loadGasPartials } = require('./helpers/extractGasFunction');

const plain = v => JSON.parse(JSON.stringify(v));

// ---------- fake Google Drive (shared by all devices) ----------
function fakeDrive() {
    const files = new Map(); // id -> { name, parents, body }
    const validTokens = new Set();
    const log = [];
    let nextId = 1;
    const resp = (status, data) => ({ ok: status >= 200 && status < 300, status, json: async () => plain(data) });

    async function fetch(url, opts) {
        opts = opts || {};
        const method = opts.method || 'GET';
        const auth = (opts.headers && opts.headers.Authorization) || '';
        log.push({ method, url });
        if (!validTokens.has(auth.replace(/^Bearer /, ''))) return resp(401, { error: 'invalid token' });
        const u = new URL(url);
        let m;
        if (method === 'GET' && u.pathname === '/drive/v3/files') {
            assert.equal(u.searchParams.get('spaces'), 'appDataFolder');
            const name = /name='([^']+)'/.exec(u.searchParams.get('q'))[1];
            const found = [...files.entries()].filter(([, f]) => f.name === name).map(([id, f]) => ({ id, name: f.name }));
            return resp(200, { files: found });
        }
        if (method === 'GET' && (m = /^\/drive\/v3\/files\/([^/]+)$/.exec(u.pathname))) {
            const f = files.get(m[1]);
            return f ? resp(200, JSON.parse(f.body)) : resp(404, {});
        }
        if (method === 'PATCH' && (m = /^\/upload\/drive\/v3\/files\/([^/]+)$/.exec(u.pathname))) {
            const f = files.get(m[1]);
            if (!f) return resp(404, {});
            f.body = opts.body;
            return resp(200, { id: m[1] });
        }
        if (method === 'POST' && u.pathname === '/upload/drive/v3/files') {
            const boundary = /boundary=(\S+)/.exec(opts.headers['Content-Type'])[1];
            const parts = opts.body.split('--' + boundary).slice(1, -1)
                .map(p => p.slice(p.indexOf('\r\n\r\n') + 4).replace(/\r\n$/, ''));
            const metaPart = JSON.parse(parts[0]);
            const id = 'f' + nextId++;
            files.set(id, { name: metaPart.name, parents: metaPart.parents, body: parts[1] });
            return resp(200, { id });
        }
        return resp(400, { error: 'unexpected ' + method + ' ' + url });
    }
    const byName = name => { for (const f of files.values()) if (f.name === name) return JSON.parse(f.body); return null; };
    return { fetch, files, validTokens, log, byName, writes: () => log.filter(l => l.method !== 'GET').length };
}

// ---------- one simulated device ----------
let tokenCounter = 0;
function device(drive, clock, state, images) {
    const ls = new Map(), ss = new Map();
    const storage = map => ({ getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k) });
    const kv = new Map();
    const dev = { toasts: [], thumbImports: [], popups: [], revoked: [], saves: 0, online: true, timers: [] };
    const gis = {
        initTokenClient(cfg) {
            dev.clientId = cfg.client_id; dev.scope = cfg.scope;
            const client = {
                requestAccessToken(o) {
                    dev.popups.push(o.prompt);
                    const tok = 'tok' + (++tokenCounter);
                    drive.validTokens.add(tok);
                    Promise.resolve().then(() => client.callback({ access_token: tok, expires_in: 3600 }));
                }
            };
            return client;
        },
        revoke(t) { dev.revoked.push(t); drive.validTokens.delete(t); }
    };
    let DS = null;
    const ctx = loadGasPartials(['Frontend/JS/Core/js_sync.html', 'Frontend/JS/Modules/js_sync_drive.html'], {
        console: { log() {}, warn() {}, error() {} }, // expected error logs stay quiet
        __clock: clock,
        SOLIDCUTLIST_DRIVE_CLIENT_ID: 'test-client.apps.googleusercontent.com',
        SOLIDCUTLIST_LOCAL_BACKEND: { store: {
            get: async k => (kv.has(k) ? plain(kv.get(k)) : undefined),
            set: async (k, v) => { kv.set(k, v === null ? null : plain(v)); }
        } },
        localStorage: storage(ls), sessionStorage: storage(ss),
        navigator: { get onLine() { return dev.online; } },
        document: { addEventListener() {}, getElementById: () => null, visibilityState: 'visible' },
        addEventListener() {},
        setTimeout: (fn, ms) => { dev.timers.push({ fn, ms }); return dev.timers.length; },
        clearTimeout: () => {},
        fetch: drive.fetch,
        __initialState: JSON.stringify(state || {}),
        projectImages: plain(images || {}),
        google: { script: { run: { bulkImportThumbnails: json => dev.thumbImports.push(JSON.parse(json)) } }, accounts: { oauth2: gis } },
        // like the real saveState: tells sync about the change
        saveState: () => { dev.saves++; DS.noteLocalChange(); },
        showToast: (msg) => dev.toasts.push(msg),
        t: k => k
    });
    vm.runInContext('Date.now = () => __clock.now;', ctx);
    // Like the real app: data lives in a script-level `let`, NOT on window
    vm.runInContext('let appState = JSON.parse(__initialState);', ctx);
    DS = vm.runInContext('DriveSync', ctx);
    dev.ctx = ctx; dev.sync = DS; dev.kv = kv;
    dev.state = () => vm.runInContext('appState', ctx);
    assert.equal(ctx.appState, undefined, 'test setup mirrors the app: no window.appState');
    dev.edit = fn => { fn(dev.state(), ctx); clock.now += 1000; ctx.saveState(); };
    return dev;
}
const names = (dev, tab) => plain(dev.state()[tab].map(r => r.name).sort());
const part = (dev, id) => dev.state().parts.find(p => p.id === id);
const pcData = () => ({
    projects: [{ id: 'P1', name: 'Bench' }],
    parts: [{ id: 'A', name: 'Leg', qty: 4 }, { id: 'B', name: 'Top', qty: 1 }],
    settings: { displayUnit: 'mm', theme: 'dark' }
});

test('first sign-in uploads data and pictures to the hidden app folder', async () => {
    const drive = fakeDrive(), clock = { now: 1e12 };
    const pc = device(drive, clock, pcData(), { P1: 'data:image/png;base64,AAA' });
    assert.equal(pc.sync.isAvailable(), true);
    const r = await pc.sync.signIn();
    assert.equal(r.ok, true);
    assert.equal(pc.sync.getStatus(), 'synced');
    assert.deepEqual(plain(pc.popups), ['consent'], 'first sign-in asks for consent');
    assert.equal(pc.scope, 'https://www.googleapis.com/auth/drive.appdata');
    const names = [...drive.files.values()].map(f => f.name).sort();
    assert.deepEqual(names, ['solidcutlist-data.json', 'solidcutlist-images.json']);
    [...drive.files.values()].forEach(f => assert.deepEqual(f.parents, ['appDataFolder']));
    const data = drive.byName('solidcutlist-data.json');
    assert.equal(data.items.parts.A.v.qty, 4);
    assert.equal(data.items.settings.theme, undefined, 'device-only settings stay on the device');
    assert.equal(drive.byName('solidcutlist-images.json').items.images.P1.v, 'data:image/png;base64,AAA');
    assert.equal(pc.sync.getLastSync(), clock.now);
});

test('a fresh phone receives the computer\'s data; Drive wins over starter data, phone-only items are kept', async () => {
    const drive = fakeDrive(), clock = { now: 1e12 };
    const pc = device(drive, clock, pcData(), { P1: 'IMG' });
    await pc.sync.signIn();
    clock.now += 60000;
    const phone = device(drive, clock, {
        parts: [{ id: 'A', name: 'Leg', qty: 1 }, { id: 'C', name: 'Shelf', qty: 2 }],
        settings: { displayUnit: 'in', theme: 'light' }
    });
    await phone.sync.signIn();
    assert.equal(part(phone, 'A').qty, 4, 'Drive copy wins for an item both have');
    assert.deepEqual(names(phone, 'parts'), ['Leg', 'Shelf', 'Top']);
    assert.equal(phone.state().settings.displayUnit, 'mm');
    assert.equal(phone.state().settings.theme, 'light', 'device-only setting kept');
    assert.deepEqual(plain(phone.thumbImports), [{ P1: 'IMG' }], 'pictures saved on the phone');
    assert.deepEqual(phone.toasts, ['msg_sync_received']);
    // the computer gets the phone-only item on its next sync
    clock.now += 1000;
    await pc.sync.syncNow();
    assert.deepEqual(names(pc, 'parts'), ['Leg', 'Shelf', 'Top']);
});

test('edits and deletions travel both ways; a sync with nothing new writes nothing', async () => {
    const drive = fakeDrive(), clock = { now: 1e12 };
    const pc = device(drive, clock, pcData());
    await pc.sync.signIn();
    const phone = device(drive, clock, {});
    clock.now += 1000;
    await phone.sync.signIn();

    pc.edit(s => { s.parts.find(p => p.id === 'A').qty = 6; });
    phone.edit(s => { s.parts = s.parts.filter(p => p.id !== 'B'); });
    assert.ok(pc.timers.length > 0, 'an edit schedules a sync');
    await pc.sync.syncNow();
    await phone.sync.syncNow();
    await pc.sync.syncNow();
    for (const d of [pc, phone]) {
        assert.deepEqual(names(d, 'parts'), ['Leg']);
        assert.equal(part(d, 'A').qty, 6);
    }
    const before = drive.writes();
    clock.now += 1000;
    await pc.sync.syncNow();
    await phone.sync.syncNow();
    assert.equal(drive.writes(), before, 'received changes are not re-stamped as new edits');
});

test('the same item edited on both devices: the later edit wins', async () => {
    const drive = fakeDrive(), clock = { now: 1e12 };
    const pc = device(drive, clock, pcData());
    await pc.sync.signIn();
    const phone = device(drive, clock, {});
    clock.now += 1000;
    await phone.sync.signIn();
    pc.edit(s => { s.parts[0].qty = 10; });
    phone.edit(s => { s.parts.find(p => p.id === 'A').qty = 20; }); // later
    await pc.sync.syncNow();
    await phone.sync.syncNow();
    await pc.sync.syncNow();
    assert.equal(part(pc, 'A').qty, 20);
    assert.equal(part(phone, 'A').qty, 20);
});

test('offline edits wait and sync when the connection is back', async () => {
    const drive = fakeDrive(), clock = { now: 1e12 };
    const pc = device(drive, clock, pcData());
    await pc.sync.signIn();
    const phone = device(drive, clock, {});
    clock.now += 1000;
    await phone.sync.signIn();

    phone.online = false;
    phone.edit(s => { s.parts.push({ id: 'D', name: 'Rail', qty: 2 }); });
    const calls = drive.log.length;
    const r = await phone.sync.syncNow();
    assert.equal(r.skipped, 'offline');
    assert.equal(phone.sync.getStatus(), 'offline');
    assert.equal(drive.log.length, calls, 'no network calls while offline');
    clock.now += 3600 * 1000 * 3; // hours later in the shop... still offline edits
    phone.edit(s => { s.parts.find(p => p.id === 'D').qty = 3; });

    phone.online = true;
    // token expired meanwhile: background sync pauses until the user taps
    assert.equal((await phone.sync.syncNow()).skipped, 'needs-tap');
    assert.equal(phone.sync.getStatus(), 'paused');
    assert.equal(phone.popups.length, 1, 'no popup without a tap');
    await phone.sync.syncNow({ interactive: true });
    assert.deepEqual(plain(phone.popups), ['consent', ''], 'renewal does not ask for consent again');
    await pc.sync.syncNow({ interactive: true });
    assert.equal(part(pc, 'D').qty, 3);
});

test('a rejected token pauses sync instead of failing', async () => {
    const drive = fakeDrive(), clock = { now: 1e12 };
    const pc = device(drive, clock, pcData());
    await pc.sync.signIn();
    drive.validTokens.clear(); // e.g. access revoked in the Google account
    clock.now += 1000;
    const r = await pc.sync.syncNow();
    assert.equal(r.skipped, 'needs-tap');
    assert.equal(pc.sync.getStatus(), 'paused');
    assert.equal((await pc.sync.syncNow()).skipped, 'needs-tap', 'token was dropped');
    assert.equal((await pc.sync.syncNow({ interactive: true })).ok, true);
});

test('a Drive read error stops the round without overwriting Drive', async () => {
    const drive = fakeDrive(), clock = { now: 1e12 };
    const pc = device(drive, clock, pcData());
    await pc.sync.signIn();
    const phone = device(drive, clock, { parts: [{ id: 'X', name: 'Only on phone' }] });
    const realFetch = drive.fetch;
    phone.ctx.fetch = async (url, o) => (/alt=media/.test(url) ? { ok: false, status: 500, json: async () => ({}) } : realFetch(url, o));
    clock.now += 1000;
    const r = await phone.sync.signIn();
    assert.match(r.error, /500/);
    assert.equal(phone.sync.getStatus(), 'error');
    assert.equal(drive.byName('solidcutlist-data.json').items.parts.X, undefined);
    assert.equal(drive.byName('solidcutlist-data.json').items.parts.A.v.qty, 4, 'computer data intact');
    phone.ctx.fetch = realFetch;
    await phone.sync.syncNow({ interactive: true });
    assert.deepEqual(names(phone, 'parts'), ['Leg', 'Only on phone', 'Top']);
});

test('a data file deleted in Drive is recreated', async () => {
    const drive = fakeDrive(), clock = { now: 1e12 };
    const pc = device(drive, clock, pcData());
    await pc.sync.signIn();
    drive.files.clear();
    clock.now += 1000;
    assert.ok((await pc.sync.syncNow()).error, 'first attempt notices the missing file');
    assert.equal((await pc.sync.syncNow()).ok, true);
    assert.equal(drive.byName('solidcutlist-data.json').items.parts.A.v.qty, 4);
});

test('sign-out stops syncing, revokes access and keeps the data on the device', async () => {
    const drive = fakeDrive(), clock = { now: 1e12 };
    const pc = device(drive, clock, pcData());
    await pc.sync.signIn();
    pc.sync.signOut();
    assert.equal(pc.sync.isEnabled(), false);
    assert.equal(pc.sync.getStatus(), 'off');
    assert.equal(pc.revoked.length, 1);
    assert.equal(pc.kv.get('syncMeta'), null);
    assert.deepEqual(names(pc, 'parts'), ['Leg', 'Top']);
    assert.equal((await pc.sync.syncNow()).skipped, 'disabled');
});

test('outside the PWA (Sheet version) sync is unavailable and does nothing', () => {
    const ctx = loadGasPartials(['Frontend/JS/Core/js_sync.html', 'Frontend/JS/Modules/js_sync_drive.html'], {
        document: { addEventListener() {} }, localStorage: { getItem: () => null, setItem() {} }
    });
    const DS = vm.runInContext('DriveSync', ctx);
    assert.equal(DS.isAvailable(), false);
    DS.init(); DS.noteLocalChange();
});

test('a device with sync data from an older build starts over safely (Drive wins for shared items)', async () => {
    const drive = fakeDrive(), clock = { now: 1e12 };
    const pc = device(drive, clock, pcData());
    await pc.sync.signIn();
    clock.now += 60000;
    const phone = device(drive, clock, { parts: [{ id: 'A', name: 'Leg', qty: 1 }, { id: 'C', name: 'Shelf' }] });
    phone.kv.set('syncMeta', { items: { images: {} }, tombstones: {} }); // old format, no version
    phone.ctx.localStorage.setItem('solidcutlistDriveSync', JSON.stringify({ enabled: true, consented: true }));
    await phone.sync.syncNow({ interactive: true });
    assert.equal(part(phone, 'A').qty, 4, 'Drive copy kept');
    clock.now += 1000;
    await pc.sync.syncNow();
    assert.equal(part(pc, 'A').qty, 4);
    assert.deepEqual(names(pc, 'parts'), ['Leg', 'Shelf', 'Top'], 'phone-only item uploaded');
    assert.equal(phone.kv.get('syncMeta').v, 2);
});

test('sync refuses to run before the app data is loaded (never uploads an empty state)', async () => {
    const drive = fakeDrive(), clock = { now: 1e12 };
    const pc = device(drive, clock, pcData());
    await pc.sync.signIn();
    const phone = device(drive, clock, {});
    vm.runInContext('appState = undefined;', phone.ctx);
    const r = await phone.sync.signIn();
    assert.match(r.error, /not loaded/);
    assert.equal(drive.byName('solidcutlist-data.json').items.parts.A.v.qty, 4);
});
