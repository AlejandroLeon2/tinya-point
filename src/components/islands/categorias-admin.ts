// Categories admin behavior (plan-productos-v2.md Fase 2): list via the
// public GET ?action=categorias (§4.11); in-page create/rename (gotcha G1 —
// /categorias is ONE static page, no query params); delete behind the
// confirm modal (stilesbase §5.5) and SERVER-guarded by categoria_en_uso.
// No cola_sync: category edits are rare admin actions — offline they fail
// loudly with Spanish copy, never queued (the sale path is the only queued
// flow, extras.md §1). Hooks are data-* only (invariant 5); user-entered
// text always goes through textContent; no raw error codes, no auto-retries.
//
// T3.9 (refactorUI §8): per-row product count derived from catalogo_cache
// ONLY (no extra GET; omitted when there is no cache) → the local
// pre-guard on Eliminar (disabled ⇔ count > 0, with "En uso por N
// productos") + the offline note that disables the submit BEFORE the
// round trip ("mejor que fallar después"). Inline rename was NOT adopted —
// Editar keeps the upper-form mode (spec's optional fallback, deviation w).

import {
  actualizarCategoria,
  borrarCategoria,
  crearCategoria,
  getCategorias,
} from '../../api/actions/categorias';
import type { CategoriaApi } from '../../api/types';
import {
  limpiarErroresForm,
  mostrarErrorCampo,
  observarCampo,
} from '../../utils/form-errors';
import { getCatalogoCache } from '../../utils/storage';
import { isNonEmpty } from '../../utils/validators';
import { qs, setText, setHidden, cloneTemplate } from '../../utils/dom';
import { crearFeedback } from '../../utils/feedback';

const root = qs<HTMLElement>(document, '[data-categorias-root]');

