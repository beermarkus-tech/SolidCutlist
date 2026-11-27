// ==========================================
// SOLID CUTLIST - GOOGLE SHEETS BACKEND API
// ==========================================

const TABS = ['projects', 'groups', 'parts', 'stock', 'catalog', 'materials', 'profiles', 'stores', 'jobs'];
const CELL_LIMIT = 45000; // safe margin below Google Sheets' 50k per-cell limit
const LOCK_WAIT_MS = 30000;

/**
 * Runs fn while holding the script lock, so two saves (two tabs, two devices, or
 * two overlapping requests) can never interleave their sheet writes.
 */
function withScriptLock(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_WAIT_MS)) {
    throw new Error('Another save is still running. Please try again in a moment.');
  }
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

/**
 * Prepares a value for setValues() so Sheets stores it exactly as given.
 * A leading apostrophe makes Sheets keep a string as literal text: without it
 * "1/2" or "2026-01" turns into a date, "007" into 7, and "=..." into a formula.
 * getValues() returns the string WITHOUT the apostrophe, so reads are unchanged.
 */
function toCell(val) {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') return val === '' ? '' : "'" + val;
  return val;
}

/**
 * Writes a full grid starting at A1 over the existing content, then clears only
 * the leftover rows/columns of the previous (larger) grid. Unlike clear()-then-
 * write, a failure half-way never leaves the tab empty.
 */
function overwriteGrid(sheet, rows) {
  const numRows = rows.length;
  const numCols = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const grid = rows.map(r => r.length === numCols ? r : r.concat(new Array(numCols - r.length).fill('')));
  const oldRows = sheet.getLastRow();
  const oldCols = sheet.getLastColumn();

  if (numRows > 0 && numCols > 0) {
    sheet.getRange(1, 1, numRows, numCols).setValues(grid);
  }
  if (oldRows > numRows) {
    sheet.getRange(numRows + 1, 1, oldRows - numRows, Math.max(oldCols, numCols, 1)).clearContent();
  }
  if (oldCols > numCols && numRows > 0) {
    sheet.getRange(1, numCols + 1, numRows, oldCols - numCols).clearContent();
  }
}

/**
 * ==========================================
 * 1. WRITE: RECEIVE DATA FROM WEB APP
 * ==========================================
 */
function saveAppStateToSheet(payloadString) {
  try {
    return withScriptLock(() => {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const payload = JSON.parse(payloadString);
      const appState = payload.appState;
      const timestamp = payload.timestamp;
      if (!appState || typeof appState !== 'object') throw new Error('Invalid payload: appState missing.');

      let metaSheet = ss.getSheetByName('Metadata');
      if (!metaSheet) {
        metaSheet = ss.insertSheet('Metadata', 0);
        metaSheet.setTabColor('#000000'); // Color it black/red to warn people
      }
      // Mark the save as in progress; the timestamp is only advanced once every tab
      // has been written, so a failed save never looks newer than the data it holds.
      metaSheet.getRange('A1:B2').setValues([
        ['⚠️ SYSTEM STATUS', 'DO NOT EDIT SHEET WHILE APP IS RUNNING'],
        ['App Version', 'v1.0']
      ]);
      metaSheet.getRange('A4:B4').setValues([['Safe to Edit?', 'No - save in progress']]);
      metaSheet.getRange('A1:B1').setBackground('#dc3545').setFontColor('#ffffff').setFontWeight('bold');

      // Explode the JSON into individual tabs
      TABS.forEach(tabName => {
        if (appState[tabName]) {
          writeArrayToSheet(ss, tabName, appState[tabName]);
        }
      });

      // Flatten and Save Settings (Key/Value pairs)
      if (appState.settings) {
        writeSettingsToSheet(ss, 'settings', appState.settings);
      }

      SpreadsheetApp.flush();
      metaSheet.getRange('A3:B4').setValues([
        ['Last Cloud Sync', timestamp],
        ['Safe to Edit?', 'Yes, if the app is currently closed.']
      ]);

      return { status: 'success', cloud_timestamp: timestamp };
    });
  } catch (e) {
    return { status: 'error', message: e.toString() };
  }
}

