// Request/response contracts copied literally from the API guide
// (doc/appscriptbase.md §4). The frontend is written against these exact
// shapes — contract changes are made here first (doc/astrobase.md §3.7).

import type { MetodoPago } from '../utils/storage';

// §4.5 — closed union of server error codes; the same strings everywhere.
// categoria_* added by plan-productos-v2 Fase 2 (§4.12–§4.14); marca_* by
// the brand field (same rules, mirrored actions).
export type ErrorCode =
  | 'credenciales_invalidas'
  | 'unauthorized'
  | 'accion_no_soportada'
  | 'payload_invalido'
  | 'error_interno'
  | 'categoria_duplicada'
  | 'categoria_en_uso'
  | 'marca_duplicada'
  | 'marca_en_uso';

// Router actions (§3.2). login carries its own body shape — see PeticionLogin.
// productosAdmin/crearProducto/actualizarProducto added by plan-mejoras-2 Fase 1
// (contracts §4.8–§4.10); abrirCaja/cerrarCaja by Fase 2 (§4.6/§4.7);
// crear/actualizar/borrarCategoria by plan-productos-v2 Fase 2 (§4.12–§4.14);
// crear/actualizar/borrarMarca mirror those for the brand sheet.
export type AccionEscritura =
  | 'registrarVenta'
  | 'actualizarStock'
  | 'productosAdmin'
  | 'crearProducto'
  | 'actualizarProducto'
  | 'abrirCaja'
  | 'cerrarCaja'
  | 'crearCategoria'
  | 'actualizarCategoria'
  | 'borrarCategoria'
  | 'crearMarca'
  | 'actualizarMarca'
  | 'borrarMarca';
export type AccionLectura = 'productos' | 'categorias' | 'marcas';
// Reads that REQUIRE a token (§4.15). They travel over POST — the token
// never goes in a query string (appscriptbase.md §5.3) — so they are a
// separate union instead of a GET read, and `llamarApi` accepts both.
export type AccionLecturaProtegida = 'historialVentas';
export type AccionPost = AccionEscritura | AccionLecturaProtegida;

// §4.1 GET ?action=productos — public catalog read, light fields only.
export interface ProductoApi {
  id: string;
  nombre: string;
  precio: number;
  categoria: string;
  marca: string;
  stock: number;
  imagen_url: string;
}

export interface RespuestaProductos {
  ok: true;
  productos: ProductoApi[];
}

// §4.2 POST action=login — usuario/clave at TOP level, no token, no data
// wrapper (literal request shape; the rest of the actions use PeticionXxx).
export interface PeticionLogin {
  action: 'login';
  usuario: string;
  clave: string;
}

export interface RespuestaLoginOk {
  ok: true;
  token: string;
  expira: string;
}

export interface RespuestaError {
  ok: false;
  error: ErrorCode;
}

// §4.3 POST action=registrarVenta — wire items carry NO `nombre` (the local
// historial snapshot in utils/storage.ts does; these are different shapes).
export interface ItemVentaApi {
  id: string;
  cantidad: number;
  precio: number;
}

export interface DatosRegistrarVenta {
  id_venta: string;
  items: ItemVentaApi[];
  total: number;
  metodo_pago: MetodoPago;
}

export interface PeticionRegistrarVenta {
  action: 'registrarVenta';
  token: string | null;
  data: DatosRegistrarVenta;
}

export interface RespuestaOk {
  ok: true;
}

// §4.15 POST action=historialVentas — the Sheet's sales log. Rows carry the
// ids-only wire items (§4.3) plus `nombre`, resolved server-side from the
// Productos sheet so a receipt from another device renders real names.
// `fecha_hora` is an ISO string of the SERVER's arrival time — see
// utils/historial-sync.ts: the client keeps its own timestamp when it has
// one, otherwise a queued sale would jump to its sync day.
export interface ItemVentaServidor {
  id: string;
  cantidad: number;
  precio: number;
  nombre: string;
}

export interface VentaServidor {
  fecha_hora: string;
  id_venta: string;
  items: ItemVentaServidor[];
  total: number;
  metodo_pago: string; // untrusted on purpose — validated at merge time (§4.5)
}

export interface RespuestaHistorialVentas {
  ok: true;
  ventas: VentaServidor[];
}

// §4.4 POST action=actualizarStock — `advertencia` appears only when the
// server had to clamp a would-be negative stock down to 0 (§4.4).
export interface DatosActualizarStock {
  id: string;
  cantidadVendida: number;
}

export interface PeticionActualizarStock {
  action: 'actualizarStock';
  token: string | null;
  data: DatosActualizarStock;
}

export interface RespuestaActualizarStock {
  ok: true;
  stockRestante: number;
  advertencia?: 'stock_insuficiente_ajustado_a_cero';
}

// §4.6 POST action=abrirCaja — id_caja comes from the CLIENT (same offline
// reason as id_venta: the opening is saved locally first and may be
// enqueued). fecha_día is the device-local day, the only client-side date in
// the contract. Accented wire key on purpose — literal §4.6 mirror.
export interface DatosAbrirCaja {
  id_caja: string;
  fecha_día: string;
  monto_apertura: number;
}

