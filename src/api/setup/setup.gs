// Spreadsheet bootstrap — the "run this once" path for a new deployment.
// Creates EVERY sheet the backend reads, with the exact header row its
// handlers expect, so nobody ever hand-types a column name.
//
// Run it from the Apps Script editor: select `crearHojas` → Run. Optional
// companions: `estadoSetup` (read-only report) and `vincularLibroActivo`
// (stores SPREADSHEET_ID from the currently open spreadsheet).
//
// Idempotent by construction — a rerun never destroys anything:
//   - missing sheet          → created with headers, bold, frozen, formats
//   - existing sheet, all OK → reported as `ya_existia_completa`, untouched
//   - missing header         → ADDED as a trailing column (the handlers of
//                              Productos/Categorias/Marcas/Cajas resolve
//                              columns by header NAME, so appending is safe)
//   - row 1 clearly NOT a header (sheet has data, zero expected headers)
//     → left ALONE and reported: guessing here could mislabel real data.
//
// Schema source: doc/base.md §2.1–§2.6. The backend reads in TWO styles and
// this file honours both:
//   - header-name lookup → column order is free (Productos, Categorias,
//                          Marcas, Cajas)
//   - fixed position     → the order below IS the contract (Ventas, Sesiones)
//
// Column names are the literal Spanish keys of the wire/data contract
// (doc/extras.md §7) — never translate them.

/**
 * Sheet catalogue — single source of truth for the spreadsheet schema.
 * `tipo` drives the number format of the DATA rows on a freshly created
 * sheet; `ancho` is the column width in pixels.
 * @type {Array<{nombre: string, columnas: Array<{encabezado: string, tipo: string, ancho: number}>}>}
 */
var HOJAS = [
  {
    // base.md §2.1 — header-driven reads (obtenerProductos / productosAdmin)
    // and header-driven writes (crearProducto / actualizarProducto).
    nombre: 'Productos',
    columnas: [
      { encabezado: 'id', tipo: 'texto', ancho: 300 },
      { encabezado: 'nombre', tipo: 'texto', ancho: 220 },
      { encabezado: 'categoria', tipo: 'texto', ancho: 140 },
      { encabezado: 'marca', tipo: 'texto', ancho: 140 },
      { encabezado: 'precio', tipo: 'numero', ancho: 90 },
      { encabezado: 'stock', tipo: 'entero', ancho: 80 },
      // Optional and never read by the API — kept so the one-shot seed
      // (seed-productos.csv) pastes header-aligned (scripts/seed-dummyjson.mjs).
      { encabezado: 'sku/codigo_barras', tipo: 'texto', ancho: 160 },
      { encabezado: 'imagen_url', tipo: 'texto', ancho: 300 },
      { encabezado: 'activo', tipo: 'booleano', ancho: 70 },
    ],
  },
  {
    // base.md §2.5 — header-name lookup (categorias.gs).
    nombre: 'Categorias',
    columnas: [
      { encabezado: 'id', tipo: 'texto', ancho: 300 },
      { encabezado: 'nombre', tipo: 'texto', ancho: 220 },
    ],
  },
  {
    // base.md §2.6 — header-name lookup (marcas.gs): same id/nombre shape as
    // Categorias. crearMarca/actualizarMarca/borrarMarca append/patch/delete
    // rows here; actualizarMarca cascades into Productos.marca under one lock.
    nombre: 'Marcas',
    columnas: [
      { encabezado: 'id', tipo: 'texto', ancho: 300 },
      { encabezado: 'nombre', tipo: 'texto', ancho: 220 },
    ],
  },
  {
    // base.md §2.2 — POSITIONAL: registrarVenta() appends
    // [fecha_hora, id_venta, items, total, metodo_pago, sincronizado].
    // Append-only log, respaldo/reporte (the operational history is the
    // device's localStorage `historial_ventas`).
    nombre: 'Ventas',
    columnas: [
      { encabezado: 'fecha_hora', tipo: 'fecha', ancho: 150 },
      { encabezado: 'id_venta', tipo: 'texto', ancho: 300 },
      { encabezado: 'items', tipo: 'texto', ancho: 420 },
      { encabezado: 'total', tipo: 'numero', ancho: 90 },
      { encabezado: 'metodo_pago', tipo: 'texto', ancho: 110 },
      { encabezado: 'sincronizado', tipo: 'booleano', ancho: 110 },
    ],
  },
  {
    // base.md §2.4 — header-name lookup (caja.gs, upsert por id_caja).
    // `fecha_día` MUST stay TEXT: it is a client-supplied `YYYY-MM-DD`
    // string (regex-validated on write) and the historial grouping key.
    // A '@' format on a brand-new sheet stops Sheets from parsing it as a
    // date. Never reformat this column on a sheet that already holds data.
    nombre: 'Cajas',
    columnas: [
      { encabezado: 'id_caja', tipo: 'texto', ancho: 300 },
      { encabezado: 'fecha_día', tipo: 'texto', ancho: 110 },
      { encabezado: 'fecha_hora_apertura', tipo: 'fecha', ancho: 150 },
      { encabezado: 'fecha_hora_cierre', tipo: 'fecha', ancho: 150 },
      { encabezado: 'monto_apertura', tipo: 'numero', ancho: 120 },
      { encabezado: 'conteo_cierre', tipo: 'numero', ancho: 120 },
      { encabezado: 'efectivo_ventas', tipo: 'numero', ancho: 130 },
      { encabezado: 'tarjeta_ventas', tipo: 'numero', ancho: 130 },
      { encabezado: 'yape_plin_ventas', tipo: 'numero', ancho: 140 },
      { encabezado: 'n_ventas', tipo: 'entero', ancho: 90 },
      { encabezado: 'diferencia', tipo: 'numero', ancho: 110 },
    ],
  },
  {
    // auth.gs — POSITIONAL: crearSesion() appends [token, creado, expira]
    // and validarToken() reads fila[0]/fila[1]/fila[2] while SKIPPING row 1
    // (it assumes a header). A Sesiones sheet without a header row would
    // make the first token invisible to the router.
    nombre: 'Sesiones',
    columnas: [
      { encabezado: 'token', tipo: 'texto', ancho: 340 },
      { encabezado: 'creado', tipo: 'fecha', ancho: 150 },
      { encabezado: 'expira', tipo: 'fecha', ancho: 150 },
    ],
  },
];

