'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGasPartial } = require('./helpers/extractGasFunction');

// Minimal EN-only translation stub — buildPartsCsv() only needs t() to resolve to
// *some* stable string per key; the real i18n dictionary is covered by the app's
// own translation-key consistency, not re-tested here.
const T = {
    col_project: 'Project', col_group: 'Group', col_part_name: 'Part Name',
    col_category: 'Category', col_qty: 'Qty', col_bulk: 'Bulk', col_profile: 'Profile',
    col_size: 'Size', col_material: 'Material', col_grain: 'Grain',
    opt_weight: 'Weight', opt_cost: 'Cost', opt_length: 'Length', opt_width: 'Width',
    opt_lumber: 'Lumber', opt_sheet: 'Sheet'
};

const { buildPartsCsv } = loadGasPartial('Frontend/JS/Modules/js_export.html', {
    t: key => T[key] || key,
    // Unit conversion isn't under test here (that's formatForDisplay's own job,
    // already covered by test/fraction-format.test.js) — just echo the mm value.
    formatForDisplay: mm => String(mm),
    // buildPartsCsv always calls with raw=true; return whatever the fixture part
    // carries so each test controls its own weight/cost expectation directly.
    _computePartMetric: (part) => ({ weightKg: part._w || 0, cost: part._c || 0 })
});

function baseAppState(overrides) {
    return Object.assign({
        projects: [], groups: [], profiles: [], materials: [],
        settings: { displayUnit: 'mm', currency: '$' }
    }, overrides);
}

function part(overrides) {
    return Object.assign({
        id: 'P1', projectId: '', groupId: '', name: 'Part', category: 'lumber',
        is_bulk: false, qty: 1, length: 100, width: 0, grain: 'none',
        profileId: '', materialId: '', _w: 0, _c: 0
    }, overrides);
}

test('header row: 12 columns, weight/cost headers carry the current unit and currency', () => {
    const csv = buildPartsCsv([], baseAppState({ settings: { displayUnit: 'mm', currency: '€' } }));
    const header = csv.split('\r\n')[0];
    assert.equal(header, 'Project,Group,Part Name,Category,Qty,Bulk,Profile,Size,Material,Grain,Weight (kg),Cost (€)');
});

test('weight header switches to lbs for non-metric display units', () => {
    const csv = buildPartsCsv([], baseAppState({ settings: { displayUnit: 'dec_in', currency: '$' } }));
    assert.ok(csv.split('\r\n')[0].includes('Weight (lbs)'));
});

test('row order is preserved exactly as given — no re-filtering or re-sorting inside the builder', () => {
    const parts = [
        part({ id: 'C', name: 'C-part' }),
        part({ id: 'A', name: 'A-part' }),
        part({ id: 'B', name: 'B-part' })
    ];
    const csv = buildPartsCsv(parts, baseAppState());
    const dataLines = csv.split('\r\n').slice(1);
    assert.deepEqual(dataLines.map(l => l.split(',')[2]), ['C-part', 'A-part', 'B-part']);
});

test('weight and cost are both present in every row regardless of partsMetricMode', () => {
    const p = part({ _w: 2, _c: 15 });
    const appState = baseAppState({ settings: { displayUnit: 'mm', currency: '$', partsMetricMode: 'cost' } });
    const line = buildPartsCsv([p], appState).split('\r\n')[1];
    const cells = line.split(',');
    assert.equal(cells[10], '2.00'); // Weight (kg)
    assert.equal(cells[11], '15.00'); // Cost ($)
});

test('weight converts to lbs when display unit is not metric', () => {
    const p = part({ _w: 1 }); // 1kg -> 2.20462 lbs
    const csv = buildPartsCsv([p], baseAppState({ settings: { displayUnit: 'dec_in', currency: '$' } }));
    const cells = csv.split('\r\n')[1].split(',');
    assert.equal(cells[10], '2.20');
});

test('zero weight/cost render as blank cells, not "0.00"', () => {
    const p = part({ _w: 0, _c: 0 });
    const csv = buildPartsCsv([p], baseAppState());
    const cells = csv.split('\r\n')[1].split(',');
    assert.equal(cells[10], '');
    assert.equal(cells[11], '');
});

