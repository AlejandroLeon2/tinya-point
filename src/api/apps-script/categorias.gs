// CRUD de la hoja "Categorias" (plan-productos-v2.md Fase 2, D2;
// contracts doc/appscriptbase.md §4.11–§4.14). Same order as productos.gs:
// validarToken FIRST, payload shape, LockService ONLY around the write.
// Rename cascades to Productos.categoria (§4.13) so no product is left
// pointing at a name that no longer exists; delete is guarded by usage
// (categoria_en_uso) instead of a soft-delete flag — a category with zero
// products has no trace worth keeping.

/**
 * Light category list (§4.11) — public read via doGet ?action=categorias.
 * @return {{ok: boolean, categorias: Array<Object>}}
 */
function obtenerCategorias() {
  const datos = obtenerLibro()
    .getSheetByName('Categorias')
    .getDataRange()
    .getValues();

  if (datos.length < 2) return { ok: true, categorias: [] };

  const cols = {};
  for (let c = 0; c < datos[0].length; c++) {
    cols[String(datos[0][c]).trim()] = c;
  }
  if (cols.id === undefined || cols.nombre === undefined) {
    throw new Error('Categorias: missing id/nombre headers');
  }

  const categorias = [];
  for (let f = 1; f < datos.length; f++) {
    categorias.push({
      id: String(datos[f][cols.id]),
      nombre: String(datos[f][cols.nombre]),
    });
  }
  categorias.sort(function (a, b) {
    return a.nombre.localeCompare(b.nombre, 'es');
  });
  return { ok: true, categorias: categorias };
}

/**
 * Case-insensitive duplicate-name check over the "Categorias" sheet,
 * optionally skipping one id (the row being renamed).
 * @param {GoogleAppsScript.Spreadsheet.Sheet} hoja
 * @param {string} nombre already trimmed
 * @param {string} exceptoId row id to ignore ('' when creating)
 * @return {boolean}
 */
function existeNombreEn(hoja, nombre, exceptoId) {
  const datos = hoja.getDataRange().getValues();
  if (datos.length < 2) return false;

  const cols = {};
  for (let c = 0; c < datos[0].length; c++) {
    cols[String(datos[0][c]).trim()] = c;
  }
  if (cols.id === undefined || cols.nombre === undefined) {
    throw new Error('Categorias: missing id/nombre headers');
  }

  const objetivo = nombre.toLowerCase();
  for (let f = 1; f < datos.length; f++) {
    if (String(datos[f][cols.id]) === exceptoId) continue;
    if (String(datos[f][cols.nombre]).trim().toLowerCase() === objetivo) return true;
  }
  return false;
}

/**
 * Create a category (§4.12). The id is generated HERE with Utilities.getUuid()
 * — creating a category is not an offline flow (same reason as crearProducto).
 * @param {string} token
 * @param {{nombre: string}} data
 * @return {Object} { ok:true, id } | { ok:false, error }
 */
function crearCategoria(token, data) {
  const sesion = validarToken(token);
  if (!sesion.valido) {
    return respuestaError('unauthorized', 'crearCategoria: ' + sesion.motivo);
  }
  if (!data || typeof data.nombre !== 'string' || data.nombre.trim() === '') {
    return respuestaError('payload_invalido', 'crearCategoria: bad data');
  }
  const nombre = data.nombre.trim();

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const hoja = obtenerLibro().getSheetByName('Categorias');
    if (existeNombreEn(hoja, nombre, '')) {
      return respuestaError('categoria_duplicada', 'crearCategoria: ' + nombre);
    }

    const nuevoId = Utilities.getUuid();
    const encabezados = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];
    const valores = { id: nuevoId, nombre: nombre };
    const fila = encabezados.map(function (nombreCol) {
      const clave = String(nombreCol).trim();
      return clave in valores ? valores[clave] : '';
    });
    hoja.appendRow(fila);
    return { ok: true, id: nuevoId };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Rename by id with CASCADE to the products that used the old name (§4.13) —
 * both writes happen under the SAME lock, so a product never points at a
 * name that no longer exists.
 * @param {string} token
 * @param {{id: string, nombre: string}} data
 * @return {Object} { ok:true } | { ok:false, error }
 */