// Number format per column type — applied ONLY to sheets created right now.
// `texto` (@) is the important one: it keeps id/fecha_día columns literal.
var FORMATO_COLUMNA = {
  texto: '@',
  fecha: 'dd/MM/yyyy HH:mm:ss',
  numero: '0.00',
  entero: '0',
  booleano: 'General',
};

/**
 * Create every missing sheet/header. Safe to run repeatedly.
 * @return {Array<Object>} one report entry per sheet
 */
function crearHojas() {
  const libro = obtenerLibro(); // utils.gs — bound sheet or SPREADSHEET_ID
  const reporte = [];

  for (let i = 0; i < HOJAS.length; i++) {
    const def = HOJAS[i];
    const info = inspeccionarHoja(libro, def);

    if (!info.existe) {
      const hoja = libro.insertSheet(def.nombre);
      escribirEncabezado(hoja, def.columnas);
      aplicarFormatos(hoja, def.columnas);
      hoja.setFrozenRows(1);
      reporte.push({ hoja: def.nombre, estado: 'creada', columnasAgregadas: [] });
      continue;
    }

    if (info.fila1NoEsEncabezado) {
      reporte.push({
        hoja: def.nombre,
        estado: 'FILA1_NO_ES_ENCABEZADO',
        columnasAgregadas: [],
        detalle:
          'La hoja tiene datos pero la fila 1 no contiene ningún encabezado esperado. ' +
          'No se tocó nada — revisá la fila 1 a mano y volvé a ejecutar.',
      });
      continue;
    }

    if (info.faltantes.length === 0) {
      reporte.push({ hoja: def.nombre, estado: 'ya_existia_completa', columnasAgregadas: [] });
      continue;
    }

    // Append only the missing headers as trailing columns — never rename,
    // never move, never delete what is already there.
    const hoja = info.hoja;
    const anchoActual = Math.max(info.encabezadosActuales.length, 0);
    const agregadas = [];
    for (let c = 0; c < info.faltantes.length; c++) {
      const nombre = info.faltantes[c];
      const columna = anchoActual + c + 1;
      const defCol = def.columnas.filter(function (col) {
        return col.encabezado === nombre;
      })[0];
      hoja.getRange(1, columna).setValue(nombre).setFontWeight('bold');
      darFormatoColumna(hoja, defCol, columna, info.filasDeDatos);
      agregadas.push(nombre);
    }
    reporte.push({ hoja: def.nombre, estado: 'columnas_agregadas', columnasAgregadas: agregadas });
  }

  Logger.log('crearHojas →\n' + JSON.stringify(reporte, null, 2));
  return reporte;
}

/**
 * Read-only health check: which sheets/headers are missing, without
 * writing anything. Run it before crearHojas() to know what will happen.
 * @return {Array<Object>}
 */
