'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGasPartial } = require('./helpers/extractGasFunction');

// js_projects.html has unrelated top-level code (window.projectImages init) that
// runs at load time, so a minimal stub must be seeded for the partial to
// evaluate at all in this sandboxed VM context.
const {
    _resolveCatalogRef,
    _buildProjectExportPayload,
    _validateProjectImportData,
    _prepareImportedProjectForMerge
} = loadGasPartial('Frontend/JS/Domain/js_projects.html', {
    window: {},
    document: { addEventListener: () => {} }
});

// ---- _resolveCatalogRef ----

test('_resolveCatalogRef: exact id match in the live catalog is kept as-is', () => {
    const current = [{ id: 'PROF-1', name: '2x4' }];
    const snap = [{ id: 'PROF-1', name: '2x4' }];
    assert.equal(_resolveCatalogRef('PROF-1', '2x4', current, snap), 'PROF-1');
    assert.equal(current.length, 1); // nothing added
});

test('_resolveCatalogRef: no id match, but a name match exists -> remaps to the existing entry\'s id', () => {
    const current = [{ id: 'PROF-NEW', name: '2x4' }];
    const snap = [{ id: 'PROF-OLD', name: '2x4' }];
    assert.equal(_resolveCatalogRef('PROF-OLD', '2x4', current, snap), 'PROF-NEW');
    assert.equal(current.length, 1); // nothing added, just remapped
});

test('_resolveCatalogRef: no id or name match -> reinserts the snapshot verbatim with its original id', () => {
    const current = [];
    const snap = [{ id: 'PROF-OLD', name: '2x4', width: 88.9, thickness: 38.1 }];
    const result = _resolveCatalogRef('PROF-OLD', '2x4', current, snap);
    assert.equal(result, 'PROF-OLD');
    assert.equal(current.length, 1);
    assert.deepEqual(current[0], snap[0]);
});

// ---- _buildProjectExportPayload ----

function baseAppState(overrides) {
    return Object.assign({
        projects: [], groups: [], parts: [], profiles: [], materials: []
    }, overrides);
}

test('_buildProjectExportPayload: only the target project\'s groups/parts are included', () => {
    const appState = baseAppState({
        projects: [{ id: 'PROJ-1', name: 'Kitchen' }, { id: 'PROJ-2', name: 'Deck' }],
        groups: [{ id: 'GRP-1', projectId: 'PROJ-1', name: 'Cabinets' }, { id: 'GRP-2', projectId: 'PROJ-2', name: 'Boards' }],
        parts: [{ id: 'PART-1', projectId: 'PROJ-1', profileId: '', materialId: '' }, { id: 'PART-2', projectId: 'PROJ-2', profileId: '', materialId: '' }]
    });
    const payload = _buildProjectExportPayload('PROJ-1', appState, {});
    assert.equal(payload.project.id, 'PROJ-1');
    assert.equal(payload.groups.length, 1);
    assert.equal(payload.groups[0].id, 'GRP-1');
    assert.equal(payload.parts.length, 1);
    assert.equal(payload.parts[0].id, 'PART-1');
});

test('_buildProjectExportPayload: usedProfiles/usedMaterials are scoped to exactly what the parts reference', () => {
    const appState = baseAppState({
        projects: [{ id: 'PROJ-1', name: 'Kitchen' }],
        parts: [{ id: 'PART-1', projectId: 'PROJ-1', profileId: 'PROF-1', materialId: 'MAT-1' }],
        profiles: [{ id: 'PROF-1', name: '2x4' }, { id: 'PROF-2', name: '2x6' }],
        materials: [{ id: 'MAT-1', name: 'Pine' }, { id: 'MAT-2', name: 'Oak' }]
    });
    const payload = _buildProjectExportPayload('PROJ-1', appState, {});
    assert.equal(payload.usedProfiles.length, 1);
    assert.equal(payload.usedProfiles[0].id, 'PROF-1');
    assert.equal(payload.usedMaterials.length, 1);
    assert.equal(payload.usedMaterials[0].id, 'MAT-1');
});

