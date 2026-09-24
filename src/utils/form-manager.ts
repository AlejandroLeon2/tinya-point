// Declarative Form Manager helper (plan-islands-patrones.md Fase 1).
// Unifies form submission, sequential validation, first-error focus,
// automatic inline error clearing on input, and button pending/in-flight states.

import { limpiarErroresForm, mostrarErrorCampo, observarCampo } from './form-errors';
import type { PendingButtonApi } from './pending-button';

export type InputElement = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

export interface FieldRule<T = string> {
  el: InputElement | null | undefined;
  validate?: (value: string) => boolean;
  error?: string;
  transform?: (value: string) => T;
  optional?: boolean;
}

export type FormSchema = Record<string, FieldRule<unknown>>;

/**
 * When `onSubmit` returns `'keep-pending'`, the form manager will NOT
 * call `pendingBtn.finalizar()` or re-enable the submit button.  Use this
 * when the callback takes ownership of the pending state (e.g. navigating
 * away after a successful login — the button should stay disabled).
 */
export type SubmitResult = void | 'keep-pending';

export interface FormManagerOptions<TData> {
  form: HTMLFormElement | null | undefined;
  schema: FormSchema;
  submitBtn?: HTMLButtonElement | null;
  pendingBtn?: PendingButtonApi | null;
  onSubmit: (data: TData) => Promise<SubmitResult> | SubmitResult;
}

export interface FormManagerApi<TData> {
  validar(): TData | null;
  limpiar(): void;
  reset(): void;
}

export function createFormManager<TData = Record<string, unknown>>(
  options: FormManagerOptions<TData>,
): FormManagerApi<TData> {
  const { form, schema, submitBtn, pendingBtn, onSubmit } = options;

  let enVuelo = false;

  // 1. Auto-wire observarCampo on every configured input
  for (const key of Object.keys(schema)) {
    const field = schema[key];
    if (field?.el) {
      observarCampo(field.el);
    }
  }

  function validar(): TData | null {
    if (form) limpiarErroresForm(form);

    const result: Record<string, unknown> = {};

    for (const key of Object.keys(schema)) {
      const field = schema[key];
      if (!field?.el) continue;

      const raw = field.el.value.trim();

      if (field.optional && raw === '') {
        result[key] = field.transform ? field.transform(raw) : raw;
        continue;
      }

      if (field.validate && !field.validate(raw)) {
        if (field.error) {
          mostrarErrorCampo(field.el, field.error);
        }
        field.el.focus();
        return null;
      }

      result[key] = field.transform ? field.transform(raw) : raw;
    }

    return result as TData;
  }

  function limpiar(): void {
    if (form) limpiarErroresForm(form);
  }

  function reset(): void {
    if (form) {
      limpiarErroresForm(form);
      form.reset();
    }
  }

  // 2. Form submit listener
  if (form) {
    form.addEventListener('submit', (event) => {
      event.preventDefault();

      if (enVuelo) return;

      const datos = validar();
      if (!datos) return;

      if (pendingBtn) {
        if (!pendingBtn.iniciar()) return;
      } else if (submitBtn) {
        submitBtn.disabled = true;
      }

      enVuelo = true;

      Promise.resolve(onSubmit(datos)).then((result) => {
        if (result === 'keep-pending') return;
        enVuelo = false;
        if (pendingBtn) {
          pendingBtn.finalizar();
        } else if (submitBtn) {
          submitBtn.disabled = false;
        }
      }, () => {
        enVuelo = false;
        if (pendingBtn) {
          pendingBtn.finalizar();
        } else if (submitBtn) {
          submitBtn.disabled = false;
        }
      });
    });
  }

  return {
    validar,
    limpiar,
    reset,
  };
}
