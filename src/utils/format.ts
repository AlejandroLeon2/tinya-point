// Currency, date and number formatting — prices always 2 decimals with S/
// (doc/astrobase.md §3.5).

// Dot decimal separator on purpose: the documented examples are "S/ 12.00"
// and "S/ 3.50" (doc/stilesbase.md, doc/appscriptbase.md §4.1).
export function formatCurrency(amount: number): string {
  return `S/ ${amount.toFixed(2)}`;
}

export function formatFecha(fecha: string | Date): string {
  const date = typeof fecha === 'string' ? new Date(fecha) : fecha;
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

export function formatNumero(valor: number): string {
  if (!Number.isFinite(valor)) return '0';
  return new Intl.NumberFormat('es-PE').format(valor);
}

// Device-local calendar day YYYY-MM-DD — NEVER UTC (toISOString would shift
// entries across days near midnight). Shared by /historial and /caja
// (plan-mejoras-2 Fase 2 — was private to islands/historial.ts).
export function localDayKey(fecha: string | Date): string {
  const date = typeof fecha === 'string' ? new Date(fecha) : fecha;
  if (Number.isNaN(date.getTime())) return '';
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

// HH:MM (24h) for the caja summary — device-local, consistent with
// localDayKey (plan-mejoras-2 Fase 2).
export function formatHora(fecha: string | Date): string {
  const date = typeof fecha === 'string' ? new Date(fecha) : fecha;
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('es-PE', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

// 'YYYY-MM-DD' → 'DD/MM/YYYY' WITHOUT new Date(): a date-only string is
// parsed as UTC midnight and would render the previous day west of
// Greenwich. Shared by /historial day groups and /caja (Fase 2/3).
export function formatDia(fechaDia: string): string {
  const [anio, mes, dia] = fechaDia.split('-');
  if (!anio || !mes || !dia) return fechaDia;
  return `${dia}/${mes}/${anio}`;
}