test('_buildProjectExportPayload: includes the thumbnail when present, null when absent', () => {
    const appState = baseAppState({ projects: [{ id: 'PROJ-1', name: 'Kitchen' }] });
    const withImage = _buildProjectExportPayload('PROJ-1', appState, { 'PROJ-1': 'data:image/jpeg;base64,xyz' });
    assert.equal(withImage.image, 'data:image/jpeg;base64,xyz');

    const noImage = _buildProjectExportPayload('PROJ-1', appState, {});
    assert.equal(noImage.image, null);
});

test('_buildProjectExportPayload: envelope carries the expected format/version fields', () => {
    const appState = baseAppState({ projects: [{ id: 'PROJ-1', name: 'Kitchen' }] });
    const payload = _buildProjectExportPayload('PROJ-1', appState, {});
    assert.equal(payload.format, 'solidcutlist-project');
    assert.equal(payload.version, 1);
    assert.ok(payload.exportedAt);
});

// ---- _validateProjectImportData ----

test('_validateProjectImportData: a well-formed envelope passes', () => {
    const data = { format: 'solidcutlist-project', version: 1, project: { id: 'PROJ-1', name: 'Kitchen' }, groups: [], parts: [] };
    assert.equal(_validateProjectImportData(data).valid, true);
});

test('_validateProjectImportData: wrong or missing format is rejected', () => {
    assert.equal(_validateProjectImportData({ format: 'something-else', project: { id: 'X', name: 'Y' } }).valid, false);
    assert.equal(_validateProjectImportData({ project: { id: 'X', name: 'Y' } }).valid, false);
});

test('_validateProjectImportData: missing/invalid project object is rejected', () => {
    assert.equal(_validateProjectImportData({ format: 'solidcutlist-project' }).valid, false);
    assert.equal(_validateProjectImportData({ format: 'solidcutlist-project', project: { name: 'no id' } }).valid, false);
    assert.equal(_validateProjectImportData({ format: 'solidcutlist-project', project: { id: 'no name' } }).valid, false);
});

test('_validateProjectImportData: missing groups/parts default to empty arrays rather than failing', () => {
    const data = { format: 'solidcutlist-project', project: { id: 'PROJ-1', name: 'Kitchen' } };
    const result = _validateProjectImportData(data);
    assert.equal(result.valid, true);
    // cross-realm array, compare by content not deepEqual
    assert.equal(data.groups.length, 0);
    assert.equal(data.parts.length, 0);
});

test('_validateProjectImportData: non-object input is rejected without throwing', () => {
    assert.equal(_validateProjectImportData(null).valid, false);
    assert.equal(_validateProjectImportData('a string').valid, false);
    assert.equal(_validateProjectImportData(undefined).valid, false);
});

// ---- _prepareImportedProjectForMerge ----

function importFixture(overrides) {
    return Object.assign({
        project: { id: 'PROJ-OLD', name: 'Kitchen' },
        groups: [{ id: 'GRP-OLD', projectId: 'PROJ-OLD', name: 'Cabinets' }],
        parts: [{ id: 'PART-OLD', projectId: 'PROJ-OLD', groupId: 'GRP-OLD', profileId: '', materialId: '', name: 'Shelf' }],
        usedProfiles: [],
        usedMaterials: []
    }, overrides);
}

test('_prepareImportedProjectForMerge: mints a fresh project id, different from the input', () => {
    const appState = baseAppState();
    const result = _prepareImportedProjectForMerge(importFixture(), appState);
    assert.notEqual(result.project.id, 'PROJ-OLD');
    assert.equal(result.project.name, 'Kitchen');
});