export interface PeticionAbrirCaja {
  action: 'abrirCaja';
  token: string | null;
  data: DatosAbrirCaja;
}

// §4.7 POST action=cerrarCaja — upsert by id_caja (queue-retry idempotent).
// Totals are a SNAPSHOT the client computed over its LOCAL historial of
// fecha_día; the server stores it as-is (§4.7). diferencia may be negative.
export interface DatosCerrarCaja {
  id_caja: string;
  conteo_cierre: number;
  efectivo_ventas: number;
  tarjeta_ventas: number;
  yape_plin_ventas: number;
  n_ventas: number;
  diferencia: number;
}

export interface PeticionCerrarCaja {
  action: 'cerrarCaja';
  token: string | null;
  data: DatosCerrarCaja;
}

// §4.8 POST action=productosAdmin — admin catalog read: EVERYTHING, including
// activo: false (the public §4.1 read filters those out on purpose).
export interface ProductoAdmin extends ProductoApi {
  activo: boolean;
}

export interface PeticionProductosAdmin {
  action: 'productosAdmin';
  token: string | null;
  data: Record<string, never>;
}

export interface RespuestaProductosAdmin {
  ok: true;
  productos: ProductoAdmin[];
}

// §4.9 POST action=crearProducto — the server answers with the generated id.
// `marca` is OPTIONAL on the wire: the sheet may not carry the column yet and
// older clients never send it (server defaults it to '').
export interface DatosCrearProducto {
  nombre: string;
  categoria: string;
  precio: number;
  stock: number;
  imagen_url?: string;
  marca?: string;
}

export interface PeticionCrearProducto {
  action: 'crearProducto';
  token: string | null;
  data: DatosCrearProducto;
}

export interface RespuestaCrearProducto {
  ok: true;
  id: string;
}

// §4.10 POST action=actualizarProducto — partial update by id. The logical
// "delete" (baja) is THIS action with activo: false — no delete action exists
// (plan-mejoras-2.md D2, soft delete).
export interface DatosActualizarProducto {
  id: string;
  nombre?: string;
  categoria?: string;
  precio?: number;
  stock?: number;
  imagen_url?: string;
  activo?: boolean;
  marca?: string;
}

export interface PeticionActualizarProducto {
  action: 'actualizarProducto';
  token: string | null;
  data: DatosActualizarProducto;
}

// ── Categorías (plan-productos-v2.md Fase 2, contracts §4.11–§4.14) ──────

// §4.11 GET ?action=categorias — public light read that feeds the product
// form's <select> (D2). Sorted server-side by name.
export interface CategoriaApi {
  id: string;
  nombre: string;
}

export interface RespuestaCategorias {
  ok: true;
  categorias: CategoriaApi[];
}

// §4.12 POST action=crearCategoria — server answers with the generated id.
export interface DatosCrearCategoria {
  nombre: string;
}

export interface PeticionCrearCategoria {
  action: 'crearCategoria';
  token: string | null;
  data: DatosCrearCategoria;
}

export interface RespuestaCrearCategoria {
  ok: true;
  id: string;
}

// §4.13 POST action=actualizarCategoria — rename by id; the server cascades
// the change to every product that used the old name (same lock).
export interface DatosActualizarCategoria {
  id: string;
  nombre: string;
}

export interface PeticionActualizarCategoria {
  action: 'actualizarCategoria';
  token: string | null;
  data: DatosActualizarCategoria;
}

// §4.14 POST action=borrarCategoria — rejected with categoria_en_uso when
// any product still references the name (sheet-side guard, no soft delete).
export interface DatosBorrarCategoria {
  id: string;
}

export interface PeticionBorrarCategoria {
  action: 'borrarCategoria';
  token: string | null;
  data: DatosBorrarCategoria;
}

// ── Marcas (mirror of the categorías contracts, same shape and rules) ──────

// GET ?action=marcas — public light read that feeds the product form's
// <select>. Sorted server-side by name.
export interface MarcaApi {
  id: string;
  nombre: string;
}

export interface RespuestaMarcas {
  ok: true;
  marcas: MarcaApi[];
}

// POST action=crearMarca — server answers with the generated id.
export interface DatosCrearMarca {
  nombre: string;
}

export interface PeticionCrearMarca {
  action: 'crearMarca';
  token: string | null;
  data: DatosCrearMarca;
}

export interface RespuestaCrearMarca {
  ok: true;
  id: string;
}

// POST action=actualizarMarca — rename by id; the server cascades the change
// to every product that used the old name (same lock as categorías).
export interface DatosActualizarMarca {
  id: string;
  nombre: string;
}

export interface PeticionActualizarMarca {
  action: 'actualizarMarca';
  token: string | null;
  data: DatosActualizarMarca;
}

// POST action=borrarMarca — rejected with marca_en_uso when any product still
// references the name (sheet-side guard, no soft delete).
export interface DatosBorrarMarca {
  id: string;
}

export interface PeticionBorrarMarca {
  action: 'borrarMarca';
  token: string | null;
  data: DatosBorrarMarca;
}