/**
 * HELPER: Converts an array of objects into a 2D spreadsheet grid (SMART DYNAMIC COLUMNS)
 * Large object/array fields that exceed CELL_LIMIT are automatically split across
 * multiple columns named field__1, field__2, … and stitched back together on read.
 */
function writeArrayToSheet(ss, sheetName, dataArray) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) sheet = ss.insertSheet(sheetName);

  if (!dataArray || dataArray.length === 0) {
    overwriteGrid(sheet, [['No data currently in this category.']]);
    return;
  }

  // Scan ALL objects to find every possible column header
  let headerSet = new Set();
  dataArray.forEach(obj => Object.keys(obj).forEach(key => headerSet.add(key)));
  const headers = Array.from(headerSet);

  // Pre-pass: find the max chunk count needed per object/array field across all rows
  const chunkCounts = {}; // fieldName -> max chunks needed (only set when > CELL_LIMIT)
  dataArray.forEach(obj => {
    headers.forEach(h => {
      const val = obj[h];
      if (typeof val === 'object' && val !== null) {
        const len = JSON.stringify(val).length;
        if (len > CELL_LIMIT) {
          const needed = Math.ceil(len / CELL_LIMIT);
          if (!chunkCounts[h] || needed > chunkCounts[h]) chunkCounts[h] = needed;
        }
      }
    });
  });

  // Expand headers: chunked fields become field__1, field__2, …; others unchanged
  const expandedHeaders = [];
  headers.forEach(h => {
    if (chunkCounts[h]) {
      for (let i = 1; i <= chunkCounts[h]; i++) expandedHeaders.push(`${h}__${i}`);
    } else {
      expandedHeaders.push(h);
    }
  });

  // Build rows
  const rows = [expandedHeaders];
  dataArray.forEach(obj => {
    const cells = {};
    headers.forEach(h => {
      const val = obj[h];
      if (chunkCounts[h]) {
        const jsonStr = JSON.stringify(val);
        for (let i = 1; i <= chunkCounts[h]; i++) {
          cells[`${h}__${i}`] = jsonStr.slice((i - 1) * CELL_LIMIT, i * CELL_LIMIT);
        }
      } else if (typeof val === 'object' && val !== null) {
        cells[h] = JSON.stringify(val);
      } else if (typeof val === 'boolean') {
        cells[h] = val ? 'TRUE' : 'FALSE';
      } else {
        cells[h] = val !== undefined ? val : '';
      }
    });
    rows.push(expandedHeaders.map(eh => toCell(cells[eh] !== undefined ? cells[eh] : '')));
  });
  rows[0] = rows[0].map(toCell);

  overwriteGrid(sheet, rows);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, expandedHeaders.length).setFontWeight('bold').setBackground('#f8f9fa');
}

/**
 * HELPER: Converts the single Settings object into two columns (Key, Value)
 */
function writeSettingsToSheet(ss, sheetName, settingsObj) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) sheet = ss.insertSheet(sheetName);

  let rows = [['Setting Key', 'Setting Value']];
  for (const [key, value] of Object.entries(settingsObj)) {
    // 🪄 FIX: Safely stringify arrays before sending to the Google Sheet
    let val = value;
    if (typeof val === 'object' && val !== null) val = JSON.stringify(val);
    rows.push([toCell(key), toCell(val)]);
  }

  overwriteGrid(sheet, rows);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, 2).setFontWeight('bold').setBackground('#f8f9fa');
}

/**
 * ==========================================
 * 2. READ: SEND DATA TO WEB APP
 * ==========================================
 */
