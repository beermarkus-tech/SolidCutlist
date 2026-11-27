'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGasPartial } = require('./helpers/extractGasFunction');

const S = loadGasPartial('Frontend/JS/Core/js_sync.html', {});
const plain = v => JSON.parse(JSON.stringify(v));

/** A simulated device: app state + images + sync meta. */
function device(state, images) {
    return { state: plain(state), images: plain(images || {}), meta: S.syncEmptyMeta() };
}
function track(dev, now) { S.syncTrackChanges(S.syncCollectionsFromState(dev.state, dev.images), dev.meta, now); }
function docOf(dev, now) { return S.syncBuildDoc(S.syncCollectionsFromState(dev.state, dev.images), dev.meta, now); }
/** One sync round: device merges with the "Drive" doc, applies result, returns new Drive doc. */
function syncRound(dev, drive, now) {
    track(dev, now);
    const local = docOf(dev, now);
    const r = S.syncMergeDocs(local, drive, now);
    const applied = S.syncApplyDoc(r.doc, dev.state, dev.images);
    dev.state = plain(applied.state); dev.images = plain(applied.images);
    dev.meta = S.syncMetaFromDoc(r.doc);
    return { drive: plain(r.doc), localChanged: r.localChanged, remoteChanged: r.remoteChanged };
}
const names = (dev, tab) => dev.state[tab].map(r => r.name).sort();
const base = { projects: [{ id: 'P1', name: 'Bench' }], parts: [{ id: 'A', name: 'Leg', qty: 4 }], settings: { displayUnit: 'mm', theme: 'dark' } };

test('first device uploads everything; second device receives it', () => {
    const pc = device(base), phone = device({ settings: { theme: 'light' } });
    let drive = syncRound(pc, null, 1000).drive;
    const r = syncRound(phone, drive, 2000);
    assert.deepEqual(names(phone, 'parts'), ['Leg']);
    assert.equal(phone.state.settings.displayUnit, 'mm');
    assert.equal(phone.state.settings.theme, 'light', 'device-only setting kept');
    assert.equal(r.localChanged, true);
});

test('edits to different records on two devices are both kept', () => {
    const pc = device(base); let drive = syncRound(pc, null, 1000).drive;
    const phone = device({}); drive = syncRound(phone, drive, 1100).drive;
    pc.state.parts[0].qty = 6;                                   // computer edits the part
    phone.state.projects[0].name = 'Workbench';                  // phone renames the project (offline)
    drive = syncRound(pc, drive, 2000).drive;
    drive = syncRound(phone, drive, 2100).drive;                 // phone comes back online
    syncRound(pc, drive, 2200);
    for (const d of [pc, phone]) {
        assert.equal(d.state.parts[0].qty, 6);
        assert.equal(d.state.projects[0].name, 'Workbench');
    }
});

test('same record edited on both devices: the newer edit wins on both', () => {
    const pc = device(base); let drive = syncRound(pc, null, 1000).drive;
    const phone = device({}); drive = syncRound(phone, drive, 1100).drive;
    pc.state.parts[0].name = 'Leg (pc)';
    phone.state.parts[0].name = 'Leg (phone)';
    drive = syncRound(pc, drive, 2000).drive;                    // pc change at t=2000
    drive = syncRound(phone, drive, 3000).drive;                 // phone change at t=3000 (newer)
    syncRound(pc, drive, 3100);
    assert.equal(pc.state.parts[0].name, 'Leg (phone)');
    assert.equal(phone.state.parts[0].name, 'Leg (phone)');
});

test('a deletion propagates and does not come back', () => {
    const pc = device(base); let drive = syncRound(pc, null, 1000).drive;
    const phone = device({}); drive = syncRound(phone, drive, 1100).drive;
    phone.state.parts = [];                                      // delete on phone
    drive = syncRound(phone, drive, 2000).drive;
    syncRound(pc, drive, 2100);
    assert.equal(pc.state.parts.length, 0);
    drive = syncRound(pc, drive, 2200).drive;                    // pc syncs again: still gone
    assert.equal(Object.keys(drive.items.parts).length, 0);
});

