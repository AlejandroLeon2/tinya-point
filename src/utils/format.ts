// Currency, date and number formatting — prices always 2 decimals with the
// configured currency symbol (doc/astrobase.md §3.5; symbol from
// `ajustes.moneda`, default S/ — plan-productos-v2.md Fase 5).

import { getAjustes } from './storage';

// Dot decimal separator on purpose: the documented examples are "S/ 12.00"
// and "S/ 3.50" (doc/stilesbase.md, doc/appscriptbase.md §4.1).
export function formatCurrency(amount: number): string {
  return `${getAjustes().moneda} ${amount.toFixed(2)}`;
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

// 'YYYY-MM-DD' → 'Mié 23 sep' — legible day-summary heading (refactorUI
// §6.1, plan T3.5). Manual tables instead of Intl: es-PE short forms vary
// per runtime ("mié, 23 sept" with a comma) and the spec copy is exact.
// new Date(y, m-1, d) is device-local, so no UTC day-shift (same rule as
// localDayKey).
const DIAS_CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function formatDiaResumen(fechaDia: string): string {
  const [anio, mes, dia] = fechaDia.split('-').map(Number);
  if (!anio || !mes || !dia) return fechaDia;
  const date = new Date(anio, mes - 1, dia);
  // Reject rolled-over dates (e.g. 2026-13-01 → Jan 2027).
  if (Number.isNaN(date.getTime()) || date.getMonth() !== mes - 1) return fechaDia;
  return `${DIAS_CORTOS[date.getDay()]} ${dia} ${MESES_CORTOS[mes - 1]}`;
}

// "3 h 20 min" — elapsed since an ISO timestamp, minute precision
// (refactorUI §5, plan T3.7: caja header pill "desde 08:12 (hace 3 h 20
// min)"). Device-local now, clamped at 0 for future timestamps.
export function formatTranscurrido(iso: string): string {
  const desde = new Date(iso);
  if (Number.isNaN(desde.getTime())) return '';
  const minutos = Math.max(0, Math.floor((Date.now() - desde.getTime()) / 60_000));
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  if (horas === 0) return `${resto} min`;
  return `${horas} h ${resto} min`;
}
