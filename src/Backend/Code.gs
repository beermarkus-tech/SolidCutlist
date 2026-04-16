// ==========================================
// SOLID CUTLIST - GOOGLE SHEETS BACKEND API
// ==========================================

const TABS = ['projects', 'groups', 'parts', 'stock', 'catalog', 'materials', 'profiles', 'stores', 'jobs'];

/**
 * ==========================================
 * 1. WRITE: RECEIVE DATA FROM WEB APP
 * ==========================================
 */
function saveAppStateToSheet(payloadString) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const payload = JSON.parse(payloadString);
    const appState = payload.appState;
    const timestamp = payload.timestamp;

    // 1. Update the Metadata (Sync Engine Hub)
    let metaSheet = ss.getSheetByName('Metadata');
    if (!metaSheet) {
      metaSheet = ss.insertSheet('Metadata', 0);
      metaSheet.setTabColor('#000000'); // Color it black/red to warn people
    }
    
    // Write the lock warning and timestamps
    metaSheet.getRange('A1:B4').setValues([
      ['⚠️ SYSTEM STATUS', 'DO NOT EDIT SHEET WHILE APP IS RUNNING'],
      ['App Version', 'v1.0'],
      ['Last Cloud Sync', timestamp],
      ['Safe to Edit?', 'Yes, if the app is currently closed.']
    ]);
    metaSheet.getRange('A1:B1').setBackground('#dc3545').setFontColor('#ffffff').setFontWeight('bold');

    // 2. Explode the JSON into individual tabs
    TABS.forEach(tabName => {
      if (appState[tabName]) {
        writeArrayToSheet(ss, tabName, appState[tabName]);
      }
    });

    // 3. Flatten and Save Settings (Key/Value pairs)
    if (appState.settings) {
      writeSettingsToSheet(ss, 'settings', appState.settings);
    }

    return { status: 'success', cloud_timestamp: timestamp };
  } catch (e) {
    return { status: 'error', message: e.toString() };
  }
}

/**
 * HELPER: Converts an array of objects into a 2D spreadsheet grid (SMART DYNAMIC COLUMNS)
 */
function writeArrayToSheet(ss, sheetName, dataArray) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  
  sheet.clear(); 

  if (!dataArray || dataArray.length === 0) {
    sheet.getRange('A1').setValue('No data currently in this category.');
    return;
  }

  // 🪄 THE UPGRADE: Scan ALL objects to find every possible column header
  let headerSet = new Set();
  dataArray.forEach(obj => Object.keys(obj).forEach(key => headerSet.add(key)));
  let headers = Array.from(headerSet);

  let rows = [headers];

  dataArray.forEach(obj => {
    let row = headers.map(header => {
      let val = obj[header];
      if (typeof val === 'object' && val !== null) return JSON.stringify(val);
      if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
      // If the property doesn't exist on this specific object, leave the cell blank
      return val !== undefined ? val : '';
    });
    rows.push(row);
  });

  sheet.getRange(1, 1, rows.length, headers.length).setValues(rows);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#f8f9fa');
}

/**
 * HELPER: Converts the single Settings object into two columns (Key, Value)
 */
function writeSettingsToSheet(ss, sheetName, settingsObj) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) sheet = ss.insertSheet(sheetName);
  sheet.clear();

  let rows = [['Setting Key', 'Setting Value']];
  for (const [key, value] of Object.entries(settingsObj)) {
    // 🪄 FIX: Safely stringify arrays before sending to the Google Sheet
    let val = value;
    if (typeof val === 'object' && val !== null) val = JSON.stringify(val);
    rows.push([key, val]);
  }

  sheet.getRange(1, 1, rows.length, 2).setValues(rows);
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
  const rows = [];

  for (let i = 1; i < data.length; i++) {
    let obj = {};
    let rowData = data[i];
    
    if (rowData.join('').trim() === '') continue;

    for (let j = 0; j < headers.length; j++) {
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
    rows.push(obj);
  }
  return rows;
}

/**
 * ==========================================
 * 3. ARCHIVE SYSTEM (DEEP FREEZE)
 * ==========================================
 */
function archiveProjectToSheet(payloadString) {
  try {
    const payload = JSON.parse(payloadString);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let archiveSheet = ss.getSheetByName('Archive');
    
    if (!archiveSheet) {
      archiveSheet = ss.insertSheet('Archive');
      archiveSheet.appendRow(['Project ID', 'Archive Date', 'Project JSON', 'Groups JSON', 'Parts JSON', 'Image Base64']);
      archiveSheet.getRange('A1:F1').setFontWeight('bold').setBackground('#f8f9fa');
      archiveSheet.setFrozenRows(1);
    }

    const timestamp = new Date().toISOString();
    archiveSheet.appendRow([
      payload.id,
      timestamp,
      JSON.stringify(payload.project),
      JSON.stringify(payload.groups),
      JSON.stringify(payload.parts),
      payload.image || ''
    ]);

    return { status: 'success' };
  } catch(e) {
    return { status: 'error', message: e.toString() };
  }
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
      let projData = {};
      try { projData = JSON.parse(row[2]); } catch(e) {}

      list.push({
        id: row[0],
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
      if (data[i][0] === projectId) {
        return JSON.stringify({
          status: 'success',
          project: JSON.parse(data[i][2]),
          groups: JSON.parse(data[i][3]),
          parts: JSON.parse(data[i][4]),
          image: data[i][5] || null
        });
      }
    }
    throw new Error('Project not found in archive.');
  } catch(e) {
    return JSON.stringify({ status: 'error', message: e.toString() });
  }
}

function deleteProjectFromArchive(projectId) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const archiveSheet = ss.getSheetByName('Archive');
    if (!archiveSheet) throw new Error('Archive tab not found.');

    const data = archiveSheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === projectId) {
        archiveSheet.deleteRow(i + 1);
        return JSON.stringify({ status: 'success' });
      }
    }
    throw new Error('Project not found in archive.');
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

function saveThumbnail(payloadString) {
  try {
    const payload = JSON.parse(payloadString);
    const projectId = payload.projectId;
    const base64String = payload.base64String;
    
    if (!projectId || !base64String) throw new Error('Missing ID or Image Data');

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
      if (data[i][0] === projectId) {
        rowIndex = i + 1; // +1 because array is 0-indexed but sheets are 1-indexed
        break;
      }
    }

    if (rowIndex > -1) {
      // Overwrite existing
      sheet.getRange(rowIndex, 2).setValue(base64String);
    } else {
      // Append new
      sheet.appendRow([projectId, base64String]);
    }

    return JSON.stringify({ status: 'success' });
  } catch(e) {
    return JSON.stringify({ status: 'error', message: e.toString() });
  }
}

function deleteThumbnail(projectId) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Thumbnails');
    if (!sheet) return JSON.stringify({ status: 'success' }); // Nothing to delete

    const data = sheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === projectId) {
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

    const sheets = {
      materials: ss.getSheetByName('pck_materials'),
      profiles:  ss.getSheetByName(profileSheetName),
      projects:  ss.getSheetByName('pck_projects'),
      groups:    ss.getSheetByName('pck_groups'),
      parts:     ss.getSheetByName('pck_parts')
    };

    const data = {};
    for (const [key, sheet] of Object.entries(sheets)) {
      data[key] = sheet ? readArrayFromSheet(sheet) : [];
    }

    return JSON.stringify({ status: 'success', data });
  } catch(e) {
    return JSON.stringify({ status: 'error', message: e.toString() });
  }
}

function clearAllThumbnails() {
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