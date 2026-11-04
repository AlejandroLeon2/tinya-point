// Presentations, price tiers and product attributes — the domain shape of
// product.md. Shared by the product form island (UI validation), the wire
// mirror in api/actions/productos.ts and the POS card (quantity label).
// Sheet storage: JSON text in the optional `presentaciones` / `atributos`
// columns (header-driven, same leniency as every other optional column).

export interface RangoPrecio {
  // Minimum quantity of THAT presentation to unlock the tier price
  // (precio por presentación, no por unidad individual — product.md).
  minQty: number;
  price: number;
}

export interface Presentacion {
  id?: string;
  name: string;
  units: number;
  sku?: string;
  priceTiers: RangoPrecio[];
}

export type AtributosProducto = Record<string, string>;

const MAX_PRESENTACIONES = 20;
const MAX_TIERES = 50;
const MAX_ATRIBUTOS = 20;

/** Wire/server mirror: one price tier with a positive integer minQty and price. */
export function esRangoPrecio(valor: unknown): valor is RangoPrecio {
  if (typeof valor !== 'object' || valor === null) return false;
  const r = valor as RangoPrecio;
  return (
    Number.isInteger(r.minQty) &&
    r.minQty >= 1 &&
    typeof r.price === 'number' &&
    Number.isFinite(r.price) &&
    r.price > 0
  );
}

/** Wire/server mirror: one presentation with at least one valid tier. */
export function esPresentacion(valor: unknown): valor is Presentacion {
  if (typeof valor !== 'object' || valor === null) return false;
  const p = valor as Presentacion;
  if (typeof p.name !== 'string' || p.name.trim() === '' || p.name.length > 64) return false;
  if (!Number.isInteger(p.units) || p.units < 1) return false;
  if (p.sku !== undefined && (typeof p.sku !== 'string' || p.sku.length > 64)) return false;
  if (p.id !== undefined && typeof p.id !== 'string') return false;
  if (!Array.isArray(p.priceTiers) || p.priceTiers.length < 1) return false;
  if (p.priceTiers.length > MAX_TIERES) return false;
  if (!p.priceTiers.every(esRangoPrecio)) return false;
  const minimos = p.priceTiers.map((t) => t.minQty);
  // No duplicate minima + the lowest tier always starts at quantity 1.
  if (new Set(minimos).size !== minimos.length) return false;
  if (Math.min(...minimos) !== 1) return false;
  return true;
}

export function esPresentacionesValido(valor: unknown): valor is Presentacion[] {
  return (
    Array.isArray(valor) &&
    valor.length <= MAX_PRESENTACIONES &&
    valor.every(esPresentacion)
  );
}

export function esAtributosValidos(valor: unknown): valor is AtributosProducto {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) return false;
  const entradas = Object.entries(valor);
  if (entradas.length > MAX_ATRIBUTOS) return false;
  return entradas.every(
    ([clave, v]) =>
      typeof clave === 'string' &&
      clave.trim() !== '' &&
      clave.length <= 64 &&
      typeof v === 'string' &&
      v.length <= 128,
  );
}

/** Ascending minQty — the table always reads bottom-of-range first. */
export function ordenarTiers(tiers: RangoPrecio[]): RangoPrecio[] {
  return [...tiers].sort((a, b) => a.minQty - b.minQty);
}

/** Client-side presentation id (server keeps it as-is inside the JSON). */
export function nuevaPresentacionId(): string {
  return `pres_${crypto.randomUUID()}`;
}

/**
 * Small quantity label for the POS card: "1 unidad" for a single unit,
 * otherwise the presentation name ("Paquete x12") or a units fallback.
 */
export function etiquetaCantidad(p: Presentacion): string {
  if (p.units === 1) return '1 unidad';
  const nombre = (p.name ?? '').trim();
  return nombre !== '' ? nombre : `${p.units} unidades`;
}

/** One selectable presentation pill on the POS card. */
export interface OpcionPresentacion {
  // Pill copy: the presentation name ("Unidad", "Paquete x12").
  label: string;
  // Base units the presentation represents — 12 for a x12 pack.
  units: number;
  // Price of ONE presentation (its cheapest tier, i.e. the quantity-1 tier).
  price: number;
}

/**
 * The presentation options a POS card offers, in sale order: the product's
 * own presentations plus the guaranteed base "Unidad" (the product's precio)
 * when none of them is a single unit. A product without presentations still
 * offers exactly that base option, so the card always shows its pill.
 */
export function opcionesPresentacion(
  precioBase: number,
  presentaciones?: Presentacion[],
): OpcionPresentacion[] {
  const opciones: OpcionPresentacion[] = [];
  for (const presentacion of presentaciones ?? []) {
    const precio = ordenarTiers(presentacion.priceTiers ?? [])[0]?.price;
    if (typeof precio !== 'number' || !Number.isFinite(precio) || precio <= 0) continue;
    opciones.push({
      label: (presentacion.name ?? '').trim() || etiquetaCantidad(presentacion),
      units: presentacion.units,
      price: precio,
    });
  }
  if (!opciones.some((opcion) => opcion.units === 1)) {
    opciones.unshift({ label: 'Unidad', units: 1, price: precioBase });
  }
  return opciones;
}

const ATRIBUTOS_PERMITIDOS = ['Tamaño', 'Sabor', 'Envase'] as const;

function normalizarClaveAtributo(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/** Canonical key for one of the three product attributes exposed in the form. */
export function claveAtributoPermitida(valor: string): string | null {
  const claveNormalizada = normalizarClaveAtributo(valor.trim());
  return (
    ATRIBUTOS_PERMITIDOS.find((clave) => normalizarClaveAtributo(clave) === claveNormalizada) ??
    null
  );
}

/** Fixed attribute suggestions shown by the product form. */
export function sugerenciasAtributos(_categoria: string): string[] {
  return [...ATRIBUTOS_PERMITIDOS];
}