function getAppStateFromSheet() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let payload = {
      appState: {},
      cloud_timestamp: 0,
      status: 'success'
    };

    // 1. Get the last sync timestamp
    const metaSheet = ss.getSheetByName('Metadata');
    if (metaSheet) {
      const storedTime = metaSheet.getRange('B3').getValue();
      payload.cloud_timestamp = parseFloat(storedTime) || 0;
    }

    // 2. Loop through our standard tabs
    TABS.forEach(tabName => {
      const sheet = ss.getSheetByName(tabName);
      if (sheet) {
        payload.appState[tabName] = readArrayFromSheet(sheet);
      } else {
        payload.appState[tabName] = []; 
      }
    });

    // 3. Rebuild the Settings
    const settingsSheet = ss.getSheetByName('settings');
    payload.appState.settings = {};
    if (settingsSheet) {
      const data = settingsSheet.getDataRange().getValues();
      if (data.length > 1) {
        for (let i = 1; i < data.length; i++) {
          let key = data[i][0];
          let val = data[i][1];
          
          if (key) {
            // 🪄 FIX: If the value looks like a stringified object/array, parse it back to life!
            if (typeof val === 'string' && (val.startsWith('{') || val.startsWith('['))) {
              try { 
                val = JSON.parse(val); 
              } catch(e) { 
                // If it fails to parse, just leave it as a normal string
              }
            }
            payload.appState.settings[key] = val;
          }
        }
      }
    }

    return JSON.stringify(payload);
  } catch (e) {
    return JSON.stringify({ status: 'error', message: e.toString() });
  }
}

function readArrayFromSheet(sheet) {
  const data = sheet.getDataRange().getValues(); // Reverted to getValues() so math stays intact [cite: 34]
  if (data.length < 2) return []; 

  const headers = data[0];

  // Identify chunked columns (field__N pattern) and build a stitching map
  const chunkMap = {};          // baseName -> [{n, i}, ...]
  const chunkColSet = new Set(); // column indices that are chunk pieces (skip in main loop)
  headers.forEach((h, i) => {
    const m = typeof h === 'string' && h.match(/^(.+)__(\d+)$/);
    if (m) {
      const base = m[1], n = parseInt(m[2]);
      if (!chunkMap[base]) chunkMap[base] = [];
      chunkMap[base].push({ n, i });
      chunkColSet.add(i);
    }
  });
  Object.values(chunkMap).forEach(arr => arr.sort((a, b) => a.n - b.n));

  const rows = [];

  for (let i = 1; i < data.length; i++) {
    let obj = {};
    let rowData = data[i];

    if (rowData.join('').trim() === '') continue;

    for (let j = 0; j < headers.length; j++) {
      if (chunkColSet.has(j)) continue; // handled by chunk-stitching below
      let key = headers[j];
      let val = rowData[j];
      
      if (!key) continue; 

      // 🪄 THE FIX: Force critical text columns to ALWAYS be Strings before sending to the app
      if (key === 'name' || key === 'id' || key === 'projectId' || key === 'groupId' || key === 'category') {
          obj[key] = String(val);
          continue;
      }

      if (key === 'date') {
        if (val instanceof Date) {
            // Convert Google Date Object to "YYYY-MM-DD"
            obj[key] = Utilities.formatDate(val, Session.getScriptTimeZone(), "yyyy-MM-dd");
        } else {
            obj[key] = String(val);
        }
        continue;
      }

      if (val === 'TRUE' || val === true) {
        obj[key] = true;
      } else if (val === 'FALSE' || val === false) {
        obj[key] = false;
      } else if (typeof val === 'string' && val.startsWith('{') && val.endsWith('}')) {
        try { 
          obj[key] = JSON.parse(val);
        } catch(e) { 
          obj[key] = val;
        }
      } else if (typeof val === 'string' && val.startsWith('[') && val.endsWith(']')) {
        try { 
          obj[key] = JSON.parse(val);
        } catch(e) { 
          obj[key] = val;
        }
      } else {
        obj[key] = val;
      }
    }
    // Reassemble any chunked fields into their original arrays/objects
    Object.entries(chunkMap).forEach(([base, chunks]) => {
      const combined = chunks.map(c => String(rowData[c.i] || '')).join('');
      if (combined) {
        try { obj[base] = JSON.parse(combined); }
        catch(e) { obj[base] = combined; }
      }
    });
    rows.push(obj);
  }
  return rows;
}

/**
 * ==========================================
 * 3. ARCHIVE SYSTEM (DEEP FREEZE)
 * ==========================================
 */
const ARCHIVE_HEADERS = ['Project ID', 'Archive Date', 'Project JSON', 'Groups JSON', 'Parts JSON', 'Image Base64', 'Used Profiles JSON', 'Used Materials JSON'];
const ARCHIVE_CHUNK_COL = 9; // column I: start of the chunked full-payload JSON (large projects)

