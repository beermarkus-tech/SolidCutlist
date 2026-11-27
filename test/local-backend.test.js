'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGasPartial } = require('./helpers/extractGasFunction');

// The PWA's local backend must answer google.script.run calls with the same formats as
// Backend/Code.gs, so the unchanged app code works without Apps Script.
function load(extra) {
    const ctx = loadGasPartial('Frontend/JS/Core/js_local_backend.html', Object.assign({ setTimeout }, extra || {}));
    return ctx;
}
const call = (ctx, fn, ...args) => new Promise((resolve, reject) => {
    ctx.google.script.run.withSuccessHandler(resolve).withFailureHandler(reject)[fn](...args);
});
const plain = v => JSON.parse(JSON.stringify(v));

test('installs google.script.run when not running inside Apps Script', () => {
    const ctx = load();
    assert.ok(ctx.google.script.run);
    assert.equal(ctx.SOLIDCUTLIST_LOCAL_BACKEND.store.kind, 'memory');
});

test('does nothing inside Apps Script (real google.script.run kept)', () => {
    const real = { marker: true };
    const ctx = load({ google: { script: { run: real } } });
    assert.equal(ctx.google.script.run, real);
    assert.equal(ctx.SOLIDCUTLIST_LOCAL_BACKEND, undefined);
});

test('empty store returns an empty appState with all tabs and timestamp 0', async () => {
    const r = JSON.parse(await call(load(), 'getAppStateFromSheet'));
    assert.equal(r.status, 'success');
    assert.equal(r.cloud_timestamp, 0);
    assert.deepEqual(plain(r.appState.parts), []);
    assert.deepEqual(plain(r.appState.settings), {});
});

test('save then load round-trips data, types and timestamp', async () => {
    const ctx = load();
    const appState = { parts: [{ id: 'P1', name: '1/2', qty: 3, length: 600.5, flag: true }], settings: { displayUnit: 'mm' }, latestResults: [1] };
    const saved = await call(ctx, 'saveAppStateToSheet', JSON.stringify({ appState, timestamp: 42 }));
    assert.deepEqual(plain(saved), { status: 'success', cloud_timestamp: 42 });
    const r = JSON.parse(await call(ctx, 'getAppStateFromSheet'));
    assert.equal(r.cloud_timestamp, 42);
    assert.deepEqual(plain(r.appState.parts), appState.parts);
    assert.equal(r.appState.settings.displayUnit, 'mm');
    assert.equal(r.appState.latestResults, undefined, 'only the synced tabs are stored');
});

test('archive: add, list, load, delete', async () => {
    const ctx = load();
    const res = await call(ctx, 'archiveProjectToSheet', JSON.stringify({ id: 'PROJ-1', project: { id: 'PROJ-1', name: 'Bench', comment: 'oak' }, groups: [], parts: [{ id: 'a' }] }));
    assert.equal(res.status, 'success');
    const list = JSON.parse(await call(ctx, 'getArchiveList'));
    assert.deepEqual(plain(list.data.map(d => [d.id, d.name, d.notes])), [['PROJ-1', 'Bench', 'oak']]);
    const loaded = JSON.parse(await call(ctx, 'loadProjectFromArchive', 'PROJ-1'));
    assert.equal(loaded.parts.length, 1);
    assert.equal(JSON.parse(await call(ctx, 'deleteProjectFromArchive', 'PROJ-1')).status, 'success');
    assert.equal(JSON.parse(await call(ctx, 'loadProjectFromArchive', 'PROJ-1')).status, 'error');
});

test('thumbnails: save, list, delete, bulk import, clear', async () => {
    const ctx = load();
    await call(ctx, 'saveThumbnail', JSON.stringify({ projectId: 'A', base64String: 'data:a' }));
    await call(ctx, 'saveThumbnail', JSON.stringify({ projectId: 'B', base64String: 'data:b' }));
    await call(ctx, 'deleteThumbnail', 'A');
    assert.deepEqual(plain(JSON.parse(await call(ctx, 'getThumbnails')).data), { B: 'data:b' });
    await call(ctx, 'bulkImportThumbnails', JSON.stringify({ C: 'data:c' }));
    assert.deepEqual(plain(JSON.parse(await call(ctx, 'getThumbnails')).data), { C: 'data:c' });
    await call(ctx, 'clearAllThumbnails');
    assert.deepEqual(plain(JSON.parse(await call(ctx, 'getThumbnails')).data), {});
});

test('starter pack is fetched from the static starter-packs folder', async () => {
    const urls = [];
    const fetch = async (url) => { urls.push(url); return { ok: true, json: async () => ({ materials: [{ id: 'M' }] }) }; };
    const r = JSON.parse(await call(load({ fetch }), 'getStarterPack', 'US'));
    assert.equal(r.status, 'success');
    assert.equal(r.data.materials[0].id, 'M');
    assert.deepEqual(urls, ['starter-packs/starter_US.json']);
});

test('missing starter pack returns an error the UI can show', async () => {
    const fetch = async () => ({ ok: false, status: 404 });
    const r = JSON.parse(await call(load({ fetch }), 'getStarterPack', 'EU'));
    assert.equal(r.status, 'error');
});

test('concurrent writes are serialised (no lost archive entries)', async () => {
    const ctx = load();
    await Promise.all(Array.from({ length: 10 }, (_, i) =>
        call(ctx, 'archiveProjectToSheet', JSON.stringify({ id: 'P' + i, project: { name: 'n' + i } }))));
    assert.equal(JSON.parse(await call(ctx, 'getArchiveList')).data.length, 10);
});

test('unknown functions fail instead of hanging', async () => {
    await assert.rejects(call(load(), 'noSuchFunction'));
});
