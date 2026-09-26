// Brands admin behavior — mirror of categorias-admin.ts: list via the public
// GET ?action=marcas; in-page create/rename (gotcha G1 — /marcas is ONE static
// page, no query params); delete behind the confirm modal (stilesbase §5.5)
// and SERVER-guarded by marca_en_uso.
// No cola_sync: brand edits are rare admin actions — offline they fail loudly
// with Spanish copy, never queued (extras.md §1). Hooks are data-* only
// (invariant 5); user-entered text always goes through textContent; no raw
// error codes, no auto-retries.
//
// Per-row product count comes from catalogo_cache ONLY (no extra GET;
// omitted when there is no cache) → the local pre-guard on Eliminar
// (disabled ⇔ count > 0, with "En uso por N productos") + the offline note
// that disables the submit BEFORE the round trip.

import {
    actualizarMarca,
    borrarMarca,
    crearMarca,
    getMarcas,
} from '../../../api/actions/marcas';
import type { MarcaApi } from '../../../api/types';
import { mensajeDeErrorApi } from '../../../utils/api-result';
import { cloneTemplate, delegateAction, qs, qsa, setHidden, setText } from '../../../utils/dom';
import { crearFeedback } from '../../../utils/feedback';
import { createFormManager } from '../../../utils/form-manager';
import { getCatalogoCache } from '../../../utils/storage';
import { isNonEmpty } from '../../../utils/validators';

const root = qs<HTMLElement>(document, '[data-marcas-root]');

