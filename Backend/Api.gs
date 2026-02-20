/**
 * Backend/Api.gs
 * This file handles all requests coming from the frontend (the browser).
 */

// Phase 1 POC: Write to cell A1 to prove the connection works.
function testConnection() {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var timestamp = new Date().toLocaleTimeString();
    
    sheet.getRange('A1').setValue('Hello from LumberLogic! Last sync: ' + timestamp);
    
    // Return a success object to the frontend
    return { success: true, message: "Connection successful! Check cell A1." };
  } catch (error) {
    // If we fail, catch the error so the frontend doesn't crash silently
    return { success: false, message: error.toString() };
  }
}