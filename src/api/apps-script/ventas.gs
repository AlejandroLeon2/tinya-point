// registrarVenta / actualizarStock — token-gated writes under LockService
// (doc/appscriptbase.md §3.5). Order in both: validarToken FIRST, payload
// shape, then the lock ONLY around the write itself. Stock never goes
// negative: clamp to 0 + advertencia (the sale already happened physically).

var METODOS_PAGO = ['efectivo', 'tarjeta', 'yape-plin'];

/**
 * Append a sale row to "Ventas" (column order of doc/base.md §2.2).
 * @param {string} token
 * @param {{id_venta: string, items: Array, total: number, metodo_pago: string}} data
 * @return {Object} { ok:true } | { ok:false, error }
 */
function registrarVenta(token, data) {
  const sesion = validarToken(token);
  if (!sesion.valido) {
    return respuestaError('unauthorized', 'registrarVenta: ' + sesion.motivo);
  }

  if (
    !data ||
    typeof data.id_venta !== 'string' ||
    data.id_venta === '' ||
    !Array.isArray(data.items) ||
    data.items.length === 0 ||
    typeof data.total !== 'number' ||
    !isFinite(data.total) ||
    data.total < 0 ||
    METODOS_PAGO.indexOf(data.metodo_pago) === -1
  ) {
    return respuestaError('payload_invalido', 'registrarVenta: bad data');
  }
  for (let i = 0; i < data.items.length; i++) {
    const item = data.items[i];
    if (
      !item ||
      typeof item.id !== 'string' ||
      typeof item.cantidad !== 'number' ||
      item.cantidad <= 0
    ) {
      return respuestaError('payload_invalido', 'registrarVenta: bad item at ' + i);
    }
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    obtenerLibro()
      .getSheetByName('Ventas')
      .appendRow([
        new Date(), // fecha_hora — server clock, never the client's (§3.5)
        data.id_venta,
        JSON.stringify(data.items),
        data.total,
        data.metodo_pago,
        true, // sincronizado — this row IS the successful sync of that local sale
      ]);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Subtract sold units from a product's stock. Read + write under one lock —
 * the most race-sensitive operation of the API (§3.5). A would-be negative
 * stock is clamped to 0 and returned as `advertencia`, never as an error.
 * @param {string} token
 * @param {{id: string, cantidadVendida: number}} data
 * @return {Object} { ok:true, stockRestante, advertencia? } | { ok:false, error }
 */
function actualizarStock(token, data) {
  const sesion = validarToken(token);
  if (!sesion.valido) {
    return respuestaError('unauthorized', 'actualizarStock: ' + sesion.motivo);
  }

  if (
    !data ||
    typeof data.id !== 'string' ||
    data.id === '' ||
    typeof data.cantidadVendida !== 'number' ||
    !isFinite(data.cantidadVendida) ||
    data.cantidadVendida <= 0
  ) {
    return respuestaError('payload_invalido', 'actualizarStock: bad data');
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const hoja = obtenerLibro().getSheetByName('Productos');

    const encabezados = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];
    let colStock = -1;
    for (let c = 0; c < encabezados.length; c++) {
      if (String(encabezados[c]).trim() === 'stock') {
        colStock = c + 1; // 1-based for getRange
        break;
      }
    }
    if (colStock === -1) {
      return respuestaError('error_interno', 'actualizarStock: missing stock header');
    }

    const filaNum = buscarFilaPorId(hoja, data.id);
    if (filaNum === -1) {
      return respuestaError('payload_invalido', 'actualizarStock: unknown id ' + data.id);
    }

    const stockActual = Number(hoja.getRange(filaNum, colStock).getValue());
    let nuevo = stockActual - data.cantidadVendida;
    let advertencia;
    if (nuevo < 0) {
      nuevo = 0;
      advertencia = 'stock_insuficiente_ajustado_a_cero';
    }
    hoja.getRange(filaNum, colStock).setValue(nuevo);

    const respuesta = { ok: true, stockRestante: nuevo };
    if (advertencia) respuesta.advertencia = advertencia;
    return respuesta;
  } finally {
    lock.releaseLock();
  }
}

/**
 * Row number (1-based) of the row whose `id` column matches, or -1
 * (doc/appscriptbase.md §3.5). Skips the header row; defaults to the first
 * column when no `id` header is found (id is column 1 in doc/base.md §2.1).
 * @param {GoogleAppsScript.Spreadsheet.Sheet} hoja
 * @param {string} id
 * @return {number}
 */
function buscarFilaPorId(hoja, id) {
  const datos = hoja.getDataRange().getValues();
  if (datos.length < 2) return -1;

  let colId = 0;
  for (let c = 0; c < datos[0].length; c++) {
    if (String(datos[0][c]).trim() === 'id') {
      colId = c;
      break;
    }
  }

  for (let f = 1; f < datos.length; f++) {
    if (String(datos[f][colId]) === String(id)) return f + 1;
  }
  return -1;
}
