// Apertura/cierre de caja — sheet "Cajas" (doc/base.md §2.4), contracts
// doc/appscriptbase.md §4.6/§4.7. Same order as ventas.gs/productos.gs:
// validarToken FIRST, payload shape, LockService ONLY around the write.
// The clock is the SERVER's (new Date() renders America/Lima per the
// appsscript.json timeZone) — never the client's, except fecha_día which
// §4.6 explicitly aports from the client (grouping key of the historial).

/**
 * Insert a new caja row (§4.6). id_caja + fecha_día come from the client —
 * the opening is saved locally first and may arrive through cola_sync.
 * @param {string} token
 * @param {{id_caja: string, fecha_día: string, monto_apertura: number}} data
 * @return {Object} { ok:true } | { ok:false, error }
 */
function abrirCaja(token, data) {
  const sesion = validarToken(token);
  if (!sesion.valido) {
    return respuestaError('unauthorized', 'abrirCaja: ' + sesion.motivo);
  }

  if (
    !data ||
    typeof data.id_caja !== 'string' ||
    data.id_caja === '' ||
    typeof data['fecha_día'] !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(data['fecha_día']) ||
    typeof data.monto_apertura !== 'number' ||
    !isFinite(data.monto_apertura) ||
    data.monto_apertura < 0
  ) {
    return respuestaError('payload_invalido', 'abrirCaja: bad data');
  }

  const valores = {
    id_caja: data.id_caja,
    fecha_día: data['fecha_día'],
    fecha_hora_apertura: new Date(), // server clock, never the client's (§3.5)
    monto_apertura: data.monto_apertura,
  };

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const hoja = obtenerLibro().getSheetByName('Cajas');
    if (!hoja) return respuestaError('error_interno', 'abrirCaja: missing Cajas sheet');
    // Header-driven row build (same robustness as crearProducto): lands in
    // the right column regardless of column order; closure columns stay empty.
    const encabezados = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];
    const fila = encabezados.map(function (nombreCol) {
      const clave = String(nombreCol).trim();
      return clave in valores ? valores[clave] : '';
    });
    hoja.appendRow(fila);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Upsert by id_caja (§4.7): update the existing apertura row when present,
 * append a full row otherwise — a replayed cola_sync never duplicates rows.
 * Totals/diferencia arrive as the client's SNAPSHOT and are stored as-is.
 * @param {string} token
 * @param {{id_caja: string, conteo_cierre: number, efectivo_ventas: number, tarjeta_ventas: number, yape_plin_ventas: number, n_ventas: number, diferencia: number}} data
 * @return {Object} { ok:true } | { ok:false, error }
 */
function cerrarCaja(token, data) {
  const sesion = validarToken(token);
  if (!sesion.valido) {
    return respuestaError('unauthorized', 'cerrarCaja: ' + sesion.motivo);
  }

  if (
    !data ||
    typeof data.id_caja !== 'string' ||
    data.id_caja === '' ||
    typeof data.conteo_cierre !== 'number' ||
    !isFinite(data.conteo_cierre) ||
    typeof data.efectivo_ventas !== 'number' ||
    !isFinite(data.efectivo_ventas) ||
    typeof data.tarjeta_ventas !== 'number' ||
    !isFinite(data.tarjeta_ventas) ||
    typeof data.yape_plin_ventas !== 'number' ||
    !isFinite(data.yape_plin_ventas) ||
    typeof data.n_ventas !== 'number' ||
    !Number.isInteger(data.n_ventas) ||
    data.n_ventas < 0 ||
    typeof data.diferencia !== 'number' ||
    !isFinite(data.diferencia)
  ) {
    return respuestaError('payload_invalido', 'cerrarCaja: bad data');
  }

  const valores = {
    id_caja: data.id_caja,
    fecha_hora_cierre: new Date(), // server clock (§3.5)
    conteo_cierre: data.conteo_cierre,
    efectivo_ventas: data.efectivo_ventas,
    tarjeta_ventas: data.tarjeta_ventas,
    yape_plin_ventas: data.yape_plin_ventas,
    n_ventas: data.n_ventas,
    diferencia: data.diferencia,
  };

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const hoja = obtenerLibro().getSheetByName('Cajas');
    if (!hoja) return respuestaError('error_interno', 'cerrarCaja: missing Cajas sheet');

    const encabezados = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];

    // Upsert path: update the apertura row in place when it exists.
    // buscarFilaPorId falls back to the FIRST column when no "id" header is
    // found — which is exactly id_caja in base.md §2.4 (column 1).
    const filaNum = buscarFilaPorId(hoja, data.id_caja);
    if (filaNum !== -1) {
      const cols = {};
      for (let c = 0; c < encabezados.length; c++) {
        cols[String(encabezados[c]).trim()] = c + 1; // 1-based for getRange
      }
      for (const campo in valores) {
        if (cols[campo] === undefined) continue;
        hoja.getRange(filaNum, cols[campo]).setValue(valores[campo]);
      }
      return { ok: true };
    }

    // Row missing (the apertura never reached the Sheet): create it with the
    // closure values — fecha_día/monto_apertura stay empty because §4.7 does
    // not carry them; the report still never loses a cierre.
    const fila = encabezados.map(function (nombreCol) {
      const clave = String(nombreCol).trim();
      return clave in valores ? valores[clave] : '';
    });
    hoja.appendRow(fila);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}
