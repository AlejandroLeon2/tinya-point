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
      // plan-camara-barras: NOW read/written by the API as the wire field
      // `barcode` (header-driven: the backend also accepts a "barcode"
      // header). TEXT format keeps leading zeros — never reformat this
      // column. Also kept so the one-shot seed (seed-productos.csv) pastes
      // header-aligned (scripts/seed-dummyjson.mjs).
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
    // `posicional: true` makes instalarTodo() verify the header ORDER too —
    // for these sheets the order IS the contract, appending at the end would
    // shift it.
    nombre: 'Ventas',
    posicional: true,
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
    // `posicional: true` → instalarTodo() also checks the header ORDER.
    nombre: 'Sesiones',
    posicional: true,
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
      encabezadosDuplicados: info.encabezadosDuplicados,
      fila1NoEsEncabezado: info.fila1NoEsEncabezado,
      filasDeDatos: info.filasDeDatos,
    };
  });
  Logger.log('estadoSetup →\n' + JSON.stringify(reporte, null, 2));
  return reporte;
}

/**
 * ONE function: run this and nothing else. Audits the schema, creates every
 * missing sheet/column, then VERIFIES the result and reports what still
 * needs a human (Script Properties, credentials, positional order).
 *
 * Idempotent like crearHojas() — a rerun only ever adds what is missing.
 * Nothing here is destructive: no rename, no move, no delete, no data touch.
 *
 * @return {{ok: boolean, pasos: Array<Object>, pendientes: Array<string>}}
 */
function instalarTodo() {
  const pasos = [];
  const pendientes = [];

  // ── 1. Schema self-audit (pure, no spreadsheet access) ────────────────
  // Catches a broken HOJAS BEFORE it writes anything — e.g. a merge that
  // duplicated a column definition, which would produce a duplicate header.
  const problemas = auditarEsquema();
  pasos.push({
    paso: 'esquema',
    ok: problemas.length === 0,
    detalle: problemas.length === 0 ? 'HOJAS consistente' : problemas,
  });
  if (esquemaBloqueante(problemas)) {
    pendientes.push('El esquema HOJAS es inválido: ' + problemas.join(' | '));
    return cerrarReporte(pasos, pendientes);
  }

  // ── 2. SPREADSHEET_ID ────────────────────────────────────────────────
  const props = PropertiesService.getScriptProperties();
  let id = props.getProperty('SPREADSHEET_ID');
  if (!id) {
    // Container-bound editors can fill it automatically; standalone cannot.
    const vinculado = vincularLibroActivo();
    id = props.getProperty('SPREADSHEET_ID');
    pasos.push({ paso: 'spreadsheet_id', ok: !!id, detalle: vinculado.detalle });
  } else {
    pasos.push({ paso: 'spreadsheet_id', ok: true, detalle: 'SPREADSHEET_ID presente' });
  }
  if (!id) {
    pendientes.push(
      'Falta la propiedad SPREADSHEET_ID: abrí el editor desde el Sheet y volvé a ' +
        'correr instalarTodo(), o guardala a mano en Propiedades del script.',
    );
    return cerrarReporte(pasos, pendientes);
  }

  // ── 3. Sheets + headers ──────────────────────────────────────────────
  let creacion;
  try {
    creacion = crearHojas();
  } catch (e) {
    pasos.push({ paso: 'hojas', ok: false, detalle: String(e) });
    pendientes.push('crearHojas() falló: ' + String(e));
    return cerrarReporte(pasos, pendientes);
  }
  const incidencias = creacion.filter(function (r) {
    return r.estado !== 'creada' && r.estado !== 'ya_existia_completa' && r.estado !== 'columnas_agregadas';
  });
  pasos.push({
    paso: 'hojas',
    ok: incidencias.length === 0,
    detalle: creacion.map(function (r) {
      return r.hoja + ': ' + r.estado + (r.columnasAgregadas.length ? ' [' + r.columnasAgregadas.join(', ') + ']' : '');
    }),
  });
  for (let i = 0; i < incidencias.length; i++) {
    pendientes.push(incidencias[i].hoja + ' — ' + (incidencias[i].detalle || incidencias[i].estado));
  }

  // ── 4. Verification pass (read-only) ─────────────────────────────────
  // crearHojas() reports what it DID; this reports what IS — including the
  // things it never touches (duplicate headers, wrong positional order).
  const verificacion = verificarEstado();
  pasos.push({ paso: 'verificacion', ok: verificacion.ok, detalle: verificacion.detalle });
  for (let v = 0; v < verificacion.pendientes.length; v++) {
    pendientes.push(verificacion.pendientes[v]);
  }

  // ── 5. Backend wiring ────────────────────────────────────────────────
  const faltan = faltanFunciones();
  pasos.push({
    paso: 'handlers',
    ok: faltan.length === 0,
    detalle: faltan.length === 0 ? 'doGet/doPost y todas las acciones responden' : faltan,
  });
  if (faltan.length > 0) {
    pendientes.push('Faltan handlers: ' + faltan.join(', ') + '. ¿Falta un clasp push?');
  }

  // ── 6. Script Properties (read-only — credentials stay manual) ───────
  const sinCredenciales = [];
  if (!props.getProperty('USUARIO')) sinCredenciales.push('USUARIO');
  if (!props.getProperty('CLAVE')) sinCredenciales.push('CLAVE');
  pasos.push({
    paso: 'propiedades',
    ok: sinCredenciales.length === 0,
    detalle:
      sinCredenciales.length === 0
        ? 'USUARIO y CLAVE guardadas (valores no se muestran)'
        : 'Faltan: ' + sinCredenciales.join(', '),
  });
  if (sinCredenciales.length > 0) {
    pendientes.push(
      'Falta ' + sinCredenciales.join(' y ') + ' en Propiedades del script — el login ' +
        'devolverá credenciales_invalidas hasta que las guardes (guardarCredenciales()).',
    );
  }

  return cerrarReporte(pasos, pendientes);
}