function archiveProjectToSheet(payloadString) {
  try {
    return withScriptLock(() => {
      const payload = JSON.parse(payloadString);
      if (!payload || !payload.id) throw new Error('Missing project ID.');
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      let archiveSheet = ss.getSheetByName('Archive');

      if (!archiveSheet) {
        archiveSheet = ss.insertSheet('Archive');
        archiveSheet.getRange(1, 1, 1, ARCHIVE_HEADERS.length).setValues([ARCHIVE_HEADERS]);
        archiveSheet.getRange('A1:H1').setFontWeight('bold').setBackground('#f8f9fa');
        archiveSheet.setFrozenRows(1);
      }

      const fields = [
        JSON.stringify(payload.project),
        JSON.stringify(payload.groups || []),
        JSON.stringify(payload.parts || []),
        payload.image || '',
        JSON.stringify(payload.usedProfiles  || []),
        JSON.stringify(payload.usedMaterials || [])
      ];
      if (String(payload.image || '').length > CELL_LIMIT) throw new Error('Project image is too large to archive.');

      let row;
      if (fields.every(f => f.length <= CELL_LIMIT)) {
        row = [payload.id, new Date().toISOString()].concat(fields);
      } else {
        // Too big for single cells: keep a small summary in C (name/notes/icon for the
        // archive list) and store the full payload JSON split across columns I, J, ...
        const summary = JSON.stringify({
          name: payload.project && payload.project.name,
          comment: payload.project && payload.project.comment,
          icon: payload.project && payload.project.icon
        });
        const full = JSON.stringify({
          project: payload.project, groups: payload.groups || [], parts: payload.parts || [],
          usedProfiles: payload.usedProfiles || [], usedMaterials: payload.usedMaterials || []
        });
        const chunks = [];
        for (let i = 0; i < full.length; i += CELL_LIMIT) chunks.push(full.slice(i, i + CELL_LIMIT));
        row = [payload.id, new Date().toISOString(), summary, '', '', payload.image || '', '', ''].concat(chunks);
      }
      const rowIndex = archiveSheet.getLastRow() + 1;
      archiveSheet.getRange(rowIndex, 1, 1, row.length).setValues([row.map(toCell)]);
      SpreadsheetApp.flush();
      return { status: 'success' };
    });
  } catch(e) {
    return { status: 'error', message: e.toString() };
  }
}

/** Reassembles an archive row (plain or chunked format) into its parts. */
function _readArchiveRow(row) {
  const chunks = row.slice(ARCHIVE_CHUNK_COL - 1).map(c => String(c || '')).join('');
  if (chunks) {
    const full = JSON.parse(chunks);
    return {
      project: full.project, groups: full.groups || [], parts: full.parts || [],
      image: row[5] || null, usedProfiles: full.usedProfiles || [], usedMaterials: full.usedMaterials || []
    };
  }
  const parseOr = (v, fallback) => { try { return JSON.parse(v); } catch (e) { return fallback; } };
  return {
    project: JSON.parse(row[2]),
    groups: parseOr(row[3], []),
    parts: parseOr(row[4], []),
    image: row[5] || null,
    usedProfiles: parseOr(row[6], []),
    usedMaterials: parseOr(row[7], [])
  };
}

function getArchiveList() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const archiveSheet = ss.getSheetByName('Archive');
    if (!archiveSheet) return JSON.stringify({ status: 'success', data: [] });

    const data = archiveSheet.getDataRange().getValues();
    if (data.length < 2) return JSON.stringify({ status: 'success', data: [] });

    const list = [];
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (!row[0]) continue;
      let projData = {};
      try { projData = JSON.parse(row[2]) || {}; } catch(e) {}

      list.push({
        id: String(row[0]),
        date: row[1],
        name: projData.name || 'Unknown Project',
        notes: projData.comment || '',
        icon: projData.icon || null,
        image: row[5] || null
      });
    }
    return JSON.stringify({ status: 'success', data: list });
  } catch(e) {
    return JSON.stringify({ status: 'error', message: e.toString() });
  }
}

