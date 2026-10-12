// CRUD for the "Marcas" sheet — mirror of categorias.gs (same rules, same
// contracts: create/rename/delete). validarToken FIRST, payload shape,
// LockService ONLY around the write. The rename CASCADES to Productos.marca
// under the SAME lock; delete is usage-guarded (marca_en_uso) — a brand with
// no products leaves no trace worth keeping.
// Reuses existeNombreEn() (categorias.gs) and buscarFilaPorId() (ventas.gs):
// both are generic over the id/nombre headers.

/**
 * Light brand list — public read via doGet ?action=marcas.
 * @return {{ok: boolean, marcas: Array<Object>}}
 */
function obtenerMarcas() {
  const datos = obtenerLibro()
    .getSheetByName('Marcas')
    .getDataRange()
    .getValues();

  if (datos.length < 2) return { ok: true, marcas: [] };

  const cols = {};
  for (let c = 0; c < datos[0].length; c++) {
    cols[String(datos[0][c]).trim()] = c;
  }
  if (cols.id === undefined || cols.nombre === undefined) {
    throw new Error('Marcas: missing id/nombre headers');
  }

  const marcas = [];
  for (let f = 1; f < datos.length; f++) {
    marcas.push({
      id: String(datos[f][cols.id]),
      nombre: String(datos[f][cols.nombre]),
    });
  }
  marcas.sort(function (a, b) {
    return a.nombre.localeCompare(b.nombre, 'es');
  });
  return { ok: true, marcas: marcas };
}

/**
 * Create a brand. The id is generated HERE with Utilities.getUuid() —
 * creating a brand is not an offline flow (same reason as crearCategoria).
 * @param {string} token
 * @param {{nombre: string}} data
 * @return {Object} { ok:true, id } | { ok:false, error }
 */
function crearMarca(token, data) {
  const sesion = validarToken(token);
  if (!sesion.valido) {
    return respuestaError('unauthorized', 'crearMarca: ' + sesion.motivo);
  }
  if (!data || typeof data.nombre !== 'string' || data.nombre.trim() === '') {
    return respuestaError('payload_invalido', 'crearMarca: bad data');
  }
  const nombre = data.nombre.trim();

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const hoja = obtenerLibro().getSheetByName('Marcas');
    if (existeNombreEn(hoja, nombre, '')) {
      return respuestaError('marca_duplicada', 'crearMarca: ' + nombre);
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
 * Rename by id with CASCADE to the products that used the old name — both
 * writes happen under the SAME lock, so a product never points at a name
 * that no longer exists.
 * @param {string} token
 * @param {{id: string, nombre: string}} data
 * @return {Object} { ok:true } | { ok:false, error }
 */
function actualizarMarca(token, data) {
  const sesion = validarToken(token);
  if (!sesion.valido) {
    return respuestaError('unauthorized', 'actualizarMarca: ' + sesion.motivo);
  }
  if (
    !data ||
    typeof data.id !== 'string' ||
    data.id === '' ||
    typeof data.nombre !== 'string' ||
    data.nombre.trim() === ''
  ) {
    return respuestaError('payload_invalido', 'actualizarMarca: bad data');
  }
  const nombre = data.nombre.trim();

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const hoja = obtenerLibro().getSheetByName('Marcas');
    const encabezados = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];
    const cols = {};
    for (let c = 0; c < encabezados.length; c++) {
      cols[String(encabezados[c]).trim()] = c + 1; // 1-based for getRange
    }
    if (cols.id === undefined || cols.nombre === undefined) {
      return respuestaError('error_interno', 'actualizarMarca: missing headers');
    }

    const filaNum = buscarFilaPorId(hoja, data.id);
    if (filaNum === -1) {
      return respuestaError('payload_invalido', 'actualizarMarca: unknown id ' + data.id);
    }

    const nombreViejo = String(hoja.getRange(filaNum, cols.nombre).getValue()).trim();
    if (nombreViejo !== nombre && existeNombreEn(hoja, nombre, data.id)) {
      return respuestaError('marca_duplicada', 'actualizarMarca: ' + nombre);
    }

    hoja.getRange(filaNum, cols.nombre).setValue(nombre);
    if (nombreViejo !== nombre) {
      renombrarMarcaEnProductos(nombreViejo, nombre);
    }
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Cascade half of the rename: rewrite every Productos.marca that matched the
 * old name. Runs INSIDE the caller's lock.
 * @param {string} viejo previous brand name (trimmed)
 * @param {string} nuevo replacement name (trimmed)
 * @return {void}
 */
function renombrarMarcaEnProductos(viejo, nuevo) {
  const hoja = obtenerLibro().getSheetByName('Productos');
  const datos = hoja.getDataRange().getValues();
  if (datos.length < 2) return;

  const cols = {};
  for (let c = 0; c < datos[0].length; c++) {
    cols[String(datos[0][c]).trim()] = c;
  }
  if (cols.marca === undefined) return;

  const objetivo = viejo.toLowerCase();
  for (let f = 1; f < datos.length; f++) {
    if (String(datos[f][cols.marca]).trim().toLowerCase() !== objetivo) continue;
    hoja.getRange(f + 1, cols.marca + 1).setValue(nuevo);
  }
}

/**
 * Delete a brand, guarded by usage: if any product references it the row
 * stays and the client gets marca_en_uso — the UI shows the friendly copy,
 * the SHEET is the safety net.
 * @param {string} token
 * @param {{id: string}} data
 * @return {Object} { ok:true } | { ok:false, error }
 */
function borrarMarca(token, data) {
  const sesion = validarToken(token);
  if (!sesion.valido) {
    return respuestaError('unauthorized', 'borrarMarca: ' + sesion.motivo);
  }
  if (!data || typeof data.id !== 'string' || data.id === '') {
    return respuestaError('payload_invalido', 'borrarMarca: missing id');
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const hoja = obtenerLibro().getSheetByName('Marcas');
    const encabezados = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];
    const cols = {};
    for (let c = 0; c < encabezados.length; c++) {
      cols[String(encabezados[c]).trim()] = c + 1;
    }
    if (cols.id === undefined || cols.nombre === undefined) {
      return respuestaError('error_interno', 'borrarMarca: missing headers');
    }

    const filaNum = buscarFilaPorId(hoja, data.id);
    if (filaNum === -1) {
      return respuestaError('payload_invalido', 'borrarMarca: unknown id ' + data.id);
    }

    const nombre = String(hoja.getRange(filaNum, cols.nombre).getValue()).trim();
    if (marcaEnUso(nombre)) {
      return respuestaError('marca_en_uso', 'borrarMarca: ' + nombre);
    }

    hoja.deleteRow(filaNum);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

/**
 * True when any product row references this brand name — case-insensitive
 * and trimmed on both sides (crearProducto stores `marca` as typed).
 * @param {string} nombre brand name (trimmed)
 * @return {boolean}
 */
function marcaEnUso(nombre) {
  const datos = obtenerLibro().getSheetByName('Productos').getDataRange().getValues();
  if (datos.length < 2) return false;

  const cols = {};
  for (let c = 0; c < datos[0].length; c++) {
    cols[String(datos[0][c]).trim()] = c;
  }
  if (cols.marca === undefined) return false;

  const objetivo = nombre.toLowerCase();
  for (let f = 1; f < datos.length; f++) {
    if (String(datos[f][cols.marca]).trim().toLowerCase() === objetivo) return true;
  }
  return false;
}
