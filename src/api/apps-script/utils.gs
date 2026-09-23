// Spreadsheet access — the Apps Script project is standalone (clasp create
// at src/api/), where getActiveSpreadsheet() is null at web-app runtime.
// Prefer the bound spreadsheet when present (container-bound mode) and fall
// back to the SPREADSHEET_ID Script Property — no hardcoded IDs
// (appscript-gas skill: all sensitive config via PropertiesService).

/**
 * The spreadsheet this backend operates on.
 * @return {GoogleAppsScript.Spreadsheet.Spreadsheet}
 */
function obtenerLibro() {
  const activo = SpreadsheetApp.getActiveSpreadsheet();
  if (activo) return activo;
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('SPREADSHEET_ID missing in Script Properties');
  return SpreadsheetApp.openById(id);
}

// Response helpers — every handler returns a plain object; only respuestaJson
// turns it into the final HTTP output (doc/appscriptbase.md §3.6).

/**
 * Wrap any plain response object as the final JSON output.
 * @param {Object} objeto the response body
 * @return {GoogleAppsScript.ContentService.TextOutput}
 */
function respuestaJson(objeto) {
  return ContentService.createTextOutput(JSON.stringify(objeto))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Uniform error shape { ok:false, error:codigo } (§4.5 codes only).
 * mensajeInterno goes to Logger ONLY — never to the client: it may name
 * sheets, stack traces or payload details (§3.6/§6).
 * @param {string} codigo one of the §4.5 error codes
 * @param {string} mensajeInterno internal detail for the log
 * @return {{ok: boolean, error: string}}
 */
function respuestaError(codigo, mensajeInterno) {
  Logger.log('respuestaError [%s] %s', codigo, mensajeInterno);
  return { ok: false, error: codigo };
}
