// obtenerProductos() — lightweight index of active products
// (doc/appscriptbase.md §3.4). Public read (no token): only rows with
// activo === true, only the light fields of §4.1 — never the full row.

/**
 * @return {{ok: boolean, productos: Array<Object>}}
 */
function obtenerProductos() {
  const datos = obtenerLibro()
    .getSheetByName('Productos')
    .getDataRange()
    .getValues();

  if (datos.length < 2) return { ok: true, productos: [] };

  // Header-driven column lookup: robust to column order, missing optional
  // columns (imagen_url/sku) never crash the read.
  const cols = {};
  for (let c = 0; c < datos[0].length; c++) {
    cols[String(datos[0][c]).trim()] = c;
  }
  if (cols.id === undefined || cols.nombre === undefined) {
    throw new Error('Productos: missing id/nombre headers');
  }

  const productos = [];
  for (let f = 1; f < datos.length; f++) {
    const fila = datos[f];
    const activo = fila[cols.activo];
    // Sheets may store the flag as boolean TRUE or as text after a paste.
    if (activo !== true && activo !== 'TRUE' && activo !== 'true') continue;

    productos.push({
      id: String(fila[cols.id]),
      nombre: String(fila[cols.nombre]),
      precio: Number(fila[cols.precio]),
      categoria: cols.categoria === undefined ? '' : String(fila[cols.categoria]),
      stock: Number(fila[cols.stock]),
      imagen_url: cols.imagen_url === undefined || !fila[cols.imagen_url]
        ? ''
        : String(fila[cols.imagen_url]),
    });
  }

  return { ok: true, productos: productos };
}

// ── Admin: full catalog + create/update (plan-mejoras-2.md Fase 1,
// contracts doc/appscriptbase.md §4.8–§4.10). Same order as ventas.gs:
// validarToken FIRST, payload shape, then LockService ONLY around the write.
// "Baja" = actualizarProducto with activo: false; there is NO delete action (D2).

/**
 * Full catalog for the admin screen: every row, INCLUDING activo: false
 * (§4.8 — the public obtenerProductos() filters those out on purpose).
 * @param {string} token
 * @param {Object} data unused — the client sends {}
 * @return {{ok: boolean, productos: Array<Object>}}
 */
function productosAdmin(token, data) {
  const sesion = validarToken(token);
  if (!sesion.valido) {
    return respuestaError('unauthorized', 'productosAdmin: ' + sesion.motivo);
  }

  const datos = obtenerLibro()
    .getSheetByName('Productos')
    .getDataRange()
    .getValues();
  if (datos.length < 2) return { ok: true, productos: [] };

  const cols = {};
  for (let c = 0; c < datos[0].length; c++) {
    cols[String(datos[0][c]).trim()] = c;
  }
  if (cols.id === undefined || cols.nombre === undefined) {
    return respuestaError('error_interno', 'productosAdmin: missing id/nombre headers');
  }

  const productos = [];
  for (let f = 1; f < datos.length; f++) {
    const fila = datos[f];
    const activo = fila[cols.activo];
    productos.push({
      id: String(fila[cols.id]),
      nombre: String(fila[cols.nombre]),
      precio: Number(fila[cols.precio]),
      categoria: cols.categoria === undefined ? '' : String(fila[cols.categoria]),
      stock: Number(fila[cols.stock]),
      imagen_url: cols.imagen_url === undefined || !fila[cols.imagen_url]
        ? ''
        : String(fila[cols.imagen_url]),
      activo: activo === true || activo === 'TRUE' || activo === 'true',
    });
  }

  return { ok: true, productos: productos };
}

/**
 * Insert a new product row. The id is generated HERE with Utilities.getUuid()
 * (§4.9) — creating a product is not an offline flow, unlike a sale (whose
 * id_venta comes from the client).
 * @param {string} token
 * @param {{nombre: string, categoria: string, precio: number, stock: number, imagen_url?: string}} data
 * @return {Object} { ok:true, id } | { ok:false, error }
 */