if (root) {
  const rowsEl = qs<HTMLElement>(root, '[data-marca-rows]');
  const template = qs<HTMLTemplateElement>(root, '[data-marca-row-template]');
  const form = qs<HTMLFormElement>(root, '[data-marca-form]');
  const formTitle = qs<HTMLElement>(root, '[data-marca-form-title]');
  const nombreInput = qs<HTMLInputElement>(root, '[data-marca-nombre]');
  const submitBtn = qs<HTMLButtonElement>(root, '[data-marca-submit]');
  const cancelBtn = qs<HTMLButtonElement>(root, '[data-marca-cancel]');
  const confirmDeleteBtn = qs<HTMLButtonElement>(root, '[data-marca-confirm-delete]');
  const errorAlert = qs<HTMLElement>(root, '[data-alert="marcas-error"]');
  const errorText = qs<HTMLElement>(root, '[data-marca-error-text]');
  const emptyState = qs<HTMLElement>(root, '[data-empty-state="empty-marcas"]');
  const offlineNote = qs<HTMLElement>(root, '[data-marca-offline]');

  let marcas: MarcaApi[] = [];
  let editingId: string | null = null;
  let pendingDeleteId: string | null = null;
  let enviando = false;
  let enviandoDelete = false;

  const feedback = crearFeedback(errorAlert, errorText);

  function ocultarAlertas(): void {
    feedback.ocultar();
  }

  // Spanish copy per transport outcome — the code itself never reaches the
  // cashier's eyes (stilesbase §5.7). Domain errors resolved locally;
  // fallback delegates to the shared helper (D3).
  function mensajeDeError(error: string): string {
    if (error === 'marca_duplicada') return 'Ya existe una marca con ese nombre.';
    if (error === 'marca_en_uso')
      return 'Hay productos usando esta marca — cambialos o desactivalos antes de borrarla.';
    return mensajeDeErrorApi(error, {
      payloadInvalido: 'Revisá el nombre de la marca.',
      fallback: 'No se pudo guardar. Intentá de nuevo.',
    });
  }

  async function cargar(): Promise<void> {
    const res = await getMarcas();
    if (res.status === 'success') {
      marcas = res.body.marcas;
      render();
      return;
    }
    render();
    feedback.error(
      res.status === 'network_failure'
        ? 'No hay conexión y no se pudieron cargar las marcas.'
        : mensajeDeError(res.error),
    );
  }

  function render(): void {
    if (!rowsEl || !template) return;
    qsa(rowsEl, '[data-marca-row]').forEach((row) => row.remove());

    // Local product tally per brand NAME — cache-only, zero network.
    // null = no cache → counts omitted, delete stays enabled (only the
    // server knows for sure).
    const cached = getCatalogoCache();
    const porNombre = new Map<string, number>();
    if (cached) {
      for (const p of cached.productos) {
        const marca = p.marca ?? '';
        if (!marca) continue;
        porNombre.set(marca, (porNombre.get(marca) ?? 0) + 1);
      }
    }

    for (const marca of marcas) {
      const row = cloneTemplate(template);
      if (!row) continue;
      row.setAttribute('data-marca-id', marca.id);

      const nombre = qs<HTMLElement>(row, '[data-marca-nombre]');
      setText(nombre, marca.nombre);

      const enUso = cached ? (porNombre.get(marca.nombre) ?? 0) : null;
      const countEl = qs<HTMLElement>(row, '[data-marca-count]');
      if (countEl && enUso !== null) {
        setText(countEl, `${enUso} producto${enUso === 1 ? '' : 's'}`);
        setHidden(countEl, false);
      }
      const enUsoEl = qs<HTMLElement>(row, '[data-marca-en-uso]');
      if (enUsoEl && enUso !== null && enUso > 0) {
        setText(enUsoEl, `En uso por ${enUso} producto${enUso === 1 ? '' : 's'}`);
        setHidden(enUsoEl, false);
      }
      const deleteBtn = qs<HTMLButtonElement>(row, '[data-marca-delete]');
      if (deleteBtn && enUso !== null) {
        // Local pre-guard; the backend keeps validating (marca_en_uso).
        deleteBtn.disabled = enUso > 0;
      }

      rowsEl.append(row);
    }

    setHidden(emptyState, marcas.length > 0);
  }

  function editarMarca(id: string): void {
    const marca = marcas.find((m) => m.id === id);
    if (!marca) return;
    editingId = id;
    setText(formTitle, 'Renombrar marca');
    setText(submitBtn, 'Guardar cambios');
    setHidden(cancelBtn, false);
    if (nombreInput) nombreInput.value = marca.nombre;
    ocultarAlertas();
    nombreInput?.focus();
  }

  function modoNuevo(): void {
    editingId = null;
    form?.reset();
    setText(formTitle, 'Nueva marca');
    setText(submitBtn, 'Guardar marca');
    setHidden(cancelBtn, true);
    ocultarAlertas();
  }

  async function guardar(nombre: string): Promise<void> {
    // P0 re-entry guard + pending state (plan-form-ux.md Fase 1). Local const
    // so TS narrows string | null in the false branch.
    if (enviando) return;
    enviando = true;
    const idEditando = editingId;
    const esAlta = idEditando === null;
    const textoOriginal = esAlta ? 'Guardar marca' : 'Guardar cambios';
    if (submitBtn) {
      submitBtn.disabled = true;
      setText(submitBtn, esAlta ? 'Creando…' : 'Guardando…');
    }

    try {
      const resultado = esAlta
        ? await crearMarca(nombre)
        : await actualizarMarca({ id: idEditando, nombre });

      if (resultado.status === 'success') {
        feedback.ok(
          esAlta
            ? 'Marca creada.'
            : 'Marca renombrada — los productos que la usan quedaron actualizados.',
        );
        modoNuevo();
        await cargar();
        nombreInput?.focus(); // rapid entry for the next brand
        return;
      }
      if (resultado.status === 'network_failure') {
        feedback.error('Sin conexión — no se pudo guardar la marca.');
        return;
      }
      feedback.error(mensajeDeError(resultado.error));
    } finally {
      enviando = false;
      if (submitBtn) {
        // Offline keeps the button disabled after ANY round trip ends.
        submitBtn.disabled = !navigator.onLine;
        setText(submitBtn, textoOriginal);
      }
      // modoNuevo() already reset the label on success; restore the right one
      // for the mode we are actually in after an error.
      if (editingId !== null && submitBtn) setText(submitBtn, 'Guardar cambios');
    }
  }

  async function eliminar(id: string): Promise<void> {
    // P0: a double click on the modal confirm would fire borrarMarca twice.
    if (enviandoDelete) return;
    enviandoDelete = true;
    try {
      const resultado = await borrarMarca({ id });
      if (resultado.status === 'success') {
        feedback.ok('Marca eliminada.');
        await cargar();
        return;
      }
      if (resultado.status === 'network_failure') {
        feedback.error('Sin conexión — no se pudo eliminar la marca.');
        return;
      }
      feedback.error(mensajeDeError(resultado.error));
    } finally {
      enviandoDelete = false;
    }
  }

  // ── Offline pre-guard: fail BEFORE the round trip ──────────────────────
  function actualizarOnline(): void {
    const offline = !navigator.onLine;
    setHidden(offlineNote, !offline);
    if (submitBtn && !enviando) submitBtn.disabled = offline;
  }
  window.addEventListener('online', actualizarOnline);
  window.addEventListener('offline', actualizarOnline);

  const formManager = createFormManager<{ nombre: string }>({
    form,
    submitBtn,
    schema: {
      nombre: {
        el: nombreInput,
        validate: isNonEmpty,
        error: 'Ingresá el nombre de la marca.',
      },
    },
    onSubmit: async (datos) => {
      // Implicit Enter submission bypasses a disabled button in some
      // browsers — guard here too (never fire a doomed request).
      if (!navigator.onLine) {
        actualizarOnline();
        return;
      }
      await guardar(datos.nombre);
    },
  });

  cancelBtn?.addEventListener('click', () => {
    modoNuevo();
    nombreInput?.focus(); // back where a new brand would start
  });

  delegateAction(rowsEl, 'click', 'data-marca-action', {
    edit: (trigger) => {
      const id = trigger.closest<HTMLElement>('[data-marca-row]')?.getAttribute('data-marca-id');
      if (id) editarMarca(id);
    },
    delete: (trigger) => {
      // The modal opens via modal-controller (data-modal-open on the button);
      // remember which brand the confirmation applies to.
      const id = trigger.closest<HTMLElement>('[data-marca-row]')?.getAttribute('data-marca-id');
      if (id) pendingDeleteId = id;
    },
  });

  confirmDeleteBtn?.addEventListener('click', () => {
    if (pendingDeleteId) void eliminar(pendingDeleteId);
    pendingDeleteId = null;
  });

  actualizarOnline(); // initial offline state
  void cargar(); // first paint from the public read
}