function loadProjectFromArchive(projectId) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const archiveSheet = ss.getSheetByName('Archive');
    if (!archiveSheet) throw new Error('Archive tab not found.');

    const data = archiveSheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(projectId)) {
        const rec = _readArchiveRow(data[i]);
        return JSON.stringify(Object.assign({ status: 'success' }, rec));
      }
    }
    throw new Error('Project not found in archive.');
  } catch(e) {
    return JSON.stringify({ status: 'error', message: e.toString() });
  }
}

function deleteProjectFromArchive(projectId) {
  try {
    return withScriptLock(() => {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const archiveSheet = ss.getSheetByName('Archive');
      if (!archiveSheet) throw new Error('Archive tab not found.');

      const data = archiveSheet.getDataRange().getValues();
      // Delete every row with this ID (bottom-up so indices stay valid), so a project
      // archived twice can't be restored twice.
      let deleted = 0;
      for (let i = data.length - 1; i >= 1; i--) {
        if (String(data[i][0]) === String(projectId)) {
          archiveSheet.deleteRow(i + 1);
          deleted++;
        }
      }
      if (!deleted) throw new Error('Project not found in archive.');
      return JSON.stringify({ status: 'success' });
    });
  } catch(e) {
    return JSON.stringify({ status: 'error', message: e.toString() });
  }
}

/**
 * ==========================================
 * IMAGE ENGINE (THUMBNAILS)
 * ==========================================
 * These functions operate entirely outside the main AppState sync 
 * to protect the 50k character cell limit and ensure fast performance.
 */

function getThumbnails() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName('Thumbnails');
    
    // Auto-create the tab if this is the first time running
    if (!sheet) {
      sheet = ss.insertSheet('Thumbnails');
      sheet.getRange('A1:B1').setValues([['Project ID', 'Base64 Image']]).setFontWeight('bold');
      sheet.setFrozenRows(1);
      return JSON.stringify({ status: 'success', data: {} });
    }

    const data = sheet.getDataRange().getValues();
    const thumbnailDict = {};
    
    // Skip header row
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] && data[i][1]) {
        thumbnailDict[data[i][0]] = data[i][1];
      }
    }
    
    return JSON.stringify({ status: 'success', data: thumbnailDict });
  } catch(e) {
    return JSON.stringify({ status: 'error', message: e.toString() });
  }
}

function saveThumbnail_(payloadString) {
  try {
    const payload = JSON.parse(payloadString);
    const projectId = payload.projectId;
    const base64String = payload.base64String;
    
    if (!projectId || !base64String) throw new Error('Missing ID or Image Data');
    if (String(base64String).length > CELL_LIMIT) throw new Error('Image is too large (max ' + CELL_LIMIT + ' characters).');

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName('Thumbnails');
    
    if (!sheet) {
      sheet = ss.insertSheet('Thumbnails');
      sheet.getRange('A1:B1').setValues([['Project ID', 'Base64 Image']]).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }

    const data = sheet.getDataRange().getValues();
    let rowIndex = -1;

    // Search for existing project image to overwrite
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(projectId)) {
        rowIndex = i + 1; // +1 because array is 0-indexed but sheets are 1-indexed
        break;
      }
    }

    if (rowIndex > -1) {
      // Overwrite existing
      sheet.getRange(rowIndex, 2).setValue(toCell(base64String));
    } else {
      // Append new
      sheet.appendRow([toCell(String(projectId)), toCell(base64String)]);
    }

    return JSON.stringify({ status: 'success' });
  } catch(e) {
    return JSON.stringify({ status: 'error', message: e.toString() });
  }
}

function deleteThumbnail_(projectId) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Thumbnails');
    if (!sheet) return JSON.stringify({ status: 'success' }); // Nothing to delete

    const data = sheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(projectId)) {
        sheet.deleteRow(i + 1);
        return JSON.stringify({ status: 'success' });
      }
    }

    return JSON.stringify({ status: 'success' }); // ID not found, safely ignore
  } catch(e) {
    return JSON.stringify({ status: 'error', message: e.toString() });
  }
}

