'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { makeSpreadsheetApp } = require('./helpers/fakeSpreadsheet');

function loadBackend() {
    const env = makeSpreadsheetApp();
    const ctx = vm.createContext(Object.assign({ console, JSON }, env));
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'Backend', 'Code.gs'), 'utf8');
    new vm.Script(src, { filename: 'Code.gs' }).runInContext(ctx);
    return { ctx, env };
}
const plain = v => JSON.parse(JSON.stringify(v));

test('text values that look like dates/numbers/formulas round-trip unchanged', () => {
    const { ctx } = loadBackend();
    const appState = {
        projects: [{ id: 'PROJ-1', name: '2026-01', comment: '=SUM(A1)', status: 'Design' }],
        parts: [{ id: 'PART-1', projectId: 'PROJ-1', name: '1/2', sku: '007', qty: 3, length: 600.5, flag: true }],
        settings: { displayUnit: 'mm', currency: '€', bladeKerf: 3.175, labelTemplates: [{ id: 'L', name: 'x' }] }
    };
    const res = ctx.saveAppStateToSheet(JSON.stringify({ appState, timestamp: 123 }));
    assert.equal(res.status, 'success');
    const back = JSON.parse(ctx.getAppStateFromSheet());
    assert.equal(back.cloud_timestamp, 123);
    assert.equal(back.appState.projects[0].name, '2026-01');
    assert.equal(back.appState.projects[0].comment, '=SUM(A1)');
    const p = back.appState.parts[0];
    assert.deepEqual([p.name, p.sku, p.qty, p.length, p.flag], ['1/2', '007', 3, 600.5, true]);
    assert.equal(back.appState.settings.displayUnit, 'mm');
    assert.equal(back.appState.settings.bladeKerf, 3.175);
    assert.deepEqual(plain(back.appState.settings.labelTemplates), [{ id: 'L', name: 'x' }]);
});

test('a shorter save trims the leftover rows of a previous longer save', () => {
    const { ctx } = loadBackend();
    const many = Array.from({ length: 5 }, (_, i) => ({ id: 'S' + i, qty: 1 }));
    ctx.saveAppStateToSheet(JSON.stringify({ appState: { stock: many }, timestamp: 1 }));
    ctx.saveAppStateToSheet(JSON.stringify({ appState: { stock: many.slice(0, 2) }, timestamp: 2 }));
    const back = JSON.parse(ctx.getAppStateFromSheet());
    assert.deepEqual(back.appState.stock.map(s => s.id), ['S0', 'S1']);
});

test('the sync timestamp only advances when the save completes', () => {
    const { ctx, env } = loadBackend();
    ctx.saveAppStateToSheet(JSON.stringify({ appState: { parts: [{ id: 'A' }] }, timestamp: 100 }));
    const realGet = env.SpreadsheetApp.getActiveSpreadsheet().getSheetByName;
    // Make the "jobs" tab write blow up half-way through the next save
    env.sheets.jobs = { getLastRow: () => { throw new Error('quota'); }, getLastColumn: () => 0 };
    const res = ctx.saveAppStateToSheet(JSON.stringify({ appState: { parts: [{ id: 'B' }], jobs: [{ id: 'J' }] }, timestamp: 200 }));
    assert.equal(res.status, 'error');
    delete env.sheets.jobs;
    assert.equal(env.sheets.Metadata.getRange('B3').getValue(), 100);
    void realGet;
});

test('large projects are archived in chunks and restored intact', () => {
    const { ctx } = loadBackend();
    const parts = Array.from({ length: 2000 }, (_, i) => ({ id: 'P' + i, name: 'Part number ' + i, length: 1234.5, qty: 2 }));
    const payload = { id: 'PROJ-9', project: { id: 'PROJ-9', name: 'Big', comment: 'n' }, groups: [], parts, usedProfiles: [], usedMaterials: [] };
    assert.ok(JSON.stringify(parts).length > 50000);
    assert.equal(ctx.archiveProjectToSheet(JSON.stringify(payload)).status, 'success');
    const list = JSON.parse(ctx.getArchiveList());
    assert.equal(list.data[0].name, 'Big');
    const loaded = JSON.parse(ctx.loadProjectFromArchive('PROJ-9'));
    assert.equal(loaded.status, 'success');
    assert.equal(loaded.parts.length, 2000);
    assert.equal(loaded.parts[1999].name, 'Part number 1999');
});

test('small projects keep the plain one-cell-per-field archive format', () => {
    const { ctx } = loadBackend();
    ctx.archiveProjectToSheet(JSON.stringify({ id: 'X', project: { id: 'X', name: 'Small' }, groups: [], parts: [{ id: 'p' }] }));
    const loaded = JSON.parse(ctx.loadProjectFromArchive('X'));
    assert.deepEqual([loaded.project.name, loaded.parts.length], ['Small', 1]);
    assert.equal(JSON.parse(ctx.deleteProjectFromArchive('X')).status, 'success');
    assert.equal(JSON.parse(ctx.getArchiveList()).data.length, 0);
});

test('oversized thumbnails are rejected with a clear error instead of a Sheets exception', () => {
    const { ctx } = loadBackend();
    const res = JSON.parse(ctx.saveThumbnail(JSON.stringify({ projectId: 'P', base64String: 'x'.repeat(60000) })));
    assert.equal(res.status, 'error');
    assert.match(res.message, /too large/);
});