function estadoSetup() {
  const libro = obtenerLibro();
  const reporte = HOJAS.map(function (def) {
    const info = inspeccionarHoja(libro, def);
    return {
      hoja: def.nombre,
      existe: info.existe,
      encabezadosFaltantes: info.faltantes,
      fila1NoEsEncabezado: info.fila1NoEsEncabezado,
      filasDeDatos: info.filasDeDatos,
    };
  });
  Logger.log('estadoSetup →\n' + JSON.stringify(reporte, null, 2));
  return reporte;
}

/**
 * Store the currently open spreadsheet's id in the SPREADSHEET_ID Script
 * Property — the one manual step the checklist (apps-script/README.md)
 * otherwise asks for. Only useful when this script editor was opened FROM
 * the Sheet (container-bound); a standalone script has no active sheet.
 * USUARIO / CLAVE stay manual on purpose: they are credentials, never code.
 * @return {{ok: boolean, detalle: string}}
 */
function vincularLibroActivo() {
  const activo = SpreadsheetApp.getActiveSpreadsheet();
  if (!activo) {
    return {
      ok: false,
      detalle:
        'No hay spreadsheet activo. Abrí el editor desde el Sheet (container-bound) ' +
        'o guardá SPREADSHEET_ID a mano en Propiedades del script.',
    };
  }
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', activo.getId());
  const detalle = 'SPREADSHEET_ID = ' + activo.getId() + ' (' + activo.getName() + ')';
  Logger.log(detalle);
  return { ok: true, detalle: detalle };
}

// ── internals ───────────────────────────────────────────────────────────

/**
 * Inspect one sheet WITHOUT writing. Shared by crearHojas() and estadoSetup().
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} libro
 * @param {{nombre: string, columnas: Array}} def
 * @return {{hoja: ?GoogleAppsScript.Spreadsheet.Sheet, existe: boolean, faltantes: Array<string>, fila1NoEsEncabezado: boolean, encabezadosActuales: Array<string>, filasDeDatos: number}}
 */
function inspeccionarHoja(libro, def) {
  const hoja = libro.getSheetByName(def.nombre);
  if (!hoja) {
    return {
      hoja: null,
      existe: false,
      faltantes: def.columnas.map(function (col) {
        return col.encabezado;
      }),
      fila1NoEsEncabezado: false,
      encabezadosActuales: [],
      filasDeDatos: 0,
    };
  }

  const ancho = hoja.getLastColumn();
  const fila1 =
    ancho === 0
      ? []
      : hoja
          .getRange(1, 1, 1, ancho)
          .getValues()[0]
          .map(function (celda) {
            return String(celda).trim();
          });

  const faltantes = def.columnas
    .filter(function (col) {
      return fila1.indexOf(col.encabezado) === -1;
    })
    .map(function (col) {
      return col.encabezado;
    });

  const filasDeDatos = Math.max(hoja.getLastRow() - 1, 0);
  const vacia = hoja.getLastRow() === 0;
  const fila1NoEsEncabezado = !vacia && faltantes.length === def.columnas.length;

  return {
    hoja: hoja,
    existe: true,
    faltantes: faltantes,
    fila1NoEsEncabezado: fila1NoEsEncabezado,
    encabezadosActuales: fila1,
    filasDeDatos: filasDeDatos,
  };
}

/**
 * Header row + bold on a brand-new sheet.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} hoja
 * @param {Array<{encabezado: string}>} columnas
 * @return {void}
 */
function escribirEncabezado(hoja, columnas) {
  const nombres = columnas.map(function (col) {
    return col.encabezado;
  });
  hoja.getRange(1, 1, 1, nombres.length).setValues([nombres]).setFontWeight('bold');
}

/**
 * Column widths + number formats for the DATA rows of a new sheet.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} hoja
 * @param {Array<{tipo: string, ancho: number}>} columnas
 * @return {void}
 */
function aplicarFormatos(hoja, columnas) {
  for (let i = 0; i < columnas.length; i++) {
    darFormatoColumna(hoja, columnas[i], i + 1, Math.max(hoja.getMaxRows() - 1, 1));
  }
}

/**
 * One column: width + number format over its data rows.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} hoja
 * @param {{tipo: string, ancho: number}} columna
 * @param {number} numeroColumna 1-based
 * @param {number} filasDeDatos rows to format below the header
 * @return {void}
 */
function darFormatoColumna(hoja, columna, numeroColumna, filasDeDatos) {
  if (!columna) return;
  if (columna.ancho) hoja.setColumnWidth(numeroColumna, columna.ancho);
  const formato = FORMATO_COLUMNA[columna.tipo];
  if (formato) {
    hoja.getRange(2, numeroColumna, Math.max(filasDeDatos, 1), 1).setNumberFormat(formato);
  }
}
