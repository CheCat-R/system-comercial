/* eslint-env node */
/**
 * ENTORNO PARA LOS TESTS DE HALLAZGOS (auditoría) — no es código de la app.
 *
 * Arma, dentro de node:test, lo mínimo del navegador que usan los módulos del
 * core: `window` (EventTarget + location.reload contado), sessionStorage /
 * localStorage, un IndexedDB en memoria que sigue la semántica de la
 * especificación (el pedido termina antes que la transacción; la transacción
 * puede abortar DESPUÉS del `success` del pedido), y `fetch` programable.
 *
 * Además registra un resolvedor para los alias de Vite (`@core/…`), el módulo
 * virtual `virtual:pwa-register` (apunta al register.js REAL de
 * vite-plugin-pwa) y `workbox-window` (un doble controlable, ver
 * fakeWorkbox.js).
 *
 * Importarlo ANTES de importar (dinámicamente) cualquier módulo de la app.
 */
import { register } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(aqui, '..', '..');
const panel = path.resolve(src, '..');

const PREFIJOS = {
  '@core/': `${pathToFileURL(path.join(src, 'core')).href}/`,
  '@shared/': `${pathToFileURL(path.join(src, 'shared')).href}/`,
  '@modules/': `${pathToFileURL(path.join(src, 'modules')).href}/`,
};
const EXACTOS = {
  'virtual:pwa-register': pathToFileURL(path.join(panel, 'node_modules', 'vite-plugin-pwa', 'dist', 'client', 'build', 'register.js')).href,
  'workbox-window': pathToFileURL(path.join(aqui, 'fakeWorkbox.js')).href,
};

const hooks = `
const PREFIJOS = ${JSON.stringify(PREFIJOS)};
const EXACTOS = ${JSON.stringify(EXACTOS)};
export async function resolve(spec, ctx, next) {
  if (Object.prototype.hasOwnProperty.call(EXACTOS, spec)) return { url: EXACTOS[spec], shortCircuit: true };
  for (const [pre, dest] of Object.entries(PREFIJOS)) {
    if (spec.startsWith(pre)) return { url: dest + spec.slice(pre.length), shortCircuit: true };
  }
  return next(spec, ctx);
}`;
register(`data:text/javascript,${encodeURIComponent(hooks)}`);

/* ------------------------------ Storage ------------------------------ */
class MemStorage {
  constructor() { this.m = new Map(); }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
  clear() { this.m.clear(); }
}
globalThis.sessionStorage = new MemStorage();
globalThis.localStorage = new MemStorage();

/* ------------------------------ window ------------------------------- */
const win = new EventTarget();
win.recargas = 0;
win.location = { reload() { win.recargas += 1; } };
globalThis.window = win;
export const ventana = win;

/* ------------------------------ fetch -------------------------------- */
export const red = {
  llamadas: [],
  /** (url, init, body) => { status, body } | Promise de eso. */
  responder: () => ({ status: 200, body: {} }),
};
globalThis.fetch = async (url, init = {}) => {
  const body = init.body ? JSON.parse(init.body) : undefined;
  red.llamadas.push({ url: String(url), method: init.method ?? 'GET', body, headers: init.headers });
  const r = await red.responder(String(url), init, body);
  return new Response(JSON.stringify(r.body ?? {}), {
    status: r.status ?? 200,
    headers: { 'content-type': 'application/json' },
  });
};

/* ------------------------------ IndexedDB ---------------------------- */
const asincrono = (fn) => setImmediate(fn);

export const idb = {
  bases: new Map(),
  /** Si es true, la PRÓXIMA transacción readwrite aborta al commitear (p. ej. QuotaExceededError). */
  abortarProximoCommit: false,
};

function nuevoPedido() {
  return { onsuccess: null, onerror: null, result: undefined, error: null };
}

function crearDB(nombre) {
  const stores = new Map();
  const db = {
    name: nombre,
    objectStoreNames: { contains: (n) => stores.has(n) },
    createObjectStore(n, { keyPath }) { stores.set(n, { keyPath, datos: new Map() }); },
    transaction(n, modo = 'readonly') {
      const st = stores.get(n);
      if (!st) throw new Error(`NotFoundError: ${n}`);
      const abortar = modo === 'readwrite' && idb.abortarProximoCommit;
      if (abortar) idb.abortarProximoCommit = false;
      const tx = { oncomplete: null, onabort: null, onerror: null, error: null };
      const deshacer = [];
      const pedido = (op) => {
        const req = nuevoPedido();
        asincrono(() => {
          try { req.result = op(); } catch (e) { req.error = e; req.onerror?.({ target: req }); return; }
          req.onsuccess?.({ target: req });
          // Después del success del pedido, la transacción commitea... o aborta.
          asincrono(() => {
            if (abortar) {
              deshacer.reverse().forEach((f) => f());
              tx.error = new Error('QuotaExceededError');
              tx.onabort?.({ target: tx });
            } else {
              tx.oncomplete?.({ target: tx });
            }
          });
        });
        return req;
      };
      tx.objectStore = () => ({
        put(valor) {
          return pedido(() => {
            const k = valor[st.keyPath];
            const previo = st.datos.get(k);
            deshacer.push(() => (previo === undefined ? st.datos.delete(k) : st.datos.set(k, previo)));
            st.datos.set(k, structuredClone(valor));
            return k;
          });
        },
        delete(k) {
          return pedido(() => {
            const previo = st.datos.get(k);
            deshacer.push(() => previo !== undefined && st.datos.set(k, previo));
            st.datos.delete(k);
            return undefined;
          });
        },
        get(k) { return pedido(() => structuredClone(st.datos.get(k))); },
        getAll() { return pedido(() => [...st.datos.values()].map((v) => structuredClone(v))); },
      });
      return tx;
    },
  };
  return { db, stores };
}

globalThis.indexedDB = {
  open(nombre) {
    const req = { ...nuevoPedido(), onupgradeneeded: null };
    asincrono(() => {
      let entrada = idb.bases.get(nombre);
      const nueva = !entrada;
      if (nueva) { entrada = crearDB(nombre); idb.bases.set(nombre, entrada); }
      req.result = entrada.db;
      if (nueva) req.onupgradeneeded?.({ target: req });
      req.onsuccess?.({ target: req });
    });
    return req;
  },
};

/* ------------------------- navigator (SW) ---------------------------- */
Object.defineProperty(globalThis, 'navigator', {
  value: { serviceWorker: {}, userAgent: 'node-test' },
  configurable: true,
  writable: true,
});

/** Espera a que se vacíen las colas de microtareas/inmediatos varias veces. */
export async function drenar(vueltas = 20) {
  for (let i = 0; i < vueltas; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setImmediate(r));
  }
}

/** Una sesión como la que guarda `auth.service.login`. */
export function sesionDe({ usuarioId = 1, nombre = 'Carla', sucursalId = 1, token = 'tok-1' } = {}) {
  return {
    token,
    usuario: { id: usuarioId, nombre, rolClave: 'cajero', permisos: ['ventas.pos'] },
    sucursal: { id: sucursalId, nombre: `Sucursal ${sucursalId}` },
    terminal: null,
    plan: null,
  };
}