test('bulk lumber rows export a blank Qty cell, matching the on-screen "-" treatment', () => {
    const p = part({ category: 'lumber', is_bulk: true, qty: 7 });
    const csv = buildPartsCsv([p], baseAppState());
    const cells = csv.split('\r\n')[1].split(',');
    assert.equal(cells[4], ''); // Qty
    assert.equal(cells[5], '✔️'); // Bulk
});

test('non-bulk rows export the Bulk column as "-"', () => {
    const p = part({ category: 'lumber', is_bulk: false });
    const csv = buildPartsCsv([p], baseAppState());
    assert.equal(csv.split('\r\n')[1].split(',')[5], '-');
});

test('RFC4180 escaping: a comma in a free-text field is quoted', () => {
    const p = part({ name: 'Leg, tapered' });
    const csv = buildPartsCsv([p], baseAppState());
    assert.ok(csv.split('\r\n')[1].includes('"Leg, tapered"'));
});

test('RFC4180 escaping: a double quote is escaped by doubling', () => {
    const p = part({ name: '2" Leg' });
    const csv = buildPartsCsv([p], baseAppState());
    assert.ok(csv.split('\r\n')[1].includes('"2"" Leg"'));
});

test('RFC4180 escaping: an embedded newline forces quoting', () => {
    const p = part({ name: 'Leg\nSpare' });
    const csv = buildPartsCsv([p], baseAppState());
    assert.ok(csv.includes('"Leg\nSpare"'));
});

test('formula-injection guard: a name starting with =, +, -, or @ gets a leading apostrophe', () => {
    ['=SUM(A1)', '+1', '-1', '@cmd'].forEach(dangerous => {
        const p = part({ name: dangerous });
        const csv = buildPartsCsv([p], baseAppState());
        const nameCell = csv.split('\r\n')[1].split(',')[2];
        assert.equal(nameCell, `'${dangerous}`);
    });
});

test('an ordinary name (no leading special character) is left untouched', () => {
    const p = part({ name: 'Shelf' });
    const csv = buildPartsCsv([p], baseAppState());
    assert.equal(csv.split('\r\n')[1].split(',')[2], 'Shelf');
});

test('fractional-inch Size values get a leading apostrophe to block Excel date auto-detection', () => {
    const p = part({ category: 'lumber', length: 425.45 });
    const csv = buildPartsCsv([p], baseAppState({ settings: { displayUnit: 'frac_in', currency: '$' } }));
    const sizeCell = csv.split('\r\n')[1].split(',')[7];
    assert.equal(sizeCell, "'425.45"); // formatForDisplay is stubbed to echo the raw mm value
});

test('Size values are left bare (no apostrophe) for mm and decimal-inch display units', () => {
    const p = part({ category: 'lumber', length: 100 });
    const csvMm = buildPartsCsv([p], baseAppState({ settings: { displayUnit: 'mm', currency: '$' } }));
    const csvDec = buildPartsCsv([p], baseAppState({ settings: { displayUnit: 'dec_in', currency: '$' } }));
    assert.equal(csvMm.split('\r\n')[1].split(',')[7], '100');
    assert.equal(csvDec.split('\r\n')[1].split(',')[7], '100');
});

test('sheet Size combines width and length with "×", lumber Size is length only', () => {
    const sheet = part({ id: 'S1', category: 'sheet', width: 48, length: 96 });
    const lumber = part({ id: 'L1', category: 'lumber', length: 96 });
    const csv = buildPartsCsv([sheet, lumber], baseAppState());
    const lines = csv.split('\r\n').slice(1);
    assert.equal(lines[0].split(',')[7], '48 × 96');
    assert.equal(lines[1].split(',')[7], '96');
});

test('the returned string has no BOM — that is the download trigger\'s responsibility, not the builder\'s', () => {
    const csv = buildPartsCsv([], baseAppState());
    assert.equal(csv.charCodeAt(0), 'P'.charCodeAt(0)); // starts with "Project", not U+FEFF
});