if (root) {
  const rowsEl = qs<HTMLElement>(root, '[data-categoria-rows]');
  const template = qs<HTMLTemplateElement>(root, '[data-categoria-row-template]');
  const form = qs<HTMLFormElement>(root, '[data-categoria-form]');
  const formTitle = qs<HTMLElement>(root, '[data-categoria-form-title]');
  const nombreInput = qs<HTMLInputElement>(root, '[data-categoria-nombre]');
  const submitBtn = qs<HTMLButtonElement>(root, '[data-categoria-submit]');
  const cancelBtn = qs<HTMLButtonElement>(root, '[data-categoria-cancel]');
  const confirmDeleteBtn = qs<HTMLButtonElement>(
    root,
    '[data-categoria-confirm-delete]',
  );
  const errorAlert = qs<HTMLElement>(root, '[data-alert="categorias-error"]');
  const errorText = qs<HTMLElement>(root, '[data-categoria-error-text]');
  const emptyState = qs<HTMLElement>(root, '[data-empty-state="empty-categorias"]');
  const offlineNote = qs<HTMLElement>(root, '[data-categoria-offline]');

  let categorias: CategoriaApi[] = [];
  let editingId: string | null = null;
  let pendingDeleteId: string | null = null;
  let enviando = false;
  let enviandoDelete = false;

  const feedback = crearFeedback(errorAlert, errorText);

  function ocultarAlertas(): void {
    feedback.ocultar();
    // Inline field errors die with the alerts: edit/new mode starts clean.
    if (form) limpiarErroresForm(form);
  }

  // Spanish copy per transport outcome / §4.5 code — the code itself never
  // reaches the cashier's eyes (stilesbase §5.7).
  function mensajeDeError(error: string): string {
    switch (error) {
      case 'categoria_duplicada':
        return 'Ya existe una categoría con ese nombre.';
      case 'categoria_en_uso':
        return 'Hay productos usando esta categoría — cambialos o desactivalos antes de borrarla.';
      case 'payload_invalido':
        return 'Revisá el nombre de la categoría.';
      case 'accion_no_soportada':
        return 'El servidor todavía no tiene esta función. Actualizá el despliegue de Apps Script.';
      default:
        return 'No se pudo guardar. Intentá de nuevo.';
    }
  }

  async function cargar(): Promise<void> {
    const res = await getCategorias();
    if (res.status === 'success') {
      categorias = res.body.categorias;
      render();
      return;
    }
    render();
    feedback.error(
      res.status === 'network_failure'
        ? 'No hay conexión y no se pudieron cargar las categorías.'
        : mensajeDeError(res.error),
    );
  }

  function render(): void {
    if (!rowsEl || !template) return;
    qsa(rowsEl, '[data-categoria-row]').forEach((row) => row.remove());

    // Local product tally per category NAME — cache-only, zero network
    // (refactorUI §8). null = no cache → counts omitted, delete stays
    // enabled (only the server knows for sure).
    const cached = getCatalogoCache();
    const porNombre = new Map<string, number>();
    if (cached) {
      for (const p of cached.productos) {
        porNombre.set(p.categoria, (porNombre.get(p.categoria) ?? 0) + 1);
      }
    }

    for (const categoria of categorias) {
      const row = cloneTemplate(template);
      if (!row) continue;
      row.setAttribute('data-categoria-id', categoria.id);

      const nombre = qs<HTMLElement>(row, '[data-categoria-nombre]');
      setText(nombre, categoria.nombre);

      const enUso = cached ? (porNombre.get(categoria.nombre) ?? 0) : null;
      const countEl = qs<HTMLElement>(row, '[data-categoria-count]');
      if (countEl && enUso !== null) {
        setText(countEl, `${enUso} producto${enUso === 1 ? '' : 's'}`);
        setHidden(countEl, false);
      }
      const enUsoEl = qs<HTMLElement>(row, '[data-categoria-en-uso]');
      if (enUsoEl && enUso !== null && enUso > 0) {
        setText(enUsoEl, `En uso por ${enUso} producto${enUso === 1 ? '' : 's'}`);
        setHidden(enUsoEl, false);
      }
      const deleteBtn = qs<HTMLButtonElement>(row, '[data-categoria-delete]');
      if (deleteBtn && enUso !== null) {
        // Local pre-guard; the backend keeps validating (categoria_en_uso).
        // A disabled button never fires click → modal won't open either.
        deleteBtn.disabled = enUso > 0;
      }

      rowsEl.append(row);
    }

    setHidden(emptyState, categorias.length > 0);
  }

  function editarCategoria(id: string): void {
    const categoria = categorias.find((c) => c.id === id);
    if (!categoria) return;
    editingId = id;
    setText(formTitle, 'Renombrar categoría');
    setText(submitBtn, 'Guardar cambios');
    setHidden(cancelBtn, false);
    if (nombreInput) nombreInput.value = categoria.nombre;
    ocultarAlertas();
    nombreInput?.focus();
  }

  function modoNuevo(): void {
    editingId = null;
    form?.reset();
    setText(formTitle, 'Nueva categoría');
    setText(submitBtn, 'Guardar categoría');
    setHidden(cancelBtn, true);
    ocultarAlertas();
  }

  async function guardar(nombre: string): Promise<void> {
    // P0 re-entry guard + pending state (plan-form-ux.md Fase 1, pattern of
    // login-form.ts). Local const so TS narrows string | null in the false
    // branch (editingId itself is a mutable captured binding and won't
    // narrow through the alias).
    if (enviando) return;
    enviando = true;
    const idEditando = editingId;
    const esAlta = idEditando === null;
    const textoOriginal = esAlta ? 'Guardar categoría' : 'Guardar cambios';
    if (submitBtn) {
      submitBtn.disabled = true;
      setText(submitBtn, esAlta ? 'Creando…' : 'Guardando…');
    }

    try {
      const resultado = esAlta
        ? await crearCategoria(nombre)
        : await actualizarCategoria({ id: idEditando, nombre });

      if (resultado.status === 'success') {
        feedback.ok(
          esAlta
            ? 'Categoría creada.'
            : 'Categoría renombrada — los productos que la usan quedaron actualizados.',
        );
        modoNuevo();
        await cargar();
        nombreInput?.focus(); // rapid entry for the next category
        return;
      }
      if (resultado.status === 'network_failure') {
        feedback.error('Sin conexión — no se pudo guardar la categoría.');
        return;
      }
      feedback.error(mensajeDeError(resultado.error));
    } finally {
      enviando = false;
      if (submitBtn) {
        // Offline keeps the button disabled after ANY round trip ends
        // (the note + disabled state travel together).
        submitBtn.disabled = !navigator.onLine;
        setText(submitBtn, textoOriginal);
      }
      // modoNuevo() already reset the label on success; restore the right
      // one for the mode we are actually in after an error.
      if (editingId !== null && submitBtn) setText(submitBtn, 'Guardar cambios');
    }
  }

  async function eliminar(id: string): Promise<void> {
    // P0: a double click on the modal confirm would fire borrarCategoria
    // twice — the second answer is a not-found style api_error for nothing.
    if (enviandoDelete) return;
    enviandoDelete = true;
    try {
      const resultado = await borrarCategoria({ id });
      if (resultado.status === 'success') {
        feedback.ok('Categoría eliminada.');
        await cargar();
        return;
      }
      if (resultado.status === 'network_failure') {
        feedback.error('Sin conexión — no se pudo eliminar la categoría.');
        return;
      }
      feedback.error(mensajeDeError(resultado.error));
    } finally {
      enviandoDelete = false;
    }
  }

  // ── Offline pre-guard (refactorUI §8): fail BEFORE the round trip ──
  function actualizarOnline(): void {
    const offline = !navigator.onLine;
    setHidden(offlineNote, !offline);
    if (submitBtn && !enviando) submitBtn.disabled = offline;
  }
  window.addEventListener('online', actualizarOnline);
  window.addEventListener('offline', actualizarOnline);

  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    // Implicit Enter submission bypasses a disabled button in some
    // browsers — guard here too (never fire a doomed request).
    if (!navigator.onLine) {
      actualizarOnline();
      return;
    }
    // Fresh attempt: drop stale inline errors before validating again.
    limpiarErroresForm(form);
    const nombre = nombreInput?.value.trim() ?? '';
    if (!isNonEmpty(nombre)) {
      // P1 (plan-form-ux.md): the message lives under the field.
      if (nombreInput) mostrarErrorCampo(nombreInput, 'Ingresá el nombre de la categoría.');
      nombreInput?.focus();
      return;
    }
    void guardar(nombre);
  });

  cancelBtn?.addEventListener('click', () => {
    modoNuevo();
    nombreInput?.focus(); // back where a new category would start
  });

  rowsEl?.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const row = target.closest<HTMLElement>('[data-categoria-row]');
    if (!row) return;
    const id = row.getAttribute('data-categoria-id');
    if (!id) return;

    if (target.closest('[data-categoria-edit]')) {
      editarCategoria(id);
      return;
    }
    if (target.closest('[data-categoria-delete]')) {
      // The modal itself opens via modal-controller (data-modal-open on the
      // button); remember which category the confirmation applies to.
      pendingDeleteId = id;
    }
  });

  confirmDeleteBtn?.addEventListener('click', () => {
    if (pendingDeleteId) void eliminar(pendingDeleteId);
    pendingDeleteId = null;
  });

  // Inline errors vanish as soon as the user retypes (plan-form-ux Fase 1).
  if (nombreInput) observarCampo(nombreInput);

  actualizarOnline(); // initial offline state
  void cargar(); // first paint from the public read
}