/**
 * Pure schema audit of HOJAS — no spreadsheet access, safe to call anywhere.
 * Returns one message per problem; empty array = consistent.
 * @return {Array<string>}
 */
function auditarEsquema() {
  const problemas = [];
  const hojasVistas = {};

  for (let i = 0; i < HOJAS.length; i++) {
    const def = HOJAS[i];

    if (!def.nombre) {
      problemas.push('HOJAS[' + i + '] sin nombre');
      continue;
    }
    if (hojasVistas[def.nombre]) problemas.push('hoja duplicada en HOJAS: ' + def.nombre);
    hojasVistas[def.nombre] = true;

    if (!def.columnas || def.columnas.length === 0) {
      problemas.push(def.nombre + ': sin columnas');
      continue;
    }

    const vistas = {};
    for (let c = 0; c < def.columnas.length; c++) {
      const col = def.columnas[c];
      const enc = col.encabezado;
      if (!enc) {
        problemas.push(def.nombre + ': columna[' + c + '] sin encabezado');
        continue;
      }
      if (vistas[enc]) problemas.push(def.nombre + ': encabezado duplicado en el esquema → ' + enc);
      vistas[enc] = true;
      if (!FORMATO_COLUMNA[col.tipo]) {
        problemas.push(def.nombre + '.' + enc + ': tipo desconocido "' + col.tipo + '"');
      }
    }
  }

  return problemas;
}

/**
 * Read-only verification of every sheet AGAINST the schema: missing headers,
 * duplicated headers in row 1, and header ORDER for the positional sheets.
 * This is what a rerun of crearHojas() can NOT detect by itself.
 * @return {{ok: boolean, detalle: Array<string>, pendientes: Array<string>}}
 */