test('an edit newer than a deletion on another device keeps the record', () => {
    const pc = device(base); let drive = syncRound(pc, null, 1000).drive;
    const phone = device({}); drive = syncRound(phone, drive, 1100).drive;
    phone.state.parts = [];                                      // phone deletes at 2000
    drive = syncRound(phone, drive, 2000).drive;
    pc.state.parts[0].qty = 9;                                   // pc edited later (offline) at 3000
    syncRound(pc, drive, 3000);
    assert.equal(pc.state.parts[0].qty, 9);
});

test('new records from another device appear at the top, local order is kept', () => {
    const pc = device({ parts: [{ id: 'A', name: 'a' }, { id: 'B', name: 'b' }] });
    let drive = syncRound(pc, null, 1000).drive;
    const phone = device({}); drive = syncRound(phone, drive, 1100).drive;
    phone.state.parts.unshift({ id: 'C', name: 'c' });
    drive = syncRound(phone, drive, 2000).drive;
    pc.state.parts.reverse();                                    // pc sorted its table: B, A
    syncRound(pc, drive, 2100);
    assert.deepEqual(pc.state.parts.map(p => p.id), ['C', 'B', 'A']);
});

test('derived project totals never cause a change by themselves', () => {
    const pc = device(base); syncRound(pc, null, 1000);
    const before = pc.meta.items.projects.P1.t;
    pc.state.projects[0].totalCost = 123.45;
    track(pc, 5000);
    assert.equal(pc.meta.items.projects.P1.t, before);
});

test('nothing changed -> neither side needs an update', () => {
    const pc = device(base); let drive = syncRound(pc, null, 1000).drive;
    const r = syncRound(pc, drive, 2000);
    assert.equal(r.localChanged, false);
    assert.equal(r.remoteChanged, false);
});

test('pictures sync like records (add, replace, delete)', () => {
    const pc = device(base, { P1: 'data:a' }); let drive = syncRound(pc, null, 1000).drive;
    const phone = device({}, {}); drive = syncRound(phone, drive, 1100).drive;
    assert.equal(phone.images.P1, 'data:a');
    phone.images.P1 = 'data:b'; drive = syncRound(phone, drive, 2000).drive;
    syncRound(pc, drive, 2100); assert.equal(pc.images.P1, 'data:b');
    delete pc.images.P1; drive = syncRound(pc, drive, 3000).drive;
    syncRound(phone, drive, 3100); assert.equal(phone.images.P1, undefined);
});

test('equal timestamps with different content resolve identically on both devices', () => {
    const a = { items: { parts: { X: { t: 5, h: 'aaa', v: { id: 'X', n: 1 } } } }, tombstones: {} };
    const b = { items: { parts: { X: { t: 5, h: 'bbb', v: { id: 'X', n: 2 } } } }, tombstones: {} };
    assert.equal(S.syncMergeDocs(a, b, 10).doc.items.parts.X.v.n, S.syncMergeDocs(b, a, 10).doc.items.parts.X.v.n);
});

test('split into data/images files and join back', () => {
    const pc = device(base, { P1: 'data:a' }); track(pc, 1000);
    const doc = docOf(pc, 1000);
    const { data, images } = S.syncSplitDoc(doc);
    assert.ok(!data.items.images && images.items.images);
    assert.deepEqual(plain(S.syncJoinDocs(data, images).items), plain(doc.items));
});

test('stable hash ignores key order', () => {
    assert.equal(S.syncHash({ a: 1, b: [1, { c: 2, d: 3 }] }), S.syncHash({ b: [1, { d: 3, c: 2 }], a: 1 }));
    assert.notEqual(S.syncHash({ a: 1 }), S.syncHash({ a: 2 }));
});