function actualizarCategoria(token, data) {
  const sesion = validarToken(token);
  if (!sesion.valido) {
    return respuestaError('unauthorized', 'actualizarCategoria: ' + sesion.motivo);
  }
  if (
    !data ||
    typeof data.id !== 'string' ||
    data.id === '' ||
    typeof data.nombre !== 'string' ||
    data.nombre.trim() === ''
  ) {
    return respuestaError('payload_invalido', 'actualizarCategoria: bad data');
  }
  const nombre = data.nombre.trim();

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const hoja = obtenerLibro().getSheetByName('Categorias');
    const encabezados = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];
    const cols = {};
    for (let c = 0; c < encabezados.length; c++) {
      cols[String(encabezados[c]).trim()] = c + 1; // 1-based for getRange
    }
    if (cols.id === undefined || cols.nombre === undefined) {
      return respuestaError('error_interno', 'actualizarCategoria: missing headers');
    }

    const filaNum = buscarFilaPorId(hoja, data.id);
    if (filaNum === -1) {
      return respuestaError('payload_invalido', 'actualizarCategoria: unknown id ' + data.id);
    }

    const nombreViejo = String(hoja.getRange(filaNum, cols.nombre).getValue()).trim();
    if (nombreViejo !== nombre && existeNombreEn(hoja, nombre, data.id)) {
      return respuestaError('categoria_duplicada', 'actualizarCategoria: ' + nombre);
    }

    hoja.getRange(filaNum, cols.nombre).setValue(nombre);
    if (nombreViejo !== nombre) {
      renombrarCategoriaEnProductos(nombreViejo, nombre);
    }
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Cascade half of the rename (§4.13): rewrite every Productos.categoria that
 * matched the old name. Runs INSIDE the caller's lock.
 * @param {string} viejo previous category name (trimmed)
 * @param {string} nuevo replacement name (trimmed)
 * @return {void}
 */
function renombrarCategoriaEnProductos(viejo, nuevo) {
  const hoja = obtenerLibro().getSheetByName('Productos');
  const datos = hoja.getDataRange().getValues();
  if (datos.length < 2) return;

  const cols = {};
  for (let c = 0; c < datos[0].length; c++) {
    cols[String(datos[0][c]).trim()] = c;
  }
  if (cols.categoria === undefined) return;

  const objetivo = viejo.toLowerCase();
  for (let f = 1; f < datos.length; f++) {
    if (String(datos[f][cols.categoria]).trim().toLowerCase() !== objetivo) continue;
    hoja.getRange(f + 1, cols.categoria + 1).setValue(nuevo);
  }
}

/**
 * Delete a category (§4.14), guarded by usage: if any product references it
 * the row stays and the client gets categoria_en_uso — the UI only shows the
 * friendly message, the SHEET is the safety net.
 * @param {string} token
 * @param {{id: string}} data
 * @return {Object} { ok:true } | { ok:false, error }
 */
function borrarCategoria(token, data) {
  const sesion = validarToken(token);
  if (!sesion.valido) {
    return respuestaError('unauthorized', 'borrarCategoria: ' + sesion.motivo);
  }
  if (!data || typeof data.id !== 'string' || data.id === '') {
    return respuestaError('payload_invalido', 'borrarCategoria: missing id');
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const hoja = obtenerLibro().getSheetByName('Categorias');
    const encabezados = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];
    const cols = {};
    for (let c = 0; c < encabezados.length; c++) {
      cols[String(encabezados[c]).trim()] = c + 1;
    }
    if (cols.id === undefined || cols.nombre === undefined) {
      return respuestaError('error_interno', 'borrarCategoria: missing headers');
    }

    const filaNum = buscarFilaPorId(hoja, data.id);
    if (filaNum === -1) {
      return respuestaError('payload_invalido', 'borrarCategoria: unknown id ' + data.id);
    }

    const nombre = String(hoja.getRange(filaNum, cols.nombre).getValue()).trim();
    if (categoriaEnUso(nombre)) {
      return respuestaError('categoria_en_uso', 'borrarCategoria: ' + nombre);
    }

    hoja.deleteRow(filaNum);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

/**
 * True when any product row references this category name — case-insensitive
 * and trimmed on both sides (crearProducto stores `categoria` as typed).
 * @param {string} nombre category name (trimmed)
 * @return {boolean}
 */
function categoriaEnUso(nombre) {
  const datos = obtenerLibro().getSheetByName('Productos').getDataRange().getValues();
  if (datos.length < 2) return false;

  const cols = {};
  for (let c = 0; c < datos[0].length; c++) {
    cols[String(datos[0][c]).trim()] = c;
  }
  if (cols.categoria === undefined) return false;

  const objetivo = nombre.toLowerCase();
  for (let f = 1; f < datos.length; f++) {
    if (String(datos[f][cols.categoria]).trim().toLowerCase() === objetivo) return true;
  }
  return false;
}