function getStarterPack(profileRegion) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const profileSheetName = (profileRegion === 'US') ? 'pck_profiles_US' : 'pck_profiles_EU';

    const catalogSheetName   = (profileRegion === 'US') ? 'pck_catalog_US'   : 'pck_catalog_EU';
    const partsSheetName     = (profileRegion === 'US') ? 'pck_parts_US'     : 'pck_parts_EU';
    const projectsSheetName  = (profileRegion === 'US') ? 'pck_projects_US'  : 'pck_projects_EU';
    const groupsSheetName    = (profileRegion === 'US') ? 'pck_groups_US'    : 'pck_groups_EU';
    const sheets = {
      materials: ss.getSheetByName('pck_materials'),
      profiles:  ss.getSheetByName(profileSheetName),
      projects:  ss.getSheetByName(projectsSheetName) || ss.getSheetByName('pck_projects'),
      groups:    ss.getSheetByName(groupsSheetName)   || ss.getSheetByName('pck_groups'),
      parts:     ss.getSheetByName(partsSheetName) || ss.getSheetByName('pck_parts'),
      catalog:   ss.getSheetByName(catalogSheetName) || ss.getSheetByName('pck_catalog'),
      stores:    ss.getSheetByName('pck_stores')
    };

    const data = {};
    for (const [key, sheet] of Object.entries(sheets)) {
      data[key] = sheet ? readArrayFromSheet(sheet) : [];
    }

    // Read pck_thumbnails as a { projectId: base64 } dict (same structure as Thumbnails sheet)
    const thumbSheetName = (profileRegion === 'US') ? 'pck_thumbnails_US' : 'pck_thumbnails_EU';
    const thumbSheet = ss.getSheetByName(thumbSheetName) || ss.getSheetByName('pck_thumbnails');
    data.thumbnails = {};
    if (thumbSheet) {
      const rows = thumbSheet.getDataRange().getValues();
      for (let i = 1; i < rows.length; i++) {
        if (rows[i][0] && rows[i][1]) data.thumbnails[String(rows[i][0])] = rows[i][1];
      }
    }

    return JSON.stringify({ status: 'success', data });
  } catch(e) {
    return JSON.stringify({ status: 'error', message: e.toString() });
  }
}

function bulkImportThumbnails_(jsonPayload) {
  try {
    const thumbnails = JSON.parse(jsonPayload); // { projectId: base64 }
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName('Thumbnails');
    if (!sheet) {
      sheet = ss.insertSheet('Thumbnails');
      sheet.getRange('A1:B1').setValues([['Project ID', 'Base64 Image']]).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }

    // Clear existing rows (keep header)
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) sheet.deleteRows(2, lastRow - 1);

    const entries = Object.entries(thumbnails)
      .filter(([id, img]) => id && img && String(img).length <= CELL_LIMIT)
      .map(([id, img]) => [toCell(String(id)), toCell(img)]);
    if (entries.length > 0) {
      sheet.getRange(2, 1, entries.length, 2).setValues(entries);
    }

    return JSON.stringify({ status: 'success' });
  } catch(e) {
    return JSON.stringify({ status: 'error', message: e.toString() });
  }
}

function clearAllThumbnails_() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Thumbnails');
    if (!sheet) return JSON.stringify({ status: 'success' });

    // Keep header row, delete everything else
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      sheet.deleteRows(2, lastRow - 1);
    }

    return JSON.stringify({ status: 'success' });
  } catch(e) {
    return JSON.stringify({ status: 'error', message: e.toString() });
  }
}

// Locked public wrappers (the trailing-underscore versions are private to the server)
function saveThumbnail(payloadString) {
  try {
    return withScriptLock(() => saveThumbnail_(payloadString));
  } catch (e) {
    return JSON.stringify({ status: 'error', message: e.toString() });
  }
}

function deleteThumbnail(projectId) {
  try {
    return withScriptLock(() => deleteThumbnail_(projectId));
  } catch (e) {
    return JSON.stringify({ status: 'error', message: e.toString() });
  }
}

function bulkImportThumbnails(jsonPayload) {
  try {
    return withScriptLock(() => bulkImportThumbnails_(jsonPayload));
  } catch (e) {
    return JSON.stringify({ status: 'error', message: e.toString() });
  }
}

function clearAllThumbnails() {
  try {
    return withScriptLock(() => clearAllThumbnails_());
  } catch (e) {
    return JSON.stringify({ status: 'error', message: e.toString() });
  }
}
