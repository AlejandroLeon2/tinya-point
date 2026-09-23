// Login + session tokens (doc/appscriptbase.md §3.3; doc/base.md §3).
// The real credentials live ONLY in Script Properties — never here, never in
// the Sheet, never in a response (§6).

var SESION_DURACION_HORAS = 12;

/**
 * Compare usuario/clave against Script Properties. The SAME generic error is
 * returned for any mismatch — no hints about which field failed (§3.3).
 * @param {string} usuario
 * @param {string} clave
 * @return {Object} { ok:true, token, expira } or { ok:false, error }
 */
function manejarLogin(usuario, clave) {
  if (!usuario || !clave) {
    return respuestaError('payload_invalido', 'manejarLogin: empty fields');
  }

  const props = PropertiesService.getScriptProperties();
  const usuarioOk = props.getProperty('USUARIO');
  const claveOk = props.getProperty('CLAVE');
  if (!usuarioOk || !claveOk || usuario !== usuarioOk || clave !== claveOk) {
    return respuestaError('credenciales_invalidas', 'manejarLogin: mismatch');
  }

  return crearSesion();
}

/**
 * Generate a UUID session expiring in +12h and append it to "Sesiones".
 * Locked: appending a row is a write (§1 lists login among the locked
 * writes). fecha values come from the server clock, never the client.
 * @return {Object} { ok:true, token, expira }
 */
function crearSesion() {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const token = Utilities.getUuid();
    const ahora = new Date();
    const expira = new Date(ahora.getTime() + SESION_DURACION_HORAS * 60 * 60 * 1000);
    obtenerLibro()
      .getSheetByName('Sesiones')
      .appendRow([token, ahora, expira]);
    return { ok: true, token: token, expira: expira.toISOString() };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Look up the token in "Sesiones" WHILE opportunistically deleting expired
 * rows in the SAME pass — limpiarSesionesVencidas lives here, never as a
 * separate full sweep (§3.3: cheap, no extra execution time).
 * Collected expired rows are deleted from the bottom up so row numbers
 * never shift underneath the pending deletions; deletion is a write, so it
 * runs under LockService.
 * @param {string} token
 * @return {{valido: boolean, motivo?: string}} motivo: no_encontrado | expirado
 */
function validarToken(token) {
  if (!token || typeof token !== 'string') {
    return { valido: false, motivo: 'no_encontrado' };
  }

  const hoja = obtenerLibro().getSheetByName('Sesiones');
  const datos = hoja.getDataRange().getValues();
  const ahora = new Date();
  const vencidas = []; // 1-based row numbers, collected bottom-up (descending)
  let encontrado = false;
  let valido = false;

  for (let i = datos.length - 1; i >= 1; i--) {
    const fila = datos[i];
    if (fila[0] === '') continue;

    const expira = fila[2];
    const estaVencida = !(expira instanceof Date) || expira.getTime() < ahora.getTime();

    if (fila[0] === token) encontrado = true;

    if (estaVencida) {
      vencidas.push(i + 1);
      if (fila[0] === token) valido = false;
    } else if (fila[0] === token) {
      valido = true;
    }
  }

  if (vencidas.length > 0) {
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      for (let j = 0; j < vencidas.length; j++) {
        hoja.deleteRow(vencidas[j]);
      }
    } finally {
      lock.releaseLock();
    }
  }

  if (valido) return { valido: true };
  return { valido: false, motivo: encontrado ? 'expirado' : 'no_encontrado' };
}
