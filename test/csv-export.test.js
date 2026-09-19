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
    lbl_width: 'Width', lbl_length: 'Length', lbl_thickness: 'Thickness',
    col_material: 'Material', col_grain: 'Grain',
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

// Column indices for the current 14-column layout, named so index shifts don't
// need to be re-derived by hand in every assertion below.
const COL = {
    PROJECT: 0, GROUP: 1, NAME: 2, CATEGORY: 3, QTY: 4, BULK: 5, PROFILE: 6,
    WIDTH: 7, LENGTH: 8, THICKNESS: 9, MATERIAL: 10, GRAIN: 11, WEIGHT: 12, COST: 13
};

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

function profile(overrides) {
    return Object.assign({ id: 'PR1', name: '2x4', width: 88.9, thickness: 38.1 }, overrides);
}

function row(csv, lineIndex = 1) {
    return csv.split('\r\n')[lineIndex].split(',');
}

test('header row: 14 columns, Width/Length/Thickness carry the unit, Weight/Cost carry unit and currency', () => {
    const csv = buildPartsCsv([], baseAppState({ settings: { displayUnit: 'mm', currency: '€' } }));
    const header = csv.split('\r\n')[0];
    assert.equal(header, 'Project,Group,Part Name,Category,Qty,Bulk,Profile,Width (mm),Length (mm),Thickness (mm),Material,Grain,Weight (kg),Cost (€)');
});

test('dimension and weight headers switch to "in"/lbs for non-metric display units', () => {
    const csv = buildPartsCsv([], baseAppState({ settings: { displayUnit: 'dec_in', currency: '$' } }));
    const header = csv.split('\r\n')[0];
    assert.ok(header.includes('Width (in)'));
    assert.ok(header.includes('Length (in)'));
    assert.ok(header.includes('Thickness (in)'));
    assert.ok(header.includes('Weight (lbs)'));
});

test('row order is preserved exactly as given — no re-filtering or re-sorting inside the builder', () => {
    const parts = [
        part({ id: 'C', name: 'C-part' }),
        part({ id: 'A', name: 'A-part' }),
        part({ id: 'B', name: 'B-part' })
    ];
    const csv = buildPartsCsv(parts, baseAppState());
    const dataLines = csv.split('\r\n').slice(1);
    assert.deepEqual(dataLines.map(l => l.split(',')[COL.NAME]), ['C-part', 'A-part', 'B-part']);
});

test('lumber: Length comes from the part, Width/Thickness come from the real (not nominal) profile dimensions', () => {
    const prof = profile({ id: 'PR1', name: '2x4', width: 88.9, thickness: 38.1 }); // real 3.5in x 1.5in, not the "2x4" nominal name
    const p = part({ category: 'lumber', length: 2438, profileId: 'PR1' });
    const csv = buildPartsCsv([p], baseAppState({ profiles: [prof] }));
    const cells = row(csv);
    assert.equal(cells[COL.WIDTH], '88.9');
    assert.equal(cells[COL.LENGTH], '2438');
    assert.equal(cells[COL.THICKNESS], '38.1');
});

test('sheet: Width and Length both come from the part, only Thickness comes from the profile', () => {
    const prof = profile({ id: 'PR1', width: 0, thickness: 18 }); // profile width is irrelevant for sheets
    const p = part({ category: 'sheet', width: 1219, length: 2438, profileId: 'PR1' });
    const csv = buildPartsCsv([p], baseAppState({ profiles: [prof] }));
    const cells = row(csv);
    assert.equal(cells[COL.WIDTH], '1219');
    assert.equal(cells[COL.LENGTH], '2438');
    assert.equal(cells[COL.THICKNESS], '18');
});

test('a lumber row with no matching (unmapped) profile exports blank Width/Thickness, not "0"', () => {
    const p = part({ category: 'lumber', length: 2438, profileId: 'NOT-FOUND' });
    const csv = buildPartsCsv([p], baseAppState());
    const cells = row(csv);
    assert.equal(cells[COL.WIDTH], '');
    assert.equal(cells[COL.LENGTH], '2438'); // still comes from the part itself
    assert.equal(cells[COL.THICKNESS], '');
});