function verificarEstado() {
  const libro = obtenerLibro();
  const detalle = [];
  const pendientes = [];

  for (let i = 0; i < HOJAS.length; i++) {
    const def = HOJAS[i];
    const info = inspeccionarHoja(libro, def);
    const marca = def.nombre + ': ';

    if (!info.existe) {
      pendientes.push(marca + 'no existe');
      detalle.push(marca + 'FALTA');
      continue;
    }
    if (info.fila1NoEsEncabezado) {
      pendientes.push(marca + 'la fila 1 no es un encabezado — mirala a mano');
      detalle.push(marca + 'FILA1_NO_ES_ENCABEZADO');
      continue;
    }
    // Duplicates FIRST: a repeated header eats one of the expected columns,
    // so the "missing column" check would fire first and hide the real cause.
    // Header-name lookup always resolves to the FIRST occurrence and turns
    // the rest into dead columns — silent corruption.
    const problemas = [];
    if (info.encabezadosDuplicados.length > 0) {
      problemas.push(
        marca + 'encabezado repetido en la fila 1 → ' + info.encabezadosDuplicados.join(', ') +
          ' (borrá la columna repetida a mano)',
      );
      detalle.push(marca + 'DUPLICADO ' + info.encabezadosDuplicados.join(', '));
    }
    if (info.faltantes.length > 0) {
      problemas.push(marca + 'faltan columnas → ' + info.faltantes.join(', '));
      if (info.encabezadosDuplicados.length === 0) {
        detalle.push(marca + 'FALTAN ' + info.faltantes.join(', '));
      }
    }
    if (problemas.length > 0) {
      for (let p = 0; p < problemas.length; p++) pendientes.push(problemas[p]);
      continue;
    }

    // Positional contract: order IS the schema (Ventas, Sesiones).
    if (def.posicional) {
      const esperados = def.columnas.map(function (col) {
        return col.encabezado;
      });
      const actuales = info.encabezadosActuales.slice(0, esperados.length);
      const desalineados = [];
      for (let e = 0; e < esperados.length; e++) {
        if (actuales[e] !== esperados[e]) {
          desalineados.push('pos ' + (e + 1) + ': esperado "' + esperados[e] + '", hay "' + (actuales[e] || '') + '"');
        }
      }
      if (desalineados.length > 0) {
        pendientes.push(
          marca + 'el orden de los encabezados rompe el contrato → ' + desalineados.join('; '),
        );
        detalle.push(marca + 'ORDEN_INCORRECTO');
        continue;
      }
    }

    detalle.push(marca + 'ok' + (info.filasDeDatos ? ' (' + info.filasDeDatos + ' filas)' : ' (vacía)'));
  }

  return { ok: pendientes.length === 0, detalle: detalle, pendientes: pendientes };
}

/**
 * Every global the router (Code.gs) and the setup flow depend on. Checked
 * with `typeof` so a MISSING function is reported instead of throwing.
 * Mirror Code.gs when adding an action — a handler that never got pushed is
 * otherwise only visible as `accion_no_soportada` at runtime.
 * @return {Array<string>} names of the functions that are NOT defined
 */
