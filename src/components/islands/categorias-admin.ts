// Categories admin behavior (plan-productos-v2.md Fase 2): list via the
// public GET ?action=categorias (§4.11); in-page create/rename (gotcha G1 —
// /categorias is ONE static page, no query params); delete behind the
// confirm modal (stilesbase §5.5) and SERVER-guarded by categoria_en_uso.
// No cola_sync: category edits are rare admin actions — offline they fail
// loudly with Spanish copy, never queued (the sale path is the only queued
// flow, extras.md §1). Hooks are data-* only (invariant 5); user-entered
// text always goes through textContent; no raw error codes, no auto-retries.

import {
  actualizarCategoria,
  borrarCategoria,
  crearCategoria,
  getCategorias,
} from '../../api/actions/categorias';
import type { CategoriaApi } from '../../api/types';
import { isNonEmpty } from '../../utils/validators';

const root = document.querySelector<HTMLElement>('[data-categorias-root]');

if (root) {
  const rowsEl = root.querySelector<HTMLElement>('[data-categoria-rows]');
  const template = root.querySelector<HTMLTemplateElement>('[data-categoria-row-template]');
  const form = root.querySelector<HTMLFormElement>('[data-categoria-form]');
  const formTitle = root.querySelector<HTMLElement>('[data-categoria-form-title]');
  const nombreInput = root.querySelector<HTMLInputElement>('[data-categoria-nombre]');
  const submitBtn = root.querySelector<HTMLButtonElement>('[data-categoria-submit]');
  const cancelBtn = root.querySelector<HTMLButtonElement>('[data-categoria-cancel]');
  const confirmDeleteBtn = root.querySelector<HTMLButtonElement>(
    '[data-categoria-confirm-delete]',
  );
  const okAlert = root.querySelector<HTMLElement>('[data-alert="categorias-ok"]');
  const errorAlert = root.querySelector<HTMLElement>('[data-alert="categorias-error"]');
  const okText = root.querySelector<HTMLElement>('[data-categoria-ok-text]');
  const errorText = root.querySelector<HTMLElement>('[data-categoria-error-text]');
  const emptyState = root.querySelector<HTMLElement>('[data-empty-state="empty-categorias"]');

  let categorias: CategoriaApi[] = [];
  let editingId: string | null = null;
  let pendingDeleteId: string | null = null;

  function mostrarOk(mensaje: string): void {
    if (okText) okText.textContent = mensaje;
    if (okAlert) okAlert.hidden = false;
    if (errorAlert) errorAlert.hidden = true;
  }

  function mostrarError(mensaje: string): void {
    if (errorText) errorText.textContent = mensaje;
    if (errorAlert) errorAlert.hidden = false;
    if (okAlert) okAlert.hidden = true;
  }

  function ocultarAlertas(): void {
    if (okAlert) okAlert.hidden = true;
    if (errorAlert) errorAlert.hidden = true;
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
    mostrarError(
      res.status === 'network_failure'
        ? 'No hay conexión y no se pudieron cargar las categorías.'
        : mensajeDeError(res.error),
    );
  }

  function render(): void {
    if (!rowsEl || !template) return;
    rowsEl.querySelectorAll('[data-categoria-row]').forEach((row) => row.remove());

    for (const categoria of categorias) {
      const first = template.content.firstElementChild;
      if (!first) continue;
      const row = first.cloneNode(true) as HTMLElement;
      row.setAttribute('data-categoria-id', categoria.id);

      const nombre = row.querySelector<HTMLElement>('[data-categoria-nombre]');
      if (nombre) nombre.textContent = categoria.nombre;

      rowsEl.append(row);
    }

    if (emptyState) emptyState.hidden = categorias.length > 0;
  }

  function editarCategoria(id: string): void {
    const categoria = categorias.find((c) => c.id === id);
    if (!categoria) return;
    editingId = id;
    if (formTitle) formTitle.textContent = 'Renombrar categoría';
    if (submitBtn) submitBtn.textContent = 'Guardar cambios';
    if (cancelBtn) cancelBtn.hidden = false;
    if (nombreInput) nombreInput.value = categoria.nombre;
    ocultarAlertas();
    nombreInput?.focus();
  }

  function modoNuevo(): void {
    editingId = null;
    form?.reset();
    if (formTitle) formTitle.textContent = 'Nueva categoría';
    if (submitBtn) submitBtn.textContent = 'Guardar categoría';
    if (cancelBtn) cancelBtn.hidden = true;
    ocultarAlertas();
  }

  async function guardar(nombre: string): Promise<void> {
    // Local const so TS narrows string | null in the false branch (editingId
    // itself is a mutable captured binding and won't narrow through the alias).
    const idEditando = editingId;
    const esAlta = idEditando === null;
    const resultado = esAlta
      ? await crearCategoria(nombre)
      : await actualizarCategoria({ id: idEditando, nombre });

    if (resultado.status === 'success') {
      mostrarOk(
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
      mostrarError('Sin conexión — no se pudo guardar la categoría.');
      return;
    }
    mostrarError(mensajeDeError(resultado.error));
  }

  async function eliminar(id: string): Promise<void> {
    const resultado = await borrarCategoria({ id });
    if (resultado.status === 'success') {
      mostrarOk('Categoría eliminada.');
      await cargar();
      return;
    }
    if (resultado.status === 'network_failure') {
      mostrarError('Sin conexión — no se pudo eliminar la categoría.');
      return;
    }
    mostrarError(mensajeDeError(resultado.error));
  }

  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    const nombre = nombreInput?.value.trim() ?? '';
    if (!isNonEmpty(nombre)) {
      mostrarError('Ingresá el nombre de la categoría.');
      nombreInput?.focus();
      return;
    }
    void guardar(nombre);
  });

  cancelBtn?.addEventListener('click', () => {
    modoNuevo();
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

  void cargar(); // first paint from the public read
}
