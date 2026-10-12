// obtenerProductos() — lightweight index of active products
// (doc/appscriptbase.md §3.4). Public read (no token): only rows with
// activo === true, only the light fields of §4.1 — never the full row.

// ── plan-camara-barras: the OPTIONAL barcode column ─────────────────────
// The wire field is `barcode` (string, leading zeros significant). The
// sheet column may be named "barcode" (canonical) or carry the legacy seed
// header "sku/codigo_barras" (doc/base.md §2.1) — whichever exists wins,
// "barcode" first. Header-driven like everything else: a sheet WITHOUT the
// column simply stores no code (same leniency as an absent imagen_url).

/**
 * Normalize a header for barcode-column matching: lowercase, drop accents
 * and the separators / _ space -, so hand-typed variants like
 * "SKU/Código_Barras" or "codigo barras" still resolve to the column.
 * @param {string} nombre raw header
 * @return {string}
 */
function claveBarcodeNormalizada(nombre) {
  return String(nombre)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\/_\s-]/g, '');
}

/**
 * Column index for the barcode, in the SAME base the caller's cols map uses
 * (0-based on reads, 1-based inside actualizarProducto). -1 = no column.
 * Matches (case/accent/separator-insensitive): "barcode", "sku/codigo_barras"
 * and "codigo_barras" — the canonical name wins over the legacy ones.
 * @param {Object} cols header name -> index
 * @return {number}
 */
function indiceColumnaBarcode(cols) {
  let legado = -1;
  const claves = Object.keys(cols);
  for (let i = 0; i < claves.length; i++) {
    const norm = claveBarcodeNormalizada(claves[i]);
    if (norm === 'barcode') return cols[claves[i]];
    if ((norm === 'skucodigobarras' || norm === 'codigobarras') && legado === -1) {
      legado = cols[claves[i]];
    }
  }
  return legado;
}

/**
 * Barcode cell -> trimmed string (never a number: the code is an identifier,
 * and String() keeps whatever the Sheet holds).
 * @param {*} valor raw cell
 * @return {string}
 */
function leerBarcodeCelda(valor) {
  if (valor === null || valor === undefined) return '';
  return String(valor).trim();
}

/**
 * Validate the optional barcode payload: absent or a short plain string.
 * @param {*} valor
 * @return {boolean}
 */
function esBarcodeValidoServidor(valor) {
  if (valor === undefined) return true; // optional field
  if (typeof valor !== 'string') return false; // numbers would eat leading zeros
  return String(valor).trim().length <= 64;
}

/**
 * Duplicate guard across the WHOLE catalog (active AND inactive rows — a
 * deactivated product keeps its code). Compares trimmed strings exactly.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} hoja
 * @param {string} barcode trimmed, non-empty
 * @param {string=} idExcluir product id being edited (own code never collides)
 * @return {boolean}
 */