test('a sheet row with no matching (unmapped) profile exports blank Thickness only', () => {
    const p = part({ category: 'sheet', width: 1219, length: 2438, profileId: 'NOT-FOUND' });
    const csv = buildPartsCsv([p], baseAppState());
    const cells = row(csv);
    assert.equal(cells[COL.WIDTH], '1219');
    assert.equal(cells[COL.LENGTH], '2438');
    assert.equal(cells[COL.THICKNESS], '');
});

test('a fastener row exports blank Width/Length/Thickness', () => {
    const p = part({ category: 'fastener' });
    const csv = buildPartsCsv([p], baseAppState());
    const cells = row(csv);
    assert.equal(cells[COL.WIDTH], '');
    assert.equal(cells[COL.LENGTH], '');
    assert.equal(cells[COL.THICKNESS], '');
});

test('dimension values are never prefixed with a leading apostrophe, in any display unit (reimport-friendliness over Excel date-autodetect protection)', () => {
    const prof = profile({ id: 'PR1', width: 88.9, thickness: 38.1 });
    const p = part({ category: 'lumber', length: 2438, profileId: 'PR1' });
    ['mm', 'dec_in', 'frac_in'].forEach(displayUnit => {
        const csv = buildPartsCsv([p], baseAppState({ profiles: [prof], settings: { displayUnit, currency: '$' } }));
        const cells = row(csv);
        assert.equal(cells[COL.WIDTH], '88.9');
        assert.equal(cells[COL.LENGTH], '2438');
        assert.equal(cells[COL.THICKNESS], '38.1');
    });
});

test('weight and cost are both present in every row regardless of partsMetricMode', () => {
    const p = part({ _w: 2, _c: 15 });
    const appState = baseAppState({ settings: { displayUnit: 'mm', currency: '$', partsMetricMode: 'cost' } });
    const cells = row(buildPartsCsv([p], appState));
    assert.equal(cells[COL.WEIGHT], '2.00');
    assert.equal(cells[COL.COST], '15.00');
});

test('weight converts to lbs when display unit is not metric', () => {
    const p = part({ _w: 1 }); // 1kg -> 2.20462 lbs
    const csv = buildPartsCsv([p], baseAppState({ settings: { displayUnit: 'dec_in', currency: '$' } }));
    assert.equal(row(csv)[COL.WEIGHT], '2.20');
});

test('zero weight/cost render as blank cells, not "0.00"', () => {
    const p = part({ _w: 0, _c: 0 });
    const csv = buildPartsCsv([p], baseAppState());
    const cells = row(csv);
    assert.equal(cells[COL.WEIGHT], '');
    assert.equal(cells[COL.COST], '');
});

test('bulk lumber rows export a blank Qty cell, matching the on-screen "-" treatment', () => {
    const p = part({ category: 'lumber', is_bulk: true, qty: 7 });
    const csv = buildPartsCsv([p], baseAppState());
    const cells = row(csv);
    assert.equal(cells[COL.QTY], '');
    assert.equal(cells[COL.BULK], '✔️');
});

test('non-bulk rows export the Bulk column as "-"', () => {
    const p = part({ category: 'lumber', is_bulk: false });
    const csv = buildPartsCsv([p], baseAppState());
    assert.equal(row(csv)[COL.BULK], '-');
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
        assert.equal(row(csv)[COL.NAME], `'${dangerous}`);
    });
});

test('an ordinary name (no leading special character) is left untouched', () => {
    const p = part({ name: 'Shelf' });
    const csv = buildPartsCsv([p], baseAppState());
    assert.equal(row(csv)[COL.NAME], 'Shelf');
});

test('the returned string has no BOM — that is the download trigger\'s responsibility, not the builder\'s', () => {
    const csv = buildPartsCsv([], baseAppState());
    assert.equal(csv.charCodeAt(0), 'P'.charCodeAt(0)); // starts with "Project", not U+FEFF
});
