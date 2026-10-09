/**
 * Doble de `workbox-window` para los tests de hallazgos (no es código de la app).
 *
 * Reproduce SOLO lo que importa del Workbox real (node_modules/workbox-window/src/Workbox.ts):
 *  - `_isUpdate = Boolean(navigator.serviceWorker.controller)` al construirse;
 *  - en `controllerchange` despacha SIEMPRE `controlling` con `isUpdate: this._isUpdate`
 *    (aunque el cambio lo haya provocado OTRA pestaña: `isExternal` solo se informa);
 *  - un SW nuevo instalado desde otra pestaña llega como `installed` con `isExternal: true`
 *    y luego `waiting`.
 */
export const instancias = [];

export class Workbox {
  constructor(url, opts) {
    this.url = url;
    this.opts = opts;
    this.oyentes = new Map();
    this.skipWaitingEnviado = false;
    this._isUpdate = Boolean(globalThis.navigator?.serviceWorker?.controller);
    instancias.push(this);
  }

  addEventListener(tipo, fn) {
    if (!this.oyentes.has(tipo)) this.oyentes.set(tipo, []);
    this.oyentes.get(tipo).push(fn);
  }

  removeEventListener(tipo, fn) {
    this.oyentes.set(tipo, (this.oyentes.get(tipo) ?? []).filter((f) => f !== fn));
  }

  emitir(tipo, props = {}) {
    for (const fn of this.oyentes.get(tipo) ?? []) fn({ type: tipo, ...props });
  }

  /** Lo que hace el Workbox real ante `controllerchange`. */
  emitirControllerChange({ isExternal }) {
    this.emitir('controlling', { isExternal, isUpdate: this._isUpdate });
  }

  register() { return Promise.resolve(undefined); }

  messageSkipWaiting() { this.skipWaitingEnviado = true; }
}
