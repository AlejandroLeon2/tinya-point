// Web App entry points doGet/doPost + internal action router
// (doc/appscriptbase.md §3.1–3.2), versioned here for clasp push/pull
// (doc/astrobase.md §3.7). Parse, validate shape, delegate — NEVER business
// logic inline; every path returns JSON, never an Apps Script HTML error
// page (that would break the client's JSON.parse — §6).

/**
 * Public reads. ?action=productos, ?action=categorias and ?action=marcas
 * (no token), per §3.1/§4.1/§4.11.
 * @param {{parameter: Object}} e
 * @return {GoogleAppsScript.ContentService.TextOutput}
 */
function doGet(e) {
  try {
    const action = e && e.parameter ? String(e.parameter.action || '') : '';
    if (action === 'productos') {
      return respuestaJson(obtenerProductos());
    }
    if (action === 'categorias') {
      return respuestaJson(obtenerCategorias());
    }
    if (action === 'marcas') {
      return respuestaJson(obtenerMarcas());
    }
    return respuestaJson(respuestaError('accion_no_soportada', 'doGet: ' + action));
  } catch (err) {
    return respuestaJson(respuestaError('error_interno', 'doGet: ' + err));
  }
}

/**
 * Single entry point for login and writes. Reads e.postData.contents as the
 * plain-text body the client sends (text/plain avoids the CORS preflight —
 * §1/§5.1), parses it, and delegates to despacharAccion.
 * @param {{postData: {contents: string}}} e
 * @return {GoogleAppsScript.ContentService.TextOutput}
 */
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (!body || typeof body.action !== 'string' || body.action === '') {
      return respuestaJson(respuestaError('payload_invalido', 'doPost: missing action'));
    }
    return respuestaJson(despacharAccion(body.action, body));
  } catch (err) {
    return respuestaJson(respuestaError('error_interno', 'doPost: ' + err));
  }
}

/**
 * action → handler map (§3.2). Unknown action → accion_no_soportada.
 * @param {string} action
 * @param {Object} body parsed request body
 * @return {Object} plain response object
 */
function despacharAccion(action, body) {
  switch (action) {
    case 'login':
      return manejarLogin(body.usuario, body.clave);
    case 'registrarVenta':
      return registrarVenta(body.token, body.data);
    case 'actualizarStock':
      return actualizarStock(body.token, body.data);
    // §4.15 — token-gated READ of the sales log. Reads travel over POST so
    // the token never lands in a query string (§5.3); the client merges the
    // result into its local historial instead of replacing it.
    case 'historialVentas':
      return historialVentas(body.token, body.data);
    // plan-mejoras-2.md Fase 1 — admin catalog (contracts §4.8–§4.10).
    case 'productosAdmin':
      return productosAdmin(body.token, body.data);
    case 'crearProducto':
      return crearProducto(body.token, body.data);
    case 'actualizarProducto':
      return actualizarProducto(body.token, body.data);
    // plan-mejoras-2.md Fase 2 — caja (contracts §4.6/§4.7).
    case 'abrirCaja':
      return abrirCaja(body.token, body.data);
    case 'cerrarCaja':
      return cerrarCaja(body.token, body.data);
    // plan-productos-v2.md Fase 2 — categorías (contracts §4.12–§4.14).
    case 'crearCategoria':
      return crearCategoria(body.token, body.data);
    case 'actualizarCategoria':
      return actualizarCategoria(body.token, body.data);
    case 'borrarCategoria':
      return borrarCategoria(body.token, body.data);
    // Brand CRUD — mirror of the categorías block (marcas.gs).
    case 'crearMarca':
      return crearMarca(body.token, body.data);
    case 'actualizarMarca':
      return actualizarMarca(body.token, body.data);
    case 'borrarMarca':
      return borrarMarca(body.token, body.data);
    default:
      return respuestaError('accion_no_soportada', 'despacharAccion: ' + action);
  }
}
