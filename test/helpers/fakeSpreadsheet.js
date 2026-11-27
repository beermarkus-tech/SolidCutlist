'use strict';

/**
 * Minimal in-memory stand-in for SpreadsheetApp, enough for Backend/Code.gs.
 * Mimics the Sheets behaviour that matters for correctness: a string written
 * with a leading apostrophe is stored as literal text and read back WITHOUT it,
 * while an unprotected string that looks like a number/date/formula gets coerced.
 */
function makeSheet(name) {
    const cells = []; // cells[r][c], 0-based
    const coerce = v => {
        if (typeof v !== 'string') return v;
        if (v.startsWith("'")) return v.slice(1);
        if (/^-?\d+(\.\d+)?$/.test(v)) return parseFloat(v);
        if (/^\d{1,2}\/\d{1,2}$/.test(v) || /^\d{4}-\d{2}$/.test(v)) return new Date(2026, 0, 1);
        if (v.startsWith('=')) return '#ERROR!';
        if (v === 'TRUE') return true;
        if (v === 'FALSE') return false;
        return v;
    };
    const lastRow = () => { for (let r = cells.length - 1; r >= 0; r--) if ((cells[r] || []).some(v => v !== '' && v !== undefined)) return r + 1; return 0; };
    const lastCol = () => { let m = 0; cells.forEach(row => (row || []).forEach((v, c) => { if (v !== '' && v !== undefined) m = Math.max(m, c + 1); })); return m; };
    const range = (r, c, nr, nc) => ({
        setValues(grid) { grid.forEach((row, i) => row.forEach((v, j) => { (cells[r - 1 + i] = cells[r - 1 + i] || [])[c - 1 + j] = coerce(v); })); return this; },
        setValue(v) { return this.setValues([[v]]); },
        getValues() { const out = []; for (let i = 0; i < nr; i++) { const row = []; for (let j = 0; j < nc; j++) { const v = (cells[r - 1 + i] || [])[c - 1 + j]; row.push(v === undefined ? '' : v); } out.push(row); } return out; },
        getValue() { return this.getValues()[0][0]; },
        clearContent() { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) if (cells[r - 1 + i]) cells[r - 1 + i][c - 1 + j] = ''; return this; },
        setFontWeight() { return this; }, setBackground() { return this; }, setFontColor() { return this; }
    });
    const A1 = a1 => {
        const m = a1.match(/^([A-Z])(\d+)(?::([A-Z])(\d+))?$/);
        const c1 = m[1].charCodeAt(0) - 64, r1 = +m[2];
        const c2 = m[3] ? m[3].charCodeAt(0) - 64 : c1, r2 = m[4] ? +m[4] : r1;
        return range(r1, c1, r2 - r1 + 1, c2 - c1 + 1);
    };
    return {
        name, cells,
        getRange: (a, b, c, d) => typeof a === 'string' ? A1(a) : range(a, b, c || 1, d || 1),
        getDataRange() { return range(1, 1, Math.max(lastRow(), 1), Math.max(lastCol(), 1)); },
        getLastRow: lastRow, getLastColumn: lastCol,
        setFrozenRows() {}, setTabColor() {},
        appendRow(row) { range(lastRow() + 1, 1, 1, row.length).setValues([row]); },
        deleteRow(r) { cells.splice(r - 1, 1); },
        deleteRows(r, n) { cells.splice(r - 1, n); },
        clear() { cells.length = 0; }
    };
}

function makeSpreadsheetApp() {
    const sheets = {};
    const ss = {
        getSheetByName: n => sheets[n] || null,
        insertSheet: n => (sheets[n] = makeSheet(n))
    };
    return {
        sheets,
        SpreadsheetApp: { getActiveSpreadsheet: () => ss, flush() {} },
        LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
        Utilities: { formatDate: d => d.toISOString().slice(0, 10) },
        Session: { getScriptTimeZone: () => 'UTC' }
    };
}

module.exports = { makeSpreadsheetApp };
