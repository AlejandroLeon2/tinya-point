// Admin catalog behavior (doc/plan-mejoras-2.md Fase 1): list via
// productosAdmin() with fallback to the public read when that action isn't
// deployed yet; in-page create/edit (gotcha G1 — no navigation/query params,
// /productos is ONE static page); logical delete via activo: false (D2)
// behind the confirm modal (stilesbase §5.5); restore direct; and an
// IMMEDIATE catalogo_cache refresh after every successful mutation (gotcha
// G5 — never wait the 15-minute TTL, or the POS sells stale products).
// Hooks are data-* only (invariant 5); user-entered text always goes through
// textContent — product names never become HTML. Copy is simple Spanish,
// never raw error codes (stilesbase §5.7); no auto-retries (§5.3).

import {
  actualizarProducto,
  crearProducto,
  obtenerProductos,
  productosAdmin,
} from '../../api/actions/productos';
import type { ProductoAdmin } from '../../api/types';
import { formatCurrency } from '../../utils/format';
import {
  isNonEmpty,
  isValidImageUrl,
  isValidPrecio,
  isValidStockValue,
} from '../../utils/validators';
import { setCatalogoCache } from '../../utils/storage';

const root = document.querySelector<HTMLElement>('[data-productos-root]');

if (root) {
  const rowsEl = root.querySelector<HTMLElement>('[data-product-rows]');
  const template = root.querySelector<HTMLTemplateElement>('[data-product-row-template]');
  const form = root.querySelector<HTMLFormElement>('[data-product-form]');
  const formTitle = root.querySelector<HTMLElement>('[data-product-form-title]');
  const nombreInput = root.querySelector<HTMLInputElement>('[data-product-nombre]');
  const categoriaInput = root.querySelector<HTMLInputElement>('[data-product-categoria]');
  const precioInput = root.querySelector<HTMLInputElement>('[data-product-precio]');
  const stockInput = root.querySelector<HTMLInputElement>('[data-product-stock]');
  const imagenInput = root.querySelector<HTMLInputElement>('[data-product-imagen]');
  const submitBtn = root.querySelector<HTMLButtonElement>('[data-product-submit]');
  const cancelBtn = root.querySelector<HTMLButtonElement>('[data-product-cancel]');
  const confirmDeactivateBtn = root.querySelector<HTMLButtonElement>(
    '[data-product-confirm-deactivate]',
  );
  const okAlert = root.querySelector<HTMLElement>('[data-alert="productos-ok"]');
  const errorAlert = root.querySelector<HTMLElement>('[data-alert="productos-error"]');
  const okText = root.querySelector<HTMLElement>('[data-alert-ok-text]');
  const errorText = root.querySelector<HTMLElement>('[data-alert-error-text]');
  const emptyState = root.querySelector<HTMLElement>('[data-empty-state="empty-productos"]');

  // Badge tones (stilesbase §2): success = active, warning = inactive
  // attention — always paired with the word itself, never color alone (§5.2).
  const BADGE_ACTIVO = 'bg-success text-success-content';
  const BADGE_INACTIVO = 'bg-warning text-warning-content';

  let productos: ProductoAdmin[] = [];
  let editingId: string | null = null;
  let pendingDeactivateId: string | null = null;

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
  // reaches the cashier's eyes.
  function mensajeDeError(error: string): string {
    switch (error) {
      case 'payload_invalido':
        return 'Revisá los campos del producto.';
      case 'accion_no_soportada':
        return 'El servidor todavía no tiene esta función. Actualizá el despliegue de Apps Script.';
      default:
        return 'No se pudo guardar. Intentá de nuevo.';
    }
  }

  async function refrescarCachePos(): Promise<void> {
    // G5: push a fresh public catalog into catalogo_cache right after any
    // successful mutation — the POS sees it without waiting the TTL.
    const res = await obtenerProductos();
    if (res.status === 'success') {
      setCatalogoCache({ productos: res.body.productos, timestamp: Date.now() });
    }
  }

  async function cargar(): Promise<void> {
    const res = await productosAdmin();
    if (res.status === 'success') {
      productos = res.body.productos;
      render();
      return;
    }

    // Fallback (plan Fase 1): the admin action may not exist on the live
    // endpoint yet (owner hasn't re-deployed) — degrade to the public actives
    // list instead of breaking the screen.
    const publico = await obtenerProductos();
    if (publico.status === 'success') {
      productos = publico.body.productos.map((p) => ({ ...p, activo: true }));
      render();
      return;
    }

    render();
    mostrarError(
      publico.status === 'network_failure'
        ? 'No hay conexión y no se pudo cargar el catálogo.'
        : 'No se pudo cargar el catálogo de productos.',
    );
  }

  function render(): void {
    if (!rowsEl || !template) return;
    rowsEl.querySelectorAll('[data-product-row]').forEach((row) => row.remove());

    for (const producto of productos) {
      const first = template.content.firstElementChild;
      if (!first) continue;
      const row = first.cloneNode(true) as HTMLElement;
      row.setAttribute('data-product-id', producto.id);

      const nombre = row.querySelector<HTMLElement>('[data-product-nombre]');
      const precio = row.querySelector<HTMLElement>('[data-product-precio]');
      const stock = row.querySelector<HTMLElement>('[data-product-stock]');
      const badge = row.querySelector<HTMLElement>('[data-product-badge]');
      const desactivar = row.querySelector<HTMLElement>('[data-product-deactivate]');
      const restaurar = row.querySelector<HTMLElement>('[data-product-restore]');

      if (nombre) nombre.textContent = producto.nombre;
      if (precio) precio.textContent = formatCurrency(producto.precio);
      if (stock) stock.textContent = `Stock: ${producto.stock}`;
      if (badge) {
        badge.textContent = producto.activo ? 'Activo' : 'Inactivo';
        badge.className = `inline-block rounded-full px-3 py-1 text-base font-semibold ${
          producto.activo ? BADGE_ACTIVO : BADGE_INACTIVO
        }`;
      }
      // Only the toggle that matches the current state shows (D2: low → the
      // row offers restore; high → confirm-then-deactivate).
      if (desactivar) desactivar.hidden = !producto.activo;
      if (restaurar) restaurar.hidden = producto.activo;

      rowsEl.append(row);
    }

    if (emptyState) emptyState.hidden = productos.length > 0;
  }

  function editarProducto(id: string): void {
    const producto = productos.find((p) => p.id === id);
    if (!producto) return;
    editingId = id;
    if (formTitle) formTitle.textContent = 'Editar producto';
    if (submitBtn) submitBtn.textContent = 'Guardar cambios';
    if (cancelBtn) cancelBtn.hidden = false;
    if (nombreInput) nombreInput.value = producto.nombre;
    if (categoriaInput) categoriaInput.value = producto.categoria;
    if (precioInput) precioInput.value = String(producto.precio);
    if (stockInput) stockInput.value = String(producto.stock);
    if (imagenInput) imagenInput.value = producto.imagen_url;
    ocultarAlertas();
    nombreInput?.focus();
  }

  function modoNuevo(): void {
    editingId = null;
    form?.reset();
    if (formTitle) formTitle.textContent = 'Nuevo producto';
    if (submitBtn) submitBtn.textContent = 'Guardar producto';
    if (cancelBtn) cancelBtn.hidden = true;
    ocultarAlertas();
  }

  type DatosForm = {
    nombre: string;
    categoria: string;
    precio: number;
    stock: number;
    imagen_url: string;
  };

  function leerFormulario():
    | { ok: true; datos: DatosForm }
    | { ok: false; mensaje: string; campo: HTMLInputElement | null } {
    const nombre = nombreInput?.value.trim() ?? '';
    const categoria = categoriaInput?.value.trim() ?? '';
    const precioRaw = precioInput?.value.trim() ?? '';
    const stockRaw = stockInput?.value.trim() ?? '';
    const imagen = imagenInput?.value.trim() ?? '';

    if (!isNonEmpty(nombre)) {
      return { ok: false, mensaje: 'Ingresá el nombre del producto.', campo: nombreInput ?? null };
    }
    if (!isNonEmpty(categoria)) {
      return {
        ok: false,
        mensaje: 'Ingresá la categoría del producto.',
        campo: categoriaInput ?? null,
      };
    }
    // Raw emptiness first: Number('') is 0, which would pass as a valid price.
    if (precioRaw === '' || !isValidPrecio(Number(precioRaw))) {
      return {
        ok: false,
        mensaje: 'Ingresá un precio igual o mayor a 0.',
        campo: precioInput ?? null,
      };
    }
    if (stockRaw === '' || !isValidStockValue(Number(stockRaw))) {
      return {
        ok: false,
        mensaje: 'Ingresá un stock entero igual o mayor a 0.',
        campo: stockInput ?? null,
      };
    }
    if (!isValidImageUrl(imagen)) {
      return {
        ok: false,
        mensaje: 'La imagen debe ser una URL que empiece con http:// o https://.',
        campo: imagenInput ?? null,
      };
    }

    return {
      ok: true,
      datos: {
        nombre,
        categoria,
        precio: Number(precioRaw),
        stock: Number(stockRaw),
        imagen_url: imagen,
      },
    };
  }

  async function guardar(datos: DatosForm): Promise<void> {
    // Local const so TS narrows string | null in the false branch (editingId
    // itself is a mutable captured binding and won't narrow through the alias).
    const idEditando = editingId;
    const esAlta = idEditando === null;
    const resultado = esAlta
      ? await crearProducto(datos)
      : await actualizarProducto({ id: idEditando, ...datos });

    if (resultado.status === 'success') {
      mostrarOk(esAlta ? 'Producto creado.' : 'Producto actualizado.');
      modoNuevo();
      await cargar();
      await refrescarCachePos();
      nombreInput?.focus(); // rapid entry for the next product
      return;
    }
    if (resultado.status === 'network_failure') {
      mostrarError('Sin conexión — no se pudo guardar el producto.');
      return;
    }
    mostrarError(mensajeDeError(resultado.error));
  }

  async function cambiarActivo(id: string, activo: boolean): Promise<void> {
    const resultado = await actualizarProducto({ id, activo });
    if (resultado.status === 'success') {
      mostrarOk(activo ? 'Producto restaurado.' : 'Producto desactivado.');
      await cargar();
      await refrescarCachePos();
      return;
    }
    if (resultado.status === 'network_failure') {
      mostrarError('Sin conexión — no se pudo actualizar el producto.');
      return;
    }
    mostrarError(mensajeDeError(resultado.error));
  }

  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    const lectura = leerFormulario();
    if (!lectura.ok) {
      mostrarError(lectura.mensaje);
      lectura.campo?.focus();
      return;
    }
    void guardar(lectura.datos);
  });

  cancelBtn?.addEventListener('click', () => {
    modoNuevo();
  });

  rowsEl?.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const row = target.closest<HTMLElement>('[data-product-row]');
    if (!row) return;
    const id = row.getAttribute('data-product-id');
    if (!id) return;

    if (target.closest('[data-product-edit]')) {
      editarProducto(id);
      return;
    }
    if (target.closest('[data-product-deactivate]')) {
      // The modal itself opens via modal-controller (data-modal-open on the
      // button); remember which product the confirmation applies to.
      pendingDeactivateId = id;
      return;
    }
    if (target.closest('[data-product-restore]')) {
      void cambiarActivo(id, true);
    }
  });

  confirmDeactivateBtn?.addEventListener('click', () => {
    if (pendingDeactivateId) void cambiarActivo(pendingDeactivateId, false);
    pendingDeactivateId = null;
  });

  void cargar(); // first paint from the admin read (fallback keeps it usable)
}
