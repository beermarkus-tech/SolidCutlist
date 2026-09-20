'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGasPartial } = require('./helpers/extractGasFunction');

// js_state.html registers a DOMContentLoaded listener at top level, so a
// minimal document stub must be seeded for the partial to evaluate at all
// in this sandboxed VM context.
const {
    _getDefaultAppStateSkeleton,
    _buildFullBackupPayload,
    _validateFullBackupData,
    _migrateFullBackupData,
    _mergeFullBackupOntoDefaults
} = loadGasPartial('Frontend/JS/Core/js_state.html', {
    window: {},
    document: { addEventListener: () => {} }
});

// ---- _buildFullBackupPayload ----

function baseAppState(overrides) {
    return Object.assign({
        projects: [], groups: [], parts: [], stock: [], catalog: [],
        materials: [], profiles: [], stores: [], jobs: [], settings: {}
    }, overrides);
}

test('_buildFullBackupPayload: envelope carries the expected format/version/appVersion fields', () => {
    const payload = _buildFullBackupPayload(baseAppState(), {}, 'build 17');
    assert.equal(payload.format, 'solidcutlist-full-backup');
    assert.equal(payload.schemaVersion, 1);
    assert.equal(payload.appVersion, 'build 17');
    assert.ok(payload.exportedAt);
});

test('_buildFullBackupPayload: only the known TABS + settings are included, nothing extra leaks in', () => {
    const appState = baseAppState({
        projects: [{ id: 'PROJ-1' }],
        materials: [{ id: 'M-1' }],
        settings: { theme: 'dark' },
        // Simulates something that must NEVER be picked up by this function,
        // even if it somehow ended up on appState (it never does in practice).
        archive: [{ id: 'ARC-1' }]
    });
    const payload = _buildFullBackupPayload(appState, {}, '');
    assert.equal(payload.appState.projects.length, 1);
    assert.equal(payload.appState.materials.length, 1);
    assert.equal(payload.appState.settings.theme, 'dark');
    assert.equal(payload.appState.archive, undefined);
});

test('_buildFullBackupPayload: missing tabs on the source default to empty arrays', () => {
    const payload = _buildFullBackupPayload({}, {}, '');
    assert.equal(payload.appState.projects.length, 0);
    assert.equal(payload.appState.stores.length, 0);
    assert.deepEqual(Object.keys(payload.appState.settings).length, 0);
});

test('_buildFullBackupPayload: thumbnail map is passed through as-is, empty object when absent', () => {
    const withImages = _buildFullBackupPayload(baseAppState(), { 'PROJ-1': 'data:image/jpeg;base64,xyz' }, '');
    assert.equal(withImages.images['PROJ-1'], 'data:image/jpeg;base64,xyz');

    const noImages = _buildFullBackupPayload(baseAppState(), null, '');
    assert.equal(Object.keys(noImages.images).length, 0);
});

// ---- _validateFullBackupData ----

test('_validateFullBackupData: a well-formed envelope passes', () => {
    const data = { format: 'solidcutlist-full-backup', schemaVersion: 1, appState: { projects: [] } };
    assert.equal(_validateFullBackupData(data).valid, true);
});

test('_validateFullBackupData: wrong or missing format is rejected', () => {
    assert.equal(_validateFullBackupData({ format: 'solidcutlist-project', schemaVersion: 1, appState: {} }).valid, false);
    assert.equal(_validateFullBackupData({ schemaVersion: 1, appState: {} }).valid, false);
});

test('_validateFullBackupData: missing or invalid schemaVersion is rejected', () => {
    assert.equal(_validateFullBackupData({ format: 'solidcutlist-full-backup', appState: {} }).valid, false);
    assert.equal(_validateFullBackupData({ format: 'solidcutlist-full-backup', schemaVersion: 0, appState: {} }).valid, false);
    assert.equal(_validateFullBackupData({ format: 'solidcutlist-full-backup', schemaVersion: 'one', appState: {} }).valid, false);
});

test('_validateFullBackupData: missing or non-object appState is rejected', () => {
    assert.equal(_validateFullBackupData({ format: 'solidcutlist-full-backup', schemaVersion: 1 }).valid, false);
    assert.equal(_validateFullBackupData({ format: 'solidcutlist-full-backup', schemaVersion: 1, appState: 'nope' }).valid, false);
});

test('_validateFullBackupData: non-object input is rejected without throwing', () => {
    assert.equal(_validateFullBackupData(null).valid, false);
    assert.equal(_validateFullBackupData('a string').valid, false);
    assert.equal(_validateFullBackupData(undefined).valid, false);
});

// ---- _migrateFullBackupData ----

test('_migrateFullBackupData: schemaVersion 1 passes through unchanged (identity case)', () => {
    const data = { format: 'solidcutlist-full-backup', schemaVersion: 1, appState: { projects: [{ id: 'PROJ-1' }] } };
    const migrated = _migrateFullBackupData(data);
    assert.equal(migrated.schemaVersion, 1);
    assert.equal(migrated.appState.projects.length, 1);
    assert.equal(migrated.appState.projects[0].id, 'PROJ-1');
});

// ---- _mergeFullBackupOntoDefaults ----

test('_mergeFullBackupOntoDefaults: a backup missing a settings field gets the default filled in', () => {
    const defaults = _getDefaultAppStateSkeleton();
    const merged = _mergeFullBackupOntoDefaults({ settings: { theme: 'dark' } }, defaults);
    assert.equal(merged.settings.theme, 'dark'); // backup's own value wins
    assert.equal(merged.settings.baseUnit, 'mm'); // filled in from defaults
    assert.equal(merged.settings.bladeKerf, 3.175); // filled in from defaults
});

test('_mergeFullBackupOntoDefaults: a backup missing a whole tab gets an empty array, not a crash', () => {
    const defaults = _getDefaultAppStateSkeleton();
    const merged = _mergeFullBackupOntoDefaults({ projects: [{ id: 'PROJ-1' }] }, defaults);
    assert.equal(merged.projects.length, 1);
    assert.equal(merged.stores.length, 0);
    assert.equal(merged.stock.length, 0);
});

test('_mergeFullBackupOntoDefaults: a value the backup provides always wins over the default, including an intentional empty array', () => {
    const defaults = _getDefaultAppStateSkeleton();
    const merged = _mergeFullBackupOntoDefaults({ stock: [] }, defaults);
    assert.equal(merged.stock.length, 0);
    assert.ok(Array.isArray(merged.stock));
});

test('_mergeFullBackupOntoDefaults: ui bucket defaults to an empty object when absent', () => {
    const defaults = _getDefaultAppStateSkeleton();
    const merged = _mergeFullBackupOntoDefaults({}, defaults);
    assert.equal(typeof merged.ui, 'object');
    assert.equal(Object.keys(merged.ui).length, 0);
});

test('_mergeFullBackupOntoDefaults: falls back to a freshly-built skeleton when no defaults are passed', () => {
    const merged = _mergeFullBackupOntoDefaults({ projects: [{ id: 'PROJ-1' }] });
    assert.equal(merged.projects.length, 1);
    assert.equal(merged.settings.baseUnit, 'mm');
});