test('_prepareImportedProjectForMerge: group ids are fresh, and parts\' groupId is rewritten to match', () => {
    const appState = baseAppState();
    const result = _prepareImportedProjectForMerge(importFixture(), appState);
    assert.equal(result.groups.length, 1);
    assert.notEqual(result.groups[0].id, 'GRP-OLD');
    assert.equal(result.groups[0].projectId, result.project.id);
    assert.equal(result.parts[0].groupId, result.groups[0].id);
    assert.equal(result.parts[0].projectId, result.project.id);
});

test('_prepareImportedProjectForMerge: part ids are fresh, different from the input', () => {
    const appState = baseAppState();
    const result = _prepareImportedProjectForMerge(importFixture(), appState);
    assert.notEqual(result.parts[0].id, 'PART-OLD');
});

test('_prepareImportedProjectForMerge: re-running on the SAME input twice never produces colliding ids (the exact scenario this design exists to prevent)', () => {
    const appState = baseAppState();
    const first = _prepareImportedProjectForMerge(importFixture(), appState);
    const second = _prepareImportedProjectForMerge(importFixture(), appState);
    assert.notEqual(first.project.id, second.project.id);
    assert.notEqual(first.groups[0].id, second.groups[0].id);
    assert.notEqual(first.parts[0].id, second.parts[0].id);
});

test('_prepareImportedProjectForMerge: catalog healing — exact id match in the live catalog is kept', () => {
    const appState = baseAppState({
        profiles: [{ id: 'PROF-1', name: '2x4' }],
        materials: [{ id: 'MAT-1', name: 'Pine' }]
    });
    const data = importFixture({
        parts: [{ id: 'PART-OLD', projectId: 'PROJ-OLD', groupId: 'GRP-OLD', profileId: 'PROF-1', materialId: 'MAT-1' }],
        usedProfiles: [{ id: 'PROF-1', name: '2x4' }],
        usedMaterials: [{ id: 'MAT-1', name: 'Pine' }]
    });
    const result = _prepareImportedProjectForMerge(data, appState);
    assert.equal(result.parts[0].profileId, 'PROF-1');
    assert.equal(result.parts[0].materialId, 'MAT-1');
    assert.equal(result.catalogAdditions, 0);
});

test('_prepareImportedProjectForMerge: catalog healing — no match reinserts the snapshot and counts as an addition', () => {
    const appState = baseAppState(); // empty catalog
    const data = importFixture({
        parts: [{ id: 'PART-OLD', projectId: 'PROJ-OLD', groupId: 'GRP-OLD', profileId: 'PROF-GONE', materialId: 'MAT-GONE' }],
        usedProfiles: [{ id: 'PROF-GONE', name: '2x4', width: 88.9, thickness: 38.1 }],
        usedMaterials: [{ id: 'MAT-GONE', name: 'Pine', density: 500 }]
    });
    const result = _prepareImportedProjectForMerge(data, appState);
    assert.equal(result.parts[0].profileId, 'PROF-GONE');
    assert.equal(result.parts[0].materialId, 'MAT-GONE');
    assert.equal(result.catalogAdditions, 2);
    assert.equal(appState.profiles.length, 1);
    assert.equal(appState.materials.length, 1);
});

test('_prepareImportedProjectForMerge: catalog healing — no id match but a name match remaps to the live entry', () => {
    const appState = baseAppState({
        profiles: [{ id: 'PROF-LIVE', name: '2x4' }]
    });
    const data = importFixture({
        parts: [{ id: 'PART-OLD', projectId: 'PROJ-OLD', groupId: 'GRP-OLD', profileId: 'PROF-SNAPSHOT', materialId: '' }],
        usedProfiles: [{ id: 'PROF-SNAPSHOT', name: '2x4' }]
    });
    const result = _prepareImportedProjectForMerge(data, appState);
    assert.equal(result.parts[0].profileId, 'PROF-LIVE');
    assert.equal(result.catalogAdditions, 0);
    assert.equal(appState.profiles.length, 1); // no new entry, just remapped
});