function crearProducto(token, data) {
  const sesion = validarToken(token);
  if (!sesion.valido) {
    return respuestaError('unauthorized', 'crearProducto: ' + sesion.motivo);
  }

  if (
    !data ||
    typeof data.nombre !== 'string' ||
    data.nombre.trim() === '' ||
    typeof data.categoria !== 'string' ||
    typeof data.precio !== 'number' ||
    !isFinite(data.precio) ||
    data.precio < 0 ||
    typeof data.stock !== 'number' ||
    !Number.isInteger(data.stock) ||
    data.stock < 0 ||
    (data.imagen_url !== undefined && typeof data.imagen_url !== 'string')
  ) {
    return respuestaError('payload_invalido', 'crearProducto: bad data');
  }

  const nuevoId = Utilities.getUuid();
  const valores = {
    id: nuevoId,
    nombre: data.nombre.trim(),
    categoria: data.categoria,
    precio: data.precio,
    stock: data.stock,
    imagen_url: data.imagen_url || '',
    activo: true,
  };

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const hoja = obtenerLibro().getSheetByName('Productos');
    // Header-driven row build: lands in the right column regardless of the
    // sheet's column order (sku/codigo_barras and any extra column stay
    // empty) — same robustness as the header lookup in obtenerProductos().
    const encabezados = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];
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
 * Partial update by id (§4.10). Only the fields present in `data` are
 * written; activo: false is the logical delete — never a hard delete (D2).
 * @param {string} token
 * @param {{id: string, nombre?: string, categoria?: string, precio?: number, stock?: number, imagen_url?: string, activo?: boolean}} data
 * @return {Object} { ok:true } | { ok:false, error }
 */
function actualizarProducto(token, data) {
  const sesion = validarToken(token);
  if (!sesion.valido) {
    return respuestaError('unauthorized', 'actualizarProducto: ' + sesion.motivo);
  }

  if (!data || typeof data.id !== 'string' || data.id === '') {
    return respuestaError('payload_invalido', 'actualizarProducto: missing id');
  }

  const campos = {};
  if (data.nombre !== undefined) campos.nombre = data.nombre;
  if (data.categoria !== undefined) campos.categoria = data.categoria;
  if (data.precio !== undefined) campos.precio = data.precio;
  if (data.stock !== undefined) campos.stock = data.stock;
  if (data.imagen_url !== undefined) campos.imagen_url = data.imagen_url;
  if (data.activo !== undefined) campos.activo = data.activo;

  if (Object.keys(campos).length === 0) {
    return respuestaError('payload_invalido', 'actualizarProducto: no fields');
  }
  if (
    (campos.nombre !== undefined &&
      (typeof campos.nombre !== 'string' || campos.nombre.trim() === '')) ||
    (campos.categoria !== undefined && typeof campos.categoria !== 'string') ||
    (campos.precio !== undefined &&
      (typeof campos.precio !== 'number' || !isFinite(campos.precio) || campos.precio < 0)) ||
    (campos.stock !== undefined &&
      (typeof campos.stock !== 'number' ||
        !Number.isInteger(campos.stock) ||
        campos.stock < 0)) ||
    (campos.imagen_url !== undefined && typeof campos.imagen_url !== 'string') ||
    (campos.activo !== undefined && typeof campos.activo !== 'boolean')
  ) {
    return respuestaError('payload_invalido', 'actualizarProducto: bad fields');
  }
  if (campos.nombre !== undefined) campos.nombre = campos.nombre.trim();

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const hoja = obtenerLibro().getSheetByName('Productos');
    const encabezados = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];
    const cols = {};
    for (let c = 0; c < encabezados.length; c++) {
      cols[String(encabezados[c]).trim()] = c + 1; // 1-based for getRange
    }
    if (cols.id === undefined || cols.nombre === undefined) {
      return respuestaError('error_interno', 'actualizarProducto: missing headers');
    }

    const filaNum = buscarFilaPorId(hoja, data.id);
    if (filaNum === -1) {
      return respuestaError('payload_invalido', 'actualizarProducto: unknown id ' + data.id);
    }

    for (const campo in campos) {
      if (cols[campo] === undefined) continue; // optional column absent (imagen_url)
      hoja.getRange(filaNum, cols[campo]).setValue(campos[campo]);
    }
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}