function barcodeExisteEnHoja(hoja, barcode, idExcluir) {
  if (barcode === '') return false;
  const datos = hoja.getDataRange().getValues();
  if (datos.length < 2) return false;
  const cols = {};
  for (let c = 0; c < datos[0].length; c++) {
    cols[String(datos[0][c]).trim()] = c;
  }
  const idx = indiceColumnaBarcode(cols);
  if (idx === -1) return false;
  for (let f = 1; f < datos.length; f++) {
    const fila = datos[f];
    if (idExcluir && String(fila[cols.id]) === idExcluir) continue;
    if (leerBarcodeCelda(fila[idx]) === barcode) return true;
  }
  return false;
}

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
  const idxBarcode = indiceColumnaBarcode(cols);

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
      // Optional brand: always present, '' when empty/absent (same leniency
      // as an old sheet without the column).
      marca: cols.marca === undefined || !fila[cols.marca]
        ? ''
        : String(fila[cols.marca]).trim(),
      // plan-camara-barras (§4.1): always present, '' when empty/absent.
      barcode: idxBarcode === -1 ? '' : leerBarcodeCelda(fila[idxBarcode]),
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
  const idxBarcode = indiceColumnaBarcode(cols);

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
      // Optional brand — the edit form needs the stored value (or '').
      marca: cols.marca === undefined || !fila[cols.marca]
        ? ''
        : String(fila[cols.marca]).trim(),
      // plan-camara-barras (§4.8): admin needs it for the edit form AND the
      // local duplicate pre-guard.
      barcode: idxBarcode === -1 ? '' : leerBarcodeCelda(fila[idxBarcode]),
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
 * @param {{nombre: string, categoria: string, precio: number, stock: number, imagen_url?: string, marca?: string, barcode?: string}} data
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
    (data.imagen_url !== undefined && typeof data.imagen_url !== 'string') ||
    (data.marca !== undefined &&
      (typeof data.marca !== 'string' || data.marca.trim().length > 64)) ||
    !esBarcodeValidoServidor(data.barcode)
  ) {
    return respuestaError('payload_invalido', 'crearProducto: bad data');
  }

  // Optional brand: trimmed once, '' = no brand.
  const marca = data.marca === undefined ? '' : String(data.marca).trim();
  // plan-camara-barras: trim ONCE here; the string (leading zeros intact)
  // travels to the sheet under whichever barcode header exists.
  const barcode = data.barcode === undefined ? '' : String(data.barcode).trim();

  const nuevoId = Utilities.getUuid();

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const hoja = obtenerLibro().getSheetByName('Productos');
    // Duplicate guard INSIDE the lock (§4.9): two concurrent creates with the
    // same code must not both pass the check.
    if (barcodeExisteEnHoja(hoja, barcode)) {
      return respuestaError('barcode_duplicado', 'crearProducto: barcode already in use');
    }
    // Header-driven row build: lands in the right column regardless of the
    // sheet's column order (any extra column stays empty) — same robustness
    // as the header lookup in obtenerProductos(). The barcode rides the map
    // under its REAL header name so it never silently misses the column.
    const encabezados = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];
    const valores = {
      id: nuevoId,
      nombre: data.nombre.trim(),
      categoria: data.categoria,
      precio: data.precio,
      stock: data.stock,
      imagen_url: data.imagen_url || '',
      // Wire key matches the sheet header, so the generic row build below
      // writes it — or drops it when the sheet lacks the column.
      marca: marca,
      activo: true,
    };
    const cols = {};
    for (let c = 0; c < encabezados.length; c++) {
      cols[String(encabezados[c]).trim()] = c;
    }
    const idxBarcode = indiceColumnaBarcode(cols);
    if (idxBarcode !== -1) {
      valores[String(encabezados[idxBarcode]).trim()] = barcode;
    }
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
 * @param {{id: string, nombre?: string, categoria?: string, precio?: number, stock?: number, imagen_url?: string, activo?: boolean, marca?: string, barcode?: string}} data
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
  // Optional brand: "" is a legitimate value — it CLEARS the brand.
  if (data.marca !== undefined) campos.marca = String(data.marca).trim();
  // plan-camara-barras: "" is a legitimate value — it CLEARS the code.
  if (data.barcode !== undefined) campos.barcode = String(data.barcode).trim();

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
    (campos.activo !== undefined && typeof campos.activo !== 'boolean') ||
    (campos.marca !== undefined && campos.marca.length > 64) ||
    (data.barcode !== undefined && !esBarcodeValidoServidor(data.barcode))
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

    // Barcode: duplicate guard under the SAME lock (own row excluded), then
    // the value is written below through the generic loop — remapped from
    // the wire key `barcode` to the sheet's real header column.
    let colBarcode = -1;
    if (campos.barcode !== undefined) {
      if (barcodeExisteEnHoja(hoja, campos.barcode, data.id)) {
        return respuestaError('barcode_duplicado', 'actualizarProducto: barcode already in use');
      }
      colBarcode = indiceColumnaBarcode(cols);
    }

    for (const campo in campos) {
      let col = cols[campo];
      if (campo === 'barcode') col = colBarcode;
      if (col === undefined || col === -1) continue; // optional column absent
      hoja.getRange(filaNum, col).setValue(campos[campo]);
    }
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}