function faltanFunciones() {
  // `typeof <name>` never throws for an undeclared identifier, so a missing
  // handler is reported instead of blowing up the audit.
  const faltan = [];
  if (typeof doGet !== 'function') faltan.push('doGet');
  if (typeof doPost !== 'function') faltan.push('doPost');
  if (typeof despacharAccion !== 'function') faltan.push('despacharAccion');
  if (typeof manejarLogin !== 'function') faltan.push('manejarLogin');
  if (typeof obtenerProductos !== 'function') faltan.push('obtenerProductos');
  if (typeof productosAdmin !== 'function') faltan.push('productosAdmin');
  if (typeof crearProducto !== 'function') faltan.push('crearProducto');
  if (typeof actualizarProducto !== 'function') faltan.push('actualizarProducto');
  if (typeof obtenerCategorias !== 'function') faltan.push('obtenerCategorias');
  if (typeof crearCategoria !== 'function') faltan.push('crearCategoria');
  if (typeof actualizarCategoria !== 'function') faltan.push('actualizarCategoria');
  if (typeof borrarCategoria !== 'function') faltan.push('borrarCategoria');
  if (typeof obtenerMarcas !== 'function') faltan.push('obtenerMarcas');
  if (typeof crearMarca !== 'function') faltan.push('crearMarca');
  if (typeof actualizarMarca !== 'function') faltan.push('actualizarMarca');
  if (typeof borrarMarca !== 'function') faltan.push('borrarMarca');
  if (typeof registrarVenta !== 'function') faltan.push('registrarVenta');
  if (typeof actualizarStock !== 'function') faltan.push('actualizarStock');
  if (typeof historialVentas !== 'function') faltan.push('historialVentas');
  if (typeof abrirCaja !== 'function') faltan.push('abrirCaja');
  if (typeof cerrarCaja !== 'function') faltan.push('cerrarCaja');
  if (typeof validarToken !== 'function') faltan.push('validarToken');
  if (typeof obtenerLibro !== 'function') faltan.push('obtenerLibro');
  if (typeof respuestaError !== 'function') faltan.push('respuestaError');
  return faltan;
}

/**
 * Fatal schema problems block the run: writing a broken schema is worse
 * than writing nothing. Non-fatal ones (e.g. unknown column type) still get
 * reported but let the sheet work proceed.
 * @param {Array<string>} problemas
 * @return {boolean}
 */
function esquemaBloqueante(problemas) {
  for (let i = 0; i < problemas.length; i++) {
    const p = problemas[i];
    if (p.indexOf('duplicada') !== -1) return true;
    if (p.indexOf('sin encabezado') !== -1) return true;
    if (p.indexOf('sin columnas') !== -1) return true;
    if (p.indexOf('sin nombre') !== -1) return true;
  }
  return false;
}

/**
 * Log + shape the final report of instalarTodo().
 * @param {Array<Object>} pasos
 * @param {Array<string>} pendientes
 * @return {{ok: boolean, pasos: Array<Object>, pendientes: Array<string>}}
 */
function cerrarReporte(pasos, pendientes) {
  const ok = pendientes.length === 0;
  const reporte = { ok: ok, pasos: pasos, pendientes: pendientes };
  Logger.log('instalarTodo → ' + (ok ? 'TODO OK' : 'PENDIENTES') + '\n' + JSON.stringify(reporte, null, 2));
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
 * @return {{hoja: ?GoogleAppsScript.Spreadsheet.Sheet, existe: boolean, faltantes: Array<string>, fila1NoEsEncabezado: boolean, encabezadosActuales: Array<string>, encabezadosDuplicados: Array<string>, filasDeDatos: number}}
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
      encabezadosDuplicados: [],
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
  const vacia = hoja.getLastColumn() === 0 || hoja.getLastRow() === 0;
  const fila1NoEsEncabezado = !vacia && faltantes.length === def.columnas.length;

  // A repeated header in row 1 is silent corruption: header-name lookup
  // (productos.gs, marcas.gs, …) always resolves to the FIRST match, so the
  // later duplicate is unreadable/unwritable. Reported, never auto-fixed —
  // deciding which of two columns holds the real data needs a human.
  const duplicados = [];
  const vistos = {};
  for (let h = 0; h < fila1.length; h++) {
    const nombre = fila1[h];
    if (!nombre) continue;
    if (vistos[nombre] === true) {
      if (duplicados.indexOf(nombre) === -1) duplicados.push(nombre);
    }
    vistos[nombre] = true;
  }

  return {
    hoja: hoja,
    existe: true,
    faltantes: faltantes,
    fila1NoEsEncabezado: fila1NoEsEncabezado,
    encabezadosActuales: fila1,
    encabezadosDuplicados: duplicados,
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
