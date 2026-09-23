// The only module that knows localStorage key names and exposes one
// getter/setter per key (doc/astrobase.md §3.5; keys from doc/base.md
// §2.3/§3, plus §2.4 for `cajas`).

// Fixed data contract — Spanish key names on purpose (doc/extras.md §7).
const KEY_CATALOGO_CACHE = 'catalogo_cache';
const KEY_CARRITO_ACTUAL = 'carrito_actual';
const KEY_HISTORIAL_VENTAS = 'historial_ventas';
const KEY_COLA_SYNC = 'cola_sync';
// Documented deviation: doc/base.md §2.3 lists 4 operational keys, but §3
// mandates the session token in localStorage — this is the 5th key, owned here.
const KEY_SESION_TOKEN = 'sesion_token';
// 6th key (plan-mejoras-2.md Fase 2): operational source of truth for caja
// sessions; the "Cajas" Sheet row is the backup (base.md §2.4).
const KEY_CAJAS = 'cajas';
// 7th key (plan-productos-v2.md Fase 5, D4): app settings — business data
// (nombre/moneda) + the configurable IGV rate (base.md §7). Single-device
// settings, same localStorage source as the rest of the operational state.
const KEY_AJUSTES = 'ajustes';

// Local domain types — this layer must not depend on src/api/ (Dependency
// Inversion: stores/utils sit below the wire contract, not beside it).
export interface Producto {
  id: string;
  nombre: string;
  categoria: string;
  precio: number;
  stock: number;
  imagen_url?: string;
}

export interface CatalogoCache {
  productos: Producto[];
  timestamp: number; // epoch ms of last sync — freshness = now - timestamp < TTL_CATALOGO_MS
}

export interface ItemCarrito {
  id: string;
  nombre: string;
  precio: number;
  cantidad: number;
  imagen_url?: string;
}

export interface ItemVenta {
  id: string;
  nombre: string;
  cantidad: number;
  precio: number;
}

export type MetodoPago = 'efectivo' | 'tarjeta' | 'yape-plin';

export interface VentaLocal {
  id_venta: string;
  fecha_hora: string; // ISO datetime
  items: ItemVenta[];
  // Optional since plan-mejoras-2 Fase 3: local-only snapshot for the detail
  // page — NEVER part of the wire contract nor the Sheet. Older sales lack
  // it and render without the subtotal row, no migration (gotcha G9).
  subtotal?: number;
  total: number;
  metodo_pago: MetodoPago;
}

// One caja session (plan-mejoras-2 Fase 2). `fecha_dia` is ASCII on purpose:
// the accented `fecha_día` key exists only on the WIRE (§4.6) — local
// identifiers stay JS-safe (Spanish without accents is fine, extras.md §7).
export interface CajaLocal {
  id_caja: string; // client-generated uuid — local first, enqueued if offline (§4.6)
  fecha_dia: string; // device-local YYYY-MM-DD — grouping key (base.md §2.4)
  monto_apertura: number;
  estado: 'abierta' | 'cerrada';
  fecha_hora_apertura: string; // ISO, local write time; server timestamp on sync
  fecha_hora_cierre?: string; // ISO, set at close
  // Snapshot fields computed from the LOCAL historial of fecha_dia at close —
  // never recalculated afterwards (base.md §2.4, same rule as venta snapshots).
  conteo_cierre?: number;
  efectivo_ventas?: number;
  tarjeta_ventas?: number;
  yape_plin_ventas?: number;
  n_ventas?: number;
  diferencia?: number; // conteo_cierre − (monto_apertura + efectivo_ventas), 2 decimals
}

export type EstadoColaSync = 'pendiente' | 'enviando' | 'sincronizado' | 'error_permanente';

export interface ItemColaSync {
  id: string;
  // abrirCaja/cerrarCaja added by plan-mejoras-2 Fase 2 (offline-first caja).
  tipo: 'registrarVenta' | 'actualizarStock' | 'abrirCaja' | 'cerrarCaja';
  payload: Record<string, unknown>;
  estado: EstadoColaSync;
  intentos: number;
  ultimo_intento: string | null;
  creado: string; // ISO datetime
}

// Catalog TTL (doc/base.md §6): fresh for 15 minutes after last sync.
export const TTL_CATALOGO_MS = 15 * 60 * 1000;

// These functions can be reached from frontmatter at BUILD time, where
// localStorage does not exist — guard instead of crashing the build.
const hasStorage = (): boolean => typeof localStorage !== 'undefined';

function read<T>(key: string, fallback: T): T {
  if (!hasStorage()) return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    // Corrupted payload must never crash the app — treat it as absent.
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  if (!hasStorage()) return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota exceeded / private mode: fail soft. A sale never crashes on storage.
  }
}

function remove(key: string): void {
  if (!hasStorage()) return;
  try {
    localStorage.removeItem(key);
  } catch {
    // Same fail-soft policy as write.
  }
}

export function getCatalogoCache(): CatalogoCache | null {
  return read<CatalogoCache | null>(KEY_CATALOGO_CACHE, null);
}

export function setCatalogoCache(cache: CatalogoCache): void {
  write(KEY_CATALOGO_CACHE, cache);
}

export function getCarritoActual(): ItemCarrito[] {
  return read<ItemCarrito[]>(KEY_CARRITO_ACTUAL, []);
}

export function setCarritoActual(items: ItemCarrito[]): void {
  write(KEY_CARRITO_ACTUAL, items);
}

export function getHistorialVentas(): VentaLocal[] {
  return read<VentaLocal[]>(KEY_HISTORIAL_VENTAS, []);
}

export function setHistorialVentas(ventas: VentaLocal[]): void {
  write(KEY_HISTORIAL_VENTAS, ventas);
}

export function getColaSync(): ItemColaSync[] {
  return read<ItemColaSync[]>(KEY_COLA_SYNC, []);
}

export function setColaSync(items: ItemColaSync[]): void {
  write(KEY_COLA_SYNC, items);
}

export function getToken(): string | null {
  return read<string | null>(KEY_SESION_TOKEN, null);
}

export function setToken(token: string | null): void {
  if (token === null) {
    remove(KEY_SESION_TOKEN);
    return;
  }
  write(KEY_SESION_TOKEN, token);
}

export function getCajas(): CajaLocal[] {
  return read<CajaLocal[]>(KEY_CAJAS, []);
}

export function setCajas(cajas: CajaLocal[]): void {
  write(KEY_CAJAS, cajas);
}

// ── Ajustes (plan-productos-v2.md Fase 5, D4) ────────────────────────────

// igv_tasa travels in PERCENTAGE POINTS (18 = 18%) — tax.ts converts to the
// fraction at use time; wire/local identifiers stay simple numbers.
export interface Ajustes {
  nombre_local: string;
  moneda: string; // symbol prefix shown by formatCurrency
  igv_tasa: number; // 0–100, default 18
}

export const AJUSTES_DEFAULT: Ajustes = {
  nombre_local: '',
  moneda: 'S/',
  igv_tasa: 18,
};

// Field-wise validation: a partially corrupted payload degrades per field
// instead of resetting everything (same fail-soft policy as read()).
export function getAjustes(): Ajustes {
  const crudo = read<Partial<Ajustes> | null>(KEY_AJUSTES, null);
  if (!crudo || typeof crudo !== 'object') return { ...AJUSTES_DEFAULT };
  return {
    nombre_local:
      typeof crudo.nombre_local === 'string'
        ? crudo.nombre_local
        : AJUSTES_DEFAULT.nombre_local,
    moneda:
      typeof crudo.moneda === 'string' && crudo.moneda.trim() !== ''
        ? crudo.moneda.trim()
        : AJUSTES_DEFAULT.moneda,
    igv_tasa:
      typeof crudo.igv_tasa === 'number' &&
      Number.isFinite(crudo.igv_tasa) &&
      crudo.igv_tasa >= 0 &&
      crudo.igv_tasa <= 100
        ? crudo.igv_tasa
        : AJUSTES_DEFAULT.igv_tasa,
  };
}

export function setAjustes(ajustes: Ajustes): void {
  write(KEY_AJUSTES, ajustes);
}
